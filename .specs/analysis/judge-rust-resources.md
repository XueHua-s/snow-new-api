# S03 independent concurrency/resource/build review

Status: REVIEW IN PROGRESS. The author is still editing tests and preparing final Linux evidence; no final numerical score or approval is assigned to this unfinished revision. No credentials were accessed.

Reviewed the source implementation plan, S03 criteria, private protocol README, baseline, contract fixtures, Cargo manifest/lock, pool/socket/wire/lib/main implementations, focused transport tests and the hyper-util retry patch. Review scope is the delivery tree `/tmp/new-api-codex-plan-pr`.

## Confirmed observations

- Pool keys contain effective origin, purpose, proxy, trust/profile and connection policies, not Authorization/account/path. Clients receive request-scoped headers and have no configured Cookie jar. Pool leases remain held inside the streaming response, so active work cannot be evicted by registry expiry or idle-budget pressure.
- Idle capacity is conservatively reserved per policy group across origins and shards; this can reject a new origin while another has an active lease even if fewer physical sockets exist. This is bounded admission, not transparent replay. Independent command `cargo test --locked --test transport global_idle_reservations_reject_before_dial_then_evict_inactive_origin -- --exact` passed on host macOS ARM64: 1 passed, 28 filtered, exit 0. It proves zero dial on exhausted reservation, preservation of the existing active response, and new-origin admission after cancellation. This is not the required Linux build.
- HTTP exchanges are semaphore-limited to 256; local socket/parser tasks are separately limited to 512. Response stream owns the exchange permit. The then-current actual capacity test held 256 responses and asserted rejection of the next admission with no new upstream connection/request.
- Total timeout wraps exchange setup including the zero-length local-source EOF wait, then arms a connection-level deadline to cover downstream flush stalls after response headers. Positive header timeout explicitly follows validated body handoff rather than a claim of Go socket-flush equivalence.
- Socket guard verifies parent components/modes/owner/group, refuses live endpoints, removes only owned stale sockets, and checks its created inode on cleanup. Main sets restrictive umask before runtime threads.
- Pinned hyper-util changes default `retry_canceled_requests` to false. Reqwest also configures retry never and redirect none.

## Findings sent to author/root; required follow-up

1. The active-cap test originally dropped bodies without proving all permits returned and subsequent admissions succeed. Author is adding cancellation/re-admission evidence. A source-level ownership argument alone does not replace this resource-lifetime regression.
2. `Bytes::split_to(65536)` bounds the delivered slice length, not its backing allocation. Local Hyper H1 permits a 262144-byte parser buffer; upstream Hyper H1 default is `8192 + 4096 * 100 = 417792` bytes. A retained slice can keep this library allocation alive. README's former per-read/current-chunk wording cannot be used as a 64 KiB process-memory guarantee. Preserve the official library configuration, but explicitly distinguish logical application handoff payload from retained library buffers and verify blocked-consumer/cancellation behavior.
3. Hyper H1 write-buffer thresholds are checked before appending; a last chunk may overshoot the threshold. Its queue has at most 16 buffers. Do not equate threshold, logical used bytes and allocator capacity. Hyper H2 defaults are stream window 2 MiB, connection window 5 MiB, max frame 16384, send buffer 1 MiB, adaptive window false; record source/version references and effective reqwest overrides rather than only nominal defaults.
4. Final locked Linux ARM64 GNU/glibc build, effective feature graph/MSRV evidence and final tests are still pending. `baseline.json` still labels these pending. Host pass and fixture numeric validation loops do not discharge those gates.

## Final scoring to perform after freeze

Apply S03's four criteria: HTTP/SSE fidelity .35; incremental/cancellation/resource boundaries .25; pool/proxy/certificate/identity isolation .25; locked Linux build .15. Required score is 4.5 with all hard gates. Recheck findings, run relevant final tests without concurrent 256-resource matrices, inspect Linux command evidence and score only that frozen revision. This review does not approve S06 WS, Go integration, billing/database, Docker deployment or live-account acceptance.

## Follow-up review of resource corrections

Inspected the revised capacity regression: hold 256 actual responses, reject admission 257 with unchanged request/connection counters, drop all first-wave bodies, wait for exactly 256 upstream drop notifications, then simultaneously admit another 256 responses and observe 512 total upstream requests. This closes the original permit-return evidence gap. The policy-registry test holds 128 distinct effective policies, rejects policy 129 without a dial, releases one response, and admits policy 129; this protects active leases against capacity eviction. HTTP and security reviewers independently reran the Linux 31-test suite successfully; this reviewer did not duplicate their resource-heavy run concurrently.

Independently executed in the Linux build container: `rustc --version`, `uname -m`, `cargo tree --locked -e features -i rustls@0.23.45`, and `cargo tree --locked -e features -i openssl-src@300.6.1+3.6.3`, exit 0. Observed rustc 1.91.1, aarch64, required rustls aws_lc_rs/std/tls12/prefer-post-quantum, reqwest 0.12.28 native-tls-vendored, fixed OpenSSL 0.10.75/sys0.9.111/src300.6.1+3.6.3 and both expected WS Git revisions. Ring is additionally enabled transitively, while production code explicitly installs AWS-LC. Presence of WS dependencies does not prove WS functionality.

Final status remains HOLD pending the author's final memory-contract clarification/blocked-consumer evidence and deterministic cancelled stale-checkout regression. Neither numerical validation loops nor slice length establish the retained allocation bound. Final scoring will follow that frozen revision; this is not a claim that the demonstrated permit/pool fixes failed.

## Final independent decision — PASS, 4.6755/5

This final decision supersedes the intermediate HOLD above. The original permit-return concern is closed by actual cancellation/drop observations and complete re-admission; the pool-cap concern is covered by held-policy/zero-dial rejection/release/re-admission. The memory wording now correctly distinguishes a 65536-byte logical handoff slice from retained backing allocations, library thresholds, TLS and kernel storage. No full response accumulation or unbounded application queue exists in the reviewed forwarding implementation. The named dependency sources support the recorded H1/H2/rustls settings; physical RSS and allocator capacity are explicitly not claimed.

Independently ran the final `blocked_consumer_stops_h2_source_and_cancellation_releases_it` exact test on host and Linux: each exit 0, exactly 1 passed, no failures/ignored (host 29 filtered, Linux 31 filtered). Linux command: `docker exec -w /tmp/codex-transport codex-s03-build cargo test --locked --test transport blocked_consumer_stops_h2_source_and_cancellation_releases_it -- --exact --nocapture`. It observes actual H2 send-capacity Pending while the downstream body is held, incomplete production of the hypothetical response, and upstream producer disposal after cancellation. This is a flow-control/cancellation regression, not a quantitative steady-state RSS measurement. Source-level library bounds and pull-based ownership supply the separate memory argument.

Reviewed the deterministic vendored stale-checkout test, its test-only barrier and branch observation, real closed peer, connector/request counters, and retry-enabled positive control. HTTP judge independently ran it on Linux (exactly 1 passed); the mandatory `scripts/test-http.sh` lists the exact test name before executing it, preventing a zero-match pass. The author's final script ran all 32 Linux transport tests and this dependency test successfully. No need to rerun the unchanged 256-resource matrix concurrently with reviewers who already observed it.

Independent final artifact inspection: ELF64 ARM aarch64, GNU/Linux, dynamic loader `/lib/ld-linux-aarch64.so.1`. Release SHA256 `a6cb5ba9c171f69d7b4bdfa12d826893d83178850c0df79b6e95e09ffddc0a36`, matching the author's final locked release rebuild (exit 0). Final container README `0675b38969039616be6ca54f2f5169123bbb92f6aadf570c6720d3d956cb8404` and fixtures `c736699ba096eb7e7da6d211d0d933275050cc86a0c506121c38a2e1992f707d` match the reviewed contract. Previous independent locked feature-tree checks remain applicable; baseline now records completed S03 graph/build checks while preserving S09 official-equivalence limitations.

| Criterion | Weight | Score / 5 | Basis |
|---|---:|---:|---|
| HTTP/SSE fidelity | .35 | 4.68 | Real UDS/TLS methods, escaped query, duplicate/hop headers, compression bytes, statuses, framing, early response, SSE/truncation; independent HTTP review corroborates comprehensive Linux behavior. |
| Incremental streaming, cancellation and resource boundaries | .25 | 4.60 | Complete 256-permit recycling, protected 128-pool boundary, real backpressure/cancellation, bounded logical forwarding and separately documented library retention. Header-timeout handoff and non-RSS scope remain explicit. |
| Pool/proxy/certificates/identity isolation | .25 | 4.70 | Active lease protection, conservative global idle reservations, per-request credentials/no cookie jar, independent cancellation; four proxy modes and negative TLS/proxy cases; real stale-checkout no-replay control. |
| Locked Linux dependency build | .15 | 4.75 | Rust 1.91.1 ARM64 glibc artifact, locked graph and required TLS/fork features, final release artifact verified, actual Linux tests. No S09 equivalence claim. |

Weighted result: `.35*4.68 + .25*4.60 + .25*4.70 + .15*4.75 = 4.6755`, above 4.5; S03 hard gates have evidence and no blocking finding remains from this review.

Scope: independent Rust HTTP/SSE only. WS, Go/business retry, authentication, database/billing, official protocol comparison, live accounts and deployment remain later gates. The `nofile8192` test setting covers a fixture process owning all four connection ends; it is not a validated production requirement. S10 must verify its chosen production FD/resource limit separately (including the proposed 2048 value), along with process/container memory and restart behavior. Preserve explicit timer/path/header limits and both dependency deviations in the final handoff.
