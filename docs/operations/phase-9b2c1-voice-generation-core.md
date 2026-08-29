# Phase 9B.2C.1 — Provider-Neutral Voice Generation Core

Status: **QUALIFIED FOR PROVIDER EVALUATION** (staging-only; not deployed to production).

## 1. Mission

Materialize an unmaterialized speech `AudioCue` into a real `AudioAsset` through a
provider-neutral generation layer that plugs into the already-qualified Phase 9B.2B
audio pipeline unchanged.

**Central rule:** speech generation materializes audio. It does not define or alter
film timing. `AudioCue.startTimeSeconds` / `durationSeconds` remain canonical and are
never rewritten by generation — the worker records the *actual* rendered media
duration as a diagnostic field only (`VoiceGenerationJob.actualDurationSeconds`).

## 2. Domain model (additive only)

`packages/database/schema.prisma`:

- `enum VoiceGenerationType { SPEECH }`
- `enum VoiceGenerationStatus { QUEUED PROCESSING READY FAILED CANCELLED }`
- `model VoiceGenerationJob` — one row per `(audioCueId, requestFingerprint)`
  (`@@unique` constraint), carrying an immutable `requestSnapshot Json`, provider
  identity fields, output media diagnostics, and failure taxonomy fields.

No existing Phase 9B.2B model changed. `AudioAsset.sourceKind` gains a new free-text
value, `GENERATED_SPEECH` — no schema change needed there, that field was already
free text.

Migration: `packages/database/migrations/20260829120000_voice_generation_core_phase9b2c1/`
— hand-authored (no local shadow DB available), applied cleanly to staging Postgres.

## 3. Request snapshot & fingerprint

`packages/api/src/lib/voiceGeneration.ts` builds a deterministic
`VoiceGenerationRequestSnapshot` (text, language, voice descriptor, performance
descriptor, output format) and a SHA-256 fingerprint over an explicitly-named,
stably-ordered field join (never `JSON.stringify`). Text is whitespace-normalized
before hashing so incidental spacing never changes request identity; duration,
timestamps, and worker/provider internals never enter the snapshot or the hash.

## 4. Idempotency & concurrency

The single DB-level unique constraint `@@unique([audioCueId, requestFingerprint])`
is both the idempotency and the concurrency primitive:

- An identical retry after `FAILED` reuses the same row (reset-in-place).
- A genuinely different fingerprint (different text/voice/performance) forks a new
  row, naturally preserving take history as separate rows per cue.
- Two simultaneous identical requests race on the constraint; the loser catches
  Prisma `P2002` and refetches the winner's row. Proven under **real concurrent
  load** against staging Postgres in the qualification run — two parallel
  `generateVoiceForCue` calls resolved to the exact same job id with exactly one
  row persisted.

## 5. Provider contract

`packages/api/src/lib/voiceGenerationProviders.ts` defines a neutral adapter
interface (`key`, `capabilities()`, `generateSpeech(request, context)`) plus a
registry (`resolveVoiceGenerationProvider`, `listConfiguredVoiceGenerationProviders`,
`providerIsConfigured`). Nothing in the durable models, the worker, or the router
imports a named vendor SDK.

The only implementation shipped in this phase is `developmentProvider`
(`test-fixture-dev`) — a deterministic dev/test fixture that synthesizes a real
sine-tone WAV via real `ffmpeg`, with frequency and duration derived from a SHA-256
digest of the request text. It exists to exercise the real materialization pipeline
end to end without depending on, or committing to, any production vendor.

**Gating:** the dev provider is usable only when `VOICE_GENERATION_DEV_PROVIDER_ENABLED
=== 'true'` (exact string match) is set in the environment — mirrors the existing
`MOVIE_RENDER_WORKER_DISABLED` trust model. `NODE_ENV` cannot be used for this
distinction since `next start` always reports `production` regardless of target
environment. This flag is set **staging-only**; it is not present in production's
environment and must never be added there without a deliberate, separate decision.

## 6. Worker lifecycle

`packages/api/src/lib/voiceGenerationWorker.ts`:

1. Atomic acquire: `updateMany({ where: { id, status: 'QUEUED' }, data: { status: 'PROCESSING', attemptCount: increment } })` — a count of 0 means the job was already picked up elsewhere; the call returns early (no double-execution).
2. Resolve the provider named on the job; call `generateSpeech` with the immutable snapshot.
3. **Media READY gate** — reuses `probeAudioAsset` from `audioMixing.ts`, the same trusted `ffprobe` abstraction the movie renderer already uses. Never trusts provider-reported metadata alone. Requires: file exists and is non-zero, `hasAudioStream`, `durationSeconds > 0`, valid codec/sample rate/channel count.
4. Compute SHA-256 checksum of the output bytes.
5. Upload to R2 at a deterministic, server-generated key: `story-projects/${projectId}/audio/generated/${jobId}.${extension}` — never derived from user-supplied text, no path-traversal surface.
6. In one `$transaction`: create the `AudioAsset` (`sourceKind: 'GENERATED_SPEECH'`) and transition the job to `READY`, recording the output asset id and media diagnostics.

Every dependency (`commandRunner`, `resolveProvider`, `uploadBuffer`) is injectable
for testing; defaults are the real implementations.

## 7. Failure taxonomy & sanitization

Typed failure codes (`VOICE_GENERATION_UNSUPPORTED_CUE_TYPE`,
`VOICE_GENERATION_OUTPUT_INVALID`, `VOICE_GENERATION_PROBE_FAILED`,
`VOICE_PROVIDER_REQUEST_FAILED`, `VOICE_PROVIDER_NOT_CONFIGURED`, etc.) are recorded
on `failureCode`. `failureMessage` is passed through `sanitizeFailureMessage`, which
redacts bearer-token-shaped and `key: value`-shaped substrings in two passes before
persistence — proven against a real leaking error message in a unit test.

## 8. Cue materialization / take history

Generation **never** auto-attaches to the cue. `attachGeneratedVoiceTake` is the only
mutation that sets `AudioCue.audioAssetId`, and it re-validates ownership via the
same `assertAudioAssetOwnership` discipline used by `addCue`/`updateCue`. Multiple
distinct-fingerprint jobs against one cue are simply separate rows, each with its own
`outputAudioAssetId` — take history falls out of the data model for free.

## 9. API surface (all under `storyRouter`)

- `generateVoiceForCue` — validates text, builds the snapshot, fingerprints it, creates or reuses the job, queues the worker.
- `getVoiceGenerationJob`
- `listVoiceGenerationHistory`
- `attachGeneratedVoiceTake`
- `retryVoiceGeneration`

All five are gated by `ensureAudioCueOwnership(ctx, projectId, audioCueId)` (new
helper in `story.ts`), which calls `assertSequenceAllowed(ctx)` (the R16 gate) before
touching the cue at all, then walks cue → track → plan → project ownership.
Responses are trimmed through `sanitizeVoiceGenerationJob` — `requestSnapshot`,
`providerRequestId`, and other internal fields are never exposed to the client.

## 10. R16 isolation

`ensureAudioCueOwnership` denies R16 context before it even looks up the cue.
Proven in both the unit test suite and the staging qualification run: no server
access, and the Nocturne UI voice-generation panel simply does not render in R16
sequences (the panel lives inside the same Audio Workspace surface that is already
gated off for R16 by Phase 9B.2B).

## 11. Credit / billing boundary — inert by design

`STORY_SPEECH_GENERATION_FEATURE_KEY = 'story:speech_generation'` already existed in
`credits.ts` from an earlier round as a documented interface boundary. **Phase
9B.2C.1 deliberately never calls `deductCredits` for voice generation.** No rate is
seeded, no default-to-zero-and-charge exists, `story:movie_render` pricing (100
credits) is untouched, and nothing here invents production voice-generation pricing.
Production billing for this feature is a decision for a later phase.

## 12. Nocturne UI

`apps/web/src/app/story-playground/[projectId]/page.tsx` — a "VOICE GENERATION (DEV
FIXTURE)" panel inside the Cue Inspector: Generate Voice / status badge / Retry (on
`FAILED`) / audio playback + "Use Take / Attach" (on `READY`). The panel is
explicitly labeled dev-fixture-only in the UI copy and in an inline code comment —
never presented as production TTS.

**Bug found and fixed during live staging verification:** the mutations'
`refreshAudio` callback invalidated the audio plan, voice profiles, and version
list, but never invalidated `listVoiceGenerationHistory` — so after clicking
"Generate Voice" (or Retry, or Attach), the panel's own query kept serving its
pre-mutation (empty) cached data and its `refetchInterval` polling logic, which
decides whether to keep polling by inspecting that same cached data, never started.
The job was completing correctly on the server the entire time; the UI just never
learned about it without a manual navigation away and back. Fixed by having
`refreshAudio` also invalidate `listVoiceGenerationHistory` for the selected cue.
Verified after the fix: Generate → job reaches `READY` and the panel updates to show
it, live, with no manual reload, in a real browser against real staging.

## 13. Staging qualification summary

All run against real staging Postgres, real R2, real ffmpeg/ffprobe, on the isolated
staging VPS (`raivstream-phase9b2-audio-staging`, port 3037) — never production.

- Real-media checkpoint (`phase9b2c1-voice-generation-media-checkpoint.ts`): real
  ffmpeg-synthesized WAV, 44.1kHz mono PCM, deterministic per input text, zero-byte
  and corrupted-file inputs both correctly rejected by the READY gate.
- Full-stack qualification (`phase9b2c1-staging-qualification.ts`): real
  `appRouter.createCaller` calls against real staging DB — immutable snapshot
  proven, idempotency proven, concurrent-request proven (single row from two
  parallel identical requests), injected-failure proven (typed failure code +
  sanitized message, no `AudioAsset` created), Movie Builder compatibility
  unaffected, version-restore regression unaffected.
- Interactive browser verification: real click-through in the deployed staging UI —
  Generate Voice → real job reaches `READY` with a real R2-hosted WAV → Use Take /
  Attach → cue shows `AUDIO SOURCE: ATTACHED` and plays the generated audio. Found
  and fixed the cache-invalidation bug described in §12 above, then re-verified
  clean.
- Test-data cleanup: the manually-created browser-test track/cue/job/asset were
  removed from the shared QA project and independently re-verified absent
  (`phase9b2c1-browser-qa-cleanup.ts`); the shared QA project's audio plan is back
  to its pre-test baseline ("No tracks yet").

Full regression: **176/176 API tests passing** (20/20 files, 44 new), API
`tsc --noEmit` clean, web `tsc --noEmit` clean, staging `next build` succeeded.
`audioMixing.ts`, `movieRenderWorker.ts`, and `movieRenderPlanning.ts` were not
touched, so the Phase 9B.2A real-FFmpeg 8-scenario checkpoint was not required to be
rerun.

## 14. Known limitations / explicitly out of scope

Full voice casting UI, voice marketplace, character voice continuity UX, voice
cloning, consent workflow, production TTS provider selection, multilingual dubbing,
automatic dialogue rewriting, lip sync, phoneme animation, automatic
timing/stretching to match generated duration, production credit pricing,
provider-specific UI controls, R16 voice experience, final performance-direction
translation, background music/SFX/ambience generation. All deferred to a later
phase.

**No production speech-generation pricing is enabled.** **This phase does not
select the final production voice provider** — the dev fixture is a validation
harness for the materialization pipeline, not a production candidate.

## 15. Next phase boundary

Phase 9B.2C.2 (provider selection / production rollout) is explicitly not started.
