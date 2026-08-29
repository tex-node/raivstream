# Raivstream Roadmap

## Current Story Playground Baseline

Production has the Alpha creative loop:

- Story Spark
- Guided questions
- Story generation and continuation
- Story Workspace
- Story DNA
- Character Director
- Scene Director
- Creative Specification
- Prompt Compiler
- Image generation
- Creative Critic
- Asset Manager
- Storybook Viewer
- Analytics and admin insights

Phase 8B Creative Critic is production-complete. Phase 8B.2 staging qualification verified RunPod/R2/OpenAI critic behavior, retry idempotency, credit policy, R16 hiding, and Storybook exclusion of creatively rejected assets.

## Phase 9A: Sequence Workspace and Timeline Editor

Status: PRODUCTION COMPLETE.

Phase 9A introduces a filmmaking workspace:

- Story Workspace `Sequence` tab for non-R16 creators
- Canonical edit decision list via `StorySequence`
- Timeline entries via `StorySequenceScene`
- Immutable milestones via `SequenceVersion`
- Film Blueprint serialization for Phase 9B
- Runtime, active shot count, average shot length, shot planning, camera planning, transition planning, selected visual asset, notes, and timed still-image animatic preview
- Admin sequence insights at `/admin/sequence`

Explicitly out of scope:

- Movie Builder
- FFmpeg rendering
- Movie stitching
- Image-to-video generation
- Narration, voice, soundtrack, subtitles, read-aloud
- Publishing and marketplace
- AI Film Mentor
- Academy expansion

## Phase 9B.1 / 9B.1A: Movie Builder

Status: PRODUCTION COMPLETE (deployed prior to this document's last edit — noting it here since this file had fallen behind).

- Deterministic FFmpeg assembly of Film Blueprint shots into a silent H.264 MP4
- `MovieRenderJob` / `MovieAsset` / `MovieRenderEvent`, fail-closed `story:movie_render` credit gate
- FFprobe READY verification (duration/dimensions/fps/codec/file-size)
- Runtime invariant: `StorySequenceScene.durationSeconds` is canonical finished-film screen time; transitions use overlapping render handles that never change it (`transitionRule: overlap_transitions_do_not_add_runtime`)

## Phase 9B.2: Audio & Performance Layer

Status: STAGING-QUALIFIED, GO recommendation issued. See `docs/operations/phase-9b2-staging-qualification.md` and `docs/architecture/audio-performance-layer.md`.

- `AudioPerformancePlan` / `AudioTrack` / `AudioCue` / `VoiceProfile` / `AudioPlanVersion` / `AudioAsset` — additive schema, one active plan per Sequence
- Five independently-editable track types: Narration, Dialogue, Ambience, SFX, Music
- Cue timing anchored to the canonical Film Blueprint timeline (`computeCanonicalShotTimeline`), never to FFmpeg render/xfade handles
- Deterministic Audio Blueprint, versioned with the same monotonic `max+1` pattern as Sequence versions
- Real FFmpeg audio mixing (trim/delay/volume/fade/ducking) muxed with the existing silent video, verified end-to-end in staging with a real audiovisual render
- Extended (not weakened) FFprobe READY gate: `OUTPUT_AUDIO_STREAM_MISSING` if audio was expected but not produced
- Silent films remain fully supported and unaffected
- Explicitly deferred: TTS/voice generation providers, voice cloning, lip sync, full subtitle editor, dubbing, AI music generation, publishing, marketplace

## Phase 9B.2B: Pure-Rendering + Persistence Checkpoints

Status: PASSED. See `docs/operations/phase-9b2-pure-rendering-checkpoint.md` and `docs/operations/phase-9b2b-persistence-checkpoint.md`.

- Fixed a real gap found by re-reading the mixing code: the mixed audio track was never forced to the canonical runtime before muxing, so a single short/late cue could truncate the final video via `-shortest`. `buildMixFilterGraph` now always ends with `apad`/`atrim` to the exact canonical runtime, even on the single-cue path.
- All 8 required scenarios (silent, speech-only, ambience+SFX, music+ducking, overlapping, fade in/out, late-starting, early-ending) proven against real ffmpeg/ffprobe at `0s` delta from the canonical runtime, independently re-measured (not read from internal metadata).
- Render idempotency now provably includes audio identity, proven live against real Postgres: same visuals + different audio never reuses a prior render; reverting audio content back to a prior state does reuse it (content-addressed, not time-based); a render's persisted `audioBlueprintSnapshot` never moves after the live plan is edited further.
- Audio Plan version numbering (`save → save → restore → save`) verified against real stored DB rows, not just unit tests: `1, 2, 3`, never the old `1, 2, 2` bug.
- Cross-project `AudioAsset` references are now rejected both at write time (`addCue`/`updateCue`) and at render time (worker query scoped by `projectId`).
- Unmaterialized speech cues (text/voice intent with no resolved audio) are now surfaced honestly — Movie Builder preflight warning + a per-cue "Audio source: Not generated yet" indicator — rather than silently dropped with no visible trace. WARNING severity, not BLOCKER (documented product choice).

## Next Candidate Phases

1. Phase 9B.3: TTS provider integration behind the existing `generateSpeech`-shaped interface boundary, plus `createAudioAsset` upload API.
2. Phase 9C controlled scene video generation from approved sequence entries.
3. Phase 9D server-side movie assembly after source clips prove stable.
