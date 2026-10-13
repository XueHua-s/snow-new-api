# S08 independent accounting judge

Verdict: **PASS**, weighted score **4.7025 / 5** (threshold 4.5). No blocking accounting finding. This is one independent S08 panel opinion; it does not replace the security/concurrency or database judges, S09 live gates, or S10 deployment acceptance.

The reviewer read the complete governing `.agents/rules/billing.md` from the original worktree and the actual-main `pkg/billingexpr/expr.md` before reviewing. No production edits or live credentials were used.

| Criterion | Weight | Score | Evidence |
|---|---:|---:|---|
| Once-per-call termination, exact balances/reservation/refund/log | .35 | 4.70 | Shared assertion checks literal expected charges, log count, wallet and token remaining, all three UsedQuota counters and user request count. Multi-create charges 1000 then 2000; old terminal ignored; third create rejected before upstream. HTTP and WS rejected requests show reservation then full refund. |
| Failure/cancellation/missing usage/duplicate termination | .25 | 4.65 | Sixteen WS/SSE outcomes, delivered-output disconnect, timeout/cancel and truncated SSE; original estimation semantics retained. Repeated channel-close and old terminal events do not create extra logs or deductions. |
| Three real databases with independent logs and actual chain | .25 | 4.75 | Independently reran disposable Linux matrix: 105 billing leaf checks plus 81 auth checks, no skips. Real Rust process, trusted ephemeral TLS upstream, UDS, original Go response parser and billing workers; separate physical log databases. |
| Saturation and audit invariants | .15 | 4.70 | Oversized upstream input clamps to 2147483647; exact remaining balances prove no credit/wrap. Admin saturation marker and public log stripping asserted. HTTP/WS saturation and finite-insufficient-budget refusal leave balances unchanged and send no upstream request. |

## Accounting assessment

The production change is narrowly correct: `PostTextConsumeQuota` now treats a nonzero final computed quota as billable when upstream token counts are zero. The tiered evaluator has already produced the charge at this point; the change reconciles user/channel aggregation with existing wallet/token settlement and removes an incorrect cannot-charge explanation. It does not invent token usage or change expression pricing, normalization, reservation, schema or drivers.

Expected charges are independent literal values, not obtained from the production calculator. The fixture sets QuotaPerUnit=500000 and group ratio=1. Thus `tier("request",2000)` costs 2000/1000000*500000=1000, input 1000 at coefficient2 costs1000, priority coefficient4 costs2000, and estimated single output token at coefficient2000 costs1000. Multi-create leaves initial wallet100000 at97000 and token3000 at0, with aggregate counters3000 and two logs. The saturation case deliberately increases initial budgets; its exact remainder assertions still distinguish a clamped charge from overflow or undercharge.

For missing/failed/partial streams the matrix verifies the host's existing estimated/fixed-expression settlement behavior; cancellation is not treated as automatically free. Truncated SSE verifies one attempt despite retry budget3 and absence of fabricated completed/DONE output. Refund cases inspect the reservation while upstream is active before checking restoration. Fixtures wait for original handler/worker completion before inspecting accounting; they do not inject Usage directly.

## Independently observed verification

Executed from `/tmp/new-api-codex-plan-pr`:

```sh
go test ./controller -run '^(TestResponsesStreamOutcomesPreserveAccounting|TestResponsesWebSocketReusesConnectionAndSettlesEachRequest|TestResponsesWebSocketInitialUpstreamRejectionRefundsReservation|TestResponsesInterruptedStreamAccounting)$' -count=1 -timeout=120s
CODEX_TRANSPORT_TEST_BINARY=/tmp/codex-transport-openssl364-image-linux-arm64 bash tools/codex-transport/scripts/test-databases.sh
```

Both exit0. Focused native regression: PASS,3.216s (`/tmp/s08-judge-accounting-focused.log`). Independent full-chain matrix (`/tmp/s08-judge-accounting-matrix.log`): SQLite3.50.4, MySQL8.0.46, PostgreSQL16.15; each main/log pair reports the same engine version and uses distinct physical databases. 35 billing leaf checks per engine,105 total;27 auth checks per engine,81 total; no SKIP or FAIL. Billing runs took4.84s/4.02s/10.37s respectively.

Rust SHA256: `5f146857df6f66acc75e04faf1ea152bdb1824f2e21a3f4b6e3f5375f1dd1f6d`.
Linux controller executable SHA256: `3ece30dda9282242552a14e1fca682510e0a5f1d82a9840960e9512c0bf3c442`.
MySQL image: `sha256:7dcddc01f13bab2f15cde676d44d01f61fc9f99fe7785e86196dfc07d358ae2b`.
PostgreSQL image: `sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea`.
Runner image: `sha256:c1e5f19e773b7878c3f7a805dd00a495e747acbdc76fb2337a4ebf0418896b33`.

## Boundaries

Native focused tests are not described as Rust race execution. Root's separately observed full C05 and root/relaykit regressions supply the broader checks; this reviewer independently reran the accounting chain and native cases above. Main/log independence is exercised for settlement, not a migration claim: no schema or driver changes were made. Resource-admission exhaustion belongs to S06; this matrix covers quota-admission refusal. Handler-level shutdown and invalidation are covered here; full application Docker process restart, operational drain, resource sizing and rollback remain S10. No claim of crash-atomic settlement across separate databases or live-provider verification is made.


## Final S08 source re-review after lifecycle and batch corrections

Verdict reaffirmed: **PASS, 4.7025 / 5**; criterion scores remain4.70/.35,4.65/.25,4.75/.25,4.70/.15. This supersedes the original review's source snapshot while retaining its independently executed evidence above. No S10 completion claim is made.

Reviewed latest `relay/responses_websocket.go`, `main.go`, `model/utils.go`, and added controller/model regression cases. Response history retains hashes of all admitted IDs within a session and the first accepted response ID cannot be rebound; old generation1 events on generation3/4 cannot replace usage or output. Terminal-before-created remains accepted. A missing correlation ID or full history closes only after original settlement returns; the default bound is1024 and does not evict an old ID for reuse.

The new four-generation cases use literal charges100,200,300,400: input tokens100/200/300/400 at coefficient2 and QuotaPerUnit500000 imply total1000. Their shared assertion therefore requires wallet99000, token2000, user/token/channel UsedQuota1000, four requests/four logs, with each log's original prompt quantity and separate request ID. Deliberately stale999-token and unrelated888-token responses would fail these expectations. Both created-first and terminal-first paths pass. An unidentified100-token terminal settles100 exactly once before normal close.

Batch final-flush regression observes zero queued UsedQuota before flush, then requires the same full accounting tuple for one1000 charge; repeated shutdown cannot apply it twice. Serialized flush excludes overlapping snapshots. The prior-flush barrier test applies100 plus later200 exactly once (300 after both shutdown calls). The failure test preserves a successful user100 update while an independent channel write fails, then applies only new channel200 after recovery; it does not replay the ambiguous old additive snapshot. This deliberately preserves no-replay semantics, not transactionality or guaranteed recovery after database failure. Main stops admission, drains or cancels-and-waits for handlers, then final-flushes; timeout/error is reported instead of claiming clean completion. Stopping the scheduler does not cancel in-flight additive SQL.

Independently executed latest focused tests:

```sh
go test ./controller ./model -run '^(TestResponsesWebSocketRejectsArbitraryOlderGenerations|TestResponsesWebSocketUnidentifiedTerminalSettlesThenCloses|TestCodexBatchFinalFlush|TestBatchShutdownWaitsForPriorFlushAndIncludesLaterSettlement|TestBatchShutdownFailureDoesNotReplayAndAllowsLaterUpdates)$' -count=1 -timeout=120s
```

PASS/exit0: controller0.771s, model0.601s; `/tmp/s08-accounting-final-rereview.log`.

Inspected final root matrix `/tmp/s08-s10-no-replay-final-databases.log`:117 billing leaf checks,81 auth checks and six batch engine checks, no skips/failures, SQLite3.50.4/MySQL8.0.46/PostgreSQL16.15. This latest lifecycle matrix records Rust `d5c1c7dd9b727f0180cfa068641100e1c929c06aaddeef99892315dda8a5f522`, controller `1323bf4ef007b8f9bfccde2804f0bac7d34235e5753ca35038072bc12e0f57cc`, model `82066a0ee0e1cb6ad8dd30c171f247bf68aa3d4fac76422c2a354aabb971484c`. It must not be relabeled as the final-image5f146 run: that distinct executable was independently exercised in the earlier105-case matrix above. The database reviewer/root owns any subsequent final-image refresh of this expanded matrix. Focused re-review does not substitute for application Docker deployment, restart/rollback or live-provider testing.


### Final production-artifact matrix acceptance

The artifact-specific evidence gap is now closed. Inspected database judge's independent `/tmp/s08-judge-databases-production-final.log`:117 billing leaf checks,81 authentication checks and both batch regressions on each of three engines (six actual batch executions; runner repeats PASS summary lines). No SKIP or FAIL. The database judge reports command exit0.

The final log explicitly records production Rust SHA256 `5f146857df6f66acc75e04faf1ea152bdb1824f2e21a3f4b6e3f5375f1dd1f6d`, with the same frozen controller `1323bf4ef007b8f9bfccde2804f0bac7d34235e5753ca35038072bc12e0f57cc` and model `82066a0ee0e1cb6ad8dd30c171f247bf68aa3d4fac76422c2a354aabb971484c` executables. This supplies final-image evidence for the expanded lifecycle/batch matrix and supersedes the earlier d5c1 artifact limitation without relabeling that historical run. **S08 accounting PASS4.7025/5 is reaffirmed for the final production artifact and frozen source.** S10 and live-provider gates remain separate.
