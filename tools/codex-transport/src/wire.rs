use base64::{Engine, engine::general_purpose::STANDARD};
use http::{HeaderMap, HeaderName, HeaderValue, Method};
use serde::{Deserialize, Deserializer, Serialize};
use std::collections::HashSet;

pub const PROFILE: &str = "0.162.1";
pub const META: &str = "x-codex-transport-meta";
pub const COMPLETE: &str = "x-codex-transport-complete";
pub const CHUNK: usize = 65_536;

// deserialize_with makes nullable fields required: absent and explicit null differ.
fn nullable<'de, D, T>(d: D) -> Result<Option<T>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::deserialize(d)
}

#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Metadata {
    pub version: u32,
    pub request_id: String,
    pub profile: String,
    pub purpose: String,
    pub method: String,
    pub url: String,
    pub headers: Vec<(String, String)>,
    #[serde(deserialize_with = "nullable")]
    pub content_length: Option<u64>,
    #[serde(deserialize_with = "nullable")]
    pub proxy_url: Option<String>,
    pub http_protocol: String,
    pub shards: usize,
    pub idle_timeout_ms: u64,
    pub max_idle_connections: usize,
    pub max_idle_per_host: usize,
    #[serde(deserialize_with = "nullable")]
    pub ca_pem_b64: Option<String>,
    pub connect_timeout_ms: u64,
    pub header_timeout_ms: u64,
    pub total_timeout_ms: u64,
    pub max_request_bytes: u64,
    pub max_ws_message_bytes: u64,
}

#[derive(Clone, Debug, Serialize)]
pub struct TransportError {
    pub version: u32,
    pub code: &'static str,
    pub phase: &'static str,
    pub may_have_sent: bool,
    pub upstream_status: Option<u16>,
}
impl TransportError {
    pub fn local(code: &'static str) -> Self {
        Self {
            version: 1,
            code,
            phase: "local_connect",
            may_have_sent: false,
            upstream_status: None,
        }
    }
    pub fn sent(code: &'static str) -> Self {
        Self {
            version: 1,
            code,
            phase: "maybe_sent",
            may_have_sent: true,
            upstream_status: None,
        }
    }
}

pub struct Validated {
    pub meta: Metadata,
    pub url: reqwest::Url,
    pub method: Method,
    pub headers: HeaderMap,
    pub ca: Option<Vec<u8>>,
}

pub fn decode(headers: &HeaderMap, auth_endpoint: &str) -> Result<Validated, TransportError> {
    let invalid = || TransportError::local("invalid_metadata");
    if headers.get_all(META).iter().count() != 1 {
        return Err(invalid());
    }
    let encoded = headers.get(META).ok_or_else(invalid)?.as_bytes();
    if encoded.is_empty() || encoded.len() > 131072 {
        return Err(invalid());
    }
    let json = STANDARD.decode(encoded).map_err(|_| invalid())?;
    if json.is_empty() || json.len() > 98304 {
        return Err(invalid());
    }
    let meta: Metadata = serde_json::from_slice(&json).map_err(|_| invalid())?;
    validate_route(meta, auth_endpoint, false)
}

pub fn validate(meta: Metadata, auth_endpoint: &str) -> Result<Validated, TransportError> {
    validate_route(meta, auth_endpoint, false)
}

pub fn validate_route(
    meta: Metadata,
    auth_endpoint: &str,
    websocket: bool,
) -> Result<Validated, TransportError> {
    let invalid = || TransportError::local("invalid_metadata");
    let policy = || TransportError::local("unsupported_policy");
    let target = || TransportError::local("target");
    if meta.version != 1
        || meta.profile != PROFILE
        || meta.request_id.is_empty()
        || meta.request_id.len() > 64
        || !meta
            .request_id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
    {
        return Err(invalid());
    }
    if !matches!(meta.purpose.as_str(), "api" | "auth") {
        return Err(target());
    }
    if meta.url.len() > 8192 {
        return Err(target());
    }
    let url = reqwest::Url::parse(&meta.url).map_err(|_| target())?;
    if url.scheme() != if websocket { "wss" } else { "https" }
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
    {
        return Err(target());
    }
    let authority_and_path = meta.url.split_once("://").ok_or_else(target)?.1;
    let raw_tail = authority_and_path
        .find(['/', '?'])
        .map(|at| &authority_and_path[at..])
        .unwrap_or("");
    let expected_tail = if raw_tail.starts_with('/') {
        raw_tail.to_owned()
    } else {
        format!("/{raw_tail}")
    };
    if meta
        .url
        .bytes()
        .any(|b| b.is_ascii_whitespace() || b == b'\\')
        || url[url::Position::BeforePath..url::Position::AfterQuery] != expected_tail
    {
        return Err(target());
    }
    if meta.purpose == "auth" && meta.url != auth_endpoint {
        return Err(target());
    }
    let method = Method::from_bytes(meta.method.as_bytes()).map_err(|_| invalid())?;
    if websocket
        && (meta.purpose != "api" || method != Method::GET || meta.content_length != Some(0))
    {
        return Err(target());
    }
    if websocket && (meta.header_timeout_ms != 45000 || meta.total_timeout_ms != 0) {
        return Err(policy());
    }
    if method == Method::CONNECT {
        return Err(target());
    }
    if !matches!(meta.http_protocol.as_str(), "auto" | "http1")
        || !(1..=8).contains(&meta.shards)
        || (meta.http_protocol == "http1" && meta.shards != 1)
    {
        return Err(policy());
    }
    const MAX_MS: u64 = 9_223_372_036_854;
    if !(1..=300000).contains(&meta.connect_timeout_ms)
        || meta.header_timeout_ms > MAX_MS
        || meta.total_timeout_ms > MAX_MS
        || !(1..=MAX_MS).contains(&meta.idle_timeout_ms)
        || !(1..=8192).contains(&meta.max_idle_connections)
        || !(1..=8192).contains(&meta.max_idle_per_host)
        || !(1..=2147483647).contains(&meta.max_request_bytes)
        || !(1..=134217728).contains(&meta.max_ws_message_bytes)
    {
        return Err(policy());
    }
    if meta
        .content_length
        .is_some_and(|n| n > meta.max_request_bytes)
    {
        return Err(invalid());
    }
    if let Some(proxy) = &meta.proxy_url {
        if proxy.len() > 8192 {
            return Err(policy());
        }
        let proxy = reqwest::Url::parse(proxy).map_err(|_| policy())?;
        if !matches!(proxy.scheme(), "http" | "https" | "socks5" | "socks5h")
            || proxy.host_str().is_none()
            || proxy.fragment().is_some()
            || proxy.query().is_some()
            || !matches!(proxy.path(), "" | "/")
        {
            return Err(policy());
        }
    }
    let ca = match &meta.ca_pem_b64 {
        None => None,
        Some(encoded) => {
            if encoded.len() > 43692 {
                return Err(policy());
            }
            let bytes = STANDARD.decode(encoded).map_err(|_| policy())?;
            if bytes.is_empty() || bytes.len() > 32768 {
                return Err(policy());
            }
            Some(bytes)
        }
    };
    let mut headers = HeaderMap::new();
    if meta.headers.len() > 100 {
        return Err(invalid());
    }
    let mut aggregate = 0;
    for (name, value) in &meta.headers {
        if name.is_empty()
            || name.len() > 256
            || name.bytes().any(|b| b.is_ascii_uppercase())
            || value.len() > 10924
        {
            return Err(invalid());
        }
        let key = HeaderName::from_bytes(name.as_bytes()).map_err(|_| invalid())?;
        let bytes = STANDARD.decode(value).map_err(|_| invalid())?;
        aggregate += name.len() + bytes.len();
        if bytes.len() > 8192
            || aggregate > 12288
            || bytes.iter().any(|b| matches!(b, 0 | b'\r' | b'\n'))
        {
            return Err(invalid());
        }
        let val = HeaderValue::from_bytes(&bytes).map_err(|_| invalid())?;
        if key == http::header::HOST {
            let expected = &url[url::Position::BeforeHost..url::Position::AfterPort];
            if bytes != expected.as_bytes() {
                return Err(target());
            }
        }
        if key == http::header::CONTENT_LENGTH {
            let n = val
                .to_str()
                .ok()
                .and_then(|v| v.parse::<u64>().ok())
                .ok_or_else(invalid)?;
            if Some(n) != meta.content_length {
                return Err(invalid());
            }
        }
        headers.append(key, val);
    }
    strip_hop_headers(&mut headers);
    if websocket {
        strip_ws_headers(&mut headers);
    }
    headers.remove(http::header::HOST);
    Ok(Validated {
        meta,
        url,
        method,
        headers,
        ca,
    })
}

pub fn decode_ws(headers: &HeaderMap, auth_endpoint: &str) -> Result<Validated, TransportError> {
    let invalid = || TransportError::local("invalid_metadata");
    if headers.get_all(META).iter().count() != 1 {
        return Err(invalid());
    }
    let encoded = headers.get(META).ok_or_else(invalid)?.as_bytes();
    if encoded.is_empty() || encoded.len() > 131072 {
        return Err(invalid());
    }
    let json = STANDARD.decode(encoded).map_err(|_| invalid())?;
    if json.is_empty() || json.len() > 98304 {
        return Err(invalid());
    }
    validate_route(
        serde_json::from_slice(&json).map_err(|_| invalid())?,
        auth_endpoint,
        true,
    )
}
pub fn strip_ws_headers(headers: &mut HeaderMap) {
    for name in [
        "sec-websocket-key",
        "sec-websocket-accept",
        "sec-websocket-version",
        "sec-websocket-extensions",
    ] {
        headers.remove(name);
    }
}

pub fn strip_hop_headers(headers: &mut HeaderMap) {
    let named: HashSet<HeaderName> = headers
        .get_all(http::header::CONNECTION)
        .iter()
        .flat_map(|v| v.as_bytes().split(|b| *b == b','))
        .filter_map(|v| HeaderName::from_bytes(v.trim_ascii()).ok())
        .collect();
    let remove: Vec<_> = headers
        .keys()
        .filter(|name| name.as_str().starts_with("x-codex-transport-") || named.contains(*name))
        .cloned()
        .collect();
    for name in remove {
        headers.remove(name);
    }
    for name in [
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailer",
        "transfer-encoding",
        "upgrade",
        "content-length",
    ] {
        headers.remove(name);
    }
}

#[derive(Serialize)]
pub struct ResponseMetadata {
    pub version: u32,
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub content_length: Option<u64>,
    pub protocol: &'static str,
}

pub fn response_metadata(
    response: &reqwest::Response,
    head: bool,
) -> Result<(String, Option<u64>), TransportError> {
    let status = response.status().as_u16();
    let error = || TransportError {
        upstream_status: Some(status),
        ..TransportError::sent("upstream_io")
    };
    if !(200..=599).contains(&status) {
        return Err(error());
    }
    let length = match response.headers().get(http::header::CONTENT_LENGTH) {
        Some(value) => Some(
            value
                .to_str()
                .ok()
                .and_then(|s| s.parse().ok())
                .ok_or_else(error)?,
        ),
        None => None,
    };
    if status == 204 && length.is_some_and(|n| n != 0) {
        return Err(error());
    }
    let mut headers = response.headers().clone();
    let mut aggregate = 0;
    let mut pairs = Vec::new();
    for (name, value) in &headers {
        aggregate += name.as_str().len() + value.as_bytes().len();
        if pairs.len() >= 100
            || name.as_str().len() > 256
            || value.as_bytes().len() > 8192
            || aggregate > 12288
        {
            return Err(error());
        }
        pairs.push((name.as_str().to_owned(), STANDARD.encode(value.as_bytes())));
    }
    strip_hop_headers(&mut headers);
    pairs.retain(|(name, _)| headers.contains_key(name));
    let protocol = match response.version() {
        http::Version::HTTP_10 => "HTTP/1.0",
        http::Version::HTTP_11 => "HTTP/1.1",
        http::Version::HTTP_2 => "HTTP/2.0",
        _ => return Err(error()),
    };
    let bytes = serde_json::to_vec(&ResponseMetadata {
        version: 1,
        status,
        headers: pairs,
        content_length: if status == 204 { Some(0) } else { length },
        protocol,
    })
    .map_err(|_| error())?;
    if bytes.len() > 98304 {
        return Err(error());
    }
    let encoded = STANDARD.encode(bytes);
    if encoded.len() > 131072 {
        return Err(error());
    }
    Ok((
        encoded,
        if head || matches!(status, 204 | 304) {
            Some(0)
        } else {
            length
        },
    ))
}
