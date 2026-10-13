# S08 real transport billing — author evidence

Status: implementation and author verification complete; independent billing, security/concurrency and database judges still required. No live account credentials used. Full application Docker drain/restart/rollback remains S10.

## Change and fixture

`service/text_quota.go` previously charged a positive `tier("request",2000)` expression to wallet/token while omitting user/channel UsedQuota and claiming that no charge was possible when upstream tokens were zero. The final settlement bookkeeping now recognizes a positive computed charge even with zero tokens. Pricing, usage normalization, reservation/refund, expression APIs and schema are unchanged. Zero tokens remain zero in consume logs. No newer `fixed(...)` architecture was imported.

Existing `controller/responses_websocket_test.go` gateway fixtures are reused. One consolidated additional file, `controller/codex_transport_billing_test.go`, starts the production Rust executable in an isolated child process, generates an ephemeral proper CA/leaf chain, initializes the immutable production transport once and switches the existing fixture to Codex+TLS. Every event comes from a real synthetic TLS upstream through Rust UDS and the original Go handler/usage parser/settlement workers. No direct Usage injection, transport mock or current-generation marker substitutes for this chain. Normal native regressions keep their existing path. The child isolates immutable startup and shutdown admission state from other tests.

`tools/codex-transport/scripts/test-databases.sh` compiles the actual Linux ARM64 controller executable, starts disposable MySQL/PostgreSQL instances plus an internal-network Linux runner, and supplies all four TEST_FIXED main/log DSNs mapped to actual-main TEST_RESPONSES_SQL_DSN/TEST_RESPONSES_LOG_SQL_DSN. SQLite uses two separate temporary physical database files. MySQL/PostgreSQL each use distinct `codex_billing` and `codex_billing_log` databases. The runner does not accept external production DSNs, fails on Skip/no-match, records image digests and executable hashes, and cleans up containers/network. It independently reruns the S05 auth matrix on every engine after billing.

## Exact invariants

All ordinary fixtures start wallet100000/token3000. A1000 charge leaves wallet99000/token2000, user/token/channel UsedQuota1000 and one consume log. The shared assertion checks exact log count/charges, both balances, all three usage counters and user request count.

- 16 WS/SSE outcome cases: failed/null/missing usage; actual usage1000/10; estimated `hello` output0/1; upstream/business error; output-limit1000/1; explicit zero0/0. Every case asserts the exact log token counts. Fixed positive charges retain zero reported tokens and no false “cannot charge” log message.
- Interrupted WS timeout, SSE timeout and SSE client cancel retain the existing1000 fixed charge after delivered output. Native truncated SSE carries estimated0/1 tokens, one1000 charge and exactly one upstream attempt despite configured retry budget3; client output contains neither fabricated `response.completed` nor `[DONE]`.
- JSON success1000/10 and JSON zero-token fixed charge0/0 exercise the real HTTP response parser.
- Initial WS rejection observes token2990 after10 reservation, then restores token3000/wallet100000 with zero usage counters/consume logs. HTTP400 rejection observes token2000 after1000 reservation and proves the same complete refund.
- Multi-create: one physical WS, first1000 then2000 charge, exactly two logs, token0/wallet97000. Old duplicate terminal cannot contaminate the second call; third call is rejected before upstream. Existing per-call request IDs and reported1000/10 tokens are checked.
- Client disconnect after delivered output charges1 exactly once. Active channel disable and process-level wsmanager shutdown each observe1000 reservation, close actual sidecar sockets, wait for original billing workers and settle1000 once; repeated close leaves log/counters unchanged.
- Saturated upstream input4294967294 settles exactly2147483647, never a negative credit. This case raises initial budgets by2147483647; remaining wallet100000/token3000 and every usage counter/log equal2147483647. Admin log contains overflow/clamped2147483647; public token-log API strips both admin_info and quota_saturation.
- HTTP/WS preconsume saturation rejects400 before sending; finite insufficient budget rejects403 before sending. Both preserve exact balances and zero counters/consume logs. Sidecar frame/connection/memory admission exhaustion itself remains covered by S06; this matrix specifically covers billing-budget refusal rather than pretending to repeat the resource stress matrix.

## Observed commands and results

```sh
CODEX_TRANSPORT_TEST_BINARY=/tmp/codex-transport-openssl364-image-linux-arm64 \
  bash tools/codex-transport/scripts/test-databases.sh

go test -race ./controller -run '^TestResponses' -count=1 -timeout=120s
git diff --check
```

All PASS, exit0. Full matrix output: `/tmp/s08-matrix-final.log`; native focused race: `/tmp/s08-controller-race-final.log`. Billing matrix has35 leaf checks per engine (34 full-chain/refusal scenarios plus one independent-database/version check):105/105 PASS, no Skip. S05 authentication rerun27 per engine:81/81 PASS, no Skip. The controller race command exercises native fixture regressions; do not mislabel it as a Linux Rust race-instrumented execution. Root separately owns full C05 and full-root regression after this production change.

| Database | Observed main and independent log version | Image digest |
|---|---|---|
| SQLite | 3.50.4 / 3.50.4, separate files | pure-Go driver in controller binary |
| MySQL | 8.0.46 / 8.0.46 | `mysql@sha256:7dcddc01f13bab2f15cde676d44d01f61fc9f99fe7785e86196dfc07d358ae2b` |
| PostgreSQL | 16.15 /16.15, aarch64 Alpine | `postgres@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea` |

Linux fixture image: `docker.m.daocloud.io/library/rust@sha256:c1e5f19e773b7878c3f7a805dd00a495e747acbdc76fb2337a4ebf0418896b33`.
Rust binary SHA256: `5f146857df6f66acc75e04faf1ea152bdb1824f2e21a3f4b6e3f5375f1dd1f6d`, extracted from actual `codex-transport:openssl364` production image (OpenSSL3.6.4). There are no schema/driver changes, so this is settlement/data-path verification, not a claimed migration-upgrade matrix.

Earlier author runs initially failed for two fixture assertions: initial startup fixture used a too-long UDS test directory (fixed with a short ephemeral directory); initial assertion expected403 for saturation, but the existing pricing guard correctly rejects400 before preconsume (separate finite insufficient-budget403 cases now present). Neither required changing production transport or billing safety policy.

Final Linux controller test executable SHA256: `3ece30dda9282242552a14e1fca682510e0a5f1d82a9840960e9512c0bf3c442`.

Root independently observed PASS/exit0 after the production freeze: `go test -race ./service ./relay/... -count=1 -timeout=180s` (`/tmp/codex-s08-c05-race.log`), full `go test ./...` (`/tmp/codex-final-root-tests.log`), and `GOWORK=off go build ./...` plus `GOWORK=off go test ./...` inside relaykit (`/tmp/codex-final-relaykit-tests.log`). Subsequent author changes only strengthened controller assertions/fixture retry budget.


## Superseding S08/S10 generation and shutdown acceptance (2026-10-14)

This section supersedes earlier generation, shutdown, binary hashes and matrix totals above. A security review reproduced an older response (generation 1 after generation 2 completed) contaminating generation 3. Responses sessions now retain SHA256 identities for every admitted generation, reject historical/mismatched created/progress/terminal frames, and preserve correlated control errors. They close after settlement when a terminal has no stable response ID, or after 1024 admitted IDs; no history eviction permits old IDs to re-enter. Tests cover arbitrary older generations both before and after current created, exact accounting, no-ID completion, and closure only after the original worker returns.

HTTP shutdown now tracks complete admitted handler lifetimes, cancels request contexts after the grace deadline, and waits another bounded 10 seconds for original settlement workers. Failure to drain is explicit/nonzero. After workers finish, the batch updater stops scheduling, waits for in-flight SQL without cancelling it, and serializes a final flush with a separate 10-second deadline. Scheduler cancellation never cancels additive SQL or authorizes replay. Periodic database failures retain the pre-existing no-replay behavior: errors are logged, failed snapshots are not automatically requeued, and subsequent new snapshots remain processable. A final-flush failure returns an error and main exits nonzero. Database-write failures require reconciliation; this change does not provide crash/SIGKILL durability or exactly-once guarantees for ambiguous remote commits, nor redesign unrelated scheduled-task lifecycle.

Commands actually observed PASS/exit0 after the production freeze:

```sh
go test -race . ./relay ./controller -run '^TestShutdown|^TestResponsesWSHistoryLimit|^TestResponsesWebSocket' -count=1 -timeout 120s
go test -race ./model ./controller -run '^TestBatchShutdown|^TestCodexBatchFinalFlush' -count=1 -timeout 120s
CODEX_TRANSPORT_TEST_BINARY=/tmp/codex-transport-s06-linux-arm64 bash tools/codex-transport/scripts/test-databases.sh
```

Logs: `/tmp/s08-s10-current-focused-race.log`, `/tmp/s10-batch-no-replay-race.log`, `/tmp/s08-s10-no-replay-final-databases.log`. The final real-Docker database matrix has **117 billing leaves (39 per engine), 81 authentication leaves (27 per engine), and 6 batch shutdown cases (2 per engine)**, with no failures/skips. Script summary grep repeats selected PASS lines; those are not additional tests. Engines: SQLite 3.50.4, MySQL 8.0.46, PostgreSQL 16.15 aarch64 Alpine; image digests remain those recorded above. Billing uses separate real main/log databases. Batch tests prove waiting behind an earlier snapshot, including later settlement exactly once, and no replay of an errored snapshot after recovery while new deltas still persist. The healthy final-flush full-chain case verifies wallet/token/user/channel/log equality and repeat-flush idempotency.

During fixture qualification, one runner grep still referenced the renamed batch test and the MySQL fixture reused the unique empty affiliate code after soft deletion. Both harness issues were corrected and the entire matrix rerun; no production change was required. Rust readiness now waits for socket permissions 0600 in addition to existence, avoiding a bind-before-chmod fixture race.

Final executable SHA256:
- Rust: `d5c1c7dd9b727f0180cfa068641100e1c929c06aaddeef99892315dda8a5f522`
- Linux controller test: `1323bf4ef007b8f9bfccde2804f0bac7d34235e5753ca35038072bc12e0f57cc`
- Linux model test: `82066a0ee0e1cb6ad8dd30c171f247bf68aa3d4fac76422c2a354aabb971484c`

Production source SHA256 at this freeze:
- main.go: `2d99c998ef846b9516b3c4bbf65fabb071106f794f2fa0619fe12a8c53a94b28`
- model/utils.go: `203e90350a8f3b042c854082881b4e0bcf661f7bb5254d26ae074fba9965725b`
- relay/responses_websocket.go: `a6cf6ef02b35c58f34f4ef916f2820f3607fca1d85eb5afc2226a0f308712554`

Full root/C05 reruns, rebuilt application Docker shutdown acceptance, and independent Judge verdicts are separate root-owned gates; earlier runs do not substitute for those final gates.


### S10 startup signal registration follow-up

The actual deployment harness exposed readiness before signal-handler registration: a new process could answer `/api/status`, admit a request, then receive SIGTERM during the original 100ms startup-log delay and exit without settlement. `main.go` now registers buffered SIGINT/SIGTERM notification **before starting the HTTP listener**, and defers `signal.Stop`. The deployment harness remains immediate-stop, with no sleep added to hide the race. `go test -race . -run '^TestShutdown' -count=1 -timeout 120s` PASS/exit0 (`/tmp/s10-signal-order-shutdown-race.log`); `git diff --check` PASS. This ordering-only change does not affect the final database matrix above. Superseding main.go SHA256: `b5b60a9717800745ea6d56e04d184a714a1fd02f3d5027acc260f7825f48dd8a`. Rebuilt-image deployment verification is still a separate operations gate.
