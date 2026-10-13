# S02 independent protocol review

Status: first-read HOLD, awaiting author revision and fixed artifact hashes. This is a contract review, not production acceptance. Reviewed source plan, S02 rubric, research/Phase 2b, README and contracts.json. The implementation task is now `../tasks/done/codex-transport.feature.md`.

## Findings sent to author

1. Wire response/error metadata need explicit encoded/decoded/header-list limits and overflow outcome. Nested base64 expands raw headers; request and response limits must be independently specified.
2. WS failed upgrade currently promises streamed rejection body and mandatory trailer while returning gorilla Conn. Stock gorilla v1.5.3 DialContext reads only 1024 rejection bytes and closes the transport (`client.go:401–404`). Freeze a feasible one-attempt handshake/read strategy or explicit bounded rejection envelope; do not accidentally redial upstream to recover error content.
3. Boundary fixtures currently provide scalar numeric admission checks but required_cases are names, not executable input/action/expected objects. Retry layers, proxy DNS/NO_PROXY and shutdown/cancellation need exact counts and outcomes.
4. WS queue one complete message is not an independent byte cap when messages can be configured up to 2 GiB. Define an actual queue byte budget and compatibility/rejection for message limits, plus corresponding byte boundaries.
5. Streaming upload must distinguish truncated source from legitimate upstream early rejection (401/413). A early upstream response must stop upload and return actual response without waiting for upload EOF; a request-size limit exceeded after prefix transmission must report possible send and forbid retry.
6. Root already identified route /healthz vs /v1/health, missing API/Auth purpose, pre-send retry contradiction, policy inheritance and WS total-timeout ambiguity. These must be resolved against the accepted task.

## Provisional rubric

| Criterion | Weight | Score | Evidence |
|---|---:|---:|---|
| Three routes, fields, states/errors, Go interfaces | .30 | 3.5 | HTTP envelope/trailer and WS lifetime explicit; handshake and early-response feasibility unresolved |
| Three-layer request counts, both redirect layers | .25 | 3.5 | Zero library/local replay and redirect stated; pre-send business exception contradicts S02 |
| Trusted target/metadata/UDS/secret boundaries | .25 | 4.6 | Explicit trusted origin, fail-closed policy, permission/owner checks, no cookie jar or credential logging |
| Numeric boundaries, timeout/proxy executable tables | .20 | 3.3 | Numeric limit vectors exist; scenario inputs/exact outcomes and independent queue bytes incomplete |

Weighted score: 3.735/5; threshold 4.5. Hard gates incomplete. **HOLD; cannot freeze or authorize S03/S04.** Missing production implementation is not a deduction. No live account credential was read or used.

## Revision review (fixed revision supplied by coordinator)

Verified README SHA256 `ee66e9bfb0524000838d211daa147173c9e4afa1e5f01aefe80371283b79d2ea` and contracts SHA256 `8d682a3c22fddbbd9b955268149650c55362c10d9cb08dc8821082537b3b7263`. Independently reread both artifacts. A Python structural check confirmed all 37 limit entries have lower/upper triples matching health_limits, and all 47 scenario IDs are unique. This is schema consistency checking, not a transport test.

First-read findings have been substantially resolved: separate metadata caps, bounded WS diagnostic payload carried outside gorilla's discarded body, process WS byte reservations, explicit early upstream rejection, API/Auth purpose, route consistency, effective policy resolution, and all typed transport failures skip business retry. Remaining corrections sent directly to author:

- HEAD and 304 may legitimately advertise nonzero Content-Length while carrying no bytes. Completion length validation must explicitly exempt these no-body semantics; add exact vectors.
- A WS rejected handshake whose peer sends response headers then stalls its body must not occupy capacity indefinitely. The 45-second handshake deadline must include bounded diagnostic capture; preserve known status with read_error rather than invent successful completeness.
- Add explicit NO_PROXY hit/miss and stale pooled checkout/GOAWAY/REFUSED_STREAM scenarios with connection as well as request counts. Named required_cases alone do not satisfy the exact retry/proxy vector gate.

Awaiting this focused correction before final verdict. No production implementation deficiency has been used as a contract-score deduction.

## Final protocol verdict — PASS (contract gate only)

Reviewed final README SHA256 `f17fa84437105c6b4e893165127b696f9ab4e2dba508dfcc30a8f369511e9953` and contracts SHA256 `e2ea53bf0b9173006262f53ba5773d1b743142990755a9618d1aa09fa787f332`. These hashes supersede the earlier reviewed draft hashes. Final focused correction review confirms explicit HEAD/304 representation-length exception, 204 zero-body handling, WS rejection deadline, HTTP queue byte/chunk limits, NO_PROXY HTTP/WS hit vectors, and H2/stale checkout replacement-connection counters. Python structural assertions passed for all 39 limits and health mappings; 57 scenarios are present. Earlier HOLD findings are resolved for the contract gate.

| Criterion | Weight | Score | Final evidence |
|---|---:|---:|---|
| Three routes, fields, states/errors, Go interfaces | .30 | 4.7 | Required-purpose metadata, explicit response/errors and typed interface, streaming upload/early rejection, mandatory completion marker including bodyless responses, bounded one-attempt WS rejection contract |
| Three-layer request counts, both redirect layers | .25 | 4.7 | Zero Rust/local/business transport replay, errors.As/SkipRetry, pre-send failure zero request count, API/Auth redirect vectors, explicit hyper-util cancellation retry patch requirement, H2/stale replacement counters |
| Trusted target/metadata/UDS/secret boundaries | .25 | 4.7 | Trusted channel targets and fixed Auth endpoint, metadata rebuilding, verified TLS, explicit insecure rejection, UDS owner/mode/inode rules, sentinel-safe diagnostics |
| Numeric boundaries, timeout/proxy executable tables | .20 | 4.6 | 39 boundary definitions with health map, 57 input/expected scenarios, effective policy precedence table, proxy DNS and explicit-vs-environment behavior, bounded HTTP/WS queues and process reservation cleanup |

Weighted score: **4.68/5**, threshold 4.5. All S02 protocol hard gates pass: route/interface states; three-layer retry and dual redirect rules; trusted metadata/UDS/secret boundary; numeric body/message/header/queue/connection/pool limits and boundary expectations; effective timeout/proxy/DNS rules; shutdown/restart and cancellation behavior. No independently identified protocol contradiction remains.

Implementation verification remains mandatory: dependency retry patch and actual listener counts; body/trailer behavior with concrete HTTP libraries; actual queue memory/assembly accounting; proxy environment miss/explicit precedence and TLS variants; all required_cases that span multiple fixture instances. A scalar fixture admission value is not a syntactically complete wire message; runners must apply the documented semantic constraints too. These are execution obligations, not claims of tests already passing.

This verdict evaluates contract executability and completeness only. It does not freeze the contract on behalf of the coordinator, satisfy the other two independent S02 reviews, pass S01 actual-base integration, or authorize production/live acceptance. No real credentials were used.

## Final deadline/lifecycle addendum

Verified superseding README SHA256 `c266dccc51ac05588a75205893c6373436ab12f9e9dffcc73f32132281d5f4eb` and contracts SHA256 `199160441049ebcfd4054a8750ffdcb06b53058af0e52bcb25b917bbd03cb639` (40 limits, 58 scenarios). Focused review confirms the independent Go review's race is resolved at the contract level: rejection capture is at most 1000 ms after headers, also bounded by original handshake deadline; caller/local deadline takes precedence and may produce a sanitized timeout/cancellation without reconstructed response. Rejection local Content-Length=0 avoids gorilla waiting for nonexistent socket body. Neither outcome permits redial/replay. The two explicit deadline scenarios distinguish successful bounded capture delivery from earlier caller timeout and assert cleanup/no replay. This clarification preserves the **PASS, 4.68/5, all S02 protocol hard gates passed** verdict. Actual deadline and Body lifecycle behavior still requires implementation tests.
