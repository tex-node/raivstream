# Audio & Performance Layer — Architecture (Phase 9B.2)

## Conceptual hierarchy

```
Story
  ↓
Scenes
  ↓
Sequence / Film Blueprint        (canonical visual timeline — owns runtime)
  ↓
Audio & Performance Plan         (audio/performance intent — fits within the timeline)
  ↓
Audiovisual Render Plan          (Movie Builder consumes both)
  ↓
Movie
```

The Sequence/Film Blueprint is the **sole authority on canonical runtime**. The Audio Plan never redefines it — `buildAudioBlueprint()` always reports `runtimeSeconds` copied directly from the Film Blueprint, never independently derived from cue end-times.

## Runtime semantics — the critical invariant

`StorySequenceScene.durationSeconds` represents finished-film screen time. Transitions use overlapping *render* handles that never change canonical runtime (`transitionRule: 'overlap_transitions_do_not_add_runtime'`, established in Phase 9B.1A). Audio cues attach to this same canonical timeline, computed by `computeCanonicalShotTimeline()` (`packages/api/src/lib/sequencePlanning.ts`): cumulative sum of `durationSeconds + holdDurationSeconds` over enabled shots in order — **never** derived from `MovieRenderPlanShot.renderDurationSeconds`, which is a render-only concept that bakes in xfade overlap for FFmpeg's benefit and must never leak into audio timing.

## Schema (additive only)

- `AudioPerformancePlan` — one active plan per `StorySequence` (found via `findFirst` on `{ sequenceId, status: { not: ARCHIVED } }`, mirroring `StorySequence`'s own convention — no unique DB constraint, same pattern).
- `AudioTrack` — `type` ∈ `NARRATION | DIALOGUE | AMBIENCE | SFX | MUSIC`, `enabled`, `volume`, `order`.
- `AudioCue` — canonical `startTimeSeconds` (never render-derived), optional links: `sequenceSceneId` (SetNull), `characterMemoryId` (SetNull), `voiceProfileId` (SetNull), `audioAssetId` (SetNull). Speech fields (`text`, `performancePreset`, `performanceDirection`) only meaningful on NARRATION/DIALOGUE. `duckingEnabled`/`duckingAmountDb` on any cue, applied only if the track type is duckable.
- `VoiceProfile` — provider-neutral (`voiceRef`, not a raw provider model id), optionally linked to a `StoryCharacterMemory` for continuity across scenes; cue-level `voiceProfileId` can override.
- `AudioPlanVersion` — immutable snapshot (`@@unique([planId, versionNumber])`), `versionNumber` always `max(existing) + 1` via `nextAudioVersionFromExisting()` — restoring never reuses a number (the exact Phase 9A bug class, explicitly guarded against).
- `AudioAsset` — uploaded/synthesized audio file metadata (R2 key, mime type, duration, size, checksum, sample rate, channels). No `createAudioAsset` API exists yet in this phase (known limitation, see qualification report §21).
- `MovieRenderJob.audioBlueprintSnapshot` (nullable Json) and `MovieRenderJob.audioPlanVersionId` (nullable) — the render's frozen audio state. Both null for a silent film; the existing silent-film code path is completely untouched.

Provider-specific fields (TTS provider name, model id) are deliberately **absent** from the creative model — they belong only in future generation-execution records, per brief §5.

## Audio Blueprint

```ts
{
  blueprintVersion: 'phase-9b2-v1',
  runtimeSeconds,       // = Film Blueprint runtime, always
  hasAudio,             // true iff any enabled track has any enabled cue
  tracks: [{ trackId, type, name, volume, order, cues: [...] }],
  duckingWindows: [{ startTimeSeconds, endTimeSeconds, amountDb, sourceCueId }],
}
```

`buildAudioBlueprint()` (`audioPlanning.ts`) excludes disabled tracks/cues entirely, and returns a fresh deep copy — mutating the caller's input after the call never changes a previously-returned blueprint (verified by test, and load-bearing for render-snapshot immutability).

`duckingWindows` are derived purely from NARRATION/DIALOGUE cues with `duckingEnabled: true` — a pure function of cue timing, no I/O, no randomness (`computeDuckingWindows`).

## Film Blueprint integration and render snapshot

`createMovieRender` (extended, not rewritten):

1. Resolves the current Audio Plan (if any) for the sequence — a **read-only** lookup, never mutates Audio* tables (Movie Render Independence, §35).
2. Builds the Audio Blueprint from the live tracks.
3. Combines the visual `renderPlanHash` with the audio blueprint's own hash via `combineRenderHash()` — silent films get the **exact unchanged** hash (zero behavior change for every pre-existing render); audio-bearing renders get a hash that changes if *either* the visual or audio plan changes, so `findReusableMovieRender` never incorrectly serves a stale audio mix.
4. Stores the blueprint as `audioBlueprintSnapshot` on the job row (Json column — copy-on-write by construction; later Audio Plan edits can never retroactively change it).

## FFmpeg audio mixing (`audioMixing.ts`)

Two-stage pipeline, mirroring the existing render-shots → assemble precedent:

1. `buildMixedAudioTrack` — one `filter_complex` graph mixing every resolved cue (trim → `adelay` to canonical start → base volume → ducking `volume=enable='between(t,...)'` segments on duckable tracks only → fades) via `amix` + a conservative `alimiter` safety ceiling (no loudness mastering, per §24) → single AAC file.
2. `muxAudioWithVideo` — stream-copies the existing silent H.264 MP4 with the mixed AAC track (`-c:v copy -c:a copy -shortest`). The visual encode from Phase 9B.1 is never re-touched.

Both stages use the same `CommandRunner` injection pattern as the existing `movieRenderWorker.ts` — local tests mock it (matching the existing `movieRenderWorker.test.ts` convention), real `ffmpeg`/`ffprobe` binaries run only where actually installed (VPS staging/production).

## FFprobe audio READY gate — extended, not weakened

The existing visual verification (duration/dimensions/fps/codec/file-size, unchanged) runs first, exactly as before. Only if `audioBlueprintSnapshot.hasAudio` is true does a second, audio-specific probe run (`probeAudioStream` + `assertAudioReadyGate`): stream existence, codec, sample rate, channels, duration-compatible-with-video. If audio was expected but the mux produced none, the render throws `OUTPUT_AUDIO_STREAM_MISSING` and **never reaches READY** — verified live and via a mocked worker test.

## Silent films

Untouched. `audioBlueprintSnapshot` is null, `cuesWithSource.length === 0`, the entire mixing branch is skipped, and the original silent-film code path (verification, checksum, upload) runs byte-for-byte as it did before Phase 9B.2 — both pre-existing `movieRenderWorker.test.ts` tests still pass unmodified.

## R16

Client-side: the Audio tab carries `hideOnR16: true`, identical to Sequence and Film. Server-side: every Audio mutation (`addTrack`, `updateTrack`, `addCue`, `updateCue`, `removeCue`, `duplicateCue`, `listVoiceProfiles`, `createVoiceProfile`, `updateVoiceProfile`) and `ensureAudioPlanOwnership` (covering version/plan procedures) now call `assertSequenceAllowed(ctx)` — the exact same guard function already protecting Sequence procedures, not a new/different one.

## Credit boundary

`story:movie_render` unchanged (100, unmodified). Two new fail-closed interface-boundary keys exist for future use — `story:speech_generation`, `story:audio_generation` — via a new generic `resolveFeatureCreditRate()` (added alongside, not replacing, the already-proven `resolveMovieRenderCreditRate`). No production rate is configured for either; any future paid operation using them inherits the same fail-closed pattern (missing/inactive/zero rate ⇒ rejected, zero side effects) proven for Movie Builder.

## Analytics

15 new event names added to `STORY_ANALYTICS_EVENTS` (a plain string-literal array, not a Prisma enum — matching existing convention). No dialogue/narration text or secrets are ever logged.
