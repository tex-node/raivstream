# R16 — Separated CI + Phase 6D PR: Preparation Plan (no commits made)

**Date:** 2026-10-12
**Type:** prepare-only (no branch, commit, push, or PR created)
**Repo:** `tex-node/raivstream` · worktree `C:\Raiv\raivstream`
**Source baseline:** `origin/main` = `a9cb10ff1d83c92d82e5223b559a3100c2b736a7` (verified)

> Per authorization, **no git state was changed**: no branch, no commits, no push, no PR. This is the verified plan.

---

## 1. Original repository state & preserved changes

| Item | Value |
|---|---|
| Current worktree branch / HEAD | `ci/r16-test-gates` @ `0a7c86567ddeed303a33f2feca29fad86d9d3e4a` |
| Local `main` | `9d8ca17` — untouched |
| `origin/main` | `a9cb10ff` — unchanged |
| PR #2 | OPEN · draft · `mergeStateStatus=CLEAN` — untouched |
| Ruleset | `main-required-checks` (id `24907012`, active) — unchanged |
| Uncommitted R16 work (preserved) | ` M packages/api/src/routers/story.ts` (narration fix), ` M packages/api/src/lib/creative/__tests__/phase6d.integration.test.ts`, `?? packages/api/src/lib/story/narrationScript.ts`, `?? …/__tests__/narrationScript.test.ts`, ` M .claude/settings.local.json`, ` D SESSION.md` + `?? session.md` (case collision), R16 docs, `?? packages/api/scripts/r16-render-validation.ts`, untracked UI/scripts/session |
| Other worktrees | untouched (`raivstream-ui-redesign`, `raivstream-phase9b2-audio`, +6) |

**Narration-moderation issue (§3 of the brief):** the fix (`resolveNarrationScript`; moderate-before-persist) lives only in the **uncommitted** working tree (`story.ts` + `narrationScript.ts` + test). It is **out of scope** for this CI+6D PR and is **preserved in place, not touched**. Do **not** fold Phase A narration code into the separated PR to resolve it.

---

## 2. Planned branch & candidate HEAD (not created)

- **Branch name:** `ci/phase6d-gates`
- **Base:** `origin/main` (`a9cb10ff`) — **not** local `main`.
- **Candidate HEAD:** would be the tip after cherry-picking the 4 commits (≈ 4 commits ahead of `origin/main`). **Not created** under this prepare-only authorization.
- **Method (recommended):** create it in a **new worktree** (`git worktree add … -b ci/phase6d-gates origin/main`) so the current worktree and its uncommitted R16 changes are never disturbed.

---

## 3. Exact included commits & files

**Commits (in order):** `6b3989f` (Phase 6D) → `8ace7a0` (6D verify) → `81c5d0f` (CI gates) → `0a7c865` (CI arg fix).

**Resulting diff vs `origin/main` — 13 files:**

*Phase 6D (8):*
- `packages/api/src/lib/creative/audio/service.ts` (idempotency/TOCTOU)
- `packages/api/src/routers/creative/audio.ts` (secure router wiring)
- `packages/api/src/routers/creative/index.ts` (registration)
- `packages/database/migrations/20261009110000_phase6d_music_cue_lock/migration.sql` (partial unique index)
- `packages/api/src/lib/creative/__tests__/phase6d.test.ts`
- `packages/api/src/lib/creative/__tests__/phase6d.integration.test.ts`
- `packages/api/src/lib/creative/__tests__/phase6c.test.ts`
- `docs/phase-6/PHASE-6D-ACCEPTANCE.md`

*CI (5):*
- `.github/workflows/ci.yml` (new, non-deploying)
- `.github/workflows/deploy.yml` (gate + `needs`)
- `packages/api/package.json` (`test:integration`)
- `packages/api/vitest.config.ts` (exclude integration)
- `packages/api/vitest.integration.config.ts` (new)

---

## 4. Evidence that Phase A/B/C is excluded

Checked against the candidate set (6D diff ∪ CI files) — **none present**:
`routers/story.ts`, `lib/analytics.ts`, `lib/credits.ts`, `creative/output/render.ts`, `lib/story/storyVideoExportService.ts`, `database/schema.prisma`, `lib/storyIntelligence/{types,openAIStoryIntelligenceProvider,localStoryIntelligenceProvider}.ts`, `render.test.ts`, `storyVideoExport.test.ts`, `phase_r16_music.test.ts`, `planSceneNarration.test.ts`, migrations `20261009120000`/`20261009130000`.

**Dependency proof the split is clean:**
- `6b3989f`'s parent is `origin/main` (`a9cb10f`); `8ace7a0`'s parent is `6b3989f` → the two 6D commits are a clean prefix on `origin/main`.
- The CI commit's base files (`deploy.yml`, `package.json`, `vitest.config.ts`) are **unchanged** between the 6D tip (`8ace7a0`) and the CI parent (`9d8ca17`) → cherry-picking the CI commits applies cleanly.
- 6D's only external import (`STORY_AUDIO_GENERATION_FEATURE_KEY`) already exists on `origin/main`; the 6D migration is self-contained.

---

## 5. Test results & database/index evidence

**Read-only validations performed now (on the candidate's CI files, which are byte-identical to the branch):**
- `ci.yml`/`deploy.yml` YAML parse + 13 semantic assertions → **ALL PASS**.
- Unit/integration job blocks **byte-identical (parity)** across `ci.yml`/`deploy.yml` → **PASS**.
- `ci.yml` isolation (no deploy job, no secrets, no ssh/pm2/migrate/prod URL) → **PASS**.
- Exact check contexts → `API unit tests`, `API integration tests (real PostgreSQL)`.

**NOT RUN on the candidate:** no branch was created, so the suites were **not executed against the separated tree**. Expected (not assumed): unit suite = `origin/main` tests + `phase6d.test.ts` + `phase6c.test.ts` (A/B/C tests excluded); integration = **4/4** with `race=20/20`, real partial-index predicate verified, counts `4/4/0/0/0`. The hosted run 38180537650 (which **included** A/B/C) is prior evidence that the 6D+CI code passes, but it is **not** the candidate.

**Validation commands to run once a branch is authorized:**
```
git fetch origin
git worktree add C:\Raiv\raivstream-ci6d -b ci/phase6d-gates origin/main
cd C:\Raiv\raivstream-ci6d
git cherry-pick 6b3989f 8ace7a0 81c5d0f 0a7c865
pnpm install --frozen-lockfile
pnpm --filter @raivstream/database exec prisma generate --schema schema.prisma
pnpm --filter @raivstream/api type-check
pnpm --filter @raivstream/api lint
pnpm --filter @raivstream/api test
# disposable PostgreSQL 17 on :5433 + prisma db push + apply 20261009110000, then:
pnpm --filter @raivstream/api test:integration
```

---

## 6. Required GitHub check names remain unchanged

`ci.yml` job names → **`API unit tests`** and **`API integration tests (real PostgreSQL)`** — exactly the contexts required by ruleset `main-required-checks`. The split does **not** rename any job, so the required checks remain valid.

---

## 7. Remaining release risks & dependencies

- The separated PR still ships **Phase 6D production code** (`audio/service.ts`, `creative/audio.ts`) — required for the integration gate; Phase 6D is "HOLD — awaiting final human review" per its acceptance record.
- **Staging S1–S11** and **FFmpeg real-media** validation remain **untested** (for R16 A/B/C; out of scope here).
- The R16 **narration-moderation fix** remains uncommitted and must be committed/validated separately before Phase A ships.
- **DBA migration review** for `20261009120000`/`20261009130000` still outstanding (not in this PR).
- Required-check **blocked-case** enforcement remains inferred (no failing PR created).
- PR #2 (`ci/r16-test-gates`) remains open and, as scoped, must **not** merge.

---

## 8. Proposed PR title & description

**Title:** `ci: mandatory API test gates + Phase 6D music-cue concurrency/idempotency (excludes R16 A/B/C)`

**Description (draft):**
> **Scope:** CI test gates + Phase 6D only. Based on `origin/main`; excludes R16 Phases A/B/C.
>
> **CI:** adds a non-deploying `ci.yml` (`pull_request` + `workflow_dispatch`) running the API unit suite and the real-PostgreSQL integration suite; `deploy.yml` gains `test-unit` + `test-integration` and `deploy` now `needs: [test-unit, test-integration]`. Integration job uses a disposable `postgres:17`, applies the Phase 6D partial-index migration, runs a fail-closed preflight (DB reachable + index predicate) and asserts exact counts (`4/4/0/0/0`).
>
> **Phase 6D:** secure `creative.audio.generateMusic` router, TOCTOU-safe music-cue idempotency, cue cleanup, and the `audio_cues_music_track_unique` partial index.
>
> **Safety:** no production deploy from this workflow; no rate seeding; no live Lyria. Do not merge until reviewed.

---

## 9. Exact next authorization needed

Authorize **local branch creation + cherry-pick** of `6b3989f 8ace7a0 81c5d0f 0a7c865` onto `origin/main` (branch `ci/phase6d-gates`, in a separate worktree) and running the §5 validation. **Push / PR creation / merge remain separately authorized.**

**Stopped here. No branch, commit, push, PR, settings, or deployment change was made.**

---

## 10. Execution & validation results (2026-10-12) — STOPPED on a validation failure

Authorized scope: local worktree + branch creation, cherry-pick of the 4 commits, validation. Executed; **stopped on a validation failure** per instruction #7 (no silent scope expansion).

### 10.1 Candidate created (local only; NOT pushed)
- Worktree `C:\Raiv\raivstream-ci6d`, branch `ci/phase6d-gates`, base `origin/main` (`a9cb10ff`).
- Cherry-pick **clean (exit 0)**. New SHAs: `611a458` (Phase 6D, was `6b3989f`), `7e92b6a` (6D verify, was `8ace7a0`), `eab6355` (CI gates, was `81c5d0f`), `1d0a755` (CI arg fix, was `0a7c865`).
- Diff vs `origin/main` = **exactly 13 files** (verified); **no Phase A/B/C files**.
- Original worktree + uncommitted R16 work preserved; other worktrees untouched; not pushed (remote branch absent).

### 10.2 Validation results
| Check | Result |
|---|---|
| Frozen-lockfile install | **PASS** (2m58s) |
| Prisma generate | **PASS** |
| **Type-check** (`tsc --noEmit`) | **FAIL (exit 2)** |
| Lint | **PASS** |
| Unit suite | **PASS** — 78 files, 1523 passed \| 5 skipped (27 A/B/C tests correctly absent) |
| Integration suite (real PG 17.11) | **PASS** — 4/4, `race=19/20 reuse=1/20` |
| Partial-index predicate (`pg_indexes`) | **PASS** — exact predicate |
| Workflow YAML / semantics / parity | **PASS** (10/10) |
| Required check names | **PASS** — unchanged |

### 10.3 The failure (root cause)
```
src/lib/creative/__tests__/phase6d.integration.test.ts(146,1): error TS2304: Cannot find name 'beforeEach'.
```
- The candidate's integration test imports `{ vi, describe, it, expect, beforeAll, afterAll, afterEach }` — **missing `beforeEach`** — yet calls `beforeEach` at line 146.
- That import was fixed by the **excluded Phase A commit `c188f76`** ("Includes beforeEach import fix in phase6d integration test").
- **Runtime is unaffected** (`globals: true` supplies `beforeEach`), so the integration suite passes 4/4 — but `tsc --noEmit` fails, and **`deploy.yml` runs `pnpm --filter @raivstream/api type-check`**, so a deploy from this candidate would fail at that step.
- This is precisely the "cherry-picking may not be safe" dependency the brief warned about: `8ace7a0` depends on a one-line fix that lives in `c188f76`.

### 10.4 Proposed minimal fix (NOT applied — needs authorization)
Add the one-line import fix to the candidate's integration test as a **separate, clearly-labelled follow-up commit** (a test-infrastructure correction, **not** Phase A production code):
`import { vi, describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';`
then re-run type-check (expect exit 0). This does not widen scope into A/B/C production code.

**Stopped. No push, PR, settings change, merge, or deployment.**

---

## 11. Minimal type-check fix applied & committed (2026-10-12)

Authorized minimal follow-up. Candidate HEAD was `1d0a755`, tree clean.

**Change (1 line, `phase6d.integration.test.ts`):**
```
-import { vi, describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
+import { vi, describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
```

**Commit:** `0217f39` — `test: fix Phase 6D integration type-check` (1 file, +1/−1).

**Validation (post-fix, all pass):**
| Check | Result |
|---|---|
| `type-check` (`tsc --noEmit`) | **PASS (exit 0)** |
| `lint` | PASS (exit 0) |
| Unit suite | PASS — 78 files, 1523 passed \| 5 skipped |
| Integration suite (fresh PG 17.11) | PASS — 4/4, `race=19/20 reuse=1/20` |
| Prisma generate / `db push` | PASS |
| Partial-index predicate | PASS — exact predicate |
| Workflow YAML / check-names / separation / parity | PASS (10/10) |
| Scope vs `origin/main` | exactly **13 files**; no A/B/C |

**Branch `ci/phase6d-gates` final log:** `0217f39` → `1d0a755` → `eab6355` → `7e92b6a` → `611a458` → `a9cb10f`. **Not pushed.** Original worktree + uncommitted R16 work untouched.
