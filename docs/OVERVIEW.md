# Raivstream — Holistic Overview

> One document that explains what Raivstream is, how the product flows end-to-end, and how
> the system is built and operated. Deeper details live in `docs/architecture.md`
> (engineering), `docs/product_roadmap.md` (sequencing), and `SESSION.md` (living session
> record). This file is the entry point.

---

## 1. What Raivstream is

Raivstream is a **generative-AI storytelling and short-form vertical media platform**. A
user takes a raw idea and, through a guided pipeline, produces a complete **story** (narrative
chapters), **scene pictures and videos**, **voice-over narration**, optional **music**, and a
final **movie** — which can then be published to a TikTok-style vertical feed. It runs on a
web app (`app.raivstream.com`) and an R16/Kids variant (`r16.raivstream.com`), sharing one
API and one database.

The product surfaces:

- **Story Playground** — the studio: spark → guided questions → cinematic story → scene
  decomposition → character bible → scene pictures → scene videos → narration → sequence →
  movie builder.
- **AI Studio** (`/generate`) — a lean, fal.ai-only media generator (**FLUX2** images,
  **MiniMax H3 Turbo** video) linked from the feed's Create CTA.
- **Feed / Video** — vertical short-form video with For You/Trending/Following, premium gates,
  kids-safe filtering.
- **Credits & billing** — credit ledger with DB-configurable per-feature rates, Paystack (NGN)
  and Stripe (USD).

---

## 2. The product flow of operation

```
IDEA ──► STORY ──► SCENES ──► VISUALS ──► VIDEO ──► AUDIO ──► MOVIE ──► FEED
```

| Step | What happens | Who/what produces it |
|---|---|---|
| 1. Spark | User types a raw concept (and optional answers to guided questions). | Story Playground |
| 2. Story | Narrative engine expands the concept into a **cinematic 3–5 scene story** with `SCENE n` headings, character bible, scene hints. | Claude (`claude-sonnet-4-5`, canary-gated) with OpenAI-compatible + deterministic fallback |
| 3. Scenes | Story decomposed into scene cards (title, description, director settings). | `story.generateScenes` |
| 4. Visual bible (anti-drift) | ProductionManifest adds `master_style` (style lock), `negative_prompt_suffix`, per-character anchors, and a 5–6s `shots[]` grid. | GPT-4o structurer (`STORY_MANIFEST_STRUCTURER_ENABLED`) |
| 5. Pictures | Per-scene stills generated with the bible locked onto every prompt. | **FLUX2 via fal.ai** (fal-only) |
| 6. Videos | Scene video animated from the picture **or chained from the previous clip's last frame** (I2V continuity); multi-clip shot grid optional. | **MiniMax H3 Turbo via fal.ai** (native audio/SFX) |
| 7. Narration | Per-scene voice-over (and other audio cues). | **ElevenLabs** TTS |
| 8. Movie | Sequence → Film Blueprint → Movie Builder stitches clips + stills + VO + music + native SFX. | ffmpeg worker (`movieRenderWorker.ts`) |
| 9. Publish | Movie/assets published to the vertical feed. | `generation.publish` + feed |

Moderation sits on every generation step: a **local blocklist + OpenAI `omni-moderation`**
gate runs before credits are spent; flagged phrases are now localized and safe rewrites are
suggested.

---

## 3. Architecture at a glance

### 3.1 Monorepo (Turborepo)

```
apps/
  web/        Next.js 15 App Router web app (app.raivstream.com + r16.raivstream.com)
  mobile/     Expo SDK 50 mobile app
packages/
  api/        tRPC v11 router + server-side feature logic (the "backend")
  database/   Prisma schema + generated client
scripts/      Ops/e2e CLI scripts (tsx)
docs/         architecture.md, product_roadmap.md, OVERVIEW.md, adr/
```

### 3.2 Core infrastructure

| Concern | Technology |
|---|---|
| Runtime | Next.js API routes hosting the tRPC router; PM2 (`raivstream-web`); VPS |
| Data | Self-hosted Supabase/Postgres on the VPS (`supabase-db`), direct Postgres on `127.0.0.1:5432` via Prisma |
| Storage | Cloudflare R2 (S3-compatible), public CDN URL pattern |
| Auth | Custom JWT (access/refresh, rotation) + Google OAuth (ID-token) |
| Payments | Paystack (NGN), Stripe (USD); credit ledger + DB-configurable feature rates |
| Proxy / TLS | Caddy |
| Media providers | fal.ai (FLUX2, MiniMax H3, VEED); legacy RunPod/xAI/Kling/Gemini adapters retained |
| AI | Claude (narrative), GPT-4o (manifest structurer), OpenAI moderation, ElevenLabs TTS, Gemini (Lyria music) |
| Local processing | ffmpeg/ffprobe (movie render worker, last-frame extraction, audio mix) |

### 3.3 The API surface (`packages/api/src/routers`)

- `generation.ts` — the AI Studio: create/poll/retry/publish generation jobs.
- `story.ts` — the Story Playground: projects, questions, chapters, scenes, assets, character
  bible, sequence, audio plan/cues, movie builder, shot grid, narration, moderation helpers,
  story completion/regeneration, asset reuse.
- `user.ts` / `admin.ts` / `runpod.ts` — balances, credits, admin (rates, jobs, moderation
  queue), RunPod management.

---

## 4. Key subsystems (read these first)

### 4.1 Media provider abstraction
`lib/mediaProviders/` is the provider-neutral boundary (types, config, fal adapter, webhook,
registry, output validation). **Resolution rule:** mock unless `FAL_MEDIA_PROVIDER_ENABLED=true`
and all per-capability gates open. `MODEL_META` drives the AI Studio model list.

### 4.2 Generation job lifecycle
`lib/generators/index.ts` dispatches `submitGenerationJob`/`pollJobStatus` by model. fal
adapters (`falFlux2`, `falH3Max`, `falVeed`) return `fal:<requestId>`. Jobs persist
retryCount/errorCode/resolution; credits are reserved/settled atomically with refund intents.

### 4.3 Story pipeline internals
- **Narrative engine** — `lib/narrativeEngine.ts` (Claude) behind `storyTextService` (lazy
  Proxy). Canary: `STORY_NARRATIVE_ENGINE_ROLLOUT` percent or `ALLOWLIST`.
- **Production structurer** — `lib/productionStructurer.ts` (GPT-4o JSON) → `ProductionManifest`
  persisted on `StoryProject.productionManifest`.
- **Visual bible** — `lib/visualBible.ts` `applyMasterVisualBible` enforces style/character/
  negative locks on every image + video prompt.
- **VPC2** — `lib/visualPromptComposer/` deterministic prompt composer (style, camera,
  character locks, composition, safety) — the per-shot fallback and the anchor-rich base.
- **Shot clips** — `lib/shotClipEngine.ts` `buildShotClipPlan` + `story.generateSceneShotClips`
  chain (last-frame seeding, resumable).
- **Audio** — `lib/audioPlanning.ts` (AudioPerformancePlan/cues), `lib/audioMixing.ts`
  (deterministic mix filter graph), `lib/elevenLabsTts.ts` (speech), `lib/lyriaMusic.ts`
  (music), all consumed by the movie render worker.
- **Movie render** — `lib/movieRenderWorker.ts` ffmpeg worker: render shots (stills or clips),
  assemble with xfade/concat, mix audio (narration + music + native SFX), verify duration/
  resolution/codec, upload to R2.
- **Moderation** — `lib/promptModeration.ts`: blocklist + OpenAI, `flaggedPhrase` localization,
  `suggestSafeRewrite`.

### 4.4 Key data model (`packages/database/schema.prisma`)

`User`, `StoryProject`, `StoryQuestion`, `StoryChapter`, `StoryCharacterMemory`, `StorySceneSeed`,
`StorySceneAsset` (IMAGE/VIDEO, `shotIndex` for grid clips), `StoryScenePrompt`, `StorySequence`/
`StorySequenceScene`, `AudioPerformancePlan`/`AudioTrack`/`AudioCue`/`AudioAsset`,
`GenerationJob`, `CreditBalance`/`CreditTransaction`/`FeatureCreditRate`/`CreditReservation`,
`MovieRenderJob`/`MovieAsset`/`MovieRenderEvent`, `Video`, `AnalyticsEvent`.

**Migration convention:** tables use camelCase columns matching Prisma fields; new migrations
must `ADD COLUMN "camelCaseName"` (never snake_case — see the 2026-09-22 incident in
`SESSION.md`).

---

## 5. Operational model

- **Deploy:** push to `main` → GitHub Actions `deploy.yml` → atomic `.next-build` swap → PM2
  restart. `.env`/`apps/web/.env.local` are preserved (gitignored); migrations run via
  `prisma migrate deploy`. Pushing `.github/workflows/*` needs the `workflow`-scoped PAT
  (`cred/GAT.txt`, gitignored).
- **Health:** `https://app.raivstream.com/api/health`; `pm2 status raivstream-web`;
  `pm2 logs raivstream-web --lines 40 --nostream`.
- **Canary (Gate E):** daily cron `0 6 * * *` → `/root/raivstream/canary-status.log`
  (`scripts/canary-status.sh`); see `docs/operations/gate-e-canary-observation.md`.
- **DB access:** `docker exec supabase-db psql -U supabase_admin -d postgres` (stdin-pipe;
  `supabase_admin` owns tables, not `postgres`).
- **Credentials:** staged in `cred/fal_env.txt` (gitignored): `FAL_KEY`, `CLAUDE_API`,
  `GPT40_API`, `11_LABS`/`ELEVENLABS_API_KEY`, R2 staging vars, `GOOGLE_CLIENT_ID`.
- **Gate flags:** `FAL_*` (fal media), `STORY_NARRATIVE_ENGINE_ENABLED`/`ROLLOUT`/`ALLOWLIST`,
  `STORY_MANIFEST_STRUCTURER_ENABLED`, `ELEVENLABS_TTS_ENABLED`, `MOVIE_RENDER_*`.
- **Ops scripts:** `scripts/` — canary, ffmpeg timing, audio render checkpoint, fal quality/
  refund, elevenlabs, `complete-truncated-story.ts` (regenerate a project's narrative text).

---

## 6. Where to go next

| Topic | Document |
|---|---|
| Everything engineering | `docs/architecture.md` |
| Product sequencing + status | `docs/product_roadmap.md` |
| Session/incident record | `SESSION.md` |
| MiniMax transport decision | `docs/adr/ADR-002-MiniMax-H3-Transport.md` |
| Gate E canary operation | `docs/operations/gate-e-canary-observation.md` |

**Current status:** Phase 16 (AI Narrative & Production Pipeline) complete; Phase 17
(anti-drift overhaul: Master Visual Bible, I2V continuity, multi-clip shot engine, story
completeness + moderation UX) slices 1–2 shipped. Next: movie wiring for shot clips, then
audio-driven timing.

**Raivstream 5.0 (in progress):** a semantic creative-orchestration layer above the production
infrastructure — "Tell Raivstream what you imagine. It figures out how to make it." Slice 1
(Creative Foundation + Create + Intent: `CreativeProject/Brief/Bible/Memory` + flags + intent
engine + `/create` + `/projects`) and Slice 2 (PLAN: Brief+Bible → scenes→shots→timeline →
Preview, `CreativeProductionPlan` + `creative/production` router + Plan/Preview UI) shipped.
See `docs/RAIVSTREAM_5_PRODUCT_ROADMAP_AND_IMPLEMENTATION_PLAN.md` and
`packages/api/src/lib/creative/`.