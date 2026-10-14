#!/usr/bin/env bash
# Build Go tests on the host, then run Go and Rust in the same Linux kernel.
# The container receives only executables and the public synthetic contract.
set -euo pipefail
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$repo_dir"
rust_binary="${CODEX_TRANSPORT_TEST_BINARY:?set an absolute path to the Linux ARM64 Rust executable}"
[[ "$rust_binary" = /* && -f "$rust_binary" && -x "$rust_binary" ]] || {
  echo 'CODEX_TRANSPORT_TEST_BINARY must be an existing executable absolute path' >&2
  exit 1
}
image="${CODEX_TRANSPORT_TEST_IMAGE:-rust:1.91.1-bookworm@sha256:c1e5f19e773b7878c3f7a805dd00a495e747acbdc76fb2337a4ebf0418896b33}"
scratch="$(mktemp -d)"
container="codex-go-rust-$$"
cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  rm -rf "$scratch"
}
trap cleanup EXIT
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 GOWORK=off go test -c -o "$scratch/service.test" ./service
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 GOWORK=off go test -c -o "$scratch/controller.test" ./controller
docker run -d --name "$container" --platform linux/arm64 --network none "$image" sleep infinity >/dev/null
docker exec "$container" /bin/sh -ec 'test "$(uname -m)" = aarch64; mkdir -p /test/controller /test/tools/codex-transport/fixtures'
docker cp "$rust_binary" "$container:/tmp/codex-transport" >/dev/null
docker cp "$scratch/service.test" "$container:/tmp/service.test" >/dev/null
docker cp "$scratch/controller.test" "$container:/tmp/controller.test" >/dev/null
docker cp tools/codex-transport/fixtures/contracts.json "$container:/test/tools/codex-transport/fixtures/contracts.json" >/dev/null
docker exec --env CODEX_TRANSPORT_TEST_BINARY=/tmp/codex-transport "$container" \
  /tmp/service.test -test.run '^TestCodexTransportRustProcess$' -test.v -test.timeout 120s | tee "$scratch/service.log"
docker exec --workdir /test/controller "$container" \
  /tmp/controller.test -test.run '^TestCodexTransportControllerRetryBudget$' -test.v -test.timeout 120s | tee "$scratch/controller.log"
# Successful zero-match/skip runs are not acceptance.
if grep -E -- '--- SKIP:|\[no tests to run\]' "$scratch/service.log" "$scratch/controller.log"; then
  echo 'Integration acceptance must not skip cases' >&2
  exit 1
fi
grep -E '^--- PASS: TestCodexTransportRustProcess ' "$scratch/service.log"
grep -E '^--- PASS: TestCodexTransportControllerRetryBudget ' "$scratch/controller.log"
docker exec "$container" sha256sum /tmp/codex-transport /tmp/service.test /tmp/controller.test
