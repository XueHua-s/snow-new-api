#!/usr/bin/env bash
# Disposable real main/log pairs. Synthetic fixtures only; no production DSNs.
set -euo pipefail
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$repo_dir"
rust_binary="${CODEX_TRANSPORT_TEST_BINARY:?absolute Linux ARM64 Rust executable required}"
scratch="$(mktemp -d)"
network="codex-billing-$$"
mysql_name="$network-mysql"
postgres_name="$network-postgres"
runner="$network-runner"
cleanup() {
 docker rm -f "$runner" "$mysql_name" "$postgres_name" >/dev/null 2>&1 || true
 docker network rm "$network" >/dev/null 2>&1 || true
 rm -rf "$scratch"
}
trap cleanup EXIT
mysql_image="${CODEX_AUTH_MYSQL_IMAGE:-mysql:8.0}"
postgres_image="${CODEX_AUTH_POSTGRES_IMAGE:-postgres:16-alpine}"
runner_image="${CODEX_TRANSPORT_TEST_IMAGE:-docker.m.daocloud.io/library/rust@sha256:c1e5f19e773b7878c3f7a805dd00a495e747acbdc76fb2337a4ebf0418896b33}"
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 GOWORK=off go test -c -o "$scratch/controller.test" ./controller
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 GOWORK=off go test -c -o "$scratch/model.test" ./model
docker network create --internal "$network" >/dev/null
docker run -d --network "$network" --name "$mysql_name" -e MYSQL_ROOT_PASSWORD=synthetic-test-only -e MYSQL_DATABASE=codex_billing "$mysql_image" >/dev/null
docker run -d --network "$network" --name "$postgres_name" -e POSTGRES_PASSWORD=synthetic-test-only -e POSTGRES_DB=codex_billing "$postgres_image" >/dev/null
for name in "$mysql_name" "$postgres_name"; do
 ready=false
 for attempt in $(seq 1 90); do
  if [[ "$name" == "$mysql_name" ]]; then
   if docker exec "$name" mysqladmin ping -h 127.0.0.1 -uroot -psynthetic-test-only --silent >/dev/null 2>&1; then ready=true; break; fi
  elif docker exec "$name" pg_isready -U postgres >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
 done
 [[ "$ready" == true ]] || { echo "database readiness failed: $name" >&2; exit 1; }
done
docker exec "$mysql_name" mysql -uroot -psynthetic-test-only -e 'CREATE DATABASE codex_billing_log; SELECT VERSION();'
docker exec "$postgres_name" psql -U postgres -c 'CREATE DATABASE codex_billing_log'
docker exec "$postgres_name" psql -U postgres -c 'SELECT VERSION()'
export TEST_FIXED_MYSQL_DSN="root:synthetic-test-only@tcp($mysql_name:3306)/codex_billing?charset=utf8mb4&parseTime=True&loc=Local"
export TEST_FIXED_MYSQL_LOG_DSN="root:synthetic-test-only@tcp($mysql_name:3306)/codex_billing_log?charset=utf8mb4&parseTime=True&loc=Local"
export TEST_FIXED_POSTGRES_DSN="postgres://postgres:synthetic-test-only@$postgres_name:5432/codex_billing?sslmode=disable"
export TEST_FIXED_POSTGRES_LOG_DSN="postgres://postgres:synthetic-test-only@$postgres_name:5432/codex_billing_log?sslmode=disable"
docker run -d --network "$network" --name "$runner" --platform linux/arm64 "$runner_image" sleep infinity >/dev/null
docker cp "$scratch/controller.test" "$runner:/tmp/controller.test" >/dev/null
docker cp "$scratch/model.test" "$runner:/tmp/model.test" >/dev/null
docker cp "$rust_binary" "$runner:/tmp/codex-transport" >/dev/null
for dialect in sqlite mysql postgres; do
 case "$dialect" in
 sqlite) dsn=''; log_dsn='' ;;
 mysql) dsn="$TEST_FIXED_MYSQL_DSN"; log_dsn="$TEST_FIXED_MYSQL_LOG_DSN" ;;
 postgres) dsn="$TEST_FIXED_POSTGRES_DSN"; log_dsn="$TEST_FIXED_POSTGRES_LOG_DSN" ;;
 esac
 docker exec --env CODEX_TRANSPORT_TEST_BINARY=/tmp/codex-transport --env TEST_RESPONSES_SQL_DSN="$dsn" --env TEST_RESPONSES_LOG_SQL_DSN="$log_dsn" "$runner" /tmp/controller.test -test.run '^TestCodexTransportBillingDatabaseMatrix$' -test.v -test.timeout=180s | tee "$scratch/$dialect.log"
 if grep -E -- '--- SKIP:|\[no tests to run\]' "$scratch/$dialect.log"; then echo 'Billing acceptance cannot skip' >&2; exit 1; fi
 grep -E '^--- PASS: TestCodexTransportBillingDatabaseMatrix ' "$scratch/$dialect.log"
 # Re-run the independent S05 authentication transaction matrix on each engine.
 docker exec --env TEST_CODEX_AUTH_SQL_DSN="$dsn" "$runner" /tmp/controller.test -test.run '^TestCodexOAuthSecurityDatabaseMatrix$' -test.v -test.timeout=120s | tee "$scratch/auth-$dialect.log"
 if grep -E -- '--- SKIP:|\[no tests to run\]' "$scratch/auth-$dialect.log"; then echo 'Auth acceptance cannot skip' >&2; exit 1; fi
 grep -E '^--- PASS: TestCodexOAuthSecurityDatabaseMatrix ' "$scratch/auth-$dialect.log"
 docker exec --env TEST_BATCH_SQL_DSN="$dsn" "$runner" /tmp/model.test -test.run '^TestBatchShutdown' -test.v -test.timeout=120s | tee "$scratch/batch-$dialect.log"
 if grep -E -- '--- SKIP:|\[no tests to run\]' "$scratch/batch-$dialect.log"; then echo 'Batch shutdown acceptance cannot skip' >&2; exit 1; fi
 grep -E '^--- PASS: TestBatchShutdownWaitsForPriorFlushAndIncludesLaterSettlement ' "$scratch/batch-$dialect.log"
 grep -E '^--- PASS: TestBatchShutdownFailureDoesNotReplayAndAllowsLaterUpdates ' "$scratch/batch-$dialect.log"
done
docker image inspect "$mysql_image" "$postgres_image" "$runner_image" --format '{{.Id}} {{json .RepoDigests}}'
docker exec "$runner" sha256sum /tmp/codex-transport /tmp/controller.test /tmp/model.test
