# R16 — PR #2 Scope Reconciliation & Merge Readiness Audit

**Date:** 2026-10-12
**Type:** read-only audit + planning (no mutation)
**Repo:** `tex-node/raivstream` (public) · worktree `C:\Raiv\raivstream`
**PR #2:** `ci/r16-test-gates` → `main` · head `0a7c865` · draft
**Ruleset:** `main-required-checks` (id `24907012`, active)
**Production baseline:** `origin/main` = `a9cb10ff`

> No branch, commit, PR, ruleset, or repository setting was created or modified. No merge/push/deploy.

---

## 1. Current repository & PR state

| Item | Value |
|---|---|
| Worktree branch / HEAD | `ci/r16-test-gates` @ `0a7c86567ddeed303a33f2feca29fad86d9d3e4a` |
| Local `main` | `9d8ca17` — untouched |
| `origin/main` | `a9cb10ff1d83c92d82e5223b559a3100c2b736a7` — no push |
| PR #2 | OPEN · **draft** · base `main` · head `ci/r16-test-gates` · `mergeStateStatus=CLEAN` · `MERGEABLE` |
| Ruleset | `main-required-checks` active, target `refs/heads/main` only, no bypass |
| Uncommitted R16 work | preserved (`story.ts`, `phase6d.integration.test.ts`, `narrationScript.ts` + test, docs, `r16-render-validation.ts`, `.claude/settings.local.json`, `SESSION.md`↔`session.md`, untracked UI/scripts/session) |
| Other worktrees | untouched: `raivstream-ui-redesign` (`4cf01ed`), `raivstream-phase9b2-audio` (`f2dd60a`), + 6 others |

**Working-tree (uncommitted) status:** ` M .claude/settings.local.json`, ` D SESSION.md` + `?? session.md` (case collision), ` M packages/api/src/lib/creative/__tests__/phase6d.integration.test.ts`, ` M packages/api/src/routers/story.ts`, and untracked `narrationScript.ts`/`narrationScript.test.ts`, R16 docs, `r16-render-validation.ts`, plus unrelated UI/scripts/session dirs.

---

## 2. Complete PR #2 changed-file inventory & commit ancestry

### 2.1 Commit ancestry (7 commits ahead of `origin/main`)
```
0a7c865  ci: fix pnpm arg passthrough ...            ← CI
81c5d0f  ci: enforce mandatory ... gates before deploy ← CI
9d8ca17  feat(r16): Phase B -- fail-closed story background music   ← R16
4330faa  feat(r16): Phase C -- FFmpeg background music mux          ← R16
c188f76  feat(r16): Phase A -- per-scene narration script + TTS     ← R16
8ace7a0  verify(phase6d): verification pass ...                     ← 6D
6b3989f  feat(creative): Phase 6D -- secure router wiring ...       ← 6D
```
**Why the five R16 commits appear:** the branch was created from **local `main` (`9d8ca17`)**, which is 5 commits ahead of `origin/main` (`a9cb10ff`). Those 5 commits are therefore the branch's ancestry **and** are part of the PR's diff vs `origin/main`. Commit ancestry and changed-file scope **coincide** here — the PR's file diff **does** contain the R16 implementation (not merely ancestry).

### 2.2 Changed files (28 total) by category

**Category 1 — CI workflow & test-gate infrastructure (5):**
`.github/workflows/ci.yml` (new), `.github/workflows/deploy.yml`, `packages/api/package.json` (`test:integration`), `packages/api/vitest.config.ts`, `packages/api/vitest.integration.config.ts` (new). *(The 2 CI commits contain only these files.)*

**Category 2 — R16/6D production implementation (15):**
`packages/api/src/routers/story.ts` (A narration + B music), `packages/api/src/lib/storyIntelligence/{types,openAIStoryIntelligenceProvider,localStoryIntelligenceProvider}.ts` (A), `packages/api/src/lib/analytics.ts` (A+B), `packages/api/src/lib/creative/output/render.ts` (C), `packages/api/src/lib/story/storyVideoExportService.ts` (C), `packages/api/src/lib/credits.ts` (B), `packages/api/src/routers/creative/audio.ts` + `packages/api/src/routers/creative/index.ts` (6D), `packages/api/src/lib/creative/audio/service.ts` (6D), `packages/database/schema.prisma` (A+B), `packages/database/migrations/{20261009110000,20261009120000,20261009130000}/migration.sql`.

**Category 3 — R16/6D tests (7):**
`phase6d.test.ts`, `phase6d.integration.test.ts`, `phase6c.test.ts`, `phase_r16_music.test.ts`, `render.test.ts`, `storyVideoExport.test.ts`, `planSceneNarration.test.ts`.

**Category 4 — Documentation/acceptance (1):**
`docs/phase-6/PHASE-6D-ACCEPTANCE.md`.

**Category 5 — Unrelated/unexplained:** **none** in the PR diff. (Unrelated untracked files are not in the PR.)

### 2.3 Critical scope finding — the narration-moderation fix is NOT in PR #2
The committed `story.ts` in PR #2 has the **old order**: generate → **persist** → moderate (`story.ts:7597` generate, `:7613` moderate). The moderation-before-persist fix (`resolveNarrationScript`) and `narrationScript.ts`/`narrationScript.test.ts` are **uncommitted** and **not in PR #2**. So merging PR #2 ships the R16 narration path **with the known "stuck script on moderation failure" limitation** documented in the verification report §4.4.

---

## 3. R16 release-gate status (by evidence category)

| Gate | Status | Evidence category |
|---|---|---|
| Narration moderation **before** persistence | **NOT in PR #2** (uncommitted) | local-only fix + regression `narrationScript.test.ts` (3/3) |
| Non-educational R16 narration (Phase A) | present in PR #2 | unit tests (`planSceneNarration` 10) — **local** |
| Background music, fail-closed + separate credit key (Phase B) | present in PR #2 | `phase_r16_music` (5) — **local**; live Lyria **untested/disabled** |
| FFmpeg music mixing / duration / fades / export (Phase C) | present in PR #2 | `render` (7) + `storyVideoExport` (5) — **local**; **real-media untested** (no ffmpeg) |
| Phase 6D PostgreSQL concurrency + idempotency | present in PR #2 | **hosted-CI verified** 4/4, index predicate, `race=20/20` (run 38180537650) |
| Unit/integration CI isolation | present in PR #2 | **hosted-CI verified** (unit 82 files/1550 passed|5 skipped; integration 4/4) |
| FFmpeg/ffprobe render-validation harness | **not in PR #2** (uncommitted) | harness exists; **never executed** (no ffmpeg) |
| Staging acceptance S1–S11 | **NOT TESTED** | none |
| Production verification | **NOT TESTED** | none |
| Production credit rates / Lyria / Phase 6E | **restricted** | rates unseeded; Lyria flag unset; 6E not started |

**Note:** the hosted-CI run 38180537650 exercised the CI-branch HEAD, which **includes** the 5 R16 commits — so R16 code (incl. 6D) passed hosted unit + integration tests. That is **CI** evidence, not **staging/production** acceptance.

---

## 4. Option A vs Option B

### Option A — Merge PR #2 as scoped
- **Ships to production on merge** (merge to `main` → push → `deploy.yml` deploys): R16 A/B/C + 6D + CI.
- **Release gates incomplete:** staging S1–S11 **not tested**; FFmpeg real-media **not validated**; the narration-moderation fix is **absent**; DBA migration review pending. The 6D acceptance record is itself "HOLD — awaiting final human review".
- **Verdict:** not safe as-is.

### Option B — Separate CI infrastructure from R16 application work
- Create a fresh branch from **`origin/main` (`a9cb10ff`)** and apply only approved commits.
- **Hard dependency finding:** the integration gate runs `test:integration` and asserts **exactly 4** tests. On a branch from `origin/main`, the Phase 6D integration test **does not exist** (it was added in `8ace7a0`) → the integration job would run 0 tests and **fail**. Therefore the CI gate **cannot** be made green by CI files alone; it requires the **Phase 6D integration test and the Phase 6D production code it exercises** (`audio/service.ts`, `creative/audio.ts`, `creative/index.ts`, the `20261009110000` migration, `credits.ts` key, `schema.prisma`).
- **Minimal safe separation** = CI commits (`81c5d0f`, `0a7c865`) **+ Phase 6D commits** (`6b3989f`, `8ace7a0`) — **excluding Phase A/B/C** (`c188f76`, `4330faa`, `9d8ca17`).
- **Caveat:** this still ships Phase 6D production code (required by the gate). A PR with **zero** production code is **not achievable** while the integration gate exists.
- **Trade-off:** two PRs; A/B/C remain unmerged until their gates (staging/FFmpeg/narration fix) complete.

---

## 5. Merge-protection verification (against PR #2)

Read back from GitHub:
- Target: **`refs/heads/main` only** (`include:["refs/heads/main"]`, `exclude:[]`) ✓
- Required checks: **`API unit tests`** (integration_id 15368) ✓ and **`API integration tests (real PostgreSQL)`** (15368) ✓
- `strict_required_status_checks_policy: **true**` ✓
- `pull_request` rule + `bypass_actors: []` + `current_user_can_bypass: "never"` + `non_fast_forward` + `deletion` → direct pushes and bypass blocked ✓
- PR #2 head: both checks **pass** (run 38180537650); `mergeStateStatus=CLEAN`; **draft** (not mergeable until marked ready).

Enforcement of the **blocked** case remains **inferred** (not observed; no failing PR was created).

---

## 6. Recommended merge strategy

**Option B — separate (least risky).**

Rationale: PR #2 as-is would deploy R16 A/B/C to production, which are **not staging-verified**, lack the narration-moderation fix, and have no FFmpeg real-media evidence. Separating removes the unverified application changes from the CI gate while keeping the gate green.

**Recommended content of the separated CI PR (from `origin/main` `a9cb10ff`):**
- CI: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `packages/api/package.json`, `packages/api/vitest.config.ts`, `packages/api/vitest.integration.config.ts`.
- Phase 6D (required for the integration gate to be green): `6b3989f` + `8ace7a0` file set — `packages/api/src/lib/creative/audio/service.ts`, `packages/api/src/routers/creative/{audio,index}.ts`, `packages/database/migrations/20261009110000_phase6d_music_cue_lock/migration.sql`, `packages/database/schema.prisma` (6D portion), `packages/api/src/lib/credits.ts` (6D key), `packages/api/src/lib/creative/__tests__/{phase6d.test.ts,phase6d.integration.test.ts,phase6c.test.ts}`, `docs/phase-6/PHASE-6D-ACCEPTANCE.md`.
- **Excluded:** Phase A/B/C (`c188f76`, `4330faa`, `9d8ca17`) — narration/music/export implementation and their tests.

**Alternative if a single PR is preferred:** complete the R16 A/B/C release gates first — commit the narration-moderation fix, run staging S1–S11, validate FFmpeg media, obtain DBA sign-off — then merge Option A.

---

## 7. Exact files/commits needed for the recommended path

**Commits to include (onto a fresh branch from `origin/main`):** `6b3989f`, `8ace7a0`, `81c5d0f`, `0a7c865` (then re-apply the CI arg-fix already in `0a7c865`).
**Commits to exclude:** `c188f76` (Phase A), `4330faa` (Phase C), `9d8ca17` (Phase B).
**Verify after applying:** the integration job runs **4** tests (not 0); unit job green; the check names stay `API unit tests` / `API integration tests (real PostgreSQL)`.

*(No cherry-pick/branch creation was performed — this is the plan.)*

---

## 8. Remaining blockers & required authorizations

1. **Scope separation** (create the CI+6D branch) — requires authorization to create a branch/commits/push/PR.
2. **R16 A/B/C release gates** — staging S1–S11, FFmpeg media validation, narration-fix commit, DBA migration sign-off — required before A/B/C can ship.
3. **Merge protection enforcement** — observed eligible case only; blocked case is inferred.
4. **PR #2 disposition** — as-is it mixes scopes; do not merge without separation or completed gates.

---

## 9. Status

**NOT READY — SCOPE SEPARATION REQUIRED**

PR #2's diff mixes CI/test infrastructure with unverified R16 A/B/C application changes (and omits the narration-moderation fix). The CI gate itself cannot be separated from Phase 6D (the integration test is required to make it green), so the least-risky path is a separated **CI + Phase 6D** PR, with R16 A/B/C held until their release gates complete.
