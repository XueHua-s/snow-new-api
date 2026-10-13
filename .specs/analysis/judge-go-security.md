# S04 independent security panel review

Date: 2026-10-14. Reviewer: judge_go_security; not the implementation author. Verdict: **PASS for S04 only, 4.735 / 5**, all S04 hard gates supported. This does not accept S05 OAuth/management, S06/S07 WebSocket business integration, S08 billing/database accounting, S09 live traffic/fingerprints, or S10 deployment.

## Review scope and rubric

Reviewed actual-main implementation at `/tmp/new-api-codex-plan-pr`: `service/codex_transport.go`, its consolidated tests, `common/init.go`, `common/json.go`, `main.go`, `relay/channel/api_request.go` and existing tests, and `controller/relay_cancel_test.go`. Compared the frozen README/structured contracts and S04 task rubric with the author evidence, then independently executed tests. No implementation changes were made.

| Criterion | Weight | Score | Evidence |
| --- | ---: | ---: | --- |
| Disabled switch and exact non-Codex isolation | .25 | 4.75 | Default false in InitEnv; immutable initialized snapshot; disabled API returns existing client and disabled Auth keeps legacy 20s helper; relay selection uses explicit Codex channel type; enabled WS currently fails closed. Startup/default and real channel-selection tests pass. |
| errors.As / SkipRetry and send-stage counts | .30 | 4.80 | Fixed-enum error decoding, safe typed errors extracted through url.Error; body adapter preserves SkipRetry before provider conversion. Actual controller middleware/adaptor loop with retry budget 3 makes 4 attempts for ordinary upstream 503 and exactly 1 for pre-send, uncertain send, IPC disconnect, compact truncation, native SSE truncation and collected SSE truncation. |
| First event / body close / cancellation propagation | .25 | 4.70 | Actual Go→UDS→Rust→TLS test uses producer/consumer barriers, delivers first chunk before completion, closes unfinished upload for early 413, propagates cancellation upstream and reports truncation as error; race lifecycle tests pass. |
| Existing client and adaptor regressions | .20 | 4.65 | Independent focused race service/channel/controller PASS; disabled legacy client identity, non-Codex direct target count, header override, upstream response semantics and strict framing cases reviewed. Author full three-package suite evidence supplements focused rerun; full final feature matrix remains future work. |

Weighted sum: .25×4.75 + .30×4.80 + .25×4.70 + .20×4.65 = **4.735**, above 4.5. Scores apply to the complete S04 rubric, not only security.

## Security and hard-gate findings

- **PASS: private metadata and credential boundary.** Metadata is rebuilt after caller overrides; all case-insensitive `X-Codex-Transport-*` fields and hop-by-hop/Connection-nominated fields are stripped. Authorization remains per-request data, not local public control. Strict codec rejects duplicate keys, unknown fields, malformed shape and excessive nesting. Raw headers use bounded base64 values. Concurrent actual-Rust identities return only their own Authorization/Cookie values; no cookie jar is installed.
- **PASS: safe errors.** The relay extracts only CodexTransportError instead of logging the enclosing url.Error with target query. Error codes/phases are allowlisted. Enabled Codex request URL debug logging is suppressed; remaining transport debug fields contain target host/protocol/policy, not query, proxy credentials or payload. Synthetic secret sentinel checks pass. Future management callers must perform the same safe extraction: S04 cannot establish S05 caller safety before integration.
- **PASS: TLS, proxy, startup and UDS.** Enabled mode rejects global/effective-base insecure TLS, incompatible profile/production/platform/capabilities/limits. Proxy environment and CA content are captured at initialization; explicit per-channel proxy takes precedence and WSS proxy selection uses HTTPS semantics. Auth target is fixed. UDS has absolute non-symlink path, owner/mode checks at startup and dial, no TCP fallback. The same-UID process boundary is trusted; this is not isolation from a malicious process running as that same user. Actual Linux wrong-name TLS request fails before HTTP request count increases.
- **PASS: no hidden replay/direct fallback.** Local Go transport uses non-replayable POST, nil GetBody and disabled keepalive; upstream pooling stays in Rust. Disabled mode deliberately retains legacy behavior. Enabled failures never select direct fallback. Both local and real-Rust request counts are exercised; actual outer business retry loop is separately tested with precise synthetic UDS faults.
- **PASS: framing correction verified.** Every Content-Length value across case variants is validated before stripping. Conflicting, invalid, empty, signed and comma-joined values reject; identical values remain accepted. The compact body-error wrapper preserves a sanitized typed NewAPIError, addressing the formerly observed 4-attempt replay. Completion trailer and expected transferred length are checked; HEAD/304 representation length is distinct from body length.
- **PASS: capability/profile generation counts.** Incompatible health callback explicitly fails if any upstream route is invoked. Real-Rust request-limit, wrong-name certificate and unavailable-WS cases assert zero upstream HTTP requests; profile mismatch fails initialization before activation.

Applicable guidance considered: OWASP Authentication and Session Management Cheat Sheets (credential transport, no secret logging, identity separation), ASVS stable 5.0.0 V12.3.1/12.3.2 (secure upstream transport and certificate validation). Local IPC is permission-restricted same-host UDS, not a claim of full ASVS service-to-service TLS compliance. No login/session/OAuth change is accepted by this report; S05 must separately prove binding, replay prevention and authorization controls.

## Independently observed verification

1. In actual implementation tree:

   `go test -race ./service ./relay/channel ./controller -run CodexTransport -count=1 -timeout=150s`

   PASS: service 1.836s, relay/channel 2.493s, controller 2.860s. Optional real-process test is unconfigured on Darwin and is not counted as Linux evidence.

2. Separate disposable container, no network, no repository/home/credential mounts:

   `docker run --detach --name codex-s04-security-review --network none docker.m.daocloud.io/library/rust@sha256:c1e5f19e773b7878c3f7a805dd00a495e747acbdc76fb2337a4ebf0418896b33 sleep infinity`

   `docker cp /tmp/codex-service-linux-arm64.test codex-s04-security-review:/tmp/service.test`

   `docker cp /tmp/codex-transport-s03-linux-arm64 codex-s04-security-review:/tmp/codex-transport`

   `docker exec codex-s04-security-review sha256sum /tmp/service.test /tmp/codex-transport`

   Observed service hash `2f97c4761806821374af2e2e14416a455ddf042575e24f3dbe321489a2e8e765`, Rust hash `a6cb5ba9c171f69d7b4bdfa12d826893d83178850c0df79b6e95e09ffddc0a36`, matching frozen author artifacts.

   `docker exec --env CODEX_TRANSPORT_TEST_BINARY=/tmp/codex-transport codex-s04-security-review /tmp/service.test -test.run '^TestCodexTransportRustProcess$' -test.v -test.timeout 120s`

   **13 subtests PASS, no skips, 0.06s**: status/headers/body count; >1 MiB body; incremental response; incremental upload; one-attempt redirect; truncation; early 413; upstream cancellation; actual HTTP/2; concurrent identity isolation; limit-before-dial; certificate name; capability failure. Synthetic CA and leaf are generated by the fixture; no real credential or live service is involved.

   `docker rm --force codex-s04-security-review` — PASS, disposable container removed.

## Remaining scope limitations

No S04 blocker found. Positive header-timeout starts at validated body handoff rather than final socket flush, as explicitly documented in the accepted contract; zero default is unaffected. HTTP resource bounds and production platform restrictions remain explicit compatibility limits.

Native SSE truncation currently returns the existing usage accumulator with StreamStatus failure, rather than inventing clean completion. The retry test proves no replay or fabricated completion marker, **not correct settlement**. Its accounting consequences and existing zero-usage UsedQuota issue remain S08 gates with real SQLite/MySQL/PostgreSQL. Management/auth entrypoints are still S05; enabled business WS intentionally unavailable until S07. No overall feature, live-account, database-compatibility or deployment completion is claimed.
