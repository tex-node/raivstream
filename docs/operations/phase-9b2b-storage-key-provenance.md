# Phase 9B.2B — Snapshot `storageKey` is Provenance, Not Authority

**Status:** PASSED. 116/116 tests, both live checkpoints re-run clean.

## The fix

Two rounds ago the worker was changed to *prefer* the snapshot's `cue.storageKey`; last round that was reversed to *always use the DB-trusted key, silently*. Both were wrong in the same direction: neither treated a disagreement between the two as worth reporting. This round adds the missing step:

```
snapshot cue.audioAssetId
        ↓
DB AudioAsset lookup
        ↓
verify asset.projectId === job.projectId        -> AUDIO_ASSET_PROJECT_MISMATCH
        ↓
take canonical DB storageKey                    -> AUDIO_ASSET_STORAGE_KEY_MISSING (if absent)
        ↓
compare against snapshot storageKey (if present) -> AUDIO_ASSET_STORAGE_KEY_MISMATCH (if it disagrees)
        ↓
resolve runtime URL using getPublicUrlForKey()
        ↓
download / probe / normalize
```

Silent substitution would let the actual render input differ from what an immutable snapshot claims while the job still reports the original provenance — undermining the A/B snapshot guarantee. A disagreement is now a typed, loud failure (`AUDIO_ASSET_STORAGE_KEY_MISMATCH`) instead. A snapshot with no `storageKey` at all (older snapshots, or a cue the blueprint-builder never resolved one for) has nothing to compare against and is not a mismatch — proceeds normally using the canonical DB value.

## Lifecycle assumption, documented not solved

This whole sequence depends on `AudioAsset.storageKey` being immutable for the row's lifetime — nothing in this codebase updates it in place. If storage migration is ever needed (re-encoding, bucket moves), it must create a new asset identity/version rather than mutate an existing row's key — otherwise a strict mismatch check here would make every already-queued or retried render referencing the old key permanently unrenderable. Recorded as a comment directly at the check site in `movieRenderWorker.ts`, not solved.

## Tests — strengthened to prove the pipeline never executes past the failure

The mismatch test no longer just checks the error code — it proves the pipeline dead-stops at step 5.5 with call-count assertions on every downstream stage:

```
snapshot: audioAssetId=asset-1, storageKey=audio/project-a/original.wav
DB:       asset-1, projectId=project-a, storageKey=audio/project-a/replaced.wav
```
→ `FAILED` / `AUDIO_ASSET_STORAGE_KEY_MISMATCH`, `MovieAsset.create` calls = 0, audio download calls = 0 (isolated from the video shot's own unconditional data: URI fetch), `normalize` calls = 0, `mix` calls = 0, `mux` calls = 0.

Three companions, all in `packages/api/src/lib/__tests__/movieRenderWorkerAudio.test.ts` via a shared `makeSnapshotVsDbFixture` fixture builder and a new `makeTrackingCommandRunner` (counts ffmpeg calls by output-path shape: `.normalized.wav` / `mixed-audio.m4a` / `movie-with-audio.mp4`) and `trackFetch` (separates the audio asset's own download attempts from the video shot's always-runs-first fetch):

- **DB `storageKey: null` even though the snapshot has one** → `AUDIO_ASSET_STORAGE_KEY_MISSING` (step 5 catches this before step 5.5's comparison even runs) — same zero-download, zero-`MovieAsset` proof.
- **Snapshot key === DB key** (positive control) → downloads exactly that canonical key, `normalize`/`mix`/`mux` each run exactly once, reaches `READY`.
- **Snapshot has no `storageKey` at all** (predates the field) → nothing to compare, proceeds normally using the canonical DB value (unchanged from last round).

**118/118 tests, 15 files** (up from 116 — `movieRenderWorkerAudio.test.ts` now 12). Both live checkpoints re-run clean after this round too — the checkpoint script's own fixtures never set a snapshot `cue.storageKey`, so nothing there needed changing, and the worker code itself wasn't touched this round (only test rigor was).

## The architectural gain

The render snapshot is no longer merely advisory. It is now a verified provenance contract: `snapshot identity == current canonical asset identity, or the render fails`. This is strictly better than silent substitution — silent substitution would let an old render job go on claiming it rendered Asset A while it actually rendered whatever later replaced it at that id.

Per the reviewer's explicit instruction, worker work stops here unless a future test exposes a further concrete defect. Next: the visible Audio Workspace UI slice.
