# S03 independent security panel review

Verdict: security review PASS, weighted score **4.69/5**. At the original scoring checkpoint, overall S03 remained **HOLD** for the cross-panel `no_retry_stale_pool_checkout` deterministic request-count gate and memory-bound documentation clarification. The update below records the subsequently resolved checkout gate; the resource panel remains pending. This report does not override those gates or approve WS. Reviewed frozen HTTP implementation on 2026-10-14. No real credentials were accessed.

## Rubric

| Criterion | Weight | Score | Evidence |
|---|---:|---:|---|
| Method/query/headers/status/body/SSE fidelity | .35 | 4.7 | Independently executed fidelity, compression, framing, head/204/304, path-normalization and incremental SSE tests |
| Incremental delivery/cancellation/resource boundaries | .25 | 4.5 | Barrier-driven SSE/upload, independent cancellation, truncated EOF, deadlines, header limits, 256 active and 128 policy admission tests; library buffer clarification remains cross-panel |
| Pool/proxy/certificate/identity isolation | .25 | 4.8 | Native verified trust; explicit-CA unknown CA, hostname and expiry failures; four proxy schemes and DNS mode; proxy rejection/no fallback; UDS real UID/GID access; identity and Cookie isolation |
| Locked Linux dependency/build | .15 | 4.8 | Independent locked Linux release build, feature tree and source hash parity |

Weighted sum: .35×4.7 + .25×4.5 + .25×4.8 + .15×4.8 = **4.69** (threshold 4.5). Own Linux build and tested security/boundary gates pass; the cross-panel stale checkout evidence is explicitly not supplied by my HTTP reuse-disconnect test.

## Executed verification

Container `codex-s03-build`: Linux aarch64, Rust 1.91.1, Debian glibc 2.36.

```sh
docker exec -e CODEX_TEST_UID_MATRIX=1 -w /tmp/codex-transport codex-s03-build sh -c 'ulimit -n 8192 && cargo test --locked --test transport -- --test-threads=1'
docker exec -w /tmp/codex-transport codex-s03-build cargo build --locked --release
docker exec -w /tmp/codex-transport codex-s03-build cargo tree --locked -e features -i rustls
docker exec -w /tmp/codex-transport codex-s03-build cargo tree --locked -e features -i native-tls
```

Observed **31 passed, 0 failed, 0 ignored**, 42.44 seconds; release build exit 0, 1m33s. A first independent run omitted the required nofile override: default 1024 produced 30 passes and active-exchange BrokenPipe failure. Rerunning under the 8192 shared test-fixture limit resolved it. This fixture hosts four socket endpoints per exchange in one process, so 8192 is a test-runner requirement, not an experimentally established sidecar production minimum. The sidecar uses roughly two file descriptors per exchange; the recommended production nofile 2048 remains to be verified in S10. The runner must retain its explicit fixture limit; the failed first run is not omitted from evidence.

Feature graph independently confirms reqwest 0.12.28, native-tls 0.2.14 vendored, rustls 0.23.45 std/tls12/aws_lc_rs/prefer-post-quantum, and both fixed HTTPS WS fork revisions. Both ring and aws-lc features are linked; Server explicitly installs aws-lc as provider. No new fingerprint equivalence claim is made.

Compared SHA256 for Cargo.toml/Cargo.lock, all five src files, transport.rs and both modified vendor files between host delivery tree and Linux test tree: all 10 matched. Cargo.lock SHA256: `379ec22a1555d36bb06891fb3b1c61f68762d692279fc7b50b64278214489697`.

## Findings closed

- Request header value decoder retained 16384 after contract cap became 8192; base64 length alone admitted 8193. Reported and corrected to decoded 8192. Independently executed 8191/8192/8193 boundary test passes.
- Added proxy failure evidence now passes: CONNECT 407, unreachable proxy, unknown HTTPS proxy certificate all fail before target connection; one proxy attempt where reachable; sanitized errors omit proxy password. Explicit-CA rustls unrelated trust root also rejects. Existing native unknown-CA, wrong hostname and expired certificate tests pass.
- Independent OS-level probe ran the actual binary as UID/GID41001: parent0700/socket0600 rejects another UID with either same or different GID; parent0750/socket0660 allows UID41002/GID41001 and denies UID41002/GID41002. SIGTERM removes socket in both modes. Final persistent UID matrix test independently passes as part of 31 cases.

## Source review

UDS validates absolute path, ancestor symlinks, parent owner/GID and mode, rejects unsafe/live endpoints, only cleans a stale owned socket on connection refused, and unlinks only its own inode. Same UID/root trust is documented. Metadata denies unknown fields, requires nullable fields, and rejects duplicate known fields. URL parser normalization, userinfo, fragments, insecure targets and wrong Auth endpoint reject before dial. API destinations remain trusted Go channel configuration, as contracted. Header injection and hop/local headers are handled explicitly. Errors are fixed fields; no raw reqwest errors, credentials or body logging is installed.

Pool keys exclude account/access token and contain origin/purpose/proxy/profile/timeouts/trust. Identity headers stay per request; no Cookie jar is enabled. Explicit proxy follows no_proxy(), so ambient proxy cannot override the Go decision. Native/rustls preserve certificate validation. Redirects and reqwest replay are disabled. Comparing vendored hyper-util with original 0.1.20 confirms the retry change is the default flag used by both send_request and connection_for loops; SOCKS change strips URI IPv6 brackets before IP parsing. DNS-mode assertions remain strict. Their implementation inspection is not a replacement for the pending stale-checkout deterministic test.

## Scope limits

No approval of S06 WebSocket runtime, Go integration, OAuth binding/security proof, database/billing, official protocol equivalence, live account, Docker deployment or PR readiness. HTTP health advertises only implemented HTTP route. Overall S03 promotion requires all independent panel reports and remaining named hard gates.

## Subsequent factual update

The HTTP reviewer independently passed `codex_stale_checkout_has_zero_redial_before_request_start`. I inspected the added vendor test and cfg(test)-only barrier hooks: it checks out a genuinely reused sender, closes the real peer before request submission, waits for the actual connection driver to observe EOF, and asserts the actual unstarted Retryable branch was hit. Default retry=false has only the warmup connector call/request; retry=true positive control yields two connector calls/requests. This closes the previously named checkout evidence gap according to the responsible HTTP reviewer; I did not rerun it or rerun the unchanged 31-case suite. Test hooks are excluded from production, so the security score remains **4.69**. The earlier HOLD remains recorded historically; overall S03 still awaits the resource panel and its memory-bound determination.
