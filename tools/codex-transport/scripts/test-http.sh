#!/usr/bin/env bash
set -euo pipefail
crate_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$crate_dir"
source scripts/build-openssl.sh
cargo fmt --check
cargo test --locked
# Dependency unit tests are NOT included by cargo test on the sidecar package.
# The vendor test lock pins hyper/h2/tokio to the same production versions.
retry_case='client::legacy::client::codex_no_retry_tests::codex_stale_checkout_has_zero_redial_before_request_start'
cargo test --manifest-path vendor/hyper-util/Cargo.toml --locked --features full --lib -- --list | grep -F -x "${retry_case}: test"
cargo test --manifest-path vendor/hyper-util/Cargo.toml --locked --features full --lib "$retry_case" -- --exact --nocapture

# The decompressor must enforce its limit before allocating from attacker input.
decompress_case='extensions::compression::deflate::test::codex_decompression_allocation_is_bounded_before_limit_rejection'
cargo test --manifest-path vendor/tungstenite/Cargo.toml --locked --features deflate --lib -- --list | grep -F -x "${decompress_case}: test"
cargo test --manifest-path vendor/tungstenite/Cargo.toml --locked --features deflate --lib "$decompress_case" -- --exact --nocapture
