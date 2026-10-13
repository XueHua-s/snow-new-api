# S04 Go adapter implementation evidence

Date: 2026-10-14. Implementation worktree: `/tmp/new-api-codex-plan-pr`; target repository `XueHua-s/new-api`, based on actual `main` plus the separately reviewed Responses prerequisites. This is S04a/b implementation/local verification evidence, **not S04 acceptance**, cross-process Rust validation, a database result, or a live-account result.

## Scope

- `common/init.go`: default-off startup environment (`CODEX_TRANSPORT_ENABLED`, `CODEX_TRANSPORT_SOCKET`, `CODEX_TRANSPORT_PROFILE`, optional `CODEX_TRANSPORT_CA_FILE`).
- `service/codex_transport.go`: immutable startup snapshot, startup health/profile/platform/policy checks, restricted UDS ownership/modes, centrally resolved effective policy and environment proxy/NO_PROXY, fixed API/Auth purposes, standard streaming HTTP response adapter, completion trailer/length checks, sanitized typed errors, HTTP redirect prohibition, and pure WS adapter with bounded rejection diagnostics and cancellation lifecycle.
- `common/json.go`: explicit strict codec wrapper rejects duplicate object names, unknown fields, trailing JSON and nesting above 64. Service wire validation separately requires exact case-sensitive names, required nullable fields and two-element header pairs.
- `main.go`: calls `InitCodexTransport` before serving; enabled initialization errors propagate to existing fatal startup handling.
- `relay/channel/api_request.go`: only explicit Codex HTTP requests select the new client. Metadata is constructed after caller overrides. Transport errors are extracted through `url.Error`, retain only the safe typed error and receive `ErrOptionWithSkipRetry`; no direct fallback. Enabled Codex WS currently fails explicitly before the direct dialer; S07 owns business WS wiring. Ordinary provider paths remain unchanged.
- Tests are consolidated in the one new `service/codex_transport_test.go` and existing `relay/channel/api_request_test.go`.

Go-to-UDS uses an opaque non-replayable POST body, nil GetBody, no idempotency control headers, and disabled local connection reuse. This conservatively prevents local stale-socket replay while Rust retains its upstream pool. It sends internal `TE: trailers`; business hop headers remain stripped. Upstream bytes are never encoded into metadata or buffered in full.

Closing a response cancels local/upstream work without draining. A race test caught early-final-response handling where closing a blocked upload caused net/http to close the response socket. The adapter now marks an authoritative early response before closing the source and translates only this deliberate interruption into local upload EOF; unrelated source errors remain failures. The targeted race test was rerun 10 times after the fix.

`ErrOptionWithHideErrMsg` replaces the underlying error, so it is deliberately not applied to the already sanitized Codex error. This preserves errors.As and SkipRetry classification without exposing URL query, proxy userinfo or request data.

## Verified local contracts

The deterministic fake-UDS tests exercise actual Go HTTP/WebSocket sockets and cover:

- 200/302/401/503 status, exact compressed bytes, escaped path/query, duplicate headers, hop/control stripping, standard Response fields and redirect non-following.
- Required completion trailer; missing/wrong completion and short/long payload failures; HEAD/204/304 representation-length semantics.
- Exact wire field names, duplicate/unknown/missing fields, invalid tuple shape/null/type, trailing JSON, nesting and metadata bounds.
- Header obs-text fidelity, CRLF/NUL rejection, individual/aggregate/pair bounds.
- API/Auth policy separation, effective inherited defaults, HTTP1/shard normalization, channel header timeout, WS handshake/no-total timeout, explicit proxy and wss→https NO_PROXY lookup.
- Startup snapshot immutability; disabled legacy API/Auth behavior; wrong profile/insecure/invalid limits/socket modes/symlinks; non-production or missing health capability rejection.
- Safe typed error through url.Error, local unavailability without direct fallback, upload closure on validation failure, upload-size enforcement, cancellation and early 413 interruption.
- WS explicit capability rejection, bounded reconstructed 401 rejection body/flags, active connection Close and context cancellation.
- Enabled relay selection in an isolated child process (production startup state is not hot-reset), header overrides reaching metadata, received upstream 503 preservation, transport SkipRetry and one local attempt, enabled WS no direct fallback, and ordinary OpenAI/Claude channel isolation.

## Commands and results

Run in `/tmp/new-api-codex-plan-pr`:

- `go test ./service -count=1 -timeout=180s`: PASS.
- `go test ./service ./relay/channel -count=1 -timeout=180s`: PASS (full packages, not only transport tests).
- `go test -race ./service ./relay/channel -run CodexTransport -count=1 -timeout=120s`: PASS before final follow-up changes; final rerun recorded below.
- `go test -race ./service -run TestCodexTransportEarlyResponseClosesUpload -count=10 -timeout=90s`: PASS after the early-response race fix.
- `go test . -run '^$' -count=1`: PASS compilation; root has no tests.
- `git diff --check`: PASS.
- `CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go test -c -o /tmp/codex-service-linux-arm64.test ./service`: PASS initial build; latest rebuild recorded below.
- `CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go test -c -o /tmp/codex-channel-linux-arm64.test ./relay/channel`: PASS initial build; latest rebuild recorded below.

## Remaining gates and handoff

S04c must execute actual Go→Rust→TLS upstream tests in one Linux kernel, including the startup production health check, upload/response streaming, cancellation, early failures, response-body failures and exact attempt counts. Darwin cannot connect to a UDS inside Colima and must not bypass production health. The pure-Go SQLite dependency permits Linux ARM64 test-binary cross-compilation without CGO. Binary paths above are local temporary artifacts, not repository deliverables. A future `CODEX_TRANSPORT_TEST_BINARY` integration test can spawn Rust with a fresh socket directory, create a synthetic TLS upstream/CA at runtime, and fail when explicitly configured but unusable; a missing optional integration env must be reported as skipped, never as acceptance.

S05 retains the legacy `getCodexOAuthHTTPClient` helper for Claude/disabled Auth; replacing it with a call back to GetCodexHTTPClient would recurse. Only explicit Codex management callers should select the new Auth/API client.

S07 still owns enabled WS business integration and session/generation binding. S04c/S07 must follow transport read errors through existing relay parsing to prove they cannot regain retry permission. No new billing behavior, prices, database schema or authentication flow state was implemented here. Auth-flow controls, three-engine databases, billing, Rust wire/fingerprint behavior, actual Docker deployment and live credentials remain separate required gates. No real credentials were consumed or copied.

Applicable security references are OWASP Authentication and Session Management cheat sheets and ASVS stable 5.0.0 V10/V12 (10.1.1 token exposure and 12.3.2 certificate validation). This adapter enforces fixed Auth target, no redirects, strict verification and safe errors; actual Rust TLS and complete OAuth-flow security are not claimed by these local Go tests.

## Final S04a/b handoff update

The final targeted race run after the early-response fix and the S03-discovered header-cap correction passed:

`go test -race ./service ./relay/channel -run CodexTransport -count=1 -timeout=120s`

Observed: service PASS (3.628s), relay/channel PASS (3.929s). The complete service/channel suites had passed immediately before the header-cap-only correction (3.840s / 1.026s). The corrected cap boundary cases are included in the final race run. Protocol caps now match the revised fixture exactly: 100 pairs, 8192 bytes per value, 12288 aggregate name/value bytes; HTTP/2 library SETTINGS are not modified by Go to accommodate oversized application headers. Enabled oversized headers fail explicitly.

Both Linux ARM64 test binaries were rebuilt successfully after the correction using the two cross-compile commands above. They are ELF aarch64 statically linked executables. They contain the local/unit tests only: the dedicated real-Rust subprocess S04c integration test remains to be added in the next authorized continuation, followed by an actual same-container run. No Linux runtime, Docker deployment, Rust cross-process or live-account PASS is claimed here.

Implementation ownership is retained pending root follow-up; no commit, push or PR was performed by this agent.

## S04c fixture prepared (not executed against Rust yet)

`TestCodexTransportRustProcess` is now in the existing service test file. With an explicit `CODEX_TRANSPORT_TEST_BINARY` absolute path it requires Linux ARM64, starts the actual production Rust executable as a child, waits for its restricted socket, and calls the real `InitCodexTransport` with runtime-generated synthetic TLS trust. It has no production/profile bypass. The subprocess receives only socket/HOME/PATH configuration, no real account credentials.

Prepared scenarios: preserved 503/body/duplicate/control headers and escaped query with exact upstream count; payload greater than the former 1 MiB POC limit; blocked streaming upload and response first-chunk barriers; redirect zero-follow; upstream truncated body; early 413 canceling an unfinished declared-length upload; cancellation propagated to the upstream; configured request limit before dial; certificate-name verification; startup profile mismatch and absent-WS capability with no upstream attempt. Temporary CA/socket/process cleanup is registered; process termination diagnostics are checked against a synthetic secret sentinel.

Preparation checks actually run:

- `go test -race ./service -run CodexTransport -count=1 -timeout=120s`: PASS local cases, real-process test skipped because no binary environment was provided.
- `go test ./service -run '^TestCodexTransportRustProcess$' -count=1 -v`: explicit SKIP (`real Rust integration not configured: set CODEX_TRANSPORT_TEST_BINARY`), not acceptance.
- `CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go test -c -o /tmp/codex-service-linux-arm64.test ./service`: PASS with the new fixture included.
- `git diff --check`: PASS.

Do not report the prepared scenarios as runtime successes. The first actual Go→Rust execution is deliberately pending S03 author final handoff and root scheduling approval. After copying the service binary into the Linux Rust build container, run it from the repository `service/` directory with `CODEX_TRANSPORT_TEST_BINARY=<absolute Rust executable> ./<service-test-binary> -test.run '^TestCodexTransportRustProcess$' -test.v -test.timeout 120s`. A configured unusable binary is a failure, not a skip. The final task still needs all original S04c/S05/S07 and later gates.

## Independent-review fixes: framing and outer retry loop

The independent Go review identified that Content-Length validation inspected only Header.Get's first value and that the previous relay test stopped at one doRequest rather than exercising the controller's budget. Both are addressed:

- The adapter now iterates every Content-Length value, across case-variant map keys, requires decimal digits and exact agreement with effective framing before stripping it. Identical valid duplicate values are accepted; conflicting, invalid, empty, signed and comma-joined values fail locally before sending. Concentrated service regression cases protect the behavior.
- Existing `controller/relay_cancel_test.go` now runs the real TokenAuth → Distribute → Relay(Responses/compact) → Codex adaptor → UDS chain in an isolated startup process using the existing SQLite/user/token fixture and an explicitly free synthetic model. Retry budget is 3. A real upstream-status 503 control makes **4** UDS attempts, proving the outer loop is active; pre-send transport failure, uncertain send, IPC disconnect and truncated response cases must each make **1**.

This stronger test caught a genuine replay defect: compact response Body truncation went through the provider's NewOpenAIError conversion and lost the no-retry classification, producing 4 requests. `api_request.go` now wraps only enabled Codex response bodies and promotes typed transport read errors to an already-sanitized NewAPIError with SkipRetry before provider parsing. Existing error constructors preserve that error. No generic provider or billing policy is changed.

Focused observed result: `go test -race ./controller -run '^TestCodexTransportControllerRetryBudget$' -count=1 -timeout=90s` PASS (3.185s). It covers compact prefix truncation, native Responses SSE prefix truncation, and a nonstream request collecting upstream SSE, each with one attempt and no manufactured `response.completed` or `[DONE]` marker.

The native SSE handler already records scanner failure in StreamStatus and returns its usage accumulator under existing accounting semantics. This change deliberately preserves that behavior; it does **not** convert a transport cancellation into an unconditional refund. S08 must verify this exact native-stream failure case against the original estimation/settlement rules and real database matrices. The compact and collected-stream paths return the safe error. Local SQLite in this retry fixture is not claimed as three-database verification.

Final post-review verification:

- `go test -race ./service ./relay/channel ./controller -run CodexTransport -count=1 -timeout=150s`: PASS, service 1.984s / channel 2.710s / controller 2.846s (real Rust optional case remains unconfigured/skipped).
- `go test ./service ./relay/channel ./controller -count=1 -timeout=180s`: PASS, service 3.464s / channel 0.732s / controller 5.520s.
- Linux ARM64 CGO-disabled test compilation: service, relay/channel and controller all PASS. Latest binaries are `/tmp/codex-service-linux-arm64.test`, `/tmp/codex-channel-linux-arm64.test`, `/tmp/codex-controller-linux-arm64.test`.
- `git diff --check`: PASS.

The controller binary's real outer-loop regression needs only the committed synthetic `tools/codex-transport/fixtures/contracts.json` at its normal relative path; no repository mount or credentials are needed. The real-Rust service-only test does not read that fixture and can run from an otherwise empty directory with the frozen Rust binary supplied by absolute path.

## S04c actual Linux cross-process result (supersedes preparation-only status)

After root confirmed the S03 three-reviewer gate closed, a separate disposable Linux ARM64 container was created with `--network none` from the pinned Rust image. Only compiled Go service/controller test binaries, the frozen S03 Rust executable, and the vetted synthetic contracts JSON were copied. No full repository, host credentials, authentication home, private certificates or live traffic was mounted/copied.

Image: `docker.m.daocloud.io/library/rust@sha256:c1e5f19e773b7878c3f7a805dd00a495e747acbdc76fb2337a4ebf0418896b33`.

Hashes verified inside the running container:

- Rust: `a6cb5ba9c171f69d7b4bdfa12d826893d83178850c0df79b6e95e09ffddc0a36`.
- Latest service test executable: `2f97c4761806821374af2e2e14416a455ddf042575e24f3dbe321489a2e8e765`.
- Controller test executable: `e6742d47bb9ff39ca6cee67c642eb001fdbf645a8bb68849951e53c1d47e246d`.

Actual commands (run individually):

```sh
docker run --detach --name codex-s04-crossprocess --network none docker.m.daocloud.io/library/rust@sha256:c1e5f19e773b7878c3f7a805dd00a495e747acbdc76fb2337a4ebf0418896b33 sleep infinity
docker cp /tmp/codex-service-linux-arm64.test codex-s04-crossprocess:/tmp/service.test
docker cp /tmp/codex-transport-s03-linux-arm64 codex-s04-crossprocess:/tmp/codex-transport
docker exec --env CODEX_TRANSPORT_TEST_BINARY=/tmp/codex-transport codex-s04-crossprocess /tmp/service.test -test.run '^TestCodexTransportRustProcess$' -test.v -test.timeout 120s
docker exec codex-s04-crossprocess mkdir -p /test/controller /test/tools/codex-transport/fixtures
docker cp /tmp/codex-controller-linux-arm64.test codex-s04-crossprocess:/tmp/controller.test
docker cp /tmp/new-api-codex-plan-pr/tools/codex-transport/fixtures/contracts.json codex-s04-crossprocess:/test/tools/codex-transport/fixtures/contracts.json
docker exec --workdir /test/controller codex-s04-crossprocess /tmp/controller.test -test.run '^TestCodexTransportControllerRetryBudget$' -test.v -test.timeout 120s
docker exec codex-s04-crossprocess sha256sum /tmp/codex-transport /tmp/service.test /tmp/controller.test
docker exec codex-s04-crossprocess ps -eo pid,comm
docker rm --force codex-s04-crossprocess
```

Result: **13 actual service cross-process subtests PASS, no skips**, total 0.06 seconds on the final run. These include all prepared HTTP1 scenarios plus verified auto-negotiated HTTP/2 (both reconstructed response and actual upstream protocol) and barrier-interleaved two-identity header/Cookie isolation. The production health startup gate passed without bypass. The real controller retry-loop test also PASS in Linux (0.07 seconds), using the synthetic UDS fault responder separately from Rust to force precise local failure stages. Before container removal, process inspection showed no remaining Rust/test process; child socket/CA directories are cleaned by the test, and the disposable container was removed successfully.

First cross-process run exposed a **test certificate defect**, not a reason to relax production verification: Go httptest's default self-signed cert is a CA used as its own leaf, which webpki rejects. The fixture now generates an independent ephemeral ECDSA CA and a non-CA server leaf signed by that CA, with exact loopback IP SANs. The explicit wrong-name case still fails with typed `tls`, zero upstream HTTP requests and no retry. Only the public temporary CA PEM is written; the signing/leaf private keys stay in memory. After this correction, all TLS-dependent cases passed. H2 and concurrency scenarios were then added and the entire cross-process test rerun successfully.

Final host focused race after the fixture update:

`go test -race ./service ./relay/channel ./controller -run CodexTransport -count=1 -timeout=150s`

PASS service 2.000s / channel 2.719s / controller 3.027s. Its optional real-process case is still correctly skipped on the Darwin host; the actual Linux result above is separate and has no skips. Final `git diff --check` PASS.

S04a/b/c implementation evidence is now ready for the independent S04 panel. This is not final feature acceptance: S05 management/auth, S06/S07 WS, S08 native truncated-stream accounting/three real database engines, S09 fingerprints/live-account traffic, and S10 full application deployment remain required. The binaries and source fixture are preserved for independent reruns; no commit, push or PR was made.
