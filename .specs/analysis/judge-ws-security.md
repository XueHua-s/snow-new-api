# S06 independent WebSocket security panel

Date: 2026-10-14. Verdict: **PASS, 4.675/5**, limited to frozen Rust S06. No production source, tests, dependencies or credentials were changed by this reviewer. This does not accept S07 identity/session invalidation, S08 accounting, S09 official fingerprint/live compatibility or S10 deployment.

## Rubric

| Criterion | Weight | Score | Evidence |
| --- | --- | --- | --- |
| Upstream-first handshake and rejection status/body | .25 | 4.70 | `ws::websocket` verifies upstream handshake and response metadata before creating the local upgrade session. Rejection keeps status and at most 1024 body bytes, with capture/read/truncation bounds. No redirect or redial loop. Reviewed barrier, 401/307/503 and framing/deadline assertions. |
| Text/binary/fragments/control/close | .30 | 4.65 | Forwarding moves opaque messages; no JSON parsing, identity mutation or create replay. Fixed codec validates text/close/control frames; independent fragmented/deflate/invalid-text/1006 tests passed. Source and existing exact assertions preserve both close directions and hop-local pong. |
| Backpressure/limits/cancellation | .25 | 4.65 | One message send must finish before next directional read. RAII guards cover handshake and upgraded lifetime, owned by server connection task. Reviewed resource panel's independently executed blocked-send/full-readmission evidence. Independently ran codec pre-rejection allocation regression. |
| Fixed forks/features and actual WS proxy/certificate path | .20 | 4.70 | Exact revisions, audited small patches and locks verified. Independently ran actual WSS all-four-proxy/DNS/auth privacy and target/outer-proxy TLS negative cases. No ambient proxy, insecure verifier or fallback. |

Weighted result: .25*4.70 + .30*4.65 + .25*4.65 + .20*4.70 = **4.675**. All four criteria exceed 4.5. S06 applicable C02/C03 and transport portions of AC07/10/11 have no unresolved security hard-gate finding; this is not acceptance of later whole-system ACs.

## Independent execution

Linux ARM64 GNU container `codex-s03-build`, working directory `/tmp/codex-transport`, `ulimit -n 8192`. Coordinated with protocol reviewer to avoid concurrent matrices. Commands below ran with `cargo test --locked --test transport FILTER -- --nocapture`:

| FILTER | Observed result |
| --- | --- |
| `ws_tls_` | 1 passed, 49 filtered, 0.07s |
| `ws_proxy_` | 1 passed, 49 filtered, 0.19s |
| `ws_metadata_` | 1 passed, 49 filtered, 0.00s |
| `http_https_and_socks_proxies` | 1 passed, 49 filtered, 0.39s; loops HTTP and actual WSS through HTTP CONNECT, verified HTTPS CONNECT, SOCKS5 local DNS and SOCKS5h remote DNS |
| `ws_fragmented_` | 2 passed, 48 filtered, 0.11s |
| `ws_unoffered_` | 1 passed, 49 filtered, 0.04s |
| `required_metadata_types_duplicates_limits_and_secret_safe_errors` | 1 passed, 49 filtered, 0.00s |
| `request_header_boundaries` | 1 passed, 49 filtered, 0.09s |

All commands exited 0; no failed or ignored cases. Additionally `cargo test --locked --manifest-path vendor/tungstenite/Cargo.toml --features deflate codex_decompression_allocation_is_bounded_before_limit_rejection -- --nocapture` passed its one matching unit test (75 filtered). Other vendor executables matched zero tests and are not counted. Existing upstream unused-parentheses warning retained. These are focused independent reruns, not a claim that this reviewer reran the author's full 50+2 matrix.

All 13 named frozen source/contract/provenance hashes in `codex-transport-rust-ws.md` independently matched. Release artifact `/tmp/codex-transport-s06-linux-arm64` independently hashes to `d5c1c7dd9b727f0180cfa068641100e1c929c06aaddeef99892315dda8a5f522`.

## Security findings and boundaries

- Applicable guidance read: supplied project AGENTS security rules, cached OWASP Authentication/Session Management guidance, security control table and ASVS **5.0.0 V12**, especially 12.1.1/12.1.2 and 12.3.1/12.3.2. WSS uses rustls safe defaults and certificate verification; missing/wrong trust, hostname mismatch and expiry fail before the HTTP handshake. HTTPS proxy outer TLS is verified separately. These scoped observations are not whole-application ASVS compliance; UDS is a trusted same-host boundary, not mTLS.
- `wire::validate_route` rejects non-WSS targets, userinfo, fragments, normalized path changes and Auth-purpose WS before dial. Decoded header names/values are typed, CR/LF/NUL rejected, and internal/hop/WS negotiation headers removed before upstream construction. Raw obs-text patch writes only already validated header bytes; it does not allow line injection. Local subprotocol offers constrain metadata offers, and fixed client verifier checks selected upstream protocol/extensions.
- Transport errors contain fixed enum classifications and optional numeric status, never raw library error strings, target/query or proxy credentials. Production main emits only fixed configuration/socket error text and installs no dependency logger. Synthetic proxy sentinels do not enter returned errors or target authorization. Rejection payload is intentionally bounded private response metadata for the Go parser, not a log entry; its later public formatting remains a Go integration responsibility.
- Frame declared size is checked before payload reserve. Deflate remaining limit subtracts prior fragments; narrow patch caps output capacity requests at remaining+1 before decompression, with deterministic 63/64/65/65536 vectors. Compression has a separate finite output ceiling. This does not imply 2M is RSS: README/fixtures correctly distinguish application reservation, retained library buffers and allocator/kernel overhead.
- The bridge has no replay/reconnect path. Failed/invalid handshake cannot generate local 101. Message type/payload and two create payload assertions provide transport identity evidence; per-generation accounting and runtime credential invalidation remain S07/S08. Fixed codec validation prevents illegal close code1006 from being emitted as a normal close; abrupt EOF is not converted to1000.
- Resource review evidence was read and source lifetimes checked independently: both blocked directions, full reservation readmission, shared active cap, and process task ownership. This reviewer did not repeat the resource matrix or claim a full 128 MiB payload transport/RSS deployment measurement.

No blocking S06 security defect found. Do not mark all task ACs complete from this report.
