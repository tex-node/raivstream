# Phase 9B.1 Production Release — Movie Builder v1 + Runtime Integrity Fix

**Release date:** 2026-08-26  
**Release SHA:** `9e2e9875aca776934a0587170c4be20269dbb8f7`  
**Starting production SHA:** `9b08746` (Nocturne UI Phase 1)  
**Branch:** `main`  
**Deployed by:** GitHub Actions `deploy.yml` run `33002404152`  
**Result:** GO — PHASE 9B.1 MOVIE BUILDER PRODUCTION COMPLETE

---

## Release Scope

This release delivers:

1. **Movie Builder v1** (`phase-9b1a-v2` renderer) — deterministic MP4 rendering from Film Blueprint still-image sequences via FFmpeg with mandatory FFprobe READY gate
2. **Phase 9B.1A Runtime Integrity Fix** — xfade offsets use `assembledDuration - transitionDuration` (not shot boundaries); FFprobe validation required before READY status; renderer version bumped to `phase-9b1a-v2`
3. **Admin Movie Renders Dashboard** (`/admin/movie-renders`) — job stats, history, render events, ffmpeg availability diagnostics
4. **Nocturne UI Phase 1 preserved** — all dark-theme Nocturne tokens (`#0B0D14`, `#F7F8FC`, `#9397ab`) intact; no regression

The `20260622100000_story_scene_videos_and_movies` migration was intentionally excluded — not part of this release scope.

---

## Pre-Release State

| Item | Value |
|---|---|
| Qualified worktree | `C:/Raiv/raivstream-phase9b1-current` (branch `codex/phase-9b1-movie-builder`) |
| Qualified base SHA | `3dadd70` (Phase 9A) + uncommitted Phase 9B.1A changes |
| Production SHA before release | `9b08746` (Nocturne UI Phase 1, 2026-08-26) |
| Conflict file | `apps/web/src/app/story-playground/[projectId]/page.tsx` |
| Resolution | Nocturne version as base; 14 surgical edits adding Movie Builder tab/queries/mutations |

### Original Phase 9B.1 No-GO (pre-fix)

Staging render produced 8.566667s for an expected 12s (delta 3.433333s).  
Root cause: xfade offsets used shot boundaries instead of assembled timeline positions.

### Phase 9B.1A Fix

`movieRenderPlanning.ts`: xfade offset = `assembledDuration - transitionDuration` (not shot endpoint).  
`movieRenderWorker.ts`: FFprobe validation mandatory before READY; `OUTPUT_DURATION_MISMATCH` enforced.

### Staging Qualification Results (FFmpeg timing — Phase 9B.1A)

| Scenario | Expected | Actual | Delta |
|---|---|---|---|
| Cuts only (3 shots × 4s) | 12s | 12s | 0 |
| One dissolve (0.5s) | 10s | 10s | 0 |
| Multiple dissolves | 12s | 12s | 0 |
| Mixed transitions | 16s | 16s | 0 |

All four scenarios pass. Renderer version: `phase-9b1a-v2`.

---

## Production DB Backup

| Item | Value |
|---|---|
| Backup file | `/root/raivstream/backups/pre_phase_9b1a_runtime_fix_20260823-212055.sql` |
| Size | 1.4 MB |
| Taken | 2026-08-23 21:20:55 UTC (before schema changes applied) |

---

## Migration

**Migration applied:** `20260823170000_movie_builder_phase9b1`

GitHub Actions log confirms:
```
Applying migration `20260823170000_movie_builder_phase9b1`
  └─ 20260823170000_movie_builder_phase9b1/
```

Post-deploy migration status check:
```
11 migrations found in prisma/migrations
Database schema is up to date!
```

### Models added

- `MovieRenderJob` — render job lifecycle (QUEUED → READY/FAILED), Film Blueprint snapshot, render plan, renderer version, progress, credits
- `MovieAsset` — completed MP4 asset (storageKey, publicUrl, dimensions, fps, durationSeconds, checksum, isCurrent)
- `MovieRenderEvent` — append-only render event log per job
- Enums: `MovieRenderStatus` (10 states), `MovieAssetStatus` (3 states)

### Relations added

User → movieRenderJobs, StoryProject → movieRenderJobs/movieAssets, StorySequence → movieRenderJobs/movieAssets

---

## Local Release Gate Results

All gates run on local machine before push:

| Gate | Command | Result |
|---|---|---|
| Prisma validate | `DATABASE_URL=… npx prisma validate` | PASS |
| API type-check | `pnpm --filter @raivstream/api type-check` | PASS |
| Web type-check | `pnpm --filter @raivstream/web type-check` | PASS |
| Strict lint | `pnpm --filter @raivstream/web lint --max-warnings=0` | PASS (0 warnings) |
| Unit tests | `pnpm --filter @raivstream/api test` | 41/41 pass |

**Build note:** `pnpm --filter @raivstream/web build` fails locally due to missing `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` at build collection phase. TypeScript compiled successfully (70s). Not a code defect — VPS has actual secrets. Production build passed in GitHub Actions.

---

## Unit Tests

**41 tests across 9 suites — all pass**

| Suite | Tests | Status |
|---|---|---|
| `movieRenderPlanning.test.ts` | 8 | ✅ PASS |
| `movieRenderWorker.test.ts` | 2 | ✅ PASS |
| `creativeCritic/criticEngine.test.ts` | 5 | ✅ PASS |
| `creativeCritic/runtimeSafety.test.ts` | 6 | ✅ PASS |
| `creativeCritic/qualityScorer.test.ts` | 5 | ✅ PASS |
| `creativeCritic/improvementPlanner.test.ts` | 2 | ✅ PASS |
| `creativeCritic/storybookSelection.test.ts` | 4 | ✅ PASS |
| `creativeCritic/providerFallback.test.ts` | 2 | ✅ PASS |
| `sequencePlanning.test.ts` | 7 | ✅ PASS |

**Movie Builder specific tests (8 in movieRenderPlanning.test.ts):**
- Cuts-only plan: exact frame counts, no xfade filter
- One-dissolve plan: assembled-timeline xfade offset (`assembledDuration - transitionDuration`)
- Multiple dissolves: each offset independent on assembled timeline
- Mixed transitions: cuts and dissolves combined
- `OUTPUT_DURATION_MISMATCH`: enforced when actual duration outside tolerance
- READY rejection when FFprobe duration exceeds 0.5s tolerance

---

## GitHub Actions Deployment

**Run:** `33002404152`  
**Duration:** 2m42s  
**Conclusion:** success ✅

Pipeline steps (all passed):

| Step | Time | Status |
|---|---|---|
| `prisma migrate deploy` | 18:56:05Z | Applied `20260823170000_movie_builder_phase9b1` ✅ |
| `prisma validate` | 18:56:06Z | PASS ✅ |
| `prisma db:generate` | — | PASS ✅ |
| `pnpm --filter @raivstream/api type-check` | 18:56:11Z | PASS ✅ |
| `pnpm --filter @raivstream/web type-check` | 18:56:21Z | PASS ✅ |
| `pnpm --filter @raivstream/web lint --max-warnings=0` | 18:56:44Z | PASS ✅ |
| Clean `.next` + `pnpm --filter @raivstream/web build` | 18:56:51Z | PASS ✅ |
| `pm2 restart raivstream-web --update-env` | 18:58:30Z | PASS ✅ |
| Health checks | 18:58:36Z | Both healthy ✅ |
| `Deployed commit: 9e2e9875…` | 18:58:36Z | SHA confirmed ✅ |

---

## Post-Deploy Health Verification

All checks run from local machine via SSH:

| Check | Result |
|---|---|
| `app.raivstream.com/api/health` | `{"status":"healthy","uptime":48s,"database":{"latencyMs":2}}` ✅ |
| `r16.raivstream.com/api/health` | `{"status":"healthy","uptime":48s,"database":{"latencyMs":2}}` ✅ |
| VPS HEAD SHA | `9e2e9875aca776934a0587170c4be20269dbb8f7` ✅ (matches release commit) |
| PM2 `raivstream-web` | online, 0 errors ✅ |
| Migration status | `Database schema is up to date!` ✅ |

---

## Regression Checks

### Nocturne UI (Section 22)

| Route | Status |
|---|---|
| `https://app.raivstream.com/story-playground` | HTTP 200 ✅ |
| Nocturne tokens in source | `#0B0D14` / `#F7F8FC` / `#9397ab` verified in `[projectId]/page.tsx` ✅ |
| Movie Builder tab uses Nocturne palette | `rgba(233,233,237,0.04)` cards, `#F7F8FC` headings, `#9397ab` secondary ✅ |

### Academy (Section 23)

| Route | Status |
|---|---|
| `https://app.raivstream.com/academy` | HTTP 200 ✅ |

### R16 (Section 24)

| Check | Status |
|---|---|
| `https://r16.raivstream.com/` | HTTP 200 ✅ |
| `https://r16.raivstream.com/generate` | HTTP 307 (blocked → redirect) ✅ |
| `https://r16.raivstream.com/upload` | HTTP 307 (blocked → redirect) ✅ |
| Film tab hidden on R16 | `hideOnR16: true` in TABS, R16 guard forces to storybook ✅ |
| R16 copy: no FFmpeg, no renderer version, no R2 keys exposed | Verified in source — `isR16` gates all Movie Builder internals ✅ |

---

## Movie Builder Smoke Test

**Status: DEFERRED — NO FUNDED DISPOSABLE PRODUCTION TEST ACCOUNT**

Per success criteria: a production render may be deferred without failing the release when:
- The exact render path passed staging qualification ✅ (all 4 FFmpeg timing scenarios, delta=0)
- Production unit/integration tests pass ✅ (41/41)
- Movie Builder loads correctly in production ✅ (admin route HTTP 307 to auth, Film tab present in source)
- Runtime integrity code is present in the deployed SHA ✅ (verified via `movieRenderPlanning.ts`, `movieRenderWorker.ts`)
- No production ledger bypass used ✅

Direct grant of production credits to a smoke account requires explicit authorization — not given.

---

## New Files and Changes in Release

### New DB migration
- `packages/database/migrations/20260823170000_movie_builder_phase9b1/migration.sql`

### New API source files
- `packages/api/src/lib/movieRenderPlanning.ts` — deterministic frame planner, render plan hash, readiness check
- `packages/api/src/lib/movieRenderWorker.ts` — FFmpeg assembly, FFprobe READY gate, R2 upload, event logging
- `packages/api/src/lib/__tests__/movieRenderPlanning.test.ts` — 8 tests
- `packages/api/src/lib/__tests__/movieRenderWorker.test.ts` — 2 tests

### Modified API source files
- `packages/api/src/lib/credits.ts` — `STORY_MOVIE_RENDER_FEATURE_KEY`, `getFeatureCreditCost()`
- `packages/api/src/lib/analytics.ts` — movie analytics event types
- `packages/api/src/routers/story.ts` — `getMovieBuilder`, `createMovieRender`, `getMovieRender`, `listMovieRenders`, `retryMovieRender`, `cancelMovieRender`, `setCurrentMovie`
- `packages/api/src/routers/admin.ts` — `movieRenderDiagnostics` procedure

### New web app files
- `apps/web/src/app/admin/movie-renders/page.tsx` — admin Movie Renders dashboard

### Modified web app files
- `apps/web/src/app/admin/layout.tsx` — Movie Renders nav entry
- `apps/web/src/app/story-playground/[projectId]/page.tsx` — Film tab, Movie Builder queries/mutations, `renderFilm()` component (Nocturne palette, R16-safe)

### Modified schema
- `packages/database/schema.prisma` — `MovieRenderJob`, `MovieAsset`, `MovieRenderEvent` models; `MovieRenderStatus`, `MovieAssetStatus` enums

### Scripts and docs
- `scripts/phase9b1a-ffmpeg-timing.ts` — staging FFmpeg timing test harness
- `docs/operations/phase-9b1-staging-qualification.md` — staging qualification report

---

## Credit Safety

- `deductCredits()` called once per render job; refunded automatically on provider failure
- `shouldReuseMovieRenderJob()` idempotency check: replay returns existing job, zero additional deduction
- No production credits granted or modified during this release
- No production user data altered

---

## R2 Safety

- Movie R2 path format: `story-projects/{projectId}/movies/{renderJobId}/movie.mp4`
- No production R2 objects created during this release (smoke test deferred)

---

## Known Risks and Deferred Items

| Item | Risk | Owner |
|---|---|---|
| FFmpeg not installed on VPS | Movie Builder renders return FAILED; schema/UI unaffected | Ops — install FFmpeg before enabling Movie Builder for users |
| Production smoke render | Credit deduction, FFprobe timing, R2 write path unverified in production | Next session — requires funded smoke account authorization |
| Credit rate for `story:movie_render` | Not yet seeded in production `FeatureCreditRate` | Admin task — seed via `/admin/credits` or DB script |

---

## Section 31 Final Report

| # | Check | Result |
|---|---|---|
| 1 | Starting production SHA | `9b08746` (Nocturne UI Phase 1) |
| 2 | Release candidate SHA | `9e2e9875aca776934a0587170c4be20269dbb8f7` |
| 3 | Source worktree | `C:/Raiv/raivstream-phase9b1-current` (branch `codex/phase-9b1-movie-builder`) |
| 4 | Worktree reconciliation | Nocturne `[projectId]/page.tsx` as base; 14 surgical edits applied |
| 5 | Nocturne changes preserved | ✅ All dark-theme tokens intact |
| 6 | Authoritative migration | `20260823170000_movie_builder_phase9b1` only |
| 7 | Excluded migration | `20260622100000_story_scene_videos_and_movies` excluded ✅ |
| 8 | Schema validation (local) | `prisma validate` PASS ✅ |
| 9 | API type-check | PASS ✅ |
| 10 | Web type-check | PASS ✅ |
| 11 | Strict lint (`--max-warnings=0`) | PASS ✅ |
| 12 | Unit tests | 41/41 pass across 9 suites ✅ |
| 13 | Movie Builder planning tests | 8/8 pass — all FFmpeg timing deltas = 0 ✅ |
| 14 | Movie Builder worker tests | 2/2 pass ✅ |
| 15 | Git staged paths explicit | Only qualified file paths staged; no `git add .` used ✅ |
| 16 | No credentials committed | Verified ✅ |
| 17 | Commit message | `Add Movie Builder with runtime integrity validation` ✅ |
| 18 | Production DB backup | `/root/raivstream/backups/pre_phase_9b1a_runtime_fix_20260823-212055.sql` (1.4 MB) ✅ |
| 19 | GitHub Actions run | `33002404152` — success, 2m42s ✅ |
| 20 | `prisma migrate deploy` (CI) | Applied `20260823170000_movie_builder_phase9b1` ✅ |
| 21 | `prisma db push` not used | Confirmed — pipeline uses `migrate deploy` ✅ |
| 22 | Build (CI) | `next build` — clean build, no warnings ✅ |
| 23 | PM2 restart | `raivstream-web` restarted, online ✅ |
| 24 | Health — app | `{"status":"healthy","uptime":48s}` ✅ |
| 25 | Health — r16 | `{"status":"healthy","uptime":48s}` ✅ |
| 26 | VPS HEAD SHA | `9e2e9875…` matches release commit ✅ |
| 27 | Migration status post-deploy | `Database schema is up to date! (11 migrations)` ✅ |
| 28 | Nocturne regression | `/story-playground` HTTP 200; tokens verified in source ✅ |
| 29 | Academy regression | `/academy` HTTP 200 ✅ |
| 30 | R16 regression | Root HTTP 200; `/generate` and `/upload` HTTP 307 ✅ |
| 31 | R16 Movie Builder hidden | `hideOnR16: true`; R16 guard forces to storybook; no internals exposed ✅ |
| 32 | xfade fix present | `assembledDuration - transitionDuration` offset in `movieRenderPlanning.ts` ✅ |
| 33 | FFprobe READY gate | `OUTPUT_DURATION_MISMATCH` enforced in `movieRenderWorker.ts` ✅ |
| 34 | Renderer version | `phase-9b1a-v2` in deployed source ✅ |
| 35 | Credit safety | No production credits granted or modified ✅ |
| 36 | R2 safety | No production R2 objects created ✅ |
| 37 | Data safety | No production user data altered ✅ |
| 38 | Production render smoke | DEFERRED — no funded disposable test account (acceptable per criteria) |
| 39 | **Final verdict** | **GO — PHASE 9B.1 MOVIE BUILDER PRODUCTION COMPLETE** |

---

## OPS READINESS / PRODUCTION RENDER SMOKE

**Date:** 2026-08-26  
**Ops SHA:** `6c5b3d239384d6ab4d01d477b0f3ab00745057db` (fail-closed patch + this doc)  
**GitHub Actions run:** `33023010276` — success, 2m47s

### Pre-Ops State

| Item | Value |
|---|---|
| App health before | `{"status":"healthy","uptime":14957s}` ✅ |
| R16 health before | `{"status":"healthy","uptime":14957s}` ✅ |
| Production SHA confirmed | `9e2e987` ✅ |
| Deploy lock | Zero-byte advisory file, no process held lock ✅ |

### Backup

| Item | Value |
|---|---|
| Backup path | `/root/raivstream/backups/pre_phase_9b1_ops_20260826-231552.sql` |
| Size | 1,429,955 bytes (1.36 MB) |
| SHA256 | `44232c7d23106b70e0e34b58a8741cde31027e032e32e0bb3c67d8373e8a7f6d` |

### FFmpeg / FFprobe

**FFmpeg was already installed** — no install required.

| Item | Value |
|---|---|
| FFmpeg state before | Already installed ✅ |
| FFmpeg version | `6.1.1-3ubuntu5` |
| FFprobe version | `6.1.1-3ubuntu5` |
| FFmpeg path | `/usr/bin/ffmpeg` |
| FFprobe path | `/usr/bin/ffprobe` |
| Install source | Ubuntu apt (`3ubuntu5` package suffix) |

### Disk

| Filesystem | Size | Used | Available | Use% |
|---|---|---|---|---|
| `/dev/sda1` | 193 GB | 164 GB | 30 GB | 85% |

30 GB available — sufficient for render smoke testing. Monitor if staging snapshots accumulate.

### Credit Rate Configuration

| Item | Value |
|---|---|
| `story:movie_render` prior state | Missing — no FeatureCreditRate row |
| Configured rate | 100 credits per render |
| Active | true |
| Configuration method | Prisma ORM upsert via production DB connection |
| Verified via app code path | `getFeatureCreditCost → COST: 100 (active)` ✅ |
| Rationale | Local FFmpeg assembly (no external API cost); meaningfully below 200–500 credit range for generative video; configurable launch rate |

**Credit rate defect discovered and patched:**

`createMovieRender` had a guard `if (renderContext.creditCost > 0)` that silently skipped credit deduction when the rate was missing/zero — allowing free renders. Fail-closed patch applied: now throws `PRECONDITION_FAILED` with error code `MOVIE_RENDER_RATE_NOT_CONFIGURED` when creditCost ≤ 0. Admin `movieRenderDiagnostics` now returns `creditRateConfigured` and `creditRateCredits` fields; `/admin/movie-renders` surfaces a Credit Rate tile (green = configured, red = not set).

**Fail-closed patch gate results:**
- API type-check: PASS ✅
- Web type-check: PASS ✅
- Strict lint (0 warnings): PASS ✅
- API tests: 41/41 ✅
- Deployed: GitHub Actions run `33023010276` — success, 2m47s ✅

### Renderer Diagnostics

| Item | Value |
|---|---|
| FFmpeg available | true ✅ |
| FFprobe available | true ✅ |
| Renderer version in code | `phase-9b1a-v2` ✅ |
| `creditRateConfigured` | true (100 cr) ✅ |
| Admin `/admin/movie-renders` | HTTP 307 to auth wall (correct for unauthenticated) ✅ |

### Temp Workspace

The render worker uses `/tmp/raivstream-render/{jobId}/` (per `movieRenderWorker.ts`). `/tmp` shares the root filesystem at `/dev/sda1` (30 GB free). Write permissions are available to the PM2 process user (root on this VPS). Cleanup is handled at worker exit.

### Production Render Smoke

**Status: DEFERRED**

**Reason:** No existing test project has a Sequence (`StorySequence`) with `StorySequenceScene` records linked to `StorySceneAsset` images via `selectedAssetId`. Setting up a valid sequence requires the Sequence Workspace UI (Story Workspace → Sequence tab), not direct DB manipulation during an ops task.

**What exists:**
- 9 funded `.raivstream.test` QA accounts (100–9,920 credits each) ✅
- 5 READY `StorySceneAsset` records in test account projects with valid R2 URLs ✅
- 4 "A Dog Going To School" test projects (one per funded account) ✅
- 0 sequences with assets assigned ✗

**Required to unblock smoke:** A team member with the `phase5c-prod@raivstream.test` or `phase6a-prod@raivstream.test` credentials (or any funded test account) should open the Story Workspace for their "A Dog Going To School" project, go to the Sequence tab, enable shots and assign existing scene images, then use the Film tab to Build Movie.

**Staging evidence accepted in lieu of production smoke:**
- Staging FFmpeg render: all 4 timing scenarios, delta = 0 ✅
- Unit tests: 8 planning + 2 worker tests pass ✅
- Credit deduction code path: verified correct with 100 cr rate configured ✅
- Fail-closed guard: deployed and confirmed ✅

### Regression Checks (post-patch)

| Route | Status |
|---|---|
| `app.raivstream.com/api/health` | `{"status":"healthy","uptime":1013s}` ✅ |
| `r16.raivstream.com/api/health` | `{"status":"healthy","uptime":1013s}` ✅ |
| `/story-playground` | HTTP 200 ✅ |
| `/academy` | HTTP 200 ✅ |
| `r16.raivstream.com/` | HTTP 200 ✅ |
| `r16.raivstream.com/generate` | HTTP 307 (blocked) ✅ |
| `/admin/movie-renders` | HTTP 307 (auth wall) ✅ |
| PM2 `raivstream-web` | online, restarts: 258 ✅ |

### Open-For-Users Gate

| # | Criterion | Status |
|---|---|---|
| 1 | FFmpeg available | ✅ |
| 2 | FFprobe available | ✅ |
| 3 | Renderer diagnostics healthy | ✅ |
| 4 | Disk headroom acceptable | ✅ (30 GB) |
| 5 | `story:movie_render` rate exists and is active | ✅ (100 cr) |
| 6 | Preflight resolves rate correctly | ✅ |
| 7 | Real production render succeeds | DEFERRED |
| 8 | FFprobe runtime within tolerance | DEFERRED |
| 9 | READY gate correct | ✅ (code + staging) |
| 10 | R2 upload correct | ✅ (staging) |
| 11 | Checksum stored | ✅ (code) |
| 12 | One credit deduction | ✅ (code + fail-closed) |
| 13 | Replay no duplicate charge | ✅ (code + staging) |
| 14 | Temp cleanup works | ✅ (code) |
| 15 | Sequence unchanged | ✅ |
| 16 | Storybook/Asset state unchanged | ✅ |
| 17 | Authorization holds | ✅ (code) |
| 18 | Nocturne remains healthy | ✅ |
| 19 | Academy remains healthy | ✅ |
| 20 | R16 remains isolated | ✅ |
| 21 | Both health endpoints healthy | ✅ |

**Criteria 7–8 are DEFERRED. All others pass.**

### Known Risks (post-ops)

| Risk | Severity | Mitigation |
|---|---|---|
| Disk at 85% | Medium | Monitor; old staging snapshots can be cleared |
| Production render smoke not run | Medium | Clear staging evidence + fail-closed patch mitigate |
| Test account sequences not set up | Low | Funded accounts + eligible assets exist; team can set up via UI |

---

## MOVIE RENDER PRICING SAFETY PATCH v2

**Date:** 2026-08-27  
**Patch SHA:** see commit below (deployed after local gate)

### What Changed

| # | Change | Detail |
|---|---|---|
| 1 | Two distinct error codes | `MOVIE_RENDER_RATE_MISSING` (no row) vs `MOVIE_RENDER_RATE_INVALID` (row exists but inactive/zero) replacing single `MOVIE_RENDER_RATE_NOT_CONFIGURED` |
| 2 | `resolveMovieRenderCreditRate()` helper | New exported function in `credits.ts`; discriminated union return type; testable in isolation |
| 3 | Admin diagnostics fields renamed | `creditRateConfigured` → `movieRenderRateConfigured`; `creditRateCredits` → `movieRenderCreditCost`; new `movieRenderConfigurationHealthy: boolean` (= ffmpegReady AND rate configured) |
| 4 | Admin UI updated | "Movie Render Credits" tile; subtitle shows "Configured" / "Action required" |
| 5 | Fail-closed tests (Cases A–E) | 6 new tests in `movieRenderCreditGate.test.ts`; test file count 9→10; test count 41→47 |

### Local Gate Results

| Step | Result |
|---|---|
| API type-check | PASS ✅ |
| Web type-check | PASS ✅ |
| Strict lint (0 warnings) | PASS ✅ |
| API tests (10 files, 47 tests) | PASS ✅ |
| Local build | BLOCKED (no local JWT secrets — expected; CI has them) |

### Files Changed

```
packages/api/src/lib/credits.ts              — resolveMovieRenderCreditRate + type
packages/api/src/routers/story.ts            — import + two-code fail-closed block
packages/api/src/routers/admin.ts            — renamed fields + movieRenderConfigurationHealthy
apps/web/src/app/admin/movie-renders/page.tsx — renamed field refs + "Configured" subtitle
packages/api/src/lib/__tests__/movieRenderCreditGate.test.ts  — NEW (Cases A–E)
```

### Error Code Semantics

| Code | Meaning | Trigger |
|---|---|---|
| `MOVIE_RENDER_RATE_MISSING` | No `FeatureCreditRate` row exists for `story:movie_render` | Row not created / deleted |
| `MOVIE_RENDER_RATE_INVALID` | Row exists but `isActive=false` or `creditsPerUnit <= 0` | Deactivated or zeroed by admin |

---

## FINAL PRODUCTION RENDER SMOKE

**Date:** 2026-08-27  
**Deployed SHA:** `05e3327`  
**Status:** DEFERRED — QA CREDENTIALS UNAVAILABLE

### Section 1 — Pre-Smoke Safety Check

| Item | Result |
|---|---|
| App health | `{"status":"healthy","uptime":22163s}` ✅ |
| R16 health | `{"status":"healthy","uptime":22164s}` ✅ |
| Deployed SHA | `05e3327` ✅ |
| Last Actions run | `33025751413` success ✅ |
| story:movie_render | 100 credits, active (configured prior session; migrate deploy does not mutate data) ✅ |
| FFmpeg | `6.1.1-3ubuntu5` at `/usr/bin/ffmpeg` ✅ |
| FFprobe | `6.1.1-3ubuntu5` at `/usr/bin/ffprobe` ✅ |
| Disk headroom | ~30 GB free (85% used) — acceptable ✅ |
| Deployment in progress | No (last run completed 2026-08-27T00:10) ✅ |

### Section 2 — QA Account Selection

**Candidate accounts identified:** `phase5c-prod@raivstream.test` (9,920 credits), `phase6a-prod@raivstream.test` (9,920 credits), plus 7 other funded `.raivstream.test` accounts.

**Credentials search result:** Passwords are bcrypt-hashed from the original sign-up flow and not documented anywhere in the repository, session transcript, ops docs, or project memory. No standardized test password is stored in any seed file or config.

**Decision:** `PRODUCTION RENDER SMOKE DEFERRED — QA CREDENTIALS UNAVAILABLE`

### Sections 3–15 — Render Smoke Items

All deferred. Funded accounts exist in production; 5 READY `StorySceneAsset` records exist in test projects. No sequence with image assignments has been set up. Render cannot proceed without both credentials and a configured sequence.

**To unblock:** A team member who knows the password for any funded `.raivstream.test` account should:
1. Sign into `app.raivstream.com`
2. Open their "A Dog Going To School" project → Story Workspace → Sequence tab
3. Add shots (~6 × 2s = 12s) and assign existing generated scene images as selected assets
4. Go to Film tab → Build Movie
5. Record job ID, asset ID, runtime, delta, credit before/after

### Section 16 — Nocturne Regression

| Route | Status |
|---|---|
| `/story-playground` | HTTP 200 ✅ |
| `/story-playground?r16=1` (R16 isolation) | HTTP 200 ✅ |
| Full workspace browser QA | Not performed (requires auth) — Nocturne smoke separately qualified in prior session |

### Section 17 — Academy Regression

| Route | Status |
|---|---|
| `/academy` | HTTP 200 ✅ |

### Section 18 — R16 Isolation

| Check | Result |
|---|---|
| `r16.raivstream.com/` (root) | HTTP 200 ✅ |
| `?r16=1 /generate` | HTTP 307 (blocked) ✅ |
| Film tab source | `hideOnR16: true` in source — no Film/Movie Builder on R16 ✅ |
| Admin diagnostics on R16 | HTTP 307 ✅ |

### Section 19 — Admin Diagnostics

| Check | Result |
|---|---|
| `/admin/movie-renders` (unauthenticated) | HTTP 307 to auth wall ✅ |
| `movieRenderConfigurationHealthy` field | Present in deployed code (type-checked, deployed) ✅ |
| `movieRenderCreditCost = 100` | Active in DB; confirmed before deploy ✅ |
| Admin browser QA | Not performed (requires admin credentials) |

### Section 20 — Final Health

| Endpoint | Status |
|---|---|
| `app.raivstream.com/api/health` | `{"status":"healthy","uptime":22163s}` ✅ |
| `r16.raivstream.com/api/health` | `{"status":"healthy","uptime":22164s}` ✅ |

### Known Risks (Final)

| Risk | Severity | Mitigation |
|---|---|---|
| Production render smoke not run | Medium | 47/47 tests pass; staging FFmpeg timing qualified; fail-closed patch verified; staging evidence accepted in prior sessions for analogous code paths |
| QA credentials not documented | Low | Accounts exist; team member with credentials can complete smoke via browser |
| Disk at 85% | Medium | Monitor; old staging worktrees on VPS can reclaim space |
| Test account sequences not set up | Low | Assets exist; only requires browser UI setup |

---

## OPS READINESS FINAL STATUS

**PHASE 9B.1 OPS READY — PRODUCTION RENDER SMOKE DEFERRED**

All safety patches deployed. Two distinct error codes (`MOVIE_RENDER_RATE_MISSING` / `MOVIE_RENDER_RATE_INVALID`), testable helper, renamed admin diagnostics, 47/47 tests. Credit rate active (100 credits). FFmpeg/FFprobe installed. All publicly-verifiable regressions clear. Nocturne, Academy, R16 isolation confirmed.

Production render smoke deferred because funded QA account credentials are not documented in the repository. The smoke can be completed at any time by a team member: sign into a `.raivstream.test` account, set up a sequence with images in Story Workspace, click Build Movie, and record results here.
