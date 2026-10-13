# S10a/b operations implementation — partial evidence

Status: deployment and CI framework implemented; **S10 final acceptance remains pending**.
Date: 2026-10-14. Implementation tree: `/tmp/new-api-codex-plan-pr`.

## Changes

- Optional `docker-compose.codex-transport.yml` builds both current Go application and sidecar; base Compose and root Dockerfile unchanged. Production fixed Linux ARM64 GNU.
- Same explicit UID/GID 10001; one-shot root initializer provisions only a dedicated named socket volume (0700), sidecar creates 0600 socket, Go mount read-only. Sidecar has no published TCP, read-only rootfs, dropped capabilities, no-new-privileges, configured nofile 2048.
- README Operations gives explicit data/log bind-directory setup. No automatic ownership mutation of existing user data. Describes rollout, startup snapshot, rollback, no replay, strict build-context hygiene and memory/FD acceptance limits.
- Dockerfile pins Rust1.91.1 and Debian bookworm digests, rejects non-ARM64, builds `--locked --release --target aarch64-unknown-linux-gnu`, preserves all vendor LICENSE/COPYING/NOTICE files and root notices. Mirrors must preserve digest.
- CI adds one native ARM64 transport job invoking `scripts/test-http.sh` (including exact vendored stale-checkout regression), enables real UID/GID matrix, builds production image and validates Compose. Actual Go→Rust cross-process CI now invokes the runner below after an explicit locked binary build. Remote CI not run.
- `.dockerignore` excludes Rust targets, local experiments, `.specs`, local agent/tool metadata, environment/key/capture files, local data/logs and test binaries; lock/vendor licenses preserved.
- `scripts/test-container.sh` creates/removes a disposable named volume and container; checks health, actual UID/GID/socket modes, nofile configuration, no published TCP, SIGTERM exit0/unlink, restart. No live account or existing application database touched.

## Actual commands and observations

1. `docker compose -f docker-compose.yml -f docker-compose.codex-transport.yml config --quiet`: exit0. Only inherited base `version` obsolete warning.
2. `bash -n tools/codex-transport/scripts/test-container.sh`: exit0.
3. Production `docker build --platform linux/arm64 --build-arg RUST_IMAGE=docker.m.daocloud.io/library/rust@sha256:c1e5f19e773b7878c3f7a805dd00a495e747acbdc76fb2337a4ebf0418896b33 -f tools/codex-transport/Dockerfile -t codex-transport:operations .`: did **not** pass. Base image loading/platform checks succeeded; Rust author was changing S06 fork/lock, so `cargo build --locked` correctly rejected inconsistent snapshot (exit101). No lock weakening. Earlier Debian mirror request returned502; original Debian registry succeeded. Full build must rerun after S06 frozen snapshot.
4. To independently check runtime while S06 source changes, created `/tmp/codex-operations-runtime` containing only root-provided frozen S03 binary and a temporary Dockerfile derived from production runtime stage (same Debian digest, CA installation, USER, health, ENV, ENTRYPOINT; source-build/licenses stages omitted). `docker build --platform linux/arm64 -t codex-transport:operations-s03 /tmp/codex-operations-runtime`: exit0. This is **not** production locked source-build evidence.
5. `CODEX_TRANSPORT_IMAGE=codex-transport:operations-s03 bash tools/codex-transport/scripts/test-container.sh`: exit0, repeated after adding bounded health wait on restart. Exact assertions: UID:GID10001:10001; directory700/socket600; `ulimit -n`2048; socket exists; published-port map `{}`; SIGTERM exit0; own socket removed; new process health succeeds. Temporary container/volume cleaned by trap.
6. `git diff --check`: exit0 at report time.

Runtime-only image ID `sha256:bc1761ef84af313a4ece7c21796297ca1fb289206028019dbc7ae4f27ebb6353`, Linux arm64. Frozen S03 binary SHA256 `a6cb5ba9c171f69d7b4bdfa12d826893d83178850c0df79b6e95e09ffddc0a36`. Docker29.2.1.

## Explicit remaining evidence

- Full frozen source image build (S06), final image notices, image size/digest and remote CI.
- Actual current-code Go application image startup in an isolated project with correctly provisioned data/logs; runtime health/profile/capability negative cases through Go.
- Final S06/S07-capable fixture adjustment and S06 WS resource reviewer result (S04c missing-WS negative currently targets frozen HTTP-only S03).
- FD2048 was configured/observed, **not proven sufficient at full concurrency**. No total WS RSS bound claimed; frame/deflate/TLS/kernel allocations require actual sizing.
- Long streams/backpressure, active and idle WS cancellation, app/sidecar restart, drain, rollback to old outlet, no replay and exact final accounting. S08/S09 prerequisites and final independent S10 judge remain pending.

## Follow-up: actual Go/Rust CI runner

`scripts/test-go-rust.sh` now compiles Linux ARM64 static Go service/controller test executables using the normal host Go toolchain; requires a nonempty absolute executable Rust path; runs both acceptance tests in one pinned Linux ARM64 container with `--network none`; copies only executables and synthetic `contracts.json`; rejects SKIP/no-match and requires both named root PASS records. Temporary container and binaries are trap-cleaned. The ordinary backend CI tests remain unchanged. The transport job sets up Go, explicitly builds the Rust debug executable with `--locked`, then invokes this runner before the production image build.

Actual command:

```sh
CODEX_TRANSPORT_TEST_BINARY=/tmp/codex-transport-s03-linux-arm64 CODEX_TRANSPORT_TEST_IMAGE=docker.m.daocloud.io/library/rust@sha256:c1e5f19e773b7878c3f7a805dd00a495e747acbdc76fb2337a4ebf0418896b33 bash tools/codex-transport/scripts/test-go-rust.sh
```

Exit0: 13 `TestCodexTransportRustProcess` subcases PASS, root0.10s, controller retry-budget test0.10s PASS, no skips. Executable hashes exactly match S04c author's final evidence: Rust `a6cb5ba9c171f69d7b4bdfa12d826893d83178850c0df79b6e95e09ffddc0a36`; service `2f97c4761806821374af2e2e14416a455ddf042575e24f3dbe321489a2e8e765`; controller `e6742d47bb9ff39ca6cee67c642eb001fdbf645a8bb68849951e53c1d47e246d`. `bash -n` and `git diff --check` passed. This validates the runner with frozen S03, not future S06 WS changes or remote CI. Go author notified that the current absent-WS negative must evolve under S07 while retaining negative capability coverage.

Dockerfile license collection uses recursive `find vendor` with `LICENSE*`, `COPYING*`, `NOTICE*` and preserves paths. Current vendor trees contain hyper-util/LICENSE, tokio-tungstenite/LICENSE, tungstenite/LICENSE-MIT and LICENSE-APACHE, all admitted by `.dockerignore` exceptions. Final production image content remains to be checked after its frozen source build.

## Frozen S06 production source image — root verification

After S06's three panels passed, root executed the actual committed Dockerfile against frozen source:

`docker build --platform linux/arm64 --build-arg RUST_IMAGE=docker.m.daocloud.io/library/rust@sha256:c1e5f19e773b7878c3f7a805dd00a495e747acbdc76fb2337a4ebf0418896b33 -f tools/codex-transport/Dockerfile -t codex-transport:s06-verified .`

Exit0. The build ran `cargo build --locked --release --target aarch64-unknown-linux-gnu` successfully (release compilation2m54s; build stage215.7s including toolchain/index/download). The context transfer was781.81kB, excluding generated targets and local test material. This supersedes the earlier incomplete S06 snapshot build failure; it does not erase that history.

Image inspection: `sha256:dacf81e1298c8e6f22642e48acbde87882e38344f2c01c0cd232d70ffbecb8df`, linux/arm64,38478399bytes. The image-built executable SHA256 is `bac96419dfc2aa8a7ed801d8b536e1ab20f3d2475fbda5fea70930749d1dfd4f`; it is a separate build from the earlier test-container artifact, not claimed bit-identical. `docker run --rm --network none --entrypoint /bin/sh codex-transport:s06-verified -c 'sha256sum /usr/local/bin/codex-transport; find /licenses -type f | sort'` exited0 and confirmed root LICENSE/NOTICE/THIRD-PARTY-LICENSES plus hyper-util, tokio-tungstenite and tungstenite Apache/MIT licenses.

`CODEX_TRANSPORT_IMAGE=codex-transport:s06-verified bash tools/codex-transport/scripts/test-container.sh` exited0: actual image health, UID/socket permissions, configured nofile, no published TCP, SIGTERM cleanup and restart passed. This is the production sidecar image smoke; full current-code Go application deployment and loaded resource/accounting/restart/rollback tests remain pending.

## S10 deployed admission/FD probe (full app image still building)

New `scripts/test-deployment.py` uses only synthetic TLS CA/account material, disposable named volumes, actual production sidecar image `codex-transport:openssl364`, explicit UID10001 and nofile2048. Docker fixture receives only the script and public CA through `docker cp`; private CA/server keys remain temporary on the host and are deleted. The application lifecycle portion requires the actual current-code source-built image; it fails rather than silently use a public old image.

Initial `python3 tools/codex-transport/scripts/test-deployment.py` reached real production-sidecar resource checks: two cycles each held256 actual TLS HTTP streams, rejected the257th with typed capacity/may_have_sent=false, closed all256, observed all upstream closures and readmitted all256. `/proc/1` measured FD778 for each cycle, VmRSS25272KiB then31432KiB, second VmPeak355252KiB. This proves configured nofile2048 sufficed for this admitted HTTP workload; it is not a full-message WS RSS measurement or universal memory estimate. That run then failed because the actual application image was not yet available, and cleaned containers/volumes. The runner was subsequently tightened to reject missing images before setup and count exact upstream capacity attempts; final run still required.

Root source application image builds encountered transient frozen Bun tarball integrity fetch failures (independent npm hashes matched lock, unchanged retry passed), then Go public-proxy EOF/TLS timeouts. Root added optional `ARG GOPROXY` with unchanged default and checksum verification retained, and is retrying source build with goproxy.cn. No dependency lock weakening or precompiled application substitution is accepted as full-image evidence. Final source image, full HTTP/WS/drain/restart/rollback/accounting run and independent S10 review remain pending.

## Actual application image deployment and discovered shutdown blocker

Root built the complete frontend+Go Dockerfile from source with `--platform linux/arm64 --build-arg GOPROXY=https://goproxy.cn,direct -t new-api-codex:s08-candidate .`, exit0. Image `sha256:9f909e59414bad05221ad0b87024890e44f03b73f5f68cdb5045cb0c9e243dab`, arm64,70519528bytes. Frozen Bun install and Go checksum validation remained enabled. This image predates the subsequently discovered S08 stale-generation repair.

`python3 tools/codex-transport/scripts/test-deployment.py` reached a successful eight-generation lifecycle run against that actual application image and calibrated sidecar: initial SSE, two creates on one WS, idle WS closed by sidecar restart with no new charge, client cancellation after output, graceful Go SIGTERM drain while a held SSE finishes, active SSE sidecar restart with no manufactured completion/no retry, next new call succeeds, and Go restarted explicitly disabled while sidecar stopped returns through legacy TLS. At each generation wallet, token, user/channel used quota, request count and exact consume log list were checked: eight charges of1000, totals8000, no duplicate upstream attempts. Containers and named volumes were cleaned. A subsequently added mandatory forced-deadline case invalidates any interpretation that S10 is complete.

Full-cap resource run now also verifies exact upstream attempts:256 admitted twice,257th fails before upstream, all256 cancellations observed, full readmission. FD778 for256 held exchanges; idle1000ms pooled upstream actually closed and returned FD10. Observed final probe VmRSS32404KiB. These HTTP measurements do not prove worst-case128MiB WS RSS.

**Confirmed blocker:** held SSE with delivered created/delta, then SIGTERM with `SHUTDOWN_TIMEOUT_SECONDS=15`, caused old application `main.go` to exit0 immediately after `srv.Shutdown` deadline without cancelling/waiting for HTTP handler accounting. On generation8, exact database snapshot was user `[quota992000,used_quota7000,request_count7]`, token `[remain_quota992000,used_quota8000]`, channel used7000, seven logs of1000. The wallet/token had consumed8000 but only7000 reached user/channel/log accounting. Actual log: `server forced to shutdown: context deadline exceeded`, `server exited`. The strict newly added harness assertion fails. This is a production defect, not a fixture tolerance; root and lifecycle owner received the precise reproduction. No expected accounting was weakened. The updated harness also prepares active-WS application shutdown coverage. Final frozen application rebuild/rerun required after both lifecycle and stale-generation fixes.

## Container stop-grace correction

Root identified that inherited Docker's10-second default application stop timeout would kill Go before its120-second graceful drain plus new10-second forced-settlement window. Optional override now sets only `new-api.stop_grace_period: 150s`; base Compose remains unchanged. Existing `new-api.depends_on.codex-transport.condition=service_healthy` retains the reverse stop order (app before sidecar), and sidecar remains45s. Lifecycle author confirmed forced-settlement allowance is a fixed10s, not a new environment variable.

`docker compose -f docker-compose.yml -f docker-compose.codex-transport.yml config --format json` exit0; selected normalized values are app `2m30s`, sidecar `45s`, healthy required sidecar dependency. README states custom Go shutdown timeout requires container grace beyond timeout+10s+margin.

The full-deployment runner no longer conceals configuration with `docker stop --time20`: it uses Go's delivered120s, Docker app StopTimeout150s, sidecar45s, asserts Compose and runtime values, and exercises deadline expiry with ordinary `docker stop`. Its synthetic barrier and assertion deadline now accommodate the real120-second grace. Final execution awaits corrected source-built image; earlier15-second failing reproduction remains historical evidence, not final delivered settings.

## Batched deployment acceptance prepared

Base Compose enables `BATCH_UPDATE_ENABLED=true`; unbatched-only acceptance is insufficient. Runner now verifies that inherited configuration, preserves its full unbatched suite, then starts actual application with batching enabled and `BATCH_UPDATE_INTERVAL=3600`. Two completed responses must create exact consume logs while user/channel counters remain at their previous persisted values, proving the periodic cycle has not flushed. Plain Docker stop must then flush and produce exact consistent totals. A restarted batched process additionally holds one request until the real120s graceful deadline, then must terminalize and flush it before exit; no counter/log mismatch or replay accepted.

Lifecycle author confirmed shutdown now budgets120s graceful+10s forced handler settlement+10s final batch flush=140s. Optional150s container grace remains adequate with10s margin. README custom-shutdown guidance updated to timeout+20s+margin. Runner syntax and diff checks pass; this new batched path is prepared, not runtime acceptance, pending the corrected frozen image. Old candidate images cannot prove this fix.

## Corrected-image readiness signal race (new blocker, no sleep workaround)

Immutable application `sha256:c950c49e529edfb4ed6162e27a9ed63dd1175815438eed5f62206fa1eef1a569` and calibrated sidecar `sha256:4ab8c6f99c9160e035db1ae3ff415150b06b690681e03c09213e21659bd88c54` were exercised twice with the strict runner. Both reached eight exact settled generations, including active WS application shutdown. The next fresh Go process served `/api/status`200 and admitted a held SSE, but an immediate ordinary `docker stop` terminated it before graceful shutdown: exit2, OOMKilledfalse, process lifetime213ms, no `received signal`/shutdown messages. Source still called ListenAndServe, slept100ms, then registered signal.Notify. Readiness therefore preceded the signal handler and admitted work could terminate in that window. Evidence `/tmp/codex-deployment-final-repro.log`; original first run `/tmp/codex-deployment-final.log`.

Root/lifecycle author accepted the reproduction and moved buffered signal registration before serving. The runner deliberately does not sleep after readiness or weaken exit/accounting assertions. A newly rebuilt immutable image is required before deadline/batch acceptance can proceed. No final S10 PASS is claimed for the previous image.

## Final immutable-image runtime results (supersede the blockers above)

Lifecycle/signal/batch repairs are present in source-built application `sha256:c1f7972aa01e8423ace374d94b6b2a228cc6ec8263926b838c86648c2ca6d204` (Linux arm64,70527451bytes). Calibrated source-built sidecar remains `sha256:4ab8c6f99c9160e035db1ae3ff415150b06b690681e03c09213e21659bd88c54`. Root build log `/tmp/codex-signal-fixed-app-build.log` exit0. No production bypass, live credentials or precompiled replacement application was used.

Actual command:

```sh
CODEX_DEPLOY_APP_IMAGE=sha256:c1f7972aa01e8423ace374d94b6b2a228cc6ec8263926b838c86648c2ca6d204 CODEX_DEPLOY_SIDECAR_IMAGE=sha256:4ab8c6f99c9160e035db1ae3ff415150b06b690681e03c09213e21659bd88c54 python3 tools/codex-transport/scripts/test-deployment.py
```

Exit0, `/tmp/codex-deployment-signal-fixed.log`: all13 generations and every exact accounting check PASS. Ten unbatched generations cover SSE, two creates on one WS, client cancellation after delivered output, graceful Go drain, idle WS sidecar restart, active SSE sidecar restart, next-call recovery, active WS Go shutdown, real120-second forced HTTP drain deadline, and explicit disabled-mode rollback with the sidecar stopped. Three batched generations cover two completed requests whose counter deltas remain pending under a3600-second timer until shutdown, followed by another real120-second forced-deadline generation with final flush. Final state user `[quota987000,used13000,requests13]`, token `[remain987000,used13000]`, channel used13000, exactly13 consume logs of1000, exactly13 upstream attempts. Normal and deadline processes exit0. Immediate post-readiness stop is retained and now works; no startup sleep hides the fixed race. StopTimeout150s/sidecar45s and inherited Compose batching are asserted.

Same run measured actual production sidecar admission: two full256-exchange cycles, each257th rejected with `capacity`/`may_have_sent=false` and exactly256 upstream attempts, all upstream cancellations observed, complete readmission. FD778 at the cap, FD10 after cancellation and1000ms pooled idle expiry. VmRSS24988KiB then31452KiB; after cleanup31456KiB. This proves the configured2048 descriptor allowance for the tested HTTP workload; it does not claim a universal or worst-case128MiB WS RSS bound.

### Actual optional Compose topology

Added `scripts/test-compose.py`, reusing the deployment synthetic TLS/account/WS fixture rather than duplicating business flow logic. It layers an isolated generated override over the actual base+optional files, selects immutable app/sidecar images, isolated names/volumes and loopback ports, provisions UID10001 data/logs/socket directories, and uses real PostgreSQL+Redis. Inherited `SQL_DSN=postgresql://root:123456@postgres:5432/new-api`, `REDIS_CONN_STRING=redis://:123456@redis:6379`, `BATCH_UPDATE_ENABLED=true` and application150s grace are asserted. These are the repository's synthetic example values used only in disposable containers, not live credentials.

```sh
CODEX_DEPLOY_APP_IMAGE=sha256:c1f7972aa01e8423ace374d94b6b2a228cc6ec8263926b838c86648c2ca6d204 CODEX_DEPLOY_SIDECAR_IMAGE=sha256:4ab8c6f99c9160e035db1ae3ff415150b06b690681e03c09213e21659bd88c54 python3 tools/codex-transport/scripts/test-compose.py
```

Exit0, `/tmp/codex-compose-acceptance.log`. Actual `compose up -d --no-build --wait` starts healthy app+sidecar+PostgreSQL+Redis. HTTP/SSE and WS each invoke upstream once and charge1000: PostgreSQL user `[998000,2000,2]`, token `[998000,2000]`, channel2000, logs `[1000,1000]`. Plain `compose stop` exits app0 first (2026-10-13T21:58:26.26972987Z), sidecar afterward (21:58:26.36234493Z), proving delivered reverse dependency order. Compose down removes test volumes/network/containers; fixture helper/public-CA volume also removed.

Observed PostgreSQL16.15, aarch64-unknown-linux-musl, image `sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea`. Redis7.4.11 (jemalloc5.3.0), image `sha256:858f009f9709ce576febc734aa78b8f6d624b82571f9ddb6bda4377c833b3499`. Host Docker29.2.1, Compose5.1.3. This verifies real Compose wiring, separate from S08's three-engine semantic matrix.

The small fixture refactor shared TLS startup and seeded row definitions with the Compose runner; a final full13-generation rerun of that exact frozen script is in progress (`/tmp/codex-deployment-frozen-harness.log`). Its outcome must be appended rather than inferred. Remote CI, live credentials/S09 and the independent final S10 judge are not claimed by this operations report.

### Frozen runner completion

The final shared-fixture script rerun completed exit0: `/tmp/codex-deployment-frozen-harness.log` contains all13-generation PASS and both real120-second deadline/settlement/flush successes. Same immutable app/sidecar IDs and exact command above. Final resource observation: FD778 at256 exchanges, FD10 after idle cleanup; VmRSS25176KiB first cycle,29164KiB second,29184KiB after cleanup. Both full runner and actual Compose tests now have observed success with the delivered fixture code. `docker ps -a`, `docker volume ls` and `docker network ls` contain no matching `codex-deployment-*` / `codex-compose-*` test resources. Python AST syntax and `git diff --check` exit0.

Independent operations reviewer requested and received an explicit README compatibility disclosure matching `GetCodexHTTPClient`: sidecar-off Codex Auth still enforces no redirects and rejects global/effective insecure TLS or unverifiable transport types before sending. Existing20s Go timeout remains, but disabling the sidecar does not undo Codex OAuth identity/session/step-up hardening. Claude's legacy shared helper remains unchanged. This is a deliberate security behavior change, not claimed perfect default-off equivalence. Go's1024-ID non-evicting SHA256 correlation history and terminal-close boundary are also documented as session compatibility limits.

Operations author evidence is complete for review; independent S10 scoring, S09 live verification and remote CI are owned by their respective gates and are not invented here.
