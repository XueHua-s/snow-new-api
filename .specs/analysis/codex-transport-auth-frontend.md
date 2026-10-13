# S05 Codex credential frontend integration

Author verification completed on 2026-10-14 in `/tmp/new-api-codex-plan-pr`. This is frontend evidence, not a claim that the backend authentication, database matrix, Docker deployment, or full S05 gate has passed.

## Behavior

- Existing-channel Codex OAuth now uses `/api/channel/:id/codex/oauth/start` and `complete`; each step requests a fresh `channel.codex.credentials.write` proof and passes it in `X-Security-Proof`. Completion saves directly to the channel and refreshes its query, without exposing the saved credential in the form.
- New-channel Codex OAuth retains the generic routes without a step-up prompt. Claude routes and Add/Copy semantics remain unchanged.
- Codex refresh and multi-key deletion use the existing security verification hook and dialog before the protected request. Enable/disable key status operations retain their original behavior.
- Channel updates pass the proof through the existing mutation hook. Editing an original/new Codex type with a nonempty key or changed type proactively prompts; ordinary updates keep the existing request path, with the existing server 403 proof challenge supported. The form emits `key_mode` only for multi-key changes with a nonempty key, so that case is covered by the proactive prompt.
- Proofs are not cached or placed in URLs, storage, or logs. Expired proofs leave the challenge available for an explicit new verification; no automatic mutation replay is added.
- Shared verification now invalidates pending attempts on cancellation, replacement, and unmount. An already-issued verification request can finish, but its returned proof cannot execute the cancelled callback. Drawer/dialog closure cancels pending verification.

## Reuse and security references

Read project AGENTS/web conventions, `shadcn-ui`, `i18n-translate`, `vercel-react-best-practices`, and the applicable OWASP Authentication (sensitive-action reauthentication), Session Management (credential storage and lifecycle), OAuth (state/PKCE/replay), and CSRF (scoped same-origin request headers) guidance in `/tmp/new-api-codex-guidance/`. The shared `OAuthCredentialDialog` gained an optional proof scope and reuses `SecureVerificationDialog`/`useSecureVerification`; no new dialog design, global interceptor, or dependency was introduced.

Server-side enforcement, proof validation/single use, OAuth session/user binding, PAT exclusion, and the ASVS 5.0.0 control mapping belong to the backend S05 evidence; UI behavior is not a substitute for those controls.

## Observed validation

From `web/`:

- `bun run typecheck`: PASS.
- `bun run test src/features/channels/__tests__/codex-security-proof.test.tsx src/features/channels/components/__tests__/responses-websocket-setting.test.tsx src/features/auth/lib/__tests__/oauth-callback-mode.test.ts`: 3 files, 31 tests PASS (10 new proof integration cases).
- The new tests exercise the real Axios request builders and real verification hook with an external Axios transport adapter. Cases cover exact channel routes/proof headers, ordinary Claude/new-Codex routes, cancel-before-submit, cancel-during-verification, unmount, replacement by a new challenge, non-Codex successful verification, expired proof with explicit retry, callback preservation after OAuth cancellation, and separate start/complete verification.
- Targeted `bunx oxlint -c .oxlintrc.json` on the 10 changed TypeScript/TSX files: PASS, no errors/warnings.
- Targeted `bunx oxfmt --check` with protected copyright headers temporarily excluded and restored byte-for-byte: PASS for all 10 files.
- `bun run build`: PASS, Rsbuild 2.1.6, 3.11 s; total emitted assets 57,536.7 kB / gzip 16,605.5 kB. Build output is ignored and not a deliverable source change.
- `bun run i18n:sync` ran before and after the translations. Its preexisting `zh-TW` missing count is 128; unrelated sync output was restored. A direct seven-locale JSON comparison confirmed exactly four added translated keys in each language and all existing values preserved. Existing protected escaped attribution spelling was preserved byte-for-byte. Dynamic keys are registered in `static-keys.ts`.
- `git diff --check`: PASS.

Changed source ownership is limited to the security proof scope/hook, channel API/mutation hook, Codex/shared OAuth dialog, channel drawer, multi-key dialog, one consolidated proof test, static translation keys, and four entries in each of seven locale files. Existing WebSocket prerequisite changes remain intact. No commit, push, or PR was performed by this worker.
