use crate::{
    Body, Server, full,
    wire::{self, TransportError, Validated},
};
use base64::{Engine, engine::general_purpose::STANDARD};
use futures_util::{SinkExt, StreamExt, future::BoxFuture};
use http::{HeaderMap, Request, Response};
use hyper::body::Incoming;
use hyper_util::rt::TokioIo;
use std::{
    io,
    pin::Pin,
    sync::Arc,
    task::{Context, Poll},
    time::Duration,
};
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncWrite, ReadBuf},
    net::TcpStream,
    sync::mpsc,
    time::Instant,
};
use tokio_tungstenite::WebSocketStream;
use tungstenite::{
    Message,
    client::IntoClientRequest,
    protocol::{Role, WebSocketConfig},
};

pub type Session = BoxFuture<'static, ()>;
trait Socket: AsyncRead + AsyncWrite + Unpin + Send {}
impl<T: AsyncRead + AsyncWrite + Unpin + Send> Socket for T {}
type Stream = Box<dyn Socket>;

// Stop the handshake reader exactly after CRLFCRLF. No rejection body or
// coalesced first WS frame is consumed by the handshake library and discarded.
struct HeaderBoundary<S> {
    stream: S,
    buffer: Vec<u8>,
    offset: usize,
    end: Option<usize>,
}
impl<S: AsyncRead + Unpin> AsyncRead for HeaderBoundary<S> {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        if buf.remaining() == 0 {
            return Poll::Ready(Ok(()));
        }
        while self.end.is_none() {
            if self.buffer.len() >= 16384 {
                return Poll::Ready(Err(io::Error::other("handshake header limit")));
            }
            let mut chunk = [0u8; 4096];
            let remaining = (16384 - self.buffer.len()).min(chunk.len());
            let mut input = ReadBuf::new(&mut chunk[..remaining]);
            match Pin::new(&mut self.stream).poll_read(cx, &mut input) {
                Poll::Pending => return Poll::Pending,
                Poll::Ready(Err(e)) => return Poll::Ready(Err(e)),
                Poll::Ready(Ok(())) => {
                    if input.filled().is_empty() {
                        return Poll::Ready(Err(io::Error::new(
                            io::ErrorKind::UnexpectedEof,
                            "handshake truncated",
                        )));
                    }
                    self.buffer.extend_from_slice(input.filled());
                    while let Some(end) = self
                        .buffer
                        .windows(4)
                        .position(|w| w == b"\r\n\r\n")
                        .map(|at| at + 4)
                    {
                        let status = self
                            .buffer
                            .split(|b| *b == b' ')
                            .nth(1)
                            .and_then(|v| std::str::from_utf8(v).ok())
                            .and_then(|s| s.parse::<u16>().ok());
                        if status.is_some_and(|n| (100..200).contains(&n) && n != 101) {
                            self.buffer.drain(..end);
                        } else {
                            self.end = Some(end);
                            break;
                        }
                    }
                }
            }
        }
        if self.offset < self.buffer.len() {
            let boundary = if self.offset < self.end.unwrap() {
                self.end.unwrap()
            } else {
                self.buffer.len()
            };
            let count = (boundary - self.offset).min(buf.remaining());
            buf.put_slice(&self.buffer[self.offset..self.offset + count]);
            self.offset += count;
            return Poll::Ready(Ok(()));
        }
        self.buffer.clear();
        self.offset = 0;
        self.end = Some(0);
        Pin::new(&mut self.stream).poll_read(cx, buf)
    }
}
impl<S: AsyncWrite + Unpin> AsyncWrite for HeaderBoundary<S> {
    fn poll_write(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        bytes: &[u8],
    ) -> Poll<io::Result<usize>> {
        Pin::new(&mut self.stream).poll_write(cx, bytes)
    }
    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        Pin::new(&mut self.stream).poll_flush(cx)
    }
    fn poll_shutdown(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        Pin::new(&mut self.stream).poll_shutdown(cx)
    }
}

// Retain the socket after a rejected handshake; tungstenite's Error::Http
// carries the response but not the stream. There are never concurrent readers.
#[derive(Clone)]
struct HandshakeSocket(Arc<std::sync::Mutex<HeaderBoundary<Stream>>>);
impl AsyncRead for HandshakeSocket {
    fn poll_read(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        Pin::new(&mut *self.0.lock().expect("socket lock")).poll_read(cx, buf)
    }
}
impl AsyncWrite for HandshakeSocket {
    fn poll_write(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        bytes: &[u8],
    ) -> Poll<io::Result<usize>> {
        Pin::new(&mut *self.0.lock().expect("socket lock")).poll_write(cx, bytes)
    }
    fn poll_flush(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        Pin::new(&mut *self.0.lock().expect("socket lock")).poll_flush(cx)
    }
    fn poll_shutdown(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        Pin::new(&mut *self.0.lock().expect("socket lock")).poll_shutdown(cx)
    }
}

fn configuration(limit: usize) -> WebSocketConfig {
    let mut config = WebSocketConfig::default()
        .read_buffer_size(65536)
        .write_buffer_size(0)
        .max_write_buffer_size(2 * limit + 65536)
        .max_message_size(Some(limit))
        .max_frame_size(Some(2 * limit + 65536));
    config.extensions.permessage_deflate = Some(Default::default());
    config
}

impl Server {
    pub(crate) async fn websocket(
        self: &Arc<Self>,
        mut request: Request<Incoming>,
        sessions: mpsc::Sender<Session>,
    ) -> Result<Response<Body>, TransportError> {
        let valid = wire::decode_ws(request.headers(), &self.auth_endpoint)?;
        if request
            .headers()
            .contains_key(http::header::TRANSFER_ENCODING)
            || request
                .headers()
                .get(http::header::CONTENT_LENGTH)
                .is_some_and(|v| v != "0")
        {
            return Err(TransportError::local("invalid_metadata"));
        }
        let key = request
            .headers()
            .get("sec-websocket-key")
            .ok_or_else(|| TransportError::local("invalid_metadata"))?;
        if STANDARD
            .decode(key.as_bytes())
            .ok()
            .is_none_or(|v| v.len() != 16)
        {
            return Err(TransportError::local("invalid_metadata"));
        }
        let limit = valid.meta.max_ws_message_bytes as usize;
        let config = configuration(limit);
        let (mut local_response, extensions) =
            tungstenite::handshake::server::create_response_with_extensions(&request, &config)
                .map_err(|_| TransportError::local("invalid_metadata"))?;
        let permit = self
            .capacity
            .clone()
            .try_acquire_owned()
            .map_err(|_| TransportError::local("capacity"))?;
        let reservation = self
            .ws_memory
            .clone()
            .try_acquire_many_owned((2 * limit) as u32)
            .map_err(|_| TransportError::local("capacity"))?;
        let mut outgoing = valid
            .meta
            .url
            .as_str()
            .into_client_request()
            .map_err(|_| TransportError::local("target"))?;
        // Multiple protocol values are an ordered offer list; the fixed client
        // verifier reads one field, so combine only this comma-list field.
        let offers = valid
            .headers
            .get_all("sec-websocket-protocol")
            .iter()
            .map(|v| v.to_str())
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| TransportError::local("invalid_metadata"))?
            .join(", ");
        for (name, value) in &valid.headers {
            if name != "sec-websocket-protocol" {
                outgoing.headers_mut().append(name.clone(), value.clone());
            }
        }
        if !offers.is_empty() {
            let local_offers = request
                .headers()
                .get_all("sec-websocket-protocol")
                .iter()
                .filter_map(|v| v.to_str().ok())
                .flat_map(|v| v.split(','))
                .map(str::trim)
                .collect::<Vec<_>>();
            if offers
                .split(',')
                .map(str::trim)
                .any(|offer| !local_offers.contains(&offer))
            {
                return Err(TransportError::local("invalid_metadata"));
            }
            outgoing.headers_mut().insert(
                "sec-websocket-protocol",
                offers
                    .parse()
                    .map_err(|_| TransportError::local("invalid_metadata"))?,
            );
        }
        let until = Instant::now() + Duration::from_millis(valid.meta.header_timeout_ms);
        let connect_until =
            until.min(Instant::now() + Duration::from_millis(valid.meta.connect_timeout_ms));
        let stream = tokio::time::timeout_at(connect_until, connect(&valid))
            .await
            .map_err(|_| connect_error("timeout"))??;
        let mut stream = HandshakeSocket(Arc::new(std::sync::Mutex::new(HeaderBoundary {
            stream,
            buffer: Vec::new(),
            offset: 0,
            end: None,
        })));
        let result = tokio::time::timeout_at(
            until,
            tokio_tungstenite::client_async_with_config(outgoing, stream.clone(), Some(config)),
        )
        .await
        .map_err(|_| TransportError::sent("timeout"))?;
        match result {
            Ok((upstream, response)) => {
                let encoded = metadata(101, response.headers(), None)?;
                if let Some(protocol) = response.headers().get("sec-websocket-protocol") {
                    local_response
                        .headers_mut()
                        .insert("sec-websocket-protocol", protocol.clone());
                }
                local_response.headers_mut().insert(
                    "x-codex-transport-response",
                    encoded.parse().expect("base64"),
                );
                let upgrade = hyper::upgrade::on(&mut request);
                let session: Session = Box::pin(async move {
                    let (_permit, _reservation) = (permit, reservation);
                    if let Ok(upgraded) = upgrade.await {
                        let local = WebSocketStream::from_raw_socket_with_extensions(
                            TokioIo::new(upgraded),
                            Role::Server,
                            Some(config),
                            extensions,
                        )
                        .await;
                        bridge(local, upstream).await;
                    }
                });
                sessions
                    .try_send(session)
                    .map_err(|_| TransportError::sent("internal"))?;
                Ok(local_response.map(|_| full(Vec::new())))
            }
            Err(tungstenite::Error::Http(response)) => {
                let mut capture = Rejection {
                    body: Vec::new(),
                    truncated: false,
                    read_error: false,
                };
                let capture_until = until.min(Instant::now() + Duration::from_millis(1000));
                if tokio::time::timeout_at(
                    capture_until,
                    capture.read(&mut stream, response.headers()),
                )
                .await
                .is_err()
                {
                    capture.read_error = true;
                }
                if Instant::now() >= until {
                    return Err(TransportError::sent("timeout"));
                }
                let metadata = metadata(
                    response.status().as_u16(),
                    response.headers(),
                    Some(&capture),
                )?;
                Ok(Response::builder()
                    .header("content-length", "0")
                    .header("x-codex-transport-response", metadata)
                    .body(full(Vec::new()))
                    .expect("fixed response"))
            }
            Err(_) => {
                let guard = stream.0.lock().expect("socket lock");
                let status = guard
                    .buffer
                    .split(|b| *b == b' ')
                    .nth(1)
                    .and_then(|v| std::str::from_utf8(v).ok())
                    .and_then(|s| s.parse::<u16>().ok())
                    .filter(|n| (100..=599).contains(n));
                Err(TransportError {
                    upstream_status: status,
                    ..TransportError::sent("upstream_io")
                })
            }
        }
    }
}

fn connect_error(code: &'static str) -> TransportError {
    TransportError {
        phase: "upstream_connect",
        ..TransportError::local(code)
    }
}
async fn connect(valid: &Validated) -> Result<Stream, TransportError> {
    let mut roots = rustls::RootCertStore::empty();
    for cert in rustls_native_certs::load_native_certs().certs {
        let _ = roots.add(cert);
    }
    if let Some(ca) = &valid.ca {
        let certs = rustls_pemfile::certs(&mut ca.as_slice())
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| TransportError::local("unsupported_policy"))?;
        if certs.is_empty() {
            return Err(TransportError::local("unsupported_policy"));
        }
        for cert in certs {
            roots
                .add(cert)
                .map_err(|_| TransportError::local("unsupported_policy"))?;
        }
    }
    let config = Arc::new(
        rustls::ClientConfig::builder()
            .with_root_certificates(roots)
            .with_no_client_auth(),
    );
    let connector = tokio_rustls::TlsConnector::from(config);
    let host = valid
        .url
        .host_str()
        .expect("validated host")
        .trim_matches(['[', ']']);
    let port = valid.url.port_or_known_default().unwrap_or(443);
    let socket: Stream = if let Some(proxy) = &valid.meta.proxy_url {
        let url = reqwest::Url::parse(proxy).expect("validated proxy");
        let proxy_host = url
            .host_str()
            .expect("validated host")
            .trim_matches(['[', ']']);
        let proxy_port = url.port_or_known_default().unwrap_or(1080);
        let tcp = TcpStream::connect((proxy_host, proxy_port))
            .await
            .map_err(|_| connect_error("proxy"))?;
        let socket: Stream = if url.scheme() == "https" {
            let name = rustls::pki_types::ServerName::try_from(proxy_host.to_owned())
                .map_err(|_| connect_error("tls"))?;
            Box::new(
                connector
                    .connect(name, tcp)
                    .await
                    .map_err(|_| connect_error("tls"))?,
            )
        } else {
            Box::new(tcp)
        };
        let auth = if !url.username().is_empty() || url.password().is_some() {
            Some(tungstenite::proxy::ProxyAuth {
                username: percent_encoding::percent_decode_str(url.username())
                    .decode_utf8()
                    .map_err(|_| TransportError::local("unsupported_policy"))?
                    .into_owned(),
                password: percent_encoding::percent_decode_str(url.password().unwrap_or(""))
                    .decode_utf8()
                    .map_err(|_| TransportError::local("unsupported_policy"))?
                    .into_owned(),
            })
        } else {
            None
        };
        let scheme = match url.scheme() {
            "http" | "https" => tungstenite::proxy::ProxyScheme::Http,
            "socks5" => tungstenite::proxy::ProxyScheme::Socks5,
            _ => tungstenite::proxy::ProxyScheme::Socks5h,
        };
        let target = if url.scheme() == "socks5" {
            tokio::net::lookup_host((host, port))
                .await
                .map_err(|_| connect_error("proxy"))?
                .next()
                .ok_or_else(|| connect_error("proxy"))?
                .ip()
                .to_string()
        } else {
            host.to_owned()
        };
        tokio_tungstenite::proxy::connect_via_proxy(
            socket,
            &tungstenite::proxy::ProxyConfig {
                scheme,
                host: proxy_host.to_owned(),
                port: proxy_port,
                auth,
            },
            &target,
            port,
        )
        .await
        .map_err(|_| connect_error("proxy"))?
    } else {
        Box::new(
            TcpStream::connect((host, port))
                .await
                .map_err(|_| connect_error("connect"))?,
        )
    };
    let name = rustls::pki_types::ServerName::try_from(host.to_owned())
        .map_err(|_| connect_error("tls"))?;
    Ok(Box::new(
        connector
            .connect(name, socket)
            .await
            .map_err(|_| connect_error("tls"))?,
    ))
}

struct Rejection {
    body: Vec<u8>,
    truncated: bool,
    read_error: bool,
}
impl Rejection {
    async fn read<S: AsyncRead + Unpin>(&mut self, stream: &mut S, headers: &HeaderMap) {
        let result = self.read_inner(stream, headers).await;
        self.read_error |= result.is_err();
        if self.body.len() > 1024 {
            self.body.truncate(1024);
            self.truncated = true;
        }
    }
    async fn read_inner<S: AsyncRead + Unpin>(
        &mut self,
        stream: &mut S,
        headers: &HeaderMap,
    ) -> io::Result<()> {
        if let Some(encoding) = headers.get(http::header::TRANSFER_ENCODING) {
            if encoding != "chunked" {
                return Err(io::Error::other("rejection framing"));
            }
            loop {
                let mut line = Vec::new();
                loop {
                    if line.len() >= 128 {
                        return Err(io::Error::other("chunk line"));
                    }
                    let b = stream.read_u8().await?;
                    line.push(b);
                    if line.ends_with(b"\r\n") {
                        break;
                    }
                }
                let length = std::str::from_utf8(&line[..line.len() - 2])
                    .ok()
                    .and_then(|s| usize::from_str_radix(s.split(';').next().unwrap_or(""), 16).ok())
                    .ok_or_else(|| io::Error::other("chunk length"))?;
                if length == 0 {
                    return Ok(());
                }
                let take = length.min(1025 - self.body.len());
                for _ in 0..take {
                    self.body.push(stream.read_u8().await?);
                }
                if self.body.len() == 1025 {
                    return Ok(());
                }
                if stream.read_u16().await? != 0x0d0a {
                    return Err(io::Error::other("chunk ending"));
                }
            }
        }
        let length = headers
            .get(http::header::CONTENT_LENGTH)
            .map(|v| {
                v.to_str()
                    .ok()
                    .and_then(|v| v.parse::<u64>().ok())
                    .ok_or_else(|| io::Error::other("rejection length"))
            })
            .transpose()?;
        while self.body.len() < 1025 && length.is_none_or(|n| (self.body.len() as u64) < n) {
            let mut b = [0u8; 1];
            if stream.read(&mut b).await? == 0 {
                if length.is_some_and(|n| n > self.body.len() as u64) {
                    return Err(io::Error::other("rejection truncated"));
                }
                break;
            }
            self.body.push(b[0]);
        }
        Ok(())
    }
}
fn metadata(
    status: u16,
    headers: &HeaderMap,
    rejection: Option<&Rejection>,
) -> Result<String, TransportError> {
    let error = || TransportError {
        upstream_status: Some(status),
        ..TransportError::sent("upstream_io")
    };
    if status != 101 && !(200..=599).contains(&status) {
        return Err(error());
    }
    let mut total = 0;
    let mut count = 0;
    for (name, value) in headers {
        total += name.as_str().len() + value.len();
        count += 1;
        if count > 100 || name.as_str().len() > 256 || value.len() > 8192 || total > 12288 {
            return Err(error());
        }
    }
    let mut headers = headers.clone();
    wire::strip_hop_headers(&mut headers);
    wire::strip_ws_headers(&mut headers);
    let pairs = headers
        .iter()
        .map(|(k, v)| (k.as_str().to_owned(), STANDARD.encode(v.as_bytes())))
        .collect::<Vec<_>>();
    let mut value = serde_json::json!({"version":1,"status":status,"headers":pairs,"content_length":null,"protocol":"HTTP/1.1"});
    if let Some(r) = rejection {
        value["rejection_body_b64"] = STANDARD.encode(&r.body).into();
        value["rejection_truncated"] = r.truncated.into();
        value["rejection_read_error"] = r.read_error.into();
    }
    let bytes = serde_json::to_vec(&value).map_err(|_| error())?;
    if bytes.len() > 98304 {
        return Err(error());
    }
    let encoded = STANDARD.encode(bytes);
    if encoded.len() > 131072 {
        return Err(error());
    }
    Ok(encoded)
}

async fn bridge<L, U>(local: WebSocketStream<L>, upstream: WebSocketStream<U>)
where
    L: AsyncRead + AsyncWrite + Unpin,
    U: AsyncRead + AsyncWrite + Unpin,
{
    let (local_write, local_read) = local.split();
    let (upstream_write, upstream_read) = upstream.split();
    let (closing, mut closed) = tokio::sync::watch::channel(false);
    let close_deadline = async move {
        while !*closed.borrow_and_update() {
            if closed.changed().await.is_err() {
                return;
            }
        }
        tokio::time::sleep(Duration::from_secs(5)).await;
    };
    tokio::select! {
        _=forward(local_read,upstream_write,closing.clone()) => {},
        _=forward(upstream_read,local_write,closing) => {},
        _=close_deadline => {},
    }
    // Cancelling either pump drops both socket halves, including a blocked send.
}
async fn forward<R, W>(mut read: R, mut write: W, closing: tokio::sync::watch::Sender<bool>)
where
    R: futures_util::Stream<Item = Result<Message, tungstenite::Error>> + Unpin,
    W: futures_util::Sink<Message, Error = tungstenite::Error> + Unpin,
{
    while let Some(Ok(message)) = read.next().await {
        match message {
            Message::Text(_) | Message::Binary(_) => {
                if write.send(message).await.is_err() {
                    break;
                }
            }
            Message::Close(_) => {
                let _ = closing.send(true);
                if write.send(message).await.is_err() {
                    break;
                }
                // Polling the source again flushes its automatic close echo.
            }
            Message::Ping(_) | Message::Pong(_) => {
                // The next read flushes tungstenite's one automatic matching
                // pong on this hop. Control messages never enter the peer sink.
            }
            Message::Frame(_) => break,
        }
    }
}
