# Codex transport private protocol v1

Implemented private transport contract and deployment guide. Baseline: `baseline.json`, official Codex 0.162.1 Linux ARM64 musl; sidecar production target Linux ARM64 GNU/glibc. These are different libc/build targets. Rust owns upstream TLS/HTTP/WS; Go owns credentials, routing, conversion, retry decisions and all billing. Never parse or rewrite business JSON here.

## Endpoints and framing

Production listens only on an absolute Unix socket. Exactly three routes:

* `GET /v1/health`: 200 JSON capabilities below, no upstream traffic.
* `POST /v1/http`: streamed business request; original method is metadata.
* `GET /v1/ws`: local WebSocket upgrade, only after upstream WSS returned 101.

Other methods/paths return local 404/405 without dialing. Local HTTP/1.1 Host is `codex-transport`; no TCP fallback. One `X-Codex-Transport-Meta` header contains RFC4648 standard padded base64 of UTF-8 JSON. Duplicate metadata headers, unknown fields, duplicate JSON keys, wrong types, noninteger numbers, invalid base64 and version mismatch reject before dialing. Never forward any `X-Codex-Transport-*` header from either peer. Go constructs metadata from trusted configuration, never copies public client control headers.

Request JSON (all keys required; nullable values explicitly `null`):

```json
{"version":1,"request_id":"synthetic-1","profile":"0.162.1","purpose":"api","method":"POST","url":"https://chatgpt.com/backend-api/codex/responses","headers":[["content-type","YXBwbGljYXRpb24vanNvbg=="]],"content_length":null,"proxy_url":null,"http_protocol":"auto","shards":1,"idle_timeout_ms":90000,"max_idle_connections":500,"max_idle_per_host":100,"ca_pem_b64":null,"connect_timeout_ms":30000,"header_timeout_ms":60000,"total_timeout_ms":0,"max_request_bytes":134217728,"max_ws_message_bytes":134217728}
```

`purpose` is `api` or `auth`; `profile` is the fixed startup profile `0.162.1`. Invalid purpose-route/target combinations fail with target before any upstream dial. Auth is HTTP-only and its target is exactly the configured fixed OAuth token endpoint; it cannot select WS or arbitrary channel URLs. API covers Responses, model discovery and both WHAM/credits management paths. Purpose separates client policy/cache identity even when the same physical defaults apply.

`headers` is an ordered list of `[lowercase ASCII token name, base64 raw value bytes]`; duplicate names and individual values remain separate, including non-UTF8 obs-text. Preserve order among duplicate values; wire casing/global H2 ordering is not promised by Go http.Header. Reject CR/LF/NUL and invalid field names. Sensitive fields are not logged. `url` is an absolute https URL (wss on WS), no userinfo/fragment; preserve escaped path/query; reject before dialing any target whose escaped path/query changes during the fixed URL library parsing (including literal or percent-encoded dot segments), rather than silently normalizing its destination. Derive Host and SNI from target, reject user-supplied Host differing from it. `method` is an HTTP token; WS requires GET and no body (`content_length=0`). `content_length` is null for unknown or a nonnegative byte count; mismatch is failure, never successful EOF. HTTP empty body uses 0. Encoding metadata never buffers the business body. HTTP upload counts actual bytes, including unknown-length streams. If upstream returns an early final response (for example 401/413) before upload EOF, immediately cancel/close local upload and preserve the actual upstream response; that upstream-initiated interruption is not a source length-mismatch failure. Actual local source truncation/overrun is a transport failure; once any prefix was attempted may_have_sent=true. Body compression is not transformed; disable automatic response decompression and unsolicited Accept-Encoding so byte length and Content-Encoding remain consistent.

Strip Connection and every header it names, plus Keep-Alive, Proxy-Authenticate, Proxy-Authorization, TE, Trailer, Transfer-Encoding, Upgrade, local metadata and Content-Length on both directions before framing. Original Content-Length is validated against metadata; HTTP client owns framing. When metadata content_length is known, set upstream Content-Length from that checked value, including zero, while streaming and verifying actual bytes. Unknown length uses normal HTTP/1 chunked or HTTP/2 stream framing without a fabricated length. For WS additionally strip Sec-WebSocket-Key, Sec-WebSocket-Accept, Sec-WebSocket-Version and Sec-WebSocket-Extensions from caller metadata; each hop creates its own handshake and compression negotiation. Explicit subprotocol offers use `sec-websocket-protocol` header values and the negotiated subprotocol must be offered on the local hop. Never copy upgrade response headers wholesale.

## Response and failure contract

HTTP upstream status (including 3xx, 4xx and 5xx) returns **local 200**, with exactly one `X-Codex-Transport-Response` header containing base64 JSON:

```json
{"version":1,"status":200,"headers":[["content-type","dGV4dC9ldmVudC1zdHJlYW0="]],"content_length":null,"protocol":"HTTP/2.0"}
```

Status is 200..599 (101 only for successful WS); protocol is HTTP/1.0, HTTP/1.1 or HTTP/2.0. Ignore informational upstream responses except WS 101; unsupported HTTP upgrade fails. Response body is upstream bytes streamed with bounded chunks and backpressure. Local HTTP body always uses chunked framing, never upstream Content-Length. Declare local trailer `X-Codex-Transport-Complete`; only clean upstream EOF after length validation sets its value to `1`. Go's Body wrapper translates missing/invalid completion trailer or local chunk truncation into non-EOF read error, even if local HTTP parsing otherwise reports EOF. After headers, Rust must abort the local body/connection on upstream read failure; it cannot replace the status with JSON error. Go consumes the completion marker internally, reconstructs standard http.Response including Status, StatusCode, Header, ContentLength, ProtoMajor/Minor, Request and streaming Body; upstream trailers are not supported in v1 and are not advertised. No metadata is exposed in business headers. HEAD/204/304 still require local empty chunked body and completion marker; no local HEAD shortcut. For HEAD and 304, an upstream Content-Length describes a selected representation, not transferred bytes: preserve it in reconstructed response ContentLength but validate the body against zero, not that value. For 204, no payload is allowed and reconstructed ContentLength is zero; reject conflicting nonzero framing rather than waiting for bytes. Ordinary body-bearing responses validate their declared transferred length.

Before upstream headers, local 502 plus `X-Codex-Transport-Error` (base64 JSON) and empty body:

```json
{"version":1,"code":"tls","phase":"upstream_connect","may_have_sent":false,"upstream_status":null}
```

Codes: `invalid_metadata`, `unsupported_policy`, `target`, `proxy`, `connect`, `tls`, `timeout`, `cancelled`, `upstream_io`, `capacity`, `internal`. Phases: `local_connect` (including local validation), `upstream_connect`, `maybe_sent` (sending or waiting for headers), `headers_received`, `body_truncated`. Wire error also has required `upstream_status`: null before a status is known, otherwise integer actual status; typed Go error contains UpstreamStatus *int. Body errors carry known status locally even when no new header can be sent. Set may_have_sent=true from first attempted write of any upstream HTTP request bytes (including WS handshake); uncertain outcomes are true. Local validation/capability failures have false. No raw error text, URL, headers or payload. Go http.Client.Do wraps errors in url.Error containing the target URL: diagnostics and external business error text MUST use errors.As and only safe Code/Phase/MayHaveSent/status fields, never format the outer url.Error, proxy URL, WS close reason or rejection body. Sentinel tests include target query and proxy userinfo. Go returns typed `CodexTransportError{Code,Phase string; MayHaveSent bool}`; local IPC failure with unprovable send phase is true. Malformed/missing response/error metadata is a transport error, not an upstream status. Cancellation closes upload, local response and upstream task; partial output is never a clean completion or refund signal. Sidecar crash follows the same rule.

For WS rejection, local non-upgrade 200 has empty body and response metadata carrying actual status/headers plus `rejection_body_b64` (first <=1024 raw bytes), `rejection_truncated` (boolean) and `rejection_read_error` (boolean). Read at most 1025 upstream bytes to detect truncation, then close upstream body; read failure sets the flag. Rejection capture has a separate maximum of 1000 ms from receipt of rejection headers, bounded further by the remaining original 45-second handshake deadline. Capture expiry preserves the status and prefix with rejection_read_error=true if the caller/local handshake deadline still permits delivery. Caller cancellation or the local handshake deadline takes precedence: Go may then return a sanitized timeout/cancellation error without a reconstructed response. Never restart the handshake deadline, redial to recover the status, or wait indefinitely for a rejection body. The local rejection response explicitly has Content-Length: 0 so Gorilla does not wait for a diagnostic body on the socket. This is deliberately a bounded diagnostic body, not a streamed complete rejection. Gorilla v1.5.3 client.go limits failed-handshake body reads to 1024 bytes and closes the socket: put the bounded payload in metadata so its helper does not destroy it. Go reconstructs Body from decoded diagnostic bytes, ContentLength=-1, and typed `CodexWSHandshakeError` wrapping websocket.ErrBadHandshake exposes Truncated/ReadError flags; it returns `(nil, reconstructedResponse, error)` without any second handshake or upstream request. These local flags never become external upstream headers. For success local 101 includes response metadata (actual upstream 101); Go returns gorilla Conn only after checking it. No internal error header can masquerade as an upstream 502.

## Policy, security and resource limits

Go resolves effective proxy per target: explicit normalized channel proxy wins; otherwise evaluate Go environment proxy/NO_PROXY once and send resulting URL or null (direct). Rust disables ambient proxy lookup. Support HTTP CONNECT, HTTPS proxy (verified outer TLS then CONNECT then target TLS), socks5 (local target DNS), socks5h (proxy target DNS), including proxy credentials solely in proxy authentication. Never forward them to target. Resolve proxy DNS locally. Unsupported configured combination must fail explicitly before sending, never direct fallback. Go retains operator-managed channel target semantics (private deployment targets permitted); arbitrary public request URLs cannot enter this API. OAuth uses its fixed https token endpoint. Do not introduce a DNS allowlist incompatible with private channel deployments; if a target policy requires IP filtering, enforce it at resolution/dial, not only preflight, and reject remote-DNS proxy modes that cannot enforce it.

`http_protocol`: auto or http1; shards integer 1..8, http1 requires 1. HTTP default native-tls; explicit PEM trust selects rustls with native roots plus supplied CA; WS rustls. Verify certificates, name and validity for both target and HTTPS proxy. Insecure-skip-verify (global or channel) is explicitly unsupported in enabled Codex transport, returning configuration error; never silently ignore it. Policy overrides are reported as overrides, not official equivalence. No cookie jar. Pool key includes purpose, effective timeouts/idle limits, origin, full effective proxy (hashed for diagnostics), profile, protocol, shards and CA digest; credentials are per request, not defaults or pool keys. Idle pools are bounded and evicted; active work is never evicted to allow a retry. WS connections are never shared; Go binds each to account, credential generation and logical session.

Health JSON: `{"version":1,"profile":"0.162.1","platform":"linux-arm64","target":"aarch64-unknown-linux-gnu","production":true,"purposes":["api","auth"],"routes":["http","ws"],"proxy_schemes":["http","https","socks5","socks5h"],"http_protocols":["auto","http1"],"tls_insecure":false,"limits":{...}}`. Advertise only implemented/tested capabilities; missing required feature fails startup/configuration. Other platforms may run synthetic tests but report production=false; Go production activation refuses them. Health `limits` is exactly the key-to-`{min,max}` map in fixtures/contracts.json `health_limits`, derived from its boundary entries; it describes supported ranges/caps, not current configured policy. Fixed process caps are active_exchanges, idle_policy_pools and ws_reserved_payload_bytes maxima; request policy fields must fit their advertised ranges. Health contains no secrets. Plain http/ws upstreams are allowed only in explicitly isolated synthetic test builds/harnesses, never by request metadata or production environment flag.

Limits are inclusive and checked before allocation; `fixtures/contracts.json` contains required below/equal/above vectors. Request metadata encoded bytes 131072 and decoded JSON bytes 98304; response metadata independently encoded bytes 131072 and decoded JSON bytes 98304; error metadata encoded bytes 2048 and decoded JSON bytes 1536. Response header admission fits the fixed client receive defaults: 100 raw fields and at most 12288 name/value bytes, plus 32 HTTP/2 accounting bytes per field and 42 bytes for :status, total at most 15530 below the advertised 16384-byte response header-list limit. Count raw response headers before stripping hop fields. This receive limit does not bound outgoing request pseudo-headers such as :path; the upstream peer may reject requests under its own advertised limits, which remains a sanitized no-replay error. Do not increase HTTP/2 SETTINGS or parser defaults to accept larger headers; this is an explicit enabled-mode compatibility limit. All aggregate limits apply in addition to individual limits: maximum-sized fields need not all fit simultaneously. Request metadata overflow fails before dial; upstream header/response metadata overflow is an upstream_io transport error before local response headers, phase=maybe_sent and may_have_sent=true; after headers abort body. Error metadata is fixed enum fields only, serialization overflow uses a fixed internal error, never raw text. Local HTTP header parser budget is 262144 bytes including WS handshake headers. CA PEM decoded bytes <=32768. WS rejection capture <=1024 bytes; target/proxy URL UTF-8 bytes 8192 each; request ID 1..64 ASCII `[A-Za-z0-9_-]`; headers at most 100 pairs, name 256 bytes, value 8192 decoded bytes, aggregate name+value bytes 12288. Connect timeout 1..300000 ms; header timeout and total timeout 0..9223372036854 ms (Go time.Duration safe millisecond ceiling); 0 disables that timeout. Go channel header override is 1..3600000 ms; zero channel override resolves the actual base transport value before serialization (including inherited http.DefaultTransport settings). A positive header timeout starts once the request body has been fully validated and handed to the HTTP library, not when the socket finishes flushing it (an early upstream response is forwarded immediately). This is an explicit profile difference from Go ResponseHeaderTimeout: queued final body bytes may still be blocked by upstream flow control or socket writes when the timer runs, so a slow final upload can time out sooner. Default zero disables this timer and is unaffected. A producer that has not finished supplying the body must not start the timer. Context and total timeouts remain independent; connect includes DNS/proxy/TLS; HTTP total begins before UDS call and spans complete body when nonzero. WS MUST serialize total_timeout_ms=0: RELAY_TIMEOUT is not a session lifetime deadline. WS handshake alone uses header_timeout_ms=45000 (the existing gorilla DefaultDialer HandshakeTimeout); existing Go STREAMING_TIMEOUT (fallback 300 seconds) remains per-generation idle handling, and its 30-second write deadlines remain Go-owned. Sidecar applies no new WS idle/lifetime timeout. Request context may expire sooner. HTTP body limit 1..2147483647 bytes and WS message limit 1..134217728 bytes, derived from existing configured MAX_REQUEST_BODY_MB (default 128 MiB); reject unsafe conversion/oversized config rather than silently clamp to 1 MiB. Enforce WS limit on decompressed complete message, including fragments. No total HTTP response cap (SSE may be long); each logical forwarded slice is <=65536 bytes. Each HTTP direction uses pull-based forwarding with no application channel queue; each logical slice handed to the next HTTP body is <=65536 bytes. If a queue is added later, at most one queued logical chunk and 65536 queued payload bytes are permitted. These logical lengths are not a claim about retained backing allocations or RSS: a `Bytes` slice can retain the larger bounded buffer allocated by the HTTP library. Backpressure stops polling the next source frame; cancellation drops the outstanding frame and upstream body. Protocol/TLS buffers remain separately bounded, as detailed below; no response is accumulated in full. WS pending queue <=1 complete message per direction plus one control frame and <=134217728 payload bytes per direction, control payload <=125 bytes. Reserve twice the configured max_ws_message_bytes from a process-wide 536870912-byte WS payload budget before admission; exhausted budget rejects before dialing (zero upstream attempts). Release reservation on all termination paths; thus message assembly/queue memory is bounded even with compressed/fragmented input. No second full-message clone is made by the sidecar application; backpressure pauses reads until the previous peer send finishes. The 2M reservation is application message-payload admission, not a process RSS ceiling. The pinned WS codec may retain frame backing, fragment assembly, compression output and encoded write buffers. Same-direction operation temporaries in receive, compression, serialization and blocked-flush phases are mutually exclusive; opposite directions and historical retained capacities can coexist. Frame and encoded-write limits are F=2M+65536; decompression requested/output Vec capacity is bounded by remaining-message-limit+1, and compression requested/output Vec capacity by 2*input-length+65536. These are explicit library bounds, not allocator/RSS guarantees. TLS, zlib contexts, allocator and kernel storage are additional. Deployment memory requirements must not be inferred by summing mutually exclusive phase maxima. Deployment caps: 256 active exchanges and 128 idle policy pools. These caps include HTTP and WS in-flight exchanges; WS memory admission may reject before the count cap. Per-policy connection idle timeout and idle connection counts come from effective metadata, with max_idle_connections and max_idle_per_host in 1..8192 and idle_timeout_ms in 1..9223372036854; pool registry entries expire once empty. Default 90s comes from RELAY_IDLE_CONN_TIMEOUT, not a new fixed transport timeout; saturation rejects before send and never unbounded queueing. Configuration exceeding advertised caps fails before activation.

The fixed dependency sources define the separate library buffer limits: Hyper 1.8.1 `src/proto/h1/io.rs` uses an upstream H1 buffer threshold of `8192 + 4096 * 100 = 417792` bytes and at most 16 queued buffer entries; the local H1 parser uses 262144 bytes to admit the metadata header. A threshold checked before an append can be exceeded by the final bounded input slice; allocator capacity, TLS records and kernel socket buffers are additional and must not be reported as an exact 64 KiB memory cap. Hyper 1.8.1 `src/proto/h2/client.rs` defaults are a 2 MiB stream receive window, 5 MiB connection receive window, 16 KiB frame size, 1 MiB send-buffer threshold and 16 KiB header-list limit; adaptive window is disabled. Rustls 0.23.45 `src/common_state.rs` sets its TLS send buffer default to 64 KiB; native TLS retains the vendored OpenSSL record/handshake bounds. These baseline library settings are not enlarged to fit metadata. The application count caps (256 exchanges, 128 policy pools) bound simultaneous instances. `blocked_consumer_stops_h2_source_and_cancellation_releases_it` observes an actual H2 send-capacity `Pending` while the downstream body is held, verifies the finite hypothetical response was not fully accumulated, then proves cancellation releases the upstream producer. This is a backpressure assertion, not an RSS measurement or a claim that kernel/allocator storage equals slice length.

UDS parent directory owner is configured service UID, mode 0700 (same UID) or 0750 (authorized shared GID); socket mode 0600/0660 respectively. Validate owner/GID/mode and reject symlink/non-socket endpoints or world permissions. Create with restrictive umask; refuse occupied live socket; stale cleanup only if verified owned socket and connect yields connection-refused. Shutdown unlinks only the inode created by this process. Compose shares this directory solely with Go and sidecar, publishes no sidecar port, and sets explicit UID/GID. UDS trusts same UID/root; it is not mTLS.

## WebSocket lifetime and replay

Go retains SHA256 fingerprints of at most1024 admitted response IDs for each
business WebSocket session, without evicting earlier history. A generation's
first accepted ID cannot be rebound; events belonging to historical IDs never
enter later usage accounting. On reaching the history cap, Go settles and
publishes the current terminal event, then closes normally and requires a fresh
client connection; it never replays a create. Valid terminal-before-created
responses remain supported. If a terminal cannot be associated with a response
ID, Go settles that generation and closes to prevent ambiguity across later
generations. This bounded Go correlation history is a compatibility limit, not
a new sidecar idle or lifetime timeout.


Messages retain type and payload across fragments; frame boundaries may differ. Text UTF-8 and RFC6455 close-code validity enforced. Forward valid close code/reason (reason <=123 UTF-8 bytes), echo orderly close and terminate both sides within 5 seconds. Abnormal EOF closes peer without manufacturing normal 1000; report abnormal 1006 locally, never emit forbidden 1006 on wire. Each hop answers ping with matching pong; ping/pong are hop-local and not business events, no duplicate pong forwarding. A slow consumer applies bounded backpressure; cancellation interrupts blocked reads/writes. Compression is hop-local; never copy RSV bits. Tests cover fragmented compressed messages and decompression limits. Go's existing session code retains account/credential/channel invalidation and per-response.create accounting.

Rust redirect count=0; Go Codex http.Client CheckRedirect returns http.ErrUseLastResponse (count=0). Retry counts: Rust request replay=0 (including library protocol retries), Go local transport replay=0 (nonreplayable local body/GetBody=nil, no Idempotency-Key triggers), business automatic replay/switch after any may_have_sent=true failure=0. Pre-send transport failure also has business automatic retry count=0 and upstream attempts=0. Every typed sidecar transport error receives ErrOptionWithSkipRetry after errors.As through url.Error; no sidecar-to-Go-direct fallback. Upstream 503 is one actual attempt and delivered unchanged. Tests count listeners on redirects, refused/reused sockets, GOAWAY/REFUSED_STREAM, timeouts and half-close; library defaults are not proof of zero retries. Verified dependency source shows reqwest 0.12.28 retry(never()) disables its tower retry but does not expose hyper-util 0.1.20 legacy builder.retry_canceled_requests(false); hyper-util defaults true and retries cancelled/unstarted checkout requests. Implementation must disable that exact internal path, using a minimal pinned auditable dependency patch if required, and record the baseline deviation. Non-cloneable request bodies do not prove this path disabled. Listener/connection-attempt counters must cover it as well as HTTP request counters.

## Go integration surface

Implement in service; signatures are fixed for independent work:

```go
type CodexTransportPurpose string // constants CodexTransportAPI="api", CodexTransportAuth="auth"
type CodexTransportOptions struct {
    ProxyURL string
    Settings dto.ChannelSettings
    Purpose CodexTransportPurpose
}
func GetCodexHTTPClient(options CodexTransportOptions) (*http.Client, error)
func DialCodexWebSocket(ctx context.Context, targetURL string, headers http.Header, options CodexTransportOptions) (*websocket.Conn, *http.Response, error)
```

Enabled/socket/profile/trust CA are startup configuration, not request options. `CodexTransportGeneration() uint64` exposes the immutable startup snapshot generation for existing WS binding checks; configuration changes require restart. The service adapter centrally resolves all effective fields, once per request target. Call sites pass their existing channel settings (or empty/default settings where the existing management path uses defaults), proxy and purpose only. They must not independently resolve globals or construct metadata. Disabled API delegates to existing GetHttpClientWithProxySettings. Disabled Codex Auth retains the existing copied Go client and 20-second timeout, but deliberately applies the OAuth security fixes even with the sidecar off: authorization-code exchange and token refresh never follow redirects and reject global/effective insecure TLS (or an unverifiable transport type) before sending. Turning off the sidecar does not restore the former permissive Auth redirect/insecure behavior or bypass the new identity/session/step-up controls. This is an explicit default-off compatibility exception for Codex Auth; the shared legacy Claude helper is unchanged. Enabled failures never fall back. Root JSON uses common wrappers. Sidecar has no OAuth refresh API, database, usage parsing, generation retry, or billing dependency.

Effective resolver evidence and precedence (verified in both the source worktree and /tmp/new-api-codex-plan-pr; target main lacks the source tree global header-timeout addition, so never assume that symbol exists):

Source references: service/http_client.go, service/http_transport_policy.go, service/http_transport_sharded.go, service/codex_oauth.go, common/init.go and relay/responses_websocket.go.

| Wire field | Resolution |
| --- | --- |
| purpose/profile | Required API/Auth enum; immutable configured 0.162.1 profile; Auth fixed endpoint and strict certificate verification |
| http_protocol/shards | NormalizeHTTPTransportPolicy(Settings): auto default; shards 0 becomes 1, >8 clamps to 8, http1 becomes 1; serialize only normalized values |
| header_timeout_ms HTTP | Positive normalized channel ResponseHeaderTimeoutSeconds overrides the ResponseHeaderTimeout of newRelayHTTPTransport(); zero channel inherits that effective base snapshot. Target main clones http.DefaultTransport, normally zero; source worktree additionally applies common.RelayResponseHeaderTimeout default 1800s. The resolver must reuse the actual target-tree constructor, not invent either default; effective base zero disables |
| total_timeout_ms HTTP | API common.RelayTimeout (default 0 disabled); Auth fixed existing 20s; reject negative/overflow configuration rather than wrap |
| connect_timeout_ms | Existing newRelayHTTPTransport/default net dialer uses 30s; use 30000; combined DNS/proxy/TLS bound is an explicit bounded transport policy |
| WS timeouts | total=0; handshake header=45000; context cancellation and existing session idle/write rules preserved |
| idle_timeout_ms | common.RelayIdleConnTimeout (default 90s), converted with overflow check; <=0 unbounded legacy setting is explicitly unsupported by enabled bounded sidecar |
| max_idle_connections | common.RelayMaxIdleConns (default 500); <=0 unlimited legacy setting or >8192 explicitly unsupported |
| max_idle_per_host | common.RelayMaxIdleConnsPerHost (default 100); <=0 resolves Go standard DefaultMaxIdleConnsPerHost=2; >8192 unsupported; cap is per origin across shards; max_idle_connections applies across pools separately from the 128 idle-policy-registry-entry cap |
| max_request_bytes/max_ws_message_bytes | Existing MAX_REQUEST_BODY_MB default 128 times 1048576 with checked arithmetic; WS existing fallback for <=0 is 128 MiB; enabled invalid/out-of-range HTTP configuration explicitly rejected |
| proxy_url | Existing ParseProxyURLRuntime/normalization for explicit proxy; otherwise Go proxy environment evaluation for request target; map wss to https for lookup; null means direct |
| CA/insecure | Startup CA bytes or null, validated before activation; reject global common.TLSInsecureSkipVerify or InsecureSkipVerify on the effective base transport TLS config for both purposes. Actual target main has no channel TLSInsecureSkipVerify field; do not invent one. The newer source worktree has that channel field and would additionally combine it if integrated later (never assume it exists on HTTPTransportPolicy) |

Rust validates the resulting effective fields again. Resource caps are explicit compatibility rejections, never silent reductions. Changes to effective policy/CA/proxy produce a new pool key and WS binding snapshot; idle cleanup alone does not invalidate authenticated WS. User cancellation and process shutdown close active tasks, existing Go session/accounting handles termination; no replay on restart. An explicit existing business refresh after a received upstream 401/403 remains distinct from a transport retry and preserves the original operation ID/body.

RoundTripper closes the request Body on every terminal path, including local validation and capability failure. Closing the returned response Body cancels local and upstream work without draining an unbounded stream. The WS caller must not close a reconstructed rejection Body before its existing bounded error parser consumes it; external error formatting uses the sanitized transport classification.

## Operations (optional Linux ARM64 deployment)

The ordinary `docker-compose.yml` stays independent of this sidecar and the Go
switch defaults to false. Opt in explicitly from this checkout:

```sh
# Existing bind-mounted data/log directories must be writable by this service UID.
install -d data logs
sudo chown 10001:10001 data logs
docker compose -f docker-compose.yml -f docker-compose.codex-transport.yml config --quiet
docker compose -f docker-compose.yml -f docker-compose.codex-transport.yml build new-api codex-transport
docker compose -f docker-compose.yml -f docker-compose.codex-transport.yml up -d
```

The override builds **both current application code and the sidecar**; do not use
an older `latest` application image that lacks the adapter. This example inherits
the base database/cache settings: replace its example passwords before production.
Do not run acceptance tests against an existing deployment or its data volumes.
Both processes use UID/GID 10001. A one-shot initializer provisions only the named
socket directory, mode 0700, then exits; the socket is 0600. The Go mount is
read-only. The sidecar publishes no TCP port and has a read-only root filesystem,
no capabilities, and no privilege escalation. Do not expose the socket volume to
untrusted containers. Shared-GID deployments must deliberately provision 0750 and
preserve the contract's ownership checks; this sample uses the simpler same-UID
mode.

The image pins Rust 1.91.1 and Debian bookworm by digest, enforces ARM64 GNU, and
builds with Cargo.lock. The official release overrides its locked openssl-src 3.6.3
with static OpenSSL 3.6.4; `scripts/build-openssl.sh` reproduces that exact
SHA256-checked source and Configure features with a GNU compiler. Source this
script before Linux ARM64 cargo builds; `build.rs` rejects another OpenSSL
version or missing static/no-vendor overrides. Cargo feature graphs are not
identical: sidecar SOCKS support and vendored selection are explicit extensions.
The official static musl executable and GNU sidecar still require separate wire
comparison; matching TLS versions is not binary or protocol equivalence. `RUST_IMAGE` / `RUNTIME_IMAGE` build arguments allow a mirror
of the **same digest**, not a different baseline. The root `.dockerignore` excludes
local experiments, captures, keys, environment files, Rust targets and task
scratchpads; lockfiles, vendored source and licenses remain build inputs. Never
supply OAuth secrets as build arguments or bake them into images. Custom trust
must be mounted read-only and configured through the existing Go CA setting,
not by disabling verification.

For the container-only smoke check after building:

```sh
bash tools/codex-transport/scripts/test-container.sh
```

This checks production image health, same-UID permissions, no published port,
configured `nofile=2048`, SIGTERM socket cleanup and restart. It does **not** prove
that 2048 descriptors suffice under maximum load or that long streams, WebSocket
memory, accounting and live calls have passed. These require the final S10
application acceptance matrix. In particular the application WS reservation is
not an RSS limit: library frame/compression/TLS and kernel buffers also consume
memory. Size deployment resources from measured concurrent workload after the
WS resource gate; this example does not impose a speculative memory limit.

CI has one Linux ARM64 transport job. Its entry point is
`scripts/test-http.sh`, including the exact vendored stale-checkout no-replay
regression; it then runs `scripts/test-go-rust.sh`, builds the production image
and validates Compose. The standalone vendor tests use their own committed
`Cargo.lock` files; the sidecar lock does not lock those separate Cargo roots.
Keep the `hyper-util` regression's hyper/h2/tokio versions aligned with the
sidecar lock, and retain the vendor `.gitignore` exceptions when updating sources.
The Go runner compiles service/controller test binaries,
requires an existing absolute `CODEX_TRANSPORT_TEST_BINARY`, and copies only
those binaries plus the synthetic contract into a network-disabled Linux
container. It fails on skipped or zero-matching integration tests. To repeat it
locally, set that variable to the built Linux ARM64 sidecar executable and run
`bash tools/codex-transport/scripts/test-go-rust.sh` (Go and Docker required). The test
harness uses `nofile=8192` because it owns both ends of local and upstream fixture
connections. A local successful build is not evidence that remote CI ran.

Roll out with a small explicit Codex cohort after all acceptance gates pass.
Health only reports implemented capabilities; a profile/platform/capability
mismatch must fail Go activation before upstream generation. Configuration is a
startup snapshot: changing environment variables requires restarting Go.
For rollback, first stop admitting new calls, allow active generations to finish
under the existing application shutdown/accounting policy (or close and settle
them), then restart Go with `CODEX_TRANSPORT_ENABLED=false`. Verify subsequent
requests use the legacy path before stopping the sidecar. Never replay an
interrupted or unknown-send request. Removing the optional override alone also
changes the application image selection, so retain the tested application image
when disabling the switch. Sidecar `stop_grace_period=45s` is a process-stop bound,
not a guarantee that all arbitrary-length generations drain within 45 seconds.
Upgrade the fixed CLI/profile/dependencies only after rebuilding the feature
graph and repeating synthetic TLS/H2/WS baseline captures and all affected gates.

For actual application lifecycle acceptance, first build the current application
and calibrated sidecar images, then run the isolated synthetic fixture:

```sh
CODEX_DEPLOY_APP_IMAGE=new-api-codex:local \
CODEX_DEPLOY_SIDECAR_IMAGE=codex-transport:local \
python3 tools/codex-transport/scripts/test-deployment.py
```

It requires Python3, OpenSSL and Docker, uses disposable named volumes and a
loopback-published application port, and never uses an existing database or live
account. Its upstream fixture uses an ephemeral CA and server key; only the public
CA enters containers. Docker Desktop/Colima resolves `host.docker.internal`; on
native Linux the runner adds Docker's `host-gateway` mapping. The script checks
actual256-exchange admission,257th zero-send refusal, cancellation/readmission,
FD/RSS observations and pooled idle expiry, then full HTTP/WS accounting across
application and sidecar lifecycle changes. A failing assertion is an acceptance
blocker, including graceful-deadline accounting; successful lightweight health
checks do not supersede it. This workload's RSS is not a worst-case WebSocket
memory sizing guarantee.

If the default public Go module proxy is unreachable during the application
image build, the root Dockerfile accepts `--build-arg GOPROXY=<trusted proxy>,direct`.
Its default remains `https://proxy.golang.org,direct`; lockfiles and Go checksum
verification remain enabled.

The optional Compose application service sets `stop_grace_period: 150s` to cover
Go's default120-second graceful shutdown, up to10seconds for forced handler
settlement and up to10seconds for final batched quota flush, with margin before
Docker sends SIGKILL. If you increase
`SHUTDOWN_TIMEOUT_SECONDS`, increase the container grace beyond that value plus
20seconds and an operational margin. Compose's `new-api` → `codex-transport`
dependency starts the healthy sidecar first and stops the application first;
keep this dependency when adapting the override. Do not stop the sidecar while
expecting application generations to drain normally. The deployment runner now
uses the delivered120/150/45-second application/container/sidecar settings,
asserts the normalized Compose configuration and container StopTimeout, and
executes the forced-deadline case with plain `docker stop` (no shorter override).

The deployment acceptance runner retains the full unbatched lifecycle cases and
also exercises the base Compose's `BATCH_UPDATE_ENABLED=true`. It sets a3600-second
batch interval in that fixture to prove successful exit flushes completed and
forced-deadline relay accounting before the periodic tick; persisted wallet,
token, user/channel counters and consume logs must all agree. This fixture does
not claim durability after an ungraceful SIGKILL or unrelated background-task
crash recovery.

To verify the delivered Compose topology itself (rather than only direct
container lifecycle), run `python3 tools/codex-transport/scripts/test-compose.py`
with the same application/sidecar image variables. It layers a temporary isolated
acceptance override on the actual base and optional Compose files, starts real
PostgreSQL and Redis, keeps the inherited DSN/cache wiring and batching enabled,
then checks HTTP/SSE and WS accounting and app-before-sidecar stop order. It uses
already available images; `CODEX_DEPLOY_POSTGRES_IMAGE` and
`CODEX_DEPLOY_REDIS_IMAGE` select pinned test images. All project containers and
volumes are removed afterward; no existing project is adopted.
