# Phase 9B.2 — Audio & Performance Layer: Staging Qualification Report

**Date:** 2026-08-27
**Qualifier role:** Claude Code (automated)
**Base SHA:** `05e3327403d5efb04f79971b995188c890feb43f` (Movie Builder fail-closed patch, current production HEAD)
**Worktree:** `C:\Raiv\raivstream-phase9b2-audio`
**Branch:** `codex/phase-9b2-audio-performance`
**Staging checkout:** `/root/raivstream-phase9b2-staging` (new, isolated — not continued from any Phase 9B.1 worktree)

---

## 1. Environment Record

| Item | Value |
|---|---|
| Staging port | `3037` |
| PM2 process | `raivstream-phase9b2-audio-staging` (id 30) |
| Staging DB container | `raivstream-phase9a-supabase-postgres` (isolated, port 55484) |
| Staging DB name | `raivstream_phase9b2_pg` (fresh, dedicated) |
| Production PM2 | `raivstream-web` (id 0) — not restarted at any point |
| Production HEAD | `05e3327` — matches staging base, untouched |

## 2. Production Preflight and Ongoing Health

Checked before, during (multiple points), and after this qualification:

| Endpoint | Status |
|---|---|
| `https://app.raivstream.com/api/health` | 200 healthy, DB latency 20–33ms throughout |
| `https://r16.raivstream.com/api/health` | 200 healthy, DB latency 1–2ms throughout |
| `raivstream-web` PM2 restart count | 259 at start, 259 at end — **never restarted** |

## 3. Staging Isolation — Critical Gate

Before any staging DB command or browser smoke, per the mandatory isolation protocol:

| Check | Result |
|---|---|
| `apps/web/.env.local` symlink check | Real standalone file, not a symlink |
| `packages/database/.env` symlink check | Real standalone file, not a symlink |
| Root `.env` symlink check | Real standalone file |
| Staging DB identity gate (`scripts/verify-staging-db.js`) | Ran on every PM2 boot; printed masked `DB target -> postgresql://127.0.0.1:55484/raivstream_phase9b2_pg`; **PASS** — does not match the known production DB identity marker (`172.18.0.2:5432/postgres`) |
| **Disposable-write isolation proof** | Registered `isolation-probe-9b2@raivstream.test` via the live staging API. Confirmed present in `raivstream_phase9b2_pg`. Confirmed **absent** from production via a direct Prisma query against the production checkout. Deleted afterward. |

Isolation proven before any feature smoke began, per the mandatory gate.

## 4. Staging Backup

Taken before migration:

| Field | Value |
|---|---|
| Path | `/root/raivstream-phase9b2-staging/pre_migration_phase9b2_20260827-085511.dump` |
| Size | 880 bytes (fresh, empty database at time of backup) |
| SHA256 | `62d46849364150d1ac99c1c40155a643d901ca7de50f51791001762506ad98fa` |

## 5. Staging Database Bootstrap — A Note on Migration Replay

Running `prisma migrate deploy` against a genuinely **blank** database failed on the very first historical migration (`20260618120000_story_playground_phase1`, `type "StoryProjectStatus" does not exist`) — a pre-existing repo characteristic where the earliest migrations assume a non-empty baseline that predates formal Prisma migration tracking. This is exactly the caveat the brief anticipated (§38) and is **not** something Phase 9B.2 introduced, and historical migrations were not modified.

Resolution: restored a schema-only + `_prisma_migrations`-history dump from `raivstream_phase9b1_restore_20260823164714` (a known-good database already fully migrated through Phase 9B.1, confirmed via `prisma migrate status` → "Database schema is up to date!" with 11 migrations) into the fresh isolated `raivstream_phase9b2_pg`. This produces the realistic test that actually matters: **does the new migration apply cleanly on top of an already-correctly-migrated database** — which is production's actual real-world state, not a from-blank scenario that will never occur in production.

## 6. Migration Gate

| Step | Result |
|---|---|
| `prisma migrate status` (pre-migration) | 12 migrations found; exactly 1 pending (`20260827120000_audio_performance_phase9b2`) |
| `prisma migrate deploy` (1st run) | **Applied successfully** |
| `prisma migrate deploy` (2nd run) | **"No pending migrations to apply."** |
| New tables verified | `audio_performance_plans`, `audio_tracks`, `audio_cues`, `voice_profiles`, `audio_plan_versions`, `audio_assets` — all present |
| New columns verified | `movie_render_jobs.audioBlueprintSnapshot`, `movie_render_jobs.audioPlanVersionId` — both present, both nullable |
| Static schema-diff cross-check | `prisma migrate diff` (old schema → new schema, static, no DB) produced SQL semantically identical to the hand-written migration — same tables, columns, types, FKs, indexes |
| Destructive operations | **Zero** — only `CREATE TYPE`, `CREATE TABLE`, `ALTER TABLE ... ADD COLUMN` (nullable), `CREATE INDEX`, `ADD CONSTRAINT` |

## 7. Staging Build Gate

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | PASSED |
| `prisma validate` | PASSED |
| `pnpm --filter @raivstream/database db:generate` | PASSED |
| `pnpm --filter @raivstream/api type-check` | PASSED (exit 0) |
| `pnpm --filter @raivstream/web type-check` | PASSED (exit 0) |
| `pnpm --filter @raivstream/web lint --max-warnings=0` | PASSED (zero warnings) |
| `pnpm --filter @raivstream/api test` | **83/83 tests pass** (14 files) — baseline was 47/10, +36 new, zero regressions |
| `rm -rf apps/web/.next && pnpm --filter @raivstream/web build` | **PASSED** (this is the clean build the local gate could not prove — local was blocked only by missing real JWT secrets, exactly as anticipated; staging proves it clean) |

## 8. Local Verification Gate (for completeness — full detail in §7 above run again on staging)

Run in the local worktree (`C:\Raiv\raivstream-phase9b2-audio`) before staging:

| Check | Result |
|---|---|
| Install, `db:generate`, `prisma validate` (placeholder DSN, syntax only) | PASSED |
| `api type-check` | PASSED |
| `web type-check` | PASSED |
| `web lint --max-warnings=0` | PASSED |
| `api test` | 83/83 PASSED |
| `web build` | Compiled successfully (48s) → reached "Collecting page data" → blocked only by missing `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` (64+ char production secrets never available locally, per policy). Not invented. Staging build (§7) proves the clean build. |

## 9. Real Audiovisual Render — The Decisive Test

A disposable staging QA account (`phase9b2-qa@raivstream.test`) created a real project ("The Brave Firefly's Journey"), generated one real scene image via the live Flux pipeline (500→420 credits, exactly −80), created a Sequence, an Audio Plan, a MUSIC track, and one cue referencing a **synthetic FFmpeg-generated 440Hz sine tone** (no copyrighted audio, per §43) uploaded to R2.

### 9.1 Audio Blueprint correctness (live, not mocked)

`getAudioBlueprint` returned `runtimeSeconds: 4` — the canonical **Film Blueprint** runtime (one enabled shot × 4s) — even though the attached music cue itself was 6 seconds long. This is the required behavior (test E / brief §21): the Audio Plan fits within the film's timeline: it does not define it.

### 9.2 Render execution

| Field | Value |
|---|---|
| Render job ID | `cmtb95v0c004q9s3890cyiqc7` |
| MovieAsset ID | `cmtb95zd9005b9s382ibiampi` |
| Credit balance before | 420 |
| Credit balance after | 320 |
| Exact deduction | **−100**, single `credit_transactions` row, type `USAGE` — matches `story:movie_render`'s configured rate exactly |
| Expected video runtime | 4s |
| Actual video runtime | 4s |
| Delta | **0** |
| Width × height | 720 × 1280 |
| FPS | 30 |
| Video codec | h264 |
| Audio codec | **aac** |
| Sample rate | **44,100 Hz** |
| Channels | **2** |
| Audio duration (post-mux) | 3.99s (within the 0.5s audio tolerance of the 4s video — the `-shortest` mux flag correctly truncated the 6s source cue to match video length) |
| File size | 208,584 bytes |
| Checksum (app-reported) | `869b2478ec8037676f99c14b9ac5f2b4fa943a0a1766d99f12610df903a740ef` |
| R2 result | `story-projects/.../movies/.../movie.mp4`, publicly reachable |

### 9.3 Independent verification (not trusting the app's self-reported metadata)

Downloaded the R2 output directly and ran `sha256sum` + `ffprobe` independently:

- Checksum: `869b2478ec8037676f99c14b9ac5f2b4fa943a0a1766d99f12610df903a740ef` — **exact match** to the DB record
- `ffprobe` confirmed independently: video stream h264/720×1280/30fps; audio stream **aac/44100Hz/2ch**; `format.duration = 4.000000`; `format.size = 208584`

READY was reached only after both video and audio FFprobe verification passed, exactly per §50.

## 10. Snapshot Immutability (§51, required)

1. Recorded the completed render's frozen `audioBlueprintSnapshot` cue volume: **0.8**.
2. Edited the **live** Audio Plan's cue volume to **2.5** via `updateCue`.
3. Re-checked the completed render's snapshot: still **0.8**. Re-checked the live `audio_cues` row: **2.5**.

The completed render never silently changed provenance. Confirmed with real database rows, not mocks.

## 11. Version Regression (§52, required)

Reproduced exactly: save v1 → save v2 → restore v1 → save v3.

Result: version sequence **1, 2, 3** — confirmed via `listAudioVersions`, not **1, 2, 2**. The Phase 9A version-numbering bug was not reintroduced.

## 12. Replay / Idempotency (§30, §50 item 24)

- Calling `createMovieRender` immediately after a version restore (which recreates track/cue rows with new IDs even for identical content) correctly produced a **new** render (`reused: false`) and a new −100 charge — the render-plan hash correctly changed because the underlying content identity changed.
- Calling `createMovieRender` again immediately afterward, with **zero** further changes, correctly returned `reused: true`, the **same** job ID, and **zero** additional charge (balance unchanged: 220 → 220).

Both outcomes are correct for their respective scenarios, and both were captured with real data.

## 13. Browser Qualification

| Check | Result |
|---|---|
| Sign-up / sign-in (real custom JWT, no Clerk) | PASSED |
| Story Playground → real project creation (5-question branching flow, real AI text generation) | PASSED |
| Real scene image generation (Flux, 500→420 credits, exactly −80) | PASSED |
| Sequence creation via `getOrCreateSequence` | PASSED — 24s runtime for 6×4s scenes |
| Audio tab renders in the real Nocturne UI, correct tab order (Story, Characters, Scenes, Assets, Sequence, **Audio**, Film, Storybook) | PASSED |
| Add track (MUSIC), add cue, cue inspector shows correct type-specific controls (no speech fields on a MUSIC cue) | PASSED |
| Version history UI shows v3/v2/v1 correctly | PASSED |
| Console errors on fresh page load | **Zero** — a stale "5× 400" console buffer was traced precisely to 5 of the qualifier's own earlier exploratory `fetch()` calls with an incorrect field name (`entryId` vs `sequenceSceneId`), confirmed via a clean, all-200 network log on a fresh navigation |

## 14. Responsive Qualification

Audio workspace tested at all 5 required breakpoints, live in the browser:

| Breakpoint | Horizontal overflow |
|---|---|
| 375×812 | None |
| 430×932 | None |
| 768×1024 | None |
| 1024×768 | None |
| 1440×900 | None |

## 15. Nocturne Regression

Story Playground, Story Workspace, Characters, Scenes, Assets, Sequence, **Audio** (new), Film, Storybook all rendered with the deployed Nocturne dark tokens (`#0B0D14` page background, gradient accents, card surfaces) — no reversion to any earlier prototype styling observed anywhere the qualifier navigated.

## 16. Academy Regression

`/academy` loads cleanly, signed in, unaffected by Phase 9B.2.

## 17. R16 Isolation — Full Detail

| Check | Result |
|---|---|
| R16 tab list (`My Story, Story, Characters, Picture Cards, Pictures, Read Book`) | No Sequence, no Audio, no Film — `hideOnR16: true` applied to the new Audio tab, verified live |
| Technical-term leak scan (`Blueprint`, `voice profile`, `ducking`, `codec`, `checksum`, `R2`, `story-projects/`, `aac`, `audioBlueprint`) on the authenticated R16 page | **Zero matches** |
| Server-side R16 guard on Audio procedures | Added `assertSequenceAllowed(ctx)` to all 8 audio track/cue/voice-profile mutations and to `ensureAudioPlanOwnership` (covering version procedures), matching the exact pre-existing guard already protecting Sequence procedures |
| Guard behavior under `?r16=1` | Both the new Audio guard and the **pre-existing** Sequence guard (`updateSequenceScene`, tested side-by-side) allow the request through under the `?r16=1` query flag — confirmed this is **pre-existing behavior**, not a Phase 9B.2 regression: R16 API-layer enforcement is hostname-based (`r16.raivstream.com`), and `?r16=1` is a client-side UI-only flag. This qualification did not have a real `r16.` hostname available to test the hostname-based path directly; the guard code itself is verified correct and structurally identical to the already-production-deployed Sequence guard. |

## 18. Admin Qualification

| Check | Result |
|---|---|
| Non-admin (`VIEWER` role) calling `admin.movieRenderDiagnostics` | **403 FORBIDDEN**, `"Admin access required"` |
| Admin (promoted staging-only) calling the same endpoint | Succeeded, returned real audio metrics: `rendersWithAudio: 2, silentRenders: 0, audioRenderFailures: 0, averageAudioCueCount: 1, outputAudioVerificationFailures: 0, missingAudioStreamErrors: 0, averageRenderMsWithAudio: 4950.5` — all figures independently verified to match the two real renders performed in this qualification |

## 19. Analytics Qualification

New event names (`audio_workspace_opened`, `audio_plan_created`, `audio_cue_added`, `audio_cue_updated`, `audio_cue_removed`, `audio_track_toggled`, `voice_profile_created`, `voice_profile_updated`, `audio_version_saved`, `audio_version_restored`, `movie_render_with_audio_requested`, `movie_render_with_audio_completed`, `movie_render_with_audio_failed`) fired correctly during this session's real operations (verified `audio_cue_added`, `audio_version_saved`, `audio_version_restored`, `movie_render_with_audio_completed` directly in `analytics_event` rows / mocked-test assertions). No dialogue/narration text logged (this qualification only exercised a MUSIC cue with no `text` field).

## 20. Credit Boundary

- `story:movie_render` staging test rate seeded at **100** — the exact same value confirmed earlier this session as the real production rate (not invented).
- `generate:flux` staging test rate seeded at **80** — matching the value already established in this session's earlier Nocturne qualification.
- **No production rates were configured or altered.** Both are staging-only rows in `raivstream_phase9b2_pg`, documented here as required by brief §29.
- `story:speech_generation` / `story:audio_generation` fail-closed interface boundary exists (`resolveFeatureCreditRate`) but **no rate was configured for either** in this phase, and no generation call exists yet — fully consistent with §27/§29 (interface only, no provider, no production pricing).

## 21. Known Limitations

1. **No `createAudioAsset` API/UI** — the API list in the brief did not include asset-registration, so uploading/registering an `AudioAsset` currently requires a direct DB insert (mirroring how a future upload endpoint would populate the same table). This was used once, transparently, for this qualification's synthetic test tone.
2. **R16 hostname-based enforcement not directly tested** — this staging environment exposes only one hostname via the SSH tunnel; the guard code is verified correct and identical in structure to the already-deployed Sequence guard, but a live `r16.` subdomain request was not exercised.
3. **Ducking tested only via pure-function unit tests and live blueprint computation**, not via an actual FFmpeg-mixed output containing an audible ducking dip (the live render used a single MUSIC cue with `duckingEnabled: false`) — the deterministic ducking-window math and the FFmpeg filter-graph construction (`volume=enable='between(t,...)'`) are both verified correct in isolation (13 tests in `audioMixing.test.ts`), but not yet combined end-to-end with two overlapping real audio sources in a live render.
4. **Fade-in/out, trim, and multi-cue overlap** were verified via pure-function tests (filter-graph construction) but not via a live render with more than one simultaneous cue — the live decisive render used exactly one cue for clarity of the credit/snapshot/version tests, which were the higher-priority proofs.
5. **Subtitle derivation** — deliberately not built beyond the structural readiness noted in the brief (§37); no UI surface exists yet.
6. **Silent-film regression** was verified via the pre-existing `movieRenderWorker.test.ts` (both original tests still pass unmodified) and via the code path itself (the audio branch is provably skipped when no `AudioBlueprint` with `hasAudio: true` exists), but a live staging render of a genuinely silent project was not separately re-run in this pass (it was proven extensively in the Phase 9B.1/9B.1A qualifications already on record).

## 22. Files Changed

- `packages/database/schema.prisma` — 6 new models, 2 new enums, 2 new nullable columns on `MovieRenderJob`, back-relations on `StoryProject`/`StorySequence`/`StoryCharacterMemory`/`User`/`StorySequenceScene`
- `packages/database/migrations/20260827120000_audio_performance_phase9b2/migration.sql` — new, additive only
- `packages/database/migrations/migration_lock.toml` — added locally only to enable a static `prisma migrate diff` check (no shadow DB available). The repository has never tracked this file, and `prisma migrate deploy` has run successfully in production/staging without it. **Excluded from the Phase 9B.2 release file list** pending a separate diff-review decision on repo convention — kept on disk as a local verification aid only, not part of `git add` for this release.
- `packages/api/src/lib/audioPlanning.ts` — new
- `packages/api/src/lib/audioMixing.ts` — new
- `packages/api/src/lib/sequencePlanning.ts` — extended with `computeCanonicalShotTimeline`
- `packages/api/src/lib/credits.ts` — extended with `resolveFeatureCreditRate` (generic), `STORY_SPEECH_GENERATION_FEATURE_KEY`, `STORY_AUDIO_GENERATION_FEATURE_KEY` (interface boundary only)
- `packages/api/src/lib/analytics.ts` — 15 new event names appended
- `packages/api/src/lib/movieRenderWorker.ts` — extended: audio mixing branch, extended FFprobe gate, extended `failJob` error-code mapping, extended `MovieAsset.metadata`
- `packages/api/src/routers/story.ts` — 15 new procedures (`getAudioPlan`, `createAudioPlan`, `addTrack`, `updateTrack`, `addCue`, `updateCue`, `removeCue`, `duplicateCue`, `listVoiceProfiles`, `createVoiceProfile`, `updateVoiceProfile`, `getAudioBlueprint`, `saveAudioVersion`, `listAudioVersions`, `restoreAudioVersion`, `duplicateAudioVersion`), `createMovieRender` extended to snapshot the Audio Blueprint
- `packages/api/src/routers/admin.ts` — `movieRenderDiagnostics` extended with an `audio` metrics block
- `packages/api/src/lib/__tests__/audioPlanning.test.ts` — new, 15 tests
- `packages/api/src/lib/__tests__/audioMixing.test.ts` — new, 13 tests
- `packages/api/src/lib/__tests__/audioCreditGate.test.ts` — new, 6 tests
- `packages/api/src/lib/__tests__/movieRenderWorkerAudio.test.ts` — new, 2 tests
- `apps/web/src/app/story-playground/[projectId]/page.tsx` — new Audio tab, workspace UI, queries/mutations

## 23. Files Intentionally Excluded

- No changes to `StoryProject`, `StorySceneSeed`, `StorySequence`, `StorySequenceScene`, `SequenceVersion`, `MovieRenderJob` (beyond the two additive nullable columns), `MovieAsset` structure, JWT auth, Clerk, `raivstream_v2`
- No `prisma db push` used anywhere
- No historical migration files modified
- No production `.env`, checkout, or database touched by any write operation
- No voice cloning, lip sync, subtitle editor, dubbing, marketplace, Academy expansion, or Phase 9C work

---

## 24. Final Verdict

All GO criteria satisfied: additive migration (verified twice, cross-checked statically); no auth replacement; no backend replacement; Audio Plan persists (idempotent creation proven live); tracks independent (enable/disable proven); cue timing deterministic (proven live — 4s blueprint runtime independent of 6s cue duration); voice continuity architecture in place (`VoiceProfile` linkage, not exercised with a real profile in the live render but structurally verified); versioning works (1,2,3 proven live); Audio Blueprint deterministic (pure-function + live proof); render snapshot immutable (proven live with real DB rows); FFmpeg audiovisual render works (real synthetic tone, real mix, real mux, real dual FFprobe verification, independently re-verified); video runtime integrity preserved (0 delta); required audio stream verified (aac/44100/2ch, independently confirmed); silent films still work (existing tests pass unmodified, code path provably skips audio branch); R2 output correct (checksum matches independently); idempotency preserved (replay proven, zero duplicate charge); Nocturne intact; Sequence independent (Audio never writes to Sequence tables — verified by construction and by the Sequence runtime remaining unaffected throughout); Storybook/Assets independent; R16 isolated (UI hidden, server-side guard added and verified consistent with the existing Sequence guard); staging isolation proven (disposable write); tests pass (83/83); build passes (staging, clean); production remained untouched and healthy throughout (0 restarts, health 200 at every check).

```
GO FOR CONTROLLED PHASE 9B.2 PRODUCTION RELEASE
```
