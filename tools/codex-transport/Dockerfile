# syntax=docker/dockerfile:1
ARG RUST_IMAGE=rust:1.91.1-bookworm@sha256:c1e5f19e773b7878c3f7a805dd00a495e747acbdc76fb2337a4ebf0418896b33
ARG RUNTIME_IMAGE=debian:bookworm-slim@sha256:f06537653ac770703bc45b4b113475bd402f451e85223f0f2837acbf89ab020a
FROM ${RUST_IMAGE} AS build
ARG TARGETARCH
RUN test "$TARGETARCH" = arm64 && test "$(uname -m)" = aarch64
WORKDIR /build/tools/codex-transport
COPY tools/codex-transport/ ./
RUN bash -ec 'source scripts/build-openssl.sh; cargo build --locked --release --target aarch64-unknown-linux-gnu'
RUN mkdir /vendor-licenses && find vendor -type f \( -name 'LICENSE*' -o -name 'COPYING*' -o -name 'NOTICE*' \) -exec cp --parents {} /vendor-licenses/ \;

FROM ${RUNTIME_IMAGE}
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /build/tools/codex-transport/target/aarch64-unknown-linux-gnu/release/codex-transport /usr/local/bin/codex-transport
COPY LICENSE NOTICE THIRD-PARTY-LICENSES.md /licenses/
COPY --from=build /vendor-licenses/ /licenses/
COPY --from=build /tmp/codex-transport-openssl-3.6.4/prefix/LICENSE.txt /licenses/openssl-3.6.4-LICENSE.txt
USER 10001:10001
ENV CODEX_TRANSPORT_SOCKET=/run/codex-transport/transport.sock
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 CMD ["codex-transport", "health"]
ENTRYPOINT ["codex-transport"]
