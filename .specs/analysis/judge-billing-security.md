# S08 independent security/concurrency judge

Current verdict: **PASS, 4.675/5** after final re-review below; earlier HOLD findings and failed runs are preserved chronologically.

Verdict: **HOLD — blocking old-generation isolation failure**. Weighted score **3.8875 / 5**, threshold 4.5; the hard gate fails independently of the numerical score. No production edits or live credentials were used. Complete governing billing rules and actual-main expression design were read.

| Criterion | Weight | Score | Assessment |
|---|---:|---:|---|
| Once-per-call termination and exact accounting | .35 | 3.0 | Existing immediate-previous duplicate case passes, but a generation-1 terminal ends generation 3 and uses its old usage. |
| Failure/cancellation/missing usage/duplicate events | .25 | 3.5 | Focused cancellation/error race cases pass; arbitrary older terminal events are not isolated. |
| Real three databases and independent logs | .25 | 4.75 | Inspected author and independent accounting matrix evidence: 105 billing plus 81 auth passes, no skips; real Rust and separate main/log databases. |
| Saturation and audit | .15 | 4.7 | Oversized upstream quantities clamp, refusal occurs before contact, and admin-only marker stripping is asserted. |

## Blocking finding

`relay/responses_websocket.go` around lines 454–461 filters only `s.lastResponseID`; lines 521–527 then treat any other terminal as current and settle it. After two completed generations, a delayed terminal for generation 1 is neither the immediately previous ID nor rejected against the current generation. It terminates generation 3 and records old usage under generation 3's request ID. The same single-ID limitation applies to older error events.

Independent deterministic reproduction used the existing gateway/billing fixture, expression `tier("input",p*2)`, and sufficient token balance. Upstream completes response-1, completes response-2, then after receiving create 3 sends the old response-1 terminal followed by the valid response-3 terminal. Expected next terminal ID response-3, actual response-1. Log shows a third consume entry using the old terminal's usage. No sleeps, fuzzing or transport mocking were needed. Test command exited 1:

```sh
go test ./controller -run '^TestS08JudgeOldGenerationTerminal$' -count=1 -timeout=30s
```

Evidence: `/tmp/s08-judge-old-generation.log`. Temporary reviewer test file was removed after reproduction; author should preserve the regression in the existing fixture. Repair must reject arbitrary older generations without an unbounded ID set, preserve supported terminal-before-created behavior, and prevent cross-generation usage/error contamination. Bind known active IDs and define bounded fail-closed history/session semantics where correlation is otherwise ambiguous. Re-review required before S08/live gate passes.

## Independently passing checks

```sh
go test -race ./controller -run '^(TestResponsesStreamOutcomesPreserveAccounting|TestResponsesWebSocketReusesConnectionAndSettlesEachRequest|TestResponsesWebSocketInitialUpstreamRejectionRefundsReservation|TestResponsesInterruptedStreamAccounting|TestResponsesWebSocketDisconnectSettlesDeliveredOutputOnce)$' -count=1 -timeout=180s
go test -race ./controller -run '^TestResponsesWebSocket(CancelErrorDoesNotFinishActiveRequest|AmbiguousControlErrorClosesAndSettlesOnce|RejectsSecondControlWhileOnePending|AcceptsCancelAfterControlError|IgnoresLateErrorForPreviousResponse|ForwardsErrorForOtherResponseWithoutEndingRequest|LocalErrorsKeepStreamIdentity)$' -count=1 -timeout=120s
```

Both exit 0: 5.591s and 2.090s respectively; logs `/tmp/s08-judge-security-race.log`, `/tmp/s08-judge-security-negative.log`. These are native Go race checks, not Rust race instrumentation. No redundant full database run was performed; independent accounting judge already reran the complete matrix. Reviewed matrix physically separates log databases, rejects skips and reruns S05 auth. No schema/driver changes. The narrow positive-zero-token aggregation fix is consistent with the actual expression result. Handler-level shutdown waits real workers and duplicate close checks exact balances; this is not a full application restart or crash-atomic settlement claim, which remains S10.

## Re-review of four-generation repair (pending final gate)

The original old-generation finding is **closed by source inspection and independently passing regression tests**. The session retains SHA-256 hashes for at most 1024 admitted response IDs, never evicts within a reusable session, and closes after the limit generation settles. Each generation binds its first identified response once; later mismatched created/progress/terminal/output events cannot rebind it. History filtering also protects terminal-before-created calls and old errors, while a properly correlated cancellation error still resolves its pending control. An accepted call without an identifiable response settles and closes the session. The four-generation regression checks differing usage (100/200/300/400), both created-first and terminal-first variants, old output/error and never-current IDs. Fixed-size hashes prevent retained variable-length ID amplification.

Independent re-review commands:

```sh
go test -race ./controller ./relay ./model . -run 'TestResponsesWebSocket(RejectsArbitraryOlderGenerations|UnidentifiedTerminalSettlesThenCloses|AcceptsCancelAfterControlError|IgnoresLateErrorForPreviousResponse|ForwardsErrorForOtherResponseWithoutEndingRequest)|TestResponsesWSHistoryLimit|TestBatchShutdown|TestShutdownHTTP|TestHTTPHandler' -count=1 -timeout=180s
go test -race . ./controller -run '^TestShutdown|^TestCodexBatchFinalFlush' -count=1 -timeout=120s
```

Both exited 0. First: controller2.164s, relay1.577s, model1.627s; root matched no tests (not counted). Corrected second command exercised root shutdown1.488s and controller batch failure1.666s. Evidence `/tmp/s08-security-rereview-race.log`, `/tmp/s08-security-shutdown-race.log`.

HTTP admission checks and WaitGroup.Add share a mutex with the permanent stopping transition, so no admitted Add can race a zero-counter Wait after shutdown. After HTTP grace expiry, base-request cancellation and socket closure precede the bounded settlement wait; undrained handlers return an explicit fatal-path error. Successful grace also waits for hijacked handlers. These tests are handler-level, not final-image S10 deployment evidence.

**Remaining hold at this checkpoint:** root identified shutdown cancellation of the periodic flush's database context, followed by retained-delta retry. A canceled commit can have ambiguous outcome; scheduler cancellation must only stop scheduling, allowing the current flush to finish, with bounded wait failure preventing a concurrent final retry. Author accepted this correction; final corrected source/test and expanded three-database evidence remain pending. The current `/tmp/s08-s10-final-databases.log` ends at `unsupported_policy (local_connect)` before completing the final engine, so it is not full-matrix PASS. Earlier matrix remains historical evidence only.

Known missing-table SQL failure is determinate and its retry regression is meaningful. Neither this fixture nor retaining failed deltas establishes exactly-once after uncertain database commit/network failure, crash recovery, or atomic settlement across main/log databases. No such claim should appear in handoff. Healthy-database graceful deployment drain remains S10.

## Final re-review — PASS (supersedes both HOLD checkpoints)

Final S08 security/concurrency verdict: **PASS, 4.675 / 5**. Scores: once-per-call balances/log .35×4.70; failure/cancellation/history .25×4.70; real databases/independent logs .25×4.65; saturation/audit .15×4.60. All S08 hard gates are satisfied by the final source, independent focused race checks and complete real-database evidence. Historical failures above remain an audit trail, not current blockers.

Final source stops only the periodic scheduler: the running flush uses an uncanceled background context, and ShutdownBatchUpdater waits for that cycle before taking the serialized final-flush gate. A bounded wait failure returns before starting another flush. **Final design does not requeue SQL-error snapshots and does not permanently latch failure**; subsequent cycles apply only new deltas. This preserves the previous no-replay failure policy, avoiding duplicate additive writes when a commit outcome is uncertain. The final flush propagates errors to a nonzero main exit. Earlier retained-failed-delta descriptions are superseded. Known database failures still require reconciliation; this is not durable or crash-atomic exactly-once accounting.

The blocking old-generation defect remains closed as described above. HTTP WaitGroup admission remains protected by the stopping mutex; signal handlers are now installed before the application listener starts, closing the readiness-to-SIGTERM startup window. No new blocking finding.

Independently executed on final source:

```sh
go test -race . ./relay ./controller ./model -run '^TestShutdown|^TestResponsesWSHistoryLimit|^TestResponsesWebSocketRejectsArbitraryOlderGenerations|^TestResponsesWebSocketUnidentifiedTerminal|^TestBatch|^TestCodexBatch' -count=1 -timeout=180s
```

Exit0: root1.553s, relay1.486s, controller2.044s, model1.588s; `/tmp/s08-security-final-race.log`. Meaningful cases include a blocked prior flush plus newly queued settlement, repeated final flush, known SQL failure without replay of old deltas after recovery, immutable response correlation across four generations, capacity/no-ID close after settlement, canceled handler drain and explicit undrained timeout error.

Inspected final runner evidence `/tmp/s08-s10-no-replay-final-databases.log`: 117 billing leaf cases,81 auth and6 batch checks, no failure or skip. SQLite3.50.4, MySQL8.0.46, PostgreSQL16.15; distinct main/log databases. Real Rust executable SHA256 `d5c1c7dd9b727f0180cfa068641100e1c929c06aaddeef99892315dda8a5f522`; controller `1323bf4ef007b8f9bfccde2804f0bac7d34235e5753ca35038072bc12e0f57cc`; model `82066a0ee0e1cb6ad8dd30c171f247bf68aa3d4fac76422c2a354aabb971484c`. This final complete run supersedes the earlier local_connect failure. Database reviewer supplies independent database assessment; this reviewer did not duplicate the complete matrix.

S10 final-image thirteen-case deployment, operational restart/rollback and resource acceptance remain separate gates. This S08 PASS does not claim them complete or imply live-provider success.
