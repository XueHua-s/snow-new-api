# S09 independent synthetic security and evidence review

Decision: **synthetic S09a/b PASS, 4.69/5**. Full S09 and AC15 remain **HOLD** until gated live model discovery, HTTP/SSE, multi-round WS and correlated accounting evidence pass. This review does not approve live execution before the other prerequisites.

| Criterion | Weight | Score | Evidence |
|---|---:|---:|---|
| Fixed version/platform/conditions and reproduction | .25 | 4.65 | Official executable, calibrated production executable, source archive, original/derived lock and complete feature graph hashes independently recomputed and match records. Official musl versus production GNU remains an explicit difference, not identical-build acceptance. |
| First/resumed TLS | .25 | 4.65 | All recorded first extension values match; original ordered lists retained. Native first ordered match, rustls randomized ordering documented. Actual rustls reuse false→true; native and WS false→false honestly retained as non-restoration observations. |
| Actual Responses H2/WS | .30 | 4.70 | Actual first POST HPACK exact; complete frame/settings/window evidence, second-generation pooling differences disclosed. Six WS cases compare exact ordered message lengths/digests, generation semantics and full extension offers. |
| Honest differences/security evidence | .20 | 4.80 | Network-none fixture, clean environment, fake OAuth, no host credential mount, proxy target restriction, temporary raw samples and explicit unsupported official proxy cases. Live is rejected by synthetic runner. |

Weighted score: .25×4.65 + .25×4.65 + .30×4.70 + .20×4.80 = **4.695** (reported 4.69 without upward rounding). No blocking synthetic evidence defect found.

## Independent checks performed

Read source plan, task S09/AC10/AC11/AC15, protocol report, compare-baseline.py, relevant sample.py paths, official-features.json and observed-calibrated.json. No production files edited and no account credentials used.

Executed `python3 -m unittest discover -s tools/codex-transport/fixtures/protocol -p 'test_*.py' -v`: **9 tests PASS**, including same-length/same-count modified WS payload, same-header-name changed extension parameter, and propagation through the complete summary entrypoint. Parser negative controls cover malformed vectors, retained ephemeral length and retained extension order.

Independently recomputed SHA256 using Python hashlib: official executable `071cbe8d821cf1b02b6d8ba6c8b7991b228fcb8519dcb68a37d31222bb8cabe5`; production executable `5f146857df6f66acc75e04faf1ea152bdb1824f2e21a3f4b6e3f5375f1dd1f6d`; source archive, feature graph and both lock hashes all match official-features.json. Unified-diff verification found exactly **322 changed lines**, exclusively 161 local version replacements `0.0.0`→`0.162.1`. Published-lock failure and derived-lock limitation remain disclosed; this review did not rerun Cargo graph generation.

Verified current harness file hashes against the snapshot, all 15 cases have no case errors, six WS expected/actual records are exactly equal, first H2 HPACK equality is true, and first TLS extension values match while preserving source order. Temporary reviewer comparison by extension ID checked values only and did not modify evidence or normalize nested cipher/group ordering. Snapshot SHA256: `8e1dfa0eafce793327b69d582a175ebaf4a43c88031214952e29d068e2cb619e`. The complete Docker sampling run is author-observed evidence, not a new run by this reviewer.

The sampler builds a fresh explicit environment, generates visibly synthetic unsigned credentials, writes auth.json mode 0600 inside disposable storage, and runs Docker with network none, cap-drop ALL and no-new-privileges. It copies only the checked binaries, fixture and pinned-version Python packages; it mounts neither HOME nor repository nor Docker socket. HTTP/SOCKS fixture proxies validate the loopback destination before connecting. Reviewed committed JSON evidence contains neither access/refresh-token fields nor private PEM. This scoped inspection is not a substitute for final repository-wide secret review.

## Limits retained for final acceptance

- The comparison runner's `complete:true` means matrix observations are complete; it is not a blanket protocol-equivalence verdict. Human review of intentional differences remains required.
- Effective OpenSSL3.6.4 matches, libc/build targets differ. No universal fingerprint or indistinguishability claim is justified.
- No native or WS restored handshake was observed; source-supported no-restoration behavior is the recorded outcome.
- HTTP SOCKS5/SOCKS5h and default environment HTTPS WSS are unsupported official paths. Sidecar successes use explicitly named direct official templates and are extensions, not matching successful official calls.
- WS server does not negotiate compression. Exact offered parameters and uncompressed message bytes are proved here; negotiated compression/fragmentation remains S06 evidence.
- No live account, settlement, full deployment or final PR acceptance is granted by this synthetic review.

## S09c prepared live runner — independent pre-execution review

Readiness decision: **HOLD pending fixes**, independently reviewed before any real credential execution. Earlier synthetic S09a/b PASS is unchanged; full S09/AC15 remain HOLD.

Reviewed live-verification.py, compare-baseline.py live dispatch, test_live_verification.py, referenced framing helpers, root Dockerfile/logger behavior, full billing rule and billingexpr/expr.md, and cached OWASP OAuth/session guidance. Applicable controls here are credential confidentiality in storage/transport/logs, trusted destination and certificate verification, and reliable disposal of short-lived test credentials. This is scoped readiness review, not an ASVS compliance claim.

Observed positive controls: owner-only regular-file/no-follow or stdin credential input; refresh token discarded; docker exec stdin carries seed JSON; no bearer values in argv/environment; tmpfs SQLite and socket volumes; disabled Docker logging; allowlisted report fields; error boundary suppresses external exception strings; internal app/sidecar network with only chatgpt.com:443 CONNECT permitted by egress helper; default sidecar trust with no synthetic CA installed; model discovery via Go management path; three intended generations (one HTTP/SSE, two WS) through Go/Rust, checking each settlement against exact wallet/token/user/channel/log quantities. Isolated expression is labeled validation pricing, not retail pricing. No upstream response body is included in report.

Blocking findings sent to root and protocol author:

1. **Unpinned final image gate.** run_live checks expected app image ID but subsequently launches its mutable tag. Sidecar image ID is recorded without an expected-ID comparison, then also launches mutable tag. The final reviewed artifacts are therefore not enforced. Require both expected IDs and run both inspected immutable IDs; add mismatch and tag-mutation regression coverage.
2. **Termination can retain credentials.** Default Python SIGTERM immediately terminates without executing deployment finally cleanup, leaving live credentials in running app/store tmpfs volumes. Install signal handling that enters cleanup; verify a termination path using fake credentials only. Cleanup currently verifies volume absence but not containers/network; ensure all named resources are absent, reporting failure otherwise. SIGKILL/host failure cannot be caught; document resource-prefix recovery without printing secrets.

Independent commands run:

- `python3 -m unittest discover -s tools/codex-transport/fixtures/protocol -p 'test_*.py' -v`: **16 PASS** (7 live-runner unit tests + 9 synthetic protocol tests).
- `python3 tools/codex-transport/scripts/compare-baseline.py --profile 0.162.1 --platform linux-arm64 --live --dry-run --output /tmp/codex-live-judge-dry.json`: exit **0**, synthetic canary only, cleanup true, live_executed false.

These tests establish existing behavior, not remediation of the findings. No real credential read, upstream request or production edit occurred. Re-review fixes before root authorizes live execution after S08. Actual upstream acceptance, usage/accounting correlation, final image/source identity and real cleanup remain execution evidence requirements.

### S09c readiness re-review — findings closed

Decision: **prepared-runner security readiness PASS**; this is not permission to skip S08 or a live-result PASS. Full S09/AC15 remain HOLD. Both originally blocking findings are resolved: app and sidecar expected IDs are mandatory, compared with inspected identities, then those immutable IDs are assigned to Deployment before any launch; SIGTERM/SIGINT enter finally cleanup and repeated termination is deferred while cleanup removes resources. The non-secret resource prefix enables manual recovery after uncatchable SIGKILL/host failure.

This re-review also independently reproduced a further cleanup defect in the intermediate fix: Docker inspect errors (including an unavailable daemon) were treated as absence. The author corrected it before readiness acceptance. Cleanup now requires **successful** container/volume/network inventories and checks exact resource names. Engine failure yields `ephemeral_cleanup_unverified`; surviving resources yield `ephemeral_cleanup_failed`. Thus unavailable Docker cannot silently prove credential disposal.

Independently reran `python3 -m unittest discover -s tools/codex-transport/fixtures/protocol -p 'test_*.py' -v`: **20 PASS**, including real process SIGTERM delivery into mocked deployment cleanup, immutable image selection, each resource-kind leftover and unavailable-engine inventory rejection. Repeated live-dispatch dry CLI also passed with synthetic canary only. Read author's actual Docker egress-denied SIGTERM/cleanup and fake-credential setup/login/zero-accounting evidence; those Docker runs were not rerun by this reviewer. Independently inspected production sidecar ID `sha256:4ab8c6f99c9160e035db1ae3ff415150b06b690681e03c09213e21659bd88c54`.

Root identifies final app candidate `sha256:c1f7972aa01e8423ace374d94b6b2a228cc6ec8263926b838c86648c2ca6d204`; author's earlier bootstrap used `c950c49…`. This review does not relabel that earlier bootstrap as testing the final app. Root must provide the actually approved final IDs to the gated invocation after final S08 evidence is complete. No real credentials were accessed and no real upstream call was made during review.

## Final S09 review — live evidence completes the gate

Decision: **S09 PASS, weighted 4.675/5**. This supersedes this reviewer's earlier S09/AC15 HOLD for missing live evidence only; historical failures and their remediation remain above. It is not a global implementation/PR acceptance verdict.

| Final task rubric | Weight | Score | Evidence |
|---|---:|---:|---|
| Fixed version/platform/target/request/proxy/CA reproducibility | .25 | 4.65 | Previously reviewed calibrated official/sidecar matrix; final live report pins approved immutable app and sidecar IDs. Official musl versus production GNU difference remains explicit. |
| First/restored native/rustls TLS | .25 | 4.65 | Previous original-order observations and justified rustls randomness, actual CA-rustls resumption, honest native/WS non-restoration outcomes remain valid. |
| Actual Responses H2 and OAuth WS comparison | .30 | 4.70 | Reviewed full H2 evidence and exact ordered WS message/offer comparison, plus two real WS generations on one connection. |
| Real HTTP/multi-round WS and honest differences | .20 | 4.70 | Discovery, one real SSE generation, two real WS generations, exact accounting, hashed IDs, cleaned credential resources, and retained fixture/input failures. |

Weighted result: .25×4.65 + .25×4.65 + .30×4.70 + .20×4.70 = **4.675**.

Inspected only allowlisted `/tmp/codex-live-final-result.json`, not credentials, Docker logs or live raw database. Root observed runner exit 0. Report SHA256 independently computed as `58b570f793b9cdeac0203df9f145503fc6472044cba28cc4e5bb8cd523e4edbe`. Report pins app `sha256:c1f7972aa01e8423ace374d94b6b2a228cc6ec8263926b838c86648c2ca6d204` and sidecar `sha256:4ab8c6f99c9160e035db1ae3ff415150b06b690681e03c09213e21659bd88c54`.

Actual discovery returned 10 models and selected `gpt-6-luna`. HTTP status 200 and WS 101 with two rounds yielded observed usage **23+5=28**, **23+5=28**, **37+5=42**, total **98**. These are this new report's values, not historical POC acceptance. Independently passed the exact accounting verifier: wallet/token remaining 999902, used 98, user request count 3, channel used 98, three consume logs with exact per-generation quantities and channel/token linkage. Three response ID hashes are distinct; WS request IDs carry successive `-ws-0`/`-ws-1` suffixes. The isolated rate is validation pricing, not provider cost.

Independently queried Docker's successful complete container (`--all`), volume and network name inventories: **no resources with the final run prefix `codex-live-255fe3e7fc` remain**. Combined with reviewed tmpfs-only credential persistence and disabled Docker log capture, this confirms final deployment cleanup without accessing secret-bearing content. No new real request was made by this reviewer.

Reviewed origin correction and sanitized diagnostics, then ran `python3 -m unittest discover -s tools/codex-transport/fixtures/protocol -p 'test_*.py' -v`: **22 PASS**. The seed regression proves the channel base is the origin `https://chatgpt.com`, allowing gateway paths to produce exact discovery/inference endpoints. Earlier exact-token 404 was a fixture path error and remains historical failure evidence; earlier malformed transcription authentication failure does not establish credential invalidity. Diagnostic output admits only fixed phase/category, bounded numeric status and enumerated transport fields; arbitrary message/body content is excluded, and failed runs overwrite stale output.

Residual scope limits are unchanged: three minimal live generations are acceptance evidence, not exhaustive provider behavior or load proof. Synthetic full-build differences, proxy extensions, native/WS non-restoration and uncompressed synthetic WS limitation remain disclosed. S08/S10 and final repository audit retain their own independent acceptance requirements.
