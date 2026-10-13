# S04 independent panel: Go stream lifecycle

Date: 2026-10-14. Reviewer: judge_go_lifecycle, independent of implementation. Scope: S04a/b/c in `/tmp/new-api-codex-plan-pr`. Verdict: **PASS, 4.73/5**. This is one panel vote, not full feature acceptance.

## Rubric

| Criterion | Weight | Score | Evidence |
| --- | --- | --- | --- |
| Disabled switch / non-Codex isolation | .25 | 4.7 | `GetCodexHTTPClient` delegates disabled API to the original shared client and disabled Auth to its original 20-second client; `doRequest` selects only explicit Codex. Independent race rerun includes startup defaults and isolated-process OpenAI/Claude route assertions. |
| errors.As / SkipRetry / send counts | .30 | 4.8 | Typed errors survive url.Error and provider Body parsing through codexRelayResponseBody. Independent controller retry regression executes the outer budget: ordinary 503 has four attempts, six transport/truncation cases one each. Real Rust integration preserves 503 and records exactly one upstream request. |
| First event / Body closure / cancellation | .25 | 4.8 | Source audit plus independent real Linux 13-case run: upload and response barriers prove incremental delivery, early 413 terminates unfinished upload while preserving response, context cancellation reaches TLS upstream, truncated length returns typed failure instead of EOF. Host race suite separately proves response Close cancels local stream and invalid requests close sources. |
| Existing client / adaptor regression | .20 | 4.6 | Independent focused race across service/channel/controller; immutable startup policy and original provider routing preserved. Author full package results reviewed as supporting evidence, not represented as this reviewer's full-suite execution. |

Weighted score: .25×4.7 + .30×4.8 + .25×4.8 + .20×4.6 = **4.73**. No blocking S04 finding.

## Lifecycle audit

`codexRoundTripper.RoundTrip` installs `defer upload.Close()` before metadata validation and encoding. The wrapper's sync.Once closes the source on validation, transport, malformed response and normal response-header return. Once a genuine response arrives, atomic `interrupted` is set before source Close, translating only deliberate upload interruption to local EOF. This keeps an early final response readable instead of making net/http abort its connection. Cancellation is attached to the original request context; response Body.Close cancels and closes without draining. Clean and failing terminal reads also close.

`codexResponseBody.Read` requires exactly one completion trailer equal to `1`, checks transferred Content-Length, retains upstream status in typed failures, and uses zero transferred-byte expectation for HEAD/304 representation lengths. Missing/wrong completion, short/long data and bodyless violations cannot become clean EOF. Returned Body failures are wrapped before adaptor error conversion so SkipRetry survives. No new usage or settlement policy was reviewed or approved here.

The two-identity test blocks both requests at the actual upstream before releasing them; each Authorization/Cookie value is observed on its own response. This validates concurrent request isolation without depending on serial execution. TLS keys are synthetic and generated in memory. The explicit wrong-name case confirms verification remains enabled.

## Independent executions

Host, actual implementation tree:

```sh
go test -race ./service ./relay/channel ./controller -run CodexTransport -count=1 -timeout=150s
```

PASS: service 2.260s, channel 2.874s, controller 3.216s. The optional real-Rust test is unconfigured on Darwin and is not counted as Linux acceptance.

Separate Linux ARM64 container, no network or repository/home mounts:

```sh
docker run --detach --name codex-judge-lifecycle --network none docker.m.daocloud.io/library/rust@sha256:c1e5f19e773b7878c3f7a805dd00a495e747acbdc76fb2337a4ebf0418896b33 sleep infinity
docker cp /tmp/codex-service-linux-arm64.test codex-judge-lifecycle:/tmp/service.test
docker cp /tmp/codex-transport-s03-linux-arm64 codex-judge-lifecycle:/tmp/codex-transport
docker exec codex-judge-lifecycle sha256sum /tmp/service.test /tmp/codex-transport
docker exec --env CODEX_TRANSPORT_TEST_BINARY=/tmp/codex-transport codex-judge-lifecycle /tmp/service.test -test.run '^TestCodexTransportRustProcess$' -test.v -test.timeout 120s
docker exec codex-judge-lifecycle ps -eo pid,comm
docker rm --force codex-judge-lifecycle
```

Observed hashes: service `2f97c4761806821374af2e2e14416a455ddf042575e24f3dbe321489a2e8e765`; frozen S03 Rust `a6cb5ba9c171f69d7b4bdfa12d826893d83178850c0df79b6e95e09ffddc0a36`. All 13 subtests PASS, **no skips**, total 0.06s. These cover status/headers/body, larger upload, response/upload streaming, redirect, truncation, early 413, cancellation, H2 negotiation, identity isolation, size rejection, certificate name, and capability rejection. Process inspection after test showed only container sleep and inspection ps; removal succeeded. Newly edited WS Rust sources were deliberately not compiled or substituted for the frozen binary.

## S04 hard gates

- **C03 real Go→UDS→Rust→TLS:** PASS, independent execution above; no mocked RoundTripper substitution.
- **C04 business outer retry:** PASS, independently rerun via controller race test with real controller route and budget. Fault responder is synthetic UDS for deterministic stages; this result is distinct from actual Rust transport run.
- **AC01–06 applicable HTTP slice:** PASS, explicit route isolation, response preservation, incremental streams, no fallback/replay on transport error, redirect prohibition and bounded metadata verified. Future management and WS callers remain outside S04.
- **AC13 applicable synthetic isolation/regression:** PASS for this HTTP adapter scope; final deployment/live/accounting matrix is not completed by this vote.
- **Profile/capability mismatch generates no request:** PASS, local startup/health rejection and actual absent-WS capability case before upstream attempt.
- **Caller override cannot forge metadata:** PASS, channel override regression and real upstream reserved-header stripping; trusted metadata is constructed after override processing.
- **Internal errors/secrets not exposed:** PASS for S04 typed fixed-enum errors and synthetic secret sentinel; no real credential accessed. UDS startup and TLS verification negative cases remain fail-closed.
- **Request close / response close / cancel:** PASS as lifecycle audit and independent tests above; no unbounded response drain introduced.

Limitations: native stream truncation still follows the pre-existing stream-status and usage-accumulator behavior. S08 must independently verify settlement/refund/consume logs on real SQLite, MySQL and PostgreSQL. This report does not approve S05 OAuth session controls, S06/S07 WS implementation, S08 billing, S09 fingerprint/live calls, or S10 full application deployment. No production source changed by this reviewer.
