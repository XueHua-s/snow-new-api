# S02 independent review — Go caller

Verdict: **HOLD**, weighted **4.575/5**. One timeout contract correction is required before the S02 hard gate passes. This is a design review, not implementation acceptance; no credentials or live upstream were used.

Reviewed immutable artifacts:

- README SHA256 `f17fa84437105c6b4e893165127b696f9ab4e2dba508dfcc30a8f369511e9953`
- contracts.json SHA256 `e2ea53bf0b9173006262f53ba5773d1b743142990755a9618d1aa09fa787f332`
- Source plan and in-progress task S02 rubric; actual delivery-tree `service/http_client.go`, `service/http_transport_policy.go`, `service/codex_oauth.go`, `relay/channel/api_request.go`; installed gorilla/websocket v1.5.3 client.go failure path.

| Criterion | Weight | Score | Evidence |
| --- | --- | --- | --- |
| Three paths, state/error and Go interfaces | .30 | 4.6 | Standard RoundTripper reconstruction, streaming body, completion trailer, HEAD/204/304 distinctions and gorilla failure-body metadata are implementable. Required purpose and disabled API/Auth behavior are explicit. |
| Retry and redirect rules | .25 | 4.8 | Both redirect layers disabled; all typed transport errors skip business retry; reqwest and hyper-util internal retry path explicitly identified; listener counts include stale checkout and H2 faults. |
| Trusted target/metadata/UDS/secrets | .25 | 4.8 | Operator-managed targets versus Auth fixed endpoint, private socket ownership, reserved headers, safe typed diagnostics through url.Error, no shared identity state or cookie jar. |
| Executable limits/timeouts/proxy table | .20 | 4.0 | 39 boundary/health fields and 57 scenario objects parse successfully. Effective main defaults match constructor/policy; explicit DNS/proxy behavior and resource caps exist. WS deadline-delivery race remains. |

Weighted result: .30×4.6 + .25×4.8 + .25×4.8 + .20×4.0 = 4.575. Numeric threshold passes; hard gate does not yet pass because timeout outcomes are not deterministically implementable as written.

## Required correction

README promises the original 45-second WS handshake deadline includes capture of a rejected response body, and on its expiry the adapter preserves upstream status/prefix. `ws_rejection_deadline` likewise requires reconstructed 401 after capture stalls until the handshake deadline. However the local gorilla client also uses the existing 45-second HandshakeTimeout. Rust cannot wait until that shared deadline and then deliver metadata in time: the local gorilla read may already have expired, yielding nil response/timeout instead of the promised 401. This is observable contract behavior, not missing implementation.

Specify separate bounded upstream capture and local delivery deadlines, with capture finishing before the local deadline, and define caller context expiry precedence. Alternatively explicitly permit timeout/no response on caller/local deadline and require the status/prefix outcome only when capture ends before that deadline. Update the scenario to exercise both outcomes deterministically. No unbounded wait or reset of the overall handshake budget is acceptable.

## Implementation watchpoints (not additional design blockers)

- RoundTripper must close the request Body on every return path (including local validation/health failure), return non-nil response Body, and make response Close cancel Rust even without draining the completion trailer. These follow standard interface ownership; add direct regressions when implementing.
- The existing delivery-tree DoWssRequest closes handshake failure bodies and formats the error. Integration must read its bounded reconstructed failure payload where appropriate and use safe transport fields; leaving that existing path unchanged would defeat the new API contract.
- Gorilla failed-handshake body capture is indeed 1024 bytes followed by socket close. Metadata-side capture is therefore a sound approach; local rejection body must be explicitly empty/framed so gorilla does not wait unnecessarily.
- A Go local POST with nil GetBody and no replay trigger is consistent with the zero-replay requirement; prove actual attempts, including bodyless business GET mapped to local POST.
- S02 does not claim its 57 scenarios have run. Later implementation must execute them rather than treating fixture presence as passing acceptance.

Verification performed: artifact SHA256 checks; JSON parse and object counts; direct source inspection. No production changes or test execution were claimed.

## Final revision review

Final verdict: **PASS — 4.695/5; all S02 Go-review hard gates pass**. This supersedes the earlier HOLD for the hashes below only.

- README SHA256 `c266dccc51ac05588a75205893c6373436ab12f9e9dffcc73f32132281d5f4eb`
- contracts.json SHA256 `199160441049ebcfd4054a8750ffdcb06b53058af0e52bcb25b917bbd03cb639`
- Parsed 40 limits and 58 scenarios. Newly inspected `ws_rejection_capture_deadline` deterministically captures early 401 then expires its 1000 ms read budget before the 45000 ms local deadline. `ws_rejection_caller_deadline` permits sanitized timeout/no reconstructed response when the caller expires first. Both prohibit replay and require cleanup.

The separate capture budget and explicit local/caller deadline precedence resolve the required correction. Empty local rejection framing and request/response Body ownership are now explicit. Criterion scores are 4.6 / 4.8 / 4.8 / 4.6 respectively: .30×4.6 + .25×4.8 + .25×4.8 + .20×4.6 = 4.695. There are no remaining blocking design findings from the Go caller perspective. Existing implementation watchpoints remain requirements for subsequent code and tests, not claims that implementation is complete.

Verification was SHA256 recomputation, JSON parsing/counts, and direct revised contract/scenario inspection. No production tests or live upstream calls were run for this design gate.
