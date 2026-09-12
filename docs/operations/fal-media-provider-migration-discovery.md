# fal.ai Media Provider Migration — Discovery & Foundation

**Date:** 2026-09-12
**Branch:** `feat/visual-prompt-composer-v2`
**HEAD at start:** `ff7d3b43cdb09b0c16105d553ed46ff2090b062e`
**Scope:** discovery, architecture, provider-abstraction foundation. No live provider calls, no production
configuration, no schema migration, no deploy/merge/push.
**Target models:** `fal-ai/flux-2`, `minimax/h3-max/image-to-video`, `veed/fabric-1.0`.

---

## 1. Current provider architecture (verified from source)

### 1.1 Image generation flow
- **AI Studio:** `packages/api/src/routers/generation.ts` → `create` → prompt moderation → `deductCredits` →
  `GenerationJob` (QUEUED) → `submitGenerationJob()` → update job; `pollStatus` polls the provider.
- **Story scene images:** `packages/api/src/routers/story.ts` → `generateSceneImageAsset` → VPC prompt composition →
  `deductCredits` → `StorySceneAsset` (GENERATING) → `GenerationJob` (QUEUED) → `submitGenerationJob()` →
  `waitForGenerationOutput()` (poll loop) → `mirrorUrlToR2()`/`uploadBufferToR2()` → asset READY + job COMPLETED.
- Provider dispatch is a switch in `packages/api/src/lib/generators/index.ts` (`submitGenerationJob`,
  `pollJobStatus`), with per-model adapters under `lib/generators/`.

### 1.2 Video generation flow
- Same dispatch (`WAN_25`, `SEEDANCE`, `KLING_I2V`, `KLING_R2V`, `HUNYUAN_VIDEO`, `LTX2`, `VEO3`, `COG_VIDEO_X`).
- Client polls `generation.pollStatus` (SLOW_MODELS at 10s). Completed outputs are mirrored to R2 in the model adapter.

### 1.3 UGC / talking-video capability
- **None exists.** No lip-sync, talking-head, or image+audio→video path. `veed/fabric-1.0` would be new capability.

### 1.4 GenerationJob lifecycle
`GenerationJob` (schema.prisma): `model`, `prompt`, `negativePrompt`, `duration`, `aspectRatio`, `style`,
`seedImageUrl`, `status` (`GenerationStatus`: QUEUED → GENERATING → COMPLETED | FAILED | CANCELLED),
`providerJobId`, `outputUrl`, `thumbnailUrl`, `errorMessage`, `creditsUsed`, `metadata` (JSON), `createdAt/updatedAt`.

### 1.5 Queue and worker behavior
- No generic media queue. Long jobs are provider-async + **client polling**.
- `movieRenderWorker` (`lib/movieRenderWorker.ts`) is a separate in-process background worker for FFmpeg movie
  renders, gated by `MOVIE_RENDER_WORKER_DISABLED`. Not used for provider image/video generation.

### 1.6 Provider request/status/result abstractions
- `lib/generators/index.ts`: `GenerateInput`, `GenerateResult { providerJobId, outputUrl?, thumbnailUrl? }`,
  `JobStatusResult { status: 'queued'|'generating'|'completed'|'failed', outputUrl?, error? }`.
- `lib/generators/runpod.ts`: `submitJob`, `getJobStatus`, `cancelJob`, `normaliseStatus`, `extractOutputUrl`
  (handles many RunPod/ComfyUI output shapes), plus `aspectRatioToResolution`, `durationToFrames`.

### 1.7 R2 upload and persistence flow
- `lib/r2.ts`: `mirrorUrlToR2(sourceUrl, key, contentType)`, `uploadBufferToR2`, `getPublicUrlForKey`.
- Keys: `generated/flux/{jobId}.png`, `story-projects/{projectId}/scenes/{sceneId}/assets/{assetId}.png`,
  movies under `story-projects/.../movies/...`.
- Asset records store `assetUrl` + `r2Key`; permanent URLs are `${R2_PUBLIC_URL}/${key}`.

### 1.8 Credit reservation, settlement, refund, retry
- `lib/credits.ts`: `deductCredits()` (atomic `updateMany WHERE balance >= cost` + `CreditTransaction` USAGE) and
  `refundCredits()` (REFUND row). `MODEL_FEATURE_KEY` maps models → `generate:*` feature keys.
- **Deduct-before-submit**, refund on submission failure. No reservation/settlement split; polling retries do not
  re-charge because the job is created once. Duplicate webhooks are not a current concern (no generation webhooks).
- `story:movie_render = 100` resolved via `resolveMovieRenderCreditRate`.

### 1.9 Webhook / polling infrastructure
- Generation: **polling only** (`generation.pollStatus`, `waitForGenerationOutput`).
- Webhooks exist only for **payments** (`app/api/paystack/webhook`, `app/api/stripe/webhook`, `app/api/webhooks/*`).
- No provider-completion webhook handler, signature verification, or idempotency store for AI generation.

### 1.10 Provider-specific environment variables
- RunPod: `RUNPOD_API_KEY`, `RUNPOD_FLUX_PUBLIC_ENDPOINT`, `RUNPOD_FLUX_PORTRAIT_ENDPOINT`, `RUNPOD_FLUX_STEPS`,
  `RUNPOD_FLUX_GUIDANCE`, `RUNPOD_WAN26_T2V_ENDPOINT`, `RUNPOD_WAN26_I2V_ENDPOINT`, `RUNPOD_SEEDANCE_PUBLIC_ENDPOINT`,
  `RUNPOD_SEEDANCE_RESOLUTION`, `RUNPOD_HUNYUAN_ENDPOINT_ID`, `RUNPOD_COGVIDEOX_ENDPOINT_ID`, `RUNPOD_LTX2_ENDPOINT_ID`,
  `RUNPOD_WAN25_ENDPOINT_ID`, `RUNPOD_NETWORK_VOLUME_ID`.
- Other: `GEMINI_API_KEY`, `GEMINI_IMAGE_MODEL`, `XAI_API_KEY`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`,
  `KLING_ACCESS_KEY`, `KLING_SECRET_KEY`.
- Storage: `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`.

### 1.11 Credential/storage sharing risk (documented, not changed)
- Isolated staging currently shares provider credentials and R2 with production (see
  `docs/operations/vpc2-provider-isolation-2026-09-12.md`). This must be resolved before any fal staging test.

### 1.12 UI entry points (future consumers)
- `/generate` (AI Studio image/video), Story Workspace **Scenes** tab (scene image), **Film** tab (movie render),
  **Assets** tab (asset manager), and admin job pages. All read `GenerationJob` / `StorySceneAsset`; none should
  reach a provider SDK directly.

## 2. Current RunPod dependency map

| Model | Adapter | Transport | Env |
|---|---|---|---|
| FLUX (image) | `generators/flux.ts` | RunPod public endpoint | `RUNPOD_API_KEY`, `RUNPOD_FLUX_*` |
| Wan 2.6 | `generators/wan25.ts` | RunPod public | `RUNPOD_WAN26_*` |
| Seedance 1.5 Pro | `generators/seedance.ts` | RunPod public | `RUNPOD_SEEDANCE_*` |
| HunyuanVideo | `generators/hunyuanVideo.ts` | RunPod custom serverless (ComfyUI) | `RUNPOD_HUNYUAN_ENDPOINT_ID` |
| CogVideoX | `generators/cogVideoX.ts` | RunPod custom serverless | `RUNPOD_COGVIDEOX_ENDPOINT_ID` |
| LTX-2 | `generators/ltx2.ts` | RunPod custom serverless | `RUNPOD_LTX2_ENDPOINT_ID` |
| Grok Imagine | `generators/grokImagine.ts` | xAI REST | `XAI_API_KEY` |
| Nano Banana / Veo 3 | `generators/nanoBanana.ts`, `veo3.ts` | Google Gemini REST | `GEMINI_API_KEY` |
| Kling I2V/R2V | `generators/kling.ts` | Kuaishou REST | `KLING_ACCESS_KEY`/`KLING_SECRET_KEY` |

RunPod core: `generators/runpod.ts` (`api.runpod.ai/v2/{endpoint}`, `rest.runpod.io/v1`). Removal is **not** in
scope; the new layer is additive.

## 3. Proposed provider-neutral media layer (implemented foundation)

Directory `packages/api/src/lib/mediaProviders/`:

| File | Purpose |
|---|---|
| `types.ts` | `ImageGenerationProvider`, `VideoGenerationProvider`, `UGCVideoProvider`, `MediaProvider`, normalized `MediaJobRef`/`MediaJobStatusResult`/`MediaJobStatus`/`MediaUsage`/`NormalizedMediaError`, `MediaProviderError`, `isAcceptableResultUrl`, `toMediaProviderError`. |
| `config.ts` | `readFalMediaConfig()` (default-off), `isFalCapabilityLive()`, `isFalEndpointAllowed()` (allowlist), `falDisabledReason()`. |
| `webhook.ts` | `verifyHmacSha256Signature()` (timing-safe), `WebhookIdempotencyStore`, `buildWebhookIdempotencyKey`. |
| `mockProvider.ts` | Deterministic offline mock for tests/pipeline validation (non-routable `.invalid` URLs). |
| `fal/contracts.ts` | Contracts + normalized↔fal mappers/parsers for the three models. |
| `fal/falMediaProvider.ts` | fal adapter using `@fal-ai/client` queue API via lazy dynamic import; gated. |
| `index.ts` | `getMediaProvider()`, `getMediaProviderStatus()` (defaults to mock). |
| `__tests__/mediaProviders.test.ts` | 18 focused tests. |

**Isolation rule:** routers/UI/business logic depend only on the interfaces. fal's schema appears only in
`fal/contracts.ts`.

## 4. Model contracts (to verify against live fal schemas at enablement)

### 4.1 `fal-ai/flux-2` (image)
Input: `prompt` (required); optional `image_url` / `image_urls`; `image_size` (preset or `{width,height}`);
`num_images`; `seed`; `output_format`. Output: `{ images: [{ url, width, height }] }`. Cost metadata is
provider-supplied; stored as `MediaUsage`, never hard-coded as user pricing.

### 4.2 `minimax/h3-max/image-to-video` (story i2v)
Input: `prompt`, `image_url` (required); optional `end_image_url`; `duration`; `resolution`; `seed`;
`prompt_expansion`. Output: `{ video: { url, ... } }` (+ timing metadata). Timing/metadata stored in `MediaUsage.metrics`.

### 4.3 `veed/fabric-1.0` (UGC talking person)
Input: `image_url`, `audio_url` (required); optional `resolution`. Output: `{ video: { url } }`.

## 5. UGC flow and safety design (design only — not implemented)

1. Presenter image: user-uploaded photo **or** FLUX.2-generated image.
2. Audio: user-supplied or recorded.
3. `veed/fabric-1.0` → lip-synced video.
4. Server-side: result URL validation → isolated R2 persistence → permanent asset record.

Required gates before enablement: explicit consent confirmation; image ownership/permission confirmation;
moderation status on both image and audio; age/safety handling; abuse reporting; AI-generated disclosure;
asset lineage (`sourceImageId`, `audioAssetId`, provider/job IDs); deletion/revocation; per-user rate limits and
generation caps. **No unrestricted face animation**: UGC is disabled by default and must remain so until the
consent/ownership/moderation controls are implemented and separately approved.

## 6. Storage and credit design (design only — no pricing change)

**Storage:** provider output URL → (validate `https`, size/type) → download server-side → upload to an
**isolated non-production R2 bucket/prefix** (`FAL_USE_PRODUCTION_STORAGE=false`) → create permanent Raivstream
asset (`r2Key` + public URL) → serve Raivstream URL. Provider CDN URLs are never stored as permanent assets.

**Credits:** Estimate → Reserve → Settle or Release.
- Reserve an estimated amount at submit (idempotency key = `provider:kind:requestId`).
- Settle to actual provider usage on completion; Release on failure/refund.
- Idempotent webhook/duplicate handling uses `WebhookIdempotencyStore` + a stable reference ID so retries and
  duplicate deliveries cannot double-charge.
- No new credit rate or pricing is added; `story:movie_render = 100` unchanged. Real rates are only defined after
  provider costs are measured and separately approved.

## 7. Safe defaults (all shipped off)

```
FAL_MEDIA_PROVIDER_ENABLED=false
FAL_REAL_PROVIDER_CALLS_ENABLED=false
FAL_IMAGE_ENABLED=false
FAL_VIDEO_ENABLED=false
FAL_UGC_ENABLED=false
FAL_MAX_REQUESTS=0
FAL_USE_PRODUCTION_STORAGE=false
```
`FAL_KEY` is read only inside the transport, server-side, and only when every gate is open. No credential was
added to Git.

## 8. Files changed

New: `packages/api/src/lib/mediaProviders/{types,config,webhook,mockProvider,index}.ts`,
`packages/api/src/lib/mediaProviders/fal/{contracts,falMediaProvider}.ts`,
`packages/api/src/lib/mediaProviders/__tests__/mediaProviders.test.ts`, this document.
Dependency: `packages/api/package.json` + `pnpm-lock.yaml` add `@fal-ai/client@^1.10.1`.

## 9. Tests

- `pnpm --filter @raivstream/api exec vitest run mediaProviders`: **18/18 pass**.
- `pnpm --filter @raivstream/api test`: **298/298 pass** (was 280; +18, no regressions).
- `pnpm --filter @raivstream/api type-check`: clean. `pnpm --filter @raivstream/api lint`: clean.

## 10. Prerequisites for a separate staging implementation task

1. Dedicated non-production fal account/project + dedicated key (not shared with production).
2. Strict spend cap + request cap; image-only for the first pass; video/UGC behind separate approvals.
3. Isolated non-production R2 bucket/prefix.
4. Confirm fal webhook signature scheme against current docs and wire `WebhookVerifier`.
5. Staging-only env file (default-off) with the dedicated key; no production env reuse; no symlinks.
6. Reserve/settle credit implementation + double-charge regression tests before any paid path.
7. UGC consent/ownership/moderation/abuse controls before enabling `FAL_UGC_ENABLED`.
8. Redacting logs; no provider/model/account details exposed to R16 or user UI.
9. Verify live model schemas against `fal/contracts.ts` and adjust mappers.

## 11. Verdict

```
FAL MIGRATION DISCOVERY — COMPLETE
FAL LIVE PROVIDER CALLS — DISABLED
PRODUCTION MIGRATION — NOT AUTHORIZED / NOT EXECUTED
```
