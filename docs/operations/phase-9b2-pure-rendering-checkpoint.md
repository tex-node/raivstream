# Phase 9B.2 — Pure-Rendering Checkpoint

**Status:** PASSED. Run before any further UI/API work on top of the rendering layer, per the reviewer's explicit checkpoint request.
**Script:** `scripts/phase9b2-audio-render-checkpoint.ts` (mirrors the existing `scripts/phase9b1a-ffmpeg-timing.ts` convention exactly)
**Raw output:** `docs/operations/phase-9b2-pure-rendering-checkpoint-results.json`
**Executed:** real `ffmpeg`/`ffprobe` (6.1.1) on the isolated VPS staging checkout at `/root/raivstream-phase9b2-staging` — filesystem + process execution only, no Postgres, no tRPC API, no browser, and no restart of the running staging PM2 process (confirmed `online` before and after).

## Why this checkpoint exists

Re-reading `audioMixing.ts`/`movieRenderWorker.ts` against the reviewer's invariant —

```
Film Blueprint runtime == Audio Blueprint runtime == final movie runtime
```

— surfaced a real gap: the mixed audio track was never forced to the canonical runtime before muxing. `amix`'s own `duration=longest` only reaches the longest *cue*, not the Film Blueprint's runtime, and `muxAudioWithVideo` used `-shortest`. A single short cue (a late-starting SFX hit, or narration that ends early) would previously have produced a mixed track shorter than the video, and `-shortest` would have silently truncated the **final video** down to the audio's length — shrinking the movie below its canonical runtime. This checkpoint exists specifically to prove that gap is closed before building anything further on top of it.

## What changed (packages/api/src/lib/audioMixing.ts, movieRenderWorker.ts)

1. **`normalizeAudioInput`** — every downloaded cue source is normalized to a canonical PCM WAV (44.1kHz/stereo) before it reaches the mix filter graph, so trim/delay math is deterministic regardless of the original upload's format.
2. **`probeAudioAsset`** — deterministic per-input-asset FFprobe (same call shape as the existing output-verification probe, named separately since the two are different pipeline stages); a corrupt/empty normalized source is skipped per-cue with a clear cause instead of surfacing as an opaque mix/mux failure later.
3. **`buildMixFilterGraph` now always ends with `apad=whole_dur=<runtime>,atrim=start=0:end=<runtime>`** — this is the fix. It runs even in the single-cue case (no `amix` stage), which is exactly the case the bug hit hardest. `buildMixedAudioTrack` now requires an explicit `canonicalRuntimeSeconds` (always `audioBlueprint.runtimeSeconds`, which is always copied from the Film Blueprint — never independently derived).
4. **`assertAudioReadyGate`'s duration check now reuses the shared `durationWithinTolerance`/`MOVIE_RENDER_DURATION_TOLERANCE_SECONDS` (0.25s)** instead of a separately-invented 0.5s tolerance — the audio-vs-video sync check now holds the audio pipeline to the exact same standard as the video pipeline, safe to tighten now that the mix is force-padded/trimmed to an exact length instead of whatever the longest cue happened to produce.
5. **A second, independent verification leg in `movieRenderWorker.ts`**: after muxing, the muxed file's **video** stream is re-probed (`probeMovie`) and checked against the pre-mux silent probe with the same 0.25s tolerance, throwing `OUTPUT_DURATION_MISMATCH` if muxing ever altered the video duration. `-c:v copy` never re-encodes, but this catches any future regression in the mux step itself, independent of the audio-duration check.

## Tightening items from review, applied

- `migration_lock.toml` — confirmed never tracked in repo history (`git show origin/main:...migration_lock.toml` → not found) and `prisma migrate deploy` has run successfully in staging/production without it. Excluded from the Phase 9B.2 release file list; kept on disk only as a local `prisma migrate diff` verification aid. See `phase-9b2-staging-qualification.md` §22 for the updated file-list note.
- Generalized audio credit helper (`resolveFeatureCreditRate`, `STORY_SPEECH_GENERATION_FEATURE_KEY`/`STORY_AUDIO_GENERATION_FEATURE_KEY`) — confirmed no rate rows exist for either key in `packages/database/seed.ts`. The helper exists and is tested fail-closed; no paid provider path is enabled.

## Scenarios proven (real FFprobe, real ffmpeg, independently re-measured, `<= 0.25s` tolerance)

The checkpoint script (`scripts/phase9b2-audio-render-checkpoint.ts`) does **not** trust the worker's own internal verification metadata — after `executeMovieRenderJob` returns, it independently re-probes the *captured final output bytes* with its own fresh `ffprobe` calls (both `v:0` and `a:0`), exactly the way an external observer would. Canonical Film Blueprint runtime is 12s for every non-silent case:

| Scenario | hasAudio | Expected video runtime | Actual FFprobe video runtime | Δ | Audio stream duration | Audio codec | Sample rate | Channels |
|---|---|---|---|---|---|---|---|---|
| silent movie | false | 12s | 12s | 0s | — | — | — | — |
| speech only | true | 12s | 12s | 0s | 12s | aac | 44100 | 2 |
| ambience + SFX | true | 12s | 12s | 0s | 12s | aac | 44100 | 2 |
| music + speech ducking | true | 12s | 12s | 0s | 12s | aac | 44100 | 2 |
| overlapping cues | true | 12s | 12s | 0s | 12s | aac | 44100 | 2 |
| fade in/out | true | 12s | 12s | 0s | 12s | aac | 44100 | 2 |
| **late-starting cue** (1s SFX starting at t=8 on a 12s runtime) | true | 12s | 12s | 0s | 12s | aac | 44100 | 2 |
| **early-ending cue** (2s narration on a 12s runtime) | true | 12s | 12s | 0s | 12s | aac | 44100 | 2 |

`ok: true` overall. Full machine-readable output: `docs/operations/phase-9b2-pure-rendering-checkpoint-results.json`.

The last two rows use the reviewer's exact numeric examples: an 8s-start cue in a 12s film measures a 12s final output (not the naive "runtime minus start" = 4s reading), and a 2s narration cue in a 12s film still produces a full 12s mixed audio stream. Both are the single-cue case with no `amix` stage — the case the pad/trim fix targets hardest — and both land at exactly `0s` delta, not just "within tolerance."

### Mandatory constraints from this review round — verified

- **Padding applies on the single-cue path too**, not only when `amix` runs — confirmed by the `late_starting_cue` and `early_ending_cue` rows above (both single-cue) and by a dedicated pure-function test asserting the `atrim=start=0:end=<runtime>` stage is present even with zero `amix` in the filter string.
- **Pad/trim is applied once, after the final mix**, never per individual cue — `buildMixFilterGraph` appends the `apad`/`atrim` stage exactly once, after `mergedLabel` (whether that's a single chain's own output or `[mixed]`), never inside `buildCueFilterChain`.
- **Delayed starts preserved** — explicit test (`audioMixing.test.ts`) asserts an 8s-start cue in a 12s film produces `atrim=start=0:end=12`, and explicitly asserts it does **not** produce `atrim=start=0:end=4`.
- **Early-ending cues preserved** — proven both as a pure filter-graph assertion and as the real-ffmpeg `early_ending_cue` row above.
- **Video duration is rechecked after mux, independently of the audio check** — two independent layers: (1) inside `movieRenderWorker.ts`, `probeMovie` re-runs on the muxed file and is compared to the pre-mux silent probe (`OUTPUT_DURATION_MISMATCH` if they diverge beyond 0.25s), and (2) this checkpoint script's own from-scratch `ffprobe` call on the captured final bytes, independent of any internal metadata.
- **The visual Film Blueprint runtime calculation was not changed to compensate for audio** — `packages/api/src/lib/movieRenderPlanning.ts` (the file that owns `calculateExpectedRenderDuration`/`durationWithinTolerance`) has **zero diff** this phase; `sequencePlanning.ts`'s diff is a single new, purely-additive function (`computeCanonicalShotTimeline`) appended after `buildFilmBlueprint` — no existing runtime-calculating function was edited. Audio conforms to the existing canonical timeline; it does not redefine it.

### Negative test — short mix must never reach READY

Real ffmpeg with the fix in place cannot produce a mix shorter than the canonical runtime (that's what the fix guarantees), so this is proven the correct way: by mocking the exact failure signature the pad/trim fix exists to prevent and confirming the READY gate rejects it. Two cases, both in `movieRenderWorkerAudio.test.ts`:

1. **Muxed audio stream reports a duration shorter than the canonical runtime** (valid AAC stream, but 1s where 4s was expected) → `assertAudioReadyGate` throws `OUTPUT_AUDIO_VERIFICATION_FAILED`, job ends `FAILED`, zero `MovieAsset` rows created.
2. **Muxed video stream itself comes back truncated** (audio duration reports correctly, but the post-mux video re-probe reports 1s where 4s was expected) — this is the actual original defect class (video truncation, not an audio-side symptom) → the independent post-mux video check throws `OUTPUT_DURATION_MISMATCH`, job ends `FAILED`, zero `MovieAsset` rows created.

Neither case reaches `READY` in either test.

Restore-version monotonic numbering (`save v1 → save v2 → restore v1 → save/duplicate → v3`), reproducing the exact old Sequence bug class for the Audio Plan version table, is proven as a pure-function test in `audioPlanning.test.ts` (`nextAudioVersionFromExisting` describe block) — no live render needed for that invariant.

## Test suite

**97/97 tests passing, 14 files** (up from 83/14 baseline — 14 new tests: pure filter-graph proofs for all 8 scenarios plus the explicit 8s-delayed-start case, `buildNormalizeArgs` determinism, `probeAudioAsset`/`probeAudioStream` equivalence, tightened-tolerance boundary cases in `assertAudioReadyGate`, and the two short-mix negative tests).

## What this checkpoint does not cover (unchanged from the staging qualification's known limitations)

- No `createAudioAsset` upload API/UI — this checkpoint used synthetic `ffmpeg -f lavfi` tones fed in as `data:` URIs, exactly matching the existing video-only checkpoint script's use of a `data:image/png` still frame. No DB, API, or R2 asset record was created or needed.
- This is a rendering-layer proof, not a full staging DB/API/browser qualification — that qualification (already passed, see `phase-9b2-staging-qualification.md`) exercised the real API and DB with one real audio-bearing render; this checkpoint exercises the rendering pipeline in isolation, which is what surfaced the padding gap the DB/API qualification's single-cue-per-track test coverage hadn't hit.
