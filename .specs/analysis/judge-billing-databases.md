# S08 independent database review

Current status: **S08 PASS, 4.7275**, following the final independent replay below. S10 application deployment acceptance is separate.

Historical initial status: **HOLD for final S08; database execution/isolation subgate conditionally accepted.** Reviewer is independent of the implementation and accounting reviewer. No production changes, live credentials, or live traffic were used. This review inspected evidence and executable fixtures and independently executed the missing-binary runner refusal; it did not claim to rerun the currently changing production database snapshot.

Read in full the governing source-tree `.agents/rules/billing.md` and target-main `pkg/billingexpr/expr.md`; reviewed S08 task/rubric, author report, complete `test-databases.sh`, complete `controller/codex_transport_billing_test.go`, shared database/setup/accounting fixtures, narrow settlement change, and database-related diff.

## Evidence and assessment

Independently inspected `/tmp/s08-matrix-final.log` and `/tmp/s08-judge-accounting-matrix.log`. Both contain successful billing and authentication matrices for all three engines, no FAIL or SKIP. Historical author counts are 105 billing and 81 authentication leaves; parent/child and grep-repeated summary lines are not additional tests.

- SQLite main/log: 3.50.4 / 3.50.4, distinct temporary physical files. MySQL: 8.0.46 / 8.0.46, separately created `codex_billing` and `codex_billing_log`. PostgreSQL: 16.15 / 16.15, likewise separate databases. Separate GORM handles alone would not establish physical isolation, but runner DSNs and SQLite fixture paths establish it.
- MySQL image digest `7dcddc01f13bab2f15cde676d44d01f61fc9f99fe7785e86196dfc07d358ae2b`; PostgreSQL `721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea`; ARM64 runner `c1e5f19e773b7878c3f7a805dd00a495e747acbdc76fb2337a4ebf0418896b33`.
- Historical Rust SHA256 `5f146857df6f66acc75e04faf1ea152bdb1824f2e21a3f4b6e3f5375f1dd1f6d`, controller test SHA256 `3ece30dda9282242552a14e1fca682510e0a5f1d82a9840960e9512c0bf3c442` agree in both runs. The current edited controller is a later snapshot.
- Runner creates unique disposable names/internal network, never imports production DSNs, supplies all four main/log DSNs, propagates failures using pipefail and rejects Skip/no-match. Authentication is independently run after billing per engine. Cleanup is registered for failures as well as success.
- Real TLS upstream events traverse actual Rust and original Go request/parser/settlement workers. No direct Usage injection substitutes for the tested path. Shared assertion reloads persisted wallet, token remainder, user/token/channel UsedQuota and user request count, and checks exact consume log count/charge in LOG_DB.
- Positive zero-token expression correction changes only the bookkeeping predicate: zero tokens with positive final charge now update aggregate counters consistently. Pricing computation, saturation conversion, reservation and refund formulas are unchanged.
- Rejection cases observe reservation before upstream rejection and require complete refund with zero logs/counters. Interruption/cancel expectations explicitly preserve existing estimated/fixed-charge semantics. Saturation checks exact MaxQuota accounting and admin-only audit marker/public stripping. Both HTTP and WS budget refusals assert no upstream contact.
- No S08 schema, GORM tag, migration or driver dependency change was found. Related channel binding transaction changes belong to S05/S07 evidence; this is not a migration/upgrade compatibility claim. This matrix does not prove atomic transactions spanning independent main and log databases, nor does it simulate database outages; neither capability is introduced by this narrow settlement predicate change.

## Required before final approval

1. Security reviewer reproduced an arbitrary older-generation terminal contaminating a later WS call. The historical two-generation matrix missed it. Current source now adds `arbitrary-older-generation-isolation`, but the production repair and expanded real-three-database matrix must be reviewed after freeze. No threshold score overrides this hard failure.
2. The separately reported S10 shutdown timeout/drain issue remains pending lifecycle repair and evidence. A successful ordinary wsmanager shutdown case is not proof that timeout paths wait for settlement workers.
3. Rerun the persistent matrix against final corrected production, record new test-binary hash and updated leaf counts, retain zero Skip requirement, and complete C05 and lifecycle/security re-review. Existing 105/81 counts must not be relabeled as coverage of new regressions.

Rubric at this checkpoint (out of 5): exact once/accounting **3.50** × .35; failure/cancel/missing/duplicate **3.75** × .25; real three DB/independent logs **4.80** × .25; saturation/audit **4.75** × .15 = **4.075**. Threshold 4.5 and lifecycle hard gates are not met. Database isolation/execution quality passes on the inspected historical snapshot, but overall S08 remains HOLD. No additional database-specific blocker found.

Independent execution: `env -u CODEX_TRANSPORT_TEST_BINARY bash tools/codex-transport/scripts/test-databases.sh` failed immediately at line 6 with `absolute Linux ARM64 Rust executable required`, as required. The wrapper asserted a nonzero status and passed. Evidence: `/tmp/s08-db-judge-runner-refusal.log`. This validates fail-closed missing executable input; it is not a replacement for the final expanded real-database matrix.


## Final frozen-source re-review and independent execution

This section supersedes the initial conditional decision; the HOLD history above remains intact. Independently executed:

```sh
CODEX_TRANSPORT_TEST_BINARY=/tmp/codex-transport-s06-linux-arm64 \
  bash tools/codex-transport/scripts/test-databases.sh
```

Observed exit **0**, log `/tmp/s08-judge-databases-final.log`: **117 billing leaves (39 per engine), 81 auth leaves (27 per engine), 6 batch cases (2 per engine)**, zero FAIL and zero SKIP. Repeated script grep summaries are excluded. Main/log SQLite 3.50.4, MySQL 8.0.46, PostgreSQL 16.15 and all three image digests match the prior recorded engines. This run compiled current source independently and reproduced the author's frozen executable hashes:

- Rust: `d5c1c7dd9b727f0180cfa068641100e1c929c06aaddeef99892315dda8a5f522`
- Controller: `1323bf4ef007b8f9bfccde2804f0bac7d34235e5753ca35038072bc12e0f57cc`
- Model: `82066a0ee0e1cb6ad8dd30c171f247bf68aa3d4fac76422c2a354aabb971484c`

This Rust binary is the recorded S06 integration artifact, not the differently built OpenSSL 3.6.4 production-image artifact from the first historical matrix. The current application-image transport/deployment checks remain S10 and are not inferred from this test-binary run.

Reviewed the corrected historical-ID tracking and current expanded fixture: arbitrary older IDs are rejected before and after current `response.created`; retained history is bounded by closing after settled calls, not by evicting IDs and allowing old generations back in. The expanded multi-generation real-sidecar cases now pass on every engine with exact persisted accounting. The former S08 older-generation hard failure is closed for this review.

Reviewed all new batch persistence paths in `model/utils.go` and the token/user/channel helpers. Helpers preserve the existing GORM arithmetic expressions and receive a context-bound DB handle; no new dialect SQL, schema, driver or migration change. The flush gate serializes snapshots, scheduler stop waits for an uncancelled in-flight SQL cycle, and final flush returns accumulated errors. Failed additive writes are neither replayed nor permanently latched against future new updates. Real-engine tests prove successful writes stay applied once, an errored snapshot is not replayed after database recovery, and new deltas remain processable. The failure test intentionally removes the disposable channels table, observes SQL failure, restores it, and asserts only new channel deltas persist. This is meaningful failure-path evidence, not an ambiguous-commit simulation.

The full-chain batch case starts with queued aggregates, flushes after the original handler settles, verifies exact wallet/token/user/channel/log equality, and repeats flush without double charge. The independent model cases also block an earlier update deterministically and verify subsequent settlement is included exactly once. Errors still require reconciliation: there is no cross-database transaction, durable queue, crash/SIGKILL guarantee or promise to recover uncertain remote commits. These limits are explicit and do not represent a newly introduced replay mechanism.

Inspected passing focused race evidence in `/tmp/s08-s10-current-focused-race.log` and `/tmp/s10-batch-no-replay-race.log`; root retains responsibility for final full C05 after all integration changes. Database/fixture lifecycle blockers from the initial report are resolved on this snapshot. Full process signal/deadline/deployment behavior belongs to S10 and is **not accepted by this report**.

Final rubric: once/exact accounts **4.70** × .35; failures/cancellation/missing/duplicate **4.70** × .25; real three databases and independent logs **4.80** × .25; saturation/admin audit **4.75** × .15 = **4.7275**. S08 database reviewer **PASS**; no outstanding database-specific findings.

## Final calibrated production-artifact gate — independently passed

The earlier 117-case author matrix and my first frozen-source replay used S06 artifact `d5c1…`; those runs establish only that artifact's behavior. They do **not** establish equivalent behavior for the calibrated OpenSSL 3.6.4 production executable. The prior PASS was insufficient for the final-artifact gate until this additional replay completed.

Independently executed the complete matrix again:

```sh
CODEX_TRANSPORT_TEST_BINARY=/tmp/codex-transport-openssl364-image-linux-arm64 \
  bash tools/codex-transport/scripts/test-databases.sh
```

Observed **exit 0**, evidence `/tmp/s08-judge-databases-production-final.log`. Exactly **117 billing leaves + 81 authentication leaves + 6 batch cases**, zero FAIL, zero SKIP. Batch PASS summaries are printed twice by the runner; they are six actual cases, not twelve. Three real engines and independent billing log databases retain the recorded versions/digests. Both pre-run local hashing and the runner's final in-container hashing confirm calibrated Rust SHA256 **`5f146857df6f66acc75e04faf1ea152bdb1824f2e21a3f4b6e3f5375f1dd1f6d`**. Current controller SHA256 **`1323bf4ef007b8f9bfccde2804f0bac7d34235e5753ca35038072bc12e0f57cc`** and model SHA256 **`82066a0ee0e1cb6ad8dd30c171f247bf68aa3d4fac76422c2a354aabb971484c`** match the frozen-source replay.

This directly closes the S08 final-artifact hard gate without inferring binary equivalence. Final S08 database reviewer decision remains **PASS, 4.7275** on the calibrated production executable. S10 full application-image deployment remains separately judged.
