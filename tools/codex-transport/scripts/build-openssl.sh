#!/usr/bin/env bash
# Match the fixed official release's TLS library, while retaining our GNU target.
# Source: openai/codex rust-v0.162.1 .github/scripts/install-musl-openssl.sh.
set -euo pipefail
[[ "$(uname -s)" = Linux && "$(uname -m)" = aarch64 ]]
openssl_version=3.6.4
openssl_sha256=9bffaa1ad1e07b354c21bd3324ec02fa15579f45a7d0494b3e74bc449b7333ef
openssl_root="${CODEX_OPENSSL_BUILD_ROOT:-/tmp/codex-transport-openssl-3.6.4}"
openssl_prefix="${openssl_root}/prefix"
mkdir -p "$openssl_root"
if [[ ! -f "$openssl_prefix/.complete" ]]; then
  archive="$openssl_root/openssl-$openssl_version.tar.gz"
  curl -fsSL "https://github.com/openssl/openssl/releases/download/openssl-$openssl_version/openssl-$openssl_version.tar.gz" -o "$archive"
  echo "$openssl_sha256  $archive" | sha256sum -c -
  tar -xzf "$archive" -C "$openssl_root"
  (
    cd "$openssl_root/openssl-$openssl_version"
    CC=cc perl ./Configure linux-aarch64 \
      "--prefix=$openssl_prefix" --openssldir=/usr/local/ssl --libdir=lib \
      no-shared no-module no-tests no-comp no-zlib no-zlib-dynamic \
      no-ssl3 no-md2 no-rc5 no-weak-ssl-ciphers no-camellia no-idea no-seed \
      no-engine no-async -DOPENSSL_NO_SECURE_MEMORY
    make -j"${OPENSSL_BUILD_JOBS:-$(nproc)}" build_libs
    make install_dev
  )
  cp "$openssl_root/openssl-$openssl_version/LICENSE.txt" "$openssl_prefix/LICENSE.txt"
  touch "$openssl_prefix/.complete"
fi
# Source this file before cargo; target-specific overrides cover native builds too.
export AARCH64_UNKNOWN_LINUX_GNU_OPENSSL_DIR="$openssl_prefix"
export AARCH64_UNKNOWN_LINUX_GNU_OPENSSL_NO_VENDOR=1
export AARCH64_UNKNOWN_LINUX_GNU_OPENSSL_STATIC=1
