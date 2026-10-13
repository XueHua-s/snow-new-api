# S07 independent binding/security review — PASS after round 2

Current verdict: **PASS, 4.675/5**. The initial HOLD below is retained as review history; the round-2 section resolves both findings.

Scope: actual implementation `/tmp/new-api-codex-plan-pr`, independently read session binding, Go WS dispatch/metadata, model mutation notification, controller mutation call sites and wsmanager shutdown. No source edits, real credentials or live upstream calls. Reviewed task S07 rubric, author evidence, security control table and applicable OWASP Authentication/Session Management/OAuth guidance (ASVS 5.0.0 scope). Full original-tree billing rules were read; this review does not accept S08 exact accounting.

## Blocking findings

1. `model.DisableChannelByTag`: successful channel status persistence is followed by `UpdateAbilityStatusByTag`. If the latter fails, `controller.DisableTagChannels` returns before `closeActiveChannelWebSockets`. Existing active and idle authenticated sockets survive a persisted disable. Per-create DB validation prevents the next create but does not terminate the active call and does not satisfy runtime invalidation. Notify the existing manager immediately after successful status persistence, even when ability maintenance fails. Add deterministic regression exercising actual persisted status and both socket states with the later operation failing.
2. `model.Channel.Delete`: `DB.Delete` can succeed before `DeleteAbilities` fails; `controller.DeleteChannel` likewise returns before socket close. A physically deleted channel can retain active/idle authenticated sockets. Apply the same persistence-success notification boundary and regression. `BatchDeleteChannels` uses a transaction and closes in its controller after successful commit; no equivalent partial-commit gap was found there.

These are security gate failures, not waived as preexisting paths: S07 explicitly promises all runtime channel disable/credential/route changes terminate existing active and idle transport. The new Update/tag-edit/CAS fixes already follow the correct boundary.

## Independently executed

`go test -race ./relay ./service -run '^TestCodexTransport(ResponsesConnectionBinding|ResponsesUpdateClosesActiveAndIdle|WebSocketCapabilityAndRejection|TypedErrorsAndNoReplay|UnavailableNeverFallsBack|ManagementErrorsAreSafe)$' -count=1 -timeout 120s`

PASS, exit 0: relay 1.875s, service 1.573s. The cases cover current 11 binding changes, active/idle Update/CAS/tag-edit and failed-CAS preservation; capability rejection before any local attempt; typed/sanitized failures and no fallback/replay. The two failure boundaries above are missing from the current tests. No external database or Linux fixture rerun was performed by this reviewer; existing author matrix is not represented as my execution.

## Rubric — provisional pending fixes

| Criterion | Weight | Score | Evidence / limitation |
| --- | --- | --- | --- |
| Account/session/credential generation isolation | .35 | 4.6 | Per-session private channel/policy hash, user/token IDs, generation; DB re-read before first create and subsequent creates; no identity pool sharing. |
| Original session/termination reuse | .25 | 4.6 | Existing runner, usage accumulator, terminal handling and once-only close retained; worker completion precedes registered session completion. Exact three-DB sidecar accounting remains S08. |
| Active/idle closure, rotation, multi-round | .25 | 3.0 | Tested Update/CAS/tag-edit work; persisted tag disable and delete can skip closure on later ability failure. |
| Capability rejection and no replay | .15 | 4.7 | Independent capability zero-attempt test and typed/no fallback/replay tests pass; enabled WS rejection uses SkipRetry. |

Weighted score: **4.215/5**. **HOLD**, below 4.5 with runtime invalidation hard gate failed. Root reports S05 three-panel PASS separately. Full C05 race, Linux process fixture, final database rerun after fixes and other panel evidence must be retained in final acceptance. This review does not claim S08/S09/S10 acceptance or whole-project OWASP compliance.


## Round 2 — independently re-reviewed fixes

Both blocking findings are resolved. `DisableChannelByTag` now notifies the existing wsmanager immediately after the status update succeeds, before ability maintenance; `Channel.Delete` does likewise after its actual deletion. The existing active/idle test table drops the real abilities table to force the second operation to fail, then asserts that the status/deletion persisted and that both websocket peers close with policy violation. The batch-delete counterexample proves rollback preserves the channel and socket. Failed CAS still leaves the socket intact. No second registry or transport fallback was added.

Independent command after frozen fixes:

`go test -race ./relay ./service ./pkg/wsmanager -run '^TestCodexTransport(ResponsesConnectionBinding|ResponsesUpdateClosesActiveAndIdle|WebSocketCapabilityAndRejection|TypedErrorsAndNoReplay|UnavailableNeverFallsBack|ManagementErrorsAreSafe)$|^TestShutdown' -count=1 -timeout 120s`

PASS exit 0: relay 2.077s; service 1.808s; wsmanager 1.394s. This includes `TestShutdownWaitsForSettlementAndRejectsNewSessions`; it checks registered original worker completion and closed admission. It does not simulate a whole deployed process restart.

Inspected author raw `/tmp/s07-db-bindings-fix.log`: **105 named subcase passes**, zero FAIL/SKIP, actual reported SQLite 3.50.4, MySQL 8.0.46, PostgreSQL 16.15 aarch64. The author executed `bash /tmp/test-s07-bindings-databases.sh`, selecting `go test ./relay -run '^TestCodexTransportResponses(ConnectionBinding|UpdateClosesActiveAndIdle)$' -v -count=1 -timeout=120s` with isolated real engines. I inspected the output and regression code; I did not claim independent execution of the external database matrix. Root C05 command `go test -race ./service ./relay/... -count=1 -timeout=180s` passed; inspected `/tmp/codex-c05-race-root.log` contains no failure/race diagnostic. The Linux production-process transport fixture and cross-account/no-replay evidence remain the separately documented author/S04/S06 evidence, not a new run by this reviewer.

| Final criterion | Weight | Score | Basis |
| --- | --- | --- | --- |
| Account/session/credential generation isolation | .35 | 4.7 | Independent binding regression plus private connection state, DB reload and effective-policy comparison. |
| Original session/termination reuse | .25 | 4.6 | Original per-create runner and terminal worker retained, shutdown waits for worker completion. |
| Active/idle closure, rotation, multi-round | .25 | 4.7 | Persisted mutation closure and rollback preservation now covered under race and all three real engines; original multi-create/old-event evidence retained. |
| Capability rejection and no replay | .15 | 4.7 | Capability zero-attempt, sanitized typed errors and no fallback/replay independently pass. |

Weighted final score **4.675/5**; all four criteria meet 4.5. S07 security/invalidation hard gates PASS with S05 prerequisite completion as reported by root, accepted C04 process evidence and C05 race evidence. No open finding from this reviewer. This is S07 acceptance only: S08 exact per-create accounting and separate log databases, S09 live/protocol comparison, and S10 actual deployment shutdown/restart/rollback remain separate required gates. No blanket ASVS compliance claim.

Frozen hashes reviewed:
- `model/channel.go`: `84931be161c852c43844f69a0533d80e9df48784248bf8bebe3e2c2261382e61`
- `relay/responses_websocket.go`: `c171983675da5ac7fa65c512477f28b968307edeeb0f8eb9d3035276377a553a`
- `relay/responses_websocket_test.go`: `28f3e8316fffd9c570bc9c08c1996ed967499e944b52096c4196981360ccc170`
- `pkg/wsmanager/wsmanager.go`: `7f5f955c0ab40e6fe43cfed611b5f15adf1bb7dda6ba4b755bb24aea4b76402a`
