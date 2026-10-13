use codex_transport::{Server, socket::SocketGuard};
use std::path::Path;

fn main() {
    // Called before runtime threads exist; no process-wide umask races.
    unsafe {
        libc::umask(0o077);
    }
    let result = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("runtime initialization")
        .block_on(run());
    if result.is_err() {
        eprintln!("codex transport stopped: configuration or socket failure");
        std::process::exit(1);
    }
}
async fn run() -> Result<(), Box<dyn std::error::Error>> {
    let path = std::env::var("CODEX_TRANSPORT_SOCKET")?;
    if std::env::args().nth(1).as_deref() == Some("health") {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let mut socket = tokio::net::UnixStream::connect(&path).await?;
        socket
            .write_all(
                b"GET /v1/health HTTP/1.1\r\nHost: codex-transport\r\nConnection: close\r\n\r\n",
            )
            .await?;
        let mut reply = Vec::new();
        tokio::time::timeout(
            std::time::Duration::from_secs(3),
            socket.take(262144).read_to_end(&mut reply),
        )
        .await??;
        if !reply.starts_with(b"HTTP/1.1 200 ") {
            return Err("health unavailable".into());
        }
        return Ok(());
    }
    let uid = unsafe { libc::geteuid() };
    let gid = unsafe { libc::getegid() };
    let auth = std::env::var("CODEX_TRANSPORT_AUTH_ENDPOINT")
        .unwrap_or_else(|_| "https://auth.openai.com/oauth/token".to_owned());
    let server = Server::new(auth)?;
    let (listener, _guard) = SocketGuard::bind(Path::new(&path), uid, gid).await?;
    let (stop, receiver) = tokio::sync::watch::channel(false);
    tokio::spawn(async move {
        let mut terminate =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
                .expect("signal handler");
        tokio::select! { _ = tokio::signal::ctrl_c() => {}, _ = terminate.recv() => {} }
        let _ = stop.send(true);
    });
    server.serve(listener, receiver).await?;
    Ok(())
}
