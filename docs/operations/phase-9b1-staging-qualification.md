# Phase 9B.1 Staging Qualification

Date: 2026-08-23

## Implementation

- Local source worktree: `C:\Raiv\raivstream-phase9b1-current`
- Branch: `codex/phase-9b1-movie-builder`
- Base production SHA: `3dadd703dc1403f00ddb46e415dc30a1aa20ba5b`
- Migration: `20260823170000_movie_builder_phase9b1`
- Staging checkout: `/root/raivstream-phase9b1-staging`
- Production deployment: not performed
- Commit/push: not performed

## Production Preflight

- Production checkout: `/root/raivstream`
- Production HEAD before staging work: `3dadd703dc1403f00ddb46e415dc30a1aa20ba5b`
- Production PM2 process `raivstream-web`: not restarted
- `https://app.raivstream.com/api/health`: healthy
- `https://r16.raivstream.com/api/health`: healthy

## Backup

- Backup path: `/root/raivstream/backups/pre_phase_9b1_movie_builder_20260823-164610.sql`
- SHA256: `14f6d80d922f2af3411edf22eacb8c2b4cef5f8aa3f11f5ff6988f5a998791c3`
- Backup was created before applying the Phase 9B.1 migration to staging.

## Staging Database

- Database: `raivstream_phase9b1_restore_20260823164714`
- Source: production backup restored into an isolated staging database
- App `.env`: `/root/raivstream-phase9b1-staging/.env`
- Symlinks: `apps/web/.env.local` and `packages/database/.env`
- Note: replaying all migrations from an empty database failed on pre-existing historical migration `20260618120000_story_playground_phase1` because `StoryProjectStatus` was not available at that point in the migration chain. Qualification therefore used a production-like restored database, which is the relevant production compatibility path for this additive migration.

## Migration Result

- `pnpm --filter @raivstream/database exec prisma migrate deploy`: passed
- `pnpm --filter @raivstream/database exec prisma validate`: passed
- `pnpm --filter @raivstream/database db:generate`: passed
- Additive tables/enums were created without requiring destructive schema changes.

## Local Gate

- `pnpm --filter @raivstream/database exec prisma validate`: passed with local placeholder DB URLs
- `pnpm --filter @raivstream/database db:generate`: passed
- `pnpm --filter @raivstream/api test`: passed, 9 files and 35 tests
- `pnpm --filter @raivstream/api type-check`: passed
- `pnpm --filter @raivstream/web type-check`: passed
- `pnpm --filter @raivstream/web lint --max-warnings=0`: passed
- `apps/web/.next`: cleaned before build
- `pnpm --filter @raivstream/web build`: passed through static generation and build trace collection

## Staging Gate

- `pnpm install --frozen-lockfile`: passed
- `pnpm --filter @raivstream/database exec prisma migrate deploy`: passed
- `pnpm --filter @raivstream/database exec prisma validate`: passed
- `pnpm --filter @raivstream/database db:generate`: passed
- `pnpm --filter @raivstream/api type-check`: passed
- `pnpm --filter @raivstream/web type-check`: passed
- `pnpm --filter @raivstream/web lint --max-warnings=0`: passed
- `pnpm --filter @raivstream/api test`: passed, 9 files and 35 tests
- `rm -rf apps/web/.next`: completed before build
- `pnpm --filter @raivstream/web build`: passed

## FFmpeg

- `ffmpeg` and `ffprobe` were not initially installed on the VPS.
- Installed package: `ffmpeg`
- Installed version: `ffmpeg version 6.1.1-3ubuntu5`
- Installed `ffprobe version 6.1.1-3ubuntu5`
- Install added the FFmpeg runtime dependency required for deterministic still-image movie rendering.

## Runtime Smoke

Initial smoke attempts found two operational issues:

- A restored production scene asset URL returned 404, so the render failed safely without creating a movie.
- The first moving-shot filter used `zoompan` and exceeded the staging timeout. The renderer was changed to lightweight scale/crop-based pan and tilt filters, with a command timeout guard.

Final deterministic staging smoke passed with a staging-only project and R2-hosted source images.

- Project: `cmt5xo6900004hdkl3g8m1cal`
- Sequence: `cmt5xo6jz000jhdkl03mfwsm9`
- Render job: `cmt5xo6o4000yhdkluu1rjwk7`
- Movie asset: `cmt5xod06001lhdklamgtkj9e`
- R2 key: `story-projects/cmt5xo6900004hdkl3g8m1cal/movies/cmt5xo6o4000yhdkluu1rjwk7/movie.mp4`
- Credit balance before render: `220`
- Credit balance after render: `219`
- Idempotent replay reused the existing render: yes
- Replay charged extra credits: no
- Admin diagnostics saw render jobs: `3`

Persisted output metadata:

- Expected duration stored on `MovieAsset`: `12` seconds
- Width: `720`
- Height: `1280`
- FPS: `30`
- MIME type: `video/mp4`
- File size: `15214` bytes
- SHA256 checksum: `8b724731dffdbcb88652a715cec4fafef6983f3460b411584d1d7a01f383aa49`
- Render duration: approximately `8.187` seconds from `startedAt` to `completedAt`

Independent FFprobe verification of the generated MP4:

- Container: `mov,mp4,m4a,3gp,3g2,mj2`
- Codec: `h264`
- Width: `720`
- Height: `1280`
- Average frame rate: `30/1`
- Actual duration: `8.566667` seconds
- File size: `15214` bytes

Release-blocking runtime mismatch:

- Render Plan / persisted expected runtime: `12` seconds
- FFprobe actual runtime: `8.566667` seconds
- Difference: `3.433333` seconds
- Tolerance target: `<= 0.25` seconds
- Result: failed. The worker marked the job `READY` even though the generated MP4 runtime materially diverged from the Render Plan.

Verified before runtime-gate failure:

- Movie render job reached `READY`.
- MovieAsset was created and marked current.
- MP4 uploaded to R2.
- Credit deduction occurred once for the new render.
- Idempotent same-hash replay reused the existing job without extra credit deduction.
- Failed render path refunded reserved credits.
- R16 API access was denied.
- Admin diagnostics reported FFmpeg availability.

Not qualified:

- Runtime verification did not enforce the expected duration.
- The generated movie should not have been marked `READY` with this mismatch.
- Real movie playback/visual camera and transition QA must be repeated after the runtime fix.

## Staging Runtime

- PM2 process: `raivstream-phase9b1-staging`
- Port: `3034`
- Production PM2 process `raivstream-web`: unchanged
- The first attempted staging start used port `3033`, which was already used by Phase 9A staging. Phase 9B.1 was then moved to `3034`.
- Local staging health over plain HTTP returned a redirect-style response instead of JSON; production health endpoints remained clean. Browser-level signed-in visual QA is still recommended before production promotion.

## Caveats

- The current worker runs as a server-side background task from the API process. This is acceptable for the Phase 9B.1 foundation and low-volume controlled release, but a dedicated queue worker should be considered before high-volume rendering.
- The final staging smoke invoked the worker directly after creating the render job through the story router with queueing disabled. This qualified the API contract, deterministic plan, FFmpeg render, R2 upload, credit accounting, idempotent replay, and R16 denial, but not long-running production process supervision under load.
- Historical migrations are not replayable from an empty database because of a pre-existing migration-chain issue. Production migration compatibility was qualified against a production-like restored database.
- Browser signed-in visual QA for the Film tab should be performed during controlled production release smoke.

## Decision

Phase 9B.1 is not staging-qualified. The release gate is NO-GO until runtime semantics and FFprobe verification are corrected and the full staging smoke is rerun.

## Phase 9B.1A Runtime Remediation

Date: 2026-08-23

Phase 9B.1A corrected the runtime integrity blocker without adding new Movie Builder features.

Root cause:

- Phase 9B.1 rendered transition handles on incoming clips but applied `xfade` at the shot boundary instead of `current assembled duration - transition duration`.
- For overlapping transitions, this started the transition too late and allowed FFmpeg to shorten the assembled timeline.
- FFprobe output was not parsed as the authoritative READY gate, so a materially short MP4 could become `READY`.

Canonical runtime semantics:

- Shot duration is final screen time.
- Sequence runtime, Film Blueprint runtime, Render Plan runtime, and expected FFprobe runtime are the sum of enabled shot durations plus hold duration already folded into each planned shot.
- Transition durations are internal render handles and do not add to or subtract from creator-facing runtime.
- Camera movement never changes runtime.

Transition timing rules:

- `CUT` and `NONE`: no overlap, no added handle, no runtime effect.
- `CROSS_DISSOLVE`, `FADE`, `DIP_TO_BLACK`, and `DIP_TO_WHITE`: overlap adjacent clips using an incoming transition handle; final runtime remains the sum of shot screen durations.
- Unsupported transitions fall back to the rendered transition, usually `CUT`; runtime uses the rendered fallback, not the unsupported requested value.

Code changes:

- Renderer version changed from `phase-9b1-v1` to `phase-9b1a-v2`, so old broken render plans and corrected plans do not collide.
- Added shared runtime helpers in `movieRenderPlanning`:
  - `calculateExpectedRenderDuration`
  - `calculateRenderedSegmentDuration`
  - `durationWithinTolerance`
  - `isOverlappingRenderedTransition`
- FFmpeg still segments now render exact frame counts at 30 fps.
- `xfade` offsets are now calculated from the current assembled timeline as `assembledDurationSeconds - transitionDurationSeconds`.
- FFprobe JSON is parsed before upload and before READY.
- READY now requires valid output file, video stream, dimensions, codec, fps, duration within tolerance, checksum, and successful R2 upload.
- Added stable failure code `OUTPUT_DURATION_MISMATCH`.
- Successful `MovieAsset.metadata` now stores verification data: expected duration, actual duration, delta, tolerance, dimensions, fps, codec, container, file size, and `outputVerifiedAt`.
- `/admin/movie-renders` now exposes expected runtime, actual runtime, delta, tolerance, renderer version, and error code/message for admin-only diagnostics.

Additional tests:

- API tests increased to 41 passing tests.
- Added unit coverage for cuts-only runtime, one dissolve, multiple dissolves, mixed transitions, transition fallback timing, tolerance decisions, deterministic render handles, and the mandatory worker case where FFmpeg succeeds but FFprobe duration mismatch produces `FAILED` with `OUTPUT_DURATION_MISMATCH`.

Local verification after remediation:

- `pnpm --filter @raivstream/database exec prisma validate`: passed.
- `pnpm --filter @raivstream/database db:generate`: passed.
- `pnpm --filter @raivstream/api type-check`: passed.
- `pnpm --filter @raivstream/web type-check`: passed.
- `pnpm --filter @raivstream/web lint --max-warnings=0`: passed.
- `pnpm --filter @raivstream/api test`: passed, 9 files and 41 tests.
- Local FFmpeg integration was not run because FFmpeg/FFprobe are not installed on the Windows workstation.

Staging requalification:

- Fresh staging backup: `/root/raivstream/backups/pre_phase_9b1a_runtime_fix_20260823-212055.sql`.
- Backup size: `1436059` bytes.
- Backup SHA256: `73ae3d3e0a98cba1966685e4800715cfd49b15a2857a1b2e483401fc51112a5b`.
- Staging DB: `raivstream_phase9b1_restore_20260823164714`.
- Staging checkout: `/root/raivstream-phase9b1-staging`.
- Staging PM2 process remained isolated from production.
- Production was not migrated, restarted, pushed, or deployed.

Staging gate after remediation:

- `pnpm --filter @raivstream/database exec prisma migrate deploy`: passed.
- Second `migrate deploy`: passed, no pending migrations.
- `pnpm --filter @raivstream/database exec prisma validate`: passed.
- `pnpm --filter @raivstream/database db:generate`: passed.
- `pnpm --filter @raivstream/api type-check`: passed.
- `pnpm --filter @raivstream/web type-check`: passed.
- `pnpm --filter @raivstream/web lint --max-warnings=0`: passed.
- `pnpm --filter @raivstream/api test`: passed, 9 files and 41 tests.
- `rm -rf apps/web/.next`: completed before build.
- `pnpm --filter @raivstream/web build`: passed through static generation and build trace collection.

Real FFmpeg timing integration:

- `cuts_only_12s`: expected `12`, actual `12`, delta `0`, tolerance `0.25`, 720x1280, 30 fps, h264.
- `one_dissolve_10s`: expected `10`, actual `10`, delta `0`, tolerance `0.25`, 720x1280, 30 fps, h264.
- `multiple_dissolves_12s`: expected `12`, actual `12`, delta `0`, tolerance `0.25`, 720x1280, 30 fps, h264.
- `mixed_transitions_16s`: expected `16`, actual `16`, delta `0`, tolerance `0.25`, 720x1280, 30 fps, h264.

Original 12-second R2 smoke rerun:

- Project: `cmt67j1c60004256mnodeq51n`.
- Sequence: `cmt67j1ph000j256m2ki7r73e`.
- Render job: `cmt67j1sy000y256mz5ha39wv`.
- Movie asset: `cmt67j5ev001l256m8bvbe34q`.
- R2 key: `story-projects/cmt67j1c60004256mnodeq51n/movies/cmt67j1sy000y256mz5ha39wv/movie.mp4`.
- Expected runtime: `12`.
- Actual FFprobe runtime: `12.000000`.
- Delta: `0`.
- Tolerance: `0.25`.
- Dimensions: `720x1280`.
- FPS: `30/1`.
- Codec: `h264`.
- Container: `mov,mp4,m4a,3gp,3g2,mj2`.
- File size: `12640` bytes.
- Render duration: approximately `4.64` seconds.
- Checksum: `029948fad0991cfcc24cb48175bfbd460b4d760d10de0626ba1085e9cd74a49b`.
- Credits: balance changed from `239` to `238`; idempotent replay reused the READY render and did not deduct again.
- MovieAsset verification metadata stores expected duration, actual duration, delta, tolerance, dimensions, fps, codec, container, and file size.
- R16 API denial remained in the smoke test.
- Admin diagnostics detected FFmpeg and exposes runtime verification fields.

Production isolation:

- `https://app.raivstream.com/api/health`: healthy after staging requalification.
- `https://r16.raivstream.com/api/health`: healthy after staging requalification.
- Production PM2 was not restarted.
- Production database was not migrated.
- `main` was not pushed.

Remaining controlled-release caveats:

- Browser signed-in Film tab QA should still be done during controlled production smoke.
- The worker still runs as an API-process background task and should become a dedicated worker before high-volume rendering.
- Historical migration replay from an empty database still has a pre-existing migration-chain issue unrelated to Phase 9B.1A; production-like restore remains the qualified compatibility path.

Final Phase 9B.1A recommendation:

Runtime integrity is requalified for controlled production release.
