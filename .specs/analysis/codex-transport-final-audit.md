# Codex transport final evidence index

Current status: S01–S10 implementation and required independent gates passed. Final S09 panel scores are TLS/H2 4.6875, WS/live 4.670 and forensics 4.675; S10 final operations/delivery score is4.670. Real model discovery, one HTTP/SSE generation and two WS generations passed with exact accounting and verified cleanup. No PR has yet been created. Historical failures and superseded artifacts remain labeled in their reports.

Final app image: `sha256:c1f7972aa01e8423ace374d94b6b2a228cc6ec8263926b838c86648c2ca6d204`. Sidecar image: `sha256:4ab8c6f99c9160e035db1ae3ff415150b06b690681e03c09213e21659bd88c54`; executable SHA256 `5f146857df6f66acc75e04faf1ea152bdb1824f2e21a3f4b6e3f5375f1dd1f6d`. Target main remains `517075d5658ad59372859407df9e27de8f914542`, repository `XueHua-s/new-api`; implementation is isolated from the source worktree's 310 unrelated commits.

## Acceptance criteria

| AC | Current evidence and boundary |
|---|---|
| 01 | `codex-transport-go-adapter.md`, `judge-go-security.md`, `codex-transport-management-auth.md`: default-off/provider isolation; Codex-only Auth insecure/redirect hardening is an intentional security correction, including default-off. Claude/GitHub remain isolated. |
| 02 | `codex-transport-rust-http.md`, `judge-rust-http.md`: real methods/query/repeated headers/body/status/redirect/compression/framing; library no-retry dependency regression. |
| 03 | `judge-rust-resources.md`, `judge-ws-resources.md`, `codex-transport-operations.md`: boundary/backpressure/cancel/readmission, actual256 HTTP admission and FD778→idle10. Payload admission budget is not RSS; measured HTTP RSS is not worst-case WS allocation. |
| 04 | `codex-transport-go-adapter.md`, `judge-go-lifecycle.md`, `judge-billing-security.md`: controller retry budget ordinary503 four attempts, transport uncertainty one; native SSE truncation estimated settlement without fabricated completion/DONE. |
| 05 | `judge-rust-security.md`, `judge-go-security.md`, `judge-auth-security.md`, `judge-protocol-forensics.md`: UDS/trust/metadata/redirect/credential boundaries; final live cleanup independently verified in the forensics report. |
| 06 | `judge-rust-resources.md`, `judge-go-transport.md`: deterministic identity/cancel isolation; bounded policy pool, no credential pool key or shared cookie jar. |
| 07 | `codex-transport-rust-ws.md`, `judge-ws-protocol.md`, `judge-ws-security.md`, `judge-ws-resources.md`:50 integration+2 vendor regressions, upstream-first handshake, failures/control/fragments/deflate/backpressure. |
| 08 | `codex-transport-go-ws.md`, `judge-ws-binding-security.md`, `judge-billing-security.md`: actual mutation closure, partial-persistence failure fixes, immutable current ID and four-generation history isolation; bounded1024 hashes, close after settlement at limit/no-ID. |
| 09 | `codex-transport-billing.md`, three `judge-billing-*` reports: final artifact117 real transport billing scenarios, exact wallet/token/user/channel/log and reservations/refunds; no injected Usage substitute. |
| 10 | `codex-transport-protocol.md`, `tools/codex-transport/fixtures/protocol/observed-calibrated.json`, three `judge-protocol-*`:15 synthetic cases, actual POST/H2/WS bytes, declared pooling/HPACK/close differences. Official musl vs sidecar GNU; both actual OpenSSL3.6.4. Native/WS did not resume; CA-rustls retry experiment did. |
| 11 | Same protocol evidence and Rust integration: HTTP/HTTPS/SOCKS5/SOCKS5h positive/negative cases; official unsupported proxy routes clearly labeled sidecar extensions, not equivalence. |
| 12 | `judge-billing-databases.md`: independent final5f146 matrix117 billing+81 auth+6 batch, SQLite3.50.4, MySQL8.0.46, PostgreSQL16.15 and independent log DBs, no skips. |
| 13 | `codex-transport-operations.md`: final source app image, immutable sidecar, actual13-call lifecycle/deadline/batch/rollback and Compose PG16.15+Redis7.4.11 smoke; frozen thirteen-generation harness replay and final `judge-operations-final.md` PASS; all S09 prerequisites now closed. |
| 14 | `codex-transport-management-auth.md`, `judge-auth-transactions.md`, `judge-management-compatibility.md`: all management/Auth entry variants,81 auth DB cases, proofs/one-use flow, stale refresh bindings, no Claude/GitHub reroute. |
| 15 | `codex-transport-live-result.json` and final three S09 reviews: discovery10 models, selected `gpt-6-luna`, HTTP200 plus WS101/two rounds, usage28/28/42 and exact98 quota settlement; cleanup verified.22 harness/protocol tests pass; prior input/path failures retained as history. |

## Thirty implementation slices

| Step | a | b | c |
|---|---|---|---|
| S01 | validation + main-prerequisites | baseline.json + synthetic fixtures | baseline/calibration reports, locked forks/features/toolchain |
| S02 | README + contracts.json | limits/resource reports | protocol/security/Go contract panels |
| S03 | crate/UDS/health | HTTP/SSE integration | pool/policy/proxies + resources panel |
| S04 | Go startup/adapter | Codex-only dispatch | real Go→Rust and retry budget tests |
| S05 | Auth/flow/proof + C09 | model discovery/profile isolation | both WHAM/credits paths + transactions panel |
| S06 | pinned fork WSS handshake | frames/deflate/limits/cancel |50 integration+2 vendor regressions |
| S07 | Go WS adapter/error | binding/mutations/shutdown | active/idle and four-generation tests |
| S08 | actual controller/Rust fixture | exact billing/saturation/duplicate cases | final117+81+6 three-engine runner |
| S09 | synthetic sampler/negative controls |15 TLS/H2/WS/proxy comparisons | live discovery + HTTP/SSE + two-roundWS, exact accounting/cleanup |
| S10 | pinned images/CI/license | actual Docker + optionalCompose | current index/docs and final independent audit PASS |

## Source plan sections and commands

| Source sections | Current evidence |
|---|---|
| §1,§3 | S02–S08 original Go business/usage/state-machine reuse; private application transport, no CONNECT-only design, no global replacement. |
| §2 | baseline and validation preserve POC evidence as history; all final claims use new code/fixtures and specified hashes. |
| §4.1–4.5 | contract, HTTP, WS, isolation, resources and protocol reports cover framing/status/headers/trust/pooling/cancellation. |
| §5 | baseline calibration and actual official feature graph; source lock local-version workaround disclosed, effective OpenSSL override verified. |
| §6 | adapter/management/WS reports enumerate real entry paths and shared-helper exceptions. |
| §7 | thirty slices above map every phase; all implementation gates closed. |
| §8 | AC table and C01–09 below; actual assertions and negative controls replace blanket status claims. |
| §9 | isolated synthetic networks/temporary CA; no historical sensitive POC directory copied. Docker contexts exclude generated/secret files. |
| §10 | independent panels, final build/modules/DB/deployment evidence; final implementation and independent audit passed; PR publication follows. |

| Command | Actual execution evidence |
|---|---|
| C01 | baseline/calibration + protocol reports: official0.162.1 SHA071cbe…; Rust1.91.1 Linux ARM64, Go1.26; complete effective features. |
| C02 | `source scripts/build-openssl.sh; bash scripts/test-http.sh` in locked Linux build environment:50+2 PASS; actual Docker locked release build and independent calibration rerun. Raw unconfigured build intentionally fails if OpenSSL3.6.3. |
| C03 | Rust integration and `test-go-rust.sh` against final5f146 production executable PASS; exact no-skip checks. |
| C04 | full `go test ./...` and build PASS; latest `/tmp/codex-release-all-tests.log`, actual app build `/tmp/codex-signal-fixed-app-build.log`; subsequent signal-order focused race PASS. |
| C05 | full `go test -race ./service ./relay/... -count=1 -timeout=180s` PASS `/tmp/codex-release-c05-race.log`; independent root/relay/controller/model lifecycle race `/tmp/s08-security-final-race.log`. |
| C06 | `CODEX_TRANSPORT_TEST_BINARY=/tmp/codex-transport-openssl364-image-linux-arm64 bash tools/codex-transport/scripts/test-databases.sh` independent PASS `/tmp/s08-judge-databases-production-final.log`,117+81+6. |
| C07 | compare-baseline synthetic15 PASS;9 parsing/negative tests; live exit0,22 parser/harness tests PASS and archived sanitized result; prior failure preserved as history. |
| C08 | actual build/config/container/deployment/compose scripts documented in operations report, final frozen-harness rerun exit0 (`/tmp/codex-deployment-frozen-harness.log`),13 exact charges and both actual120s deadlines. |
| C09 | auth runner + C06 auth replay27 per engine81 total PASS, no skips. |

Conditional checks: relaykit changed and independently passed `GOWORK=off go build ./...` plus tests (`/tmp/codex-final-relaykit-tests.log`). tokenkit is not present/changed in actual-main delivery. No schema, migration or driver dependency change; no migration-upgrade claim needed. Frontend typecheck,31 relevant tests, targeted lint/format and actual production build passed, seven locales preserve existing values. Remote CI has not yet run; local equivalent checks are not represented as remote CI success. No production publish/merge is authorized or performed; requested PR targets the current repository's main only.

Failures and boundaries: prior stale-pool replay, compact truncation replay, Auth TLS/refresh race, partial mutation closure, older-generation WS billing, shutdown timeout/batch flush and signal-registration race were fixed with focused regression evidence. Database write errors are surfaced and not automatically replayed; uncertain DB commits require reconciliation. SIGKILL/host crash/background task recovery is not promised by graceful HTTP/WS shutdown tests. Earlier real management failures were fixture/input issues; corrected run passed and all S09 panels independently closed them.
