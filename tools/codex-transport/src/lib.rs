mod pool;
pub mod socket;
pub mod wire;
mod ws;

use base64::{Engine, engine::general_purpose::STANDARD};
use bytes::Bytes;
use futures_util::{StreamExt, TryStreamExt};
use http::{HeaderMap, HeaderValue, Request, Response, StatusCode};
use http_body_util::{BodyExt, Full, StreamBody, combinators::UnsyncBoxBody};
use hyper::{
    body::{Frame, Incoming},
    service::service_fn,
};
use hyper_util::rt::TokioIo;
use std::{
    convert::Infallible,
    io,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};
use tokio::{
    net::UnixListener,
    sync::{Semaphore, watch},
    task::JoinSet,
};
use wire::{CHUNK, COMPLETE, TransportError};

type Body = UnsyncBoxBody<Bytes, io::Error>;
struct UploadCompletion {
    sender: watch::Sender<bool>,
    delivered: bool,
}
impl Drop for UploadCompletion {
    fn drop(&mut self) {
        if self.delivered {
            let _ = self.sender.send(true);
        }
    }
}
pub struct Server {
    pools: pool::Pools,
    capacity: Arc<Semaphore>,
    ws_memory: Arc<Semaphore>,
    auth_endpoint: String,
}
impl Server {
    pub fn new(auth_endpoint: String) -> Result<Arc<Self>, &'static str> {
        let url = reqwest::Url::parse(&auth_endpoint).map_err(|_| "invalid auth endpoint")?;
        if url.scheme() != "https"
            || url.host_str().is_none()
            || !url.username().is_empty()
            || url.password().is_some()
            || url.fragment().is_some()
        {
            return Err("invalid auth endpoint");
        }
        let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();
        Ok(Arc::new(Self {
            pools: pool::Pools::default(),
            capacity: Arc::new(Semaphore::new(256)),
            ws_memory: Arc::new(Semaphore::new(536870912)),
            auth_endpoint,
        }))
    }
    pub async fn serve(
        self: Arc<Self>,
        listener: UnixListener,
        mut shutdown: watch::Receiver<bool>,
    ) -> io::Result<()> {
        let mut tasks = JoinSet::new();
        let mut reap = tokio::time::interval(Duration::from_secs(1));
        // Bound local sockets too: idle clients cannot consume unbounded parser buffers.
        let local_capacity = Arc::new(Semaphore::new(512));
        loop {
            tokio::select! {
                changed = shutdown.changed() => { if changed.is_err() || *shutdown.borrow() { break; } }
                _ = reap.tick() => self.pools.reap(),
                Some(_) = tasks.join_next(), if !tasks.is_empty() => {},
                accepted = listener.accept() => {
                    let (stream, _) = accepted?;
                    let Ok(permit) = local_capacity.clone().try_acquire_owned() else { drop(stream); continue; };
                    let standard = stream.into_std()?;
                    let disconnect = tokio::io::unix::AsyncFd::new(standard.try_clone()?)?;
                    let stream = tokio::net::UnixStream::from_std(standard)?;
                    let server = self.clone();
                    tasks.spawn(async move {
                        let _permit = permit;
                        let (deadline, mut expiry) = watch::channel(None);
                        let (sessions, mut session) = tokio::sync::mpsc::channel(1);
                        let service = service_fn(move |request| server.clone().handle(request, deadline.clone(), sessions.clone()));
                        let mut builder = hyper::server::conn::http1::Builder::new();
                        builder.keep_alive(true).max_buf_size(262144).max_headers(256);
                        let connection = builder.serve_connection(TokioIo::new(stream), service).with_upgrades();
                        let timeout = async move {
                            loop {
                                let until = *expiry.borrow_and_update();
                                if let Some(until) = until { tokio::time::sleep_until(until).await; break; }
                                if expiry.changed().await.is_err() {std::future::pending::<()>().await;}
                            }
                        };
                        let disconnected = async move {
                            loop {
                                let Ok(mut ready) = disconnect.readable().await else { return; };
                                if ready.ready().is_read_closed() { return; }
                                ready.clear_ready();
                            }
                        };
                        tokio::select! { _ = connection => {}, _ = timeout => { return; } }
                        if let Ok(session) = session.try_recv() {
                            tokio::select! { _ = session => {}, _ = disconnected => {} }
                        }
                    });
                }
            }
        }
        // Shutdown cancels exchanges; no synthetic successful completion is generated.
        tasks.abort_all();
        while tasks.join_next().await.is_some() {}
        Ok(())
    }
    async fn handle(
        self: Arc<Self>,
        request: Request<Incoming>,
        deadline: watch::Sender<Option<tokio::time::Instant>>,
        sessions: tokio::sync::mpsc::Sender<ws::Session>,
    ) -> Result<Response<Body>, Infallible> {
        let mut response = if request
            .headers()
            .get(http::header::HOST)
            .map(|h| h.as_bytes())
            != Some(b"codex-transport")
        {
            error_response(TransportError::local("invalid_metadata"))
        } else if request.uri().path() == "/v1/health" && request.method() == http::Method::GET {
            let fixture: serde_json::Value =
                serde_json::from_str(include_str!("../fixtures/contracts.json"))
                    .expect("frozen fixture");
            let production = cfg!(all(
                target_os = "linux",
                target_arch = "aarch64",
                target_env = "gnu"
            ));
            let health = serde_json::json!({"version":1,"profile":wire::PROFILE,"platform":"linux-arm64","target":"aarch64-unknown-linux-gnu","production":production,"purposes":["api","auth"],"routes":["http","ws"],"proxy_schemes":["http","https","socks5","socks5h"],"http_protocols":["auto","http1"],"tls_insecure":false,"limits":fixture["health_limits"]});
            Response::builder()
                .header("content-type", "application/json")
                .body(full(
                    serde_json::to_vec(&health).expect("health serialization"),
                ))
                .expect("fixed response")
        } else if request.uri().path() == "/v1/http" && request.method() == http::Method::POST {
            match self.exchange(request, deadline).await {
                Ok(response) => response,
                Err(error) => error_response(error),
            }
        } else if request.uri().path() == "/v1/ws" && request.method() == http::Method::GET {
            match self.websocket(request, sessions).await {
                Ok(response) => response,
                Err(error) => error_response(error),
            }
        } else {
            let status = if matches!(request.uri().path(), "/v1/http" | "/v1/health" | "/v1/ws") {
                StatusCode::METHOD_NOT_ALLOWED
            } else {
                StatusCode::NOT_FOUND
            };
            Response::builder()
                .status(status)
                .body(full(Vec::new()))
                .expect("fixed response")
        };
        if response.status() != StatusCode::SWITCHING_PROTOCOLS {
            response
                .headers_mut()
                .insert(http::header::CONNECTION, HeaderValue::from_static("close"));
        }
        Ok(response)
    }
    async fn exchange(
        &self,
        request: Request<Incoming>,
        expiry: watch::Sender<Option<tokio::time::Instant>>,
    ) -> Result<Response<Body>, TransportError> {
        let validated = wire::decode(request.headers(), &self.auth_endpoint)?;
        let deadline = (validated.meta.total_timeout_ms != 0).then(|| {
            tokio::time::Instant::now() + Duration::from_millis(validated.meta.total_timeout_ms)
        });
        let attempted = Arc::new(AtomicBool::new(false));
        let exchange = self.exchange_inner(request, validated, attempted.clone());
        let response = if let Some(deadline) = deadline {
            tokio::time::timeout_at(deadline, exchange)
                .await
                .map_err(|_| {
                    if attempted.load(Ordering::Acquire) {
                        TransportError::sent("timeout")
                    } else {
                        TransportError::local("timeout")
                    }
                })??
        } else {
            exchange.await?
        };
        // Arm the connection deadline after obtaining response headers. This also
        // interrupts a downstream socket stalled in flush, where Body is not polled.
        let _ = expiry.send(deadline);
        Ok(response)
    }
    async fn exchange_inner(
        &self,
        request: Request<Incoming>,
        validated: wire::Validated,
        attempted: Arc<AtomicBool>,
    ) -> Result<Response<Body>, TransportError> {
        let permit = self
            .capacity
            .clone()
            .try_acquire_owned()
            .map_err(|_| TransportError::local("capacity"))?;
        let pool = self.pools.acquire(&validated)?;
        let client = pool.client();
        let meta = &validated.meta;
        let expected = meta.content_length;
        let limit = meta.max_request_bytes;
        let header_timeout = meta.header_timeout_ms;
        let proxy = meta.proxy_url.is_some();
        let head = validated.method == http::Method::HEAD;
        let mut incoming = request.into_body();
        if expected == Some(0) {
            while let Some(frame) = incoming.frame().await {
                let frame = frame.map_err(|_| TransportError::local("upstream_io"))?;
                if frame.data_ref().is_some_and(|data| !data.is_empty()) {
                    return Err(TransportError::local("invalid_metadata"));
                }
            }
        }
        let (upload_done, mut upload_status) = watch::channel(expected == Some(0));
        let source_failed = Arc::new(AtomicBool::new(false));
        let failed = source_failed.clone();
        let upload = async_stream::try_stream! {
            let mut completion = UploadCompletion {sender: upload_done, delivered: false};
            let mut total = 0u64;
            while let Some(frame) = incoming.frame().await {
                let frame = match frame { Ok(frame) => frame, Err(_) => { failed.store(true, Ordering::Release); Err(io::Error::other("local upload truncated"))?; unreachable!() } };
                if let Ok(mut data) = frame.into_data() {
                    total = total.checked_add(data.len() as u64).ok_or_else(|| io::Error::other("upload limit"))?;
                    if total > limit || expected.is_some_and(|n| total > n) { failed.store(true, Ordering::Release); Err(io::Error::other("upload length"))?; }
                    if expected == Some(total) {
                        // Verify EOF before handing hyper the final declared byte. Otherwise
                        // its Content-Length encoder can stop polling and hide an overrun.
                        while let Some(extra) = incoming.frame().await {
                            let extra = extra.map_err(|_| {failed.store(true, Ordering::Release); io::Error::other("local upload truncated")})?;
                            if extra.data_ref().is_some_and(|data| !data.is_empty()) {failed.store(true, Ordering::Release); Err(io::Error::other("upload length"))?;}
                        }
                    }
                    while !data.is_empty() {
                        if expected == Some(total) && data.len() <= CHUNK { completion.delivered = true; }
                        yield data.split_to(data.len().min(CHUNK));
                    }
                }
            }
            if expected.is_some_and(|n| total != n) { failed.store(true, Ordering::Release); Err(io::Error::other("upload length"))?; }
            completion.delivered = true;
        };
        let body = if expected == Some(0) {
            reqwest::Body::from("")
        } else {
            reqwest::Body::wrap_stream(upload.map_err(|e: io::Error| e))
        };
        let mut outgoing = client
            .request(validated.method, validated.url)
            .headers(validated.headers)
            .body(body);
        if let Some(length) = expected {
            outgoing = outgoing.header(http::header::CONTENT_LENGTH, length);
        }
        attempted.store(true, Ordering::Release);
        let send = outgoing.send();
        tokio::pin!(send);
        let wait_headers = async {
            while !*upload_status.borrow() {
                if upload_status.changed().await.is_err() {
                    std::future::pending::<()>().await;
                }
            }
            if header_timeout == 0 {
                std::future::pending::<()>().await;
            }
            tokio::time::sleep(Duration::from_millis(header_timeout)).await;
        };
        tokio::pin!(wait_headers);
        let upstream = tokio::select! {
            response = &mut send => response.map_err(|error| classify_error(error, proxy))?,
            _ = &mut wait_headers => return Err(TransportError::sent("timeout")),
        };
        if source_failed.load(Ordering::Acquire) {
            return Err(TransportError::sent("upstream_io"));
        }
        let (metadata, expected_response) = wire::response_metadata(&upstream, head)?;
        let stream = async_stream::try_stream! {
            let _permit = permit;
            let _pool = pool;
            let mut total = 0u64;
            let mut upstream = upstream.bytes_stream();
            while let Some(data) = upstream.next().await {
                let mut data = data.map_err(|_| io::Error::other("upstream body truncated"))?;
                total = total.checked_add(data.len() as u64).ok_or_else(|| io::Error::other("upstream body overflow"))?;
                if expected_response.is_some_and(|n| total > n) { Err(io::Error::other("upstream body length"))?; }
                while !data.is_empty() { yield Frame::data(data.split_to(data.len().min(CHUNK))); }
            }
            if expected_response.is_some_and(|n| total != n) { Err(io::Error::other("upstream body truncated"))?; }
            let mut trailers = HeaderMap::new();
            trailers.insert(COMPLETE, HeaderValue::from_static("1"));
            yield Frame::trailers(trailers);
        };
        Ok(Response::builder()
            .header("x-codex-transport-response", metadata)
            .header("trailer", COMPLETE)
            .body(StreamBody::new(stream.map_err(|e: io::Error| e)).boxed_unsync())
            .expect("validated response"))
    }
}
fn full(bytes: Vec<u8>) -> Body {
    Full::new(Bytes::from(bytes))
        .map_err(|never| match never {})
        .boxed_unsync()
}
fn error_response(error: TransportError) -> Response<Body> {
    let encoded = STANDARD.encode(serde_json::to_vec(&error).expect("fixed error serialization"));
    Response::builder()
        .status(502)
        .header("x-codex-transport-error", encoded)
        .body(full(Vec::new()))
        .expect("fixed error response")
}
fn classify_error(error: reqwest::Error, proxy: bool) -> TransportError {
    use std::error::Error;
    let mut source = error.source();
    let mut tls = false;
    while let Some(cause) = source {
        tls |= cause.is::<rustls::Error>() || cause.is::<native_tls::Error>();
        source = if let Some(io) = cause.downcast_ref::<io::Error>() {
            io.get_ref().map(|inner| inner as &(dyn Error + 'static))
        } else {
            cause.source()
        };
    }
    // Connector errors prove no HTTP request was sent. Other errors are uncertain.
    if error.is_connect() {
        TransportError {
            version: 1,
            code: if error.is_timeout() {
                "timeout"
            } else if tls {
                "tls"
            } else if proxy {
                "proxy"
            } else {
                "connect"
            },
            phase: "upstream_connect",
            may_have_sent: false,
            upstream_status: None,
        }
    } else {
        TransportError::sent(if error.is_timeout() {
            "timeout"
        } else {
            "upstream_io"
        })
    }
}
