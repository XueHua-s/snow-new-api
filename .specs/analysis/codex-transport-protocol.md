# S09 protocol verification — final synthetic and live evidence

Current evidence: the final calibrated synthetic matrix and real-account HTTP/SSE plus two-round WS execution passed. All three final independent S09 panels passed (4.6875/4.670/4.675). See `codex-transport-live-result.json` and the final live section below.

## Historical initial calibration assessment (superseded by final evidence)

At this earlier checkpoint S09 was not accepted and no live account traffic had been sent. Earlier S01 statements that the recovered official executable was GNU/glibc, or that its effective OpenSSL was 3.6.3 because Cargo.lock contains openssl-src, were incorrect. Running an executable in a glibc container does not identify that executable's libc.

## Artifact identity and calibration blocker

- Official 0.162.1 SHA256 `071cbe8d821cf1b02b6d8ba6c8b7991b228fcb8519dcb68a37d31222bb8cabe5`: `file` reports statically linked ARM aarch64; `readelf -l` has no interpreter; embedded build paths name `aarch64-unknown-linux-musl`; direct bounded version-string extraction returns `OpenSSL 3.6.4 25 Aug 2026`.
- The fixed official source tag `.github/workflows/rust-release.yml:109` explicitly says Linux release artifacts ship MUSL; ARM64 primary release builds codex, code-mode-host, responses-api-proxy and bwrap. `.github/scripts/install-musl-openssl.sh:17` pins OpenSSL **3.6.4**, its SHA256 and static build configuration, exporting target `OPENSSL_NO_VENDOR=1` and `OPENSSL_STATIC=1`. This overrides Cargo's openssl-src/vendored feature.
- The current sidecar is Linux ARM64 **GNU/glibc**, with vendored OpenSSL **3.6.3**. Synthetic comparisons therefore share OS/architecture/container/endpoint/request, but **not libc or effective OpenSSL build**. Measured wire matches remain evidence about the measured requests; they cannot establish identical builds or universal fingerprints.
- Required frozen-material corrections, owned by root: `baseline.json` official target/effective library versus sidecar target/build policy; README profile wording; baseline/research/validation/contract reports; task AC10/11 and S09 acceptance wording; any Docker/PR statements claiming official GNU or full feature identity. Preserve the historical evidence and append an explicit correction rather than rewriting past observations into a claim they never proved.

Exact-build calibration requires a deliberate plan decision and independent review. For an official-release target, reproduce **musl + static OpenSSL 3.6.4** using the pinned official compiler/build flags/CA paths, rebuild sidecar and rerun all relevant Linux resource/socket/proxy/CA/HTTP/WS gates plus the protocol matrix. If GNU remains the production requirement, retain it as a documented platform difference; building official fixed source for GNU with identical OpenSSL/configuration creates an additional **source-built comparator**, not a replacement official release artifact. Same-library wire checks alone do not waive the target difference. No Rust/dependency/contract changes were made by this verifier.

## Official merged features

`fixtures/protocol/official-features.json` records source/lock/graph SHA256, commands and effective protocol features. Downloaded fixed-tag source lock equals S01's cached lock (`49fe417b...a4f8117`). Both Cargo 1.91.1 and official 1.95.0 reject the release tag with `--locked`: Cargo.toml workspace version is 0.162.1, but 161 local workspace packages remain 0.0.0 in the published lock.

In an isolated `/tmp` source copy, only those 161 local versions were repaired. A complete diff checked all 322 changed lines are exactly `0.0.0`→`0.162.1`; no external dependency changed. `cargo +1.95.0 tree --locked --target aarch64-unknown-linux-musl -p codex-cli -p codex-responses-api-proxy -p codex-code-mode-host --prefix none --format '{p} features={f}'` then completed, exit 0. This is a traceable **derived-lock** reproduction, not a claim the published lock directly passed.

The release graph confirms rustls 0.23.45 `aws_lc_rs,std,tls12,prefer-post-quantum` (also ring/logging), exact WS fork revisions/proxy/deflate, reqwest 0.12.28 for Responses and an unrelated reqwest 0.13.4 elsewhere. Reqwest 0.12.28 has **no SOCKS feature** and no `native-tls-vendored`; release package unification enables openssl-sys vendored/openssl-src, but the release environment overrides that with OpenSSL 3.6.4. Enabling SOCKS in the sidecar is an intentional compatibility extension, not official feature identity.

## Isolation and sampling method

The new runner copies only verified official executable, sidecar executable, fixture source and pinned pure-Python HTTP/2 packages into a disposable ARM64 container with `--network none --cap-drop ALL --security-opt no-new-privileges`. No developer HOME, auth store, repository or Docker socket is mounted. It creates a private temporary fake OAuth home, CA and leaf key; none are committed. Proxy fixtures only connect to their own loopback upstream and deny non-fixture targets. Official background attempts toward ChatGPT hosts are refused locally, never sent to those hosts. Package acquisition occurs before offline sampling. Raw samples contain only synthetic values and stay temporary; committed evidence excludes auth.json, keys and application request bodies.

TLS parser validates vector lengths, preserves extension order and omits only RFC-defined random ClientHello/session-ID content, ephemeral key bytes, PSK ticket bytes/ages/binders while retaining their lengths/groups. Rustls's randomized extension order is **reported**, not sorted away; pinned rustls `src/msgs/handshake.rs:1045–1076` implements random order for order-insensitive extensions and fixed final PSK ordering. JA3 alone is never used as acceptance.

Actual Responses requests are generated by official `codex exec` using a custom loopback provider and fake ChatGPT OAuth. A synthetic `shell` tool call runs `/bin/true` under read-only sandbox and generates the second inference request. WSS includes prewarm plus two actual response.create generations. The sidecar then forwards the **same captured synthetic request bodies and headers** to the same loopback origin. H2 captures ordered SETTINGS, WINDOW_UPDATE, HEADERS/CONTINUATION raw HPACK, DATA lengths/flags, streams and GOAWAY; GET /models is excluded from inference comparisons.

## Observed differences (initial completed direct matrix)

- Default native ClientHello normalized fields **and extension order** match. Both negotiate HTTP/1.1 without ALPN; H2 comparison is a separately labeled explicit-CA rustls path.
- Explicit-CA HTTP and WSS rustls fields match; extension order varies as the pinned library intentionally randomizes it. Initial key shares include the post-quantum group; restored HTTP sessions use PSK with matching retained ticket/binder lengths and supported groups.
- Default official HTTP creates a new TLS connection for each generation; sidecar reuses a bounded origin/policy pool. The server keeps the same SSLContext and does not send Connection: close or GOAWAY in these cases; passive peer EOF is recorded. Source cause: official `core/src/client.rs:1693` calls `build_api_transport` per `stream_responses` invocation; `:1182–1203` creates a new client; `login/src/auth/default_client.rs:258–305` constructs a fresh builder/client. This is a deliberate sidecar pooling difference.
- A **separate explicit override** allows official request_max_retries=1 and supplies first-response 503/Connection:close. It reuses the official transport within one generation. Both official and sidecar then exhibit rustls `session_reused: false,true`; sidecar uses two explicit local requests and never retries automatically. Native remains `false,false` on both. No native restored ClientHello was observed; it is not labeled a restored-handshake PASS.
- H2 first actual POST has identical SETTINGS `[(2,0),(4,2097152),(5,16384),(6,16384)]`, connection WINDOW_UPDATE `5177345`, pseudo-header order `:method,:scheme,:authority,:path`, full header order and byte-identical first HEADERS/HPACK under matched synthetic headers.
- Streaming DATA segmentation differs: official's in-memory request uses full frames with END_STREAM on final data; sidecar's pull-based UDS body can split at different offsets and emit an empty END_STREAM. Body hashes match. No claim of identical full frame sequence is made.
- Second official generation uses a fresh connection/stream1 and fresh HPACK table; sidecar uses stream3 and its dynamic table. Initial sample HEADERS sizes were official 1214/1214 versus sidecar 1214/329. Both send GOAWAY(NO_ERROR) at teardown, but timing/lifetime differ.
- WSS offers `permessage-deflate; client_max_window_bits` on both. Proxy capabilities differ: official default environment HTTPS WSS rejects the proxy scheme and falls back to HTTP (source `websocket-client/src/dialer.rs:46` uses the fork default dialer; explicit resolved routes have a separate HTTPS wrapper). Official HTTP SOCKS5/SOCKS5h has no effective reqwest SOCKS feature and makes no fixture connection, then reports waiting for network. These cases must show **known unsupported official path versus tested sidecar extension**, never a fabricated official success or WS comparison against fallback HTTP.

## Commands and remaining gates

- `python3 -m unittest discover -s tools/codex-transport/fixtures/protocol -p 'test_*.py' -v`: six parser/completeness regression cases PASS, exit 0 (truncation, trailing bytes, random-field exclusions, ephemeral-length retention, extension order preservation and missing-matrix rejection).
- `python3 tools/codex-transport/scripts/compare-baseline.py --profile 0.162.1 --platform linux-arm64 --synthetic`: iterative synthetic runs exposed and retained unsupported-path differences; final complete matrix and final hashes pending below.
- S09c real model discovery/HTTP/SSE/multi-round WS/accounting remains gated on S05/S07/S08 and synthetic acceptance. The synthetic runner's `--live` fails explicitly rather than claiming a live test occurred.
- Full S09 cannot pass until baseline/build discrepancy disposition, native/WS reconnect observations, final proxy matrix and independent protocol/security/live reviews are recorded.

## Completed initial matrix and handoff for calibrated resampling

The initial 14-case full runner completed with exit **0**, no missing cases or unexpected case errors. `fixtures/protocol/observed-initial.json` is the compact synthetic evidence snapshot; HPACK is retained as lengths/SHA256 rather than embedded synthetic authentication bytes. Artifact identities: official `071cbe8d821cf1b02b6d8ba6c8b7991b228fcb8519dcb68a37d31222bb8cabe5`; sidecar `d5c1c7dd9b727f0180cfa068641100e1c929c06aaddeef99892315dda8a5f522`. The snapshot records the three known unsupported official proxy paths explicitly and verifies sidecar success using templates from successful direct official requests. Its `complete:true` means observations are complete for that then-current matrix; **it does not mean build equivalence or S09 acceptance**.

A subsequent focused fixture run added WS reconnect: default official and sidecar each exchanged prewarm plus two creates on one connection, while explicit clean server close after generation one yielded two connections with create counts `[2,1]` on each. Official process exited 0; both TLS session-reused arrays were `[false,false]`. The server close was intentional at a completed-generation boundary, carried code 1000, and was asserted by the sidecar client. No restored WS ClientHello was observed. The current runner now requires **15 cases**, including `ws-resume`; final single-command resampling against the calibrated OpenSSL3.6.4 sidecar remains pending. Original 14-case evidence is intentionally not rewritten as that final run.

Root reviewed the original plan §5: native-tls-vendored describes the historical POC and formal work explicitly requires checking libc/features. Root's chosen correction retains GNU production, calibrates effective OpenSSL3.6.4, and declares the official musl difference. The baseline calibration owner is implementing the narrow build change and rerunning Rust gates; this verifier will rerun all 15 cases on that frozen binary after handoff. No matching-libc claim will be made.

The final fixture revision also verifies sidecar production/profile/platform health and official runtime version. Parser regressions were rerun after revision: all six passed. These small final harness checks are not substituted for the pending calibrated full matrix.

## Final calibrated synthetic matrix — complete observations, pending independent gate

Executed:

```text
python3 tools/codex-transport/scripts/compare-baseline.py --profile 0.162.1 --platform linux-arm64 --synthetic --sidecar /tmp/codex-transport-openssl364-image-linux-arm64 --output /tmp/codex-protocol-calibrated-result.json
```

Exit **0**, **15/15 cases present**, `missing: []`, `case_errors: {}`. The runner copied the actual production-image binary, SHA256 `5f146857df6f66acc75e04faf1ea152bdb1824f2e21a3f4b6e3f5375f1dd1f6d`, from image `codex-transport:openssl364`, image ID `sha256:4ab8c6f99c9160e035db1ae3ff415150b06b690681e03c09213e21659bd88c54`. It verified official runtime `codex-cli 0.162.1`, official binary hash, and sidecar production/profile/Linux ARM64 health. `fixtures/protocol/observed-calibrated.json` preserves the final field-by-field evidence and artifact identities; the earlier `observed-initial.json` remains historical.

The effective OpenSSL version is now 3.6.4 on both. Official remains musl and sidecar remains GNU. All first native ClientHello fields **including ordered extensions** matched; first H2 HEADERS/HPACK again matched byte-for-byte. Request body hashes matched on comparable cases. Explicit-CA rustls extension **values** match while original randomized order differs; both showed `[false,true]` session reuse under the explicitly labeled 503/retry fixture. Native remains `[false,false]`, and WS clean reconnect remains `[false,false]`; default WS has create counts `[3]` on each and clean reconnect `[2,1]` on each. No missing native or WS restored handshake was relabeled as a successful restored handshake.

The no-restoration boundary is also supported by source: native-tls 0.2.14 `src/imp/openssl.rs:340` calls `connector.configure()` each connect; openssl 0.10.75 `src/ssl/connector.rs:94` creates `Ssl::new` without installing a previous session. The official Responses WS connector is constructed at each connect in `codex-api/src/endpoint/responses_websocket.rs:398/433`; `websocket-client/src/lib.rs:95–98` creates the rustls ClientConfig. The sidecar similarly creates ClientConfig in `src/ws.rs:374`. These paths do not share a TLS resumption store across WS reconnects. This does not assert that native-tls or rustls could never support resumption under a different caller configuration.

All four explicit proxy schemes were exercised for HTTP and WSS. Three official default paths are **known unsupported** (HTTP SOCKS5/SOCKS5h, environment-proxy HTTPS WSS); corresponding sidecar requests completed against the fixture using direct official request templates. This is tested additional compatibility, not identical official behavior. The unsupported official HTTP processes were intentionally killed after their bounded network-wait observation (`exit -9`), not counted as successful CLI calls. All comparable official paths exited 0. The report carries the exact unsupported reason and requires a successful sidecar request/create sequence. Non-fixture proxy destinations were refused locally, with no external network available.

The runner's default sidecar path was then updated to the calibrated artifact (the command above supplied it explicitly); all six parser/completeness regression tests and `git diff --check` passed again. No production code was changed by this verifier. Docker removed the sampling container through the runner's cleanup path. No real credentials, account requests or live accounting were used.

Synthetic observations are ready for independent review. S09 overall and AC15 remain unaccepted until the independent protocol/security gates and gated live HTTP/SSE/multi-round WS/accounting work complete.

## Independent HOLD remediation: exact WS bytes and extension values

The TLS/H2 judge correctly identified that the previous observation hashed empty HTTP handshake bodies and counted WS messages, while the fixture reserialized parsed JSON. That was insufficient proof of WS payload preservation. The previous calibrated snapshot SHA256 was `f40b111fe841515bb3bf8a38f054adc337a1e8e24266871ac862081af1e9d52b`; the current snapshot supersedes its WS claims.

The fixture now stores original complete message payloads as base64 **only in temporary synthetic samples** and replays the decoded original bytes directly. It no longer JSON-serializes requests for WS replay. The summary records per-connection, ordered per-message byte length/SHA256, `type`, `generate` presence/value, and verifies prewarm `generate=false` followed by exactly two actual response.create generations. Reconnect grouping is retained. The summary also retains and compares actual complete `sec-websocket-extensions` values. The unsupported HTTPS-proxy WS extension explicitly names **direct official ws** as its template source; its three payload digests and extension offer must match that direct template. Other WS cases compare their own official connection(s).

Negative controls preserve message count and byte length while changing content, and preserve the extension header name while removing its parameter. Both the focused evidence comparison and the complete `summarize` entrypoint reject them with explicit case errors. All **9** parser/completeness/payload/offer tests PASS (exit 0):

```text
python3 -m unittest discover -s tools/codex-transport/fixtures/protocol -p 'test_*.py' -v
```

Regenerated one consistent full **15/15** matrix using the unchanged calibrated production binary, rather than combining old summaries with new WS data:

```text
python3 tools/codex-transport/scripts/compare-baseline.py --profile 0.162.1 --platform linux-arm64 --synthetic --sidecar /tmp/codex-transport-openssl364-image-linux-arm64 --output /tmp/codex-protocol-ws-final-result.json
```

Exit **0**, `complete:true`, `missing:[]`, `case_errors:{}`. All six WS cases (direct, reconnect, and four proxy schemes) have identical expected/actual ordered payload evidence and exact extension offer values. `observed-calibrated.json` now records the revised harness SHA256 and all message comparisons. `observed-initial.json` remains untouched historical evidence. `git diff --check` passes.

The synthetic server **does not negotiate permessage-deflate**; this matrix proves outgoing offer equality (`permessage-deflate; client_max_window_bits`) and uncompressed message byte preservation. Negotiated compression/fragmentation behavior remains S06's independent evidence. No production transport changes, real credentials or live traffic were involved. Ready for independent re-review; the author does not convert the prior HOLD into a PASS.


## S09c live runner prepared — no real upstream execution yet

The synthetic gate was independently accepted by all three reviewers (4.680 / 4.650 / 4.695). Full S09/AC15 remains pending S08 lifecycle repairs, their independent acceptance, and actual live execution.

`compare-baseline.py --live` now dispatches to `scripts/live-verification.py`; the earlier explicit refusal describes the historical runner. The prepared runner uses the real Go management API for discovery, one HTTP/SSE generation, and two successive WS generations on one connection. It checks actual upstream usage against exact wallet, token, user, channel, consume-log and request-linkage accounting. Its isolated validation expression is `tier("live_verification", p * 2 + c * 2)`, yielding one quota unit per token at the fixture's configured group ratio; this is not provider retail pricing. Model selection requires a discovered known low-cost candidate. No automatic inference retry is performed.

Credential input is stdin or an owner-only regular file; refresh credentials are discarded. Neither credential is placed in argv/environment, images, repository files or reports. The seeded SQLite database and app data reside in Docker tmpfs volumes, removed and checked absent in `finally`. Docker log collection is disabled. The internal app/sidecar network reaches upstream only through an opaque CONNECT proxy restricted to `chatgpt.com:443`; system TLS roots remain active and no live interception CA is installed. The locally published gateway forwarding port binds loopback only. Reports permit only expected status/accounting fields and hashed response IDs; third-party error bodies are suppressed. These controls address the applicable OWASP authentication/session transport and secret-handling guidance, including ASVS 5.0.0 V12.3.2 transport verification; this preparation is not a claim of universal ASVS compliance.

Observed readiness verification:

- `python3 -m unittest discover -s tools/codex-transport/fixtures/protocol -p 'test_*.py'`: **16 tests PASS**, including credential permissions/symlink rejection, stdin-only secret transfer, stderr/public-error redaction, cleanup-on-failure, exact accounting mismatch rejection, and no-Docker dry mode.
- `python3 tools/codex-transport/scripts/compare-baseline.py --profile 0.162.1 --platform linux-arm64 --live --dry-run --output /tmp/codex-live-dry-result.json`: exit **0**, synthetic canary only, cleanup true, live_executed false.
- Actual Docker bootstrap, setup, tmpfs credential seeding, restart, management login and zero-generation accounting: **PASS**, using a synthetic fake credential and `Deployment(..., allow_egress=False)` which rejects every external CONNECT. Containers, network and tmpfs volumes were cleaned up. This used pre-repair app image `sha256:9f909e59414bad05221ad0b87024890e44f03b73f5f68cdb5045cb0c9e243dab` only to validate harness plumbing; it is not S08 or live acceptance.
- `git diff --check`: exit **0**.

The executable requires an explicit app image and expected image ID before deployment. Root must supply the final repaired, reviewed app artifact and release the live gate. No real credentials, real model discovery, paid generation, real-account billing or refresh request has been performed by this verifier. The prepared runner itself remains subject to review and the actual live result must be recorded separately.


### Live-readiness HOLD corrections

The security reviewer held the first prepared runner because mutable image tags could race the inspected identity, sidecar identity lacked an approval check, and SIGTERM could bypass cleanup. Both expected image IDs are now required; inspected immutable IDs are used for every app/sidecar launch. SIGTERM/SIGINT become controlled exceptions entering cleanup; repeated termination is ignored while cleanup runs. Cleanup verifies every container, tmpfs volume and network is absent. The non-secret resource prefix is emitted before initialization so a SIGKILL or host failure can be recovered manually: list containers/networks/volumes matching the exact emitted `codex-live-<id>` prefix, remove matching containers first, then its volumes and network. SIGKILL cannot be caught and is explicitly outside automatic cleanup guarantees.

The expanded suite passes **19 tests**, including pinned IDs, actual process SIGTERM delivery with cleanup assertion, and mocked failed container/network deletion detection. A separate real Docker egress-denied deployment was initialized with the previous bootstrap-only app image, sent SIGTERM, and verified all containers/volumes/network absent: **PASS**. No real credentials or upstream calls were used. The dry CLI and `git diff --check` pass again. Independent re-review is pending; these author checks do not themselves lift HOLD.

Final reviewed-candidate app bootstrap repeated against immutable app `sha256:c950c49e529edfb4ed6162e27a9ed63dd1175815438eed5f62206fa1eef1a569` and sidecar `sha256:4ab8c6f99c9160e035db1ae3ff415150b06b690681e03c09213e21659bd88c54`: actual Docker setup, fake-credential tmpfs seeding, restart, login, zero-generation accounting and verified full resource removal **PASS**. Egress remained denied; this is harness readiness, not live acceptance.


Final readiness correction: a failed `docker inspect` no longer counts as proof of absence. Cleanup requires successful complete container (`--all`), volume and network name inventories, then compares exact resource names. Engine/API errors produce `ephemeral_cleanup_unverified`; retained resources produce `ephemeral_cleanup_failed`. **20 tests PASS**, including daemon/inventory failure and all three resource kinds remaining. Repeated actual egress-denied Docker setup, fake credential seeding, restart, login, zero accounting and successful inventory-based cleanup against the final app `sha256:c1f7972aa01e8423ace374d94b6b2a228cc6ec8263926b838c86648c2ca6d204` with unchanged pinned sidecar: **PASS**. Dry CLI also PASS. No real upstream traffic or credentials used.

Root executed the gated runner and reported `management_result` before any generation; resources were cleaned. Added sanitized management diagnostics: fixed operation phase and HTTP status, bounded upstream numeric status, enumerated transport code/phase and refresh-failure category only. Arbitrary messages and bodies are never emitted. Failure reports now also overwrite the sanitized result file, preventing stale success evidence. `gpt-6-luna` is eligible only when returned by actual discovery. **21 harness tests PASS**, including secret-canary redaction and unknown category rejection; `git diff --check` PASS. The route exists and returns HTTP 200 with success=false for discovery errors; the original generic stage cannot establish the underlying cause. Root owns subsequent live execution.

Root reported a subsequent discovery `upstream_status:404`. Source inspection identified a live fixture error: seeded base URL included `/backend-api/codex`, while both gateway discovery and generation append their full protocol paths. Corrected the fixture base to the official channel origin `https://chatgpt.com`, matching channel type 57 default. A regression observes the actual seeded row and asserts exact composed model and response endpoints. **22 tests PASS**, diff check PASS. No production changes or new real requests by this verifier. The earlier refresh-failure category means discovery first received 401 and then local refresh failed; that earlier input attempt is not credential validity evidence.

## Final live execution — 2026-10-14

Executed `python3 tools/codex-transport/scripts/compare-baseline.py --profile 0.162.1 --platform linux-arm64 --live` with both image arguments and expected IDs pinned to the final app `sha256:c1f7972aa01e8423ace374d94b6b2a228cc6ec8263926b838c86648c2ca6d204` and sidecar `sha256:4ab8c6f99c9160e035db1ae3ff415150b06b690681e03c09213e21659bd88c54`. Credentials entered only via no-echo stdin; no refresh token was retained or used. Exit 0, allowlisted result archived in `codex-transport-live-result.json`.

Actual admin model discovery returned 10 models; selected `gpt-6-luna` from that result. HTTP/SSE returned 200 and completed usage 23 input + 5 output = 28. One WS connection returned 101 and completed two linked generations: 23+5=28 and 37+5=42. The runner observed actual terminal events and checked settlement after each generation. Final wallet/token remainder999902, user/token/channel consumed98, user request count3 and exactly three linked consume logs match the isolated validation expression. This rate verifies accounting and does not represent provider retail pricing. Cleanup completed before success returned; isolated containers/volumes/network were removed.

Earlier failures remain part of the record: canonical terminal input was aborted before use; a malformed transcription is not evidence about validity of the supplied credential; correct credential discovery returned404 because the fixture had duplicated `/backend-api/codex` in its base URL. The fixture now seeds `https://chatgpt.com`, matching the production channel contract, with an actual inserted-row route regression. No production or image change was needed. The corrected live runner's13 tests plus9 protocol tests pass (22 total via unittest discovery). No successful generation was automatically replayed.
