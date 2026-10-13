# Independent S09 TLS / HTTP2 judge

2026-10-14. Independent reviewer: judge_protocol_tls_h2. **Current synthetic subgate PASS** after the re-review below; the first review HOLD is preserved as history. **Current full S09 reviewer verdict PASS 4.6875/5**, following the final live review below. Earlier HOLD assessments are historical; final AC aggregation remains root-owned. No credentials read or live requests made. No production edits.

## Review and independently executed checks

Read preserved source plan protocol/acceptance requirements, task S09 rubric, compare-baseline.py, sample.py, calibrated observations, official-features.json, protocol report and independent calibration report. Ran `python3 -m unittest discover -s tools/codex-transport/fixtures/protocol -p 'test_*.py' -v`: six PASS, exit 0. Independently inspected all 15 committed cases, initial ordered extension vectors, restored extension vectors, H2 frames and request hashes. This is independent analysis of author execution, not a second full Docker matrix execution.

Compared `/tmp/codex-s09-official/Cargo.lock.frozen` with `codex-rs/Cargo.lock`: hashes exactly match recorded original 49fe417b…4f8117 and derived 76511079…f26e69f; exactly 322 changed lines, consisting only of 161 version 0.0.0 deletions and 161 version 0.162.1 additions. The derived-lock limitation is truthfully disclosed; the release lock did not pass unchanged. Effective release OpenSSL override versus Cargo feature graph is correctly separated. GNU sidecar versus musl official remains explicit and accepted only under the independently reviewed calibration amendment, never identical-target reproduction.

Verified all comparable native initial fields including extension order match. Rustls extension values match while original order remains present; supported groups, cipher order, ephemeral lengths and PSK identity/binder lengths are retained. Actual resumed rustls observation is false→true on both with final PSK ordering retained. Native and WS reconnect false→false are correctly described as no restored handshake observed, supported by connector lifecycle explanation. Explicit 503/retry fixture is not represented as normal sidecar retry behavior.

H2 uses actual POST to the same localhost authority and /backend-api/codex/responses path, with equal body hashes. Ordered SETTINGS 2=0, 4=2097152, 5=16384, 6=16384, connection increment 5177345, pseudo-header order and first complete HEADERS/HPACK hash match. HEADERS flags=4 establish END_HEADERS in the measured sample, so the first-frame comparison is complete here. Official generation two uses new connection/stream1/1214-byte block; sidecar uses stream3/329-byte dynamic block. DATA segmentation and final END_STREAM differences are disclosed; both GOAWAY payloads encode NO_ERROR. Unsupported SOCKS HTTP and default HTTPS-proxy WS paths are expressly distinguished from sidecar extensions. No universal fingerprint or identical-pool claim is warranted.

## Required synthetic fixes

1. **WS payload preservation is not asserted.** `summarize` hashes HTTP request body, which is empty for WS handshakes, and only counts `ws_messages`. `sample.py` parses official payload into JSON then reserializes it before sending to sidecar, so even the source replay does not preserve original WS message bytes. Record each original complete WS message as bytes privately, replay those exact bytes, and commit ordered message length/SHA256 evidence per connection. Assert identical message digest sequences (including prewarm, both generations and reconnect grouping), message type and generate=false semantics where relevant. For unsupported official proxy cases, compare against the explicitly named direct official template, not an empty-body hash and count. Add a negative control changing one WS payload while preserving its length/count; summary must reject it.
2. **Deflate offer equality is claimed without retained comparison evidence.** Committed `headers` contains names only; no sec-websocket-extensions value exists in the summary. Retain and compare exact outgoing extension offer values for comparable WS paths and expected direct-template values for sidecar extensions. Add a negative control changing the offer. The fixture does not negotiate compression; label this as offer comparison, with negotiated compression behavior covered by S06 rather than claiming this matrix tests it.

Rerun calibrated affected WS cases (including reconnect and four proxies) and produce a complete consistent matrix snapshot after these changes. No need to alter production transport for these findings. The current `complete:true` means observed traffic completeness, not that TLS differences or WS payload identity automatically passed; preserve this distinction.

## Scores scoped to observed evidence

| Rubric | Weight | Observed score | Disposition |
| --- | --- | --- | --- |
| Same version/platform/conditions | .25 | 4.65 | PASS within documented GNU/musl calibration amendment |
| Initial/resumed native/rustls | .25 | 4.70 | PASS for measured fields and explicit non-restoration boundaries |
| Actual H2/WS | .30 | 4.20 | HOLD: H2 strong; WS payload/offer evidence missing |
| Live and differences | .20 | Not scored as a whole | Difference disclosure 4.70; live absent |

Do not compute a full weighted passing score by omitting or zero-weighting live. Synthetic approval requires closing both findings, then an independent re-review. Full S09 requires the later S08-gated live evidence and final reviewer follow-up even after synthetic PASS. AC15 remains unchecked.


## Independent remediation re-review — synthetic PASS

Re-read corrected sampling/replay, summary and negative-control tests, plus the full regenerated calibrated snapshot and author remediation. Independently reran the unittest command: **9 PASS**, exit 0. Equal-length/count payload mutation and same-name/different-value extension mutations now fail both the focused comparator and complete summarizer entrypoint. Independently computed SHA256 for both current harness files and matched committed artifact metadata; checked all 15 cases are present with no errors and inspected all six WS comparisons.

The server records each received text message's original bytes before parsing; the sidecar fixture base64-decodes and sends those exact bytes without JSON reserialization. Evidence retains ordered per-message length/hash/type/generate semantics and per-connection grouping. All six expected/actual sequences match: direct and all four proxies [3], reconnect [2,1]. Each offer is exactly `permessage-deflate; client_max_window_bits`; unsupported official HTTPS-proxy WS is explicitly compared against direct official WS, not fallback HTTP. Both original findings are **closed**. Offer-only versus negotiated compression is now explicit; the latter remains the separate S06 gate.

Revised observed H2/WS criterion: **4.70/5** (previous 4.20 HOLD). Other observed scores remain same-version/platform/conditions 4.65, initial/resumption 4.70, difference disclosure 4.70. As an explicitly synthetic-only aggregate, the first three original rubric weights normalized by their total .80 yield **4.684375/5**, rounded **4.68**. This is not a full S09 weighted score: the .20 live-and-differences criterion remains unscored as a whole. All scoped synthetic hard gates assessed by this judge pass under the documented calibration/platform and no-restoration boundaries.

**Full S09 and AC15 remain HOLD** pending the separately gated real model discovery, HTTP/SSE, multi-round WS and accounting evidence, plus final reviewer follow-up. No real credentials or live requests were used by this reviewer. The full Docker matrix was executed by the author and independently inspected here; this re-review independently executed parser/negative-control tests and artifact consistency checks, not a second full matrix.


## Final live follow-up — full S09 reviewer PASS

Reviewed the allowlisted `/tmp/codex-live-final-result.json` from root's observed exit-0 execution, the live runner and its corrected origin fixture. No credentials or live Docker resources accessed, and no additional upstream generation requested by this judge. Read the complete applicable billing rule and expression specification before assessing the accounting evidence.

Independently ran `python3 -m unittest discover -s tools/codex-transport/fixtures/protocol -p 'test_*.py' -v`: **22 PASS**, exit 0 (9 protocol/parser controls plus 13 live-runner controls). This includes exact seeded origin/composed routes, immutable image checks, secret-redaction failures, cleanup/SIGTERM and accounting mismatch rejection. Independently reapplied `verify_accounting` to the final sanitized report and additionally asserted distinct generation hashes/request IDs and a shared WS request prefix with successive -ws-0/-ws-1 suffixes: PASS.

The fixture now seeds channel origin `https://chatgpt.com`; the gateway appends its proper `/backend-api/codex/models` and `/backend-api/codex/responses` paths. The earlier duplicated-path 404 was a fixture defect, not accepted upstream evidence. Final report discovers 10 models through the management API and selects discovered `gpt-6-luna`. Runner performs one actual HTTP/SSE request to completion (200), then a single WS connection (101) with two response.create generations, carrying the first response ID as `previous_response_id` in the second. It validates completed status and bounded upstream usage and waits for exact settlement after each generation. No direct Usage injection or mock upstream is used in live execution.

Final immutable artifacts: app `sha256:c1f7972aa01e8423ace374d94b6b2a228cc6ec8263926b838c86648c2ca6d204`; sidecar `sha256:4ab8c6f99c9160e035db1ae3ff415150b06b690681e03c09213e21659bd88c54`. Usage is 23+5=28, 23+5=28, 37+5=42. The configured isolated verification rate yields 98 quota total: user/token balances both 999902, used quota both 98, channel usage 98, user request count 3; three consume logs match each generation exactly. This is fresh measured evidence despite the first two totals coincidentally matching historical 28-token examples. Verification pricing is explicitly not a claim of retail provider cost.

Egress uses opaque allowlisted CONNECT to the official host with normal roots and no custom CA. The runner returns only after finally cleanup succeeds; cleanup failure replaces the success report and exits nonzero. This final report is root execution evidence independently inspected by this judge, not an independently repeated paid run. Broader failure/cancellation/three-database behavior remains supported by S08, not inferred from these three successful live generations.

| Full S09 criterion | Weight | Final score |
| --- | --- | --- |
| Same version/platform/conditions, calibrated differences explicit | .25 | 4.65 |
| Initial/resumed native/rustls, non-restoration boundaries explicit | .25 | 4.70 |
| Actual H2/WS, exact message/offer evidence | .30 | 4.70 |
| Live discovery/HTTP/multi-round WS/accounting and disclosed differences | .20 | 4.70 |

Weighted total = 1.1625 + 1.175 + 1.41 + .94 = **4.6875/5**, rounded **4.69: PASS**. Both original synthetic findings and this reviewer's live gate are closed. This passes S09 from this independent TLS/H2 reviewer; it does not independently approve S10 or claim every task AC passed. No universal fingerprint identity, resumed native/WS handshake success, negotiated-deflate comparison in S09, identical libc or provider anti-detection guarantee is implied.

Documentation handoff: protocol report's opening still describes the pre-live stage; root was asked to distinguish it as historical and add current live command/results/artifacts. This is a current-status presentation correction, not missing live test evidence.
