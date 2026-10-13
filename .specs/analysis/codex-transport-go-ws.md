# S07 Go WebSocket integration — author evidence

Status: implementation and focused author checks complete; independent S07 panel and S05 security dependency still determine acceptance. S08 full sidecar accounting and S10 application signal/restart tests are separate gates. No live credentials were used.

## Implementation

- Codex `DoWssRequest` uses the accepted sidecar dialer after normal adaptor/header overrides. Other providers and disabled Codex retain the existing dialer behavior. Typed sidecar failures retain their classification and SkipRetry through wrapping. Bounded real upstream handshake rejection bodies reach `RelayErrorHandler` before Close, preserving status/provider errors; enabled WS failures do not fall back or retry.
- The existing Responses session and per-create authentication/preconsume/usage/settlement state machine are reused. A private per-session binding hashes credential/account source, channel type/status/base URL, settings, model route/header overrides, and selected effective sidecar policy; user ID, API token ID and startup generation are also checked. No hash/token is logged or included in pool keys.
- Register the existing channel-close callback before dialing and re-read the database after handshake before sending the first create. Subsequent creates read current database state, avoiding stale channel cache reuse. The existing once-only shutdown closes active and idle connections; it never retries an ambiguous send. Same-value credential replacement still triggers notification, so A→B→A does not preserve an older authenticated socket.
- Existing successful `Channel.Update`, `Save`, `saveStatusState`, credential compare-and-swap and `EditChannelByTag` writes notify the existing local/Redis wsmanager. Notifications occur after successful persistence/CAS commit. The CAS lock and exact Go binding comparison are unchanged. Administrative updates conservatively close sockets even when a changed field would not require a new physical handshake; no second channel registry is introduced. Ability-update failure after a successful channel write does not suppress invalidation of the already changed credential/configuration.
- Existing wsmanager now also tracks unrouted/idle Responses handlers. Process shutdown closes hijacked sockets and waits for their original workers to complete within the same shutdown context, while HTTP Shutdown stops admission concurrently. The response handler only signals completion after its workers return. New session registration during drain closes immediately. No new accounting state machine or environment hot-reload API is introduced.

## Observed checks

1. `CODEX_TRANSPORT_TEST_BINARY=/tmp/codex-transport-s06-linux-arm64 CODEX_TRANSPORT_TEST_IMAGE=docker.m.daocloud.io/library/rust@sha256:c1e5f19e773b7878c3f7a805dd00a495e747acbdc76fb2337a4ebf0418896b33 bash tools/codex-transport/scripts/test-go-rust.sh` — PASS, network-disabled Linux ARM64 container, production Rust binary SHA256 `d5c1c7dd9b727f0180cfa068641100e1c929c06aaddeef99892315dda8a5f522`. Existing HTTP matrix plus actual Go→UDS→Rust→TLS WebSocket two-create echo, exact text/binary payloads, hop-local ping/pong, cancellation, two-account header/cancellation isolation, bounded 401 rejection body, and one physical attempt. Controller transport retry-budget test also PASS. No skipped cases in this runner. This fixture verifies the transport; its echoed creates are not an accounting test.
2. `go test -race ./service ./relay ./relay/channel ./pkg/wsmanager ./controller -run 'TestCodexTransport|TestResponsesWS|TestResponsesWebSocket|TestShutdown' -count=1 -timeout 180s` — PASS. Existing controller tests include serial creates with per-create middleware/billing and old-response duplicate-terminal isolation. New relay tests cover 11 binding differences and active/idle invalidation for 9 mutations, including successful CAS, tag-header edits and a failed CAS that leaves the socket alive. Registry shutdown test proves it waits for worker completion, cancellation bounds that wait, and drain rejects new sessions.
3. Real isolated binding database matrix: use the disposable container setup/cleanup from `scripts/test-auth-databases.sh`, substitute `TEST_CODEX_WS_SQL_DSN` and `go test ./relay -run '^TestCodexTransportResponses(ConnectionBinding|UpdateClosesActiveAndIdle)$' -v -count=1 -timeout=120s`. Executed as `/tmp/test-s07-bindings-databases.sh`; **87/87 subcases PASS**, no skips, containers removed. The test issues actual database version queries. SQLite 3.50.4; MySQL 8.0.46 (`mysql@sha256:7dcddc01f13bab2f15cde676d44d01f61fc9f99fe7785e86196dfc07d358ae2b`); PostgreSQL 16.15 ARM64 Alpine (`postgres@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea`). This checks real update/CAS/tag writes and socket invalidation, not the S08 separate-log accounting matrix. No schema/driver migration was added by S07.
4. Initial complete related package run `go test ./relay ./relay/channel ./controller ./service ./pkg/wsmanager ./model -count=1 -timeout 120s` — PASS. `go test ./relay/channel/codex ./relay/channel/openai ./relay ./controller ./service ./model ./pkg/wsmanager -count=1 -timeout 120s` — PASS after final S07 edits. `GOWORK=off go build ./...` — PASS after concurrent HTTP/WS shutdown change.
5. `go test -race ./service ./relay/... ./pkg/wsmanager -count=1 -timeout 180s` — FAILED on pre-existing `logger/logger.go:112` non-atomic counter increments and parallel tests calling `gin.SetMode` (channel, Gemini, Minimax). Full output `/tmp/s07-race.log`, reported to root for ownership/fix. No full C05 PASS is claimed from the focused race command.
6. `git diff --check` — PASS.

## Security references and remaining gates

Applicable guidance: OWASP Authentication, Session Management and OAuth Cheat Sheets cached under `/tmp/new-api-codex-guidance/`; project's ASVS 5.0.0 security table. Per-message authorization remains server-side and renewed by the existing runner, session credentials are not shared between clients, configuration/credential invalidation terminates existing authenticated transport, and metadata/logs contain no usable real credentials. S05's flow binding/single-use/re-authentication audit remains its separate mandatory gate; this report does not claim whole-project ASVS compliance.

Pending independent S07 reviews; final full C05 race after root resolves reported baseline races; S08 real sidecar→usage→accounting three-database invariants including zero-token fixed-price UsedQuota; S09 protocol/live-account checks; S10 complete deployed application restart/rollback/long-stream accounting. Standalone registry shutdown and synthetic echo tests do not replace those gates.

## Source snapshot

| File | SHA256 |
| --- | --- |
| `service/codex_transport.go` | `cfeab380f4dc72eb533ac175cd5352f3b817e571482eedd85951de608296a25e` |
| `service/codex_transport_test.go` | `e3757b01a0e2ca13fff006db8e2c72ddac21d66ab631a5f979fa08959c236be0` |
| `relay/channel/api_request.go` | `151ad0f14a9606358effc4ee31ba461983912a35b2fa2e3b04abad60c16953fd` |
| `relay/channel/api_request_test.go` | `d50d77040ebfd83ea66d4d8f5cb22b337f835fd9555a944dfa66b27f61f9f24f` |
| `relay/responses_websocket.go` | `5b6e4ee3b79eff022d596286e4312b013e46c227f7cf9849b219a74fc45a7599` |
| `relay/responses_websocket_test.go` | `a974ad9105f9e92b545e57502820b24563f31462c5a13d79d531e2aa33c8877d` |
| `model/channel.go` | `3e451294f5d898cec2243fe8b73ff816f4e54aa5c41464fe4dcb0e7c46f33282` |
| `pkg/wsmanager/wsmanager.go` | `7f5f955c0ab40e6fe43cfed611b5f15adf1bb7dda6ba4b755bb24aea4b76402a` |
| `pkg/wsmanager/wsmanager_test.go` | `6be4bcce2249590a914d3a04c2a0e07ab00a387405e53a4633060d43d381adc3` |
| `main.go` | `acdd1c19cada9db37151d37c7b8d09a568864f805f10a690a4eb4d4f2fc712f5` |

## S07 security review follow-up: partial-success invalidation

Independent security review identified persisted tag-disable and single-delete followed by ability-maintenance failure could return before the controller close notification. Fixed both at the successful channel-persistence boundary: `DisableChannelByTag` broadcasts immediately after status write, and `Channel.Delete` immediately after deletion. Later ability errors remain visible to the caller and no longer preserve authenticated sockets. The stale channel-type comment in `restoreConnectionContext` was corrected.

Expanded the existing active/idle table with actual missing-abilities-table failures for tag disable and single delete. Tests assert the status/deletion really persisted, both peers receive policy close, and repeat close finds no remaining entry. The analogous batch-delete test exercises the same real database failure but proves its transaction rolls back and the socket stays alive. Audit found `BatchDeleteChannels` commits atomically before controller notification; `DeleteDisabledChannel` has no subsequent fallible persistence before controller notification; `DeleteChannelByStatus` has no call sites. No new schema/driver behavior or separate closure registry introduced.

Executed after these fixes:

- `go test -race ./relay -run '^TestCodexTransportResponsesUpdateClosesActiveAndIdle$' -count=1 -timeout 120s` — PASS.
- `bash /tmp/test-s07-bindings-databases.sh` — **105/105 subcases PASS**, no skips: 11 binding differences + 12 mutations × active/idle, on each real SQLite 3.50.4, MySQL 8.0.46 and PostgreSQL 16.15 instance. Same image digests as recorded above; isolated containers removed. Log `/tmp/s07-db-bindings-fix.log`.
- `git diff --check` — PASS.

The 105-case rerun supersedes the earlier 87-case author matrix. Root owns the full C05 race rerun after unrelated baseline race repairs; independent security re-review is still required.

Updated source hashes (supersede these rows in the earlier snapshot):
- `model/channel.go` SHA256 `84931be161c852c43844f69a0533d80e9df48784248bf8bebe3e2c2261382e61`
- `relay/responses_websocket.go` SHA256 `c171983675da5ac7fa65c512477f28b968307edeeb0f8eb9d3035276377a553a`
- `relay/responses_websocket_test.go` SHA256 `28f3e8316fffd9c570bc9c08c1996ed967499e944b52096c4196981360ccc170`

## C05 full race follow-up

Observed `go test -race ./service ./relay/... -count=1 -timeout=180s` exit 0 after repairing pre-existing concurrency issues exposed by the full run. The logger counter and setup guard now use atomic operations; Gin test mode is set once at package initialization instead of concurrently inside tests; the slow-channel polling test snapshots upstream task IDs before GORM can mutate the task structs. These changes preserve production behavior and existing assertions. Full output retained outside the repository at `/tmp/codex-c05-race-root.log`. This result does not replace S08 sidecar accounting or S10 deployment acceptance. S07 partial-success invalidation findings remain open and require affected regression reruns.

Root follow-up evidence: `go test -race ./service ./relay/... -count=1 -timeout=180s` now PASS, exit 0, `/tmp/codex-c05-race-root.log`, after root repaired the logger atomic counter/rotation guard, Gin test-mode initialization and task-polling fixture ID snapshots. This supersedes the earlier full-C05 failure; the notification fixes additionally have the focused race and real three-database rerun above.


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
