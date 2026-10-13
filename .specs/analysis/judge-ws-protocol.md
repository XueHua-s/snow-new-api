# S06 independent WebSocket protocol panel

Date: 2026-10-14. Reviewer: judge_ws_protocol; not the implementation author. Scope: S06 Rust transport, all four applicable criteria with protocol emphasis. **PASS, weighted 4.695/5**, threshold 4.5. No blocking finding remains in this scope. S07 session binding, S08 accounting, S09 fingerprint/live validation and S10 deployment acceptance are not established by this verdict.

## Frozen inputs and independent execution

Read the supplied project conventions, task S06/rubric, transport README and contract vectors, author WS/resource evidence, actual `src/ws.rs`, route/validation/lifecycle code in `src/lib.rs` and `src/wire.rs`, consolidated integration tests, fixed fork handshake/compression paths and both vendor patches/provenance. Source matches the author freeze: ws.rs SHA256 `a3bc834da3db898de03ca933f4d50747caab1105e9a560f6144965b7087b7db6`; tests/transport.rs `11f287efe286936891737fcb4e026c50e2c8c7c52fc4308b74f362b67299c2ef`; Cargo.lock `c4d2cf534560592abfbfba22f70e04bc58d6be9c9189cc73b0e53291fba93863`. Independently hashed frozen Linux ELF `/tmp/codex-transport-s06-linux-arm64`: `d5c1c7dd9b727f0180cfa068641100e1c929c06aaddeef99892315dda8a5f522`.

After the resource reviewer released `codex-s03-build`, independently ran:

- `docker exec -w /tmp/codex-transport codex-s03-build bash -c 'ulimit -n 8192; cargo test --locked --test transport ws_ -- --nocapture'`: exit 0; **18 passed, 0 failed/ignored, 32 filtered**, 45.06 seconds. Includes the actual 45-second handshake deadline, not a shortened substitute.
- `docker exec -w /tmp/codex-transport codex-s03-build bash -c 'ulimit -n 8192; cargo test --locked --test transport http_https_and_socks_proxies_tunnel_and_keep_proxy_identity_private -- --exact --nocapture'`: exit 0; **1 passed, 0 failed/ignored, 49 filtered**, 0.41 seconds. This case executes both HTTP and actual WSS through all four proxy schemes, with target authorization, proxy credential exclusion, SOCKS DNS address-kind and exact attempt assertions.

Author evidence separately records the final full Linux 50-case integration matrix, two vendor regressions and locked GNU ARM64 release build. This reviewer did not relabel those author runs as independent full-suite execution. No live credential, real-account request, database or private capture was accessed.

## Criteria

| Criterion | Weight | Score | Evidence and reasoning |
| --- | --- | --- | --- |
| Upstream-first handshake and failed status/body | .25 | 4.75 | An explicit upstream arrival/release barrier proves local101 remains pending. HeaderBoundary retains coalesced103/101/first-frame bytes and hands final headers to the fixed verifier. 401/307/503 preserve true status without local upgrade or redial; 1024/1025 capture, chunked/unknown/earlyEOF framing, one-second slow-body expiry and known-status header overflow are asserted. Original connect/handshake deadlines remain bounded. |
| Text/binary/fragments/control/close fidelity | .30 | 4.75 | Two distinct response.create payloads and arbitrary binary/raw header bytes round-trip exactly; the forwarding code moves complete Message values with no JSON parsing, ID or usage transformation. Fragmented/raw and deflated 63/64/65-byte cases enforce decompressed message limits; unoffered extensions fail before local101. Negotiated subprotocol is verified upstream and constrained by local offers. Both ping directions remain hop-local; downstream Away/finished and upstream4001/session replaced close code/reason are asserted; invalid text/1006 terminate, abnormal EOF never becomes normal close. |
| Bidirectional backpressure, limits and cancellation | .25 | 4.65 | Both directional send loops observe actual Pending, bounded producer progress and cancellation release. Application forwarding awaits each peer send; no unbounded message queue or clone. Shared active admission and 2M payload reservation precede dialing; two maximum-limit reservations are reclaimed and fully readmitted after cancellation. RAII guards are retained through session ownership, shutdown aborts tasks, and duplicated UDS readiness interrupts blocked writes. The documented reservation is not an RSS promise; codec retained storage, transient overlap and TLS/zlib/allocator overhead remain separate. |
| Official forks/features, WSS proxies/certificates | .20 | 4.60 | Exact official revisions are retained with explicit path patches, hashes and licenses. Reviewed patches expose existing negotiation/adoption, preserve raw validated header bytes and bound codec allocations; no new deflate algorithm or replay layer. Actual WSS tests verify missing/wrong roots, hostname and expired certificates, verified HTTPS proxy TLS, all proxy types, DNS semantics, authentication failure privacy and no target fallback. Frozen Linux release build and feature graph are recorded; full official wire-equivalence is correctly deferred to S09. |

Weighted score = .25×4.75 + .30×4.75 + .25×4.65 + .20×4.60 = **4.695**.

## Hard gates and limitations

S06 C02/C03 and the step-local AC07/10/11 obligations PASS: failure has no local101; upstream success precedes local upgrade; raw data types/bytes are preserved; two creates have exact upstream observation with one physical attempt; no Rust reconnect/replay path exists; per-hop deflate and fragmented complete-message limits are exercised; both close directions and matching hop-local pongs have explicit assertions; proxy and certificate evidence uses WSS itself. Linux source and artifact provenance are concrete.

The 2M admission rule bounds admitted application payload, not total resident memory; no unmeasured deployment memory cap is approved. Tests at small message limits protect equivalent boundary logic but are not a 128MiB compressed-load RSS benchmark. S07 must still prove user/session/credential binding and invalidation, and S08 must prove exact per-create accounting using real databases. S09 must still compare actual official TLS/WS fingerprints and live behavior. These are planned later gates, not omissions hidden by this S06 PASS.
