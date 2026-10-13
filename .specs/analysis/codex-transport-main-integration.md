# Main Responses WebSocket prerequisite integration

2026-10-14. Delivery: `/tmp/new-api-codex-plan-pr`, branch `codex/codex-transport-plan-main`, baseline `517075d5658ad59372859407df9e27de8f914542`. The minimal prerequisite port is ready for independent review. This report does not claim Rust transport, live upstream, full S01–S12, or deployment acceptance. No commit or push performed by integration owner.

## Scope and adaptation

Ported selected changes from `9fe0457ee`, `75f3d246e`, `ae249f4ec`, `801456a06`: Responses WS sessions and close handling; shared request preparation/billing and channel selection; per-create authentication/rate limits; usage accumulation; channel capability toggle and seven translations. Excluded unrelated task-plugin, mjproxy and newer configuration framework changes. Added minimal request-path/WS constraints without task-plugin identity or origin-task machinery. Main affinity, token model-limit map-key semantics and HTTP channel priority behavior remain intact. DB WS capability filtering precedes priority ranking. Invalid token channel pins fail instead of falling back.

Main DTO input details are scalar and copied by value. Native Responses billing snapshots merge partial usage with retained cached-input details, remain detached from upstream objects, and preserve estimated completion; other native billing dialect snapshots remain unchanged. Tests cover partial updates both with and without incoming native snapshots and verify effective billed token counts.

UI composes existing Form/Switch in the main drawer, preserves sensitive-field locking, and supports channel types 1/57/58/59/60. Locale writes used the required script and sync. Unrelated sync reorder/additions and generated report changes were restored; all seven locales have exactly two added keys and no changed existing translations. No dependency changes were required by this port.

## Main baseline differences and open S08 risk

Main lacks the later `fixed(...)` billing-expression form; fixtures use `tier("request", 2000)` for quota 1000. Main charges wallet/token and logs for constant-expression calls with zero tokens, but leaves user/channel used-quota counters at zero because its existing `hasBillableUsage` branch excludes them. Tests explicitly preserve and expose that baseline behavior; this is an unresolved S08 accounting gap, not a passing invariant. Main also classifies HTTP-200 terminal failure into its existing success-rate bucket and retains existing interrupted-response health semantics. Tests were adapted to those baseline semantics; a newer health-classifier-only assertion was excluded. Failed/missing/zero usage, cancellation, multi-round accounting and rate-limit cases remain covered.

## Observed verification

- Before port: `go test ./relay ./controller ./middleware ./service` passed.
- Final after partial-snapshot fix: `go test ./... -timeout 120s` passed (`/tmp/codex-prereq-root-final.log`); `GOWORK=off go build ./...` in root passed.
- Prior to final snapshot-only fix: `go test ./relay ./controller ./service ./middleware ./model ./pkg/wsmanager -timeout 90s` and `go test -race ./relay ./controller ./pkg/wsmanager -run 'Responses|WebSocket|MultiKeyEnable' -timeout 120s` passed. The latest full suite includes the new service snapshot cases; race evidence predates this final service-only change.
- In relaykit: `GOWORK=off go build ./...`; `GOWORK=off go test ./dto ./relayconvert/internal/oai_responses` passed.
- Frontend: frozen Bun install, `bun run typecheck`, affected Vitest file (11 tests), targeted `bunx oxlint`, targeted `bunx oxfmt --check` (6 files), and `bun run build` passed. Repository-wide format wrapper fails on unrelated baseline files; touched files pass direct formatter verification.
- `git diff --check HEAD` passed; no conflict markers remain in prerequisite files.

## Real three-database verification

Command with engine-specific disposable main/log DSNs: `TEST_CHANNEL_SQL_DSN=<main> TEST_RESPONSES_SQL_DSN=<main> TEST_RESPONSES_LOG_SQL_DSN=<log> go test ./controller -run 'TestMultiKeyEnable|TestResponses' -count=1 -timeout 120s`.

- SQLite 3.50.4: controller fixtures/full suite passed; explicit version logged in `/tmp/codex-prereq-sqlite-version.log`.
- MySQL 8.0.46, image `docker.m.daocloud.io/library/mysql:8.0`, image ID `sha256:7dcddc01f13bab2f15cde676d44d01f61fc9f99fe7785e86196dfc07d358ae2b`: passed 41.100s (`/tmp/codex-prereq-mysql-final.log`).
- PostgreSQL 16.15 aarch64 Alpine, image `docker.m.daocloud.io/library/postgres:16-alpine`, image ID `sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea`: passed 72.020s (`/tmp/codex-prereq-postgres-final.log`).

Both external engines used independent `codex_main`/`codex_log` databases. Cases exercise per-call accounting/routing, native WS priority against a higher-priority WS-disabled channel, failures, multi-key exhaustion/restoration and preservation of manual disable. Repeated suites reran migrations. No schema/driver changes; no released-version migration-matrix claim. External DB suites preceded final service-only snapshot fix and do not carry BillingUsage snapshots; the final full suite verifies that branch separately. These Docker database fixtures are not the requested complete sidecar/application deployment smoke test. Disposable containers were removed with `docker rm -f new-api-codex-prereq-mysql new-api-codex-prereq-postgres` after verification.

## Security and handoff

Read OWASP Authentication and Session Management Cheat Sheets before changing shared per-create auth. Relevant controls: server-side authorization on each create, token revocation, session isolation, sensitive credential exclusion. This is not an ASVS compliance assertion. No supplied real credentials were used or recorded in files.

Production integration ownership is released: adapter owner may modify `common/json.go` (preserve RawMessage alias), `main.go` startup wiring, and `relay/channel/api_request.go` transport dispatch. Independent Judge should review the final changes, especially main-preserving assertions and the explicit S08 gap. Parent owns final staging, overall transport acceptance and PR to the fork's main.
