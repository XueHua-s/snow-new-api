use base64::{Engine, engine::general_purpose::STANDARD};
use bytes::Bytes;
use codex_transport::{Server, socket::SocketGuard, wire};
use http::{Request, Response};
use http_body_util::{BodyExt, Full, StreamBody, combinators::UnsyncBoxBody};
use hyper::{
    body::{Frame, Incoming},
    service::service_fn,
};
use hyper_util::rt::TokioIo;
use rcgen::{CertifiedKey, generate_simple_self_signed};
use serde_json::{Value, json};
use std::{
    convert::Infallible,
    future::Future,
    io,
    os::unix::fs::PermissionsExt,
    pin::Pin,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
    time::Duration,
};
use tokio::{
    net::{TcpListener, UnixStream},
    sync::{Notify, watch},
    task::JoinHandle,
};

type TestBody = UnsyncBoxBody<Bytes, io::Error>;
fn full(data: impl Into<Bytes>) -> TestBody {
    Full::new(data.into())
        .map_err(|e| match e {})
        .boxed_unsync()
}
type Handler = Arc<
    dyn Fn(Request<Incoming>) -> Pin<Box<dyn Future<Output = Response<TestBody>> + Send>>
        + Send
        + Sync,
>;
struct Upstream {
    url: String,
    ca: String,
    attempts: Arc<AtomicUsize>,
    task: JoinHandle<()>,
}
impl Drop for Upstream {
    fn drop(&mut self) {
        self.task.abort();
    }
}
async fn upstream<F, Fut>(handler: F) -> Upstream
where
    F: Fn(Request<Incoming>) -> Fut + Send + Sync + 'static,
    Fut: Future<Output = Response<TestBody>> + Send + 'static,
{
    let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();
    let CertifiedKey { cert, signing_key } =
        generate_simple_self_signed(vec!["localhost".to_owned()]).unwrap();
    let config = rustls::ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(
            vec![cert.der().clone()],
            rustls::pki_types::PrivatePkcs8KeyDer::from(signing_key.serialize_der()).into(),
        )
        .unwrap();
    let acceptor = tokio_rustls::TlsAcceptor::from(Arc::new(config));
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!(
        "https://localhost:{}",
        listener.local_addr().unwrap().port()
    );
    let attempts = Arc::new(AtomicUsize::new(0));
    let counter = attempts.clone();
    let handler: Handler = Arc::new(move |request| Box::pin(handler(request)));
    let task = tokio::spawn(async move {
        while let Ok((socket, _)) = listener.accept().await {
            counter.fetch_add(1, Ordering::SeqCst);
            let acceptor = acceptor.clone();
            let handler = handler.clone();
            tokio::spawn(async move {
                if let Ok(tls) = acceptor.accept(socket).await {
                    let service = service_fn(move |req| {
                        let h = handler.clone();
                        async move { Ok::<_, Infallible>(h(req).await) }
                    });
                    let _ = hyper::server::conn::http1::Builder::new()
                        .max_headers(256)
                        .serve_connection(TokioIo::new(tls), service)
                        .with_upgrades()
                        .await;
                }
            });
        }
    });
    Upstream {
        url,
        ca: STANDARD.encode(cert.pem()),
        attempts,
        task,
    }
}
struct Sidecar {
    socket: std::path::PathBuf,
    _directory: tempfile::TempDir,
    _guard: SocketGuard,
    stop: watch::Sender<bool>,
    task: JoinHandle<io::Result<()>>,
}
impl Drop for Sidecar {
    fn drop(&mut self) {
        let _ = self.stop.send(true);
        self.task.abort();
    }
}
async fn sidecar() -> Sidecar {
    let directory = tempfile::tempdir().unwrap();
    std::fs::set_permissions(directory.path(), std::fs::Permissions::from_mode(0o700)).unwrap();
    let socket = directory
        .path()
        .canonicalize()
        .unwrap()
        .join("transport.sock");
    let (listener, guard) = SocketGuard::bind(&socket, unsafe { libc::geteuid() }, unsafe {
        libc::getegid()
    })
    .await
    .unwrap();
    let server = Server::new("https://auth.openai.com/oauth/token".to_owned()).unwrap();
    let (stop, receiver) = watch::channel(false);
    let task = tokio::spawn(server.serve(listener, receiver));
    Sidecar {
        socket,
        _directory: directory,
        _guard: guard,
        stop,
        task,
    }
}
fn metadata(upstream: &Upstream) -> Value {
    json!({"version":1,"request_id":"synthetic-1","profile":"0.162.1","purpose":"api","method":"POST","url":format!("{}/responses?literal=%2F&x=1",upstream.url),"headers":[],"content_length":0,"proxy_url":null,"http_protocol":"http1","shards":1,"idle_timeout_ms":90000,"max_idle_connections":500,"max_idle_per_host":100,"ca_pem_b64":upstream.ca,"connect_timeout_ms":3000,"header_timeout_ms":3000,"total_timeout_ms":0,"max_request_bytes":134217728,"max_ws_message_bytes":134217728})
}
async fn call(sidecar: &Sidecar, meta: &Value, body: TestBody) -> Response<Incoming> {
    let socket = UnixStream::connect(&sidecar.socket).await.unwrap();
    let (mut client, connection) = hyper::client::conn::http1::handshake(TokioIo::new(socket))
        .await
        .unwrap();
    tokio::spawn(async move {
        let _ = connection.await;
    });
    let request = Request::builder()
        .method("POST")
        .uri("/v1/http")
        .header("host", "codex-transport")
        .header("te", "trailers")
        .header(
            wire::META,
            STANDARD.encode(serde_json::to_vec(meta).unwrap()),
        )
        .body(body)
        .unwrap();
    tokio::time::timeout(Duration::from_secs(8), client.send_request(request))
        .await
        .unwrap()
        .unwrap()
}
fn decode_header(response: &Response<Incoming>, header: &str) -> Value {
    serde_json::from_slice(
        &STANDARD
            .decode(response.headers()[header].as_bytes())
            .unwrap(),
    )
    .unwrap()
}
async fn complete(response: Response<Incoming>) -> Bytes {
    let body = response.into_body().collect().await.unwrap();
    assert_eq!(body.trailers().unwrap()[wire::COMPLETE], "1");
    body.to_bytes()
}

#[tokio::test]
async fn method_query_duplicate_headers_hop_fields_status_and_compressed_bytes() {
    let count = Arc::new(AtomicUsize::new(0));
    let counter = count.clone();
    let upstream = upstream(move |request| {
        let count = counter.clone();
        async move {
            count.fetch_add(1, Ordering::SeqCst);
            assert_eq!(request.method(), "PATCH");
            assert_eq!(request.uri().to_string(), "/responses?literal=%2F&x=1");
            assert_eq!(
                request
                    .headers()
                    .get_all("x-duplicate")
                    .iter()
                    .map(|v| v.as_bytes())
                    .collect::<Vec<_>>(),
                vec![b"one".as_slice(), b"two".as_slice()]
            );
            for header in [
                "x-remove",
                "x-codex-transport-spoof",
                "proxy-authorization",
                "accept-encoding",
            ] {
                assert!(!request.headers().contains_key(header), "{header}");
            }
            assert_eq!(
                request.into_body().collect().await.unwrap().to_bytes(),
                "payload"
            );
            Response::builder()
                .status(503)
                .header("content-encoding", "gzip")
                .header("set-cookie", "a=1")
                .header("set-cookie", "b=2")
                .header("connection", "x-remove")
                .header("x-remove", "secret")
                .body(full(Bytes::from_static(b"\x1f\x8braw compressed bytes")))
                .unwrap()
        }
    })
    .await;
    let sidecar = sidecar().await;
    let mut meta = metadata(&upstream);
    meta["method"] = json!("PATCH");
    meta["content_length"] = json!(7);
    meta["headers"] = json!([
        ["x-duplicate", STANDARD.encode("one")],
        ["x-duplicate", STANDARD.encode("two")],
        ["connection", STANDARD.encode("x-remove")],
        ["x-remove", STANDARD.encode("secret")],
        ["x-codex-transport-spoof", STANDARD.encode("secret")],
        ["proxy-authorization", STANDARD.encode("secret")]
    ]);
    let response = call(&sidecar, &meta, full("payload")).await;
    assert_eq!(response.status(), 200);
    let info = decode_header(&response, "x-codex-transport-response");
    assert_eq!(info["status"], 503);
    assert_eq!(info["protocol"], "HTTP/1.1");
    assert_eq!(
        info["headers"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|h| h[0] == "set-cookie")
            .count(),
        2
    );
    assert!(
        !info["headers"]
            .as_array()
            .unwrap()
            .iter()
            .any(|h| h[0] == "x-remove")
    );
    assert_eq!(
        complete(response).await,
        b"\x1f\x8braw compressed bytes".as_slice()
    );
    assert_eq!(count.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn sse_first_event_precedes_release_and_cancel_is_independent() {
    let release = Arc::new(Notify::new());
    let gate = release.clone();
    let upstream=upstream(move |_| {let gate=gate.clone();async move {
        let stream=async_stream::stream! {yield Ok::<_,io::Error>(Frame::data(Bytes::from_static(b"data: first\n\n")));gate.notified().await;yield Ok(Frame::data(Bytes::from_static(b"data: completed\n\n")));};
        Response::builder().header("content-type","text/event-stream").body(StreamBody::new(stream).boxed_unsync()).unwrap()
    }}).await;
    let sidecar = sidecar().await;
    let meta = metadata(&upstream);
    let response = call(&sidecar, &meta, full("")).await;
    let mut body = response.into_body();
    let first = tokio::time::timeout(Duration::from_secs(2), body.frame())
        .await
        .unwrap()
        .unwrap()
        .unwrap()
        .into_data()
        .unwrap();
    assert_eq!(first, "data: first\n\n");
    release.notify_one();
    let rest = body.collect().await.unwrap();
    assert_eq!(rest.trailers().unwrap()[wire::COMPLETE], "1");
    assert_eq!(rest.to_bytes(), "data: completed\n\n");
}

#[tokio::test]
async fn no_redirect_or_status_replay_and_identity_has_no_cookie_jar() {
    let seen = Arc::new(std::sync::Mutex::new(Vec::new()));
    let observations = seen.clone();
    let upstream = upstream(move |req| {
        let seen = observations.clone();
        async move {
            seen.lock().unwrap().push((
                req.headers()
                    .get("authorization")
                    .unwrap()
                    .to_str()
                    .unwrap()
                    .to_owned(),
                req.headers().contains_key("cookie"),
            ));
            Response::builder()
                .status(307)
                .header("location", "https://localhost:1/sentinel")
                .header("set-cookie", "identity=previous")
                .body(full("redirect"))
                .unwrap()
        }
    })
    .await;
    let sidecar = sidecar().await;
    for identity in [
        "Bearer synthetic-A",
        "Bearer synthetic-B",
        "Bearer synthetic-A",
    ] {
        let mut meta = metadata(&upstream);
        meta["headers"] = json!([["authorization", STANDARD.encode(identity)]]);
        let response = call(&sidecar, &meta, full("")).await;
        assert_eq!(
            decode_header(&response, "x-codex-transport-response")["status"],
            307
        );
        assert_eq!(complete(response).await, "redirect");
    }
    assert_eq!(
        *seen.lock().unwrap(),
        vec![
            ("Bearer synthetic-A".into(), false),
            ("Bearer synthetic-B".into(), false),
            ("Bearer synthetic-A".into(), false)
        ]
    );
    assert_eq!(
        upstream.attempts.load(Ordering::SeqCst),
        1,
        "same-origin idle connection reused"
    );
}

#[tokio::test]
async fn upstream_truncation_is_not_clean_eof() {
    let release = Arc::new(Notify::new());
    let gate = release.clone();
    let upstream=upstream(move |_| {let gate=gate.clone();async move {
        let stream=async_stream::stream! {yield Ok::<_,io::Error>(Frame::data(Bytes::from_static(b"partial")));gate.notified().await;yield Err(io::Error::other("synthetic failure"));};Response::new(StreamBody::new(stream).boxed_unsync())
    }}).await;
    let sidecar = sidecar().await;
    let response = call(&sidecar, &metadata(&upstream), full("")).await;
    assert_eq!(
        decode_header(&response, "x-codex-transport-response")["status"],
        200
    );
    let mut body = response.into_body();
    assert_eq!(
        body.frame().await.unwrap().unwrap().into_data().unwrap(),
        "partial"
    );
    release.notify_one();
    assert!(body.collect().await.is_err());
    assert_eq!(upstream.attempts.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn untrusted_certificate_and_wrong_hostname_do_not_send_http() {
    let requests = Arc::new(AtomicUsize::new(0));
    let counter = requests.clone();
    let upstream = upstream(move |_| {
        let requests = counter.clone();
        async move {
            requests.fetch_add(1, Ordering::SeqCst);
            Response::new(full("unexpected"))
        }
    })
    .await;
    let sidecar = sidecar().await;
    let mut meta = metadata(&upstream);
    meta["ca_pem_b64"] = Value::Null;
    let response = call(&sidecar, &meta, full("")).await;
    assert_eq!(response.status(), 502);
    assert_eq!(
        decode_header(&response, "x-codex-transport-error")["may_have_sent"],
        false
    );
    meta = metadata(&upstream);
    meta["url"] = json!(upstream.url.replace("localhost", "127.0.0.1"));
    let response = call(&sidecar, &meta, full("")).await;
    assert_eq!(response.status(), 502);
    assert_eq!(requests.load(Ordering::SeqCst), 0);
    assert_eq!(upstream.attempts.load(Ordering::SeqCst), 2);
}

#[test]
fn required_metadata_types_duplicates_limits_and_secret_safe_errors() {
    let fixture: Value = serde_json::from_str(include_str!("../fixtures/contracts.json")).unwrap();
    let upstream = Upstream {
        url: "https://localhost:1234".into(),
        ca: STANDARD.encode("synthetic"),
        attempts: Arc::new(AtomicUsize::new(0)),
        task: tokio::runtime::Runtime::new().unwrap().spawn(async {}),
    };
    let baseline = metadata(&upstream);
    for name in [
        "shards",
        "connect_timeout_ms",
        "header_timeout_ms",
        "total_timeout_ms",
        "idle_timeout_ms",
        "max_idle_connections",
        "max_idle_per_host",
        "max_request_bytes",
        "max_ws_message_bytes",
    ] {
        let limits = fixture["limits"]
            .as_array()
            .unwrap()
            .iter()
            .find(|l| l["name"] == name)
            .unwrap();
        for vector in limits["lower_boundary"]
            .as_array()
            .unwrap()
            .iter()
            .chain(limits["upper_boundary"].as_array().unwrap())
        {
            let mut meta = baseline.clone();
            meta["http_protocol"] = json!("auto");
            meta[name] = vector["value"].clone();
            let result = serde_json::from_value::<wire::Metadata>(meta)
                .map_err(|_| ())
                .and_then(|m| {
                    wire::validate(m, "https://auth.openai.com/oauth/token").map_err(|_| ())
                });
            assert_eq!(
                result.is_ok(),
                vector["accepted"].as_bool().unwrap(),
                "{name}: {vector}"
            );
        }
    }
    for field in baseline.as_object().unwrap().keys() {
        let mut missing = baseline.clone();
        missing.as_object_mut().unwrap().remove(field);
        assert!(
            serde_json::from_value::<wire::Metadata>(missing).is_err(),
            "missing {field}"
        );
    }
    let mut headers = http::HeaderMap::new();
    let raw = serde_json::to_string(&baseline).unwrap();
    let duplicate = raw.replacen("{", "{\"version\":1,", 1);
    headers.insert(
        wire::META,
        http::HeaderValue::from_str(&STANDARD.encode(duplicate)).unwrap(),
    );
    assert!(wire::decode(&headers, "https://auth.openai.com/oauth/token").is_err());
}

#[tokio::test]
async fn upload_is_incremental_and_early_response_stops_unfinished_source() {
    let first_received = Arc::new(Notify::new());
    let arrived = first_received.clone();
    let upstream = upstream(move |request| {
        let arrived = arrived.clone();
        async move {
            let mut body = request.into_body();
            let first = body.frame().await.unwrap().unwrap().into_data().unwrap();
            assert_eq!(first, "prefix");
            arrived.notify_one();
            Response::builder()
                .status(413)
                .body(full("too large"))
                .unwrap()
        }
    })
    .await;
    let sidecar = sidecar().await;
    let mut meta = metadata(&upstream);
    meta["content_length"] = json!(1024);
    let source = async_stream::stream! {yield Ok::<_,io::Error>(Frame::data(Bytes::from_static(b"prefix"))); std::future::pending::<()>().await;};
    let response = call(&sidecar, &meta, StreamBody::new(source).boxed_unsync()).await;
    first_received.notified().await;
    assert_eq!(
        decode_header(&response, "x-codex-transport-response")["status"],
        413
    );
    assert_eq!(complete(response).await, "too large");
    assert_eq!(upstream.attempts.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn upload_limit_and_length_mismatch_never_complete_or_replay() {
    let upstream = upstream(|request| async move {
        match request.into_body().collect().await {
            Ok(_) => Response::new(full("unexpected valid body")),
            Err(_) => Response::builder()
                .status(400)
                .body(full("source failed"))
                .unwrap(),
        }
    })
    .await;
    let sidecar = sidecar().await;
    for (declared, limit, payload) in [(Some(3), 10, "ab"), (Some(2), 10, "abc"), (None, 2, "abc")]
    {
        let mut meta = metadata(&upstream);
        meta["content_length"] = json!(declared);
        meta["max_request_bytes"] = json!(limit);
        let response = call(&sidecar, &meta, full(payload)).await;
        assert_eq!(response.status(), 502);
        let error = decode_header(&response, "x-codex-transport-error");
        assert_eq!(error["may_have_sent"], true);
        assert_eq!(error["code"], "upstream_io");
    }
    assert_eq!(upstream.attempts.load(Ordering::SeqCst), 3);
}
struct SignalOnDrop(Arc<Notify>);
impl Drop for SignalOnDrop {
    fn drop(&mut self) {
        self.0.notify_one();
    }
}
#[tokio::test]
async fn downstream_cancellation_releases_upstream_without_affecting_other_identity() {
    let cancelled = Arc::new(Notify::new());
    let cancellation = cancelled.clone();
    let upstream=upstream(move |req| {let cancellation=cancellation.clone();async move {
        if req.headers()["authorization"]=="synthetic-B" {return Response::new(full("B completes"));}
        let stream=async_stream::stream! {let _drop=SignalOnDrop(cancellation);yield Ok::<_,io::Error>(Frame::data(Bytes::from_static(b"A first")));std::future::pending::<()>().await;};
        Response::new(StreamBody::new(stream).boxed_unsync())
    }}).await;
    let sidecar = sidecar().await;
    let mut a = metadata(&upstream);
    a["headers"] = json!([["authorization", STANDARD.encode("synthetic-A")]]);
    let response = call(&sidecar, &a, full("")).await;
    let mut body = response.into_body();
    assert_eq!(
        body.frame().await.unwrap().unwrap().into_data().unwrap(),
        "A first"
    );
    let mut b = a.clone();
    b["headers"] = json!([["authorization", STANDARD.encode("synthetic-B")]]);
    assert_eq!(
        complete(call(&sidecar, &b, full("")).await).await,
        "B completes"
    );
    drop(body);
    tokio::time::timeout(Duration::from_secs(2), cancelled.notified())
        .await
        .unwrap();
    assert_eq!(
        complete(call(&sidecar, &b, full("")).await).await,
        "B completes"
    );
}

#[tokio::test]
async fn head_204_304_have_empty_completed_body_and_representation_length() {
    let upstream = upstream(|req| async move {
        let status = req.headers()["x-status"]
            .to_str()
            .unwrap()
            .parse::<u16>()
            .unwrap();
        Response::builder()
            .status(status)
            .header("content-length", if status == 204 { "0" } else { "999" })
            .body(full(""))
            .unwrap()
    })
    .await;
    let sidecar = sidecar().await;
    for (method, status, length) in [("HEAD", 200, 999), ("GET", 204, 0)] {
        let mut meta = metadata(&upstream);
        meta["method"] = json!(method);
        meta["headers"] = json!([["x-status", STANDARD.encode(status.to_string())]]);
        let response = call(&sidecar, &meta, full("")).await;
        let info = decode_header(&response, "x-codex-transport-response");
        assert_eq!(info["status"], status);
        assert_eq!(
            info["content_length"], length,
            "method={method} status={status} info={info}"
        );
        assert!(complete(response).await.is_empty());
    }
}

#[tokio::test]
async fn header_and_total_deadlines_cancel_without_second_attempt() {
    let upstream = upstream(|request| async move {
        let _ = request.into_body().collect().await;
        std::future::pending::<Response<TestBody>>().await
    })
    .await;
    let sidecar = sidecar().await;
    for (header, total) in [(1000, 0), (0, 1000)] {
        let mut meta = metadata(&upstream);
        meta["header_timeout_ms"] = json!(header);
        meta["total_timeout_ms"] = json!(total);
        let response = call(&sidecar, &meta, full("")).await;
        assert_eq!(response.status(), 502);
        let error = decode_header(&response, "x-codex-transport-error");
        assert_eq!(error["code"], "timeout");
        assert_eq!(error["may_have_sent"], true);
    }
    assert_eq!(upstream.attempts.load(Ordering::SeqCst), 2);
}

#[tokio::test]
async fn socket_ownership_modes_symlinks_live_stale_and_inode_cleanup() {
    use std::os::unix::fs::symlink;
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().canonicalize().unwrap().join("socket");
    let uid = unsafe { libc::geteuid() };
    let gid = unsafe { libc::getegid() };
    std::fs::set_permissions(dir.path(), std::fs::Permissions::from_mode(0o755)).unwrap();
    assert!(SocketGuard::bind(&path, uid, gid).await.is_err());
    std::fs::set_permissions(dir.path(), std::fs::Permissions::from_mode(0o700)).unwrap();
    std::fs::write(&path, b"not a socket").unwrap();
    assert!(SocketGuard::bind(&path, uid, gid).await.is_err());
    std::fs::remove_file(&path).unwrap();
    symlink("missing", &path).unwrap();
    assert!(SocketGuard::bind(&path, uid, gid).await.is_err());
    std::fs::remove_file(&path).unwrap();
    let (listener, guard) = SocketGuard::bind(&path, uid, gid).await.unwrap();
    assert_eq!(
        std::fs::metadata(&path).unwrap().permissions().mode() & 0o777,
        0o600
    );
    assert!(SocketGuard::bind(&path, uid, gid).await.is_err());
    drop(listener);
    std::mem::forget(guard);
    let (listener, guard) = SocketGuard::bind(&path, uid, gid).await.unwrap();
    std::fs::remove_file(&path).unwrap();
    std::fs::write(&path, b"replacement").unwrap();
    drop(guard);
    assert_eq!(std::fs::read(&path).unwrap(), b"replacement");
    drop(listener);
}

#[tokio::test]
async fn http_https_and_socks_proxies_tunnel_and_keep_proxy_identity_private() {
    use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};
    trait ProxyIo: AsyncRead + AsyncWrite + Unpin + Send {}
    impl<T: AsyncRead + AsyncWrite + Unpin + Send> ProxyIo for T {}
    let requests = Arc::new(AtomicUsize::new(0));
    let counter = requests.clone();
    let upstream = upstream(move |req| {
        let counter = counter.clone();
        async move {
            counter.fetch_add(1, Ordering::SeqCst);
            assert!(!req.headers().contains_key("proxy-authorization"));
            assert_eq!(req.headers()["authorization"], "target-only");
            if req.headers().contains_key("upgrade") {
                ws_echo_response(req, false, None).await
            } else {
                Response::new(full("tunnel works"))
            }
        }
    })
    .await;
    let target_port = reqwest::Url::parse(&upstream.url).unwrap().port().unwrap();
    let sidecar = sidecar().await;
    for websocket in [false, true] {
        for scheme in ["http", "https", "socks5", "socks5h"] {
            let CertifiedKey { cert, signing_key } =
                generate_simple_self_signed(vec!["localhost".into()]).unwrap();
            let config = rustls::ServerConfig::builder()
                .with_no_client_auth()
                .with_single_cert(
                    vec![cert.der().clone()],
                    rustls::pki_types::PrivatePkcs8KeyDer::from(signing_key.serialize_der()).into(),
                )
                .unwrap();
            let acceptor = tokio_rustls::TlsAcceptor::from(Arc::new(config));
            let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
            let port = listener.local_addr().unwrap().port();
            let proxy_count = Arc::new(AtomicUsize::new(0));
            let attempts = proxy_count.clone();
            let proxy = tokio::spawn(async move {
                let (socket, _) = listener.accept().await.unwrap();
                attempts.fetch_add(1, Ordering::SeqCst);
                let mut io: Box<dyn ProxyIo> = if scheme == "https" {
                    Box::new(acceptor.accept(socket).await.unwrap())
                } else {
                    Box::new(socket)
                };
                if scheme.starts_with("socks") {
                    let version = io.read_u8().await.unwrap();
                    assert_eq!(version, 5);
                    let n = io.read_u8().await.unwrap();
                    let mut methods = vec![0; n as usize];
                    io.read_exact(&mut methods).await.unwrap();
                    assert!(methods.contains(&2));
                    io.write_all(&[5, 2]).await.unwrap();
                    assert_eq!(io.read_u8().await.unwrap(), 1);
                    let n = io.read_u8().await.unwrap();
                    let mut user = vec![0; n as usize];
                    io.read_exact(&mut user).await.unwrap();
                    let n = io.read_u8().await.unwrap();
                    let mut password = vec![0; n as usize];
                    io.read_exact(&mut password).await.unwrap();
                    assert_eq!(user, b"proxy-user");
                    assert_eq!(password, b"proxy-secret");
                    io.write_all(&[1, 0]).await.unwrap();
                    let mut head = [0; 4];
                    io.read_exact(&mut head).await.unwrap();
                    assert_eq!(&head[..3], &[5, 1, 0]);
                    match head[3] {
                        1 => {
                            let mut ip = [0; 4];
                            io.read_exact(&mut ip).await.unwrap();
                            assert_eq!(scheme, "socks5");
                        }
                        4 => {
                            let mut ip = [0; 16];
                            io.read_exact(&mut ip).await.unwrap();
                            assert_eq!(scheme, "socks5");
                        }
                        3 => {
                            let n = io.read_u8().await.unwrap();
                            let mut domain = vec![0; n as usize];
                            io.read_exact(&mut domain).await.unwrap();
                            assert_eq!(domain, b"localhost");
                            assert_eq!(scheme, "socks5h");
                        }
                        _ => panic!("invalid SOCKS target"),
                    }
                    assert_eq!(io.read_u16().await.unwrap(), target_port);
                    io.write_all(&[5, 0, 0, 1, 127, 0, 0, 1, 0, 0])
                        .await
                        .unwrap();
                } else {
                    let mut header = Vec::new();
                    loop {
                        header.push(io.read_u8().await.unwrap());
                        assert!(header.len() < 8192);
                        if header.ends_with(b"\r\n\r\n") {
                            break;
                        }
                    }
                    let header = String::from_utf8(header).unwrap();
                    assert!(
                        header
                            .starts_with(&format!("CONNECT localhost:{target_port} HTTP/1.1\r\n"))
                    );
                    assert!(
                        header.to_ascii_lowercase().contains(
                            &format!(
                                "proxy-authorization: basic {}",
                                STANDARD.encode("proxy-user:proxy-secret")
                            )
                            .to_ascii_lowercase()
                        )
                    );
                    io.write_all(b"HTTP/1.1 200 Connection Established\r\n\r\n")
                        .await
                        .unwrap();
                }
                let mut target = tokio::net::TcpStream::connect(("127.0.0.1", target_port))
                    .await
                    .unwrap();
                let _ = tokio::io::copy_bidirectional(&mut io, &mut target).await;
            });
            let mut meta = if websocket {
                ws_metadata(&upstream)
            } else {
                metadata(&upstream)
            };
            meta["proxy_url"] = json!(format!(
                "{scheme}://proxy-user:proxy-secret@localhost:{port}"
            ));
            let mut ca = STANDARD.decode(&upstream.ca).unwrap();
            ca.extend_from_slice(cert.pem().as_bytes());
            meta["ca_pem_b64"] = json!(STANDARD.encode(ca));
            meta["headers"] = json!([["authorization", STANDARD.encode("target-only")]]);
            if websocket {
                use futures_util::{SinkExt, StreamExt};
                let (mut ws, _) = ws_call(&sidecar, &meta, false).await.unwrap();
                ws.send(tungstenite::Message::Text("tunnel works".into()))
                    .await
                    .unwrap();
                assert_eq!(
                    ws.next().await.unwrap().unwrap(),
                    tungstenite::Message::Text("tunnel works".into())
                );
            } else {
                let response = call(&sidecar, &meta, full("")).await;
                assert_eq!(response.status(), 200, "scheme {scheme}");
                assert_eq!(complete(response).await, "tunnel works");
            }
            assert_eq!(proxy_count.load(Ordering::SeqCst), 1);
            proxy.abort();
        }
    }
    assert_eq!(requests.load(Ordering::SeqCst), 8);
}

async fn raw_upstream(response: &'static [u8], expired: bool) -> Upstream {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();
    let key = rcgen::KeyPair::generate().unwrap();
    let mut parameters = rcgen::CertificateParams::new(vec!["localhost".to_owned()]).unwrap();
    if expired {
        parameters.not_before = rcgen::date_time_ymd(2000, 1, 1);
        parameters.not_after = rcgen::date_time_ymd(2001, 1, 1);
    }
    let cert = parameters.self_signed(&key).unwrap();
    let config = rustls::ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(
            vec![cert.der().clone()],
            rustls::pki_types::PrivatePkcs8KeyDer::from(key.serialize_der()).into(),
        )
        .unwrap();
    let acceptor = tokio_rustls::TlsAcceptor::from(Arc::new(config));
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!(
        "https://localhost:{}",
        listener.local_addr().unwrap().port()
    );
    let attempts = Arc::new(AtomicUsize::new(0));
    let counter = attempts.clone();
    let task = tokio::spawn(async move {
        while let Ok((socket, _)) = listener.accept().await {
            counter.fetch_add(1, Ordering::SeqCst);
            let acceptor = acceptor.clone();
            tokio::spawn(async move {
                if let Ok(mut socket) = acceptor.accept(socket).await {
                    let mut headers = Vec::new();
                    while !headers.ends_with(b"\r\n\r\n") {
                        match socket.read_u8().await {
                            Ok(byte) => headers.push(byte),
                            Err(_) => return,
                        }
                        if headers.len() > 262144 {
                            return;
                        }
                    }
                    let response = if response.windows(10).any(|w| w == b"{{accept}}") {
                        let key = std::str::from_utf8(&headers)
                            .unwrap()
                            .lines()
                            .find_map(|line| {
                                line.split_once(':')
                                    .filter(|(name, _)| {
                                        name.eq_ignore_ascii_case("sec-websocket-key")
                                    })
                                    .map(|(_, value)| value.trim())
                            })
                            .unwrap();
                        let accept = tungstenite::handshake::derive_accept_key(key.as_bytes());
                        let at = response
                            .windows(10)
                            .position(|w| w == b"{{accept}}")
                            .unwrap();
                        let mut replaced = response[..at].to_vec();
                        replaced.extend_from_slice(accept.as_bytes());
                        replaced.extend_from_slice(&response[at + 10..]);
                        replaced
                    } else {
                        response.to_vec()
                    };
                    let _ = socket.write_all(&response).await;
                    let _ = socket.shutdown().await;
                }
            });
        }
    });
    Upstream {
        url,
        ca: STANDARD.encode(cert.pem()),
        attempts,
        task,
    }
}
#[tokio::test]
async fn raw_representation_length_illegal_framing_and_expired_certificate() {
    let sidecar = sidecar().await;
    let upstream = raw_upstream(
        b"HTTP/1.1 304 Not Modified\r\nContent-Length: 999\r\nConnection: close\r\n\r\n",
        false,
    )
    .await;
    let response = call(&sidecar, &metadata(&upstream), full("")).await;
    assert_eq!(
        decode_header(&response, "x-codex-transport-response")["content_length"],
        999
    );
    assert!(complete(response).await.is_empty());
    let upstream = raw_upstream(
        b"HTTP/1.1 204 No Content\r\nContent-Length: 5\r\nConnection: close\r\n\r\n",
        false,
    )
    .await;
    let response = call(&sidecar, &metadata(&upstream), full("")).await;
    assert_eq!(response.status(), 502);
    assert_eq!(
        decode_header(&response, "x-codex-transport-error")["may_have_sent"],
        true
    );
    let upstream = raw_upstream(b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n", true).await;
    let response = call(&sidecar, &metadata(&upstream), full("")).await;
    assert_eq!(response.status(), 502);
    let error = decode_header(&response, "x-codex-transport-error");
    assert_eq!(error["code"], "tls");
    assert_eq!(error["may_have_sent"], false);
    assert_eq!(upstream.attempts.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn malformed_metadata_and_auth_target_fail_before_dial() {
    let upstream = upstream(|_| async { panic!("invalid request must not arrive") }).await;
    let sidecar = sidecar().await;
    for edit in [
        json!({"purpose":"auth"}),
        json!({"url":"http://localhost:1/?sentinel=secret"}),
        json!({"proxy_url":"ftp://user:secret@localhost"}),
        json!({"unknown":"secret"}),
        json!({"headers":[["authorization","AA=="]]}),
        json!({"content_length":134217729}),
    ] {
        let mut meta = metadata(&upstream);
        for (key, value) in edit.as_object().unwrap() {
            meta[key] = value.clone();
        }
        let response = call(&sidecar, &meta, full("")).await;
        assert_eq!(response.status(), 502);
        let error = decode_header(&response, "x-codex-transport-error");
        assert_eq!(error["may_have_sent"], false);
        let text = error.to_string();
        assert!(!text.contains("secret"));
        assert!(!text.contains("localhost"));
    }
    assert_eq!(upstream.attempts.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn h2_refused_stream_and_goaway_are_never_replayed() {
    for reset in [true, false] {
        let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();
        let CertifiedKey { cert, signing_key } =
            generate_simple_self_signed(vec!["localhost".into()]).unwrap();
        let mut config = rustls::ServerConfig::builder()
            .with_no_client_auth()
            .with_single_cert(
                vec![cert.der().clone()],
                rustls::pki_types::PrivatePkcs8KeyDer::from(signing_key.serialize_der()).into(),
            )
            .unwrap();
        config.alpn_protocols = vec![b"h2".to_vec()];
        let acceptor = tokio_rustls::TlsAcceptor::from(Arc::new(config));
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let attempts = Arc::new(AtomicUsize::new(0));
        let connections = attempts.clone();
        let requests = Arc::new(AtomicUsize::new(0));
        let received = requests.clone();
        let task = tokio::spawn(async move {
            while let Ok((socket, _)) = listener.accept().await {
                connections.fetch_add(1, Ordering::SeqCst);
                let acceptor = acceptor.clone();
                let received = received.clone();
                tokio::spawn(async move {
                    let tls = acceptor.accept(socket).await.unwrap();
                    let mut connection = h2::server::handshake(tls).await.unwrap();
                    while let Some(Ok((request, mut response))) = connection.accept().await {
                        if request.uri().path() == "/warm" {
                            response.send_response(Response::new(()), true).unwrap();
                            continue;
                        }
                        received.fetch_add(1, Ordering::SeqCst);
                        if reset {
                            response.send_reset(h2::Reason::REFUSED_STREAM);
                        } else {
                            connection.abrupt_shutdown(h2::Reason::NO_ERROR);
                        }
                    }
                });
            }
        });
        let upstream = Upstream {
            url: format!("https://localhost:{port}"),
            ca: STANDARD.encode(cert.pem()),
            attempts,
            task,
        };
        let sidecar = sidecar().await;
        let mut meta = metadata(&upstream);
        meta["http_protocol"] = json!("auto");
        let mut warm = meta.clone();
        warm["url"] = json!(format!("{}/warm", upstream.url));
        let warm_response = call(&sidecar, &warm, full("")).await;
        assert_eq!(
            decode_header(&warm_response, "x-codex-transport-response")["protocol"],
            "HTTP/2.0"
        );
        assert!(complete(warm_response).await.is_empty());
        let response = call(&sidecar, &meta, full("")).await;
        assert_eq!(response.status(), 502);
        assert_eq!(
            decode_header(&response, "x-codex-transport-error")["may_have_sent"],
            true
        );
        assert_eq!(requests.load(Ordering::SeqCst), 1);
        assert_eq!(upstream.attempts.load(Ordering::SeqCst), 1);
    }
}

#[tokio::test]
async fn global_idle_reservations_reject_before_dial_then_evict_inactive_origin() {
    let released = Arc::new(Notify::new());
    let signal = released.clone();
    let a=upstream(move |_| {let signal=signal.clone();async move {
        let stream=async_stream::stream! {let _drop=SignalOnDrop(signal);yield Ok::<_,io::Error>(Frame::data(Bytes::from_static(b"active")));std::future::pending::<()>().await;};Response::new(StreamBody::new(stream).boxed_unsync())
    }}).await;
    let b = upstream(|_| async { Response::new(full("other origin")) }).await;
    let sidecar = sidecar().await;
    let mut ca = STANDARD.decode(&a.ca).unwrap();
    ca.extend_from_slice(&STANDARD.decode(&b.ca).unwrap());
    let ca = STANDARD.encode(ca);
    let mut ma = metadata(&a);
    ma["ca_pem_b64"] = json!(ca);
    ma["max_idle_connections"] = json!(1);
    ma["max_idle_per_host"] = json!(1);
    let mut mb = ma.clone();
    mb["url"] = json!(b.url);
    let response = call(&sidecar, &ma, full("")).await;
    let mut body = response.into_body();
    assert_eq!(
        body.frame().await.unwrap().unwrap().into_data().unwrap(),
        "active"
    );
    let rejected = call(&sidecar, &mb, full("")).await;
    let error = decode_header(&rejected, "x-codex-transport-error");
    assert_eq!(error["code"], "capacity");
    assert_eq!(error["may_have_sent"], false);
    assert_eq!(b.attempts.load(Ordering::SeqCst), 0);
    drop(body);
    tokio::time::timeout(Duration::from_secs(2), released.notified())
        .await
        .unwrap();
    assert_eq!(
        complete(call(&sidecar, &mb, full("")).await).await,
        "other origin"
    );
    assert_eq!(b.attempts.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn active_exchange_cap_is_enforced_before_upstream_attempt() {
    let cancelled = Arc::new(AtomicUsize::new(0));
    let release = Arc::new(Notify::new());
    let cancelled_for_server = cancelled.clone();
    let release_for_server = release.clone();
    let requests = Arc::new(AtomicUsize::new(0));
    let counter = requests.clone();
    let upstream=upstream(move |_| {let counter=counter.clone();let cancelled=cancelled_for_server.clone();let release=release_for_server.clone();async move {
        counter.fetch_add(1,Ordering::SeqCst);let stream=async_stream::stream! {let _drop=CountOnDrop {count:cancelled,notify:release};yield Ok::<_,io::Error>(Frame::data(Bytes::from_static(b"held")));std::future::pending::<()>().await;};Response::new(StreamBody::new(stream).boxed_unsync())
    }}).await;
    let sidecar = sidecar().await;
    let meta = metadata(&upstream);
    let mut bodies = Vec::new();
    for _ in 0..256 {
        let response = call(&sidecar, &meta, full("")).await;
        assert_eq!(response.status(), 200);
        let mut body = response.into_body();
        assert_eq!(
            body.frame().await.unwrap().unwrap().into_data().unwrap(),
            "held"
        );
        bodies.push(body);
    }
    let response = call(&sidecar, &meta, full("")).await;
    let error = decode_header(&response, "x-codex-transport-error");
    assert_eq!(error["code"], "capacity");
    assert_eq!(error["may_have_sent"], false);
    assert_eq!(requests.load(Ordering::SeqCst), 256);
    assert_eq!(upstream.attempts.load(Ordering::SeqCst), 256);
    let ws_error = ws_error(&sidecar, &ws_metadata(&upstream)).await;
    assert_eq!(ws_error["code"], "capacity");
    assert_eq!(ws_error["may_have_sent"], false);
    assert_eq!(upstream.attempts.load(Ordering::SeqCst), 256);
    drop(bodies);
    tokio::time::timeout(Duration::from_secs(5), async {
        while cancelled.load(Ordering::SeqCst) != 256 {
            release.notified().await;
        }
    })
    .await
    .unwrap();
    let mut readmitted = Vec::new();
    for _ in 0..256 {
        let response = call(&sidecar, &meta, full("")).await;
        assert_eq!(response.status(), 200, "every permit must be returned");
        let mut body = response.into_body();
        assert_eq!(
            body.frame().await.unwrap().unwrap().into_data().unwrap(),
            "held"
        );
        readmitted.push(body);
    }
    assert_eq!(requests.load(Ordering::SeqCst), 512);
    drop(readmitted);
}

#[tokio::test]
async fn request_header_boundaries_are_enforced_before_dial() {
    let upstream = upstream(|_| async { Response::new(full("accepted")) }).await;
    let sidecar = sidecar().await;
    for (size, accepted) in [(8191, true), (8192, true), (8193, false)] {
        let mut meta = metadata(&upstream);
        meta["headers"] = json!([["x-large", STANDARD.encode(vec![b'a'; size])]]);
        let response = call(&sidecar, &meta, full("")).await;
        if accepted {
            assert_eq!(complete(response).await, "accepted");
        } else {
            assert_eq!(
                decode_header(&response, "x-codex-transport-error")["may_have_sent"],
                false
            );
        }
    }
    for (count, accepted) in [(99, true), (100, true), (101, false)] {
        let mut meta = metadata(&upstream);
        meta["headers"] = json!(
            (0..count)
                .map(|_| json!(["x-same", STANDARD.encode("value")]))
                .collect::<Vec<_>>()
        );
        let response = call(&sidecar, &meta, full("")).await;
        if accepted {
            assert_eq!(complete(response).await, "accepted");
        } else {
            assert_eq!(
                decode_header(&response, "x-codex-transport-error")["may_have_sent"],
                false
            );
        }
    }
}

#[tokio::test]
async fn known_unknown_and_empty_get_upload_framing() {
    let upstream = upstream(|request| async move {
        let kind = request.headers()["x-kind"].to_str().unwrap();
        if kind == "known" {
            assert_eq!(request.headers()["content-length"], "7");
            assert!(!request.headers().contains_key("transfer-encoding"));
        }
        if kind == "unknown" {
            assert!(!request.headers().contains_key("content-length"));
            assert_eq!(request.headers()["transfer-encoding"], "chunked");
        }
        if kind == "empty" {
            assert_eq!(request.method(), "GET");
            assert_eq!(request.headers()["content-length"], "0");
            assert!(!request.headers().contains_key("transfer-encoding"));
        }
        let expected = if kind == "empty" { "" } else { "payload" };
        assert_eq!(
            request.into_body().collect().await.unwrap().to_bytes(),
            expected
        );
        Response::new(full("framed"))
    })
    .await;
    let sidecar = sidecar().await;
    for (kind, length, method, body) in [
        ("known", Some(7), "POST", "payload"),
        ("unknown", None, "POST", "payload"),
        ("empty", Some(0), "GET", ""),
    ] {
        let mut meta = metadata(&upstream);
        meta["headers"] = json!([["x-kind", STANDARD.encode(kind)]]);
        meta["content_length"] = json!(length);
        meta["method"] = json!(method);
        assert_eq!(
            complete(call(&sidecar, &meta, full(body)).await).await,
            "framed"
        );
    }
}

#[tokio::test]
async fn path_normalization_is_rejected_instead_of_rewriting_target() {
    let upstream = upstream(|_| async { panic!("normalized target must never be dialed") }).await;
    let sidecar = sidecar().await;
    for path in [
        "/a/../responses",
        "/a/%2e%2e/responses",
        "/a/./responses",
        "/a\\responses",
    ] {
        let mut meta = metadata(&upstream);
        meta["url"] = json!(format!("{}{path}?kept=%2F", upstream.url));
        let response = call(&sidecar, &meta, full("")).await;
        let error = decode_header(&response, "x-codex-transport-error");
        assert_eq!(error["code"], "target");
        assert_eq!(error["may_have_sent"], false);
    }
    assert_eq!(upstream.attempts.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn preheader_disconnect_cancels_upload_and_upstream_exchange() {
    use tokio::io::AsyncWriteExt;
    let started = Arc::new(Notify::new());
    let arrival = started.clone();
    let cancelled = Arc::new(Notify::new());
    let gone = cancelled.clone();
    let upstream = upstream(move |request| {
        let arrival = arrival.clone();
        let gone = gone.clone();
        async move {
            let _drop = SignalOnDrop(gone);
            let mut body = request.into_body();
            assert_eq!(
                body.frame().await.unwrap().unwrap().into_data().unwrap(),
                "prefix"
            );
            arrival.notify_one();
            // Socket closure must abort this read or drop the service future.
            let result = body.collect().await;
            assert!(result.is_err());
            Response::new(full("cancelled"))
        }
    })
    .await;
    let sidecar = sidecar().await;
    let mut meta = metadata(&upstream);
    meta["content_length"] = Value::Null;
    let mut socket = UnixStream::connect(&sidecar.socket).await.unwrap();
    let encoded = STANDARD.encode(serde_json::to_vec(&meta).unwrap());
    let request = format!(
        "POST /v1/http HTTP/1.1\r\nHost: codex-transport\r\nX-Codex-Transport-Meta: {encoded}\r\nTransfer-Encoding: chunked\r\n\r\n6\r\nprefix\r\n"
    );
    socket.write_all(request.as_bytes()).await.unwrap();
    tokio::time::timeout(Duration::from_secs(2), started.notified())
        .await
        .unwrap();
    drop(socket);
    tokio::time::timeout(Duration::from_secs(2), cancelled.notified())
        .await
        .unwrap();
    assert_eq!(upstream.attempts.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn reused_http1_connection_closure_does_not_redial_or_replay() {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();
    let CertifiedKey { cert, signing_key } =
        generate_simple_self_signed(vec!["localhost".into()]).unwrap();
    let config = rustls::ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(
            vec![cert.der().clone()],
            rustls::pki_types::PrivatePkcs8KeyDer::from(signing_key.serialize_der()).into(),
        )
        .unwrap();
    let acceptor = tokio_rustls::TlsAcceptor::from(Arc::new(config));
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let attempts = Arc::new(AtomicUsize::new(0));
    let counter = attempts.clone();
    let requests = Arc::new(AtomicUsize::new(0));
    let received = requests.clone();
    let task = tokio::spawn(async move {
        while let Ok((socket, _)) = listener.accept().await {
            counter.fetch_add(1, Ordering::SeqCst);
            let acceptor = acceptor.clone();
            let received = received.clone();
            tokio::spawn(async move {
                let mut socket = acceptor.accept(socket).await.unwrap();
                for index in 0..2 {
                    let mut headers = Vec::new();
                    while !headers.ends_with(b"\r\n\r\n") {
                        match socket.read_u8().await {
                            Ok(b) => headers.push(b),
                            Err(_) => return,
                        }
                    }
                    received.fetch_add(1, Ordering::SeqCst);
                    if index == 0 {
                        socket
                            .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 4\r\n\r\nwarm")
                            .await
                            .unwrap();
                    } else {
                        socket.shutdown().await.unwrap();
                    }
                }
            });
        }
    });
    let upstream = Upstream {
        url: format!("https://localhost:{port}"),
        ca: STANDARD.encode(cert.pem()),
        attempts,
        task,
    };
    let sidecar = sidecar().await;
    let meta = metadata(&upstream);
    assert_eq!(
        complete(call(&sidecar, &meta, full("")).await).await,
        "warm"
    );
    let response = call(&sidecar, &meta, full("")).await;
    assert_eq!(response.status(), 502);
    assert_eq!(
        decode_header(&response, "x-codex-transport-error")["may_have_sent"],
        true
    );
    assert_eq!(upstream.attempts.load(Ordering::SeqCst), 1);
    assert_eq!(requests.load(Ordering::SeqCst), 2);
}

#[cfg(target_os = "linux")]
#[tokio::test]
async fn native_tls_process_uses_verified_os_trust_and_production_health() {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let upstream = upstream(|_| async { Response::new(full("native TLS verified")) }).await;
    let directory = tempfile::tempdir().unwrap();
    std::fs::set_permissions(directory.path(), std::fs::Permissions::from_mode(0o700)).unwrap();
    let socket = directory.path().join("native.sock");
    let ca = directory.path().join("synthetic-ca.pem");
    std::fs::write(&ca, STANDARD.decode(&upstream.ca).unwrap()).unwrap();
    let mut child = tokio::process::Command::new(env!("CARGO_BIN_EXE_codex-transport"))
        .env("CODEX_TRANSPORT_SOCKET", &socket)
        .env("SSL_CERT_FILE", &ca)
        .kill_on_drop(true)
        .spawn()
        .unwrap();
    let stream = tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            match UnixStream::connect(&socket).await {
                Ok(stream) => break stream,
                Err(_) => {
                    tokio::task::yield_now().await;
                }
            }
        }
    })
    .await
    .unwrap();
    let (mut client, connection) = hyper::client::conn::http1::handshake(TokioIo::new(stream))
        .await
        .unwrap();
    tokio::spawn(async move {
        let _ = connection.await;
    });
    let mut meta = metadata(&upstream);
    meta["ca_pem_b64"] = Value::Null;
    let request = Request::builder()
        .method("POST")
        .uri("/v1/http")
        .header("host", "codex-transport")
        .header("te", "trailers")
        .header(
            wire::META,
            STANDARD.encode(serde_json::to_vec(&meta).unwrap()),
        )
        .body(full(""))
        .unwrap();
    let response = client.send_request(request).await.unwrap();
    assert_eq!(complete(response).await, "native TLS verified");
    let mut health = UnixStream::connect(&socket).await.unwrap();
    health
        .write_all(b"GET /v1/health HTTP/1.1\r\nHost: codex-transport\r\nConnection: close\r\n\r\n")
        .await
        .unwrap();
    let mut bytes = Vec::new();
    health.read_to_end(&mut bytes).await.unwrap();
    let text = String::from_utf8(bytes).unwrap();
    assert!(text.contains("\"production\":true"));
    assert!(text.contains("\"routes\":[\"http\",\"ws\"]"));
    child.kill().await.unwrap();
}

#[tokio::test]
async fn total_deadline_covers_zero_length_local_source_wait_before_dial() {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let upstream =
        upstream(|_| async { panic!("source must complete before empty request dial") }).await;
    let sidecar = sidecar().await;
    let mut meta = metadata(&upstream);
    meta["total_timeout_ms"] = json!(50);
    let mut socket = UnixStream::connect(&sidecar.socket).await.unwrap();
    let encoded = STANDARD.encode(serde_json::to_vec(&meta).unwrap());
    socket.write_all(format!("POST /v1/http HTTP/1.1\r\nHost: codex-transport\r\nX-Codex-Transport-Meta: {encoded}\r\nTransfer-Encoding: chunked\r\n\r\n").as_bytes()).await.unwrap();
    let mut bytes = Vec::new();
    tokio::time::timeout(Duration::from_secs(2), socket.read_to_end(&mut bytes))
        .await
        .unwrap()
        .unwrap();
    let response = String::from_utf8(bytes).unwrap();
    assert!(response.starts_with("HTTP/1.1 502"));
    let encoded = response
        .lines()
        .find_map(|line| line.strip_prefix("x-codex-transport-error: "))
        .unwrap();
    let error: Value = serde_json::from_slice(&STANDARD.decode(encoded).unwrap()).unwrap();
    assert_eq!(error["code"], "timeout");
    assert_eq!(error["may_have_sent"], false);
    assert_eq!(upstream.attempts.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn header_deadline_waits_for_producer_delivery() {
    let arrived = Arc::new(Notify::new());
    let observation = arrived.clone();
    let release = Arc::new(Notify::new());
    let gate = release.clone();
    let upstream = upstream(move |request| {
        let arrived = observation.clone();
        async move {
            let mut body = request.into_body();
            assert_eq!(
                body.frame().await.unwrap().unwrap().into_data().unwrap(),
                "first"
            );
            arrived.notify_one();
            assert_eq!(body.collect().await.unwrap().to_bytes(), "last");
            Response::new(full("producer complete"))
        }
    })
    .await;
    let sidecar = sidecar().await;
    let mut meta = metadata(&upstream);
    meta["content_length"] = json!(9);
    meta["header_timeout_ms"] = json!(20);
    let stream = async_stream::stream! {yield Ok::<_,io::Error>(Frame::data(Bytes::from_static(b"first")));gate.notified().await;yield Ok(Frame::data(Bytes::from_static(b"last")));};
    let response = call(&sidecar, &meta, StreamBody::new(stream).boxed_unsync());
    tokio::pin!(response);
    tokio::select! {_=&mut response=>panic!("response before producer complete"),_=arrived.notified()=>{}}
    // Deliberately cross the configured response-header deadline while the source
    // is blocked. This checks timeout semantics, not a throughput benchmark.
    assert!(
        tokio::time::timeout(Duration::from_millis(60), &mut response)
            .await
            .is_err()
    );
    release.notify_one();
    assert_eq!(complete(response.await).await, "producer complete");
}

#[cfg(target_os = "linux")]
#[tokio::test]
async fn unix_socket_uid_and_shared_gid_access_controls() {
    let sidecar = sidecar().await;
    let executable = env!("CARGO_BIN_EXE_codex-transport");
    let status = tokio::process::Command::new(executable)
        .arg("health")
        .env("CODEX_TRANSPORT_SOCKET", &sidecar.socket)
        .status()
        .await
        .unwrap();
    assert!(status.success());
    if std::env::var_os("CODEX_TEST_UID_MATRIX").is_some() {
        assert_eq!(
            unsafe { libc::geteuid() },
            0,
            "explicit UID matrix needs disposable root container"
        );
        let status = tokio::process::Command::new(executable)
            .arg("health")
            .env("CODEX_TRANSPORT_SOCKET", &sidecar.socket)
            .uid(65534)
            .gid(65534)
            .status()
            .await
            .unwrap();
        assert!(!status.success());
        use std::os::unix::fs::chown;
        chown(sidecar._directory.path(), None, Some(65534)).unwrap();
        chown(&sidecar.socket, None, Some(65534)).unwrap();
        std::fs::set_permissions(
            sidecar._directory.path(),
            std::fs::Permissions::from_mode(0o750),
        )
        .unwrap();
        std::fs::set_permissions(&sidecar.socket, std::fs::Permissions::from_mode(0o660)).unwrap();
        let status = tokio::process::Command::new(executable)
            .arg("health")
            .env("CODEX_TRANSPORT_SOCKET", &sidecar.socket)
            .uid(65534)
            .gid(65534)
            .status()
            .await
            .unwrap();
        assert!(status.success());
    }
}

#[tokio::test]
async fn failed_proxy_auth_connection_and_outer_tls_never_reach_target() {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let upstream =
        upstream(|_| async { panic!("failed proxy must never dial target directly") }).await;
    let sidecar = sidecar().await;
    let proxy = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = proxy.local_addr().unwrap();
    let attempts = Arc::new(AtomicUsize::new(0));
    let count = attempts.clone();
    let task = tokio::spawn(async move {
        let (mut socket, _) = proxy.accept().await.unwrap();
        count.fetch_add(1, Ordering::SeqCst);
        let mut request = Vec::new();
        while !request.ends_with(b"\r\n\r\n") {
            request.push(socket.read_u8().await.unwrap());
        }
        socket
            .write_all(b"HTTP/1.1 407 Proxy Authentication Required\r\nContent-Length: 0\r\n\r\n")
            .await
            .unwrap();
    });
    let mut meta = metadata(&upstream);
    meta["proxy_url"] = json!(format!("http://synthetic-user:synthetic-secret@{address}"));
    let response = call(&sidecar, &meta, full("")).await;
    let error = decode_header(&response, "x-codex-transport-error");
    assert_eq!(error["code"], "proxy");
    assert_eq!(error["may_have_sent"], false);
    assert!(!error.to_string().contains("synthetic-secret"));
    task.await.unwrap();
    assert_eq!(attempts.load(Ordering::SeqCst), 1);
    let closed = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = closed.local_addr().unwrap();
    drop(closed);
    meta["proxy_url"] = json!(format!("http://{address}"));
    let response = call(&sidecar, &meta, full("")).await;
    assert_eq!(
        decode_header(&response, "x-codex-transport-error")["may_have_sent"],
        false
    );
    let proxy = raw_upstream(b"HTTP/1.1 200 Connection Established\r\n\r\n", false).await;
    meta["proxy_url"] = json!(proxy.url);
    let response = call(&sidecar, &meta, full("")).await;
    let error = decode_header(&response, "x-codex-transport-error");
    assert_eq!(error["code"], "tls");
    assert_eq!(error["may_have_sent"], false);
    assert_eq!(proxy.attempts.load(Ordering::SeqCst), 1);
    assert_eq!(upstream.attempts.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn explicit_ca_does_not_trust_other_certificate() {
    let upstream = upstream(|_| async { panic!("untrusted TLS must not reach HTTP") }).await;
    let sidecar = sidecar().await;
    let CertifiedKey { cert, .. } = generate_simple_self_signed(vec!["localhost".into()]).unwrap();
    let mut meta = metadata(&upstream);
    meta["ca_pem_b64"] = json!(STANDARD.encode(cert.pem()));
    let response = call(&sidecar, &meta, full("")).await;
    let error = decode_header(&response, "x-codex-transport-error");
    assert_eq!(error["code"], "tls");
    assert_eq!(error["may_have_sent"], false);
    assert_eq!(upstream.attempts.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn upstream_header_overflow_returns_known_status_not_success() {
    let upstream = upstream(|_| async {
        Response::builder()
            .header("x-too-large", "a".repeat(8193))
            .body(full("must not escape"))
            .unwrap()
    })
    .await;
    let sidecar = sidecar().await;
    let response = call(&sidecar, &metadata(&upstream), full("")).await;
    assert_eq!(response.status(), 502);
    let error = decode_header(&response, "x-codex-transport-error");
    assert_eq!(error["code"], "upstream_io");
    assert_eq!(error["upstream_status"], 200);
    assert_eq!(error["may_have_sent"], true);
    assert_eq!(upstream.attempts.load(Ordering::SeqCst), 1);
}

struct CountOnDrop {
    count: Arc<AtomicUsize>,
    notify: Arc<Notify>,
}
impl Drop for CountOnDrop {
    fn drop(&mut self) {
        self.count.fetch_add(1, Ordering::SeqCst);
        self.notify.notify_one();
    }
}

#[tokio::test]
async fn policy_registry_never_evicts_active_work_and_reuses_released_capacity() {
    let release = Arc::new(Notify::new());
    let signal = release.clone();
    let upstream=upstream(move |_|{let signal=signal.clone();async move {
        let stream=async_stream::stream! {let _drop=SignalOnDrop(signal);yield Ok::<_,io::Error>(Frame::data(Bytes::from_static(b"active policy")));std::future::pending::<()>().await;};Response::new(StreamBody::new(stream).boxed_unsync())
    }}).await;
    let sidecar = sidecar().await;
    let mut bodies = Vec::new();
    for policy in 0..128 {
        let mut meta = metadata(&upstream);
        meta["idle_timeout_ms"] = json!(100000 + policy);
        let response = call(&sidecar, &meta, full("")).await;
        let mut body = response.into_body();
        assert_eq!(
            body.frame().await.unwrap().unwrap().into_data().unwrap(),
            "active policy"
        );
        bodies.push(body);
    }
    let mut next = metadata(&upstream);
    next["idle_timeout_ms"] = json!(200000);
    let response = call(&sidecar, &next, full("")).await;
    let error = decode_header(&response, "x-codex-transport-error");
    assert_eq!(error["code"], "capacity");
    assert_eq!(error["may_have_sent"], false);
    assert_eq!(upstream.attempts.load(Ordering::SeqCst), 128);
    drop(bodies.pop());
    tokio::time::timeout(Duration::from_secs(2), release.notified())
        .await
        .unwrap();
    let response = call(&sidecar, &next, full("")).await;
    assert_eq!(response.status(), 200);
    let mut body = response.into_body();
    assert_eq!(
        body.frame().await.unwrap().unwrap().into_data().unwrap(),
        "active policy"
    );
    assert_eq!(upstream.attempts.load(Ordering::SeqCst), 129);
}

#[tokio::test]
async fn blocked_consumer_stops_h2_source_and_cancellation_releases_it() {
    let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();
    let CertifiedKey { cert, signing_key } =
        generate_simple_self_signed(vec!["localhost".into()]).unwrap();
    let mut config = rustls::ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(
            vec![cert.der().clone()],
            rustls::pki_types::PrivatePkcs8KeyDer::from(signing_key.serialize_der()).into(),
        )
        .unwrap();
    config.alpn_protocols = vec![b"h2".to_vec()];
    let acceptor = tokio_rustls::TlsAcceptor::from(Arc::new(config));
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let attempts = Arc::new(AtomicUsize::new(0));
    let counter = attempts.clone();
    let produced = Arc::new(AtomicUsize::new(0));
    let sent = produced.clone();
    let blocked = Arc::new(Notify::new());
    let stalled = blocked.clone();
    let released = Arc::new(Notify::new());
    let ended = released.clone();
    let task = tokio::spawn(async move {
        let (socket, _) = listener.accept().await.unwrap();
        counter.fetch_add(1, Ordering::SeqCst);
        let tls = acceptor.accept(socket).await.unwrap();
        let mut connection = h2::server::handshake(tls).await.unwrap();
        let (_, mut response) = connection.accept().await.unwrap().unwrap();
        let mut stream = response.send_response(Response::new(()), false).unwrap();
        tokio::spawn(async move {
            let _drop = SignalOnDrop(ended);
            let chunk = Bytes::from(vec![b'x'; 65536]);
            // This is a finite hypothetical response, not an eager allocation.
            // The test cancels while h2 is demonstrably waiting for flow credit.
            while sent.load(Ordering::SeqCst) < 64 * 1024 * 1024 {
                stream.reserve_capacity(chunk.len());
                let capacity = std::future::poll_fn(|cx| {
                    let result = stream.poll_capacity(cx);
                    if result.is_pending() && sent.load(Ordering::SeqCst) >= 2 * 1024 * 1024 {
                        stalled.notify_one();
                    }
                    result
                })
                .await;
                let Some(Ok(capacity)) = capacity else {
                    break;
                };
                if capacity == 0 {
                    continue;
                }
                let n = capacity.min(chunk.len());
                if stream.send_data(chunk.slice(..n), false).is_err() {
                    break;
                }
                sent.fetch_add(n, Ordering::SeqCst);
            }
        });
        while connection.accept().await.is_some() {}
    });
    let upstream = Upstream {
        url: format!("https://localhost:{port}"),
        ca: STANDARD.encode(cert.pem()),
        attempts,
        task,
    };
    let sidecar = sidecar().await;
    let mut meta = metadata(&upstream);
    meta["http_protocol"] = json!("auto");
    let response = call(&sidecar, &meta, full("")).await;
    let mut body = response.into_body();
    assert!(
        !body
            .frame()
            .await
            .unwrap()
            .unwrap()
            .into_data()
            .unwrap()
            .is_empty()
    );
    tokio::time::timeout(Duration::from_secs(5), blocked.notified())
        .await
        .unwrap();
    assert!(
        produced.load(Ordering::SeqCst) < 64 * 1024 * 1024,
        "response must not be accumulated in full"
    );
    drop(body);
    tokio::time::timeout(Duration::from_secs(5), released.notified())
        .await
        .unwrap();
    assert_eq!(upstream.attempts.load(Ordering::SeqCst), 1);
}

fn ws_metadata(upstream: &Upstream) -> Value {
    let mut meta = metadata(upstream);
    meta["url"] = format!(
        "{}/responses?literal=%2F",
        upstream.url.replace("https:", "wss:")
    )
    .into();
    meta["method"] = "GET".into();
    meta["header_timeout_ms"] = 45000.into();
    meta["max_ws_message_bytes"] = 1048576.into();
    meta
}
async fn ws_call(
    sidecar: &Sidecar,
    meta: &Value,
    compress: bool,
) -> Result<
    (
        tokio_tungstenite::WebSocketStream<UnixStream>,
        tungstenite::handshake::client::Response,
    ),
    tungstenite::Error,
> {
    use tungstenite::client::IntoClientRequest;
    let socket = UnixStream::connect(&sidecar.socket).await.unwrap();
    let mut request = "ws://codex-transport/v1/ws".into_client_request().unwrap();
    request.headers_mut().insert(
        wire::META,
        STANDARD
            .encode(serde_json::to_vec(meta).unwrap())
            .parse()
            .unwrap(),
    );
    let mut config = tungstenite::protocol::WebSocketConfig::default();
    if compress {
        config.extensions.permessage_deflate = Some(Default::default());
    }
    tokio::time::timeout(
        Duration::from_secs(8),
        tokio_tungstenite::client_async_with_config(request, socket, Some(config)),
    )
    .await
    .unwrap()
}
#[tokio::test]
async fn ws_text_binary_compression_ping_close_and_identity_are_preserved() {
    use futures_util::{SinkExt, StreamExt};
    use tungstenite::{
        Message,
        protocol::{Role, WebSocketConfig},
    };
    let (observed, mut events) = tokio::sync::mpsc::channel(8);
    let upstream = upstream(move |mut request| {
        let events = observed.clone();
        async move {
            assert_eq!(request.uri().to_string(), "/responses?literal=%2F");
            assert_eq!(request.headers()["authorization"], "Bearer synthetic");
            assert_eq!(request.headers()["x-raw"].as_bytes(), b"\xffraw");
            let mut config = WebSocketConfig::default();
            config.extensions.permessage_deflate = Some(Default::default());
            let (response, extensions) =
                tungstenite::handshake::server::create_response_with_extensions(&request, &config)
                    .unwrap();
            let upgrade = hyper::upgrade::on(&mut request);
            tokio::spawn(async move {
                let mut ws = tokio_tungstenite::WebSocketStream::from_raw_socket_with_extensions(
                    TokioIo::new(upgrade.await.unwrap()),
                    Role::Server,
                    Some(config),
                    extensions,
                )
                .await;
                while let Some(Ok(message)) = ws.next().await {
                    if message.is_close() {
                        events.send(message.clone()).await.unwrap();
                        let _ = ws.flush().await;
                        break;
                    }
                    if message.is_text() || message.is_binary() {
                        events.send(message.clone()).await.unwrap();
                        ws.send(message).await.unwrap();
                    } else {
                        events.send(message).await.unwrap();
                    }
                }
            });
            response.map(|_| full(Bytes::new()))
        }
    })
    .await;
    let sidecar = sidecar().await;
    let mut meta = ws_metadata(&upstream);
    meta["headers"] = json!([
        ["authorization", STANDARD.encode("Bearer synthetic")],
        ["x-raw", STANDARD.encode(b"\xffraw")]
    ]);
    let (mut ws, response) = ws_call(&sidecar, &meta, true).await.unwrap();
    assert_eq!(response.status(), 101);
    assert!(response.headers().contains_key("sec-websocket-extensions"));
    let meta: Value = serde_json::from_slice(
        &STANDARD
            .decode(response.headers()["x-codex-transport-response"].as_bytes())
            .unwrap(),
    )
    .unwrap();
    assert_eq!(meta["status"], 101);
    for message in [
        Message::Text("{\"type\":\"response.create\",\"id\":\"one\"}".into()),
        Message::Binary(Bytes::from_static(b"\x00\xffbinary")),
        Message::Text("{\"type\":\"response.create\",\"id\":\"two\"}".into()),
    ] {
        ws.send(message.clone()).await.unwrap();
        assert_eq!(ws.next().await.unwrap().unwrap(), message);
        assert_eq!(events.recv().await.unwrap(), message);
    }
    ws.send(Message::Ping(Bytes::from_static(b"same-hop")))
        .await
        .unwrap();
    assert_eq!(
        ws.next().await.unwrap().unwrap(),
        Message::Pong(Bytes::from_static(b"same-hop"))
    );
    let close = tungstenite::protocol::CloseFrame {
        code: tungstenite::protocol::frame::coding::CloseCode::Away,
        reason: "finished".into(),
    };
    ws.send(Message::Close(Some(close.clone()))).await.unwrap();
    assert_eq!(
        ws.next().await.unwrap().unwrap(),
        Message::Close(Some(close.clone()))
    );
    assert_eq!(events.recv().await.unwrap(), Message::Close(Some(close)));
    assert_eq!(upstream.attempts.load(Ordering::SeqCst), 1);
}
#[tokio::test]
async fn ws_rejection_preserves_status_bounded_body_and_no_local_upgrade() {
    for (status, body) in [
        (401, vec![b'a'; 12]),
        (307, vec![b'b'; 1024]),
        (503, vec![b'c'; 1025]),
    ] {
        let expected = body.clone();
        let upstream = upstream(move |_| {
            let body = body.clone();
            async move {
                Response::builder()
                    .status(status)
                    .header("x-upstream", "preserved")
                    .body(full(body))
                    .unwrap()
            }
        })
        .await;
        let sidecar = sidecar().await;
        let error = ws_call(&sidecar, &ws_metadata(&upstream), false)
            .await
            .unwrap_err();
        let tungstenite::Error::Http(response) = error else {
            panic!("not rejection")
        };
        assert_eq!(response.status(), 200);
        let meta: Value = serde_json::from_slice(
            &STANDARD
                .decode(response.headers()["x-codex-transport-response"].as_bytes())
                .unwrap(),
        )
        .unwrap();
        assert_eq!(meta["status"], status);
        assert_eq!(meta["rejection_read_error"], false);
        assert_eq!(meta["rejection_truncated"], expected.len() > 1024);
        assert_eq!(
            STANDARD
                .decode(meta["rejection_body_b64"].as_str().unwrap())
                .unwrap(),
            expected[..expected.len().min(1024)]
        );
        assert_eq!(upstream.attempts.load(Ordering::SeqCst), 1);
    }
}

async fn ws_echo_response(
    mut request: Request<Incoming>,
    compress: bool,
    gone: Option<Arc<Notify>>,
) -> Response<TestBody> {
    use futures_util::{SinkExt, StreamExt};
    let mut config = tungstenite::protocol::WebSocketConfig::default();
    if compress {
        config.extensions.permessage_deflate = Some(Default::default());
    }
    let (response, extensions) =
        tungstenite::handshake::server::create_response_with_extensions(&request, &config).unwrap();
    let upgrade = hyper::upgrade::on(&mut request);
    tokio::spawn(async move {
        let _gone = gone.map(SignalOnDrop);
        if let Ok(upgraded) = upgrade.await {
            let mut ws = tokio_tungstenite::WebSocketStream::from_raw_socket_with_extensions(
                TokioIo::new(upgraded),
                tungstenite::protocol::Role::Server,
                Some(config),
                extensions,
            )
            .await;
            while let Some(Ok(message)) = ws.next().await {
                if message.is_close() {
                    let _ = ws.flush().await;
                    break;
                }
                if (message.is_text() || message.is_binary()) && ws.send(message).await.is_err() {
                    break;
                }
            }
        }
    });
    response.map(|_| full(Bytes::new()))
}
#[tokio::test]
async fn ws_payload_reservation_rejects_before_dial_and_cancel_restores_all_capacity() {
    let gone = Arc::new(Notify::new());
    let signal = gone.clone();
    let upstream =
        upstream(move |request| ws_echo_response(request, false, Some(signal.clone()))).await;
    let sidecar = sidecar().await;
    let mut meta = ws_metadata(&upstream);
    meta["max_ws_message_bytes"] = 134217728.into();
    let (a, _) = ws_call(&sidecar, &meta, false).await.unwrap();
    let (b, _) = ws_call(&sidecar, &meta, false).await.unwrap();
    let tungstenite::Error::Http(response) = ws_call(&sidecar, &meta, false).await.unwrap_err()
    else {
        panic!("expected capacity")
    };
    let error: Value = serde_json::from_slice(
        &STANDARD
            .decode(response.headers()["x-codex-transport-error"].as_bytes())
            .unwrap(),
    )
    .unwrap();
    assert_eq!(error["code"], "capacity");
    assert_eq!(error["may_have_sent"], false);
    assert_eq!(upstream.attempts.load(Ordering::SeqCst), 2);
    drop(a);
    tokio::time::timeout(Duration::from_secs(2), gone.notified())
        .await
        .unwrap();
    drop(b);
    tokio::time::timeout(Duration::from_secs(2), gone.notified())
        .await
        .unwrap();
    let (_a, _) = ws_call(&sidecar, &meta, false).await.unwrap();
    let (_b, _) = ws_call(&sidecar, &meta, false).await.unwrap();
    assert_eq!(upstream.attempts.load(Ordering::SeqCst), 4);
}
#[tokio::test]
async fn ws_fragmented_and_compressed_message_limit_is_decompressed_limit() {
    use futures_util::{SinkExt, StreamExt};
    use tungstenite::{
        Message,
        protocol::frame::{
            Frame,
            coding::{Data, OpCode},
        },
    };
    let upstream = upstream(|request| ws_echo_response(request, true, None)).await;
    let sidecar = sidecar().await;
    for compressed in [false, true] {
        for size in [63, 64, 65] {
            let mut meta = ws_metadata(&upstream);
            meta["max_ws_message_bytes"] = 64.into();
            let (mut ws, _) = ws_call(&sidecar, &meta, compressed).await.unwrap();
            let payload = "a".repeat(size);
            if compressed {
                ws.send(Message::Text(payload.clone().into()))
                    .await
                    .unwrap();
            } else {
                ws.send(Message::Frame(Frame::message(
                    Bytes::from(payload[..32].to_owned()),
                    OpCode::Data(Data::Text),
                    false,
                )))
                .await
                .unwrap();
                ws.send(Message::Frame(Frame::message(
                    Bytes::from(payload[32..].to_owned()),
                    OpCode::Data(Data::Continue),
                    true,
                )))
                .await
                .unwrap();
            }
            let received = tokio::time::timeout(Duration::from_secs(2), ws.next())
                .await
                .unwrap();
            if size <= 64 {
                assert_eq!(received.unwrap().unwrap(), Message::Text(payload.into()));
            } else {
                assert!(received.is_none_or(|r| r.is_err()));
            }
        }
    }
}
#[tokio::test]
async fn ws_chunked_unknown_length_and_early_eof_rejections() {
    for (raw,body,read_error) in [
        (b"HTTP/1.1 403 Forbidden\r\nTransfer-Encoding: chunked\r\n\r\n3\r\nabc\r\n2\r\nde\r\n0\r\n\r\n".as_slice(),"abcde",false),
        (b"HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\nunknown".as_slice(),"unknown",false),
        (b"HTTP/1.1 503 Unavailable\r\nContent-Length: 9\r\n\r\nshort".as_slice(),"short",true),
    ] {
        let upstream=raw_upstream(raw,false).await;let sidecar=sidecar().await;
        let tungstenite::Error::Http(response)=ws_call(&sidecar,&ws_metadata(&upstream),false).await.unwrap_err() else {panic!("rejection")};
        let meta:Value=serde_json::from_slice(&STANDARD.decode(response.headers()["x-codex-transport-response"].as_bytes()).unwrap()).unwrap();
        assert_eq!(STANDARD.decode(meta["rejection_body_b64"].as_str().unwrap()).unwrap(),body.as_bytes());assert_eq!(meta["rejection_read_error"],read_error);assert_eq!(meta["rejection_truncated"],false);
    }
}

async fn ws_error(sidecar: &Sidecar, meta: &Value) -> Value {
    let tungstenite::Error::Http(response) = ws_call(sidecar, meta, false).await.unwrap_err()
    else {
        panic!("typed local error")
    };
    assert_eq!(response.status(), 502);
    serde_json::from_slice(
        &STANDARD
            .decode(response.headers()["x-codex-transport-error"].as_bytes())
            .unwrap(),
    )
    .unwrap()
}
#[tokio::test]
async fn ws_tls_wrong_root_name_expiry_and_missing_trust_never_send_handshake() {
    let upstream = upstream(|_| async { panic!("unverified WSS must not send HTTP") }).await;
    let sidecar = sidecar().await;
    let CertifiedKey { cert, .. } = generate_simple_self_signed(vec!["localhost".into()]).unwrap();
    for variant in ["missing", "wrong-root", "wrong-name"] {
        let mut meta = ws_metadata(&upstream);
        match variant {
            "missing" => meta["ca_pem_b64"] = Value::Null,
            "wrong-root" => meta["ca_pem_b64"] = STANDARD.encode(cert.pem()).into(),
            _ => {
                meta["url"] = meta["url"]
                    .as_str()
                    .unwrap()
                    .replace("localhost", "127.0.0.1")
                    .into()
            }
        }
        let error = ws_error(&sidecar, &meta).await;
        assert_eq!(error["code"], "tls");
        assert_eq!(error["may_have_sent"], false);
    }
    let expired = raw_upstream(
        b"HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n",
        true,
    )
    .await;
    assert_eq!(
        ws_error(&sidecar, &ws_metadata(&expired)).await["code"],
        "tls"
    );
    assert_eq!(upstream.attempts.load(Ordering::SeqCst), 3);
    assert_eq!(expired.attempts.load(Ordering::SeqCst), 1);
}
#[tokio::test]
async fn ws_proxy_failures_and_connect_deadline_do_not_dial_target_or_leak_secrets() {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let upstream = upstream(|_| async { panic!("proxy failure must not fall back") }).await;
    let sidecar = sidecar().await;
    for scheme in ["http", "socks5", "socks5h"] {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let task = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            if scheme == "http" {
                let mut header = Vec::new();
                while !header.ends_with(b"\r\n\r\n") {
                    header.push(socket.read_u8().await.unwrap());
                }
                socket
                    .write_all(b"HTTP/1.1 407 Proxy Authentication Required\r\n\r\n")
                    .await
                    .unwrap();
            } else {
                let mut greeting = [0u8; 4];
                socket.read_exact(&mut greeting).await.unwrap();
                socket.write_all(&[5, 255]).await.unwrap();
            }
        });
        let mut meta = ws_metadata(&upstream);
        meta["proxy_url"] = format!("{scheme}://synthetic-user:sentinel-secret@{address}").into();
        let error = ws_error(&sidecar, &meta).await;
        assert_eq!(error["code"], "proxy");
        assert_eq!(error["may_have_sent"], false);
        assert!(!error.to_string().contains("sentinel"));
        task.await.unwrap();
    }
    let proxy = raw_upstream(b"HTTP/1.1 200 Connection Established\r\n\r\n", false).await;
    let mut meta = ws_metadata(&upstream);
    meta["proxy_url"] = proxy.url.clone().into();
    assert_eq!(ws_error(&sidecar, &meta).await["code"], "tls");
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    meta["proxy_url"] = format!("http://{}", listener.local_addr().unwrap()).into();
    meta["connect_timeout_ms"] = 100.into();
    let held = tokio::spawn(async move {
        let (_socket, _) = listener.accept().await.unwrap();
        std::future::pending::<()>().await;
    });
    let error = ws_error(&sidecar, &meta).await;
    assert_eq!(error["code"], "timeout");
    assert_eq!(error["may_have_sent"], false);
    held.abort();
    assert_eq!(upstream.attempts.load(Ordering::SeqCst), 0);
}
#[tokio::test]
async fn ws_metadata_and_invalid_local_upgrade_fail_before_dial() {
    let upstream = upstream(|_| async { panic!("invalid metadata must not dial") }).await;
    let sidecar = sidecar().await;
    for (field, value) in [
        ("method", json!("POST")),
        ("content_length", json!(1)),
        ("total_timeout_ms", json!(1)),
        ("header_timeout_ms", json!(0)),
        ("purpose", json!("auth")),
        ("max_ws_message_bytes", json!(134217729)),
    ] {
        let mut meta = ws_metadata(&upstream);
        meta[field] = value;
        assert_eq!(ws_error(&sidecar, &meta).await["may_have_sent"], false);
    }
    let mut meta = ws_metadata(&upstream);
    meta["headers"] = json!([[
        "sec-websocket-protocol",
        STANDARD.encode("not-offered-locally")
    ]]);
    assert_eq!(ws_error(&sidecar, &meta).await["may_have_sent"], false);
    assert_eq!(upstream.attempts.load(Ordering::SeqCst), 0);
}
#[tokio::test]
async fn ws_rejection_capture_deadline_retains_prefix_and_known_header_overflow_status() {
    let slow=upstream(|_|async {
        let stream=async_stream::stream! {yield Ok::<_,io::Error>(Frame::data(Bytes::from_static(b"prefix")));std::future::pending::<()>().await;};
        Response::builder().status(429).body(StreamBody::new(stream).boxed_unsync()).unwrap()
    }).await;
    let sidecar = sidecar().await;
    let tungstenite::Error::Http(response) = ws_call(&sidecar, &ws_metadata(&slow), false)
        .await
        .unwrap_err()
    else {
        panic!("rejection")
    };
    let meta: Value = serde_json::from_slice(
        &STANDARD
            .decode(response.headers()["x-codex-transport-response"].as_bytes())
            .unwrap(),
    )
    .unwrap();
    assert_eq!(meta["status"], 429);
    assert_eq!(meta["rejection_read_error"], true);
    assert_eq!(
        STANDARD
            .decode(meta["rejection_body_b64"].as_str().unwrap())
            .unwrap(),
        b"prefix"
    );
    let oversized = upstream(|_| async {
        Response::builder()
            .status(403)
            .header("x-too-large", "a".repeat(8193))
            .body(full(""))
            .unwrap()
    })
    .await;
    let error = ws_error(&sidecar, &ws_metadata(&oversized)).await;
    assert_eq!(error["upstream_status"], 403);
    assert_eq!(error["code"], "upstream_io");
}

#[tokio::test]
async fn ws_fragmented_deflate_exact_limit_and_invalid_text_or_close_abort() {
    use futures_util::{SinkExt, StreamExt};
    use tungstenite::{
        Message,
        protocol::frame::{
            Frame,
            coding::{Data, OpCode},
        },
    };
    let upstream = upstream(|request| ws_echo_response(request, false, None)).await;
    let sidecar = sidecar().await;
    let mut meta = ws_metadata(&upstream);
    meta["max_ws_message_bytes"] = 64.into();
    let (mut ws, _) = ws_call(&sidecar, &meta, true).await.unwrap();
    // RFC7692 raw DEFLATE fixture for 64 'a' bytes; Z_SYNC_FLUSH trailer omitted.
    let compressed = STANDARD.decode("SkykDAAA").unwrap();
    let mut frame = Frame::message(
        Bytes::copy_from_slice(&compressed[..3]),
        OpCode::Data(Data::Text),
        false,
    );
    frame.header_mut().rsv1 = true;
    ws.send(Message::Frame(frame)).await.unwrap();
    ws.send(Message::Frame(Frame::message(
        Bytes::copy_from_slice(&compressed[3..]),
        OpCode::Data(Data::Continue),
        true,
    )))
    .await
    .unwrap();
    assert_eq!(
        ws.next().await.unwrap().unwrap(),
        Message::Text("a".repeat(64).into())
    );
    for invalid in [
        Frame::message(Bytes::from_static(b"\xff"), OpCode::Data(Data::Text), true),
        Frame::close(Some(tungstenite::protocol::CloseFrame {
            code: tungstenite::protocol::frame::coding::CloseCode::Abnormal,
            reason: "forbidden".into(),
        })),
    ] {
        let (mut ws, _) = ws_call(&sidecar, &meta, false).await.unwrap();
        ws.send(Message::Frame(invalid)).await.unwrap();
        let terminal = tokio::time::timeout(Duration::from_secs(2), ws.next())
            .await
            .unwrap();
        if let Some(Ok(message)) = terminal {
            let Message::Close(Some(close)) = message else {
                panic!("invalid input must terminate")
            };
            assert_eq!(
                close.code,
                tungstenite::protocol::frame::coding::CloseCode::Protocol
            );
        }
    }
}

#[tokio::test]
async fn ws_blocked_downstream_backpressures_and_local_cancel_releases_upstream() {
    use futures_util::{SinkExt, StreamExt};
    let blocked = Arc::new(Notify::new());
    let released = Arc::new(Notify::new());
    let produced = Arc::new(AtomicUsize::new(0));
    let (blocked_in, released_in, produced_in) =
        (blocked.clone(), released.clone(), produced.clone());
    let upstream = upstream(move |mut request| {
        let (blocked, released, produced) =
            (blocked_in.clone(), released_in.clone(), produced_in.clone());
        async move {
            let config = tungstenite::protocol::WebSocketConfig::default();
            let (response, extensions) =
                tungstenite::handshake::server::create_response_with_extensions(&request, &config)
                    .unwrap();
            let upgrade = hyper::upgrade::on(&mut request);
            tokio::spawn(async move {
                let _released = SignalOnDrop(released);
                let ws = tokio_tungstenite::WebSocketStream::from_raw_socket_with_extensions(
                    TokioIo::new(upgrade.await.unwrap()),
                    tungstenite::protocol::Role::Server,
                    Some(config),
                    extensions,
                )
                .await;
                let (mut write, mut read) = ws.split();
                let producer = async {
                    let payload = Bytes::from(vec![b'x'; 1048576]);
                    for _ in 0..64 {
                        let send = write.send(tungstenite::Message::Binary(payload.clone()));
                        tokio::pin!(send);
                        let result = std::future::poll_fn(|cx| {
                            let result = send.as_mut().poll(cx);
                            if result.is_pending() && produced.load(Ordering::SeqCst) >= 1048576 {
                                blocked.notify_one();
                            }
                            result
                        })
                        .await;
                        if result.is_err() {
                            break;
                        }
                        produced.fetch_add(1048576, Ordering::SeqCst);
                    }
                };
                tokio::select! {_=producer=>{},_=read.next()=>{}}
            });
            response.map(|_| full(Bytes::new()))
        }
    })
    .await;
    let sidecar = sidecar().await;
    let (ws, _) = ws_call(&sidecar, &ws_metadata(&upstream), false)
        .await
        .unwrap();
    tokio::time::timeout(Duration::from_secs(5), blocked.notified())
        .await
        .unwrap();
    assert!(produced.load(Ordering::SeqCst) < 64 * 1048576);
    drop(ws);
    tokio::time::timeout(Duration::from_secs(5), released.notified())
        .await
        .unwrap();
    assert_eq!(upstream.attempts.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn ws_coalesced_upgrade_frame_and_abnormal_eof_are_not_lost_or_normalized() {
    use futures_util::StreamExt;
    let upstream=raw_upstream(b"HTTP/1.1 103 Early Hints\r\nLink: </synthetic>\r\n\r\nHTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Accept: {{accept}}\r\n\r\n\x81\x05first",false).await;
    let sidecar = sidecar().await;
    let (mut ws, _) = ws_call(&sidecar, &ws_metadata(&upstream), false)
        .await
        .unwrap();
    assert_eq!(
        ws.next().await.unwrap().unwrap(),
        tungstenite::Message::Text("first".into())
    );
    let terminal = ws.next().await;
    assert!(terminal.is_none_or(|r| r.is_err()));
    assert_eq!(upstream.attempts.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn ws_upstream_handshake_precedes_local_101_and_subprotocols_are_hop_checked() {
    use futures_util::{SinkExt, StreamExt};
    use tungstenite::client::IntoClientRequest;
    let arrived = Arc::new(Notify::new());
    let release = Arc::new(Notify::new());
    let (a, r) = (arrived.clone(), release.clone());
    let upstream = upstream(move |mut request| {
        let (a, r) = (a.clone(), r.clone());
        async move {
            assert_eq!(request.headers()["sec-websocket-protocol"], "alpha, beta");
            a.notify_one();
            r.notified().await;
            let config = tungstenite::protocol::WebSocketConfig::default();
            let (mut response, extensions) =
                tungstenite::handshake::server::create_response_with_extensions(&request, &config)
                    .unwrap();
            response
                .headers_mut()
                .insert("sec-websocket-protocol", "beta".parse().unwrap());
            let upgrade = hyper::upgrade::on(&mut request);
            tokio::spawn(async move {
                let mut ws = tokio_tungstenite::WebSocketStream::from_raw_socket_with_extensions(
                    TokioIo::new(upgrade.await.unwrap()),
                    tungstenite::protocol::Role::Server,
                    Some(config),
                    extensions,
                )
                .await;
                ws.send(tungstenite::Message::Text("first".into()))
                    .await
                    .unwrap();
                let _ = ws.next().await;
            });
            response.map(|_| full(Bytes::new()))
        }
    })
    .await;
    let sidecar = sidecar().await;
    let mut meta = ws_metadata(&upstream);
    meta["headers"] = json!([
        ["sec-websocket-protocol", STANDARD.encode("alpha")],
        ["sec-websocket-protocol", STANDARD.encode("beta")]
    ]);
    let socket = UnixStream::connect(&sidecar.socket).await.unwrap();
    let mut request = "ws://codex-transport/v1/ws".into_client_request().unwrap();
    request.headers_mut().insert(
        wire::META,
        STANDARD
            .encode(serde_json::to_vec(&meta).unwrap())
            .parse()
            .unwrap(),
    );
    request
        .headers_mut()
        .insert("sec-websocket-protocol", "alpha, beta".parse().unwrap());
    let mut connecting = tokio::spawn(tokio_tungstenite::client_async(request, socket));
    arrived.notified().await;
    assert!(futures_util::poll!(&mut connecting).is_pending());
    release.notify_one();
    let (mut ws, response) = connecting.await.unwrap().unwrap();
    assert_eq!(response.headers()["sec-websocket-protocol"], "beta");
    assert_eq!(
        ws.next().await.unwrap().unwrap(),
        tungstenite::Message::Text("first".into())
    );
}
#[tokio::test]
async fn ws_upstream_ping_is_local_and_upstream_close_code_and_reason_are_preserved() {
    use futures_util::{SinkExt, StreamExt};
    let pong = Arc::new(Notify::new());
    let observed = pong.clone();
    let upstream = upstream(move |mut request| {
        let pong = observed.clone();
        async move {
            let config = tungstenite::protocol::WebSocketConfig::default();
            let (response, extensions) =
                tungstenite::handshake::server::create_response_with_extensions(&request, &config)
                    .unwrap();
            let upgrade = hyper::upgrade::on(&mut request);
            tokio::spawn(async move {
                let mut ws = tokio_tungstenite::WebSocketStream::from_raw_socket_with_extensions(
                    TokioIo::new(upgrade.await.unwrap()),
                    tungstenite::protocol::Role::Server,
                    Some(config),
                    extensions,
                )
                .await;
                ws.send(tungstenite::Message::Ping(Bytes::from_static(
                    b"upstream-hop",
                )))
                .await
                .unwrap();
                assert_eq!(
                    ws.next().await.unwrap().unwrap(),
                    tungstenite::Message::Pong(Bytes::from_static(b"upstream-hop"))
                );
                pong.notify_one();
                ws.send(tungstenite::Message::Close(Some(
                    tungstenite::protocol::CloseFrame {
                        code: 4001.into(),
                        reason: "session replaced".into(),
                    },
                )))
                .await
                .unwrap();
                let _ = ws.next().await;
            });
            response.map(|_| full(Bytes::new()))
        }
    })
    .await;
    let sidecar = sidecar().await;
    let (mut ws, _) = ws_call(&sidecar, &ws_metadata(&upstream), false)
        .await
        .unwrap();
    tokio::time::timeout(Duration::from_secs(2), pong.notified())
        .await
        .unwrap();
    let message = ws.next().await.unwrap().unwrap();
    assert_eq!(
        message,
        tungstenite::Message::Close(Some(tungstenite::protocol::CloseFrame {
            code: 4001.into(),
            reason: "session replaced".into()
        }))
    );
    let _ = ws.flush().await;
}
#[tokio::test]
async fn ws_preheader_caller_disconnect_cancels_upstream_without_replay() {
    use tokio::io::AsyncWriteExt;
    let arrived = Arc::new(Notify::new());
    let gone = Arc::new(Notify::new());
    let (a, g) = (arrived.clone(), gone.clone());
    let upstream = upstream(move |_| {
        let (a, g) = (a.clone(), g.clone());
        async move {
            let _drop = SignalOnDrop(g);
            a.notify_one();
            std::future::pending::<Response<TestBody>>().await
        }
    })
    .await;
    let sidecar = sidecar().await;
    let meta = ws_metadata(&upstream);
    let mut socket = UnixStream::connect(&sidecar.socket).await.unwrap();
    let encoded = STANDARD.encode(serde_json::to_vec(&meta).unwrap());
    socket.write_all(format!("GET /v1/ws HTTP/1.1\r\nHost: codex-transport\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: MDEyMzQ1Njc4OWFiY2RlZg==\r\nX-Codex-Transport-Meta: {encoded}\r\n\r\n").as_bytes()).await.unwrap();
    arrived.notified().await;
    drop(socket);
    tokio::time::timeout(Duration::from_secs(2), gone.notified())
        .await
        .unwrap();
    assert_eq!(upstream.attempts.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn ws_handshake_deadline_is_45_seconds_and_does_not_replay() {
    use tungstenite::client::IntoClientRequest;
    let arrived = Arc::new(Notify::new());
    let arrival = arrived.clone();
    let upstream = upstream(move |_| {
        let arrived = arrival.clone();
        async move {
            arrived.notify_one();
            std::future::pending::<Response<TestBody>>().await
        }
    })
    .await;
    let sidecar = sidecar().await;
    let meta = ws_metadata(&upstream);
    let socket = UnixStream::connect(&sidecar.socket).await.unwrap();
    let mut request = "ws://codex-transport/v1/ws".into_client_request().unwrap();
    request.headers_mut().insert(
        wire::META,
        STANDARD
            .encode(serde_json::to_vec(&meta).unwrap())
            .parse()
            .unwrap(),
    );
    let mut pending = tokio::spawn(tokio_tungstenite::client_async(request, socket));
    arrived.notified().await;
    assert!(futures_util::poll!(&mut pending).is_pending());
    let error = tokio::time::timeout(Duration::from_secs(48), pending)
        .await
        .unwrap()
        .unwrap()
        .unwrap_err();
    let tungstenite::Error::Http(response) = error else {
        panic!("typed timeout")
    };
    let error: Value = serde_json::from_slice(
        &STANDARD
            .decode(response.headers()["x-codex-transport-error"].as_bytes())
            .unwrap(),
    )
    .unwrap();
    assert_eq!(error["code"], "timeout");
    assert_eq!(error["may_have_sent"], true);
    assert_eq!(upstream.attempts.load(Ordering::SeqCst), 1);
}
#[tokio::test]
async fn ws_slow_upstream_backpressures_local_upload_and_cancellation_closes_session() {
    use futures_util::{SinkExt, StreamExt};
    let ready = Arc::new(Notify::new());
    let release = Arc::new(Notify::new());
    let gone = Arc::new(Notify::new());
    let (r, l, g) = (ready.clone(), release.clone(), gone.clone());
    let upstream = upstream(move |mut request| {
        let (r, l, g) = (r.clone(), l.clone(), g.clone());
        async move {
            let config = tungstenite::protocol::WebSocketConfig::default();
            let (response, extensions) =
                tungstenite::handshake::server::create_response_with_extensions(&request, &config)
                    .unwrap();
            let upgrade = hyper::upgrade::on(&mut request);
            tokio::spawn(async move {
                let _gone = SignalOnDrop(g);
                let mut ws = tokio_tungstenite::WebSocketStream::from_raw_socket_with_extensions(
                    TokioIo::new(upgrade.await.unwrap()),
                    tungstenite::protocol::Role::Server,
                    Some(config),
                    extensions,
                )
                .await;
                r.notify_one();
                l.notified().await;
                while ws.next().await.is_some_and(|r| r.is_ok()) {}
            });
            response.map(|_| full(Bytes::new()))
        }
    })
    .await;
    let sidecar = sidecar().await;
    let (mut ws, _) = ws_call(&sidecar, &ws_metadata(&upstream), false)
        .await
        .unwrap();
    ready.notified().await;
    let blocked = Arc::new(Notify::new());
    let signal = blocked.clone();
    let produced = Arc::new(AtomicUsize::new(0));
    let count = produced.clone();
    let sender = tokio::spawn(async move {
        let bytes = Bytes::from(vec![b'x'; 1048576]);
        for _ in 0..64 {
            let send = ws.send(tungstenite::Message::Binary(bytes.clone()));
            tokio::pin!(send);
            if std::future::poll_fn(|cx| {
                let result = send.as_mut().poll(cx);
                if result.is_pending() && count.load(Ordering::SeqCst) >= 1048576 {
                    signal.notify_one();
                }
                result
            })
            .await
            .is_err()
            {
                break;
            }
            count.fetch_add(1048576, Ordering::SeqCst);
        }
    });
    tokio::time::timeout(Duration::from_secs(5), blocked.notified())
        .await
        .unwrap();
    assert!(produced.load(Ordering::SeqCst) < 64 * 1048576);
    sender.abort();
    let _ = sender.await;
    release.notify_one();
    tokio::time::timeout(Duration::from_secs(5), gone.notified())
        .await
        .unwrap();
    assert_eq!(upstream.attempts.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn ws_unoffered_upstream_extension_is_rejected_without_local_upgrade() {
    let upstream=raw_upstream(b"HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Accept: {{accept}}\r\nSec-WebSocket-Extensions: unknown-extension\r\n\r\n",false).await;
    let sidecar = sidecar().await;
    let error = ws_error(&sidecar, &ws_metadata(&upstream)).await;
    assert_eq!(error["code"], "upstream_io");
    assert_eq!(error["upstream_status"], 101);
    assert_eq!(error["may_have_sent"], true);
    assert_eq!(upstream.attempts.load(Ordering::SeqCst), 1);
}
