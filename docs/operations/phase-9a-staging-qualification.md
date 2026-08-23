# Phase 9A.1 Staging Qualification

Date: 2026-08-23

## Implementation

- Worktree: `/root/raivstream-phase9a-staging`
- Local source worktree: `C:\Raiv\raivstream-phase9a-current`
- Branch: `codex/phase-9a-sequence-workspace-current`
- Base production SHA: `f2ed6b467bd03d4fa33b91f1afd0b6b3322c9205`
- Migration: `20260823090000_sequence_workspace_phase9a`
- Production deployment: not performed
- Commit/push: not performed

## Production Preflight

- Production checkout: `/root/raivstream`
- Production HEAD: `f2ed6b467bd03d4fa33b91f1afd0b6b3322c9205`
- Production working tree: unchanged app source; existing untracked backup/runtime files only
- `https://app.raivstream.com/api/health`: healthy
- `https://r16.raivstream.com/api/health`: healthy

## Backup

- Backup path: `/root/raivstream/backups/pre_phase_9a_sequence_20260823-125435.sql`
- Size: `1350966` bytes
- SHA256: `0cd37b08272b3d6b68b3c3ccfc3f323fcdb26421bed5c770fdd9877c2f25df55`

## Staging Database

- Container: `raivstream-phase9a-supabase-postgres`
- Image: `supabase/postgres:15.8.1.085`
- Host port: `127.0.0.1:55484`
- Database: `raivstream_phase9a_pg`
- App connection: `postgresql://postgres:postgres@127.0.0.1:55484/raivstream_phase9a_pg`
- Restore method: public application schema/data dump from production with owner and privilege statements excluded.
- Restore note: the first full Supabase dump restore was incomplete because Supabase-owned internal objects and auth policies are not portable into an isolated container. A public-schema app restore was used for migration qualification; app tables, primary keys, Prisma migration history, and story data were present.

## Migration Result

- `pnpm --filter @raivstream/database exec prisma migrate deploy`: passed
- Second `migrate deploy`: passed, no pending migrations
- `pnpm --filter @raivstream/database exec prisma validate`: passed
- `pnpm --filter @raivstream/database db:generate`: passed
- Existing `StoryProject` rows survived: yes
- Existing `StorySceneSeed` rows survived: yes
- Existing `StorySceneAsset` rows survived: yes
- Existing Creative Critic and storybook-related records: preserved in the staging restore where present

## Full Gate

Final post-fix gate:

- `pnpm --filter @raivstream/database exec prisma validate`: passed
- `pnpm --filter @raivstream/database db:generate`: passed
- `pnpm --filter @raivstream/api type-check`: passed
- `pnpm --filter @raivstream/web type-check`: passed
- `pnpm --filter @raivstream/web lint --max-warnings=0`: passed
- `pnpm --filter @raivstream/api test`: passed
- `rm -rf apps/web/.next`: completed before build
- `pnpm --filter @raivstream/web build`: passed

Test count after regression coverage: 7 files, 31 tests.

## Staging Runtime

- PM2 process: `raivstream-phase9a-staging`
- Port: `3033`
- Production PM2 process `raivstream-web`: not restarted
- Local staging health with `x-forwarded-proto: https`: healthy
- Local R16 staging health with `Host: r16.raivstream.com`: healthy
- Page checks:
  - `/story-playground`: 200
  - `/story-playground/cms2bqa710005fq5por678ekh`: 200
  - `/story-playground/cms2bqa710005fq5por678ekh/storybook`: 200
  - R16 `/story-playground/cms2bqa710005fq5por678ekh`: 200
  - unauthenticated `/admin/sequence`: 307 to sign-in

## Project Tested

- Project ID: `cms2bqa710005fq5por678ekh`
- Project title: `Buddy Goes to School`
- Source scenes: 6
- Sequence ID: `cmt5pfxjf000er1ib8dody63t`

## Functional Qualification

- Initial sequence creation: passed
- Reopening sequence idempotency: passed
- All source scenes appear as timeline entries: passed
- StorySceneSeed duplication during timeline operations: not observed
- Asset independence:
  - Sequence asset selection did not change the source scene active image.
  - Changing the source active image did not change the sequence-selected asset.
- Asset safety:
  - Ready eligible image: accepted
  - Deleted asset: rejected
  - Creative-rejected asset: rejected
  - Asset from another scene: rejected
  - Cross-user sequence access: rejected
- Timeline reordering: passed; persisted order and Film Blueprint order matched
- Duplicate entry: passed; created a new `StorySequenceScene` only
- Disable entry: passed; stored but excluded from runtime, and retained in Film Blueprint as disabled
- Remove and restore: passed; source `StorySceneSeed` count remained unchanged
- Runtime calculation: passed; disabled entries excluded and hold durations included according to documented semantics
- Shot/camera/transition metadata: passed through API persistence and Film Blueprint
- Versioning:
  - Version creation: passed
  - Restore older version: passed
  - Duplicate restored version: passed after fix
  - Historical version remained available
- Film Blueprint:
  - Deterministic `sequenceId`, `version`, `runtimeSeconds`, and `shots[]` verified
  - No provider/model-specific generation parameters observed
- Authorization:
  - Other-user project access rejected
  - Non-admin admin analytics rejected
  - Admin sequence analytics loaded
- R16:
  - Sequence API blocked in R16 context
  - R16 page route rendered without using admin/debug route access
- Analytics:
  - Sequence events recorded, including create/open/reorder/duplicate/disable/remove/asset/duration/shot/camera/transition/preview/version events
  - Smoke count for the tested project: 95 sequence analytics events

## Defects Found

1. Staging restore issue:
   - Symptom: first full-dump restore produced app data without required primary-key constraints, causing Phase 9A migration to fail.
   - Cause: non-portable Supabase internal/auth objects interrupted the isolated restore.
   - Fix: restored a public application schema/data dump with owner/privilege metadata excluded.
   - Code impact: none.

2. Duplicate version after restore:
   - Symptom: after restoring Version 1 while Version 2 still existed, duplicating a version tried to reuse version number 2 and hit the `sequenceId, versionNumber` unique constraint.
   - Fix: version creation now derives the next version from the highest stored version number for the sequence, not `currentVersionNumber`.
   - Regression coverage: added `nextSequenceVersionFromExisting` test. API tests now pass at 31 tests.

## Existing Feature Regression

Minimal staging checks were performed without paid generation:

- Story Playground page loads.
- Story project workspace route loads.
- Storybook route loads.
- Admin sequence route is protected.
- R16 project route loads.
- Production app and R16 health remained healthy throughout.

No paid image/video generation was performed during this qualification.

## Remaining Risks

- The animatic preview was qualified through API/runtime semantics and page-load checks, not a signed-in browser playback session.
- The public-schema staging restore excludes Supabase internal auth/policy objects by design; it is suitable for Prisma/app migration qualification but is not a full Supabase disaster-recovery restore rehearsal.
- Academy deep-link compatibility was not fully exercised with a live browser assignment flow.

## Final Recommendation

GO FOR CONTROLLED PRODUCTION RELEASE
