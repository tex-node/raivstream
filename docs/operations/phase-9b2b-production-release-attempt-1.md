# PHASE 9B.2B PRODUCTION RELEASE REPORT — Attempt 1

## Final verdict

**PHASE 9B.2B PRODUCTION PROMOTION — ROLLED BACK**

A real, 100%-reproducible defect in `restoreAudioVersion` was found during Section 12's mandatory API smoke test, caught before any real user or real data was affected. Per this procedure's explicit rule ("If any defect requires a code change: STOP... Do NOT patch production"), the fix was not attempted live. Production was reverted to the previous known-good commit and verified healthy. The additive Phase 9B.2B schema was left in place (safe — the reverted application code never references it).

---

## Release

- Target short SHA: `6bfb6a4`
- Target full SHA: `6bfb6a4dea764d23b9236ba2201c7b7475a44b9c`
- Previous production SHA (`PRE_DEPLOY_PRODUCTION_SHA`): `05e3327403d5efb04f79971b995188c890feb43f`
- **Final production SHA (post-rollback): `05e3327403d5efb04f79971b995188c890feb43f`** — identical to pre-deploy; net change to running application code is zero
- Deployment timestamp: 2026-08-29, ~06:24–06:47 UTC (checkout → rollback complete)
- Production process identity: `raivstream-web` (PM2 id 0), `/root/raivstream/apps/web`, host `vmi3208643`

## Ground truth (Section 1)

Repository clean: no uncommitted tracked changes, no staged changes. Exactly two commits between `origin/main` and target (`dfb09c9`, `6bfb6a4`), no unrelated commits. `migration_lock.toml` and all disposable qualification/debug scripts confirmed absent from the target tree.

## Environment gate (Section 2)

Production positively identified: host `vmi3208643`, dir `/root/raivstream`, DB target `172.18.0.2:5432/postgres` (masked) — confirmed structurally distinct from staging's `127.0.0.1:55484/raivstream_phase9b2_pg` on host, port, and database name. R2 config present (shared with staging, already known). FFmpeg 6.1.1 / FFprobe 6.1.1 both available. No dedicated production preflight script exists in-repo (staging-only); identity confirmed manually.

## Backup

- Filename: `pre_phase_9b2b_audio_performance_20260829-082352.sql`
- Path: `/root/raivstream/backups/pre_phase_9b2b_audio_performance_20260829-082352.sql`
- Timestamp: 2026-08-29 08:23:52
- Size: 1,430,064 bytes
- SHA-256: `b8f76c7926e3a9c5964e6b2a3b9ca44cc5c917eb3dc25a383ae99491c9119457`
- Validation result: PASS — non-destructive structural check (matched `PostgreSQL database dump` / `dump complete` header-footer pair, 105 `CREATE TABLE` / 105 `COPY` statements, exactly one completion marker; not truncated)
- **Not restored** — not needed. No data corruption occurred; the defect is an application-code bug, not a data problem, and was caught with zero real users on the new schema (all Phase 9B.2B tables had 0 rows throughout).

## Migration

- Pre-deploy status: 11/11 migrations, schema up to date
- Migration audit: both migrations reviewed line-by-line — purely additive (2 new enums, 6 new tables, 3 new nullable columns on `movie_render_jobs`), zero `DROP`/`RENAME`/`TRUNCATE`, zero destructive `ALTER`
- Migrations applied: `20260827120000_audio_performance_phase9b2`, `20260827180000_audio_blueprint_hash_phase9b2b` — both succeeded cleanly, "All migrations have been successfully applied."
- Post-deploy status: 13/13 migrations, schema up to date
- **Migrations were NOT rolled back** — left in place per Section 21 ("keep additive schema in place unless there is a demonstrated reason it prevents the old application from functioning"). The reverted (05e3327) application code has zero references to any Phase 9B.2B model, confirmed by grep before relying on this — no such reason exists.
- Post-migration sanity read (before the defect surfaced): `StorySequence` unchanged at 2 rows; `MovieRenderJob`/`MovieAsset` unchanged at 0; all four new Audio* tables created with 0 rows — migration was cleanly additive with zero data impact, confirmed empirically.

## Health (initial deploy, before rollback)

- Application: online, 0 unstable restarts
- DB connectivity: healthy, 1ms latency
- No Prisma/migration/worker/FFmpeg/R2 errors in logs (only expected, benign Next.js "Server Action" cache-mismatch noise from the redeploy transition — old client bundles briefly referencing stale action IDs, self-resolving, unrelated to this release)
- FFmpeg/FFprobe: available
- Worker: no crash signal observed in the brief window before rollback

## Pricing

- Movie render rate: `story:movie_render` = **100 credits**, `isActive: true` — read, not modified
- Configuration healthy: `movieRenderRateConfigured = true`, `movieRenderCreditCost = 100`, `movieRenderConfigurationHealthy = true`
- Confirmed no audio surcharge/rate added: `story:speech_generation` / `story:audio_generation` — **zero rows**, exactly as before

## R16

Not reached — release stopped at Section 12, before the R16-isolation check (Section 13).

## Audio Workspace (Section 12 — THE FAILING GATE)

| Check | Result |
|---|---|
| Real QA account registered via normal `auth.register` path | ✅ `phase9b2b-prod-smoke-<ts>@raivstream.test` |
| Zero-cost StoryProject created | ✅ |
| Audio Plan retrieved (auto-creates a 0-scene sequence, zero AI cost) | ✅ |
| Five track types (NARRATION/DIALOGUE/AMBIENCE/SFX/MUSIC) | ✅ all 5 created |
| Cue persistence | ✅ |
| Cue edit persists | ✅ (`volume: 1 → 0.6`, confirmed via re-read) |
| Version save | ✅ (`v1` created, `versionNumber: 1`) |
| **Version restore** | ❌ **FAILED — `PrismaClientValidationError`** |
| Audio Blueprint / Film preflight | Not reached |

### Defect

**`restoreAudioVersion` throws on every call, for any plan with at least one track — a 100% reproducible regression, introduced by `6bfb6a4`.**

Root cause: `6bfb6a4` added a nested `include: { audioAsset: {...} }` to `audioPlanInclude` (`packages/api/src/routers/story.ts:338-358`) so the UI could render an `<audio>` preview player. `saveAudioVersion` stores `snapshot: plan.tracks` — which now includes that nested `audioAsset` object (or `null`) on every cue. `restoreAudioVersion`'s reconstruction (`story.ts:4997-5010`) destructures `{ id, cues, createdAt, updatedAt, planId, ...trackRest }` from each snapshotted track and `{ id: cueId, trackId, createdAt, updatedAt, ...cueRest }` from each cue, but never strips the `audioAsset` key — so `cueRest` still carries it into `tx.audioCue.create({ data: { ...cueRest } })`, and Prisma rejects it: `Unknown argument 'audioAsset'. Did you mean 'audioAssetId'?`.

Exact reproduction: create any track, save a version, call restore — fails every time, for every user, on every plan with ≥1 track. Not an edge case.

**No data was lost or corrupted** — the whole reconstruction runs inside `ctx.prisma.$transaction(...)`, confirmed rolled back atomically (verified via direct read: the 5 tracks and 1 cue from before the failed restore call were exactly intact afterward, no partial state, no duplication).

Per this procedure's explicit rule, **no fix was attempted** in production. The smoke-test project was deleted via a scoped, cascading `StoryProject` delete (my own clearly-labeled test data only); the smoke account was left in place, matching the established convention of prior `phase<N>-prod-smoke-*` accounts already present in production.

## Movie Builder regression

Not reached — release stopped before Section 14.

## Audiovisual smoke

**NOT EXECUTED / NOT REACHED** — release stopped at Section 12, well before Section 15.

## Snapshot integrity

Partially exercised: the live Audio Blueprint (built during the smoke test, before the restore failure) was scanned for forbidden transient fields (signed/download URLs, temp paths, worker IDs, timestamps) — **zero hits**, consistent with every prior staging qualification this phase. Full round-trip snapshot integrity (through a render) not reached.

## Regression smoke (Sequence / Storybook / Creative Critic / Academy / Story Playground / Nocturne shell)

Not reached — release stopped at Section 12.

## Logs

No release-blocking errors beyond the defect above. Only benign, expected Next.js "Server Action" mismatch noise from the redeploy transition (present on essentially every Next.js production redeploy; unrelated to Phase 9B.2B).

## Rollback

- Executed: application reverted from `6bfb6a4` to `05e3327403d5efb04f79971b995188c890feb43f` via `git checkout` (detached HEAD, exact SHA)
- `pnpm install --frozen-lockfile` (no changes — lockfile untouched), `prisma generate` (regenerated client matching the pre-9B.2B schema, harmless), `pnpm --filter @raivstream/web build` (succeeded — `story-playground/[projectId]` back to 17.3kB, confirming the old UI is genuinely what's running), `pm2 restart raivstream-web --update-env`
- Post-rollback health: **200**, DB latency 3ms, 0 unstable restarts, no Prisma/migration/worker errors in logs
- Database backup was **not** restored (not needed — see Backup section)
- Additive schema **kept in place** (safe — old app code doesn't reference any of it)
- All staging PM2 processes (`raivstream-phase9b2-audio-staging` and every other `*-staging` process) confirmed untouched throughout — uptimes/restart counts unaffected by any step of this release attempt

## Rollback readiness

- Previous SHA recorded and successfully restored: ✅
- Backup verified: ✅ (not needed for this rollback, but available and validated)
- Rollback procedure: executed successfully, production healthy on the known-good commit

## Cleanup

Smoke-test project deleted (cascaded its plan/tracks/cues). Smoke-test account (`phase9b2b-prod-smoke-*`) left in place, matching established precedent. All one-off scratch scripts used for this release procedure removed from the production checkout; the two read-only diagnostic scripts that found and confirmed this defect (`prod-release-baseline-counts.ts`, `prod-release-audio-api-smoke.ts`) were **not** committed to the release branch — they exist only in the local worktree for the team's use when re-attempting this release, matching this session's established "durable tooling vs. disposable/local-only" distinction.

## Next steps (not executed — reporting only, per instruction to stop after this report)

The fix is narrow and well-understood: `restoreAudioVersion`'s cue/track reconstruction needs to also strip the `audioAsset` relation-object key (alongside the fields it already strips) before calling `tx.audioTrack.create(...)`/the nested cue `create`. This was never exercised by this session's earlier staging qualification because the persistence-checkpoint and workspace-acceptance scripts were run against `dfb09c9`, before `6bfb6a4` added the `audioAsset` include — and the browser QA pass after `6bfb6a4` deployed never actually clicked "Save Version" → "Restore" (it tested the new sliders/audio-player controls, not the pre-existing version controls). Recommend: fix, add a regression test that saves-then-restores a version through a plan with at least one track, re-run the FULL staging qualification (not just the delta), then re-attempt this production promotion procedure from Section 1.
