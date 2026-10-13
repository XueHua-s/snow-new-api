# S03 Rust HTTP/SSE implementation evidence

Date: 2026-10-14. Implementation tree: `/tmp/new-api-codex-plan-pr`, based on this repository's `origin/main`. This is the independent Rust slice; it does not claim Go integration, WS implementation, live-account equivalence or billing/database acceptance. No real credentials were used or copied. No commits or pushes were performed by this worker.

## Delivered implementation

`tools/codex-transport/` contains the standalone crate, fixed Cargo.lock/toolchain, UDS-only executable, strict request/response wire validation, streaming HTTP/SSE forwarding, verified native-TLS default and explicit-CA rustls, explicit HTTP/HTTPS/SOCKS5/SOCKS5h proxy selection, origin/policy/shard pools, cancellation and completion trailers. Health advertises `routes:["http"]`; WS is not implemented or advertised. Other targets report production=false. `codex-transport health` performs a local socket health probe for deployment.

Known request Content-Length is generated from metadata, independently checked against actual source bytes. The producer verifies local EOF before yielding the last declared byte, preventing hyper from hiding a source overrun by ceasing body polls at the declared length. Unknown lengths stream normally. Early upstream 413 preserves the actual response while dropping the unfinished producer.

No application request replay, transparent redirect or direct fallback exists. reqwest retry(never()) is supplemented by the pinned hyper-util patch described below. Status/header/body are preserved; responses with known length are validated and only a clean EOF emits the completion trailer. Known-status header-limit failures include upstream_status.

The pool registry reserves per-origin idle capacity across shards against its effective-policy budget. Exhaustion evicts only inactive pools or returns capacity before dialing. This is conservative capacity reservation rather than a promise to use every currently empty socket slot. Account/token headers are excluded from pool identity; no cookie jar or mutable credential defaults exist.

## Explicit profile differences / limits

- Positive header_timeout starts after complete source validation and delivery to the HTTP library, observed through normal producer disposal. This is not Go's socket-flush boundary: HTTP/TLS queues and HTTP/2 flow control can still hold the final bytes. The contract now explicitly records this tradeoff. Zero disables it; context/total timeout remains independent. Tests hold the producer past its configured header timeout and prove it does not start prematurely. No byte-accurate flush equivalence is claimed.
- Targets whose escaped path/query would be rewritten by url/reqwest (including dot segments and encoded dot segments) fail with target before dialing; ordinary escaped slash/query is preserved. This constraint is explicit in the contract.
- Header caps are 100 pairs, 8192 decoded bytes/value, 12288 aggregate name+value bytes. Original upstream headers are checked before stripping hop-by-hop fields. These caps fit the baseline H1 parser and H2 header-list limit without changing H2 SETTINGS.
- 64 KiB is the maximum logical forwarded slice, not total retained allocation or RSS. There are no application channel queues. A slice can retain the larger bounded Bytes allocation from the library. Hyper 1.8.1 `src/proto/h1/io.rs` uses `8192 + 4096 * 100 = 417792` as its upstream buffer threshold and at most 16 queued buffer entries; the local parser limit is 262144. Append checks precede the last bounded chunk and are not allocator capacity ceilings. Hyper `src/proto/h2/client.rs` uses 2 MiB stream / 5 MiB connection windows, 16 KiB frames, 1 MiB send threshold, 16 KiB header list and nonadaptive windows. Rustls 0.23.45 `src/common_state.rs` sets a 64 KiB default TLS send buffer. Native TLS retains vendored OpenSSL record/handshake bounds. TLS, allocator and kernel socket storage are additional. No claim of whole-process 64 KiB memory is made.
- The H2 blocked-consumer test observes actual `SendStream::poll_capacity` Pending before the hypothetical complete response is produced, then cancellation releases that upstream producer. This is observable backpressure, not a performance benchmark or an RSS measurement.

## Locked dependencies and controlled patches

Production lock SHA256: `379ec22a1555d36bb06891fb3b1c61f68762d692279fc7b50b64278214489697`.

Pinned versions: reqwest 0.12.28, native-tls 0.2.14, openssl 0.10.75, openssl-sys 0.9.111, openssl-src 300.6.1+3.6.3, rustls 0.23.45, aws-lc-rs 1.18.1, hyper 1.8.1, hyper-util 0.1.20, h2 0.4.19, tokio 1.52.3. Both official fork revisions in baseline.json are dependencies of the lock; no WS functionality is implied by their presence. `cargo tree --locked -e features` was executed and saved locally to `/tmp/codex-s03-cargo-features.txt`; it is reproducible from the committed lock. HTTP native-tls-vendored, rustls native/webpki roots, aws_lc_rs/std/tls12/prefer-post-quantum, and fork proxy/deflate features are present. Actual TLS/H2 equivalence remains S09.

`vendor/hyper-util.patch` enumerates the controlled source changes against published 0.1.20; upstream LICENSE is retained:

1. Set retry_canceled_requests default false. This gates both send_request's unstarted Retryable loop and connection_for's CheckoutIsClosed loop; no noncloneable-body assumption is used.
2. Parse bracketed IPv6 URI hosts as IPv6 in SOCKS5. Linux resolves localhost to ::1; upstream 0.1.20 otherwise sent `[::1]` as a DNS domain. The strict proxy fixture requires local SOCKS5 ATYP IPv4/IPv6 and SOCKS5h domain resolution.
3. cfg(test)-only barriers/observation for the actual reused-checkout race. A real TCP connection is warmed; the second request pauses after acquiring its reused sender; the peer closes; the real connection driver observes EOF; the normal try_send_request then yields an unstarted Retryable. Default configuration records one warm connection/request and zero generation dial/request. Explicit retry=true positive control records two connections/requests, proving the test detects the original automatic replay. No transport error is fabricated and production has no test bypass.

The vendor's standalone Cargo.lock is committed separately, with hyper 1.8.1 / h2 0.4.19 / tokio 1.52.3 aligned to production. Its additional dependencies support upstream unit tests. `scripts/test-http.sh` is mandatory: root crate cargo test does not execute dependency unit tests. The script lists and exactly matches the regression name before invoking it, so zero matching tests cannot count as success.

## Commands and observed outcomes

Host: macOS ARM64, rustc 1.91.1. Container: Linux ARM64 GNU/glibc, image `docker.m.daocloud.io/library/rust@sha256:c1e5f19e773b7878c3f7a805dd00a495e747acbdc76fb2337a4ebf0418896b33`, container `codex-s03-build`. Sources were transferred by a controlled archive excluding every target directory, not by mounting personal credentials. Official/old POC containers were not started.

- `cargo fmt --manifest-path tools/codex-transport/Cargo.toml --check`: exit 0.
- `cargo clippy --manifest-path tools/codex-transport/Cargo.toml --locked --all-targets -- -D warnings`: exit 0 (after fixing a collapsible socket-cleanup conditional).
- `cargo test --manifest-path tools/codex-transport/Cargo.toml --locked`: initial final-scope host suite 29 passed, 0 failed/ignored; blocked-consumer subsequently added and its focused run passed. The final script below supersedes these intermediate runs.
- `cargo test --manifest-path tools/codex-transport/vendor/hyper-util/Cargo.toml --features full --lib codex_stale_checkout -- --nocapture`: actual branch regression and retry=true sensitivity control passed, 1 test, 0 failed/ignored. Upstream's duplicate ignore-attribute warning is unchanged and unrelated.
- `docker exec -e CODEX_TEST_UID_MATRIX=1 -w /tmp/codex-transport codex-s03-build bash -c 'ulimit -n 8192; exec cargo test --locked --test transport -- --nocapture'`: 31 passed, 0 failed/ignored, 25.49 s before adding blocked-consumer/vendor regression. Independent HTTP judge repeated 31 passed (23.93 s); independent security judge repeated 31 passed (42.44 s).
- `docker exec -w /tmp/codex-transport codex-s03-build cargo build --locked --release --target aarch64-unknown-linux-gnu`: exit 0, initial 1m51s, final runtime revision rebuild 8.76s. Output is `target/aarch64-unknown-linux-gnu/release/codex-transport`, not `target/release`. `file` confirms ELF64 ARM aarch64 and `/lib/ld-linux-aarch64.so.1`; `ldd` shows libc/libm/libgcc, no dynamic system libssl/libcrypto. Container rustc reports `1.91.1 (ed61e7d7e 2025-11-07)`.
- `docker exec -e CODEX_TEST_UID_MATRIX=1 -w /tmp/codex-transport codex-s03-build bash -c 'ulimit -n 8192; exec bash scripts/test-http.sh'`: exit 0; fmt passed, 32 Linux integration tests passed (25.43 s), zero failed/ignored; vendor exact-name listing matched and actual stale-checkout regression passed (1 test, 0 failed, 63 filtered).
- Final host `cargo clippy --manifest-path tools/codex-transport/Cargo.toml --locked --all-targets -- -D warnings`: exit 0 (1.65 s), including blocked-consumer and vendor seam revisions.

The test process needs nofile8192 because it owns all four ends of the UDS/upstream fixture connections; this is not evidence that the separate production sidecar uses four FDs per exchange. The first Linux run at nofile1024 exposed fixture FD exhaustion; the changed limit was explicit, not a skipped capacity test. The first Linux run also exposed the SOCKS IPv6 bug; it was fixed in the library instead of weakening the wire assertion.

## Behavioral evidence index

All ordinary integration cases are consolidated in `tests/transport.rs`:

- Method/query/raw duplicate headers, hop-by-hop stripping, compressed bytes, true 503 and 307 statuses; exactly one upstream request and no redirect follow; empty GET and known/unknown upload framing.
- SSE first-event release barrier; first body chunk then upstream error barrier (non-EOF, no completion); missing/overrun/unknown-length upload limits; upstream early 413 while the producer remains unfinished.
- Two identity headers across reused sockets, no cookie persistence; concurrent identity B remains usable when A is cancelled; preheader raw UDS disconnect cancels an incomplete upstream upload.
- Native TLS untrusted rejection; rustls supplied-CA success, other CA rejection, wrong host and expired certificate; Linux actual executable with SSL_CERT_FILE synthetic trust succeeds with native TLS and advertises production=true.
- HTTP CONNECT, HTTPS proxy verified outer TLS, SOCKS5 local DNS, SOCKS5h remote DNS and proxy basic/SOCKS credentials never forwarded to target. Auth rejection, refused proxy and bad outer proxy certificate produce zero target connections.
- H2 prewarm then REFUSED_STREAM/GOAWAY: one actual fault request on one connection, no retry. H1 prewarm then peer closure after second request: one connection/two total requests, no redial. The separate dependency unit above covers the distinct unstarted stale-checkout branch.
- HEAD and raw 304 preserve representation length with zero transferred body and completion; 204 requires zero framing. Upstream header overflow yields typed upstream_io with known actual status.
- Frozen numeric boundary vectors are consumed for policy ranges and strict required fields/duplicate JSON. Actual header value and pair boundaries, malformed target/auth/policy/source fields and path-normalization rejection fail before upstream attempts.
- 256 simultaneously held exchanges admit exactly 256 and reject the next before dial; cancelling all yields 256 upstream drop observations, then all 256 slots are successfully readmitted. 128 active policy pools reject the 129th; releasing one permits the next without evicting active work. Cross-origin conservative global-idle reservation rejects before dial and allows inactive-pool eviction.
- UDS world-mode/non-socket/symlink/live-socket rejection, owned stale recovery and inode-safe cleanup. Linux real different UID rejection and authorized 0750/0660 shared GID acceptance. Independent security probe additionally used service UID/GID41001 and peer41002, verified both authorized/unauthorized groups and SIGTERM cleanup.
- Header timer does not start while the producer is incomplete; header/total expiries never replay. Total deadline covers even zero-length local EOF pre-read before any upstream dial; a connection-level post-header deadline can interrupt blocked downstream flush.

## Remaining boundaries

S03 does not include WSS, Go adapter/business retries, auth-flow changes, real database accounting, live-model requests, official TLS/H2 fingerprint equivalence, Docker Compose production rollout or remote CI. Those retain their respective later gates. The private protocol's explicit timer/path/buffer tradeoffs must remain in the final PR; no exact Go socket-flush timing or whole-process memory equivalence is claimed. Final S03 admission remains subject to the independent judges; this author does not self-score or mark task ACs complete.

## Frozen source hashes

- `Cargo.lock`: `379ec22a1555d36bb06891fb3b1c61f68762d692279fc7b50b64278214489697`
- `vendor/hyper-util/Cargo.lock`: `e44a2ce71264f8e9ad0e857cc462f5173088afd3048b6adb624395704710347a`
- `README.md`: `0675b38969039616be6ca54f2f5169123bbb92f6aadf570c6720d3d956cb8404`
- `baseline.json`: `b04f231cc9a81173e1946e7ddd24c1f4f4afe43bda70e26d949272a6bf415707`
- `fixtures/contracts.json`: `c736699ba096eb7e7da6d211d0d933275050cc86a0c506121c38a2e1992f707d`
- `src/lib.rs`: `d9b709bcecdeccfe7b43ff411fd52b2480f1133ba0aae9c0ede8981b1f907668`
- `src/main.rs`: `f2fcf6990ed7c60da89ad914900c5fe539af125d11f703b223960f11032f7886`
- `src/pool.rs`: `fb65e16ad8412582f3e49cf37376d9658f9a5739cbdd3c27d4895ed97003bb9c`
- `src/socket.rs`: `b25cd011f1f6888426c75c1f7666c8cc897ddff9c157660f71f0424029056b7c`
- `src/wire.rs`: `439049e689c5f195a33a1e962fa47fe074bab0630be460ddd47ca7bbf39ae1b6`
- `tests/transport.rs`: `0365909dd9a2e0972f4f49859ae2e0e7685c08ea1d464eef45833e76ba89e59a`
- `vendor/hyper-util/src/client/legacy/client.rs`: `aaa2f693688a49d6f2fc6dc5253bd9943b9c2ae83983ba263de02f4fc54332bd`
- `vendor/hyper-util.patch`: `d8e2e0cdbdad3333c2f392974a62e3bc1b795659ed926965da3a26162379bf0b`
- `scripts/test-http.sh`: `85270543d482eae78000a8ef45977a114d90038586398ee0e554c2adbb271afc`

## Final release artifact

Final frozen-source `docker exec -w /tmp/codex-transport codex-s03-build cargo build --locked --release --target aarch64-unknown-linux-gnu`: exit 0, 9.03 s. Artifact SHA256: `a6cb5ba9c171f69d7b4bdfa12d826893d83178850c0df79b6e95e09ffddc0a36`. Repeated `file` confirms ELF64 ARM aarch64 GNU/Linux with `/lib/ld-linux-aarch64.so.1`; repeated `ldd` reports only libgcc_s, libm, libc and loader (no dynamic system OpenSSL). Independent HTTP judge subsequently reproduced vendor singleton and blocked-consumer singleton: both passed. The build container is released for independent review.
