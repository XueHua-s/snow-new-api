# S10 independent operations and delivery audit

Date: 2026-10-14. Reviewer is independent from implementation authors. Scope: actual-main tree `/tmp/new-api-codex-plan-pr`; S10 rubric threshold4.0. **Operations evidence provisionally passes; overall S10 HOLD pending final evidence index and S09 live-panel closure.** No live containers, databases, logs or credentials were accessed by this reviewer.

## Rubric

| Criterion | Weight | Score | Evidence |
|---|---:|---:|---|
| ARM64 locked build and optional deployment | .30 | 4.70 | Fixed Rust/Debian digests, ARM64 checks, Cargo locked GNU build, SHA-checked static OpenSSL3.6.4, current application source image, real base+optional Compose deployment |
| Default-off, rollout and rollback observable | .30 | 4.65 | Base Compose unchanged, opt-in startup snapshot, explicit disabled restart with sidecar stopped and no replay,13 exact lifecycle charges, default-off Auth security exception recorded in S05 |
| Health mismatch, restart, long streams and resources | .25 | 4.70 | Invalid profile zero upstream, actual120s deadlines, active/idle WS and SSE restarts, batch drain,256 admission/257 rejection and FD778→10; independent final-image smoke |
| Sanitized documentation and per-AC evidence index | .15 | 3.00 | Candidate scope scan clean and limitations explicit, but task current-state text and final AC/source-plan/command/slice index not yet finalized |

Weighted score **4.425/5** exceeds numeric threshold, but the outstanding hard gates cannot be averaged away. This is not final S10 PASS or authorization to claim all ACs complete.

## Independently observed commands

1. `CODEX_TRANSPORT_IMAGE=sha256:4ab8c6f99c9160e035db1ae3ff415150b06b690681e03c09213e21659bd88c54 bash tools/codex-transport/scripts/test-container.sh` — exit0. Actual image health, UID/GID10001, directory0700/socket0600, nofile2048, no TCP publication, SIGTERM exit0/own socket removal, restart health. Disposable reviewer container/volume cleaned.
2. `docker run --rm --network none --entrypoint /bin/sh sha256:4ab8c6f99c9160e035db1ae3ff415150b06b690681e03c09213e21659bd88c54 -ec 'sha256sum /usr/local/bin/codex-transport; find /licenses -type f | sort'` — exit0. Binary SHA256 `5f146857df6f66acc75e04faf1ea152bdb1824f2e21a3f4b6e3f5375f1dd1f6d`; root LICENSE/NOTICE/THIRD-PARTY-LICENSES, OpenSSL3.6.4 license, hyper-util/tokio-tungstenite/tungstenite MIT+Apache licenses all present.
3. `git diff --check` — exit0.
4. Read-only Python scan of changed/untracked deliverable candidates from Git:1173 files; zero forbidden target/node_modules/scratchpad/local-test/private-key/capture paths; zero files >2MB; zero long JWT/refresh-token/PEM-private-key matches. Only path/count results emitted. This is pattern-based scope verification, not a guarantee against every possible secret format. Historical ignored research directories were not scanned or copied.

## Source and evidence assessment

Read Dockerfile, optional Compose, CI job, `.dockerignore`, build-openssl/build.rs, deployment/Compose runners and operations report. The final app image is `sha256:c1f7972aa01e8423ace374d94b6b2a228cc6ec8263926b838c86648c2ca6d204`. Operations report preserves earlier real shutdown/accounting and readiness-signal failures and the final corrected immutable-image run; it does not relabel old images as fixed. Strict fixture assertions count upstream calls and every wallet/token/user/channel/log charge, including batching before and after process stop. No artificial15s deadline or post-readiness sleep is used in final acceptance.

Actual Compose run uses PostgreSQL16.15 and Redis7.4.11, inherited batching, explicit UID provisioning, isolated volumes, HTTP+WS exact2×1000 and observed app-before-sidecar stop order.150s app grace covers120s graceful plus10s settlement plus10s batch flush; sidecar45s. Base production examples retain their original configuration. Reviewer did not rerun the concurrent four-minute lifecycle matrix because the author is already rerunning the exact refactored harness; final result must be appended.

Resource evidence is correctly scoped:256 held HTTP exchanges at FD778, full cancel/readmission, idle FD10.512MiB WS admission is payload budgeting, not RSS. The documentation does not infer worst-case WS memory from this HTTP probe. Rust socket tests explicitly reject bad directory permissions, non-socket files, symlinks and live sockets, reclaim stale sockets, and preserve a replacement inode during cleanup. The existing S03/S06 panel evidence supplies the ownership/shared-GID and boundary gates.

Official CLI musl and sidecar GNU are explicitly distinct. OpenSSL3.6.4 alignment and synthetic comparisons do not claim byte-identical binaries, all-feature equivalence or anti-detection guarantees. Native ARM64 CI job invokes actual transport/vendor and Go→Rust tests before image build; remote CI has not run and is not claimed. S08 final production-artifact panels record117 billing+81 auth+6 batch checks with no skips, preserving separate historical artifacts.

## Outstanding closure items

- Receive final refactored `test-deployment.py` thirteen-generation rerun result; current reviewed log reaches generation12 and is still waiting on the real batched deadline.
- Complete S09c real-account result and all required independent S09 closure. S10 cannot waive AC15.
- Replace stale current task text claiming Rust is not implemented/AC tests all unrun, update S10 status, and provide final source§1–10, AC01–15, C01–09 and30-slice evidence mapping. Preserve historical failures as historical rather than current state.
- Put default-off Codex Auth insecure/redirect correction plainly in operator-facing README and final PR summary; existing S05 author/security reports already disclose it.
- Recheck final staged file scope before commit and keep PR target `XueHua-s/new-api:main`; remote CI remains a separate post-publication observation.


## Final frozen-harness and evidence-index re-review

The operations author confirmed final runner exit0; I read `/tmp/codex-deployment-frozen-harness.log` through generation13, including both actual120s deadline paths, final batched flush and no replay. Same final immutable application/sidecar IDs as above; resource readings FD778→10 and RSS25176/29164/29184KiB are correctly scoped. Actual Compose and frozen deployment cleanup are recorded by their author. README now explicitly discloses the disabled Codex Auth redirect/insecure exception; current task text no longer claims Rust is unimplemented.

Reviewed `codex-transport-final-audit.md` against source-plan sections, AC01–15, C01–09 and30 slices. Corrected stale frozen-harness pending statements, made the protocol fixture path explicit, and updated harness readiness count to21 as recorded in the latest protocol report. `tokenkit/` genuinely is absent from target main; no missing tokenkit build is invented. relaykit standalone and root/race logs exist; inspected their final PASS lines and no FAIL/data-race matches. These are source/test evidence inspections, not claims this reviewer reran those suites.

Final criterion scores: build/deploy4.70×.30; default-off/rollback4.65×.30; health/lifecycle/resources4.70×.25; sanitized documentation/index4.60×.15 = **4.670/5**. **Operations scope PASS. Overall S10 remains HOLD solely on the cross-step S09c/AC15 prerequisite and its independent panel closure.** No numeric score or operations success substitutes for real-account discovery, HTTP/SSE and multi-roundWS accounting evidence. Remote CI remains unexecuted at this checkpoint; final staged scope must be checked before publication.


## Final cross-step closure — S10 PASS

Inspected archived `codex-transport-live-result.json` and all three final S09 reviews: TLS/H2 **4.6875**, WS/live **4.670**, forensics **4.675**, all PASS. Final report pins the same immutable app/sidecar used by operations, discovers10 models and selects gpt-6-luna; HTTP200 plus WS101/two creates yield28/28/42 usage and98 total charged quota, matching wallet/token/user/channel and three consume logs. Independent forensics confirms successful complete Docker inventories contain no final-prefix resources. No new paid requests were made by this reviewer. Earlier fixture/input failures remain historical and were not counted as acceptance.

All S10 prerequisite gates are now closed. **Final S10 PASS4.670/5** (criterion scores unchanged). Final evidence index and task AC01–15/aggregate implementation DoD updated; task moved to `.specs/tasks/done/codex-transport.feature.md` in both trees, references repaired. This approves implementation delivery for the requested PR, not remote CI execution, merging or production deployment. Original source plan is unchanged.

Final post-live candidate scan:1177 paths, including archived sanitized live result and intended ignored `.claude/skills/codex-transport-research/SKILL.md`; zero prohibited generated/capture/private-key paths, zero long JWT/refresh-token/private-key pattern matches, zero >2MB files. All moved task relative links resolve. Original plan SHA256 remains `76593e13e79af69448cf9bf0af347dee0194ac46b0ec269b2ded7d4243157896`. Root retains final staging ownership; immutable vendor/source patches, binary fuzz seeds and SSE framing fixtures must not be rewritten merely to remove upstream whitespace.
