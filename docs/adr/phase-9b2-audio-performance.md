# ADR: Phase 9B.2 Audio & Performance Layer

**Status:** Proposed (staging-qualified, GO recommendation issued; awaiting explicit production release decision)
**Date:** 2026-08-27

## Context

Movie Builder (Phase 9B.1/9B.1A) assembles visual shots into a silent MP4. Raivstream needs a first-class audio/performance layer — narration, dialogue, ambience, SFX, music — without becoming a full audio-generation or DAW project in this phase.

## Decision

1. **Audio is a separate creative layer, not a movie attribute.** New models (`AudioPerformancePlan`, `AudioTrack`, `AudioCue`, `VoiceProfile`, `AudioPlanVersion`, `AudioAsset`) are additive to the schema; nothing existing is replaced.
2. **Canonical timing authority stays with Film Blueprint.** A new `computeCanonicalShotTimeline()` derives per-shot start/end times from `durationSeconds` (screen time), explicitly independent of FFmpeg transition/xfade render handles. Audio cues attach to this canonical timeline.
3. **The render snapshots both Blueprints.** `MovieRenderJob` gained two nullable columns (`audioBlueprintSnapshot`, `audioPlanVersionId`); a render is immutable once started, proven live by editing a live plan post-render and confirming the completed job's snapshot didn't change.
4. **FFmpeg mixing is a new, isolated two-stage pipeline** (mix → mux), never touching the existing silent-video encode path. The existing visual FFprobe READY gate is extended, not weakened, with a parallel audio-specific gate that fails closed (`OUTPUT_AUDIO_STREAM_MISSING`) if the blueprint expected audio and none was produced.
5. **No TTS/generation provider is implemented.** `VoiceProfile.voiceRef` is a provider-neutral handle; a fail-closed credit-rate interface boundary (`story:speech_generation`, `story:audio_generation`) exists for future use, generalized from the already-proven `resolveMovieRenderCreditRate` pattern without touching that function.
6. **R16 exclusion is enforced twice** — client-side tab hiding (`hideOnR16: true`) and, newly, a server-side guard (`assertSequenceAllowed`) on every Audio mutation, matching the guard already protecting Sequence.

## Consequences

- **Positive:** Movie Builder can render real audiovisual output today using uploaded/synthetic audio, with deterministic, versioned, snapshot-immutable creative intent. Silent-film behavior is provably unaffected (existing tests pass unmodified).
- **Negative / deferred:** No self-serve `AudioAsset` upload API/UI yet (assets currently require direct insertion — matching how a future upload endpoint would populate the same table). Ducking and multi-cue overlap are verified via pure-function tests and blueprint computation, not yet exercised together in one live multi-cue render.
- **Risk accepted:** The historical migration chain cannot replay against a genuinely blank database (pre-existing repo characteristic, not introduced here); the qualification instead proved the new migration applies cleanly to an already-correctly-migrated database — the actual production scenario.

## Alternatives considered

- **One MP3 field on `MovieRenderJob`** — rejected per brief §2: does not support multiple simultaneous layers, independent editing, or versioning.
- **Coupling to a single TTS provider now** — rejected per brief §27: would lock in a vendor before the architecture is proven, and is explicitly out of scope for this phase.

## Addendum (Phase 9B.2B — pure-rendering + persistence checkpoints)

Item 3's "proven live" claim above (render snapshot immutability) predates the canonical-runtime pad/trim fix and was re-verified against the fixed code; item 4's isolated mixing pipeline was found to have a real gap (a short/late cue could truncate the final video via `-shortest`) and was fixed without becoming a rewrite — `buildMixFilterGraph` gained one additional always-applied final stage. A new `MovieRenderJob.audioBlueprintHash` column and write+render-time `AudioAsset` project-ownership checks were added, both additive. Full detail: `docs/operations/phase-9b2-pure-rendering-checkpoint.md`, `docs/operations/phase-9b2b-persistence-checkpoint.md`.
