use crate::wire::{TransportError, Validated};
use std::{
    io,
    pin::Pin,
    sync::Arc,
    task::{Context, Poll},
};
use tokio::{
    io::{AsyncRead, AsyncWrite, ReadBuf},
    net::TcpStream,
};

pub(super) trait Socket: AsyncRead + AsyncWrite + Unpin + Send {}
impl<T: AsyncRead + AsyncWrite + Unpin + Send> Socket for T {}
pub(super) type Stream = Box<dyn Socket>;

// Stop the handshake reader exactly after CRLFCRLF. No rejection body or
// coalesced first WS frame is consumed by the handshake library and discarded.
pub(super) struct HeaderBoundary<S> {
    pub(super) stream: S,
    pub(super) buffer: Vec<u8>,
    pub(super) offset: usize,
    pub(super) end: Option<usize>,
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
pub(super) struct HandshakeSocket(pub(super) Arc<std::sync::Mutex<HeaderBoundary<Stream>>>);
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

pub(super) fn connect_error(code: &'static str) -> TransportError {
    TransportError {
        phase: "upstream_connect",
        ..TransportError::local(code)
    }
}
pub(super) async fn connect(valid: &Validated) -> Result<Stream, TransportError> {
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
