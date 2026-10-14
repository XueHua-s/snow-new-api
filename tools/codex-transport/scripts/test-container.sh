#!/usr/bin/env bash
# Container lifecycle checks only; application/billing/live acceptance is separate.
set -euo pipefail
image="${CODEX_TRANSPORT_IMAGE:-codex-transport:local}"
name="codex-transport-check-$$"
volume="${name}-socket"
cleanup() {
  docker rm -f "$name" >/dev/null 2>&1 || true
  docker volume rm "$volume" >/dev/null 2>&1 || true
}
trap cleanup EXIT
docker volume create "$volume" >/dev/null
docker run --rm --platform linux/arm64 --network none --user 0:0 \
  --entrypoint /bin/sh -v "$volume:/run/codex-transport" "$image" \
  -ec 'chown 10001:10001 /run/codex-transport; chmod 0700 /run/codex-transport'
docker run -d --name "$name" --platform linux/arm64 --network none \
  --read-only --cap-drop ALL --security-opt no-new-privileges:true \
  --ulimit nofile=2048:2048 -v "$volume:/run/codex-transport" "$image" >/dev/null
wait_for_health() {
  for attempt in {1..30}; do
    if docker exec "$name" codex-transport health; then break; fi
    if [[ "$attempt" == 30 ]]; then exit 1; fi
    sleep 1
  done
}
wait_for_health
docker exec "$name" /bin/sh -ec '
  test "$(id -u):$(id -g)" = 10001:10001
  test "$(stat -c %a /run/codex-transport)" = 700
  test "$(stat -c %a /run/codex-transport/transport.sock)" = 600
  test "$(ulimit -n)" = 2048
  test -S /run/codex-transport/transport.sock
'
test "$(docker inspect -f '{{json .NetworkSettings.Ports}}' "$name")" = '{}'
docker stop --time 45 "$name" >/dev/null
test "$(docker inspect -f '{{.State.ExitCode}}' "$name")" = 0
docker run --rm --platform linux/arm64 --network none --entrypoint /bin/sh \
  -v "$volume:/run/codex-transport" "$image" \
  -ec 'test ! -e /run/codex-transport/transport.sock'
docker start "$name" >/dev/null
wait_for_health
printf '%s\n' 'PASS: ARM64 container health, UID/socket permissions, configured nofile, no published TCP, SIGTERM cleanup, restart'
