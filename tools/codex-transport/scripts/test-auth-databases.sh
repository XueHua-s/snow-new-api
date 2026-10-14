#!/usr/bin/env bash
# Dedicated disposable real databases; never accepts a caller's database DSN.
set -euo pipefail
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$repo_dir"
scratch="$(mktemp -d)"
mysql_name="codex-auth-mysql-$$"
postgres_name="codex-auth-postgres-$$"
cleanup() {
 docker rm -f "$mysql_name" "$postgres_name" >/dev/null 2>&1 || true
 rm -rf "$scratch"
}
trap cleanup EXIT
mysql_image="${CODEX_AUTH_MYSQL_IMAGE:-mysql:8.0}"
postgres_image="${CODEX_AUTH_POSTGRES_IMAGE:-postgres:16-alpine}"
docker run -d --name "$mysql_name" -p 127.0.0.1::3306 -e MYSQL_ROOT_PASSWORD=synthetic-test-only -e MYSQL_DATABASE=codex_auth "$mysql_image" >/dev/null
docker run -d --name "$postgres_name" -p 127.0.0.1::5432 -e POSTGRES_PASSWORD=synthetic-test-only -e POSTGRES_DB=codex_auth "$postgres_image" >/dev/null
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
mysql_port="$(docker port "$mysql_name" 3306/tcp | cut -d: -f2)"
postgres_port="$(docker port "$postgres_name" 5432/tcp | cut -d: -f2)"
for dialect in sqlite mysql postgres; do
 case "$dialect" in
 sqlite) dsn='' ;;
 mysql) dsn="root:synthetic-test-only@tcp(127.0.0.1:$mysql_port)/codex_auth?charset=utf8mb4&parseTime=True&loc=Local" ;;
 postgres) dsn="postgres://postgres:synthetic-test-only@127.0.0.1:$postgres_port/codex_auth?sslmode=disable" ;;
 esac
 TEST_CODEX_AUTH_SQL_DSN="$dsn" GOWORK=off go test ./controller -run '^TestCodexOAuthSecurityDatabaseMatrix$' -v -count=1 -timeout=120s | tee "$scratch/$dialect.log"
 if grep -E -- '--- SKIP:|\[no tests to run\]' "$scratch/$dialect.log"; then echo 'Auth acceptance cannot skip' >&2; exit 1; fi
 grep -E '^--- PASS: TestCodexOAuthSecurityDatabaseMatrix ' "$scratch/$dialect.log"
done
docker image inspect "$mysql_image" "$postgres_image" --format '{{json .RepoDigests}}'
