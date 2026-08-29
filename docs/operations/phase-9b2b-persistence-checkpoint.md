# Phase 9B.2B — Persistence & Idempotency Checkpoint

**Status:** PASSED. Required before further UI/API work builds on the persistent Audio Plan integration.
**Scripts:** `packages/api/scripts/phase9b2b-persistence-checkpoint.ts` (real DB, via `appRouter.createCaller`), `scripts/phase9b2-audio-render-checkpoint.ts` (re-run, real ffmpeg, unchanged 8/8 pass)
**Executed against:** the same isolated staging Postgres (`raivstream_phase9b2_pg`) used throughout Phase 9B.2 — safety gate (`verify-staging-db.js`) run and passed immediately before any migration or write.

## Guardrails addressed this round

### 1–2. `audioMixing.ts` not rewritten; final-mix runtime contract preserved

No change to `buildMixFilterGraph`, `normalizeAudioInput`, `buildMixedAudioTrack`, `muxAudioWithVideo`, `assertAudioReadyGate`, or the post-mux runtime verification this round. Confirmed by diff — this round's code changes are entirely in `movieRenderWorker.ts` (asset resolution/ownership, not the mixing pipeline itself), `story.ts` (persistence/idempotency/ownership), `r2.ts` (one new pure helper), and `audioPlanning.ts` (one new pure helper). Per guardrail #15, the full 8-scenario real-ffmpeg checkpoint was re-run anyway since `movieRenderWorker.ts`'s audio branch did change (see below) — still 8/8 at `0s` delta.

### 3. One audio-rendering path

Confirmed by reading `createMovieRender`: it builds the Audio Blueprint via the same `buildAudioBlueprint()` (qualified `audioPlanning.ts`), stores it as `audioBlueprintSnapshot`, and the worker mixes it via the same qualified `audioMixing.ts`. No alternate renderer exists anywhere in the codebase.

### 4, 6, 7. Render snapshot immutability + idempotency including audio identity

Already structurally wired from earlier work (`combineRenderHash` feeding `renderPlanHash`, worker reading only `job.audioBlueprintSnapshot`) — this checkpoint is the **live, real-DB proof** of it, run via `appRouter.createCaller` against real Postgres (not mocks), per the review's explicit "run the actual data path" instruction:

| Step | Result |
|---|---|
| Visual V + Audio A → Render X | job created |
| Replay (still A, no changes) | **reused X** |
| Edit to Audio B (cue volume 1→0.5) | **new job Y ≠ X**, different `renderPlanHash` |
| Replay (still B) | **reused Y** |
| Revert live plan to byte-identical A (in-place `updateCue`, same cue id — not `restoreAudioVersion`, which recreates rows with new ids) | **reused X again** — proves idempotency is content-addressed, not time/order-based |
| Job X's `audioBlueprintSnapshot` cue volume, read directly from Postgres, before vs. after the live plan was edited to B | **unchanged (1 → 1)** — snapshot immutability holds even after the live plan moved on |

Exact machine output:
```json
{
  "hashX_equals_hashY": false,
  "replayA_before_edit": { "reused": true, "matchesX": true },
  "editToB": { "reused": false, "isNewJob": true },
  "replayB": { "reused": true, "matchesY": true },
  "revertToA_replay": { "reused": true, "matchesX_again": true },
  "snapshotImmutability": { "volumeAtCreation": 1, "volumeAfterLiveEditToB": 1, "unchanged": true }
}
```

### 5. Blueprint version/fingerprint stored

Added `MovieRenderJob.audioBlueprintHash` (nullable `String`, migration `20260827180000_audio_blueprint_hash_phase9b2b`) — a standalone `hashAudioBlueprint()` output, distinct from the combined `renderPlanHash` used for idempotency. Purely additive; verified via static `prisma migrate diff` to match Prisma's own generated SQL exactly, and confirmed populated (`audioBlueprintHashStored: true`) in the live DB proof above. `audioBlueprintVersion` (`blueprintVersion: 'phase-9b2-v1'`) was already persisted inside `audioBlueprintSnapshot` — not duplicated as a separate column, since it's already queryable via the JSON snapshot and per-render provenance is what the new hash column is for.

### 8. Version numbering, persistence-level verified

Ran the real data path — `saveAudioVersion` ×2, `restoreAudioVersion`, `saveAudioVersion` — against a real, fully isolated throwaway `StorySequence`/`AudioPerformancePlan` (so `restoreAudioVersion`'s delete-and-recreate-all-tracks behavior could never touch the shared QA plan used elsewhere in this checkpoint). Stored DB rows, read back directly from Postgres:

```json
[
  { "versionNumber": 1, "title": "v1" },
  { "versionNumber": 2, "title": "v2" },
  { "versionNumber": 3, "title": "v3 (save after restoring v1)" }
]
```

Exactly `1, 2, 3` — not the old `1, 2, 2` bug.

### 9. Immutable-enough asset references

Confirmed `AudioAsset.publicUrl` is constructed as `${R2_PUBLIC_URL}/${key}` (`r2.ts`) — a permanent CDN URL, never a short-lived signed URL, matching the existing convention for every other asset type in this codebase. Hardened anyway: added `getPublicUrlForKey(key)` (new pure export in `r2.ts`) and changed `movieRenderWorker.ts` to re-derive the source URL from the asset's stable `storageKey` at render time rather than trusting the separately-stored `publicUrl` string as canonical, falling back to the stored value only when no `storageKey` is present (e.g. synthetic test fixtures with no real R2 object).

### 14. Cross-project audio asset ownership

Two layers, both new this round:
- **Write-time**: `assertAudioAssetOwnership()` in `story.ts`, called from `addCue`/`updateCue` whenever a client-supplied `audioAssetId` is present — rejects with `NOT_FOUND` if the asset doesn't belong to the same project.
- **Render-time (defense-in-depth)**: `movieRenderWorker.ts`'s `audioAsset.findMany` now filters on `projectId: job.projectId` in the WHERE clause itself, not just an after-the-fact check — a cross-project id is simply never fetched, so it can never be downloaded/mixed even if a bad reference somehow got persisted.

Live proof, real DB: created a second disposable `StoryProject` owned by the same QA user with one `AudioAsset` under it, then attempted `addCue` on the original project's track with that foreign asset id.

```json
{ "denied": true, "deniedCode": "NOT_FOUND" }
```

### 10–13. No fake generation; honest preflight; intent vs. materialized media

- **#10** — audited the entire Audio tab UI (`renderAudio()` in `story-playground/[projectId]/page.tsx`): no "Generate Voice"/TTS control exists anywhere. Nothing to fix; confirmed by absence.
- **#11** — the render worker already silently **omits** (never fakes) a speech cue with no resolved `audioAssetId` (`cuesWithSource` filters strictly on `audioAssetId` presence). This round makes that state visible instead of silent:
  - Cue Inspector now shows, for every NARRATION/DIALOGUE cue: **"Audio source: Attached"** or **"Audio source: Not generated yet — skipped in render"**.
- **#12** — added `summarizeUnmaterializedSpeechCues()` (`audioPlanning.ts`), wired into `getMovieBuilder`'s preflight `readiness.warnings` (the same warning-chip UI the Film tab already renders): e.g. *"2 narration/dialogue cues don't have audio yet — they'll be skipped in the render."* **Product decision, documented here**: this is **WARNING severity, not BLOCKER** — an unmaterialized cue never prevents a render (consistent with the worker's existing silent-omit behavior), it's surfaced so the creator knows before rendering rather than being silently dropped.
- **#13** — the `AudioBlueprintCue` shape already keeps intent fields (`text`, `voiceProfileId`, `performanceDirection`) and materialized-media fields (`audioAssetId`) as distinct, independently-nullable fields on the same record (not merged/inferred from each other); `summarizeUnmaterializedSpeechCues` and the render worker's `cuesWithSource` filter are both built strictly on `audioAssetId` presence, never on whether `text` exists. No schema restructure was needed to keep the two concepts separate — this documents the existing distinction as an explicit, tested contract.

## Full 8-scenario real-ffmpeg re-run (guardrail #15)

Re-run after the `movieRenderWorker.ts` asset-resolution changes above:

```
ok=true
silent_movie: delta=0s
speech_only: delta=0s
ambience_and_sfx: delta=0s
music_and_speech_ducking: delta=0s
overlapping_cues: delta=0s
fade_in_out: delta=0s
late_starting_cue: delta=0s
early_ending_cue: delta=0s
```

8/8 at exactly `0s` delta, same as the prior checkpoint. Both negative READY tests (`movieRenderWorkerAudio.test.ts`) still pass.

## Test suite

**97/97 tests passing, 14 files** — unchanged count from the prior checkpoint (this round's new coverage was persistence-level, proven live against real Postgres rather than added as new unit tests, per the review's explicit instruction not to rely only on unit tests for these invariants).

## Cleanup verification

Every row this checkpoint created (1 disposable `StorySequence`, 1 disposable `StoryProject`, 3 `AudioTrack`s, 2 `MovieRenderJob`s) was deleted in the script's own `finally` block. Verified directly against Postgres after the run: `{ leftoverSequences: 0, leftoverProjects: 0, leftoverTracks: 0, leftoverJobs: 0 }`. The QA user's credit balance was debited for the 2 real `createMovieRender` calls (worker disabled via `MOVIE_RENDER_WORKER_DISABLED=true`, so no FFmpeg time was spent) — a harmless, disposable staging-only cost, consistent with prior qualification rounds on this same QA account.

## Migration & release-file-list notes

- New migration `20260827180000_audio_blueprint_hash_phase9b2b` — single additive nullable column, applied to staging via `prisma migrate deploy`, statically diff-verified against Prisma's own generated SQL beforehand.
- `migration_lock.toml` remains **excluded** from the release file list (confirmed via `git status --short` — still untracked), per the standing guardrail from the prior round.
