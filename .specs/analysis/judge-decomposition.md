# Judge 4 — Codex transport decomposition

Date: 2026-10-14. Independent review of `.specs/tasks/draft/codex-transport.feature.md`, source `CODEX_TRANSPORT_IMPLEMENTATION_PLAN.md` §§1–10, `codex-transport.md` Phase 2b, validation log, project rules and full billing rules. Method: `skills/plan-task/SKILL.md` Independent judge method / Judge 4. Threshold 3.5/5. This reviews planning readiness, not implementation completion.

| Criterion | Weight | Score | Evidence |
|---|---:|---:|---|
| Step quality | .30 | 4.6 | Implementation Process has 10 ordered M/L steps and 30 a/b/c slices with explicit outputs. S02 freezes contracts before independent S03/S04 implementations; S06 depends on shared Rust skeleton; S07 waits for both Go and Rust transport; S08 waits for management and WS integration. Large items are split into reviewable slices. S09c separately waits for billing, allowing synthetic protocol work earlier. |
| Success criteria testability | .25 | 4.7 | AC01–15 and C01–C08 specify production functions/files, exact test/build commands, future runner interfaces, request counts, streaming barriers, limit boundaries, error stages, balance/reservation/log assertions and missing-DSN failure behavior. New scripts/tests are explicitly future deliverables. S02 intentionally owns numeric limits and final wire fields, with a prohibition on coding either side before they are frozen. |
| Risk coverage | .25 | 4.6 | Each step includes blockers and mitigation: missing POC/reproducible fork, failed dependency features, three retry layers, double redirects, Claude helper isolation, WHAM consume IDs, active/idle WS invalidation, real database prerequisites, missing live credentials, baseline/platform and release boundaries. Security hard gate requires binding/single-consumption regression and independent review before S05/S07 completion. |
| Completeness | .20 | 4.7 | Source §§1–10 tracking covers all named original scope, including auxiliary requests, historical evidence limits, nonshared identity state, exact TLS dependency baseline, H2/WS comparison, cleanup, build and rollback. Setup → Foundational → User stories → Verification → Polish structure, summary table and DoD are present. Conditional relaykit/tokenkit, schema/driver migration and frontend rules are explicit. |

Weighted total: **4.645/5.000** = .30×4.6 + .25×4.7 + .25×4.6 + .20×4.7. **PASS** against 3.5.

## Observations and remaining gates

No material omission in the decomposition was found that blocks this phase. This verdict does not authorize skipping later parallelization/verification judges or any implementation acceptance evidence.

1. Architecture's configuration row says generation changes on configuration updates and mentions atomic update publication, whereas the later S02/S04/S07 hard gate correctly limits global configuration to immutable startup snapshots and restart. Align the earlier wording with that explicit hard gate to avoid accidental implementation of an unrequested hot-reload subsystem.
2. At review time `.specs/analysis/codex-transport-security.md` did not yet exist. The draft explicitly assigns its controls and regression gate to S05; this is tracked work, not a claimed passed security audit. Preserve that distinction and complete the report before S05/S07, including the newly identified flow-token binding/single-use gap. No ASVS compliance finding is independently certified by this decomposition review.
3. S05a now includes the security repair in the later hard-gate prose. Incorporating its exact controller/model/test output into the S05 row and expected-files list would improve execution handoff; the requirement itself is present and is not missing.

No Rust production implementation, sidecar contract tests, live account calls, three-engine transport billing, or protocol captures have been passed by this review. Future commands and historical evidence are correctly separated in the artifact.
