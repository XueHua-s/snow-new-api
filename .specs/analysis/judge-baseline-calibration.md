# Independent baseline/build calibration judge

2026-10-14. Reviewer: judge_baseline_calibration; independent from implementation. Scoped verdict: **PASS 4.68/5** for the S01/S03/S06 effective-library/build amendment. This does not pass S08, S09, S10, live-account verification, or final acceptance.

## Scope and source review

Read preserved source plan §5, task S01/S03/S06 rubrics, baseline amendment, baseline.json, official-features.json, build.rs, build-openssl.sh, test-http.sh, Dockerfile, CI, and deployment README. Compared Configure options and checksum against the recovered fixed-tag official install-musl-openssl.sh. Options match; GNU cc replaces the explicitly documented musl compiler. The source plan correctly requires rechecking libc and merged features; pinning openssl-src does not establish the effective release library. Correcting this distinction is necessary and consistent with that requirement.

Official static musl and sidecar GNU/glibc are now separately declared. The effective OpenSSL 3.6.4 override and locked but unused openssl-src 3.6.3 are distinguished. Derived official lock repair and non-identical features are disclosed. The original source plan remains historical intent, not silently rewritten evidence.

## Independently executed verification

- SHA256 of official executable: 071cbe8d821cf1b02b6d8ba6c8b7991b228fcb8519dcb68a37d31222bb8cabe5. Production executable: 5f146857df6f66acc75e04faf1ea152bdb1824f2e21a3f4b6e3f5375f1dd1f6d. Both match records.
- `file` confirms official static ARM64 and sidecar dynamic GNU loader; byte inspection confirms both contain `OpenSSL 3.6.4 25 Aug 2026`. Image inspect confirms arm64 and image sha256:4ab8c6f99c9160e035db1ae3ff415150b06b690681e03c09213e21659bd88c54.
- `docker exec codex-s03-build sha256sum /tmp/codex-transport-openssl-3.6.4/openssl-3.6.4.tar.gz`: 9bffaa1ad1e07b354c21bd3324ec02fa15579f45a7d0494b3e74bc449b7333ef, matching official and sidecar pins.
- Compiled build.rs independently with rustc to a temporary executable. Correct target/version/static/no-vendor environment exits 0. Old 30600030 version, disabled no-vendor, and disabled static each exit 101. These four controls verify the guard itself; author's actual Cargo negative-control evidence separately demonstrates metadata plumbing.
- `docker run --rm --network none --entrypoint sh codex-transport:openssl364 -c 'ldd /usr/local/bin/codex-transport; test -s /licenses/openssl-3.6.4-LICENSE.txt'`: exit 0; GNU runtime dependencies and no dynamic libssl/libcrypto, nonempty OpenSSL license.
- `CODEX_TRANSPORT_IMAGE=codex-transport:openssl364 bash tools/codex-transport/scripts/test-container.sh`: exit 0; actual image health, UID/socket permissions, configured nofile, no TCP publication, SIGTERM cleanup and restart PASS.
- `docker exec -e CODEX_TEST_UID_MATRIX=1 -w /tmp/codex-transport codex-s03-build bash -c 'ulimit -n 8192; exec bash scripts/test-http.sh'`: exit 0; independent 50 integration tests PASS, zero failed/ignored, 46.26s; real vendored stale-checkout no-redial and decompression-before-allocation regressions each PASS. Log: `/tmp/judge-baseline-calibration-rust.log`.
- Read root's completed `/tmp/codex-openssl364-go-rust.log`: actual production hash matches, 16 Rust-process subcases and controller retry-budget test PASS, no skips. This is inspected root evidence, not an independently repeated Go run.

## Scores and hard gates

| Criterion | Weight | Score | Basis |
| --- | --- | --- | --- |
| Provenance/platform clarity | .30 | 4.75 | Correct effective library and target distinctions; immutable source/checksum and explicit graph repair |
| Exact build reproducibility | .30 | 4.65 | Same upstream archive/config, pinned builder/lock, effective-library fail-closed controls |
| Transport/regression preservation | .25 | 4.70 | Independent 50+2 suite and inspected production-binary Go integration |
| Documentation/CI/runtime integrity | .15 | 4.55 | Shared build entry point, licenses, actual image lifecycle; remaining gates clearly scoped |

Weighted score: 1.425 + 1.395 + 1.175 + .6825 = **4.6775**, rounded **4.68**. No material gap in this amendment. Targeted hard gates PASS: exact source checksum, effective version/static selection, Linux target execution, meaningful HTTP/WS regressions and explicit provenance corrections.

## Limits retained

Reproducibility here means pinned source/config/toolchain and repeatable successful build, not byte-identical artifacts or official executable reproduction. Runtime apt CA package retrieval is not snapshot-pinned; local OpenSSL .complete cache assumes a trusted build directory (fresh image builds establish it from verified source). Neither invalidates the claimed TLS-source baseline, and neither should be promoted to a bit-reproducibility claim. GNU versus musl remains a deliberate platform difference requiring actual wire evidence. S09 final 15-scenario comparison was still pending during this review. S08 accounting, S09 live calls, full Go app Docker deployment, loaded resources and final S10 review remain separate required gates. No credential read or live request occurred in this review.
