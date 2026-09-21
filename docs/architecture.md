# Raivstream — Architecture

> Canonical engineering architecture. Product sequencing lives in `docs/product_roadmap.md`; the living session record is `SESSION.md`.

## 1. System overview

Turborepo monorepo:

```
apps/
  web/       Next.js 15 App Router (app.raivstream.com + r16.raivstream.com)
  mobile/    Expo SDK 50 (Android + iOS)
packages/
  api/       tRPC v11 router + server-side feature logic
  database/  Prisma schema + generated client
```

Data: self-hosted Supabase/Postgres on the VPS. Storage: Cloudflare R2 (S3-compatible). Jobs: provider-async generation with client polling (plus an in-process FFmpeg movie-render worker). Auth: custom JWT. Payments: Paystack (NGN) + Stripe (USD).

## 2. Media provider abstraction layer

`packages/api/src/lib/mediaProviders/` is the provider-neutral boundary. Application code depends on these interfaces only; no provider SDK or response shape leaks into routers/UI.

| File | Responsibility |
|---|---|
| `types.ts` | Normalized contracts: `MediaProvider`, `ImageGenerationProvider`, `VideoGenerationProvider`, `UGCVideoProvider`, `MediaJobRef`, `MediaJobStatusResult`, `MediaJobStatus`, `MediaUsage`, `MediaErrorCode` / `MediaProviderError`, `isAcceptableResultUrl` |
| `config.ts` | fal configuration, fail-closed and default-off. `readFalMediaConfig()`, `isFalCapabilityLive()`, `isFalEndpointAllowed()`, `falDisabledReason()` |
| `mockProvider.ts` | Deterministic offline mock (non-routable URLs) for tests/dev |
| `webhook.ts` | HMAC helper + `WebhookIdempotencyStore` (bounded TTL) |
| `outputValidation.ts` | Server-side output URL validation before persistence |
| `registry.ts` | **Capability registry + health snapshot** (see §4) |
| `fal/contracts.ts` | fal request/response shapes (the ONLY place fal's schema appears) + normalized↔fal mappers |
| `fal/falMediaProvider.ts` | fal adapter via `@fal-ai/client` (lazy dynamic import); gated |
| `fal/falWebhook.ts` | ED25519/JWKS webhook signature verification (Node crypto, no libsodium) |
| `webhookProcessing.ts` | Durable, crash-safe webhook → GenerationJob terminal transition + `CreditOperation` refund intent (atomic) |
| `refundOperationsMonitor.ts`, `refundAlertDispatch.ts`, `refundRecovery.ts` | Staging-only refund observability/recovery |

**Resolution rule:** `getMediaProvider()` returns the mock unless `FAL_MEDIA_PROVIDER_ENABLED=true`, in which case it returns the fal adapter (which itself is call-gated). A real fal call requires all of: master switch, real-calls switch, per-capability switch, `FAL_MAX_REQUESTS > 0`, and `FAL_KEY` present.

## 3. Generation dispatch

`packages/api/src/lib/generators/index.ts` is the central dispatcher (`submitGenerationJob` / `pollJobStatus`), with per-model adapters under `lib/generators/`. Two transport styles coexist:

- **Legacy direct providers** (RunPod, xAI, Kling, Gemini) — each has its own adapter (`flux.ts`, `wan25.ts`, `seedance.ts`, `hunyuanVideo.ts`, `cogVideoX.ts`, `ltx2.ts`, `grokImagine.ts`, `kling.ts`, `nanoBanana.ts`, `veo3.ts`).
- **fal.ai** — new adapters (`falFlux2.ts`, `falH3Max.ts`, `falVeed.ts`) call `createFalMediaProvider()` and return a providerJobId of the form `fal:<requestId>`.

`MODEL_META` drives the AI Studio (`/generate`) model list; `hidden: true` models are filtered server-side in `generation.listModels`.

## 4. Provider capability registry

`registry.ts` (`getProviderRegistry()`) returns a pure, env-presence-only health snapshot for every provider: **fal.ai, RunPod, xAI, Kling, Google Gemini**. For each capability (`image` / `video` / `ugc_video`) it reports:

- `configured` — required credential/endpoint present
- `enabled` — configured AND all gates open (live submission permitted)
- `reason` — human-readable disable reason (no secrets)

Exposed at `providers.health` (admin-only tRPC). Also consumed by `generation.listModels`, which annotates each model with `available`/`unavailableReason` via `resolveModelAvailability()`. This is the foundation for the Phase 13 provider-health dashboard.

## 5. Generation job lifecycle

`GenerationJob` (schema.prisma) uses `GenerationStatus`: `QUEUED → GENERATING → COMPLETED | FAILED | CANCELLED`.

- **Unified state machine** (`generators/jobModel.ts`): all adapters normalize into `GenerationJobState` (`queued | generating | completed | failed | cancelled`) and `GenerationJobError` (`code | message | retryable`). RunPod statuses map via `normaliseStatus`/`normaliseRunpodError` (`runpod.ts`); `cancelled` is now first-class.
- **AI Studio** (`generation.create`): prompt moderation → atomic credit deduction → `GenerationJob` (QUEUED) → `submitGenerationJob` → client polls `generation.pollStatus` (maps `cancelled → CANCELLED`).
- **Story scene images/videos** (`story.generateSceneImage` / `generateSceneVideo`): VPC prompt composition → credit deduction → `StorySceneAsset` (GENERATING) + `GenerationJob` (QUEUED) → `submitGenerationJob` → `waitForGenerationOutput` (server-side poll loop, 180s timeout, handles `cancelled`) → R2 mirror → asset READY.
- **Refund**: deduct-before-submit with `refundCredits()` on submission failure. For webhook-driven failures, `processProviderWebhook` writes a `CreditOperation` REFUND intent atomically with the terminal transition; `executeRefundOperation` claims+executes it idempotently.

## 6. fal.ai migration (Flux.2 / MiniMax H3-Max / VEED Fabric)

| Model | Endpoint | Kind | Adapter | Status |
|---|---|---|---|---|
| FLUX2 | `fal-ai/flux-2` | image (t2i) | `falFlux2.ts` | wired (AI Studio + Story scene image); live validation blocked on fal access |
| H3_MAX | `minimax/h3-max-turbo/image-to-video` | video (i2v) | `falH3Max.ts` | wired (AI Studio + Story scene-video); film-sequence integration pending |
| VEED_FABRIC | `veed/fabric-1.0` | ugc_video (lip-sync) | `falVeed.ts` | backend only; UGC consent/moderation UI pending |

All outputs are mirrored to R2 (isolated staging bucket) via `persistFalOutput()` in `mediaProviders/fal/falStorage.ts` — the canonical key/content-type used by **both** the polling adapters and the webhook path. Provider CDN URLs are never persisted as permanent assets. The fal webhook route (`apps/web/src/app/api/webhooks/fal`) verifies ED25519 signatures, mirrors output to R2 before persisting, and processes completion/failure idempotently (inert unless `FAL_MEDIA_PROVIDER_ENABLED=true`). Provider-side cancellation is wired via `cancelProviderJob()` in the dispatcher and invoked fire-and-forget from `generation.cancel`.

## 7. Storage & credits

- **R2**: `lib/r2.ts` (`mirrorUrlToR2`, `uploadBufferToR2`, `getPublicUrlForKey`). Keys are namespaced (`generated/fal/flux2/…`, `story-projects/{projectId}/scenes/{sceneId}/assets/…`).
- **Credits**: `lib/credits.ts` — `deductCredits` (atomic `updateMany WHERE balance >= cost`), `refundCredits`, `resolveFeatureCreditRate`. Feature keys are `generate:<model>` (DB-configurable via `/admin/credits`).
- **Reserve → settle → release** (§7.5, flag-guarded by `CREDIT_RESERVE_SETTLE_ENABLED`, default off): `reserveCredits` / `settleCredits` / `releaseCredits` backed by the `CreditReservation` model (HELD → SETTLED | RELEASED), atomic + idempotent + crash-safe. When enabled, `generation.create` reserves an estimate and releases on failure, settling on completion; when disabled, the deduct-before-submit + refund path is used.

## 8. Movie Builder (Phase 10)

The Movie Builder assembles story scenes into a single H.264 MP4. As of Phase 10
it **prefers a READY scene video over the still image** for each shot and falls
back to the still when none exists:

- `buildMovieRenderPlan` (`movieRenderPlanning.ts`) resolves, per shot, a READY
  `StorySceneAsset` of type `VIDEO` for the scene (via `videoAssetsBySceneId`),
  else the blueprint's selected image; the chosen source is recorded as
  `shot.sourceType` (`IMAGE` | `VIDEO`) and pinned into `renderPlanHash`.
- `renderVideoShot` (`movieRenderWorker.ts`) loops the clip
  (`-stream_loop -1`), scales/crops to the output, trims to the shot's segment
  duration, and strips audio (the movie's audio is mixed separately).
- Stills render exactly as before (`-loop 1`). Camera-movement filters apply to
  stills only — video clips already carry motion.
- **Per-shot retry + resume**: each shot renders with up to
  `MOVIE_RENDER_SHOT_ATTEMPTS` (default 2) attempts; a successfully rendered
  segment is persisted to R2 (`…/movies/{jobId}/segments/shot-NNN.mp4`) and
  reused when the same job is retried, so a failure only re-renders the shots
  that never completed. Disabled when `MOVIE_RENDER_SEGMENT_RESUME=false` or R2
  is unconfigured. Segments are cleaned up after a successful render.
- Export/version history: `story.listMovieAssets` lists READY `MovieAsset`
  versions (with download URL); `story.setCurrentMovie` selects the current one.

## 9. Reliability & backpressure (Phase 15)

- **Provider rate limiting**: `lib/generators/providerRateLimit.ts` — an in-process
  per-provider concurrency cap (`PROVIDER_MAX_CONCURRENCY`) and minimum interval
  (`PROVIDER_MIN_INTERVAL_MS`), applied in `submitGenerationJob` via
  `providerIdForModel`. Over-cap submissions fail fast with a retryable
  `RATE_LIMITED` error (backpressure, not queuing). Defaults are unlimited.
  The interface is intentionally small so a distributed (Upstash) limiter can
  replace the in-memory one for multi-process deployments.
- **Retry / dead-letter**: `GenerationJob.retryCount` + `errorCode`; `generation.retry`
  re-drives a failed job up to `MAX_JOB_RETRIES`; `admin.listGenerationJobs({ deadLetter: true })`
  surfaces jobs that exhausted the budget.
- **Background cleanup**: `releaseStuckReservations()` releases HELD
  `CreditReservation`s older than a cutoff (crash between reserve and settle).
- **Indexes**: `generation_jobs` `[status, createdAt]`, `[status, retryCount]`, `[errorCode]`.
- **Ops (not code)**: durable queue-based processing, dedicated workers, DLQ
  re-drive, object-storage lifecycle policies, CDN tuning, DR + backup
  verification, load testing, capacity planning.

## 10. Narration / speech (Phase 9B.3)

Speech generation is provider-agnostic behind `lib/generators/elevenLabsTts.ts`
(`synthesizeSpeech`). `story.generateCueSpeech`:

1. Loads the `AudioCue` (ownership via its `AudioTrack` → `AudioPerformancePlan` → project).
2. Moderates `cue.text` (`moderatePrompt`).
3. Credit gate: `story:speech_generation` via `resolveFeatureCreditRate` (**fail-closed** — unset by default).
4. Resolves the voice: explicit `voiceId` → `VoiceProfile.voiceRef` → default public voice.
5. Calls ElevenLabs; uploads MP3 to R2; creates an `AudioAsset` (`sourceKind: GENERATED_SPEECH`).
6. Links `AudioCue.audioAssetId` (refund-on-failure).

Gated by `ELEVENLABS_TTS_ENABLED` + key presence (`ELEVENLABS_API_KEY` or legacy `11_LABS`).
The movie-render mixer then consumes the materialized asset like any other cue.

**Background music** (Phase 11) mirrors the same shape: `lib/generators/lyriaMusic.ts`
(`generateMusic`, reuses `GEMINI_API_KEY`) + `story.generateCueMusic` for MUSIC/AMBIENCE
cues (moderate → `story:audio_generation` gate → Lyria → R2 `AudioAsset(sourceKind:'GENERATED_MUSIC')`).
Models: `lyria-3-clip-preview` (30s) / `lyria-3-pro-preview`; gate `LYRIA_MUSIC_ENABLED`.

## 11. Webhook / refund safety
- fal webhook signature: ED25519 over `${requestId}\n${userId}\n${timestamp}\n${sha256(body)}`, verified against JWKS (`https://rest.fal.ai/.well-known/jwks.json`), ±300s replay window.
- Refund outbox: `CreditOperation` (unique `idempotencyKey = fal-refund:<jobId>`), `PENDING → PROCESSING → COMPLETED | FAILED`. Monitoring, recommendation, and execution are separate authorities — no automatic credit mutation on provider connect.

## 12. AI Narrative & Production Pipeline (Phase 16) — Claude → GPT-4o → ElevenLabs + MiniMax H3

> **PLANNED.** Story composition and prompt generation move to a staged LLM pipeline whose
> final stage targets **MiniMax H3** (native synchronized audio/SFX, durations 4–15s,
> resolutions up to 1080P @ 24 FPS, `first_frame_image` i2v) with **ElevenLabs** scene
> narration. All destination media infrastructure already exists in this codebase (H3_MAX
> fal adapter, ElevenLabs `generateCueSpeech` + `AudioCue`/mixer, OpenAI enhancer, Movie
> Builder mixer); Phase 16 adds the two upstream composition stages and the manifest that
> binds them.

### 12.1 Pipeline

```
                [ RAW USER PROMPT ]
                          │
                          ▼
        ┌──────────────────────────────────┐
        │  Stage 1 · Narrative Engine      │  Claude 3.5 Sonnet  (CLAUDE_API)
        │  story → cinematic 3–5 scene     │
        │  prose (sensory anchors, sound   │
        │  cues, lighting, conflict)       │
        └──────────────────────────────────┘
                          │
                          ▼
        ┌──────────────────────────────────┐
        │  Stage 2 · Production Structurer │  GPT-4o (response_format json_object)
        │  prose → strict ProductionManifest│ (GPT40_API)
        │  (MiniMax H3 prompt + ElevenLabs │
        │   narration + camera/duration/   │
        │   resolution/first-frame)        │
        └──────────────────────────────────┘
                 │                  │
                 ▼                  ▼
        ┌────────────────┐  ┌─────────────────────┐
        │  Stage 3A      │  │  Stage 3B           │
        │  ElevenLabs    │  │  MiniMax H3         │
        │  narration     │  │  video + native SFX │
        │  .mp3/.wav     │  │  .mp4 per scene     │
        └───────┬────────┘  └─────────┬───────────┘
                └───────────┬─────────┘
                            ▼
                [ ProductionManifest (resolved) → Movie Builder ]
```

| Stage | Model / API | Role | Key outputs |
|---|---|---|---|
| 1 · Narrative Engine | `claude-3-5-sonnet-20241022` (Anthropic) | Expand a raw concept into a rich 3–5 scene cinematic story: character motives, lighting, atmosphere, physical action, ambient sound cues, internal conflict. | Unstructured prose, `SCENE n` headings |
| 2 · Production Structurer | `gpt-4o` (OpenAI, `response_format: { type: 'json_object' }`) | Translate prose into a strict JSON manifest configured for MiniMax H3 syntax and ElevenLabs. | `ProductionManifest` (below) |
| 3A · Voiceover | ElevenLabs | Synthesize per-scene narration. | `.mp3`/`.wav` per scene |
| 3B · Video + SFX | MiniMax H3 | Render per-scene clip with camera motion, lighting, and native embedded ambient SFX. | `.mp4` per scene |
| 4 · Consolidation | app (Movie Builder) | Merge scene metadata + generated video/audio URLs into the final production render. | resolved `ProductionManifest` |

### 12.2 ProductionManifest schema (Stage 2 output)

```jsonc
{
  "title": "String",
  "logline": "String",
  "scenes": [
    {
      "scene_id": "Number",
      "elevenlabs_narration": "String",        // VO script incl. emotion/pacing hints
      "minimax_video_prompt": "String",         // MiniMax H3 cinematic prompt
      "camera_motion": "String",                // e.g. "Slow push-in", "Orbit", "Low-angle tracking shot"
      "duration_sec": "Number",                 // accepted 5–15
      "resolution": "String",                   // accepted "768P" | "1080P"
      "first_frame_image_url": "String | Null"  // optional i2v framing image
    }
  ]
}
```

**`minimax_video_prompt` formula (required by Stage 2 system prompt):**
`[Shot Type & Camera Motion] + [Subject & Physical Action] + [Lighting & Atmosphere] + [Lens & Style] + [Native Audio/SFX cues]`.
Because MiniMax H3 generates audio natively, SFX are explicit prompt terms (e.g. *"Ambient sound of heavy rainfall, distant sirens, and wet footsteps"*). Generic buzzwords (`4K`, `HD`, `hyperrealistic`) are forbidden; use technical cinematography terminology.

### 12.3 Integration with the existing system

- **MiniMax transport:** the existing `H3_MAX` fal adapter (`lib/generators/falH3Max.ts`, `minimax/h3-max-turbo/image-to-video`) is the default MiniMax path. Phase 16 extends the contract (`mediaProviders/fal/contracts.ts`) for `duration_sec` (4–15), `resolution` (`768P`/`1080P` @ 24fps), and `first_frame_image` (already i2v via `seedImageUrl`). A host decision (fal queue vs direct `https://api.minimax.io/v1/video_generation`) is recorded as an ADR before Stage 3B lands.
- **ElevenLabs:** Stage 3A wires `elevenlabs_narration` into the existing `story.generateCueSpeech` path (`elevenLabsTts.ts` → R2 `AudioAsset(GENERATED_SPEECH)` → `AudioCue.audioAssetId`), which the Movie Builder audio mixer already consumes.
- **Composition:** Stage 1 augments/replaces `storyTextService` (OpenAI-compatible / deterministic) and Stage 2 augments `promptEnhancerService` + the VPC prompt composer. The manifest becomes the canonical creative specification for scene video (`story.generateSceneVideo` reads prompt/camera/duration/resolution); the VPC keeps per-shot fallbacks and the R16-safe deterministic path.
- **Credits & gating:** fail-closed convention preserved. New switches default **OFF**: `STORY_NARRATIVE_ENGINE_ENABLED` (Stage 1) and `STORY_MANIFEST_STRUCTURER_ENABLED` (Stage 2); local/deterministic fallbacks remain. New credit-rate keys where applicable (e.g. story composition/manifest staging) via `/admin/credits`; existing `story:speech_generation` / `generate:h3_max` gates are reused for the media stages.
- **Credentials:** `CLAUDE_API` (Anthropic) and `GPT40_API` (OpenAI GPT-4o) are staged in `cred/fal_env.txt` (gitignored) and must map to server-only env in production — never `NEXT_PUBLIC_*`. ElevenLabs uses the existing `ELEVENLABS_API_KEY` / legacy `11_LABS`.
- **Manifest persistence:** the resolved `ProductionManifest` (with generated video/audio URLs) is persisted per project so renders are reproducible and resumable; it feeds `story.listMovieAssets` / export history.
