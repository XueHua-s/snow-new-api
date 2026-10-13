# S05 independent management and frontend compatibility panel

Verdict: **PASS, 4.66/5**, 2026-10-14. Reviewer `/root/judge_management_compatibility`, actual implementation `/tmp/new-api-codex-plan-pr`. No implementation edits and no real credentials or live upstream requests. This concludes this S05 panel only; S07–S10 remain separate gates.

## Rubric

| Criterion | Weight | Score | Independent evidence |
|---|---:|---:|---|
| OAuth identity/session binding and atomic consumption | .30 | 4.65 | Read generic/channel OAuth branches, AuthFlow matching and consume-before-exchange, locked credential binding; independently reran the SQLite route matrix with race instrumentation. |
| Server step-up / PAT bypass resistance | .25 | 4.65 | Server credential mutation guards, proof allowlist and session binding; UI proof propagation and cancellation verified with real hook/API builders and component interaction tests. |
| Management exits and Claude/GitHub isolation | .25 | 4.75 | Both WHAM entries, GET credits, consume stable ID, fixed model version, snapshot mutation barriers, legacy helper separation and saved-channel lookup traced independently. |
| Auth profile / redirects / safe errors and logs | .20 | 4.60 | Disabled Auth insecure rejection, fixed endpoint, five redirect statuses, missing completion trailer and typed sanitized errors tested; audit synthetic-secret assertions execute in SQLite matrix. |

Weighted result: .30×4.65 + .25×4.65 + .25×4.75 + .20×4.60 = **4.665** (reported conservatively as 4.66). Every rubric exceeds 4.5. No unresolved S05 blocking finding.

## Entry-by-entry findings

- `fetchCodexChannelWhamData` reads the saved channel with its key and selects the Codex API client with channel proxy/settings. GET usage, GET reset credits and POST consume use the same controlled path. `fetchCodexChannelUsage` is an independent aggregate entry and also selects the API client. The controller fixture actually calls both entries rather than assuming one covers the other.
- `ResetCodexChannelUsage` creates its UUID before the closure. A received 401/403 may cause one business refresh, retaining the same redeem_request_id; unknown transport failure does not enter that branch. The independent rerun observes the two consume attempts sharing an ID and the ambiguous-failure path making one request with no Auth call.
- `FetchCodexChannelModels` pins 0.162.1 for both query and User-Agent. Synthetic custom base URL is asserted in the management fixture. `FetchUpstreamModels` loads the saved channel/key; creation preview carries the explicit key and is protected by SensitiveWrite. The drawer selects saved-channel fetching for existing Codex, not the Advanced Custom preview path. Unsaved Id=0 discovery cannot refresh/persist a credential after 401. These controller/UI selection conclusions are source inspection, not claimed extra end-to-end tests.
- Both WHAM paths and models pass their original ExpectedChannel into refresh. Before Auth, exact key/type/status/base URL/settings must match; after Auth the row-locked Go comparison prevents an intervening replacement (including case-only key changes) from being overwritten. The independently rerun deterministic barriers cover WHAM/consume/aggregate/models × key/URL/proxy: only the first request, zero Auth and zero retry. The latest successful-CAS notification is after the transaction; it does not change the authentication transaction. WS invalidation correctness belongs to S07.
- Codex exchange/refresh alone select Auth. The shared legacy helper remains a copy of the ordinary proxy client with its prior timeout, and Claude still calls that helper. Model discovery no longer invokes GitHub latest-version lookup; the retained GitHub helper receives an ordinary supplied client and has no Codex selector added. Non-Codex provider dispatch is unchanged by S05.
- Default-off is not an exact historical security rollback: Codex Auth now refuses global/effective insecure TLS and unknown transports, and disables redirects. This intentional security correction is explicitly documented in the author report and must remain disclosed in the PR. The legacy Claude helper is unchanged.
- OAuth generic/new-channel flow still requires an authenticated session and stores opaque server-side AuthFlow with provider/channel/state/user/session/time binding. Existing-channel start and complete, manual refresh, key/type/key_mode changes and multi-key deletion enforce the write proof on the server. Add creates a row and Copy clears Id; neither becomes an overwrite route. Existing enable/disable actions remain outside the newly scoped credential replacement proof policy.

## Frontend inspection

Read project and web AGENTS, shadcn-ui (including vendored workflow), i18n-translate and React guidance; actual paths are web/src rather than older skill examples web/default. Reviewed components.json and existing SecureVerificationDialog, useSecureVerification, OAuthCredentialDialog and ConfirmDialog composition. Changes reuse these business components; no new dialog system or global interceptor was introduced.

Existing-channel OAuth uses channel-specific start/complete with separate verification requests and direct saved-channel completion; no returned credential is required in the form. New-channel OAuth and Claude retain generic routes. Refresh, update and multi-key deletion pass proofs only in X-Security-Proof. Ordinary updates keep the existing request path and can respond to the existing server challenge. Form key_mode is emitted only with a nonempty multi-key change, which also triggers the proactive prompt.

The hook increments the attempt generation on cancel, replacement and unmount. A proof resolving after any of these cannot execute the prior mutation. Tests exercise these pending-promise boundaries, explicit expired-proof retry, non-Codex verification compatibility, callback preservation and distinct OAuth start/complete requests. Proof values are not stored in localStorage, URLs or a cross-action cache. Existing server SecurityProof is a short-lived reusable scoped proof, **not a one-time token**; AuthFlow is the atomically consumed object. UI actively requests a new proof per protected action but does not replace server enforcement.

A direct JSON comparison with HEAD independently found exactly six added keys in every en/zh/zh-TW/fr/ru/ja/vi locale: four S05 keys plus two earlier WS keys, with **zero changed or deleted existing keys**. Dynamic S05 keys are registered in static-keys.ts. No translation rewrite or unrelated UI styling was requested by this review.

## Actual independent commands

- `go test -race ./service ./controller -run 'TestCodexTransportDisabledAuth|TestCodexTransportManagement|TestCodexTransportOAuthRejects|TestCodexOAuthSecurityDatabaseMatrix' -count=1 -timeout=150s`: PASS, service 1.625s, controller 3.238s.
- From web: `bun run test src/features/channels/__tests__/codex-security-proof.test.tsx src/features/channels/components/__tests__/responses-websocket-setting.test.tsx src/features/auth/lib/__tests__/oauth-callback-mode.test.ts`: **3 files / 31 tests PASS**, duration 2.64s (10 S05 proof cases).
- From web: `bun run typecheck`: PASS, exit 0.
- `git diff --check`: PASS, exit 0.
- Python json comparison of each locale against `git show HEAD:<path>`: 6 additions and 0 changed/deleted existing values per language, as detailed above.

The Go management upstream is a synthetic UDS fixture, not Rust or live OAuth. The matrix independently run here uses real SQLite. The separate transaction reviewer independently ran all 81 cases on SQLite 3.50.4 / MySQL 8.0.46 / PostgreSQL 16.15 and recorded exact commands/digests in judge-auth-transactions.md; this panel inspected that evidence and did not rerun concurrent Docker matrices. Author lint/build evidence is not represented as independently rerun here.

Applicable reviewed security references: OWASP Authentication (sensitive action reauthentication), Session Management (identity lifecycle/cache/logging), OAuth2 (state/PKCE/transaction binding), CSRF (actual explicit-header authentication), and ASVS **5.0.0** V10/V12 controls mapped in codex-transport-security.md. This is not a whole-site ASVS compliance statement, proof of provider refresh-token rotation, or UDS/mTLS equivalence.

## Source fingerprints

- controller/codex_usage.go: edcf15472df18685fb7368573fc2b77ed79eab8ce1181dc93bf07de82cb17b8b
- service/codex_channel_models.go: 0a1ba42bac78dfd127d99a264d2054664b0417c719f1d264344d64c6f306d6e6
- service/codex_credential_refresh.go: ecbb0c45718826b69cce3559986ba99636758e8d80fa445536d072f22fd7f2e9
- service/codex_oauth.go: 0f692082fc325fc3f9a85e581b8ef6c3427e329325346d39a6e6e8377bf2c698
- controller/oauth_flow.go: bd60d7c1f4077533d01cbe93628612a9e9db78cf5abeead1a541f3d53022afa8
- web/src/features/auth/secure-verification/hooks/use-secure-verification.ts: 4fed43b3f3f0e659145c3f2e8004100136585ee51a89ed204f6ca463c6dd762a
- web/src/features/channels/components/dialogs/oauth-credential-dialog.tsx: a7aba3d1dc9ca05d17560049276f8ddf8ad885423fee2e3d85b3f0a18a4fb055
- web/src/features/channels/__tests__/codex-security-proof.test.tsx: 46826f36472b7fbb4c9dbbcc6e51e5f5bace849fed81e9eb55f65aea1e9bb7e3
