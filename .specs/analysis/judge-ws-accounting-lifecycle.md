# S07 independent accounting lifecycle review

Verdict: **PASS for S07, 4.67/5**. Reviewer is independent of the implementation. This is not S08 accounting acceptance or S10 deployment acceptance. No production files were modified and no live credentials were used.

Read the entire governing billing rule from the original worktree, S07/C04/C05 rubric, author evidence, session implementation, controller accounting regressions, channel adapter and wsmanager lifecycle. Reviewed the post-review disable/delete persistence fixes, including failure-after-persistence and transactional rollback cases.

| Dimension | Weight | Score | Evidence |
| --- | --- | --- | --- |
| Account/session/credential generation isolation | .35 | 4.70 | Private per-session channel/policy hashes, user/token/generation identity; persisted state rechecked after dial and each create; callback registered before dial; no account-keyed shared WS pool |
| Existing session and termination lifecycle | .25 | 4.70 | Each create runs original runner and billing preparation; accumulator settlement returns through original refund guard; terminal publication follows runner completion; once-only socket shutdown cancels workers and handler completion waits for them |
| Active/idle close, rotation and multiple creates | .25 | 4.60 | Independent binding/notification and two-create tests; repeated old terminal ignored, exhausted token denied before upstream; partial-success disable/delete closes, batch rollback preserves socket |
| Capability refusal and no replay | .15 | 4.65 | Enabled adapter preserves typed SkipRetry; no direct fallback; capability failure before create; actual process evidence distinguishes transport echoes from accounting |

Weighted result: .35×4.70 + .25×4.70 + .25×4.60 + .15×4.65 = **4.6675**, displayed **4.67**.

## Independently executed

- `go test -race ./relay ./controller ./pkg/wsmanager -run 'TestCodexTransportResponses|TestResponsesWebSocket|TestResponsesWSRequestRunner|TestResponsesWSShutdown|TestShutdown' -count=1 -timeout=180s` — exit 0; relay 2.265s, controller 4.310s, wsmanager 1.169s. Log `/tmp/s07-judge-accounting-lifecycle.log`.
- `go test ./relay/channel/codex ./relay/channel/openai ./relay ./controller ./service ./model -count=1 -timeout=180s` — all six packages PASS, followed by `go build ./...` exit 0. Log `/tmp/s07-judge-accounting-c04.log`.

The focused lifecycle run verifies observable two-request quota/log totals, pre-consume then rejection refund, delivered partial-output settlement once, cancel errors that do not terminate the active request, late previous-response errors, ambiguous controls, revoked credentials, and shutdown cancellation/admission semantics. These are real existing controller/session tests, not direct injection of a Usage value.

## Shared evidence inspected, not rerun by this reviewer

Root full C05 `go test -race ./service ./relay/... -count=1 -timeout=180s`: inspected `/tmp/codex-c05-race-root.log`, all tested packages PASS, no race/failure marker; root observed exit 0. C04 independently passed above. S05 security report passes at 4.6825 with transaction/management companion reviews. Inspected `/tmp/s07-db-bindings-fix.log`: real SQLite 3.50.4, MySQL 8.0.46 and PostgreSQL 16.15 binding/invalidation matrix, 105 subcases, no skips. Author Go→Rust process evidence covers two creates, identity/cancellation isolation, rejection and single physical attempt; I did not execute that Linux runner again.

## Explicit limits and required follow-on work

The active/idle mutation fixture sets `session.current` for active state but does not run an active billing worker. The wsmanager test proves it waits for a supplied completion signal and honors cancellation; it does not prove deployed process restart accounting. Combined with original controller termination regressions this satisfies the S07 integration boundary, but cannot close S08/S10.

S08 must run actual sidecar HTTP/WS events through original usage and accounting on all three engines with separate log databases, including interrupted streams, cancellation, duplicate terminals and exact wallet/token/user/channel/log values. In particular, the known positive `tier("request",2000)` zero-usage UsedQuota mismatch remains a required fix/test; it is not waived. Actual-main uses `controller/responses_websocket_test.go` and `TEST_RESPONSES_SQL_DSN` / `TEST_RESPONSES_LOG_SQL_DSN`; the planning reference to an absent fixed-price harness must be corrected without importing unrelated fixed() architecture. S10 must validate full application Docker shutdown, drain/restart and rollback. No claim of complete end-to-end acceptance is made here.
