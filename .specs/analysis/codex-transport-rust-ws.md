# S06 Rust WebSocket implementation evidence

Date: 2026-10-14. Author report, not an independent gate verdict. Implementation tree `/tmp/new-api-codex-plan-pr`. No real account credentials, requests, database or billing behavior are involved in this slice. No commits/pushes by this worker.

## Implementation

`src/ws.rs` terminates separate upstream WSS/rustls and local UDS WebSocket hops. `wire::decode_ws` strictly validates GET, API purpose, wss target, content_length=0, total_timeout=0 and handshake header_timeout=45000; same frozen metadata/header/URL/policy bounds as HTTP. Local upgrade, metadata, offers, active-exchange and 2M payload-budget admission are checked before network dialing. Explicit proxy is the sole proxy input; ambient environment is never consulted. HTTP/HTTPS CONNECT and SOCKS5 local/SOCKS5h remote DNS have synthetic actual-wire checks. Target and HTTPS-proxy TLS trust, hostname and expiry are verified. No cookie state, shared WS connection, redirect, reconnect or business parsing exists.

The 45-second original handshake deadline spans connect and upgrade; connect subdeadline spans DNS/proxy/TLS. No session lifetime/idle deadline is added. A header-boundary reader buffers at most 16384 upstream header bytes plus coalesced bytes within that same allocation, skips informational status except101 and presents exactly final headers to the fixed handshake verifier. This prevents the library from destroying a rejection stream or losing a coalesced first frame. On rejection the retained socket captures at most1025 body bytes using Content-Length/chunked/EOF framing, keeps first1024 and truncation/read-error flags, with a separate one-second bound further limited by the original deadline. Local rejection is200 with Content-Length0 and metadata carrying true status. Successful upstream101/extension/subprotocol validation precedes local101. Invalid response headers or extensions return sanitized typed error with known status where available.

The local HTTP server enables upgrade-capable Hyper connections; non101 replies still explicitly close the single-exchange UDS connection. Sessions remain owned by that server connection task, so process shutdown aborts them. A duplicated local descriptor observes read-closed readiness while upgraded; it never consumes bytes and interrupts blocked sends on caller cancellation. Duplicate descriptor is an explicit bounded per-local-connection resource (local cap512).

Messages move without sidecar application clones between two concurrent directional pumps. Complete messages retain type and bytes; fragment frame boundaries may change. Per-hop deflate negotiates independently. Ping/pong stay local and are not duplicated. Valid close code/reason cross to the other hop, same-hop echo is flushed, and overall close is bounded by five seconds. Invalid text/forbidden close is terminated according to the fixed codec; abnormal EOF drops the peer rather than manufacturing1000 or emitting1006. Global256 exchange capacity is shared with HTTP; process WS application payload reservation536870912 is acquired before dial and fully released on all terminal paths.

## Controlled fixed-fork patches

`vendor/websocket-provenance.json` identifies the exact upstream repositories/revisions and patch hashes. Original licenses are retained. Cargo.toml retains exact git/rev dependencies and explicitly patches them to the audited vendor directories; no moving branch/latest dependency.

- tungstenite `4fffad30fe373adbdcffab9545e9e9bf4f2fc19f`: raw validated outgoing header values use bytes instead of `to_str`, preserving required obs-text; public server-response/negotiated-extension bridge delegates to existing offer parsing/acceptance, without implementing a new RFC7692 algorithm; compression output requested Vec capacity bounded by2*input+65536; decompression geometric growth bounded by remaining-message-limit+1, replacing input-proportional preallocation before the old late size check. The cfg(test)-only peak observation confirms even a65536-byte compressible payload with configured64-byte limit never requests more than65 bytes before rejection, while63/64 remain valid.
- tokio-tungstenite `0e5b2d73aa18dd9f0a50ee9ff199d5aef7594186`: a thin public raw-socket adoption method passes already-negotiated Extensions to existing tungstenite constructor. No negotiation/default changes.
- S03 hyper-util no-retry/SOCKS patch remains unchanged and its actual stale-checkout regression stays mandatory.

The tungstenite standalone test Cargo.lock is retained and uses the same production versions of bytes1.12.1, http1.5.0, flate2 1.1.10, zlib-rs0.6.8, rustls0.23.45. Dependency unit tests are not implicitly run by root cargo test; `scripts/test-http.sh` now exactly lists/matches and runs both required vendor regressions with --locked, so zero-test matches cannot count as pass. Upstream duplicate-ignore and test unused-parens warnings are retained.

## Resource interpretation

README and fixtures memory_accounting now explicitly distinguish2M application admission from codec/allocator/RSS. Root approved this clarification; independent resource review remains required. Frame and encoded-write limits F=2M+65536 preserve legal M-byte messages and wire compression expansion. Requested/output Vec capacities, TLS/zlib state, frame backing and retained historical capacities are documented separately. Same-direction operation temporaries in receive/compress/serialize/blocked-flush phases are mutually exclusive; opposite directions and historical capacity may coexist. No deployment memory requirement is inferred by adding all mutually exclusive phase maxima. See `codex-transport-rust-ws-resources.md` for the pre-review lifetime notes.

## Observed validation

- Host `cargo clippy --manifest-path tools/codex-transport/Cargo.toml --locked --all-targets -- -D warnings`: PASS on final implementation (1.31s).
- Host full integration matrix before final capability/103/extension/shared-cap checks:47 passed,0 failed/ignored,45.11s. Includes actual45-second handshake timeout.
- Host final focused WS matrix excluding the already-observed45-second timeout:17 passed,0 failed,1.07s; filtered count is reported, not a claim of complete matrix.
- Linux ARM64 GNU/glibc container `codex-s03-build`, image pinned in baseline.json: preceding mandatory `docker exec -e CODEX_TEST_UID_MATRIX=1 -w /tmp/codex-transport codex-s03-build bash -c 'ulimit -n 8192; exec bash scripts/test-http.sh'` PASS49 integration,0 failed/ignored,46.22s, plus hyper stale-checkout1 and tungstenite bounded-decompression1. The final capability-enabled matrix and artifact results are below.

## Behavior index (same tests/transport.rs)

18 WS-specific cases plus extended all-four-proxy and shared256-cap HTTP cases protect: compressed/uncompressed text+binary and two response.create payloads; raw headers; local/upstream ping locality; both-direction close/reason; invalid UTF8/1006; fragmented raw and compressed message63/64/65 limits; coalesced103+101+first frame; abnormal EOF; subprotocol offers and upstream-first success barrier; unoffered extensions; true401/307/503 rejection and1024 boundaries; chunked/CL/unknown/earlyEOF; bounded slow rejection prefix; known-status header overflow; default/noCA, wrongCA, wronghost, expired target TLS; all4 proxy schemes and local/remote DNS, proxy auth privacy/failure and verified outerTLS; connect and45-second handshake deadlines; preheader caller cancellation; slow consumer in each direction with actual Pending observation and cancellation release; full payload reservation readmission and shared active-exchange cap before dial.

## Scope not claimed

S06 does not establish official TLS/H2/WS fingerprint equivalence, real-account model compatibility, Go session invalidation/account binding, billing/database invariants or final Docker rollout. Those remain S07–S10 independent work. Author has not self-scored or marked task ACs complete.

## Frozen-source hashes

- `Cargo.toml`: `5013fb15220b2a3318b6d5c3b72ea32fc3ae3426f865704b4be5f1890a3502f0`
- `Cargo.lock`: `c4d2cf534560592abfbfba22f70e04bc58d6be9c9189cc73b0e53291fba93863`
- `src/lib.rs`: `597bb546b51290f0f3eac75a8e50d030da8613e260c28046fc50d063175054df`
- `src/ws.rs`: `a3bc834da3db898de03ca933f4d50747caab1105e9a560f6144965b7087b7db6`
- `src/wire.rs`: `8282aa250de255c7ce0a8383255b0eb4a0ba02f23327b862eb1fa04e8aa39e76`
- `tests/transport.rs`: `11f287efe286936891737fcb4e026c50e2c8c7c52fc4308b74f362b67299c2ef`
- `README.md`: `6bfe047bba6b855c7f80af3beddfe11642ed287fd9648dbbbbdb5a81001bb0ec`
- `fixtures/contracts.json`: `8d2c864397b674d885dd0e3fe6baec1ea6c7eeda9c215d2ab5ac53b3694947e1`
- `scripts/test-http.sh`: `5540585d88604054133b45c3b84541ed9c664721098e4f16023051fd55de27e6`
- `vendor/websocket-provenance.json`: `a07e46e7afcba027807cd45eb74ce1874ab5f8452f4652a2b2fcda364d6cb682`
- `vendor/tungstenite.patch`: `497bb68fac7654ac3d63ac875ef7a2cbb7ff0c98b387beb8d8c457c268a83d27`
- `vendor/tokio-tungstenite.patch`: `a845731bd1788eb2f424c29e1b78dc1868e1abccf6c19884c67e6850eb311981`
- `vendor/tungstenite/Cargo.lock`: `28308e18217a1c264a8f9ec098e590b7080fb3f80b6a06924c8397fda8fff4d9`

## Final Linux frozen implementation evidence

`docker exec -e CODEX_TEST_UID_MATRIX=1 -w /tmp/codex-transport codex-s03-build bash -c 'ulimit -n 8192; exec bash scripts/test-http.sh'`: exit0, format PASS, **50 integration passed,0 failed/ignored (46.21s)**; hyper-util exact-match stale-checkout test1 PASS; tungstenite exact-match pre-rejection allocation test1 PASS. Actual health assertion now requires routes http/ws. No test was skipped by an environment gate; Linux UID matrix enabled.

`docker exec -w /tmp/codex-transport codex-s03-build cargo build --locked --release --target aarch64-unknown-linux-gnu`: exit0,6.01s. Final ELF SHA256 `d5c1c7dd9b727f0180cfa068641100e1c929c06aaddeef99892315dda8a5f522`; copied to `/tmp/codex-transport-s06-linux-arm64`. `file` confirms ELF64 ARM aarch64, GNU/Linux loader `/lib/ld-linux-aarch64.so.1`; `ldd` lists libgcc_s/libm/libc/loader, no dynamic system OpenSSL. `cargo tree --locked -e features` exits0; latest graph stored locally `/tmp/codex-s06-cargo-features.txt`. Build container released for independent reviews.
