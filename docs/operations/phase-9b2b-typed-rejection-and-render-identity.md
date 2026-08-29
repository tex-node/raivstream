# Phase 9B.2B — Typed Asset Rejection, Hash Purity, Render Identity Re-verification

**Status:** PASSED. 112/112 tests, both live checkpoints re-run clean on real Postgres + real ffmpeg.

## The layering, made explicit

```
Persisted cue          -> audioAssetId
Resolved Audio Blueprint -> audioAssetId + stable storageKey
Worker execution        -> storageKey -> runtime URL/local file (resolved only here, never persisted)
```

The browser never supplies a `storageKey` — cues only ever carry a client-writable `audioAssetId`; `storageKey` is always server-resolved, either at blueprint-build time (`resolveProjectAudioAssets`, project-scoped) or independently re-verified at render time. No signed URL is ever persisted into the blueprint, the render snapshot, or an `AudioPlanVersion` row — R2 URLs in this codebase are permanent (`${R2_PUBLIC_URL}/${key}`), and the blueprint's `AudioBlueprintCue` type has no URL-shaped field at all to accidentally carry one (enforced by a test that enumerates the resolved cue's own keys).

## 1. Typed rejection, not a silent downgrade

`buildAudioBlueprint` now distinguishes two conditions that were previously conflated:

| Condition | Before | Now |
|---|---|---|
| `audioAssetId` was never set (speech intent, no audio yet) | `audioAssetId: null` on the cue, nothing else | Unchanged — still silent, still expected, still WARNING-severity via `summarizeUnmaterializedSpeechCues` |
| `audioAssetId` was set but not in the caller's project-scoped map (foreign/invalid reference) | Silently identical to the row above | `audioAssetId`/`storageKey` still come back null on the cue, **but** a typed entry is recorded: `{ cueId, audioAssetId, code: 'AUDIO_ASSET_PROJECT_MISMATCH' }` in the new `AudioBlueprint.rejectedAudioAssetReferences` array |

`summarizeUnmaterializedSpeechCues` now explicitly excludes rejected cueIds from its "N cues don't have audio yet" count — the two conditions get two distinct signals, never merged into one message. `createMovieRender`'s analytics event now carries `rejectedAudioAssetReferenceCount` for production observability, separate from `hasAudio`.

## 2. Hash purity

`hashAudioBlueprint` now explicitly strips `rejectedAudioAssetReferences` before hashing — diagnostic metadata about what failed to resolve must never move the render-reuse/idempotency key, only the resolved creative identity does. Proven by test: a cue that never had an asset and a cue whose asset was rejected end up with the *exact same resolved shape* (`audioAssetId`/`storageKey` both null) and hash identically, even though one produced a rejection entry and the other didn't.

The hashed content was already URL-free by construction (the blueprint type never carries a URL field), so no change was needed there — just a test making that guarantee explicit (`Object.keys()` on a resolved cue excludes `signedUrl`/`downloadUrl`/`publicUrl`/`temporaryPath`/`resolvedAt`/`url`).

## 3. Worker: confirmed cross-project reference now FAILS the whole render

This is a deliberate behavior change from the previous round. Previously, a tampered cue was silently dropped (selective skip, render still `READY`). Now: the worker issues a second, deliberately **unscoped** existence check (no `projectId` in the WHERE clause) for any `audioAssetId` its project-scoped query didn't resolve — this is what makes the same distinction as `buildAudioBlueprint`, but with real DB truth instead of a pre-built map:

- Exists nowhere at all (deleted, or never existed) → unremarkable, same as an unmaterialized cue, render proceeds.
- Exists, but for a different project → `AUDIO_ASSET_PROJECT_MISMATCH` is thrown, the whole job goes `FAILED`, **never** `READY`. Nothing gets downloaded — not even a legitimate cue on the same track, since the mismatch is detected before the mixing/download loop runs at all.

New error code mapped in `failJob`'s prefix-based extraction, same pattern as `OUTPUT_AUDIO_STREAM_MISSING`.

## Mandatory tests — all present

1. `buildAudioBlueprint`, same-project asset → resolves, returns `storageKey`, `rejectedAudioAssetReferences` empty. (`audioPlanning.test.ts`)
2. `buildAudioBlueprint`, foreign-project asset → typed rejection recorded, cue's `audioAssetId`/`storageKey` both null. (`audioPlanning.test.ts`)
3. Worker: snapshot contains a valid `audioAssetId` for a real, confirmed-foreign asset → `FAILED`, never `READY`, nothing fetched. Companion test: a genuinely nonexistent `audioAssetId` is NOT treated as a mismatch — render still succeeds. (`movieRenderWorkerAudio.test.ts`)

Plus: hash-purity tests, the distinct-condition test for `summarizeUnmaterializedSpeechCues`, and mock upgrades (both the worker test file and the real-ffmpeg checkpoint script's mocks now correctly support the worker's two-query pattern — scoped and unscoped — matching real Prisma semantics for an omitted `projectId` filter).

## `updateCue` nullable semantics — re-verified, unchanged

```
audioAssetId === undefined -> leave existing asset unchanged
audioAssetId === null      -> clear asset
audioAssetId === string    -> verify same project, then assign
```

Already implemented explicitly in the prior round (`story.ts`); re-checked this round, intact, no drift.

## Render identity & immutable snapshot path — re-verified live, still holds

The exact invariant flagged as the next highest-value checkpoint was already proven live in the prior round (`phase-9b2b-persistence-checkpoint.md`); re-run this round specifically because `hashAudioBlueprint`'s content changed (now excludes `rejectedAudioAssetReferences`) — needed to confirm that didn't silently break anything:

```
Visual V + Audio A  -> render hash H1 -> snapshot A
Visual V + Audio B  -> render hash H2 (≠ H1) -> snapshot B
Visual V + Audio A (reverted, byte-identical) -> reuses H1 / job X again
```

Live output, unchanged from before: `hashX_equals_hashY: false`, replay-before-edit reuses X, edit-to-B creates a new job Y, replay-B reuses Y, revert-to-A reuses X again, and X's persisted `audioBlueprintSnapshot` never moved after the live plan changed. `audioBlueprintHash` (the standalone provenance column) confirmed still populated.

## Live re-verification, both checkpoints

- **8-scenario real-ffmpeg checkpoint**: 8/8, `hasAudio: true` on every non-silent scenario, `0s` delta on every scenario, real aac/44100/2ch data confirmed. (`docs/operations/phase-9b2-pure-rendering-checkpoint-results.json`, re-saved.)
- **Persistence checkpoint**: idempotency/snapshot, version numbering (`1,2,3`), and both ownership cases (allowed/denied) all re-run clean against real Postgres. Zero leftover rows after cleanup.

## Test suite

**112/112 tests passing, 15 files** (up from 103 — +9: 6 new in `audioPlanning.test.ts`, replaced 1 worker test with 2 in `movieRenderWorkerAudio.test.ts`).
