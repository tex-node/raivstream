# Phase 9B.2B — Immutable Audio A/B Render Snapshot Qualification

**Status:** PASSED, end-to-end, over the real storage path. Proves `MovieRenderJob` snapshots audio deterministically at creation time, that later Audio Plan edits cannot mutate an existing render, and that render identity — and reuse — change when audio identity changes.
**Script:** `packages/api/scripts/phase9b2b-audio-ab-snapshot-qualification.ts` (real DB via `appRouter.createCaller`, a real disposable object uploaded to the app's actual R2 bucket, and a **real, unmocked execution** of `executeMovieRenderJob` — actual ffmpeg, no `commandRunner` override), `scripts/phase9b2b-ab-snapshot-reload-check.ts` (separate-process reload proof), `scripts/phase9b2b-ab-snapshot-cleanup.ts` (teardown, including the R2 object).
**Executed against:** the isolated staging Postgres (`raivstream_phase9b2_pg`) used throughout Phase 9B.2 — `verify-staging-db.js` run and passed immediately before every DB-touching step. **No commit, push, or deploy performed**, per standing instruction. **No renderer/worker code changed** — only the qualification scripts.

## Revision note: the fixture, not the renderer, was fixed

An earlier pass of this checkpoint used a synthetic `AudioAsset` whose `storageKey` pointed at an object that was never actually uploaded, then blanked the `R2_PUBLIC_URL` env var to force `getPublicUrlForKey` to return `null` so the worker would fall through to the asset's `publicUrl` (a `data:` URI) instead of 404ing. That was correctly rejected on review: it exercised an unrelated fallback path instead of the real storage path, and — more importantly — risked normalizing "trust a canonical `storageKey`, then silently substitute something else when the real object is missing" as acceptable worker behavior, which would undermine the exact snapshot-identity guarantee this checkpoint exists to prove. **No worker code was ever changed to add such a fallback** — the earlier attempt only manipulated environment state in the test script, but the instinct (lean on a fallback rather than fix the fixture) was itself the wrong direction, and is corrected here.

**Fix:** the fixture is now a **real disposable audio object**, generated locally and uploaded through the app's own `uploadBufferToR2` helper — the same function real audio uploads use — into the actual R2 bucket, under a uniquely-tagged, obviously-disposable key. The worker resolves it exactly as it resolves any real asset: canonical `storageKey` → `getPublicUrlForKey` → real R2 URL → real download → real probe. No env manipulation, no fallback path exercised, no worker semantics touched.

## Isolation

Fully isolated on a throwaway `StorySequence` ("Phase9B2B A/B Snapshot Qualification (disposable)") that **clones** (read-only, never mutates) the shared QA project's one proven-working enabled scene, rather than reusing the shared sequence's audio plan — the shared plan carries an unrelated stale-asset track from earlier rounds that the (correctly) strict worker would fail the whole render over. There is no isolated staging *object-storage* bucket — staging and production share the exact same R2 bucket, credentials, and public URL (confirmed via `.env` diff) — so uploading (and deleting, on cleanup) one small, uniquely-keyed, disposable QA-scoped audio object through the app's real storage helper was explicitly authorized by the user for this checkpoint. All rows and the one R2 object this checkpoint created were removed afterward and independently verified absent.

## Fixture verification (before Render X is ever created)

To let the report distinguish a *fixture/storage* failure from a *snapshot/worker* failure, the uploaded object is independently checked twice before any render is created:

1. **Local, pre-upload probe** of the freshly-synthesized WAV (`probeAudioAsset` on the local file) — confirms the fixture itself is valid audio before it ever touches storage.
2. **Post-upload, independent round-trip** — after `uploadBufferToR2` returns, the storage key alone is re-derived into a URL via `getPublicUrlForKey` (confirmed identical to the upload response's URL — proving the stable key, not the transient response, is what resolves the object), the object is fetched fresh over the network, and the *downloaded* copy is independently probed:

```json
{
  "step1c_fixture_upload": {
    "storageKey": "story-projects/<qa-project>/audio/ab-qualification/1787950255939-uy75ny.wav",
    "uploadedPublicUrl": "https://pub-c675....r2.dev/story-projects/<qa-project>/audio/ab-qualification/1787950255939-uy75ny.wav",
    "rederivedUrl": "https://pub-c675....r2.dev/story-projects/<qa-project>/audio/ab-qualification/1787950255939-uy75ny.wav",
    "rederivedMatchesUploaded": true
  },
  "step1d_fixture_independent_verification": {
    "fetchStatus": 200,
    "hasAudioStream": true,
    "durationSeconds": 4,
    "matchesExpectedDuration": true
  }
}
```

The `AudioAsset` row is persisted with `storageKey` = this real key and `publicUrl` = the real CDN URL returned by the upload (no `data:` URI anywhere this round). Per the "only the stable key enters identity" requirement, the snapshot check below confirms the cue's snapshot carries `storageKey` but never a `publicUrl` field.

## Scenario and results, step by step

**1–2. Visual Film Blueprint V + Audio Plan A.** One cloned scene (4.0s canonical runtime), one MUSIC track, one cue (`audioAssetId` → the real uploaded `AudioAsset` above, `volume: 0.9`).

**3–5. Render X created, execution delayed.** `createMovieRender` called with `MOVIE_RENDER_WORKER_DISABLED=true` for that one call only (real gate: gates `queueMovieRenderJob`'s enqueue, not a direct `executeMovieRenderJob` call). Job X captured `status: QUEUED` — proving nothing executed yet.

**H(A)** (`hashAudioBlueprint`, live-computed and independently re-derived from the stored `audioBlueprintHash` column — identical):
```
2a64cbbd20ac755f101c9d671432a806734d6b694ef05e6b89dadcac729965e6
```
Render X's identity/idempotency key (`renderPlanHash`, from `combineRenderHash`):
```
37a90e74c2f590e8764037ecadd8fdb56436730a8caf85caf2314b9565031f35
```
Snapshot allowlist check at creation time: `cueA_in_snapshot.storageKey` equals the real uploaded key exactly, and the cue object has **no** `publicUrl` field at all (`snapshotContainsOnlyStableKey: true`) — the transient public/CDN URL never enters the snapshot or the hash, only the stable key does.

**6–7. Live plan mutated to B** (cue volume 0.9 → 0.3 — a field inside canonical audio identity).

**H(B):**
```
4672b3f54270854399f143089a1e13725e5f449b21a012965e7c9616edf03e9c
```
`H(A) != H(B)` — confirmed (`differs: true`).

**8–9. Render X executed for real, end-to-end, over the real storage path.**

- **Result: `READY`.** With a genuinely-uploaded fixture and R2 fully available throughout (no env manipulation this time), the real, unmocked execution completed every stage cleanly: `queued → preparing → rendering_shot_1 → assembling → verifying_output → mixing_audio → uploading_to_r2 → ready`. Zero audio-typed error codes encountered.
- **Static proof:** the worker source (`movieRenderWorker.ts`) contains zero call sites for `getAudioPlan(`, `audioPerformancePlan.findFirst`, or `buildAudioBlueprint(` — structurally incapable of reading the live plan.
- **Live proof #1 — snapshot immutability:** Job X's own persisted `audioBlueprintSnapshot`, re-read from Postgres **after** the live plan had already moved to B, still shows the cue's `volume: 0.9` (`snapshotUnchangedDespiteLiveEdit: true`).
- **Live proof #2 — real MovieAsset provenance:** the finished `MovieAsset`'s `metadata.audioVerification.inputAssetProbes` records exactly `["<cueA's own id>"]` — `matchesCueA: true`, `hasAudio: true`, `audioVerification_present: true`. This is a direct, DB-persisted record that the exact snapshot cue identity (not anything re-derived from the live plan, which was at volume 0.3 by the time this ran) was what actually got downloaded, probed, and mixed.

**10–11. Render Y created from live plan B.**

Render Y's identity:
```
79022cffaa75ce4949e1d9a533bd75ba4a6d330bb4b3c651d50754f3b4d323dd
```
`renderPlanHash_X != renderPlanHash_Y` — confirmed. **Visual V + Audio A → X, Visual V + Audio B → Y, X != Y.**

**12. Re-submit Visual V + Audio A (live cue reverted to A's exact value).**

With X genuinely `READY` this time, reuse fires for real — not just identity-equality:
```json
{
  "reused": true,
  "jobId": "cmtdff3ns000hxvpaj7y1gvmb",
  "matchesX_byRowId": true,
  "replayRenderPlanHash": "37a90e74c2f590e8764037ecadd8fdb56436730a8caf85caf2314b9565031f35",
  "matchesX_byIdentity": true,
  "matchesY_byIdentity": false
}
```
The resubmission **reused job X's own row** (`matchesX_byRowId: true`), and its identity matches X exactly, not Y — proving reuse under the existing rules picks up X specifically, not B's identity or a third unrelated one.

**13. Live plan mutated again after Y exists (0.3 → 0.5 → reverted to 0.9 for a clean final state).**

Y's stored snapshot, re-read after the further edit: `volumeInY_snapshot: 0.3` — still exactly B's value (`stillMatchesOriginalB: true`), untouched by the later 0.5 edit.

**14. Persistence / separate-process reload.** `phase9b2b-ab-snapshot-reload-check.ts`, run as a genuinely separate `node`/Prisma process against the same jobIds:

| | status | stored `renderPlanHash` | stored `audioBlueprintHash` | cue volume in snapshot |
|---|---|---|---|---|
| Job X (fresh read) | `READY` | `37a90e74…31f35` | `2a64cbbd…9965e6` | `0.9` |
| Job Y (fresh read) | `QUEUED` | `79022cff…d323dd` | `4672b3f5…f03e9c` | `0.3` |

Identical to the values captured mid-run — full persistence confirmed independent of process lifetime, including the render's real `READY` outcome.

**15. Snapshot field allowlist.** Recursive scan of both `audioBlueprintSnapshot` JSON blobs for every forbidden field (`signedUrl`, `downloadUrl`, `tempFile`, `temporaryPath`, `workerId`, `resolvedAt`, `requestMetadata`, `publicUrl`, `url`): **zero hits.** Cue keys present are exactly the allowed stable-identity set: `text, cueId, volume, storageKey, audioAssetId, fadeInSeconds, duckingEnabled, endTimeSeconds, fadeOutSeconds, trimEndSeconds, voiceProfileId, duckingAmountDb, sequenceSceneId, startTimeSeconds, trimStartSeconds, characterMemoryId, performancePreset, performanceDirection`.

**16. Cross-project/tamper defense.** Full suite re-run this round (see Test totals) — all ownership/provenance tests (`audioAssetOwnership.test.ts` 5/5, the storage-key-mismatch/positive-control tests inside `movieRenderWorkerAudio.test.ts`) still green, unchanged. No worker fallback semantics were altered — the strict resolution order (asset exists → project matches → storage key exists → snapshot key matches canonical DB key → resolve → download → probe) is exactly what qualified this render; nothing about it was relaxed to make this checkpoint pass.

## Test totals

- **API typecheck** (`tsc --noEmit`): clean, 0 errors.
- **Web typecheck** (`tsc --noEmit`): clean, 0 errors.
- **Full API test suite:** **118/118 passed**, 15/15 test files — including `audioAssetOwnership.test.ts` (5), `audioPlanning.test.ts` (23), `audioMixing.test.ts` (25), `movieRenderWorkerAudio.test.ts` (12), `movieRenderWorker.test.ts` (2), `movieRenderPlanning.test.ts` (8), `audioCreditGate.test.ts` (6), `movieRenderCreditGate.test.ts` (6), plus all pre-existing suites.
- **8-scenario real-ffmpeg checkpoint:** not re-run this round — no renderer/library code changed (only qualification scripts under `packages/api/scripts/` were added/edited this round; `movieRenderWorker.ts`, `audioMixing.ts`, `audioPlanning.ts`, `r2.ts` are untouched relative to the prior round's already-qualified 8/8 result).

## Defects found

None. The audio/render-identity logic under test passed cleanly over the real storage path with no code changes required. The only thing that needed correcting was the qualification fixture itself (see revision note above) — a test-authoring issue, not a product defect.

## Addendum: diagnostic tooling, and closing the "was it the image asset?" question

After this checkpoint passed, a follow-up review raised a fair concern: with three separate asset paths in play (cloned scene → visual image asset; synthetic `AudioAsset` → audio storage key; finished MP4 → output upload), had the diagnosis actually distinguished which one was failing at each point, or inferred it from URL shape? In direct response, `packages/api/scripts/check-failed-job-stage.ts` was added — a permanent, read-only diagnostic script that reports, from persisted data alone (never from URL shape or asset-record contents):

1. `MovieRenderJob` — status, errorCode, sanitized errorMessage, rendererVersion, expected vs. actual/probed duration.
2. `MovieAsset` — whether one exists, its `storageKey`, readiness metadata.
3. Snapshot — Film Blueprint shot/asset ids, Audio Blueprint cue `audioAssetId`/`storageKey`, audio fingerprint/hash.
4. Stage classification (A–I: visual download → visual assembly → audio validation → audio download → audio probe/normalize → mix/mux → final FFprobe gate → R2 upload), derived only from the job's persisted `MovieRenderEvent` stage history plus its `errorCode`/`errorMessage` prefix.
5. The full raw event history as the evidence trail.

**Validated against a real failure, not just written and trusted:** a one-off disposable job (`phase9b2b-diagnostic-demo-broken-fixture.ts`, not part of the qualification — its own throwaway sequence, cleaned up immediately after) was deliberately built with a broken audio fixture (a `storageKey` that was never uploaded — the exact shape of the original bug). Run against it, `check-failed-job-stage.ts` correctly reported:

```json
{
  "bucket": "D",
  "label": "audio download",
  "basis": "currentStage=mixing_audio, errorMessage starts with \"Failed to download render source\""
}
```

This run also caught a real bug in the script's first draft: it read `job.currentStage`, which `failJob()` overwrites to `\"failed\"` on the way out, so the classifier initially reported `bucket: \"unknown\"` for every failure. Fixed by deriving the failing stage from the last non-terminal `MovieRenderEvent` instead — a script bug, not a renderer bug; no renderer/worker/R2-helper code was touched by this fix.

**On the visual/image-asset question specifically:** this run's own event history (and every prior run this session, including the two that failed for audio-only reasons and the final one that reached `READY`) shows `rendering_shot_1` and `assembling` completing cleanly before any failure, all using the same cloned image asset (`cmtb8zln2002r9s38m8rprp6y`). That asset was also independently confirmed reachable via a direct `HEAD` request earlier in this work. Tracing the code confirms *why* `R2_PUBLIC_URL` was never going to affect it either way: the visual path resolves `shot.sourceUrl` from `StorySceneAsset.assetUrl`/`thumbnailUrl` (`movieRenderPlanning.ts:158`) — a URL stored directly on the asset row — while only the *audio* path resolves through `storageKey` → `getPublicUrlForKey()` (env-dependent). These are structurally different resolvers; the two were never conflated in this checkpoint's actual failures, both of which were confirmed (via this stage classifier, applied retroactively to the original event logs) to be `mixing_audio`-stage / audio-only.

## Cleanup

All rows and the one R2 object created by this checkpoint's final run were removed and independently re-verified absent:
- `throwawaySequenceId=cmtdff2ce0001xvpa8lg5amgz` (cascading its scene/plan/track/cue/versions/jobs) — deleted, confirmed 0 remaining.
- `assetId=cmtdff3kl000axvpavenym803` — deleted, confirmed 0 remaining (aside from one pre-existing `SYNTHETIC_TEST` `AudioAsset` from an earlier round's fixture work, unrelated to this checkpoint — created 2026-08-27, still referenced by a real cue).
- `story-projects/<qa-project>/audio/ab-qualification/1787950255939-uy75ny.wav` — deleted from the real R2 bucket via `DeleteObjectCommand`, confirmed gone via a follow-up `HeadObjectCommand` (404), and independently re-confirmed via a `ListObjectsV2` scan of the `ab-qualification/` key prefix returning zero objects.

Two earlier-round leftover runs from this same debugging session (using the since-superseded `data:`-URI fixture approach) were also found and cleaned up before the final run.
