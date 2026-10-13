# S05 independent database transaction panel

Verdict: **PASS, 4.70/5**, 2026-10-14. Independent reviewer `/root/judge_auth_transactions`; no production or test implementation edits. Reviewed actual-main implementation at `/tmp/new-api-codex-plan-pr`, including the successful-CAS post-commit WS notification frozen with the S07 owner. This is S05 acceptance only, not S07/S08/S09 acceptance or whole-application ASVS certification.

## Rubric

| Criterion | Weight | Score | Independent basis |
|---|---:|---:|---|
| OAuth identity/session binding and atomic consumption | .30 | 4.8 | AuthFlow matches purpose/provider/intent/user/session; payload validates channel/state/verifier/time. Consume commits before external exchange. Failed exchange remains consumed; concurrent completion produces exactly one exchange on all three engines. |
| Server step-up / PAT bypass resistance | .25 | 4.8 | Real AdminAuth and permission middleware reject cookie-only, PAT, missing/expired/wrong-scope proof, wrong method/user/session/versions, revoked session and insufficient permission. Key/type/key-mode/manual-refresh/multi-key deletion paths enforce proof. |
| Management exits and Claude/GitHub isolation | .25 | 4.6 | Reviewed both WHAM entries, consume operation ID, discovery, refresh ExpectedChannel and unchanged legacy helper; independently reran management fixtures including first-response snapshot mutation barriers. |
| Auth profile / redirects / safe errors and logs | .20 | 4.55 | Auth selection rejects insecure effective transport, uses fixed HTTPS token destination, no redirects; independently reran incomplete-response and safe-error tests. Actual DB audit records are checked for synthetic secrets. |

Weighted score = 4.70. All S05 hard gates within this panel's scope pass; no unresolved blocking finding. Scores leave room for broader deployment/live evidence deliberately reserved for later steps.

## Commands actually run

```sh
CODEX_AUTH_MYSQL_IMAGE=docker.m.daocloud.io/library/mysql:8.0 CODEX_AUTH_POSTGRES_IMAGE=docker.m.daocloud.io/library/postgres:16-alpine tools/codex-transport/scripts/test-auth-databases.sh
go test ./service ./controller -run 'TestCodexTransportDisabledAuth|TestCodexTransportManagement|TestCodexTransportOAuthRejects' -count=1 -timeout=150s
git diff --check
```

All exit 0. The runner invokes `TEST_CODEX_AUTH_SQL_DSN=... GOWORK=off go test ./controller -run '^TestCodexOAuthSecurityDatabaseMatrix$' -v -count=1 -timeout=120s`. It creates disposable Docker databases with loopback random ports, creates SQLite in a test temporary directory, supplies its own synthetic DSNs, rejects skips/zero matches and removes containers at exit. Reviewer verified no auth test containers remained. No user database or actual OAuth credentials were used.

| Engine | Observed version | Named subtests | Result |
|---|---|---:|---|
| SQLite | 3.50.4 | 27 | PASS, 0.08s parent test |
| MySQL | 8.0.46 | 27 | PASS, 0.32s parent test |
| PostgreSQL | 16.15 aarch64-unknown-linux-musl, Alpine GCC 15.2.0 | 27 | PASS, 0.30s parent test |

All **81** subtests passed, no SKIP. Version SQL is `SELECT sqlite_version()` / `SELECT VERSION()` executed against the actual fixture connection. MySQL digest `sha256:7dcddc01f13bab2f15cde676d44d01f61fc9f99fe7785e86196dfc07d358ae2b`; PostgreSQL digest `sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea`. Additional management suite: service 0.553s, controller 0.439s, PASS.

## Transaction and security conclusions

`completeOAuthFlow` validates the stored opaque flow, checks state and calls `ConsumeAuthFlow` with the full bound identity before `buildKey`. That helper completes its own `DB.Transaction`; no exchange callback is enclosed in the consumption transaction. `lockForUpdate` plus conditional `consumed_at IS NULL AND expires_at > now` update prevents duplicate success. SQLite fixture intentionally serializes its connection pool; MySQL/PostgreSQL exercise real row locking. Exchange failure followed by replay proves consumption is durable; simultaneous completions prove only one upstream exchange. Invalid bindings and expired/future flows produce zero exchanges.

`ReplaceChannelCredentialIfUnchanged` reads under the shared row lock and performs Go string comparisons of ID/type/status/key/base URL/settings before update. A SQL equality predicate on credential text would inherit MySQL collation; the actual implementation avoids that. Real-database cases cover case-only key replacement, target/proxy replacement and successful unchanged replacement. SQLite fails closed on any transaction error rather than overwriting a changed key. No schema, driver or AuthFlow model change was introduced; fresh/upgrade schema migration claims are therefore not made.

Refresh compares the initiating snapshot before Auth, then uses the same locked comparison after the exchange. Both WHAM paths and model discovery provide ExpectedChannel, preventing a later replacement credential from being refreshed and reused at an earlier destination. The independent management tests include 12 key/URL/proxy mutations after the initial request and before its 401: zero Auth calls and zero retries. S07's notification occurs after successful commit; it does not weaken comparison or transaction semantics.

Proof rejection is through server middleware/controller code, not UI-only checks. Tests replace only the external OAuth exchange and flow generation boundary; authentication/session database lookup, permission checks, proof verification, consumption and credential persistence remain real. The current matrix is not a claim of testing the real provider or the complete deployed application.

Applicable reviewed references: OWASP Authentication, Session Management, OAuth2 and CSRF Cheat Sheets; ASVS **5.0.0** 10.1.1/10.1.2, 10.2.1/10.2.2, 12.1.1/12.1.2 and 12.3.1/12.3.2 as linked in `codex-transport-security.md`. Server-side transaction binding, step-up identity and replay control are verified locally; AS refresh-token revocation/rotation and remote account behavior remain provider responsibilities. Local UDS is a trusted process boundary, not a claim of mTLS equivalence.

## Reviewed source fingerprints

- `model/channel.go`: db31336589f6bdaa6af8962d94df9ebf3b3593de5b7c8e81da15f408f1ffc601
- `model/auth_flow.go`: 49d4e8fcb86c8af571e00a1ed4b8b01cb8fea4a2f05aecc600322ec9b0e89363
- `controller/oauth_flow.go`: bd60d7c1f4077533d01cbe93628612a9e9db78cf5abeead1a541f3d53022afa8
- `controller/oauth_flow_test.go`: 6137a243cc61ef7b85d8f7f1fef2fd754afde32525db4605014d50efe5f7ab66
- `service/codex_credential_refresh.go`: ecbb0c45718826b69cce3559986ba99636758e8d80fa445536d072f22fd7f2e9
- `tools/codex-transport/scripts/test-auth-databases.sh`: bef60e840a06e3d7115a669dc64577f337a959270a16df750dc0a9b49247fb87
