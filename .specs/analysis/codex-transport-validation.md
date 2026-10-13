# Codex transport validation log

## Pre-implementation baseline — 2026-10-14

HEAD: b3531b3df. No production transport changes existed for this run.

- `go version`: go1.26.0 darwin/arm64.
- `cargo --version`: 1.91.1; `rustc --version`: 1.91.1.
- `docker version --format '{{.Server.Version}}'`: 29.2.1; daemon reachable, no running containers reported by `docker ps`.
- `go test ./relay/channel/codex ./service ./relay ./controller ./model`: exit 0; all five packages passed. This is the existing Go baseline only, not a sidecar, three-database, or protocol comparison result.

## Security source preparation

Fetched OWASP Authentication, Session Management, OAuth2 and CSRF Cheat Sheets from their official source repository. ASVS release listing identifies v5.0.0_release as stable; the tag named latest is explicitly Bleeding Edge. Read stable V10 OAuth/OIDC and V12 Secure Communication. Relevant controls include 10.1.1 (token exposure), 10.1.2/10.2.1 (transaction/session binding and CSRF), 12.3.2 (certificate validation). Full affected-flow applicability and regression verification remain implementation work; this is not a compliance claim.

Sources: https://github.com/OWASP/ASVS/releases/tag/v5.0.0_release ; https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html ; https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html ; https://cheatsheetseries.owasp.org/cheatsheets/OAuth2_Cheat_Sheet.html ; https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html

## Official baseline binary recovery

`docker cp new-api-codex-tls-poc:/tmp/codex /tmp/new-api-codex-guidance/codex-linux-arm64` succeeded from the stopped POC container. `shasum -a 256` returned `071cbe8d821cf1b02b6d8ba6c8b7991b228fcb8519dcb68a37d31222bb8cabe5`, matching the historical manifest. `file` identifies a statically linked ARM aarch64 ELF. At this recovery checkpoint the binary had not yet run; the later S01 run below supersedes that execution status. No handshake comparison or release signature verification is implied. It remains outside Git.


## Implementation checkpoint — S01/S02 in progress

Task moved to `../tasks/done/codex-transport.feature.md`. S01 subsequently executed the isolated official binary and pinned Linux Rust image successfully; exact commands and outputs are in [baseline evidence](codex-transport-baseline.md). [Independent baseline review](judge-baseline.md) passed artifact quality at 4.65/5, with the actual-main prerequisite gate still pending.

Implementation delivery worktree is `/tmp/new-api-codex-plan-pr`, based on `origin/main` at `517075d56` for `XueHua-s/new-api`. The source worktree is 310 commits ahead, so it is not the PR branch. [Prerequisite integration](codex-transport-main-integration.md) selectively imports existing Responses WS functionality. Original main baseline tests passed; patched root tests have not passed while routing/API integration is incomplete. `relaykit` standalone build passed after the recorded adaptation.

S02 has README and contract fixture drafts. The first independent protocol review found incomplete framing/resource/test-vector details; revisions and further independent reviews are pending. No S03/S04 transport implementation gate is passed. All AC01–15 remain unchecked. No live credentials were used, no database matrix or sidecar deployment acceptance ran, and no PR was created.

### Dependency retry source audit (not a runtime test)

Downloaded the public reqwest 0.12.28 and hyper-util 0.1.20 crate source files from `https://static.crates.io/crates/<name>/<name>-<version>.crate` into a temporary directory. reqwest `src/async_impl/client.rs` configures tower retry from its policy but does not expose/set hyper-util `retry_canceled_requests(false)`. hyper-util `src/client/legacy/client.rs` defaults that flag to true and retries unstarted reused-connection and closed-pool-checkout failures at lines 257 and 377. Therefore `reqwest::retry::never()` and a non-clone streaming body alone do not establish the required no-replay behavior. S03 must explicitly resolve this dependency path and verify actual request counts; this source finding was sent to the contract author.


## S02 completed contract review; S03 started

The final protocol/security/Go panel passed at 4.68/4.730/4.695 respectively, each above 4.5 with hard gates met. Exact immutable artifact hashes and structural checks are in codex-transport-contract.md. No runtime acceptance is implied. S01 actual-main compatibility remains pending; the independent baseline auditor approved removing its false dependency on the standalone Rust crate. Rust S03 is now implementing in the isolated main worktree, with Go production files still owned by the prerequisite integrator.

Additional prerequisite audit found a real partial-usage snapshot risk: updated output tokens could be shadowed by an older BillingUsage snapshot. The integrator must fix it and prove effective billing usage. Existing main constant-expression/no-usage behavior also updates balance and consume logs without UsedQuota; this remains a separate S08 invariant risk, not a transport acceptance PASS.

## Current implementation checkpoint — S03 independent review

The actual-main prerequisite integration and its independent compatibility audit have passed; the earlier pending statements above describe historical checkpoints. See `codex-transport-main-integration.md` and `judge-main-prerequisites.md` for exact commands and database versions. They do not validate the new sidecar business chain.

The Rust HTTP author reports 31 Linux integration cases passing, including cancellation followed by full capacity readmission, proxy/certificate failures and production subprocess health. Independent S03 panel review remains open: the frozen stale-pool-checkout scenario still needs deterministic evidence that the internal unstarted-request branch does not reconnect or replay. A reused HTTP/1 connection closed after receiving request headers is a distinct case and does not discharge that requirement. Resource documentation must distinguish 64 KiB logical chunks from retained library allocations. No S03 completion is claimed at this checkpoint.

S04a/b local Go adapter tests and race verification passed; S04c's real Rust subprocess fixture is prepared and cross-compiled, but its Linux execution awaits S03 acceptance. Missing binary environment produces an explicit skip and is not acceptance. S05–S10, full sidecar three-database accounting, application Docker deployment, protocol comparisons and live-account tests remain outstanding. Credentials have not been used. No implementation commit, push or PR has been made.

### Deployment preparation observation

The target main `.dockerignore` currently does not exclude `tools/codex-transport/target/` or `.specs/scratchpad/`. S10 must exclude generated Rust build output and local test/capture material from both application and sidecar build contexts before any deployment build. A Git ignore alone does not protect Docker `COPY . .`. Confirm inclusion of required vendored source, lockfile and licenses after the exclusion; do not copy the historical `.local-tests` directory into either image.

## Connection-pool design check during S03

The software-design-philosophy review recorded a provisional 6.25/10 design assessment, not implementation acceptance. The chosen approach keeps conservative idle-capacity reservations in the sidecar and evicts inactive origin pools, rather than introducing a shared IdleBudget API across reqwest and hyper-util. Resource admission, cancellation and actual bounded-library behavior remain subject to S03's independent panel and tests.

## S03 implementation gate passed

Final Linux mandatory script passed 32 transport integration tests and the exact vendored stale-checkout regression with its retry-enabled positive control. Independent panels passed: HTTP 4.6625, security 4.69, resource 4.6755. All S03 hard gates are closed; see `codex-transport-rust-http.md` and the three judge reports. The 8192 nofile setting belongs to the combined four-ended fixture process; production sizing remains S10 verification. Final ARM64 GNU release SHA256 is `a6cb5ba9c171f69d7b4bdfa12d826893d83178850c0df79b6e95e09ffddc0a36`; root extracted and independently hashed `/tmp/codex-transport-s03-linux-arm64` to preserve this artifact for S04c while S06 proceeds.

S04's real controller retry-budget test exposed loss of SkipRetry after compact-body truncation (four requests under budget three). The author fixed the Codex response-body error boundary; local race and full affected-package tests now prove one attempt for compact/native-SSE/collected-SSE truncation and four for the ordinary retryable503 positive control. Actual Rust cross-process verification is now authorized, not yet reported passed. S06 author has begun WS implementation. All final ACs remain unchecked until their full cross-step evidence is complete.

## S04 implementation gate passed

Three independent final reviewers passed integration 4.720, security 4.735 and lifecycle 4.73. Each independently ran the 13 Linux Go→frozen-Rust→TLS scenarios without skips; host focused race and controller outer-budget evidence passed. See the three `judge-go-*` reports and `codex-transport-go-adapter.md`. CI now has an actual cross-process runner, independently executed by the operations author with all 13 cases and controller regression passing. S05 management/Auth and its own C09 three-engine security validation are now authorized and in progress.

S10a/b has Docker/Compose/CI scaffolding and a frozen-S03 runtime-only smoke: effective UID10001, directory0700/socket0600, configured nofile2048, no published TCP port, health, SIGTERM cleanup and restart. This does not prove production load capacity or a full current-source image/application deployment; Rust S06 source was changing, and the locked-source build was not claimed as passed. Final operations and all cross-step ACs remain open.

## S06 implementation gate passed; S05 findings remain open

S06 final Linux script passed 50 integration cases plus exact hyper retry and bounded-deflate dependency regressions. Independent panels passed protocol4.695, security4.675, resources4.6525, with actual Linux reruns and matched source hashes. Frozen ARM64 GNU binary `/tmp/codex-transport-s06-linux-arm64` SHA256 `d5c1c7dd9b727f0180cfa068641100e1c929c06aaddeef99892315dda8a5f522`. See S06 author and three judge reports; bounded application payload admission is explicitly distinct from process RSS.

S07 Go session integration and S09a/b synthetic official protocol comparisons have started. S05 remains unaccepted: security review identified disabled-Auth TLS bypass inheritance and management refresh snapshot races; the author is repairing these and extending real three-database/proof regression evidence. No live credentials have been used, no implementation commit/push/PR exists.

## Current checkpoint — S05/S07 passed; S08–S10 verification

S05 three independent reviewers passed security4.68/transactions4.70/management4.665 after fixes; real authentication matrix27 cases per engine81 total, no skips. S07 session4.685/security4.675/lifecycle4.6675 passed, including fixed persisted-disable/delete notification failures and105 real three-engine binding cases. Historical HOLD reports are retained.

Official binary was established to be static musl/OpenSSL3.6.4; sidecar GNU build now pins the same3.6.4 source and explicitly documents libc/feature differences. Scoped independent calibration PASS4.6775 with50 integration plus2 vendor regressions and image lifecycle checks. Final image executable SHA256 `5f146857df6f66acc75e04faf1ea152bdb1824f2e21a3f4b6e3f5375f1dd1f6d`; root's actual Go→Rust runner passed on that binary. S09 initial15-case synthetic evidence required stronger raw WS payload/deflate-value assertions at independent review; author is correcting and resampling. No live account calls yet.

After S08's narrow positive zero-usage tier charge counter fix, root executed and observed exit0 for:
- `go test -race ./service ./relay/... -count=1 -timeout=180s` (`/tmp/codex-s08-c05-race.log`)
- `go test ./...` (`/tmp/codex-final-root-tests.log`)
- `GOWORK=off go build ./...` and `GOWORK=off go test ./...` inside `relaykit/` (`/tmp/codex-final-relaykit-tests.log`)

Full app Docker build is in progress. Initial pinned Bun install reported integrity failures; independently downloaded official tarballs matched committed SHA512 exactly and unchanged retry passed installation/frontend build. A later Go proxy download returned unexpected EOF; same-source build retry is running. These failed attempts are not deployment acceptance. S08 author's expanded actual-sidecar three-engine accounting matrix is passing, but independent billing panels and S10 full application runtime acceptance remain outstanding. No commit, push or PR exists.

### Full application source image build

`docker build --platform linux/arm64 --build-arg GOPROXY=https://goproxy.cn,direct -t new-api-codex:s08-candidate .` completed exit0 after the earlier network download failures. Root Dockerfile now exposes an optional GOPROXY build argument with unchanged default `https://proxy.golang.org,direct`; Go checksum verification remains enabled. Image ID `sha256:9f909e59414bad05221ad0b87024890e44f03b73f5f68cdb5045cb0c9e243dab`, architecture arm64, inspected size70519528 bytes. Log `/tmp/codex-full-app-build-mirror.log`. Includes the frozen S08 positive-tier bookkeeping fix and actual frontend build. S10 full process deployment tests are now running on this image; build success alone is not runtime acceptance.

## Independent review reopened lifecycle gates

S08 security reviewer deterministically reproduced generation1 terminal arriving during generation3 and incorrectly settling generation3 with old usage. The previous-response-only filter is insufficient; S07/S08 isolation acceptance is reopened despite earlier two-generation tests. See `judge-billing-security.md` (HOLD3.8875); author repair and extended3+generation sidecar/database regressions are required.

S10 actual application deployment additionally reproduced held SSE reservation surviving Go SIGTERM shutdown timeout without settlement: after eight reservations, tokenUsedQuota8000 versus user/channelUsedQuota7000 and seven consume logs. The regular graceful drain/restart/rollback scenarios had passed; this timeout boundary remains a material failure. Operations preserves the failing accounting assertion. Main lifecycle repair, rebuilt application image and full affected deployment replay are required. No live credentials or PR publication occur before these reopened gates close.

S09a/b synthetic panels now PASS4.68/4.650/4.695 after the raw WS payload and complete deflate-offer evidence corrections. Full S09/AC15 still awaits minimal live-account HTTP/SSE and multi-roundWS through Go billing; preparing a secure runner is not evidence of live execution.
