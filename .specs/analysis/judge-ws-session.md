# S07 independent session/binding review

Reviewer: independent session panel. Scope: actual main-based implementation in `/tmp/new-api-codex-plan-pr`. No production code changes and no real credentials used.

## Verdict

Technical review PASS, weighted **4.685 / 5** (threshold 4.5). Whole S07 promotion additionally requires the root-owned complete C05 race result; this review does not turn a pending C05 into a pass. S05 panel acceptance is a prerequisite supplied by the coordinator (security 4.68, transactions 4.70, management 4.665). S08 accounting and S10 deployed restart tests remain separate, unaccepted gates.

| Criterion | Weight | Score | Evidence |
| --- | --- | --- | --- |
| Account/session/credential generation isolation | .35 | 4.75 | `responsesWSChannelBinding` covers credential/account source, type/status, target, settings, model/header route fields; private binding additionally checks user/token/startup generation and resolved physical policy. Subsequent creates query DB rather than channel cache. |
| Reuse original session and termination paths | .25 | 4.75 | `runRequest` retains the middleware runner, serial admission and terminal publication; `runCall` retains original reservation/settlement/refund. No Rust business state or second accounting owner. |
| Active/idle invalidation, rotation and multiple creates | .25 | 4.55 | Existing registry notified after successful Update/Save/status/tag/CAS persistence, before abilities follow-up. Register precedes handshake; successful handshake is followed by fresh binding comparison before create. Shutdown cancels and closes once without data-write locks, then original workers finish before session done. Independently exercised focused race tests. |
| Missing capability rejection and no replay | .15 | 4.65 | Adapter retains typed SkipRetry failures; live connection is exclusive per session. Reviewed actual Linux transport/retry-budget raw logs. Policy failure returns forbidden and `runRequest` closes; uncertain writes never redial. |

Calculation: .35×4.75 + .25×4.75 + .25×4.55 + .15×4.65 = 4.685.

## Independent commands actually run

- `go test -race ./relay ./pkg/wsmanager -run '^TestCodexTransportResponses(ConnectionBinding|UpdateClosesActiveAndIdle)$|^TestShutdown' -count=1 -timeout 120s` — PASS, relay 1.860s and wsmanager 1.203s. Includes 11 binding differences, 18 update/activity combinations, shutdown wait/cancellation and drain admission.
- `go test -race ./relay ./controller ./pkg/wsmanager -run 'TestResponsesWSShutdownInterruptsBusyWriter|TestResponsesWebSocket|TestShutdownWaits|TestCloseChannel|TestRegisteredClose|TestUnregister' -count=1 -timeout 120s` — PASS, relay 1.471s, controller 2.963s, wsmanager 1.389s. This independently reruns real host WS multi-create middleware and balances, previous-response duplicate/late event isolation, cancel/control errors, upstream rejection/refund and shutdown closure contracts.
- `git diff --check` — PASS.

The controller multi-create test verifies one upstream socket, first/second terminal identities, two consume logs (1000/2000 quota), and third create denied by exhausted token before upstream submission. This is existing host-path evidence, not the pending S08 sidecar accounting matrix.

## Author evidence checked, not misrepresented as independent reruns

Read `codex-transport-go-ws.md`, source fixtures, `/tmp/s07-go-rust.log` and `/tmp/s07-db-bindings.log`. Linux Go→UDS→production Rust→TLS WS result is PASS including controller retry-budget; frozen Rust hash `d5c1c7dd9b727f0180cfa068641100e1c929c06aaddeef99892315dda8a5f522`. Binding matrix has 87 passing subcases across SQLite 3.50.4, MySQL 8.0.46 and PostgreSQL 16.15, with actual version queries and no SKIP/FAIL. No simultaneous duplicate full suite or database/container run was launched by this reviewer.

## Security/lifecycle findings and limits

Read project rules, task S07 rubric, transport contract, security table and applicable cached OWASP Authentication, Session Management and OAuth guidance; billing rules and expression architecture were read in full. Relevant controls are ASVS 5.0.0 10.1.1 credential minimization and the Session Management server-side validity/invalidation requirements; this is no claim of complete ASVS compliance.

- Configuration changes invalidate active as well as idle sockets through the same registry, and successful same-value writes still notify, protecting A→B→A changes. Failed CAS does not notify. Binding material is private and never serialized to logs/pool keys.
- HTTP/WS policy fingerprints share `metadata` resolution; WS retains intentional handshake timeout and zero lifetime timeout. Main has no per-channel insecure-TLS field, so none is invented. Startup config is immutable: actual process restart is required, not claimed hot reload.
- `RegisterSession` tracks pre-routing sockets; shutdown drains admission and waits for original worker completion. Registering after drain starts closes immediately. Handler defer ordering closes the done signal after worker wait.
- The active/idle update fixture installs a current-call marker; it proves network/context invalidation, **not exact billing under a truly running sidecar call**. Likewise the busy-writer test holds the write mutex to demonstrate closure does not depend on it. Full deployed blocked-write/restart and precise sidecar balances remain S08/S10 requirements.
- Minor stale comment above `restoreConnectionContext` incorrectly says channel type is not rechecked; actual new hash does check it. Reported to author; no functional defect.

No blocking implementation defect identified within the S07 session-review scope. Full C05 completion must be attached before S07 gate promotion.
