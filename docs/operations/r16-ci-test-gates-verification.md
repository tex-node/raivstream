# R16 — CI Test-Gate Verification Report

**Date:** 2026-10-11
**Prepared by:** automated implementation pass (no push/deploy/commit)
**Repo:** `tex-node/raivstream` · `C:\Raiv\raivstream` · branch `main` @ `9d8ca17`
**Purpose:** make both API test suites mandatory prerequisites for deployment, and prove the gate fails closed.

---

## 1. Baseline commit & working-tree condition

| Item | Value |
|---|---|
| Branch / HEAD | `main` / `9d8ca179d79c84de8712ba0740d1276861d98a56` |
| Upstream | tracks `origin/main`, **ahead 5**; staged: none |
| Toolchain | `packageManager: pnpm@8.15.0`; `engines: node >=20, pnpm >=8`; `lockfileVersion 6.0` |
| Workflow triggers (before & after) | `on: push: branches: [main]` **only** (no `workflow_dispatch`, no `pull_request`) |
| Pre-existing working-tree changes | R16 candidate files (`.claude/settings.local.json`, `SESSION.md`↔`session.md`, `packages/api/src/routers/story.ts`, `phase6d.integration.test.ts`, `packages/api/vitest.config.ts`, `packages/api/package.json`) + untracked R16 artifacts — **all preserved** |

The CI change touches **only** `.github/workflows/deploy.yml`.

---

## 2. Files changed

| File | Purpose |
|---|---|
| `.github/workflows/deploy.yml` | Added `test-unit` + `test-integration` jobs and made `deploy` depend on both. **95 insertions, 0 deletions** — the deploy job's existing lines are byte-unchanged. |

**Not changed (boundary preserved):** no R16 narration/music/export logic, no Phase 6D generation/idempotency/credit logic, no migrations, no credit-rate config, no UI/SMC files, and the `SESSION.md`/`session.md` case collision was **not** resolved.

---

## 3. CI design & dependency graph

```
push → main
  ├── test-unit          (runs-on ubuntu-latest, node 20, pnpm 8.15.0, frozen lockfile)
  │     └─ pnpm --filter @raivstream/api test
  ├── test-integration   (runs-on ubuntu-latest; services: postgres:17 on 5433:5432, trust)
  │     ├─ prisma generate
  │     ├─ prisma db push (disposable schema)
  │     ├─ apply 20261009110000 partial unique index (exact migration file)
  │     ├─ fail-closed preflight (DB reachable + index present)
  │     └─ pnpm --filter @raivstream/api test:integration  (+ skip-marker rejection)
  └── deploy             (needs: [test-unit, test-integration]) → existing SSH deploy, unchanged
```

- **Explicit dependency:** `deploy.needs: [test-unit, test-integration]`. A failed, cancelled, or skipped test job prevents `deploy` from starting (GitHub `needs` semantics; no `if: always()` on `deploy`).
- **No bypass surface:** the workflow has no `if:` conditions, no `continue-on-error`, no `always()`, no `workflow_dispatch`/`pull_request`, no matrix, and no alternate trigger. The only event is `push` to `main`, on which all three jobs participate.
- **Deployment semantics preserved:** the deploy job's `runs-on`, `timeout-minutes`, and the entire SSH/remote script are identical to before (0 deletions in the diff).

---

## 4. PostgreSQL setup (isolated, non-production)

- **Image:** `postgres:17` (disposable service container), mapped `5433:5432` to match the test's hardcoded URL.
- **Auth/DB:** `POSTGRES_HOST_AUTH_METHOD=trust`, `POSTGRES_USER=postgres`, `POSTGRES_DB=raivstream_phase6d_test` — **no production credentials, no production DB, no production bucket**.
- **Readiness:** `--health-cmd "pg_isready -U postgres -d raivstream_phase6d_test"` with 10s interval / 5s timeout / 10 retries.
- **Schema:** `prisma db push` (80-table disposable schema) + the exact Phase 6D index migration `packages/database/migrations/20261009110000_phase6d_music_cue_lock/migration.sql`.
- **Isolation/teardown:** the service container is created and destroyed per job run; it cannot reach any non-test resource.

---

## 5. Validation commands & results

| Check | Command | Result |
|---|---|---|
| YAML syntax | `python -c "yaml.safe_load(...deploy.yml)"` | **OK** — jobs `['test-unit','test-integration','deploy']`, `deploy.needs=['test-unit','test-integration']`, trigger `push:[main]` |
| Workflow semantics (25 assertions) | `python validate_workflow.py` | **ALL CHECKS PASS (exit 0)** — jobs/deps/scripts/service/fail-closed/no-bypass |
| Diff preserves deploy | `git diff --stat -- .github/workflows/deploy.yml` | **95 insertions, 0 deletions** |
| Unit suite (local) | `pnpm --filter @raivstream/api test` | **83 files, 1553 passed \| 5 skipped, EXIT 0** |
| Integration suite (local, real PG 17.11) | `pnpm --filter @raivstream/api test:integration` | **4/4 passed, EXIT 0**; skip marker **absent** |
| Fail-closed preflight (DB down) | `psql "$DATABASE_URL" -tAc "SELECT 1"` | **EXIT 2** (connection refused) → job fails before the test |
| Silent-skip rejection (DB down) | raw `test:integration` output | exit 0 **with** `Test database not reachable` marker → CI `grep` **fails the job** |

**Skip-marker string (from the test source):** `[phase6d integration] Test database not reachable - all tests will be skipped.` → the CI step greps `"Test database not reachable"`.

---

## 6. Failure/bypass checks — demonstrated vs. inspected

**Demonstrated locally (behavior executed):**
- `test-unit` and `test-integration` commands run and pass against real dependencies (unit: no DB; integration: real PostgreSQL 17.11).
- Fail-closed preflight: with the DB stopped, the preflight command exits non-zero.
- Skip-path rejection: with the DB stopped, the raw suite emits the skip marker and exits 0 — the CI `grep` turns that into a job failure.

**Only inspected (static/DAG — NOT executed in GitHub Actions):**
- That a **failed** `test-unit`/`test-integration` job blocks `deploy` (GitHub `needs` semantics).
- That a **cancelled** or **skipped** test job blocks `deploy` (no `if: always()`).
- That no alternate trigger bypasses the gate.

**Not claimed:** end-to-end GitHub Actions execution. No push/CI run was performed (not authorized), and Docker/`act` is unavailable locally. The gate's *commands* and *fail-closed logic* are locally demonstrated; the *DAG gating* is statically verified against GitHub Actions semantics.

---

## 7. Confirmation of boundary

- No production deployment, no production migration, no credit-rate seeding, no live Lyria/provider call, no Phase 6E.
- No commit, push, merge, or release. HEAD remains `9d8ca17`; nothing staged.
- Existing R16 working-tree changes and artifacts untouched; `SESSION.md`/`session.md` collision not resolved.
- No unrelated worktree modified.

## 8. Remaining limitations

1. **CI execution not performed** — the gate is validated statically + by local command behavior, not by a real Actions run.
2. **`postgres:17` service pull** happens at CI runtime (network); a runner/registry outage would fail the integration job closed (acceptable, but worth noting).
3. The integration job adds ~2–4 min to the deploy pipeline.
4. **Pre-existing R16 migration note:** the DB schema for CI is created with `prisma db push` (the repo's documented integration procedure), not `migrate deploy`, because the historical migration chain is not replayable into a blank DB — unchanged by this task.
5. The deploy workflow runs tests on every push to `main`; the deploy still proceeds only after both pass.

---

## 9. Hosted verification pass — 2026-10-11

### 9.1 Candidate & working-tree state
- Branch `main`, HEAD `9d8ca17` (tracks `origin/main` @ `a9cb10f`, **ahead 5**); nothing staged.
- Uncommitted: `.github/workflows/deploy.yml` (M), `.github/workflows/ci.yml` (new, non-deploying validation workflow), `docs/operations/r16-ci-test-gates-verification.md` (this file), `docs/operations/r16-video-audio-staging-rehearsal.md`, plus the pre-existing R16 candidate files.
- The candidate and the CI change are **unpushed** — the last hosted runs are 2026-10-09 (Phase 6C).

### 9.2 Hardened skip detection (`deploy.yml` + `ci.yml`)
The integration job now asserts, in order:
1. **Preflight** — `psql … SELECT 1` (fails if the DB is unreachable) **and** the index predicate matches `UNIQUE … "trackId" … MUSIC_TRACK` (fails if the index is missing or wrong).
2. **Skip-marker guard** — the suite log is rejected if it contains `Test database not reachable`.
3. **Deterministic counts** — the vitest JSON report must show `numTotalTests=4, numPassedTests=4, numFailedTests=0, numPendingTests=0, numTodoTests=0` (catches a config error that executes 0 tests, or any skip).

No assertion was removed and no failure was converted to a skip.

### 9.3 Local validation results (this pass)
| Check | Command | Result |
|---|---|---|
| Index-predicate preflight (healthy PG 17.11) | `psql` indexdef + `grep -qiE 'UNIQUE .*"trackId".*MUSIC_TRACK'` | **PASS** |
| Deterministic counts (healthy) | vitest `--reporter=json` → node assertion | **exit 0** — `total=4 passed=4 failed=0 pending=0 todo=0` |
| Integration suite (healthy) | `pnpm --filter @raivstream/api test:integration -- --reporter=default --reporter=json …` | **4/4, exit 0**; skip marker absent |
| Preflight (DB down) | `psql … SELECT 1` | **exit 2** → job fails closed |
| YAML + semantics (both workflows) | `python validate_workflows.py` (13 assertions) | **ALL PASS** |

### 9.4 Hosted CI run — NOT EXECUTED (unauthorized push)
No hosted run was performed. `deploy.yml` triggers **only** on push to `main` (which deploys production), and the new non-deploying `ci.yml` is **not yet on the remote**. Triggering either requires a commit + push (and, for `ci.yml`, a branch/PR or `workflow_dispatch`) — **not authorized**. No end-to-end hosted proof is claimed.
**Required action to obtain hosted evidence:** commit `deploy.yml` + `ci.yml` to a branch, push it, and open a PR to `main` (`ci.yml` then runs both gates with **no deploy**). This needs explicit authorization.

### 9.5 Failure / bypass checks — demonstrated vs inspected
- **Demonstrated locally:** DB-unreachable → preflight `exit 2`; wrong/missing index → preflight fail; DB-skip path → marker guard; 0-test/skip → counts assertion.
- **Only statically inspected (not executed in Actions):** that a failed/cancelled/skipped `test-unit`/`test-integration` job blocks `deploy` via `needs`, and that no alternate trigger bypasses the gate. `deploy.yml` has no `if`, `continue-on-error`, `always()`, `workflow_dispatch`, `pull_request`, or matrix.

### 9.6 Trigger & branch-protection findings
- `deploy.yml` trigger: **push to `main` only** — PRs are not gated by it.
- **`main` is NOT branch-protected** (`gh api repos/tex-node/raivstream/branches/main/protection` → HTTP 404): no required status checks, PRs can merge without tests, and direct pushes to `main` are allowed.
- The deployment workflow has **no** alternate trigger path.
- **Gap:** the gates protect *deployment* (post-merge) but not *merge*. **Smallest recommended follow-up (repository settings change — needs authorization):** enable branch protection on `main` with required status checks `test-unit` and `test-integration` (from `ci.yml`), keeping `ci.yml` as the non-deploying PR gate. Optional: extract the shared test jobs into a reusable workflow to remove duplication.

### 9.7 Files changed this pass
- `.github/workflows/ci.yml` (new) — non-deploying validation workflow (`pull_request` + `workflow_dispatch`).
- `.github/workflows/deploy.yml` (M) — integration step hardened (predicate preflight + deterministic counts).
- `docs/operations/r16-ci-test-gates-verification.md` (this section).

### 9.8 Remaining blockers / required human actions
1. **Authorize a branch push + PR** (or enable branch protection) to obtain hosted CI evidence.
2. **Enable branch protection** on `main` with required checks (settings change).
3. Consider a **reusable workflow** to de-duplicate the two test jobs across `ci.yml` and `deploy.yml`.

---

## 10. Pre-authorization gaps closed — 2026-10-11

**Gap 1 — `ci.yml` isolation: VERIFIED.** `.github/workflows/ci.yml` triggers on `pull_request` + `workflow_dispatch` only; it has **no** deploy job, **no** `secrets` reference, and no `ssh`/`pm2`/`migrate deploy`/production URL. It cannot deploy. (Isolation+parity check: ALL PASS.)

**Gap 2 — merge is not gated (branch protection absent): CONFIRMED — settings change required.** `main` has no classic branch protection (`gh api repos/tex-node/raivstream/branches/main/protection` → HTTP 404) and **no rulesets** (`…/rulesets` → `[]`). PRs can merge without any required check. Deployment is gated post-merge (`deploy.yml` `needs` both test jobs), but **merging is not gated**. Recommended control (repository settings — needs authorization, not code):
- Enable branch protection on `main` with **required status checks** `test-unit` and `test-integration` (from `ci.yml`), require branches up to date, and require PRs (disallow direct pushes); or an equivalent repository **ruleset**.

**Gap 3 — duplicated test logic: PARITY VERIFIED; refactor recommended.** The `test-unit` and `test-integration` job blocks are **byte-identical** across `ci.yml` and `deploy.yml` (parity check: PASS), so initial hosted verification is safe. Recommended follow-up (not done): extract the shared jobs into a **reusable workflow** (`on: workflow_call`) called by both files. This would change `deploy.needs` from `[test-unit, test-integration]` to the single calling job (`[tests]`) — still transitively enforced, but it alters the prior literal acceptance evidence, so it is deferred pending sign-off.

### 10.1 Prepared branch + PR (NOT executed)
- Branch `ci/r16-test-gates` from `9d8ca17`, containing the CI change + the R16 candidate (test-infra + the app code the suites import). PR → `main` as a **draft**, non-deploying (`ci.yml` runs the gates; `deploy.yml` does not trigger on PRs).
- **Not pushed.** Hosted validation is pending explicit authorization.

---

## 11. Hosted verification — 2026-10-11

### 11.1 Hosted path used (non-deploying)
- Branch `ci/r16-test-gates` (**CI files only**) → **draft PR #2** to `main`: `https://github.com/tex-node/raivstream/pull/2`.
- Trigger: `pull_request` → workflow **CI (tests)** (`ci.yml`). The deploy workflow (push-to-main) did **not** trigger.

### 11.2 Healthy path — PASS
- Run **38180537650** ("CI (tests)", pull_request) — **conclusion: success**.
  - `API unit tests` → **success**: `Test Files 82 passed (82)`, `Tests 1550 passed | 5 skipped (1555)`.
  - `API integration tests (real PostgreSQL)` → **success**: `prisma db push` synced the disposable schema at `localhost:5433`; preflight `verified index: CREATE UNIQUE INDEX audio_cues_music_track_unique ON public.audio_cues USING btree ("trackId") WHERE ((metadata ->> 'kind'::text) = 'MUSIC_TRACK'::text)`; suite ran `[phase6d] race=20/20`; counts `integration counts: total=4 passed=4 failed=0 pending=0 todo=0`; no skip marker.

### 11.3 Failure path — observed on the first run
- Run **38180248457** — **conclusion: failure**: `API unit tests` success, `API integration tests` **failure**.
- Root cause: the step passed a literal `--` to vitest (`vitest run … "--" "--reporter=default" …`), so the JSON report was never written and the count assertion could not find `/tmp/integration.json`. The integration tests themselves **passed 4/4** in that run.
- Fixed in commit `0a7c865` (removed the `--`); the healthy re-run (§11.2) is green.
- This demonstrates the integration job surfaces a failure (red job). It does **not** prove the deploy gate blocks deployment under a hosted failure — that remains statically inspected only (`deploy.yml` requires a push to `main`, which was not performed).

### 11.4 Not proven hosted (static only)
- `deploy.needs: [test-unit, test-integration]` blocking deployment — static (no push to `main`).
- Branch protection requiring the checks — absent (repository-settings change needed).

### 11.5 Commits on `ci/r16-test-gates`
- `81c5d0f` — CI gate + non-deploying validation workflow (5 files).
- `0a7c865` — fix pnpm arg passthrough so the integration JSON report is written.
