# S03 HTTP/SSE independent review

Final status: **PASS — 4.6625/5** for S03 HTTP/SSE review. The final decision below supersedes the chronological interim HOLD notes; it does not accept S06 WS or later integration/live/deployment gates.

Reviewer independently read the source implementation plan, in-progress task S03 rubric, baseline.json, private protocol README, fixture scenarios, src/{lib,pool,wire,socket,main}.rs, Cargo.toml, the vendored hyper-util retry branches, and tests/transport.rs. No credentials or historical live captures were inspected. No build was started concurrently with the author.

## Findings sent for correction or proof

- response_metadata errors after obtaining an upstream status currently construct a sent error without that known status; the contract requires upstream_status whenever known.
- URL parsing can normalize literal or escaped dot segments; silent destination rewriting is unacceptable.
- Verify downstream socket cancellation before upstream headers, including blocked uploads and header waits, with a real observed upstream cancellation.
- Preserve verified known request Content-Length; unknown streams must remain incrementally framed. The zero-length case must not bypass source-length checking.
- The initial truncation test accepts a pre-header error; it needs a barrier after the client actually receives an event before the upstream fault, proving post-header failure cannot complete cleanly.
- H2 REFUSED_STREAM/GOAWAY tests initially use fresh connections. Frozen scenarios also require prewarmed/reused paths and zero replacement connections.
- A second request written to a reused socket and then disconnected does not by itself exercise hyper-util's cancelled/unstarted checkout retry branch. That path needs specific evidence.
- Each yielded slice is <=65536 bytes, but the retained underlying Incoming/bytes_stream frame may be larger; concurrency review must verify effective library buffer bounds, not infer them from split_to alone.

The one-line hyper-util default retry_canceled_requests=false patch guards both send_request Retryable and connection_for CheckoutIsClosed loops by source inspection. That supports the design, but does not replace behavioral counters.

## S02 affected-protocol amendment review

Reviewed updated README and the two target-normalization plus three upload-framing scenarios (README SHA256 d8c788d493c146c1b16f48c282c7c85e961b18d76b146d4eaec3339cef9dfad7; contracts SHA256 b3aadf26450e928e85d0ec4d594136155f4646170418827f888c63316a8d885e).

Accepted at the contract level: reject before dialing when fixed URL parsing changes escaped path/query, including literal/percent-encoded dot segments; restore upstream Content-Length from validated known metadata including zero; retain normal streaming framing for unknown length. Wire fields are unchanged. This explicit compatibility restriction is preferable to silently changing a configured destination. Implementation proof remains pending, including query-only/no-path URLs, ordinary percent escapes, zero-length source validation, and absence of conflicting framing.

## Final rubric pending

- Method/query/headers/status/body/SSE fidelity: weight .35.
- Barrier-based streaming, cancellation cleanup and boundaries: weight .25.
- Pool identity/proxy/certificate/identity separation: weight .25.
- Locked Linux dependency build: weight .15.

Threshold 4.5 plus all hard gates. No score is assigned from code existence or author intent. Linux build, actual boundary behavior and replay counters must be observed before final decision.

## Header timeout semantic investigation

Independently inspected pinned hyper 1.8.1 sources and host Go net/http transport sources at root's request. A request Body Drop/EOF signal does not prove the complete request was flushed to the upstream transport. H1 dispatch clears the body around write_body/write_body_and_end/end_body, while connection poll_flush is separate. H2 PipeToSendStream enqueues send_data then can complete; pending flow-control/IO may still hold data. Go HTTP/1 starts ResponseHeaderTimeout after Request.write plus buffered-writer Flush completes; Go HTTP/2 starts it after writeRequestBody (including Flush) completes. Thus the proposed Drop notification is later than the old signal-before-final-yield but still differs materially from inherited Go semantics. Remaining upload delay can be unbounded when a peer withholds flow-control or stops reading. An exact implementation needs a flush-completion observation at the protocol layer; otherwise this must be an explicit, reviewed policy incompatibility, not described as unchanged Go timeout semantics. No final decision on this gate yet.

## S02 follow-up amendment decision

Reviewed README SHA256 f04b2c9e50d1b35858037ce25a2865b0f821c3339e9f891b3d338c24154ffc32 and fixture SHA256 13676a8648328a8f03631dfc3eddbdc91f5b84f6d13f1cc682e16a509b2c5e42. PASS for the affected contract amendment, not S03 implementation acceptance.

The positive header-timeout semantic difference is now explicit: start after validated body handoff to the HTTP library, before a guaranteed socket flush; final upload backpressure can therefore expire sooner than Go ResponseHeaderTimeout. Zero is unchanged. An unfinished producer must not start this timer, and context/total deadlines remain independent. The two added producer-barrier/handoff vectors state observable results. This is a material compatibility restriction and must appear in the final PR, not an assertion of identical Go timeout behavior. The author must still move notification beyond final-yield preparation and demonstrate both scenarios with controlled timing.

The reduced 100 raw response fields / 8192 per value / 12288 aggregate limit is explicit. Counting 32 bytes per raw field and 42 for :status gives 15530, within the client's advertised 16384 response header-list cap. The README correctly limits that proof to received response headers, before hop-header stripping. It does not claim that outgoing request pseudo-headers (notably a long :path) are bound by the client's receive SETTINGS; the upstream may impose its own request cap. That rejection must remain sanitized and never replayed.

Implementation review remains open. The author reported corrected status propagation, normalization rejection, known/unknown/empty upload framing, pre-header cancellation, barrier-based response truncation, and prewarmed H2 faults with passing tests; these reports are not yet an independent final rerun or a final score. Resume this reviewer after the final source freeze and Linux command evidence are available.

## Independent Linux rerun, implementation review round 2

Executed `docker exec -e CODEX_TEST_UID_MATRIX=1 -w /tmp/codex-transport codex-s03-build bash -c 'ulimit -n 8192; exec cargo test --locked --test transport -- --nocapture'`: exit 0, 31 passed, 0 failed/ignored, 23.93 seconds. This exercised actual UDS/TLS/HTTP behavior, including synthetic native OS trust, four proxy modes, rejected certificate/proxy paths, cancellation, SSE first-event and post-event truncation barriers, bodyless responses, length validation, header boundaries, prewarmed H2 REFUSED_STREAM/GOAWAY, active exchange and policy-registry caps. It did not exercise live accounts or WS.

Independently verified host/container matching SHA256 values:

- Cargo.lock: `379ec22a1555d36bb06891fb3b1c61f68762d692279fc7b50b64278214489697`
- src/lib.rs: `d9b709bcecdeccfe7b43ff411fd52b2480f1133ba0aae9c0ede8981b1f907668`
- src/wire.rs: `439049e689c5f195a33a1e962fa47fe074bab0630be460ddd47ca7bbf39ae1b6`
- src/pool.rs: `fb65e16ad8412582f3e49cf37376d9658f9a5739cbdd3c27d4895ed97003bb9c`
- tests/transport.rs: `b347ec5895d9532d27df9bb2a644a75d8fe04ff925e076ddb281ea33068dc991`

Container reports rustc 1.91.1 and aarch64. Inspected the actual `target/aarch64-unknown-linux-gnu/release/codex-transport`: GNU/Linux aarch64 ELF, dynamically linked glibc loader; SHA256 `cd79cf074d9b4c5c81bc8ff306dc5eef7f51cbcf6829cbb6975133b9e2c08ee9`. Author reports the locked release build command; this reviewer independently inspected its artifact rather than rerunning the expensive release compilation. Executed locked feature-tree inspections for rustls and openssl-src: required aws_lc_rs/std/tls12/prefer-post-quantum and vendored OpenSSL paths are present. Ring is also transitively enabled; the server explicitly installs the AWS-LC provider. Both frozen WS fork revisions appear, but that is dependency evidence only, not WS implementation acceptance.

The production dependency patch now includes a SOCKS IPv6 bracket correction in addition to disabled cancelled-checkout retries; both deviations must be documented for S09 baseline comparison.

### Remaining hard gate: HOLD

`reused_http1_connection_closure_does_not_redial_or_replay` closes the peer after the second request's headers have arrived. It proves no retry after a sent request, but does **not** prove frozen `no_retry_stale_pool_checkout` (zero second upstream requests and zero replacement attempts). Source inspection shows the relevant disabled paths, but the contract explicitly requires actual counters. Root agrees this remains a hard gate.

Suggested only (not authored) a deterministic test-only library seam after obtaining a real reused pooled connection and before try_send_request: pause, close the real peer and wait for the connection driver to observe EOF, then resume and observe actual Retryable/connection_reused behavior with connector/request counters. A retry-enabled comparison would establish sensitivity. No fabricated transport error or production bypass should be used.

The author is adding this regression and blocked-consumer evidence. Source/test freeze will therefore change. Final four-criterion scoring is deferred until that correction; no S03 PASS is issued from the otherwise passing 31 cases. Memory-contract clarification also awaits the independent resource review.


## Final independent decision — PASS, 4.6625/5

The stale-checkout hard gate is now closed. Reviewed the final test-only seam in the pinned vendored dependency: after a real reused connection is obtained, a barrier closes the actual TCP peer and waits until the real connection driver observes EOF. The subsequent real sender takes the unstarted Retryable path; its branch counter must equal one. Default policy retains only the warmup connector call/request (zero generation requests, zero replacement connections). The explicit retry=true positive control produces two connections/two requests, proving sensitivity. Production code has no injected failure or test barrier. The mandatory `scripts/test-http.sh` explicitly lists and exactly runs this dependency test because ordinary sidecar `cargo test` does not include dependency unit tests.

Independently ran in the Linux ARM64 container:

1. `cargo test --manifest-path vendor/hyper-util/Cargo.toml --locked --features full --lib client::legacy::client::codex_no_retry_tests::codex_stale_checkout_has_zero_redial_before_request_start -- --exact --nocapture` — exit 0, exactly 1 passed, 0 failed/ignored. A pre-existing duplicate-ignore attribute warning in vendored HTTP connector tests remains; it does not affect execution.
2. `cargo test --locked --test transport blocked_consumer_stops_h2_source_and_cancellation_releases_it -- --exact --nocapture` — exit 0, exactly 1 passed, 0 failed/ignored (31 filtered). It observes actual H2 flow-capacity Pending with a held downstream, prevents whole-response accumulation, then observes producer cleanup on cancellation. It does not measure RSS or promise a 64 KiB physical allocation cap.

Earlier independent complete 31-case run plus this added boundary case covers the current 32 transport cases; no redundant full resource-matrix rerun was performed concurrently with other reviewers. Final host/container hashes matched: tests/transport.rs `0365909dd9a2e0972f4f49859ae2e0e7685c08ea1d464eef45833e76ba89e59a`; vendor client.rs `aaa2f693688a49d6f2fc6dc5253bd9943b9c2ae83983ba263de02f4fc54332bd`; vendor test Cargo.lock `e44a2ce71264f8e9ad0e857cc462f5173088afd3048b6adb624395704710347a`. Production lib.rs remained at the previously verified hash.

Reviewed final memory clarification (README `0675b38969039616be6ca54f2f5169123bbb92f6aadf570c6720d3d956cb8404`, fixture `c736699ba096eb7e7da6d211d0d933275050cc86a0c506121c38a2e1992f707d`): 65536 applies to forwarded logical slices; retained Bytes backing allocations and bounded library/TLS/kernel buffers are explicitly separate. Pull-based forwarding has no application channel queue. This amendment passes the affected contract review; the resource reviewer independently assesses detailed library bounds.

| Criterion | Weight | Score / 5 | Evidence and limits |
|---|---:|---:|---|
| Method/query/header/status/body/SSE fidelity | .35 | 4.70 | Actual TLS/UDS method and escaped-query fidelity, duplicate and hop headers, compressed bytes, 503/redirect preservation, known/unknown/empty framing, HEAD/204/304, early rejection, length errors and post-event failure; explicit URL-normalization/header-size restrictions reviewed. |
| Barrier streaming, cancellation cleanup, boundaries | .25 | 4.60 | First event precedes release; post-event truncation cannot complete cleanly; upload/pre-header and independent identity cancellation; capacity return; real H2 backpressure; header/total deadlines. Positive header-timeout handoff semantics remain an explicit compatibility deviation, not equivalent to Go socket-flush timing. |
| Pool policy/proxy/certificates/identity isolation | .25 | 4.65 | Origin/effective-policy keys exclude request credentials; interleaved identities reuse safely without a cookie jar; four proxy modes and failure/no-fallback paths; native verified OS trust and explicit CA paths; untrusted/expired/wrong-name failures; real H2 faults and deterministic stale-checkout counters. |
| Locked Linux dependencies/build | .15 | 4.70 | Actual Linux aarch64 glibc release artifact plus executed transport/dependency tests, matching source hashes, locked rustls/OpenSSL feature graphs and frozen forks. This is build evidence, not S09 official wire-equivalence evidence. |

Weighted result: `.35*4.70 + .25*4.60 + .25*4.65 + .15*4.70 = 4.6625`, above the 4.5 threshold. Required S03 HTTP hard gates have observed behavioral evidence; no open blocking defect remains from this reviewer.

### Scope and handoff limitations

This PASS is restricted to independent Rust HTTP/SSE S03. It does not accept WS implementation, Go-side/business retry layers, OAuth security, billing/database integration, official TLS/H2 equivalence, real-account traffic, or final Docker deployment. Those remain assigned to later steps. Final PR must disclose positive header-timeout semantics, explicit normalization/header admission restrictions, and the two small production dependency deviations. Refresh stale `baseline.json` S03-pending text in the evidence aggregation; do not convert untested S09 equivalence into a claim of success.
