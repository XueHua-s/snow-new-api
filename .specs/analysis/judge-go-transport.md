# S04 Go transport independent preliminary review

Date: 2026-10-14. Reviewer: judge_go_transport (not implementation author).
Verdict: **HOLD**. This is preparation, not the final S04 panel gate. S03 has not released real Rust execution, so S04c is deliberately unexecuted.

## Scope and inspected artifacts

Reviewed actual main-based worktree `/tmp/new-api-codex-plan-pr`, HEAD `517075d5658ad59372859407df9e27de8f914542` plus uncommitted implementation. Read project conventions, task S04 rubric, private protocol README, contract limits/scenarios, service adapter and tests, root strict JSON codec, startup integration, relay dispatch and retry/error wrappers. No real credentials or capture files were read. No implementation was changed.

Reviewed source hashes (pre-author framing follow-up):

- service/codex_transport.go: `10ede31947d3948bfe3b5d89a3646f0f9dd49f6132cb0cbceaf07c4de14e815e`
- service/codex_transport_test.go: `b5f09955284faa3388c279401cff5ffe555cd74c4862dbfe47cc530a4603430a`
- relay/channel/api_request.go: `a9535072455b9d02d8e6c139825de3cf6aeccf6cc8d476f210bab615086c44f0`

## Findings and required follow-up

1. **Framing validation gap:** metadata uses Header.Get("Content-Length") and later strips every Content-Length. Thus a second conflicting value (or noncanonical casing in a manually built Header) can escape validation. Validate every case-insensitive occurrence and reject invalid/conflicting framing before UDS. Author acknowledged and is preparing a regression in the existing service test file. This report does not assume the fix passed.
2. **Outer retry evidence missing:** RelayClassification and RelaySelection prove errors.As preservation, SkipRetry and a single doRequest call. They do not exercise controller Relay with an available retry budget and listener counters. S04 explicitly requires the actual outer loop proof; add a regression at the existing controller boundary with enabled transport, before-send and uncertain-send faults, and assert one UDS invocation/no replacement channel or direct request. Keep received upstream status semantics separately identified.
3. **S04c required:** the actual Rust subprocess fixture is present but has not run. Local UDS Go fixtures prove adapter framing/lifecycle, not Rust interoperability, certificate enforcement, upstream cancellation or end-to-end early 413 behavior. Final gate requires actual Linux ARM64 execution after S03 passes. Default skipped Rust integration in ordinary Go tests is not acceptance evidence.

## Positive evidence

- Default-off API delegates to existing cached client; Auth delegates to the legacy 20-second helper. Enabled relay selects sidecar only for Codex; OpenAI/Claude isolation is exercised.
- Immutable startup snapshot uses sync.Once/atomic state, fatal startup error, exact health limits/profile/platform capabilities and secure UDS checks. Invalid configuration rejects before activation.
- Explicit channel proxy wins; environment proxy/NO_PROXY is snapshotted and resolved per target, including wss-to-https lookup. Base TLS insecurity is rejected, CA and integer conversion bounded, normalized existing HTTP policy reused.
- Local transport disables keepalive and compression; opaque POST upload lacks GetBody/idempotency hints. Both Go client redirect handling and typed errors prevent automatic replay. Safe classification discards url.Error target/query content while preserving errors.As.
- Completion trailer and transferred-length validation distinguish truncation from clean EOF; HEAD/304 representation length and 204 are explicit. Closing/canceling a stream closes the local connection; early response marks intentional upload interruption before closing its source.
- Metadata is regenerated after user overrides; hop/control headers stripped; ordinary repeated headers and binary-safe values preserved. Strict JSON codec rejects duplicate names, unknown fields and trailing documents.
- WS adapter capability rejection and bounded reconstruction are locally tested; business WS enabled path remains explicitly unsupported until S07. This is not WS end-to-end acceptance.

## Independently executed commands

Environment: `go version go1.26.0 darwin/arm64`. Working directory for all commands: `/tmp/new-api-codex-plan-pr`.

1. `go test -race ./service ./relay/channel -run '^TestCodexTransport(HTTP|Completion|Strict|Typed|Validation|Policy|Close|WebSocket|Startup|Protocol|Upload|Request|Unavailable|Caller|Early|Rejects|Relay)' -count=1 -timeout 180s` — exit 0; service 2.430s, relay/channel 3.005s. Real Rust test deliberately excluded.
2. `go test ./relay/channel/codex ./relay/channel/openai ./relay ./controller ./service ./model -timeout 180s` — exit 0; all six packages passed (0.807s, 0.816s, 0.833s, 4.838s, 3.085s, 5.228s respectively). This command does not configure real Rust or real database matrices; those gates remain separate.
3. `go build ./...` — exit 0.

## Provisional rubric

Scores reflect only evidence available now, not an inferred future result.

| Criterion | Weight | Score | Evidence/limitation |
|---|---:|---:|---|
| Disabled/non-Codex isolation | .25 | 4.5 | StartupAndDefaults and RelaySelection; actual enabled Rust path pending |
| errors.As/SkipRetry and send-stage counts | .30 | 3.0 | Safe wrapper/local count verified; actual outer retry-loop count missing |
| First event/body close/cancellation | .25 | 3.5 | Local barrier/close/early-response cases and race pass; S04c upstream propagation pending |
| Existing client/adaptor regression | .20 | 4.5 | C04 package command and build pass |

Weighted provisional score: **3.800/5** (threshold 4.5). Hard gates: local Go evidence PASS; framing follow-up OPEN; outer retry count OPEN; actual Rust S04c HOLD. No S04 acceptance claimed. Resume this same independent reviewer after fixes and Linux cross-process evidence are frozen.


## Final S04 review — supersedes preliminary HOLD

Final verdict: **PASS, 4.720/5**, for S04 only. Reviewed and independently reran the fixed implementation after root confirmed S03 release. No source implementation was edited by this reviewer.

Current source SHA256:

- service/codex_transport.go: `b8dd89a99d7a0fd251788c118ad60426d28c9ca47968c26cc3cdf3f46a0118ad`
- service/codex_transport_test.go: `9acd9b9e309fbfd52e518014ba1fcbc69e80fe76f2508ba95b71b0f74ceab978`
- relay/channel/api_request.go: `30eeae8e7421664d1cf0c67a263e6df6a42cf2f6fb526ed927fb90e57ef40831`
- controller/relay_cancel_test.go: `787f0ef6c484b9e566954c82434bd7809dcbf6409d61f5175d2facb8133c31c1`

All preliminary findings resolved:

1. Content-Length now checks every case-insensitive key/value against the effective framing; empty, signed, comma-joined, conflicting and overflow values fail before UDS. Identical decimal values remain compatible. Existing service tests cover these cases.
2. The controller test now enters through TokenAuth, Distribute and real Relay/provider handling with retry budget 3. Ordinary upstream 503 produces 4 UDS attempts, demonstrating that retries are actually available. Pre-send, uncertain-send, IPC disconnect, compact body truncation, native Responses SSE truncation and collected SSE truncation each produce 1 attempt. It asserts no manufactured completion event or DONE marker.
3. The new test exposed a real compact-body retry bug; reviewed Codex-only response ReadCloser wrapper converts typed transport errors to safe NewAPIError+SkipRetry before provider conversion. NewOpenAIError preserves existing NewAPIError through errors.As. Ordinary/non-Codex streams are unaffected. Independent race execution verifies the actual fix, not merely classification helpers.
4. Real Linux S04c independently rerun below, no bypass and no Skip.

Independent final commands from actual-main worktree:

- `go test -race ./service ./relay/channel ./controller -run CodexTransport -count=1 -timeout=150s` — exit 0; service 2.236s, channel 2.817s, controller 3.165s. The optional actual-Rust case remains skipped only in this Darwin-host command; separate Linux execution is the acceptance evidence.
- `go test ./relay/channel/codex ./relay/channel/openai ./relay ./controller ./service ./model -timeout 180s` — exit 0, all six packages passed (model cached; other packages executed).
- `go build ./...` — exit 0.

Independent isolated cross-process commands (each returned exit 0):

```sh
docker run --detach --name codex-judge-go-transport --network none docker.m.daocloud.io/library/rust@sha256:c1e5f19e773b7878c3f7a805dd00a495e747acbdc76fb2337a4ebf0418896b33 sleep infinity
docker cp /tmp/codex-service-linux-arm64.test codex-judge-go-transport:/tmp/service.test
docker cp /tmp/codex-transport-s03-linux-arm64 codex-judge-go-transport:/tmp/codex-transport
docker exec --env CODEX_TRANSPORT_TEST_BINARY=/tmp/codex-transport codex-judge-go-transport /tmp/service.test -test.run '^TestCodexTransportRustProcess$' -test.v -test.timeout 120s
docker exec codex-judge-go-transport sha256sum /tmp/service.test /tmp/codex-transport
docker rm --force codex-judge-go-transport
```

Verified service binary SHA256 `2f97c4761806821374af2e2e14416a455ddf042575e24f3dbe321489a2e8e765`; frozen Rust `a6cb5ba9c171f69d7b4bdfa12d826893d83178850c0df79b6e95e09ffddc0a36`. No host directory/credential mounts. The container was removed.

All 13 actual Rust subtests executed and passed in 0.06s: status_headers_body_no_retry, body_above_old_poc_limit, incremental_response, incremental_upload, redirect_is_one_attempt, truncation_is_not_eof, early_413_closes_blocked_upload, cancel_reaches_upstream, auto_negotiates_http2, concurrent_identity_isolation, configured_limit_before_dial, certificate_name_verified, capability_failure_no_upstream. These prove physical Rust interoperability, first-prefix barriers, safe certificate failure and exact per-case upstream counts; they are not an inference from local fixtures.

| Final criterion | Weight | Score | Basis |
|---|---:|---:|---|
| Disabled/non-Codex isolation | .25 | 4.75 | Existing-client identity/default Auth semantics, real relay selection isolation, startup/capability zero-send assertions |
| errors.As/SkipRetry and send-stage counts | .30 | 4.80 | Actual outer retry budget with active control, safe typed read-error preservation, separate actual Rust no-replay counts |
| First event/body close/cancellation | .25 | 4.70 | Actual bidirectional prefix barriers, early 413 blocked source closure, upstream cancellation, trailer truncation, focused race |
| Existing client/adaptor regression | .20 | 4.60 | Current C04 related packages/build plus narrow Codex-only wrapper; other phases explicitly excluded |

Weighted sum: .25×4.75 + .30×4.80 + .25×4.70 + .20×4.60 = **4.720**. S04 required C03/C04 and isolation/retry/streaming/metadata/error hard gates PASS for this reviewer. Two other independent S04 reviewers are still needed for the panel; this report does not average or substitute their scores.

Remaining phase boundaries: native-stream scanner failure keeps the existing StreamStatus/usage accounting behavior; S08 must prove its bill/refund/log outcomes on all real database engines. S05 authentication, S06/S07 WS, S09 official fingerprint/live traffic and S10 application deployment remain separate hard gates. The actual Rust binary here is the frozen S03 HTTP artifact, not evidence for newer WS code. No final feature completeness or release approval is claimed.
