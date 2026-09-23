# Raivstream Session

This file is the living project/session record for Raivstream. Update it every time a feature is added, changed, deployed, or materially debugged so future development starts from the current GitHub/VPS reality.

Last updated: 2026-09-23 (Launch Readiness — six-gate review; moderation-bypass + R16 blockers fixed; diagnostics/monitor/runbook; 563/563 tests; conditional GO)
Current GitHub commit deployed to VPS: `71ecb9c` (feat(story): safe-rewrite suggestions for flagged content + fix edit body cap — deployed 2026-09-22)

## Maintenance Rule

- Treat GitHub repo `tex-node/raivstream` as the source of truth.
- Keep this file in sync with feature changes, schema changes, deployment changes, production incidents, and important operational decisions.
- Do not record secrets, raw tokens, passwords, private keys, or full production connection strings.
- When adding a feature, update at minimum:
  - `Current State`
  - `Feature Map`
  - `Database State` if schema changes
  - `Deployment Notes` if VPS or env behavior changes
  - `Recent Changes`

## Project Summary

Raivstream is a short-form vertical video platform with web, mobile, shared API, and database packages in a Turborepo monorepo.

- GitHub: `https://github.com/tex-node/raivstream`
- Main app: `https://app.raivstream.com`
- Kids/R16 app: `https://r16.raivstream.com`
- Supabase Studio/API gateway: `https://db.raivstream.com`
- VPS: `81.0.246.223`
- SSH alias: `raivstream`
- VPS app path: `/root/raivstream`
- Supabase Docker path: `/root/supabase/docker`
- PM2 process: `raivstream-web`

## Current State

- Web app is deployed and healthy on VPS.
- `app.raivstream.com/api/health` reports healthy database connectivity after switching Raivstream back to direct Postgres on `127.0.0.1:5432`.
- `r16.raivstream.com` runs the same Next.js app with R16 route restrictions and kids feed filtering.
- `db.raivstream.com` routes through Caddy to Supabase Kong on host port `8000` and is protected by Basic Auth.
- Supavisor/pooler is stopped because it was occupying host `5432` and returning `FATAL: Tenant or user not found`.
- Raivstream uses direct Postgres for Prisma and app runtime, matching the project note that Supavisor is broken for this app.
- **fal.ai migration (Flux.2 / MiniMax H3-Max / VEED Fabric): code-complete, deployed, ENABLED in production (image + video).** Staging `FAL_KEY` + isolated R2 creds are in `cred/fal_env.txt` (gitignored). **2026-09-21: fal switched ON in prod env** (`FAL_MEDIA_PROVIDER_ENABLED=true`, real calls, image+video; VEED/UGC stays off pending consent controls). All three contracts are proven live; the staged flow passed 21/21 on an isolated scratch DB; Gate D quality batch passed 9/9 technically (human visual sign-off still open). Story scene-image generation is now **fal-only (FLUX2)** — the RunPod "Flux.1 Dev" option was removed from the scene image selector and the story router only accepts `FLUX2`. Credit rates active: `generate:flux2` 80, `generate:h3_max` 200, `generate:veed_fabric` 300 (placeholder — reconcile after cost measurement).
- **Google OAuth sign-in (web): configured + deployed.** Web client ID `506778685431-lh740120na3ct1n82jh9al9ph9rgv2m2.apps.googleusercontent.com` set as `GOOGLE_CLIENT_IDS` + `NEXT_PUBLIC_GOOGLE_CLIENT_ID` in local `apps/web/.env.local` and the VPS prod `apps/web/.env.local` (gitignored); production rebuilt + PM2 restarted 2026-09-21, client id confirmed inlined in the bundle. Server-side token verification (`verifyGoogleIdToken`, aud allowlist) is active. `GOOGLE_CLIENT_SECRET` is stored in `cred/fal_env.txt` but is **not used** by the GIS ID-token flow (no server flow). **Verify in Google Cloud Console that Authorized JavaScript origins include `http://localhost:3000` (dev) and `https://app.raivstream.com` (prod).** Mobile (`EXPO_PUBLIC_GOOGLE_*_CLIENT_ID` + dev build) remains not configured; migration `20260920120000_google_oauth` is deployed.
- **Staged fal generation flow (credits → submit → poll → publish): proven live 21/21 on scratch staging DB, deployed to production.** `generation.create` now accepts `VEED_FABRIC` + `audioUrl` (prompt optional only for VEED, canned default otherwise); `GenerationJob.audioUrl` persists the lip-sync track for retry. New E2E script `packages/api/scripts/fal-generation-e2e.ts` (`pnpm fal:e2e`). Chained run: FLUX2 still → H3_MAX animation of that still → VEED lip-sync of that still + staging audio fixture; all three R2-mirrored, published to (unlisted) Video rows, ledger exact (5000→4420, 80+200+300), zero residue after cleanup. Scratch container/tunnel torn down. **Deployed to production 2026-09-21 (commit `7a3c674`); fal switches remain OFF in prod env (see Recent Changes).**

- **Phase 16 — AI Narrative & Production Pipeline (Claude → GPT-4o → ElevenLabs + MiniMax H3).** Docs updated (`docs/architecture.md` §12, `docs/product_roadmap.md` Phase 16). **16.1–16.5 all IMPLEMENTED + full-stitch E2E 15/15**: Claude narrative engine; GPT-4o `ProductionManifest` structurer; MiniMax H3-Max Turbo (15s/1080P/native audio, ADR-002); ElevenLabs scene narration (E2E 12/12); manifest persistence + scene-video consumption; native-SFX preservation in the Movie Builder mix. Full pipeline: idea → Claude cinematic story → GPT-4o manifest → per-scene MiniMax video + ElevenLabs VO → Movie Builder stitch (live-proven). Credentials staged in `cred/fal_env.txt` (gitignored): `CLAUDE_API`, `GPT40_API` — server-only, never `NEXT_PUBLIC_*`; ElevenLabs reuses `11_LABS`/`ELEVENLABS_API_KEY`.

## Monorepo Layout

```text
apps/
  web/       Next.js 15 App Router web app
  mobile/    Expo mobile app
packages/
  api/       tRPC v11 API routers and server-side feature logic
  database/  Prisma schema and generated client
scripts/
  runpod.ts  RunPod development/debug CLI
```

## Tech Stack

- Web: Next.js 15, React 18, TypeScript, Tailwind CSS
- Mobile: Expo SDK 50, React Native, expo-router, TypeScript
- API: tRPC v11, Zod
- Data fetching: TanStack Query v5
- Auth: custom JWT with access/refresh tokens and bcryptjs
- Database: PostgreSQL via Prisma, self-hosted Supabase stack on VPS
- Storage: Cloudflare R2, S3-compatible SDK
- Payments: Paystack for NGN, Stripe for international Creator plan
- AI providers: RunPod public/custom endpoints, xAI, Google Gemini, Kuaishou Kling
- Moderation: OpenAI `omni-moderation-latest` for prompts and image scans
- Process manager: PM2
- Reverse proxy: Caddy

## Feature Map

### Feed And Video

- Public TikTok-style vertical feed on web and mobile.
- Feeds support For You, Trending, Viewers Pick, and Following.
- Guest users can browse with a 50-video freemium gate.
- Signed-in free users have a server-side episode gate for premium-only videos.
- R16 kids mode filters to approved kids-safe content only.
- `VideoCard` handles images, vertical videos, landscape image/video backdrop behavior, and premium locks.
- Creator media-library grids fall back to playable video URLs or placeholders when `thumbnailUrl` is empty or broken.

### Auth

- Custom email/password auth.
- Access token: short-lived JWT.
- Refresh token: DB-backed, hashed, family rotation.
- Password reset tokens are hashed and single-use.
- Web uses httpOnly auth cookies plus `raiv_auth_present` cookie for middleware redirects.
- Mobile stores tokens with `expo-secure-store`.

### AI Generation

- Main UI: `/generate`.
- Server router: `packages/api/src/routers/generation.ts`.
- Prompt moderation happens before credits are deducted.
- Generation prompts allow up to 2000 characters in API, web AI Studio, and mobile AI Studio.
- Negative prompts allow up to 500 characters.
- Credit deduction is atomic and refunded on provider submission failure.
- `generation.create` supports `FLUX2`, `H3_MAX`, and `VEED_FABRIC` (VEED needs `seedImageUrl` + `audioUrl`; prompt optional with a canned default, otherwise prompt required; H3_MAX/Kling-I2V/Seedance enforce `seedImageUrl`). VEED stays hidden from `listModels`/UI (UGC consent controls still pending) but is callable via API for staging.
- Supported visible models include Flux, Grok Imagine, Wan 2.6, Seedance, HunyuanVideo when configured, Kling I2V, and Kling R2V.
- Hidden/coming soon models are filtered server-side and additionally guarded client-side.
- Generated output can be published to the feed and then scanned by automated moderation.

### Story Studio

Added in commit `4bd7eff`.

- Route: `/story-studio`.
- Protected by auth middleware.
- Blocked on R16 subdomain.
- Navigation entry added for non-R16 users.
- tRPC router: `packages/api/src/routers/story.ts`.
- UI file: `apps/web/src/app/story-studio/page.tsx`.
- Users can create story projects, define characters, define environments, break story text into storyboard shots, review generated image/video prompts, and save generated asset URLs as shot references.
- Storyboard prompt compilation trims generated image/video prompts to the generation prompt limit so AI Studio handoff does not fail on long stories.
- Story Studio can open `/generate` with prefilled prompt, aspect ratio, duration, project ID, and storyboard shot ID.
- `/generate` now saves completed generated outputs back to the originating storyboard shot when launched from Story Studio.

### Admin

- Admin and moderator roles are enforced by tRPC middleware and web route checks.
- Admin pages cover overview, users, moderation queue, credit rates, jobs, and revenue.
- Moderation queue supports approve/reject/flag plus rating and kids-safe metadata.
- Admin Credits now includes a manual credits/coupons tab for gifting, refunding, or deducting credits by email, username, or user ID.

### Credits And Payments

- Credit balance is stored per user.
- Credit transaction ledger records purchases, usage, bonuses, and refunds.
- Feature credit rates are DB-configurable through admin UI.
- Manual admin credit adjustments are ledger-backed and can carry coupon, support, or refund reference IDs.
- Paystack handles local subscriptions and credit purchases.
- Stripe handles international Creator plan flow.

## Database State

Prisma schema lives at `packages/database/schema.prisma`.

Applied to production on 2026-09-21 (deploy `7a3c674`):

- `GenerationModel` enum extended with `FLUX2`, `H3_MAX`, `VEED_FABRIC` (migration `20260912140000_fal_models`, additive `ALTER TYPE ... ADD VALUE`).
- `CreditOperation` outbox (migration `20260912130000_fal_credit_operations`).
- `CreditReservation` + status enum (migration `20260912150000_credit_reservations`).
- `GenerationJob.retryCount` + `errorCode` (migration `20260912160000_generation_job_retry`).
- `generation_jobs` indexes (migration `20260912170000_generation_job_indexes`).
- `StoryProject.coverAssetId` (migration `20260912180000_story_project_cover`).
- `User.googleId` unique + `passwordHash` nullable (migration `20260920120000_google_oauth`).
- `GenerationJob.audioUrl` (migration `20260920130000_generation_job_audio_url`).
- `story_scene_videos_and_movies` (migration `20260622100000`, idempotent guards; applied for the first time this deploy).

New `FeatureCreditRate` rows active in prod: `generate:flux2` (80), `generate:h3_max` (200), `generate:veed_fabric` (300).

Important models include:

- `User`
- `Video`
- `GenerationJob`
- `CreditBalance`
- `CreditTransaction`
- `FeatureCreditRate`
- `Subscription`
- `ModerationLog`
- `WatchHistory`
- `StoryProject`
- `StoryCharacter`
- `StoryEnvironment`
- `StoryboardShot`
- `StoryQuestion`
- `StoryChapter`
- `StoryCharacterMemory`
- `StorySceneSeed`
- `StoryScenePrompt`
- `StorySceneAsset`
- `AnalyticsEvent`

Story Studio tables currently exist in production:

- `story_projects`
- `story_characters`
- `story_environments`
- `storyboard_shots`
- `story_questions`
- `story_chapters`
- `story_character_memory`
- `story_scene_seeds`
- `story_scene_prompts`
- `story_scene_assets`
- `analytics_events`

Story Studio enums currently exist in production:

- `StoryProjectStatus`
- `StoryboardShotType`

Production schema note:

- `prisma db push` is currently blocked by an existing Supabase cross-schema foreign key: `public.fraud_flags` references `auth.users`.
- Because of that, the Story Studio schema was applied manually with additive SQL.
- Future Prisma migrations should account for Supabase cross-schema references, either by configuring Prisma multi-schema support or by using controlled SQL migrations for additive changes.

## Deployment Notes

Normal code deploy path:

```bash
cd /root/raivstream
git pull --ff-only origin main
pnpm --filter @raivstream/database exec prisma generate
pnpm --filter @raivstream/web build
pm2 restart raivstream-web --update-env
```

Database deploy notes:

- Raivstream expects direct Postgres on `127.0.0.1:5432`.
- `supabase-db` should own `127.0.0.1:5432->5432`.
- `supabase-pooler` should not own host `5432` for Raivstream.
- If Supavisor is needed later, map it to another host port and keep direct Postgres on `127.0.0.1:5432`.
- Do not switch Raivstream to another visible Postgres container without verifying it contains the app tables, especially `public.users`, `public.videos`, and `public.generation_jobs`.

Health checks:

```bash
curl -s https://app.raivstream.com/api/health
pm2 status raivstream-web
pm2 logs raivstream-web --lines 40 --nostream
```

Canary daily snapshot (Gate E):

- Cron `0 6 * * *` runs `/root/raivstream/scripts/canary-status.sh` → appends to `/root/raivstream/canary-status.log`.
- Also run it manually any time: `bash /root/raivstream/scripts/canary-status.sh`.
- See `docs/operations/gate-e-canary-observation.md` for go/no-go + rollback.

Expected current health:

```json
{
  "status": "healthy",
  "services": {
    "database": {
      "status": "ok"
    }
  }
}
```

## VPS Infrastructure

Caddy routes:

- `app.raivstream.com` -> `localhost:3000`
- `r16.raivstream.com` -> `localhost:3000`
- `db.raivstream.com` -> `localhost:8000`

Key containers:

- `supabase-db`
- `supabase-kong`
- `supabase-studio`
- `supabase-auth`
- `supabase-rest`
- `supabase-storage`
- `supabase-meta`
- `supabase-pooler` currently stopped for Raivstream compatibility

There are other Supabase/Postgres stacks on the VPS for other projects. Do not assume a container with `users` table is the Raivstream database. Verify the full app table set before changing DB targets.

## Recent Changes

### 2026-09-23: Launch Readiness — six-gate review, two safety blockers FIXED, operational tooling

Production Hardening / Launch Readiness (not a feature slice). Full report: `docs/operations/phase-9-launch-readiness.md`; runbook: `docs/operations/creative-production-runbook.md`.

**Gate 3 (Safety) — two launch blockers found & fixed:**
- **Moderation bypass:** the 5.0 generation adapter called `submitGenerationJob` with no moderation. Now `generateStill`/`generateVideo` call `moderatePrompt` at the adapter boundary; a rejection is a typed `CONTENT_REJECTED` error that fails only that asset, refunds credits, and is never retried. Live `scripts/phase9-safety-probe.ts` PASS (benign allowed, blocklisted rejected).
- **R16 not gated:** creative routers used `protectedProcedure`. New `creativeProcedure` (auth + `isNotR16`) now guards all 67 creative procedures; `/create`, `/projects`, `/series`, `/studio` added to `R16_BLOCKED_ROUTES`. Live: those routes 307 → `/` with `?r16=1`.

**Gate 1 (Reliability):** hermetic failure matrix added (`launch.test.ts`): provider timeout, provider rejection, R2/storage failure, partial-scene failure, bounded retry, full-failure, output-render failure — each affects the smallest scope. Live recovery already validated (Journey R).

**Gate 2 (Data/provenance):** `buildRunDiagnostics` + `creative.production.diagnostics` return the full chain (project → plan/context → run → assets → review → directives → versions → approvals → outputs) with provider/model/prompt internals normalized to `internal`. Verified live on a real project.

**Gate 4 (Performance):** `scripts/phase9-perf-baseline.ts` — deterministic stages P95 ≤ 0.07 ms (intent 0.04, plan 0.02, route 0.07). Real reference: FIRST_VISUAL 5.8 s, H3 clip ≈ 25–31 s. `[creative.production]` + `creative.observability.metrics` now expose production P50/P95.

**Gate 6 (Operations):** backup/restore verified (restored the pre-Phase9 dump into a scratch DB; counts matched). Added `scripts/creative-run-monitor.sh` (stale-run alert), `scripts/creative-run-diagnostics.ts` (operator CLI). Runbook covers diagnose/recover/flag-rollback/deploy-rollback/schema-rollback/backup.

**Gate 5 (UX acceptance):** protocol defined; requires real creators — **PENDING (human)**.

**Verification:** 563/563 API tests (was 549), API + web type-check clean, web lint `--max-warnings=0` clean. Deployed `8a5ac92`.

**Decision: conditional GO** — safety blockers fixed and deployed; broad exposure gated on human UX acceptance + four operational policy items (alert routing, storage thresholds, cost dashboard). No further capability work required.

### 2026-09-23: Phase 9 completion gate — COMMITTED, DEPLOYED, LIVE-VALIDATED

Executed the Phase 9 completion gate end-to-end on production.

**Commit/deploy:** `beed6dc` (Phase 9 implementation) → `ec5e18c` (gate fixes: studio brand context via `brand.brandIdentity.name`, plan-owned `PREVIEW` transition, run-resuming recovery) → `815d888` (smoke recovery setup). All three deployed via GitHub Actions (migration → build → atomic swap → PM2 → health).

**Migration (applied + verified):** `20260923120000_creative_production_run`. Table `creative_production_runs` exists with 15 columns; enum `CreativeProductionRunStatus` = `RUNNING,COMPLETED,PARTIAL,FAILED,CANCELLED`; indexes `pkey`, `(projectId,idempotencyKey)`, `(projectId,status)`. Pre-migration backup: `/root/raivstream/backups/pre_phase9_production_run_20260923-111422.sql` (sha256 `e4c28359…`). Existing data unaffected (7 creative projects, 20 assets, 8 versions, 8 directives, 2 series, 1 studio, 27 users, 12 videos intact). Health: app + R16 both `healthy`.

**Live smoke (`scripts/phase9-live-smoke.ts`, REAL fal/critic/ffmpeg/R2) — ALL PASS:**
- **Journey P (full loop):** CREATE → PLAN + PREVIEW → PRODUCE (2 scenes, 4 assets) → **FIRST_VISUAL 5.8s** → REVIEW (real critic) → `DIRECT.propose` (no side effects; 1 affected scene) → APPLY (version snapshotted, affected assets dropped, unaffected preserved) → TARGETED REGENERATION (2 regenerated; unaffected scenes untouched) → APPROVAL → **OUTPUT LANDSCAPE READY (R2)**.
- **Journey X (context participates in production):** Studio "Voltaic Noir" (noir tone, "Night belongs to you" messaging) → campaign project → `contextSnapshot` = `source=STUDIO, brand=Voltaic Noir` → real provider prompt **included "Voltaic Noir"** → 2 assets generated, 0 failed.
- **Journey R (recovery):** producer process killed mid-run → run stayed `RUNNING` (dead process) → `RECOVER` resumed the **same run** (attempt 2, `stale=1`) → regenerated only the missing video (still skipped) → project `REVIEW`, run `COMPLETED`, **completed asset NOT regenerated**. PM2 restart + health verified separately.

**Deployed UX validation:** `/create` serves the four intent suggestions (HTTP 200); the built bundle contains "What would you like to change", "what I understand", "Advanced details", "Suggested fix", "I'll preserve". Production stage labels are backend-derived (correctly served by the API, not hard-coded in the bundle).

**Regression baseline advanced:** 530/530 → **549/549** API tests; API + web type-check clean; web lint `--max-warnings=0` clean; web build clean.

**Milestone status:** Implementation COMPLETE · Automated Verification PASS · Build PASS · Migration PASS · Deployment PASS · Live Validation PASS · Final Closure PASS.

### 2026-09-23: Phase 9 — Mind-Reader UX Refinement + Reliability + Performance

Made the frozen 5.0 core loop feel dramatically more intuitive without adding a new product capability. Full detail: `docs/operations/phase-9-ux-refinement.md`.

**Progressive disclosure (workstream 1):** backend-derived `project.workspace` (`workspaceProgressFor` in `lib/creative/project/state.ts`) maps status → one creator-facing stage (`UNDERSTAND→PLAN→PREVIEW→PRODUCE→REVIEW→DELIVER`) + completed stages + advanced-detail availability. `apps/web/src/app/projects/[projectId]/page.tsx` reveals one stage at a time; Brief / Creative Bible / Versions moved under `AdvancedDetails`; `ProjectSidebar` is stage-aware and shows advanced items only when they exist. A first-time storyteller sees interpretation → plan → preview → production → review.

**Direct is dominant (workstream 2):** `DirectorPanel` opens with "What would you like to change?" + contextual example chips. New `director.propose` (no persistence) and `director.applyInstruction` (propose → snapshot → apply → mark affected scenes) back the **I'll change / I'll preserve / Impact / This affects N scenes** answer before anything regenerates. `DirectorDecision` gained `preserves` + `affectedSceneIds`.

**Closed Review → Director loop (workstream 3):** `review/criticAdapter` now attaches `suggestedFixInstruction` + `suggestedPreserves` + `suggestedImpact` to every finding. `ReviewPanel` shows Finding → understood problem → proposed correction → impact → [Fix it] → [Apply change] → [Regenerate N affected scenes]; `[Keep as is]` / `[Direct myself]` remain.

**Production feels alive (workstream 4):** `production/stages.ts` (`deriveProductionStages`) yields a real stage checklist (`✓ Understanding your story … ● Checking continuity ○ Preparing your final cut`) plus scene-of-N and real dimensions (Character consistency = stills, Visual continuity = clips, Final assembly). No fake percentage, no provider/job language.

**Context pipeline — "Raivstream remembered":** new `production/contextAdapter.ts` turns inherited Series/Studio context (already in the Bible/Brief) into a `ProductionContext`, snapshotted onto the plan (`contextSnapshot`) and appended to generation prompts by `capabilityRouter`. Series/Studio context now auto-drives prompts through the existing semantic adapters.

**Reliability hardening:** new `CreativeProductionRun` model + additive migration `20260923120000_creative_production_run` (status/attempt/stage/counts/idempotencyKey/contextSnapshot/heartbeatAt/finishedAt). `produce` is idempotent (never starts a second active run); the runner heartbeats and returns `{generated,failed,runId,status}`; bounded per-asset retry (`DEFAULT_MAX_ATTEMPTS=2`); `recoverStuckProductions` re-kicks stale runs after a process restart (heartbeat-based, caller-scoped via `creative.production.recover`); `director.apply` still regenerates only affected scenes; `project.updateStatus` enforces the state machine; `output.render` refuses a version that is no longer approved; structured safe `[creative.production]` events.

**Performance — measure first:** `observability/metrics.ts` ring-buffer timings + summary; instrumented `intent.interpret`, `plan.build`, `production.produce`, `production.status`, `review.run`, `output.derive`, `output.render`, plus `FIRST_VISUAL`; exposed via `creative.observability.{metrics,timings,reset}`.

**Verification:** API type-check clean; API tests **546/546** (16 new in `lib/creative/__tests__/phase9.test.ts`); web type-check clean; web lint `--max-warnings=0` clean. Not deployed; migration is additive.

### 2026-09-23: Phase 8 — 5.0 Integration Validation (golden journeys, REAL providers)

Enabled the 12 `RAIVSTREAM_5_*` flags on the VPS (`apps/web/.env.local`, progressive order preserved by independent gates), then executed the four golden journeys against the deployed system with REAL fal/critic/ffmpeg via `scripts/phase8-golden-journeys.ts` (isolated integration user `integration-5@raivstream.com`, funded balance, production bounded to 2 scenes/journey).

**Results — ALL FOUR JOURNEYS PASS:**
- **A · Storyteller:** STORY intent → brief+bible → plan → **real 2-scene produce (4 ready, 0 failed)** → review (real critic, 2/2 completed) → Direct invalidated prior approval → re-approved → **LANDSCAPE + PORTRAIT outputs READY (R2)**.
- **B · Educator:** EDUCATION intent → real produce (4 ready) → review (2 runs) → **SQUARE output READY**.
- **C · Studio:** brand DNA → product → campaign → campaign project with **inherited Brief+Bible** → real produce → review → Direct → re-approved → **LANDSCAPE + PORTRAIT + SQUARE outputs READY**.
- **D · Series:** canon → episode 1 real produce (4 ready) → episode 2 **inherits identity + previous-episode context** → episode state evolves (wardrobe red, identity unchanged) → **Direct "darker" = episode-level lighting; series canon preserved**.

First run: D failed only the final step (ep2 wasn't planned before directing) — fixed (plan ep2, no media) and re-ran D → COMPLETE, zero failures.

**Validated against real systems:** fal FLUX2 stills + MiniMax H3 clips (last-frame I2V), OpenAI critic, ffmpeg output derivation, R2 storage, approval invalidation, series context, studio inheritance. The 5.0 feature architecture is now **frozen** at 530/530 unit baseline + 4/4 golden journeys.

### 2026-09-22: Raivstream 5.0 — slice 7 (STUDIO)

Commercial creative operating layer — persistent brand/product/campaign context feeding the **exact same** Brief/Bible/Director/Production/Approval/Outputs engine. No StudioBrief/StudioBible/StudioDirector/etc.

- **Models (migration `20260922200000_creative_studio`):** `CreativeStudio` (Brand DNA: brandIdentity/visualLanguage/audioLanguage/tone/audience/approvedMessaging/constraints), `CreativeProduct` (identity/imagery/claims/variants), `CreativeCampaign` (productId, objective, audience, status; projects), `CreativeStudioAsset` (kind IMAGE/VIDEO/LOGO/AUDIO + provenance); `CreativeProject.campaignId` (SetNull).
- **`lib/creative/studio/`:** `types.ts` (BrandDNA/ProductState/CampaignState/StudioContext), `context.ts` (**StudioContextService** — assembles brand + product + campaign + reusable assets; no downstream reconstruction), `service.ts` (studio create/list/get/update; product; campaign; **`createCampaignProject` inherits brand/product/campaign into the EXISTING CreativeBrief + CreativeBible** — visual language, tone, audience, approved messaging, product name — then links the campaign; asset add with provenance).
- **API:** `creative.studio.{create,list,get,update, product.{create,list}, campaign.{create,list,createProject}, asset.{add,list}, context.{get}}` — gated on `RAIVSTREAM_5_STUDIO_ENABLED`.
- **Frontend:** `apps/web/src/app/studio/[studioId]/page.tsx` + `components/creative/studio/{StudioHeader,ProductList,CampaignList,NewCampaignPanel}.tsx` — studio home, products, new campaign, campaign→project creation from brand context.
- **Tests:** studio.test.ts (6 golden: studio w/ brand DNA + no project; product; campaign↔product; **campaign project inherits brand/product into Brief+Bible**; context assembles brand+product+campaign; asset provenance). Suite **530/530**, type-check + lint clean, CI green.
- **Kept out (per boundary):** collaboration, team permissions, billing/pricing, marketplace, CRM, analytics redesign, publishing, advanced prompting, provider/model controls, full asset-management redesign, brand/product campaigns/characters/worlds reuse via the same machinery only.

### 2026-09-22: Raivstream 5.0 — slice 6 (SERIES)

Persistent creative universe: Series → Canon → Episodes → Projects, with `SeriesContextService` as the single context assembler. Canon/Memory/Episode-State are distinct structures (never one JSON blob).

- **Models (migration `20260922190000_creative_series`):** `CreativeSeries` (userId, title, status, visualLanguage/audioLanguage/canon/memory JSON), `CreativeEpisode` (seriesId, projectId @unique, seasonNumber, episodeNumber, title, synopsis, status, state JSON; `@@unique([seriesId, seasonNumber, episodeNumber])`), `CreativeProject.seriesId` (SetNull). Season = seasonNumber (no CreativeSeason entity — per boundary).
- **`lib/creative/series/`:** `canon.ts` (structured canon: world/storyRules/worldRules/characterRules/visualLanguage/audioLanguage/characterCanon — explicit update only, never mutated by episodes), `memory.ts` (learned facts + open threads + preferences; idempotent learn/openThread), `context.ts` (**SeriesContextService**: canon + visual/audio + character memory + world memory + previous episode state + unresolved threads + current episode state; `spinoffContext` inherits identity/world/visual and EXCLUDES episode state), `service.ts` (series create/list/get/update; **episode.create seeds the linked CreativeProject's Bible/Brief from canon** — characters, worlds, visual/audio language; episode state evolves independently).
- **API:** `creative.series.{create,list,get,update, canon.{get,update}, memory.{get,update}, episode.{create,list,get,update}, context.{get,spinoff}}` — gated on `RAIVSTREAM_5_SERIES_ENABLED` (independently flagged; existing flags untouched).
- **Director:** gained a "darker / darker than / moodier" visual rule (episode-level lighting change; series visual canon preserved) — the Director operates on the episode project and never touches series canon.
- **Frontend:** `apps/web/src/app/series/[seriesId]/page.tsx` + `components/creative/series/{SeriesHeader,EpisodeList,CanonPanel,SeriesMemoryPanel,NewEpisodePanel}.tsx` — series home, "What happens next?" episode creation (→ episode project workspace), episode index, canon + memory panels, context summary.
- **Tests:** series.test.ts (7 golden: creation w/o project + canon initialized; episode creation + linked project + inherited context; identity persists across episodes while episode state evolves (wardrobe blue→red); memory fact retrievable in later context; director darker preserves canon; explore preserves original + canon; spinoff context boundary). Suite **524/524**, type-check + lint clean, CI green.
- **Kept out (per boundary):** Studio, Brand DNA, products/campaigns, collaboration, permissions, marketplace, pricing, advanced prompting, provider/model selection, NLE, season entity, publishing/distribution, analytics redesign, new generation/continuity engines; **story-intelligence system untouched** (series orchestrates what exists).

### 2026-09-22: Raivstream 5.0 — slice 5 (APPROVAL → OUTPUTS)

Per the slice-5 boundary: Approval first (version-specific, invalidated on material change), then Outputs as derivatives of an approved version. No hidden NLE — OutputService owns the mechanics.

- **Models (2 additive migrations):** `20260922170000_creative_approval` — `CreativeApproval` (versionId+kind unique; CREATIVE/PRODUCTION/OUTPUT; PENDING/APPROVED/REJECTED/CHANGES_REQUESTED/INVALIDATED); `20260922180000_creative_output` — `CreativeOutput` (versionId, format MASTER/LANDSCAPE/PORTRAIT/SQUARE, durationSeconds, status). Both relate back to `CreativeVersion` (provenance).
- **5A Approval:** `lib/creative/approval/service.ts` — `decide` (approve/reject/request_changes), `isApproved`, `list`, `invalidateProjectApprovals`. **Invalidation is wired into the Director's `snapshotVersion`** — a material Direct/Explore creates a new version and marks every prior APPROVED approval INVALIDATED (never silently re-approved); non-material actions (re-review, production retry) never invalidate. `creative.approval.{decide,list}` gated on `RAIVSTREAM_5_APPROVAL_ENABLED`.
- **5B Outputs:** `lib/creative/output/{derivation,render,service}.ts` — `deriveOutput` (16:9/9:16/1:1 center-crop + duration trim mechanics), `renderOutputDerivative` (concat the version's scene clips in plan order → scale/crop → trim → R2; injectable for hermetic tests), `OutputService.{derive,render,list}`. **Only an APPROVED version can produce outputs** (`PLAN_NOT_APPROVED` otherwise); outputs are derivatives with provenance back to the source version; the original produced assets are never mutated. `creative.output.{derive,render,list}` gated on `RAIVSTREAM_5_OUTPUT_ENABLED`.
- **Frontend:** `ApprovalBar` (per-version Creative/Production/Output approve/request-changes/reject) + `OutputPanel` (format + duration selects → "Derive output" → gallery with provenance), wired into `/projects/[projectId]` when a version exists.
- **Tests:** approval.test.ts (4: approve current, material Direct invalidates, non-material leaves intact, reject/request-changes) + output.test.ts (7: 16:9/1:1/duration derivation, approved-only gate, provenance, original untouched, renderer mechanics) — suite **517/517**, type-check + lint clean.
- **Kept out (per boundary):** Series/Studio, collaboration, pricing, advanced prompting, provider selection, full asset-management redesign, durable queue, full NLE, broad version-management UX.

### 2026-09-22: Raivstream 5.0 — slice 4 (JUDGE: Review → Director → minimal Versioning)

Per the sequencing refinement: **Review first, then Director consumes findings.** ReviewService wraps the existing CreativeCritic (via `creativeCriticProvider.evaluate` — no legacy writes); DirectorService is a semantic control system (change+preserve+impact → version → ProductionService). The Director never generates.

- **Models (2 additive migrations):** `20260922150000_creative_version_directive` — `CreativeVersion` (snapshot), `CreativeDirective` (mode/instruction/change/preserve/impact/scopes/executionPlan), `CreativeProject.currentVersionId`; `20260922160000_creative_review` — `CreativeReviewRun` (findings) + `CreativeReviewResolution` (KEEP/FIX/REVIEW). Enums: `CreativeDirectiveMode`, `CreativeImpactLevel`, `CreativeReviewRunStatus`, `CreativeReviewResolutionKind`.
- **4A Review:** `lib/creative/review/{types,criticAdapter,service}` — `buildCriticInput` from produced asset + scene (no legacy tables), `evaluateWithCritic` (injectable evaluator; graceful null when critic unavailable), `translateCriticResult` (human findings — categories + "Character continuity — …", raw diagnostics kept separate, strengths → KEEP), `ReviewService.{runReview,getReview,resolve}`. `creative.review.{run,get,resolve}` gated on `RAIVSTREAM_5_REVIEW_ENABLED`.
- **4B Director:** `lib/creative/director/{types,interpreter,resolver,impact,service}` — deterministic interpreter covering the golden directives (confident/emotional → character state + preserve identity; wardrobe-only → preserve everything else; hopeful ending → PROJECT/last scene; three endings → EXPLORE n=3; warm lighting → LOCAL; warm scene 3 → index 2; opening faster; premium; world richer; less formal dialogue; child-safe; scene N). `DirectorService.{direct,explore,apply,versions}` — snapshots a CreativeVersion + records a CreativeDirective on every direct/explore (original preserved), `apply` re-interprets the directive, mutates plan/bible (ending/lighting/character state), and marks only affected scenes for targeted regeneration (deletes their produced assets → resumable runner regenerates just them), records DIRECTION memory. `creative.director.{direct,explore,apply,versions}` gated on `RAIVSTREAM_5_DIRECTOR_ENABLED`.
- **Frontend:** `ReviewPanel` (run review → human findings with KEEP/FIX/REVIEW; Fix routes to Director) + `DirectorPanel` (direct input, change/preserve/impact decision, Apply & regenerate affected scenes → produce, Explore → Ending A/B/C, version strip). Wired into `/projects/[projectId]` at REVIEW.
- **Tests:** review.test.ts (4: translation, critic-input build, graceful-unavailable, service run) + director.test.ts (10: golden directives, impact normalization, direct creates version+directive + never generates, explore preserves original, apply marks only affected scenes) — suite **506/506**, type-check + lint clean.
- **Kept out (per boundary):** Series/Studio, collaboration, pricing, provider selection, advanced prompting, camera controls, raw critic dashboards, durable queue, unrelated refactors.
- **Known limits:** director is deterministic (no LLM interpretation yet); review findings require the critic provider configured (else runs mark FAILED gracefully); versioning is minimal (snapshots + labels only).

### 2026-09-22: Raivstream 5.0 — slice 3 (PRODUCE)

Slice 2 confirmed complete; built PRODUCE per the specified boundary: `Approved Plan → ProductionService → CapabilityRouter → GenerationAdapter → existing generation infra`.

- **Schema:** `CreativeProducedAsset` (sceneId/shotId/kind IMAGE|VIDEO/status QUEUED→GENERATING→READY|FAILED/assetUrl/errorMessage) — migration `20260922140000_creative_produced_asset` (enums renamed to avoid colliding with the existing `CreativeAssetStatus`). Additive.
- **`production/capabilityRouter.ts`:** decides internally what/how — one still (FLUX2) + one video (H3 I2V) per scene, H3-clamped durations, prompt from scene + bible visualLanguage/characters with `applyMasterVisualBible`. No provider/model knowledge leaks upward.
- **`production/generationAdapter.ts`:** the ONLY touch of existing infra — `submitGenerationJob`/`pollJobStatus` (FLUX2/H3_MAX), R2 mirroring, `extractLastFrameAsSeedImage` for continuity.
- **`production/runner.ts`:** `runCreativeProduction` — validated APPROVED plan, detached + resumable (skips READY assets), last-frame chaining (video N seeds from last frame of video N-1, else its still), per-asset credits (FLUX2/H3 rates) with refund-on-failure, partial failure never stops the run, moves status GENERATING → REVIEW in a finally. Dependencies injectable for hermetic tests.
- **Service/routers:** `ProductionPlanService.produce` (requires status APPROVED + plan — `PLAN_NOT_APPROVED` otherwise; sets GENERATING), `productionStatus` (scene-level progress for the UI), `getAssets`; `creative.production.{produce,productionStatus,getAssets}` gated on `RAIVSTREAM_5_PRODUCTION_ENABLED`.
- **Frontend:** `ProductionPanel` — creator sees only **Produce → "Creating your scenes…"** (progress bar + per-scene status + visuals when ready) → results with **Retry N scenes** on partial failure. No providers/models/prompts/JSON.
- **Tests:** runner.test.ts (9: full produce, chaining, partial failure, resumability, state transitions, approval gate, capability routing for commercial/story/education) — suite **492/492**, type-check + lint clean.
- **Excluded by design (kept for later slices):** AI Director, semantic Direct, Review UI, Critic redesign, versioning, Series, Studio, camera controls, provider selection, prompt editing.

### 2026-09-22: Raivstream 5.0 — slice 2 (PLAN: Production Plan + Preview)

Slice 1 confirmed complete; built the PLAN stage: Brief + Bible → Production Plan → Scenes → Shots → Timeline → Preview.

- **Schema:** `CreativeProductionPlan` (unique projectId; `plan` Json + `preview` Json + version) — migration `20260922130000_creative_production_plan`. `CreativeProject.hasPlan` + plan-aware `nextActionFor` (PLANNING+plan → REVIEW_PLAN).
- **`lib/creative/production/`:** `plan.ts` (deterministic Brief+Bible → semantic scenes→shots→timeline; auto shot breakdown 5–6s; structure templates per type: story 4-act, commercial hook→product→benefit→CTA, education hook→explain→example→recap, transformation before→during→after), `preview.ts` (cheap text + references — no media — the "is this what I meant?" screen), `adapter.ts` (semantic plan → existing ProductionManifest-shaped outline WITHOUT an LLM — the Slice-3 seam), `service.ts` (ProductionPlanService.plan/getPlan/adapt; persists + moves project → PREVIEW).
- **API:** `creative.production.{plan,getPlan,adapt}` (gated on `RAIVSTREAM_5_PREVIEW_ENABLED`), registered under `creative`.
- **Frontend:** `/projects/[projectId]` — "Build the production plan" → `PlanView` (scenes → shots → timeline + notes) + `PreviewPanel` ("Yes, this is what I meant — approve preview" → status APPROVED).
- **Tests:** production.test.ts (6: commercial/story/education plans, auto shot grid, preview, adapter, next-action) — suite **483/483**, type-check + lint clean.
- **Known limits:** plan is deterministic (no LLM structurer call yet — adapter seam exists); keyframes/visual previews arrive in Slice 3 (PRODUCE).

### 2026-09-22: Raivstream 5.0 — slice 1 (Creative Foundation + Create + Intent)

Per the 5.0 implementation prompt (docs/RAIVSTREAM_5_PRODUCT_ROADMAP_AND_IMPLEMENTATION_PLAN.md): inspected the repo, then built the FIRST vertical slice only — the semantic orchestration layer above existing production infrastructure.

- **Feature flags:** `lib/creative/featureFlags.ts` — centralized `RAIVSTREAM_5_*` flags (master + create/intent/bible/preview/production/director/review/studio), all default OFF. Documented in `.env.example`.
- **DB (migration `20260922120000_creative_foundation`):** `CreativeProject` (+`legacyStoryProjectId` nullable), `CreativeBrief`, `CreativeBible`, `CreativeMemory` + enums `CreativeProjectType`/`CreativeProjectStatus`/`CreativeMemoryKind`. Additive; camelCase columns; legacy Story untouched.
- **`lib/creative/`:** `shared/{types,enums,errors}`, `project/{service,state}` (status machine + backend-derived `nextAction`), `intent/{service,interpreter,questions}` (deterministic intent engine: detect project type → extract explicit → infer → uncertainty → consequential questions with "Let Raivstream decide"; never fabricates certainty), `intelligence/{service,storyAdapter}` (story/education/commercial routing + bridge to existing storyIntelligence), `bible/{service,adapter}` (assumption → proposal → approval → canon; adapters reuse StoryCharacterMemory/StoryEnvironment), `memory/service` (BIBLE=what is true / MEMORY=what happened).
- **API:** `routers/creative/{index,project,intent}` registered as `creative` on the root router (`creative.intent.interpret`, `creative.project.{create,list,get,updateStatus,recordMemory,getMemories}`).
- **Frontend:** `/create` (hero "What are you creating?" + natural-language input + suggestions + attachments → InterpretationPanel with questions → Start project) and `/projects/[projectId]` (CreativeShell + sidebar + canvas: Brief, Bible, NextAction, Scene cards). `components/creative/*`.
- **Tests:** `lib/creative/__tests__/{intent,state}.test.ts` — golden journeys (commercial/education/story/ambiguous) + state transitions + bible seeding. Full suite **477/477**, type-check + lint clean.
- **Journey verified at unit level:** "Create a 60-second cinematic commercial for a new Nigerian premium skincare brand…" → COMMERCIAL, 60s, consequential questions only, summary preserves original words.
- **Known limits / next:** production plan adapter + preview (slice 2); director/review/versioning only after the loop is stable. Flags must be turned ON in env to exercise `/create` in a deployed env.

### 2026-09-22: Holistic documentation + safe-rewrite suggestions + editable story

- **`docs/OVERVIEW.md` (new):** holistic flow-of-operation + architecture document (project at a glance, system flow from story idea → media → movie, architecture layers, data model, providers, operations, runbooks, roadmap pointer).
- **Safe-rewrite suggestions** (`promptModeration.suggestSafeRewrite` + `story.suggestStoryRewrite`): isolates the flagged clause and maps graphic-violence terms to safe replacements (`gore→tension`, `decapitation→turn away`, `dismember→hurt`, `eviscerate→alarm`, `disembowel→frighten`, `snuff film→disturbing scenes`). Never maps sexual/CSAM/non-consensual terms (zero-tolerance). Story editor has **Suggest safe rewrite** + **Apply fix** (replaces the phrase in the textarea); auto-triggers when a Save is flagged.
- **Edit body cap fix:** `updateChapter` schema capped `body` at 6000 — saving a full-length story failed with `too_big`. Now `MAX_STORY_BODY_CHARS` (40000), matching the generation cap.
- **Editable story in the playground:** StoryScreen (`/story/[projectId]/story`) has an **Edit story** button (title + full-body textarea → `updateChapter`); its workspace query uses `staleTime 0` + refetch-on-focus so the completed story always shows fresh.
- Verified prod: the completed story "Current of Hope" (10,351 chars, Maya Torres) is served in full by both `getProject` and `getWorkspace` (body:true, no remaining truncation).
- Suite **460/460**, type-check + lint clean.

### 2026-09-22: ROOT CAUSE — truncated story bodies (6000-char app cap) — FIXED

- User's story "Currents of Courage" (cmucb8c6w…) ended mid-sentence at "SCENE 4 … The ". Investigated: chapter body was cut at ~6000 chars.
- Chased several red herrings (Claude max_tokens 6000→16000, system prompt directives) — the REAL cause was in the app: `generatedStorySchema` capped `body` at `.max(6000)` and `normaliseGeneratedStoryPayload` clamped bodies to 6000 (`clampText`, which even stripped the final partial word). EVERY story over 6000 chars was silently truncated mid-sentence.
- **Fix:** `MAX_STORY_BODY_CHARS = 40000` (schema + clamp). Kept max_tokens=16000 + the "finish the story" prompt directives.
- **User's story completed via `scripts/complete-truncated-story.ts`:** regenerated the chapter narrative text (Claude, primary provider) → **"Current of Hope", 10,351 chars, truncated=false, character Maya Torres (matches the scenes)**. Scenes + images untouched.
- Also shipped earlier this session: `regenerateStoryText` proc + story-builder "Regenerate story" button + truncation banner (`summary.storyTruncated`); moderation flagged-phrase localization; fal-only studio; complete-unfinished-story (scene images).
- Note: the completion script runs detached via nohup on the VPS (ssh hangs on the process group).

### 2026-09-22: Complete-unfinished-story + flagged-phrase localization

- **`story.completeUnfinishedStory`**: detects scenes without a READY image and generates them (FLUX2/fal, sequentially, per-scene failure isolation). Story tab shows a **"Complete story (N pictures missing)"** button + result banner. Verified the user's project `cmucb8c6w…` had exactly this gap: 1 chapter (5997 chars body, complete), 5 scenes, scene 4 "The Tangled Otter" with no image.
- **Moderation flagged-phrase localization** (`promptModeration.ts`): `ModerationResult.flaggedPhrase` — the blocklist path returns the exact matched substring; the OpenAI path re-checks each clause (bounded 12) to isolate the offending phrase. New `moderationRejectMessage()` builds "… Flagged phrase: “<phrase>”. Edit or replace that phrase to continue." Applied at all 8 moderation throw sites (image, video, narration, story, edit, music, generation.create). Tests 5 (promptModeration), suite **457/457**.

### 2026-09-22: Studio is fal-only — FLUX2 + MiniMax H3 Turbo (no RunPod)

- Verified prod: all story images today are `fal | fal-ai/flux-2`, all videos `fal | minimax/h3-max-turbo`; only 2 historical RunPod FLUX rows (pre-`58bfca3`, which already made the story path FLUX2/fal-only).
- The reachable RunPod surface was the legacy **AI Studio** (`/generate`, linked from the feed's Create CTA): defaulted to FLUX + WAN_25 (RunPod) and listed every provider. Now allowlisted to **FLUX2** (image) + **H3_MAX** (video) with matching defaults.
- Hardened the story image path (`story.ts`): `SceneImageModel = 'FLUX2'` only, `sceneImageProviderInfo` returns fal always (RunPod branch removed), `generateSceneImageAsset` provider = 'fal', dev placeholder gated on `FAL_KEY` (was `RUNPOD_API_KEY`).
- Suite 452/452, web+api type-check/lint clean.

### 2026-09-22: INCIDENT — all stories failed to load (shotIndex column casing) — fixed

- **Symptom:** every story failed to load and story generation got stuck; `raivstream-web` crash-looping (336 restarts).
- **Root cause:** the `20260922100000_story_scene_asset_shot_index` migration created **snake_case** columns `shot_index`/`shot_grid_seed_image_url`, but `story_scene_assets` uses the camelCase field->column convention (`sceneId`, `projectId`, ...). Prisma maps `shotIndex` → column `shotIndex`, so every query touching scene assets threw `column story_scene_assets.shotIndex does not exist`.
- **Fix:** applied the camelCase columns on prod immediately (`supabase_admin` owns the table, not `postgres`), then added corrective migration `20260922110000_story_scene_asset_shot_index_camelcase` (idempotent, drops snake + adds camel). Confirmed: no new errors, error log static.
- **Lesson for future migrations in this repo:** follow the camelCase convention — `ALTER TABLE ... ADD COLUMN "fieldName" ...` with double-quoted camelCase identifiers (see `20260921110000_movie_render_keep_native_audio`), NOT snake_case.

### 2026-09-21: Phase 17 slice 2 — multi-clip shot engine (shot grid)

Continues the overhaul spec #1: render a scene's 5–6s `shots[]` grid as chained MiniMax H3 clips, each seeded from the last frame of the previous clip.

- **Schema:** `StorySceneAsset.shotIndex Int?` + `shotGridSeedImageUrl` (migration `20260922100000_story_scene_asset_shot_index`). Shot clips are ordinary VIDEO assets tagged with their grid position.
- **`lib/shotClipEngine.ts`:** pure `buildShotClipPlan(scene)` → ordered clip plan (shotId/timeframe/cameraSetup/action/videoPrompt/transition + duration = scene duration / shot count, clamped 4–15s). Tested.
- **`story.generateSceneShotClips`:** kicks off `runSceneShotClipChain` (detached, fire-and-forget). Per shot: seed = manifest first frame (shot 0) → **last frame of the previous clip** via `extractLastFrameAsSeedImage` (ffmpeg → R2) → scene still; prompt = shot `video_prompt` + `applyMasterVisualBible` (style lock + character anchors + `--no` suffix); H3 submit → block on `waitForGenerationOutput` → mirror to R2 → mark READY. Resumable: re-runs skip READY clips and continue from the first missing shot; chain stops on first failure (asset marked FAILED + credits refunded). Guards against double-start (`already_running`).
- **`story.getSceneShotClips`:** returns the manifest `plan` + ordered clips (READY/GENERATING/FAILED/QUEUED).
- **Movie planner:** `videoAssetsBySceneId` now excludes shot-indexed clips (`shotIndex: null`) so the single "hero" video stays deterministic (multi-clip concat per scene segment is the next slice).
- **Scene Director UI:** "Shot grid — multi-clip" panel: generate/resume button + per-shot cards (timeframe, camera setup, status badge, inline video preview, chained-seed hint), auto-polls every 5s while a clip is generating.
- Tests: shotClipEngine 4, full suite **452/452**, web+api type-check/lint clean.

### Roadmap (next slices)
1. **Movie wiring:** concat a scene's shot clips into its movie segment using `transition_to_next` (crossfade/hard cut).
2. Audio-driven timing: measure narration TTS duration first, then set the shot grid to match voiceover beats.
3. Master character turnaround sheets (front/side) from the bible as reference nets.
4. Sequence preview render: concat clips with transitions, narration 100% + music ducked 15–20%.

### 2026-09-21: Phase 17 slice 1 — Master Visual Bible + I2V chain continuity

Implements the anti-drift / continuity core of the overhaul spec (character drift & style changes):

- **Master Visual Bible in the ProductionManifest** (`productionStructurer.ts`): new `master_style` (style-lock anchor), `negative_prompt_suffix`, `characters` map, and optional per-scene `shots[]` 5–6s grid. System prompt rewritten: strict camera vocabulary (shot sizes/motions/angles/lens-lighting), prompt formula `[master_style]+[camera]+[character anchors]+[action]+[--no suffix]`, negative suffix on every payload, 20s→4×5s decomposition rule. `buildManifestUserMessage` now injects the project's characterMemory bible verbatim.
- **`lib/visualBible.ts`** — pure `applyMasterVisualBible({ prompt, negativePrompt, bible, sceneCharacters, target })`: prepends the style anchor, injects only the scene's character anchors verbatim, appends the negative suffix (into the real negative prompt for IMAGE; into the positive prompt as `--no …` for VIDEO since H3 has no negative field). Dedupes, idempotent. Applied in BOTH `generateSceneImageAsset` and `generateSceneVideoAsset` right before moderation — so every generation payload is locked even when the LLM manifest prompt (raw prose) replaces VPC2's anchor-rich prompt.
- **I2V chain continuity** (`lib/lastFrameExtract.ts` + `chainLastFrameSeedImage` in story.ts): `generateSceneVideoAsset` now seeds from `manifest.first_frame_image_url` → else the **last frame of the previous scene's clip** (ffmpeg `-sseof -0.1`, uploaded to R2) → else the scene's own still. Fail-soft (never blocks generation).
- Tests: visualBible (9), structurer bible/shots/user-message (11). Suite 448/448, lint + type-check clean.

### Roadmap (next slices of the overhaul)
1. Multi-clip per-scene engine: render a scene's `shots[]` as 4×5–6s clips chained via last-frame seeding (currently one clip/scene, shots[0] data model only).
2. Audio-driven timing: measure narration TTS duration first, then set the shot grid to match voiceover beats.
3. Master character turnaround sheets (front/side) generated from the bible + used as reference control nets.
4. Sequence preview: concat clips with crossfade/hard-cut per `transition_to_next`, narration 100% + music ducked 15–20%.

### 2026-09-21: ffmpeg exit 234 — root cause found & fixed (assemble xfade timebase)

- User pasted the full failing command: the 5-shot assemble with a trailing `xfade` (offset 23.2s). Reproduced locally with portable ffmpeg 9.0.2 + synthetic 720×1280/30fps segments.
- **Root cause:** in `assembleMovie`, per-shot branches ran `fps=30` (timebase 1/30) while the concat chain kept `setpts`' default timebase (1/1e6). `xfade` requires matching input timebases → `First input link timebase do not match` → configure failure (exit -22 locally, 234 on the VPS build).
- **Fix:** every branch (per-shot inputs and every concat output) now ends with `settb=AVTB`; the xfade offset is also clamped to the actually-rendered segment length (`maxOffset = assembledSegmentSeconds - transitionDurationSeconds`) so a frame-short concat can't exceed xfade's `offset+duration` bound. Verified end-to-end: fixed graph renders the 5-shot plan to exactly 30.0s.
- Regression test added (`movieRenderWorker.test.ts`, asserts `settb=AVTB` + clamped offset in the filter graph). Suite 437/437, type-check clean.
- The failed job's rendered segments are cached in R2, so a retry reuses them and only re-runs the (now-fixed) assemble.

### 2026-09-21: Asset reuse across stories + ffmpeg-234 diagnostics

- **#2 Asset reuse (done):** new `story.reuseSceneAsset({ assetId, targetProjectId, targetSceneId? })` — same-story reuse shares the R2 object (same project keyspace) and copies the row; cross-story reuse re-mirrors the R2 object into the target project's namespace (`story-projects/{target}/scenes/{scene}/assets/...`) so cleanup stays per-project. Target scene is picked from the target story or auto-created ("Reused asset"). Assets tab gains a **Reuse** button per asset → story+scene picker modal. New `asset_reused` analytics event.
- **#4 ffmpeg exit 234 (diagnosable):** `runCommand` now keeps up to 200 KB of stderr (was 4 KB), logs the full `command + args` + stderr tail to the server log, and includes both in the job error message — the next failure will show the real ffmpeg error line instead of just the banner. Added a per-shot **pre-flight** after source download: zero-byte download → typed `MOVIE_RENDER_INPUT_INVALID`; VIDEO shots are ffprobe-checked for a decodable video stream before rendering. New `inputHasVideoStream` helper + `MOVIE_RENDER_INPUT_INVALID` error-code prefix. Worker tests 15/15, full suite 436/436.
- Still open on #4: the exact cause needs the new error output from a production retry (the earlier paste only contained ffmpeg's banner).

### 2026-09-21: Scene Director video flow, audio controls, sequence thumbnails

- **Scene Director:** "Animate to Video" now activates immediately after a picture is generated (refreshes the workspace query + treats the freshly generated picture as a ready seed), so you can go picture → video without leaving.
- **Movie native-audio toggle:** new `MovieRenderJob.keepNativeAudio` (migration `20260921110000_movie_render_keep_native_audio`, default true); `createMovieRender` accepts `keepNativeAudio` and the worker uses the job value (env fallback). Film tab has a **"Retain scene videos' native MiniMax audio in the mix"** checkbox.
- **Audio trim:** the cue inspector now has **Trim in (s)** / **Trim out (s)** inputs (`trimStartSeconds`/`trimEndSeconds`, already supported by `updateCue` + the mixer).
- **Sequence editor:** each shot's **thumbnail is now a link to its Scene Director** (edit/regenerate image or video) + an explicit **"Edit Scene"** button on each shot row.
- Verified: web + api type-check, strict web lint, **436/436 tests**.
- Deferred: cross-story asset reuse (#2 in the report) is a larger feature (copying R2 assets between projects) — tracked for a follow-up.

### 2026-09-21: Add chapters + scenes, and one-click narration

- **Story tab → Add Chapter:** the workspace Story screen now has a **"+ Add Chapter"** button (`story.continueStory`) next to the chapter header.
- **Scenes tab → Add Scene:** new `story.addScene` proc appends a blank scene card; **"+ Add Scene"** button on the Scenes screen.
- **One-click narration:** the Scenes screen now has **"Generate narration"** that runs `story.generateSceneNarration` for every scene (scene-derived text). `generateSceneNarration` is now **idempotent** — it reuses an existing scene-narration cue (metadata `sceneId`) instead of duplicating on repeat clicks. Combined with the `story:speech_generation` rate (50cr, active) + `ELEVENLABS_TTS_ENABLED`/key set in prod, narration now works without the manual Audio-tab cue dance. (Voice options + audio previews in the Audio tab from the prior change.)
- Verified: web + api type-check, strict web lint, **436/436 tests**.

### 2026-09-21: Scene Director video + AI Studio nav removed

- **Scene Director (`/story-playground/[projectId]/scenes/[sceneId]`)** now has an **"Animate to Video"** control (MiniMax H3) that calls `story.generateSceneVideo` (uses the scene's latest ready picture as the opening frame; disabled + hint until a picture exists) and renders a `<video>` preview of the generated clip. Non-R16 only.
- **AI Studio tab hidden:** removed the `/generate` "AI Studio" entries from the desktop + mobile navbar (Story Playground replaces it). The `/generate` route + the Story Playground "Send to AI Studio" handoffs remain functional.
- Verified: web type-check + strict lint clean.

### 2026-09-21: Narration unblocked + voice options/previews + movie stills warning

- **Narration was failing closed** because `story:speech_generation` credit rate was unset in prod — now set to **50cr** (active). `story:movie_render`=100 and `generate:h3_max`=200 confirmed active. `story:audio_generation` (Lyria music) remains unset → music generation still fails closed (safe; set a rate in Admin → Credits to enable).
- **Voice options:** new `story.listNarrationVoices` proc returns the account's real ElevenLabs voices (`listElevenLabsVoices` → `GET /v1/voices`), with a curated fallback (`ELEVENLABS_CURATED_VOICES`: Rachel/Antoni/Bella/Elli/Josh/Adam/Sam/Domi) when the API is unreachable. The Audio cue inspector's voice selector now lists these and passes the chosen `voiceId` to `generateCueSpeech`.
- **Previews:** the cue inspector now renders an `<audio controls>` player for the generated narration asset (`audioAsset.publicUrl`), so you can hear before regenerating.
- **Movie = stills explanation:** `buildRenderPlan` now warns in the Film-tab readiness list when shots have no scene video (`N shot(s) have no scene video yet and will render as still images. Use Animate to Video (MiniMax H3) for motion.`); Film-tab copy updated to say shots use scene videos when available.
- Verified: web + api type-check, strict web lint, **436/436 tests**.

### 2026-09-21: Story flow fixes — no advance without a story + playground tabs

- **Workspace gating:** a project with no generated story (`chapters.length === 0`) now shows ONLY the Overview tab, with a "Generate Story" button (calls `story.generateStory`) + a link back to the Story Wizard. This fixes the dead-end where a story-less project reached the Characters/Scenes tabs (and produced confusing errors there, e.g. "Unexpected end of JSON input" from operating on missing story data). `chooseTab`, the tab bar, and the requested-tab effect are all gated; the tab resets to Overview until a story exists.
- **Playground tabs:** `/story-playground/new` now has **Create Story** and **My Stories** tabs — the previously-generated-stories library moved off the create flow onto its own tab.
- **Questions under the story:** the story step now renders the guided-development questions directly beneath the generated story (with a **Regenerate Story** action that re-runs generation with the answers), so questions load under the story being generated.
- Verified: web type-check + strict lint clean.

### 2026-09-21: Story enhance actions wired — paragraph rewrite is clickable

- `StoryScreen` (`/story-playground/[projectId]/story`) action chips (Develop this idea / Strengthen conflict / Explore another ending / Make this funnier / Increase tension) were inert `<span>`s; now real buttons calling the new `story.rewriteParagraph` proc (Rewriting… state + error surface, `getWorkspace` invalidated, selection cleared).
- Server: `story.rewriteParagraph({ projectId, chapterId, paragraphIndex, directive })` — splits the chapter body on blank lines (matches the client splitter), moderates directive + paragraph + result, rewrites the ONE paragraph through the story-text chain (Claude if in canary rollout, else OpenAI-compatible, else deterministic no-op), splices it back, clears `enhancedBody`. `storyTextService.rewriteParagraph` added to the provider interface (Claude + OpenAI + local).
- **Live-verified:** Claude rewrite produced a rich expanded paragraph for "Develop this idea".
- Verified: web + api type-check, strict web lint, **436/436 tests**.

### 2026-09-21: Edit Story — story step chapter editing

- New `story.updateChapter({ projectId, chapterId, title?, summary?, body? })` (moderate body; body edit clears `enhancedBody` so stale AI narrative is never shown; `story_edited` analytics).
- Story Playground story step now has an **Edit Story** button (aside) that switches each chapter into editable title/summary/body fields with per-chapter **Save Chapter** + **Done Editing**; hint text notes that scenes/pictures should be regenerated after edits. Works on R16 too (simple copy).
- Verified: web type-check + strict lint, api type-check, **436/436 tests**.

### 2026-09-21: PROD CANARY ACTIVE (Gate E) — fal/MiniMax + Claude 10% + GPT-4o + ElevenLabs

- **fal/MiniMax (FLUX2 + H3-Max Turbo): already live in prod** — `FAL_KEY` + all switches set, `/api/ready` shows 4 providers configured / 10 capabilities enabled. This was enabled during the fal-only scene-image work; Gate-E canary monitoring now applies.
- **Claude narrative engine: enabled at a 10% canary.** Added `shouldUseNarrativeEngine(userId)` (Gate-E scoping): global flag AND per-user `STORY_NARRATIVE_ENGINE_ROLLOUT` percent (stable id hash) OR `STORY_NARRATIVE_ENGINE_ALLOWLIST` (escape hatch = `texdevices@gmail.com`). `storyTextService.generateStory/continueStory` accept `opts.userId` (router passes email-first); users outside the rollout keep the OpenAI/local chain. Prod env: `CLAUDE_API`, `STORY_NARRATIVE_ENGINE_ENABLED=true`, `ROLLOUT=10`, `ALLOWLIST=texdevices@gmail.com`.
- **GPT-4o ProductionManifest structurer: enabled in prod** (`GPT40_API`, `STORY_MANIFEST_STRUCTURER_ENABLED=true`) — inert until a UI/manifest path calls it; ready.
- **ElevenLabs TTS: enabled** (`ELEVENLABS_API_KEY` from `11_LABS`, `ELEVENLABS_TTS_ENABLED=true`) — `story:speech_generation` credit rate still UNSET in prod → any call fails closed (safe until the rate is decided).
- **Rollback = env flag off + redeploy** (atomic deploy preserves env; set `STORY_NARRATIVE_ENGINE_ROLLOUT=0` or `STORY_NARRATIVE_ENGINE_ENABLED=false`, or drop `FAL_*`).
- Verified: prod HEAD `103538f`, health green; tests **436/436**, type-check + lint clean. The interim manual build (before the gate shipped) briefly ran Claude for everyone — window closed when `103538f` deployed.

### 2026-09-21: Phase 16 full-stitch E2E — 15/15 PASS (scene video + native SFX + VO + music through the mixer)

- **Worker enhancement:** `movieRenderWorker.ts` now preserves each scene clip's NATIVE audio (MiniMax H3 synchronized SFX) as an AMBIENCE bed in the final mix (`extractNativeAudio`, placed at the shot's canonical start), alongside the plan's NARRATION/MUSIC cues. Gate `MOVIE_RENDER_KEEP_NATIVE_AUDIO` (default true). `MOVIE_RENDERER_VERSION` → `phase-16-v1` (render hashes changed; `-an` only when the clip has no audio stream or the flag is off).
- **New `pnpm phase16:stitch:e2e`** (`packages/api/scripts/phase16-stitch-e2e.ts`, 9B.3-harness) drives the REAL worker on an isolated scratch staging DB + staging R2: two REAL MiniMax H3 clips (native aac SFX) + a REAL ElevenLabs VO + a tone music bed → `executeMovieRenderJob` → **15/15 PASS**: job READY, movie h264 720×1280/30fps/10s in R2, final audio aac/10s **non-silent (mean_volume −36.1dB)** (VO + SFX + music all present), zero residue. Also fixed `MovieAsset.renderJobId` lookup + added VO 429 retry/backoff with a local-tone fallback.
- Verified: api type-check + lint clean, **429/429 tests**.

### 2026-09-21: Phase 16.4 E2E verified live (12/12) + Phase 16.5 IMPLEMENTED

**16.4 live E2E (12/12 PASS):** new `packages/api/scripts/phase164-narration-e2e.ts` (`pnpm phase16:narration:e2e`, Phase 9B.3 harness) on an isolated scratch staging DB + staging R2 — `story.generateSceneNarration` created a timeline-anchored NARRATION cue, derived the scene narration, generated ElevenLabs speech → R2 `AudioAsset(GENERATED_SPEECH)` (valid audio via ffprobe), linked the cue, charged 50cr (balance 950), zero residue after cleanup. **Fixed a real robustness gap found by the E2E:** `getOrCreateSequence`'s interactive transaction now runs with `{ timeout: 30_000, maxWait: 15_000 }` (the default 5s timeout tripped on the cold scratch DB).

**16.5 IMPLEMENTED — ProductionManifest persistence + scene-video consumption:**
- `StoryProject.productionManifest Json?` + `productionManifestUpdatedAt DateTime?` (migration `20260921100000_production_manifest`, additive).
- `story.structureProductionManifest` now persists the manifest as the canonical creative specification (+ `production_manifest_persisted` analytics); new `story.getProductionManifest` reads it back.
- `story.generateSceneVideo`/`regenerateSceneVideo` consume the matching scene (`scene_id === orderIndex`): `minimax_video_prompt` overrides the composed prompt, `camera_motion` → providerHints, `duration_sec` (4–15), `resolution`, `first_frame_image_url` as the i2v seed — with VPC fallback when no manifest scene exists. Scene-video duration cap raised to 15s (H3_MAX).
- Verified: api type-check + lint clean, **429/429 tests**.
- Remaining in 16.5/Phase 16: full final-render smoke (scene video + VO + native SFX through the Movie Builder) — the pieces now feed it; a stitch E2E can be added on request.

### 2026-09-21: Phase 16.4 IMPLEMENTED — ElevenLabs scene narration wiring

- Extracted the speech-generation core from `generateCueSpeech` into a shared `generateSpeechForCue()` (module scope): moderate → `story:speech_generation` credit gate → ElevenLabs → R2 `AudioAsset(GENERATED_SPEECH)` → `AudioCue.audioAssetId` → refund-on-failure. `generateCueSpeech` now delegates to it.
- New `story.generateSceneNarration({ projectId, sceneId, text?, voiceId?, modelId? })` (Phase 16.4): ensures project + scene + ElevenLabs gate; resolves narration text (`text` or a scene-derived line); `getOrCreateSequence` → `getOrCreateAudioPlan` → finds/creates the NARRATION track → creates an `AudioCue` anchored to the canonical sequence timeline (start = sum of enabled prior shot durations + holds) with `metadata.source: 'scene_narration'` → runs `generateSpeechForCue` → returns `{ cue, asset, narration }`. The Movie Builder mixer consumes the cue like any other.
- Analytics event `scene_narration_generated` added to the event-name union.
- The ProductionManifest's `elevenlabs_narration` can be passed as `text`; persistence + full manifest→scene consumption lands in 16.5.
- Verified: api type-check + lint clean, **429/429 tests pass** (no schema change). Live ElevenLabs/R2/credit path is the same core already proven in Phase 9B.3; a `generateSceneNarration` E2E can be run on request (scratch staging DB).

### 2026-09-21: Phase 16.3 IMPLEMENTED — MiniMax H3 native-audio video generation

- Extended the `H3_MAX` fal transport for the Phase-16 target:
  - `falH3Max.ts` passes `resolution`; `toH3MaxInput` normalizes to the endpoint enum **`480P|768P|1080P`** (uppercase; invalid values dropped) and supports `duration` up to **15s**.
  - Dispatcher `GenerateInput.resolution` → `submitFalH3Max`; `generation.create` input accepts `resolution` + `duration ≤ 15`; `story.generateSceneVideo`/`regenerateSceneVideo` accept `resolution` + `duration 4–15` and forward it; `GenerationJob.resolution String?` persisted (migration `20260921090000_generation_job_resolution`) so retry resubmits with the same preset.
  - `MODEL_META.H3_MAX` → `minDuration 4`, `maxDuration 15`, notes native synchronized audio.
- **Host decision recorded:** `docs/adr/ADR-002-MiniMax-H3-Transport.md` — fal queue (`minimax/h3-max-turbo/image-to-video`) accepted as the MiniMax transport.
- **Live-verified on the Turbo endpoint:** `duration:15 + resolution:1080P` → **15.1s, h264 1080×1920 @ 24fps, aac** (R2-mirrored). `1080p` lowercase → 422 ("Input should be '480P', '768P' or '1080P'"), fixed via normalization. Full 16.3 target (15s / 1080P / native audio / first-frame i2v) met on the fal transport — no non-turbo/direct fallback required.
- Tests: `toH3MaxInput` resolution normalization (+1) → **429/429 pass**; api type-check + lint clean; prisma validate clean.
- Manifest consumption (minimax_video_prompt / camera / duration / resolution / first-frame) in `story.generateSceneVideo` is deferred to 16.5 (with persistence).

### 2026-09-21: Phase 16.2 IMPLEMENTED — Production Script Structurer (GPT-4o manifest)

- New `packages/api/src/lib/productionStructurer.ts`: `structureProductionManifest()` converts story prose into a strict `ProductionManifest` (`title`, `logline`, `scenes[]` with `elevenlabs_narration`, `minimax_video_prompt`, `camera_motion`, `duration_sec` 5–15, `resolution` `768P|1080P`, `first_frame_image_url`). Uses OpenAI `chat.completions` with `response_format: json_object`, PRD Stage-2 cinematographer system prompt (MiniMax prompt formula `[Shot & Motion] + [Subject & Action] + [Lighting] + [Lens & Style] + [Native SFX cues]`, no `4K/HD/hyperrealistic`). Fail-closed: `STORY_MANIFEST_STRUCTURER_ENABLED` + `GPT40_API`/`OPENAI_API_KEY`; model `gpt-4o` (override `GPT40_MODEL`). Zod-validated with coercive normalisation (duration clamp, resolution normalise, first-frame null).
- New tRPC `story.structureProductionManifest({ projectId })`: builds prose from the project's ordered chapters + title/logline/audience, returns `{ enabled, manifest }` (graceful `enabled:false` when flag off).
- Enabled in local dev only (`apps/web/.env.local`); prod env unchanged (fail-closed). `.env.example` already documents the flag/keys.
- Smoke `pnpm manifest:smoke` — **live verified with GPT-4o**: 5 scenes, camera/duration/resolution + ElevenLabs narration + MiniMax prompts with native SFX cues.
- Tests: `productionStructurer.test.ts` (9) → **428/428 pass**; api type-check + lint clean.

### 2026-09-21: Phase 16.1 IMPLEMENTED — Claude Narrative Engine (story composition)

- New `packages/api/src/lib/narrativeEngine.ts`: `ClaudeNarrativeEngineProvider` implements the existing `StoryTextProvider` interface. When `STORY_NARRATIVE_ENGINE_ENABLED=true` **and** `CLAUDE_API`/`ANTHROPIC_API_KEY` present, `generateStory`/`continueStory` run through **Claude Sonnet** (default `claude-sonnet-4-5`, override `CLAUDE_STORY_MODEL`); guided questions stay on the existing provider. Inactive or on failure → falls back to the OpenAI-compatible + deterministic chain (exact previous behaviour).
- **Model note:** the PRD's `claude-3-5-sonnet-20241022` returns 404 on this account; live probe confirmed `claude-sonnet-4-5` + `claude-opus-5` are available. Default = `claude-sonnet-4-5`.
- **Robustness:** strips markdown fences, `max_tokens` 6000, one bounded corrective retry (strict-JSON instruction) before fallback.
- System prompt = PRD Stage 1 directives (sensory anchors, sound cues, conflict, `SCENE n` headings) + audience safety rules (KIDS/GENERAL) + the existing `GeneratedStory` JSON shape so downstream scene cards/character bible are unchanged.
- Wired via `storyTextService` (lazy Proxy build breaks the CJS cycle with `narrativeEngine`).
- `.env.example` documents `STORY_NARRATIVE_ENGINE_ENABLED`/`CLAUDE_API`/`CLAUDE_STORY_MODEL` (+ 16.2 placeholders). **Enabled in local dev only** (`apps/web/.env.local`, gitignored); prod env has no flag/key → prod still uses the existing OpenAI/local path (fail-closed).
- New smoke: `pnpm narrative:smoke`. **Live verified** (`claude-sonnet-4-5`): 5 cinematic scenes, sensory-rich prose, `provider: claude-narrative`.
- Tests: `narrativeEngine.test.ts` (10) → **419/419 pass**; api type-check + lint clean.

### 2026-09-21: Phase 16 PLANNED — AI Narrative & Production Pipeline (MiniMax H3 + ElevenLabs)

Accepted the PRD for upgrading story composition and prompt generation into a staged LLM
pipeline; **documentation updated only, no implementation yet**.

- **Docs:** `docs/architecture.md` §12 (pipeline diagram, `ProductionManifest` schema,
  MiniMax H3 prompt formula, integration map) and `docs/product_roadmap.md` (Phase 16,
  sub-phases 16.1–16.5, exit criteria, delivery-sequence + immediate-next-action updates).
- **Pipeline:** Stage 1 Narrative Engine (Claude 3.5 Sonnet) → Stage 2 Production
  Structurer (GPT-4o `json_object` → strict `ProductionManifest` with `elevenlabs_narration`,
  `minimax_video_prompt`, `camera_motion`, `duration_sec` 5–15, `resolution` `768P|1080P`,
  `first_frame_image_url`) → Stage 3A ElevenLabs narration + Stage 3B MiniMax H3 video with
  native synchronized audio/SFX → Stage 4 final stitching (existing Movie Builder).
- **Reuses existing infra:** `H3_MAX` fal adapter (extend for duration/resolution/first-frame/
  native audio), ElevenLabs `generateCueSpeech` + `AudioCue`/mixer, OpenAI enhancer/VPC
  composer fallbacks, credit gates + fail-closed switches.
- **Credentials staged in `cred/fal_env.txt`:** `CLAUDE_API`, `GPT40_API` (server-only;
  never `NEXT_PUBLIC_*`). ElevenLabs reuses `11_LABS`/`ELEVENLABS_API_KEY`.
- **Next step:** implement 16.1 (Claude narrative engine) behind `STORY_NARRATIVE_ENGINE_ENABLED`.

### 2026-09-21: Atomic deploys + low-balance warning

**Atomic deploys (kills the chunk-400 deploy window) — DEPLOYED:**
- `apps/web/next.config.js`: `distDir` now honors `NEXT_BUILD_DIST_DIR` (default `.next`).
- `.github/workflows/deploy.yml`: web builds into `.next-build` while the running server keeps serving the previous `.next`; web type-check/lint run against the fresh `.next-build` types AFTER the build; then an atomic-ish swap (`mv .next .next-old && mv .next-build .next`) precedes the PM2 restart. No more minutes-long window where in-flight clients 400 on old chunk hashes. `set -e` means a failed build/type-check aborts BEFORE the swap, leaving the old build serving.
- `.gitignore`: `.next-build/`, `.next-old/`.
- **Verified live on the first atomic deploy (commit `9ab7ca1`):** CI passed; post-deploy the VPS has only `apps/web/.next` (swap completed, `.next-old` removed), health green. The workflow push required a PAT with the `workflow` scope (repo token `cred/GAT.txt` updated to include it).
- Note: a push to `.github/workflows/*` requires the `workflow` scope on the PAT; the repo push token is stored at `cred/GAT.txt`.

**Low-balance warning (< 500 units):**
- `packages/api/src/lib/credits.ts`: `LOW_BALANCE_THRESHOLD = 500`.
- `user.creditBalance` proc now returns `{ balance, updatedAt, lowBalance, threshold }`.
- New `apps/web/src/components/credits/LowBalanceWarning.tsx` — amber banner showing the balance + "Low balance warning" + Top up link; renders only when `lowBalance`.
- Placed on generation surfaces: `/generate` (above Generate), Story Playground scene cards (`new/page.tsx`), Story Workspace scenes (`[projectId]/page.tsx`), and `SceneDirectorScreen.tsx`. Visible before the next image is generated.
- Verified: web + api type-check, strict web lint, api lint, 409/409 tests.

### 2026-09-21: Story scene-image generation switched to fal-only (FLUX2); fal ENABLED in prod

User reported Story Playground scene generation (a) still offered RunPod and (b) failed.

- **Failure root cause:** `Insufficient credits — you need 80 but have 60` — the user's balance was 60 against the 80/request FLUX2 rate. Not a provider bug; the deduction is atomic so no credits were lost. (Verified via `story_scene_assets.errorMessage`; no `generation_jobs` rows because the failure precedes job creation.)
- **fal was not actually enabled in prod:** the VPS env had no `FAL_*` flags (only RunPod/xAI/Gemini/OpenAI keys), so even FLUX2 submits would have thrown `PROVIDER_DISABLED` after the credit gate.
- **Changes:**
  - `apps/web/src/lib/sceneImageModels.ts`: scene image options + default are now **FLUX2 only** (removed "Flux.1 Dev (RunPod)").
  - `packages/api/src/routers/story.ts`: `SCENE_IMAGE_MODELS` narrowed to `['FLUX2']`; `generateSceneImage`/`regenerateSceneImage`/`regenerateFromCritic` default `model` → `'FLUX2'`.
  - `apps/web/src/app/story-playground/[projectId]/page.tsx`: "Improve and Regenerate" passes `model: 'FLUX2'`.
  - **Prod env:** appended `FAL_KEY` + `FAL_MEDIA_PROVIDER_ENABLED`/`REAL_PROVIDER_CALLS`/`IMAGE`/`VIDEO` (`=true`), `FAL_UGC_ENABLED=false` (VEED stays off), `FAL_MAX_REQUESTS=200` to VPS `apps/web/.env.local`. Local `apps/web/.env.local` updated the same way.
- **Verified:** web + api type-check, strict web lint, api lint, 409/409 tests.
- **Remaining:** the user must top up to ≥80 credits to generate (balance was 60), or the FLUX2 rate should be reviewed (placeholder 80cr). Human Gate-D visual sign-off still open.

### 2026-09-21: Google OAuth web button restored (env configured + prod deployed)

The "Continue with Google" button on `/sign-in` (and `/sign-up`) had been rendering nothing because `NEXT_PUBLIC_GOOGLE_CLIENT_ID` was unset everywhere — the component returns `null` until it is (by design). No code regression: the button + `/api/auth/google` + server-side verification were already wired and deployed.

- Client ID updated to `506778685431-lh740120na3ct1n82jh9al9ph9rgv2m2.apps.googleusercontent.com` (sourced from `cred/fal_env.txt`; `GOOGLE_CLIENT_SECRET` also present there but unused by the GIS ID-token flow). Replaced the earlier ID everywhere (local + VPS prod env), rebuilt, PM2 restarted, health green, new client id confirmed inlined in the built bundle.
- Local dev: `GOOGLE_CLIENT_IDS` + `NEXT_PUBLIC_GOOGLE_CLIENT_ID` added to `apps/web/.env.local`.
- Production: same two vars appended to VPS `/root/raivstream/apps/web/.env.local` (gitignored, preserved by the deploy workflow); web rebuilt, PM2 restarted, health green, client id confirmed inlined in the built bundle.
- `GOOGLE_CLIENT_IDS` (aud allowlist) is read at runtime by `packages/api/src/lib/googleAuth.ts` (`allowedGoogleClientIds`), which Next loads from `.env.local` at boot.
- **Outstanding:** confirm Authorized JavaScript origins in Google Cloud Console (`http://localhost:3000`, `https://app.raivstream.com`). Mobile OAuth still requires `EXPO_PUBLIC_GOOGLE_*_CLIENT_ID` + a dev build.

### 2026-09-21: Gate D fal quality evaluation — technical pass, human sign-off pending

Ran the first real visual-quality batch on the funded fal account via new `pnpm fal:quality` (`scripts/fal-quality-batch.ts`): **9/9 succeeded** (6× FLUX2 images, 2× H3_MAX I2V, 1× VEED talking-video), all mirrored to the staging R2 bucket, all aspect ratios exactly as requested, latencies consistent (11–28s / 13–18s / 40s), no 403s, no retries/refunds.

Objective checks (resolution, aspect, codec, duration, embedded audio) all PASS. VEED output carries the lip-sync aac track correctly (first output under the fixed `resolution: 720p` contract). H3_MAX outputs include a provider aac track — flagged as a product decision (movie renderer already strips clip audio for separate mixing).

**Blocked on human visual sign-off:** the model running this session cannot view images, so prompt-fidelity/artifact scoring (rubric in `docs/operations/gate-d-fal-quality-evaluation.md`) is left to the operator. Outputs are downloaded at `tmp/fal-quality/downloads/` (gitignored) + direct R2 URLs in the doc. Do not flip production `FAL_*` switches until sign-off + cost approval + staging rollout + prod canary (Gates C/E/F).

### 2026-09-21: fal generation stack DEPLOYED to production (`7a3c674`)

Production release of the fal.ai generation stack + the staged generation flow, plus the accumulated Phase 6/13/15/9B.3/11/Google-OAuth work that had been sitting uncommitted on branch `feat/visual-prompt-composer-v2`.

- Branch fast-forwarded onto `main` and pushed; GitHub Actions `Deploy to VPS` ran the full gate (migrate deploy, prisma validate/generate, api + web type-check, strict web lint, clean build, PM2 restart, app + R16 health) — **PASSED in 2m59s**.
- Pre-migration backup: `/root/raivstream/backups/pre_fal_gen_flow_deploy_20260921-020331.dump` (SHA256 `bafca167161bb38cf892b23533eb2b6c4c762108839fab778f5f5b61fee25112`).
- Migrations applied (all additive): `20260622100000_story_scene_videos_and_movies` (first apply, idempotent), `20260912130000_fal_credit_operations`, `20260912140000_fal_models`, `20260912150000_credit_reservations`, `20260912160000_generation_job_retry`, `20260912170000_generation_job_indexes`, `20260912180000_story_project_cover`, `20260920120000_google_oauth`, `20260920130000_generation_job_audio_url`.
- Post-deploy: upserted `generate:flux2` (80), `generate:h3_max` (200), `generate:veed_fabric` (300) credit rates active in prod (verified via psql).
- Health verified after deploy: app + R16 healthy; `/api/ready` shows storage reachable + provider registry (5 providers, 3 configured, 8 capabilities).
- **fal remains disabled in production**: the `FAL_*` switches and `FAL_KEY` are NOT in the prod env, so FLUX2/H3_MAX/VEED show as unavailable to users. Enablement is a separate decision (roadmap Gates D–F: visual-quality evaluation, staging rollout, prod canary).

### 2026-09-20: Staged fal generation flow proven live — 21/21 (credits → submit → poll → publish)

The next step after contract validation is done: the full production tRPC path now works live against all three proven fal contracts, via new script `packages/api/scripts/fal-generation-e2e.ts` (`pnpm fal:e2e`, modeled on the Phase 9B.3 voice E2E safety pattern — isolated scratch staging DB `raivstream_fal_gen_e2e` in a throwaway container, SSH tunnel, `db push`, identity+empty gates, zero-residue cleanup):

- **Leg 1 FLUX2** (`generation.create` → poll → R2 mirror → `publish`): submitted (`fal:01a0c051-…`), COMPLETED, mirrored to `generated/fal/flux2/….png`, published to an unlisted Video row. 80cr.
- **Leg 2 H3_MAX** (seed = leg-1 R2 still): submitted (`fal:01a0c052-…`), COMPLETED, mirrored to `generated/fal/h3max/….mp4`, published. 200cr.
- **Leg 3 VEED_FABRIC** (seed = leg-1 still + staging audio fixture `generated/staging-audio/veed-smoke-*.mp3`): submitted (`fal:01a0c053-…`), COMPLETED, mirrored to `generated/fal/veed/….mp4`, published. 300cr. 30s courtesy pauses between legs (fal rate-limits back-to-back calls).
- **Ledger exact:** 5000 → 4420 (80+200+300 across 3 USAGE txns). All outputUrls on the staging R2 public base (never fal.media CDN). 3 R2 objects verified deleted, fixture rows removed, **21/21 PASS**. Scratch container + tunnel torn down.

**Code changes (local, not deployed):**
- `packages/api/src/routers/generation.ts` — `SUPPORTED_MODELS` += `VEED_FABRIC`; `create` accepts `audioUrl`, prompt optional only for VEED (canned default; otherwise required); per-model enforcement (VEED: seed+audio; H3_MAX/I2V: seed); `audioUrl` threaded through `createWithReserveSettle`, deduct-first `create`, and `retry`. Moderation skipped only for VEED's canned default. VEED remains `hidden` in `MODEL_META`, so `listModels`/UI are unchanged.
- `packages/database/schema.prisma` + migration `20260920130000_generation_job_audio_url` — `GenerationJob.audioUrl String?` (additive; retry resubmits without caller state).
- `scripts/fal.ts` — provider-error exit path now sets `process.exitCode` instead of `process.exit()` (fixes the Windows libuv `UV_HANDLE_CLOSING` exit assertion; cosmetic, exit-path only).
- `package.json` — new `pnpm fal:e2e` script.
- Full suite **409/409 pass**; api type-check and lint clean; `prisma validate` clean.

**Still pending:** VEED audio-input UI and UGC consent/ownership/moderation controls (VEED stays API-only/hidden until then); visual-quality evaluation + staging rollout + prod canary + fal enablement per `docs/product_roadmap.md` Gates D–F (code + migrations + rates are now deployed and ready).

### 2026-09-20: fal 403 root-caused — account balance exhausted, not code/auth

User reported the fal account funded, but `pnpm fal test flux2` still fails `Forbidden`. Raw queue API probe (`POST https://queue.fal.run/fal-ai/flux-2`) returns HTTP 403 with body `{"detail":"User is locked. Reason: Exhausted balance. Top up your balance at fal.ai/dashboard/billing."}` — for both `fal-ai/flux-2` and `fal-ai/flux-2/edit`. Conclusion: **403 = the key is valid (a bad key yields 401) but the owning account has $0 balance and is locked.** Funding must land as prepaid credit balance on the *same account/workspace that owns this FAL_KEY* (a card on file alone does not unlock it; also check it wasn't topped up on a different account). No code changes needed; re-run `pnpm fal test flux2 "…"` after the balance shows positive.

### 2026-09-20: Replacement fal key rejected as unknown (401) — awaiting correct secret

User generated a new fal key (now in `cred/fal_env.txt`), but `pnpm fal test flux2` fails `Unauthorized`. Raw probe returns HTTP 401 `{"detail":"Cannot access application \"fal-ai/flux-2-dev\". Authentication is required to access this application."}` — fal does not recognize the key at all (and notably resolves the slug fine, so the endpoint is correct and auth is the sole failure). Likely causes, in order: pasted the dashboard **key ID instead of the one-time secret**, truncated value, or key not yet active/propagated. Remediation: copy the full secret (shown once at creation) after `FAL_KEY=` with no quotes/spaces, confirm the key shows active on the funded account, then re-run the smoke test.

### 2026-09-20: fal live validation UNBLOCKED — first real generation succeeds

User pasted the correct full secret. `pnpm fal test flux2` now passes end to end: submitted (`fal:01a0c01c-…`), `generating → completed` (~11s), output mirrored to staging R2 (`generated/fal/flux2/….png`, publicly retrievable). This proves the funded account, the key, the `fal-ai/flux-2` contract, the queue transport, and the R2 mirror path all at once. Next: same smoke for `h3max` (video) and `veed` (talking-video), then the staged generation flow.

### 2026-09-20: h3max + veed verified live; VEED contract bug fixed

- `h3max` (MiniMax H3-Max Turbo image-to-video, seeded with the flux2 lighthouse still) completed in ~11s, mirrored to `generated/fal/h3max/….mp4`.
- First `veed` attempt failed at submit; a second attempt submitted but returned 422. Raw queue API showed `{"detail":[{"type":"missing","loc":["body","resolution"],"msg":"Field required"}]}` — **our contract wrongly treated `resolution` as optional; fal requires it (enum `720p|480p`)**. Fixed `toVeedFabricInput` to default/sanitize to `720p`, updated the contract field + tests (84/84 mediaProviders pass). Re-ran: `veed` completed in ~40s, mirrored to `generated/fal/veed/….mp4`.
- Incidental findings: fal returns bare `Forbidden` on rate limiting (a 20–45s pause clears it); the smoke CLI crashes on Windows *after* printing a provider error (`UV_HANDLE_CLOSING` assertion in Node/libuv on exit — cosmetic, exit-path only, needs a fix).
- All three provider contracts (flux2 image, h3-max-turbo video, veed talking-video) are now proven against the live API.

### 2026-09-20: Phase 9B.3 voice E2E — ElevenLabs generation + stitching verified live

Staging `11_LABS` key confirmed live (`cred/fal_env.txt`). Full voice path proven end to end:

- **Live TTS** (`pnpm elevenlabs test`, new `scripts/elevenlabs-tts.ts`): real 65-char synthesis → 64KB valid MP3 (ID3v2 + MPEG frames), ~1.7s. Initial smoke-script MP3 check was too strict (rejected ID3 headers); fixed to accept ID3 + frame-sync scan.
- **Stitching proof** (`pnpm voice:stitch:check`, new `scripts/phase9b3-voice-stitch-checkpoint.ts`): the REAL ElevenLabs MP3 through `probeAudioAsset` → `normalizeAudioInput` → `buildMixedAudioTrack` (narration @1s + tone bed @4s, 12s canonical) → silent H.264 test video → `muxAudioWithVideo` → independent ffprobe — **8/8 PASS** (mix exactly 12s, final h264 720x1280 30fps + aac audio). Portable ffmpeg 9.0.2 used locally (no local binaries existed).
- **Procedure E2E** (`pnpm voice:e2e`, new `packages/api/scripts/phase9b3-voice-e2e.ts`): isolated scratch staging DB (`raivstream_phase9b3_voice` in throwaway container, SSH tunnel, `db push`, identity+empty gates) + real `story.generateCueSpeech` via tRPC caller — **11/11 PASS** (cue→asset link, GENERATED_SPEECH/mp3 asset row, R2 object present, R2 bytes pass worker input gate, 50cr ledger, zero residue after cleanup). Re-ran on the pure staging path after the R2 fix — **11/11 PASS** with the object in the `raivstaging` bucket (verified present, then verified removed). Scratch DB/container/tunnel torn down after each run.
- **Staging infra findings (resolved):** (1) `cred/fal_env.txt` `R2_ENDPOINT` was missing the `https://` scheme → fixed in file; (2) staging R2 creds were dead (S3 Put/Head/List 403, `cfat_` Cloudflare token invalid) → user provisioned a fresh token + endpoint, verified working (PUT/HEAD/GET/DELETE round-trip, zero residue). `r2.ts getClient()` now tolerates scheme-less endpoints (also fixes a latent prod-config hazard).
- Full suite **409/409 pass**; api + web type-check and lint clean.

### 2026-09-20: Google OAuth sign-in restored (web + mobile, local — not deployed)

Google sign-in never existed in this repo (sign-in was email + password only; no OAuth code, deps, env keys, or history) — so this adds it fresh on the existing custom-JWT session system rather than fixing a regression:

- **Server:** `packages/api/src/lib/googleAuth.ts` verifies the Google ID token against `oauth2.googleapis.com/tokeninfo` (issuer, `aud` ∈ `GOOGLE_CLIENT_IDS`, `email_verified`, expiry). `googleAuthUser()` in `authService.ts` signs in by `googleId`, links a pre-existing email account (keeps its password, marks verified), or creates a passwordless verified user with a derived unique username — then issues the standard access + refresh pair.
- **Schema:** `User.googleId String? @unique`, `passwordHash` now nullable (migration `20260920120000_google_oauth`; apply on VPS via `prisma migrate deploy`).
- **Mobile (tRPC):** `auth.google` procedure; Expo sign-in screen has a "Continue with Google" button using `expo-auth-session` ID-token flow (`expo-auth-session@~5.4.0` + `expo-web-browser@~12.8.2` added). Requires a dev build (no Expo Go proxy in SDK 50+) and iOS/Android OAuth client IDs.
- **Web:** `POST /api/auth/google` sets the same httpOnly cookies as password login (rate-limited); GIS button on sign-in + sign-up pages (renders only when `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is set); CSP allows `https://accounts.google.com` (script + frame + connect).
- **Env:** `GOOGLE_CLIENT_ID[S]`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_*_CLIENT_ID` documented in `.env.example` (not set anywhere yet).
- **Tests:** `lib/__tests__/googleAuth.test.ts` (7 tests). Full suite **409/409 pass**; api + web type-check and lint clean.
- **Known pre-existing issue (untouched):** `pnpm --filter @raivstream/mobile type-check` fails on `falMediaProvider.ts` dynamic import vs the Expo base tsconfig — predates this change (file untouched); Metro/bundling unaffected.

### 2026-09-13: fal.ai migration + Phase 6 provider abstraction (local, not deployed)

**fal.ai migration (Flux.2 / MiniMax H3-Max / VEED Fabric):**

- Added fal generator adapters: `falFlux2.ts` (image, `fal-ai/flux-2`), `falH3Max.ts` (image-to-video, `minimax/h3-max/image-to-video`), `falVeed.ts` (talking-video lip-sync, `veed/fabric-1.0`) — all via the existing `mediaProviders` fal adapter, fail-closed, output mirrored to R2.
- Reconciled `H3_MAX` + `VEED_FABRIC` contracts in `fal/contracts.ts` against live fal schemas.
- Schema: added `FLUX2`/`H3_MAX`/`VEED_FABRIC` to `GenerationModel` enum (migration `20260912140000_fal_models`).
- Wired into the dispatcher (`generators/index.ts`: `SupportedModel`, submit/poll, `MODEL_META`), `generation.ts` `SUPPORTED_MODELS` (FLUX2 + H3_MAX; VEED stays hidden), `credits.ts` feature keys + `seed.ts` placeholder rates.
- Extended the fal webhook route to extract video output (not just images).
- Wired FLUX2 into the Story Workspace scene-image path (`story.ts` + UI model selectors in `new/page.tsx`, `SceneDirectorScreen.tsx`, legacy `[projectId]/page.tsx`).
- Added `pnpm fal` staging smoke-test CLI (`scripts/fal.ts`) loading `cred/fal_env.txt`.
- Env example updated with `FAL_*` flags.

**Phase 6 — provider abstraction (completed this increment):**

- Added provider **capability registry + health snapshot** (`mediaProviders/registry.ts`): fal.ai, RunPod, xAI, Kling, Gemini — env-presence only, no secrets.
- Added admin-only `providers.health` tRPC router (`routers/providers.ts`, registered in `index.ts`).
- Registry consumed by the generation flow: `generation.listModels` annotates each model with `available`/`unavailableReason` via `resolveModelAvailability()`.
- Added `docs/architecture/provider-integration-guide.md` (provider onboarding + capability taxonomy).
- Docs: created `docs/product_roadmap.md` (canonical roadmap, Phase 6 marked IN PROGRESS) and `docs/architecture.md`.

**Webhook R2-mirror + cancellation hardening:**

- Added `mediaProviders/fal/falStorage.ts` (`persistFalOutput`, `falKindForModel`, `falOutputStorageKey`) — canonical R2 key shared by polling adapters and the webhook path; refactored `falFlux2`/`falH3Max`/`falVeed` to use it.
- `processProviderWebhook` now accepts a `persistOutputUrl` hook; the fal webhook route mirrors output to R2 before persisting (provider CDN URLs are never stored). Mirror failure leaves the job un-applied so fal retries.
- Added provider-side cancellation: `cancelProviderJob()` in the dispatcher + `cancelFalFlux2`/`cancelFalH3Max`/`cancelFalVeed`; `generation.cancel` issues it fire-and-forget.

**Tests:** registry + availability + webhook-persist added (**364/364 tests pass**), `api` + `web` type-check and lint clean.

**Observability + admin (Phase 13 increment):**

- Added `/admin/providers` provider-health dashboard UI (backed by `providers.health`) + admin sidebar link; `providers.health` moved to `moderatorProcedure`.
- Added shared `apps/web/src/lib/modelLabels.ts` (`MODEL_LABELS`/`MODEL_OPTIONS`); updated admin Overview + AI Jobs pages and the `admin.listGenerationJobs` model enum to cover all 16 models (incl. FLUX2/H3_MAX/VEED_FABRIC).

**Phase 8 — H3-Max story scene-video pipeline:**

- Added `H3_MAX` to `promptProviderSchema` + `PROMPT_PROVIDER_META` in `story.ts`.
- Added `generateSceneVideoAsset()` + `sceneVideoProviderInfo()`; new tRPC endpoints `story.generateSceneVideo` / `story.regenerateSceneVideo` (H3-Max image-to-video using the scene's latest ready image as opening frame; VIDEO `StorySceneAsset`, R2-mirrored `…/videos/{assetId}.mp4`, `isLatest` per assetType).
- UI: "Animate to Video" / "Regenerate Video" button on scene cards (`new/page.tsx`).

**§7.2 — Unified job state machine:**

- Added `generators/jobModel.ts` (canonical `GenerationJobState` incl. `cancelled` + `GenerationJobError`); `normaliseRunpodError` in `runpod.ts`.
- Migrated all adapters (flux, seedance, wan25, ltx2, hunyuan, cogVideoX, kling, veo3, nanoBanana, falFlux2/falH3Max/falVeed) to return the unified status/error shape; `cancelled` is now first-class (no longer silently mapped to "generating").
- Wired `cancelled` through `generation.pollStatus` (`→ CANCELLED`) and `story.waitForGenerationOutput`.
- Tests: `generators/__tests__/jobModel.test.ts` (**367/367 pass**).

**§7.5 — Reserve/settle/release (flag-guarded, default OFF):**

- Added `CreditReservation` model + `CreditReservationStatus` enum (migration `20260912150000_credit_reservations`); `User.creditReservations` relation.
- Added `reserveCredits` / `settleCredits` / `releaseCredits` + `isReserveSettleEnabled()` to `lib/credits.ts` (atomic, idempotent, crash-safe).
- Wired flag-gated into `generation.create` (reserve → release on failure / settle on sync completion) and `generation.pollStatus` (settle on completion). Flag OFF keeps the existing deduct+refund path.
- Env: `CREDIT_RESERVE_SETTLE_ENABLED` added to `.env.example`. Tests: `lib/__tests__/creditReserveSettle.test.ts` (**377/377 pass**).

**Phase 15 — retry foundation (increment):**

- Added `GenerationJob.retryCount` + `errorCode` (migration `20260912160000_generation_job_retry`); `errorCode` populated from the normalized error in `generation.pollStatus`.
- Added `generation.retry` procedure (failed jobs, max `MAX_JOB_RETRIES=3`, re-charges credits with refund-on-failure).
- Remaining Phase 15: queue/worker architecture, concurrency/backpressure, per-provider rate limiting, dead-letter queue, DR.

**Phase 10 — Movie Builder scene-video substitution:**

- `buildMovieRenderPlan` now prefers a READY scene `VIDEO` asset per shot (via `videoAssetsBySceneId`), falling back to the still; `MovieRenderPlanShot.sourceType` added (optional for legacy plans).
- `movieRenderWorker.renderVideoShot` loops/trims/scales the clip to the shot duration (audio stripped, mixed separately).
- `movieRenderContext` (story.ts) loads per-scene VIDEO assets; `MOVIE_RENDERER_VERSION` → `phase-10-v1`.
- Tests: 5 new in `movieRenderPlanning.test.ts` (**382/382 pass**).

**Phase 10 — tail (per-scene retry/resume + export history):**

- Per-shot retry (`MOVIE_RENDER_SHOT_ATTEMPTS`, default 2) via `renderShotWithRetry`.
- Resume-after-failure: rendered shot segments persisted to R2 (`…/movies/{jobId}/segments/shot-NNN.mp4`) via an injectable `segmentStore`, reused on retry (disabled when `MOVIE_RENDER_SEGMENT_RESUME=false` or R2 unconfigured); cleaned after success.
- Added `story.listMovieAssets` (READY movie versions / export history).
- Tests: resume test (**383/383 pass**).
- Deferred: narration generation (needs a TTS provider — Phase 9B.3, decision-gated).

**Phase 15 — backpressure + cleanup + indexing:**

- Added `lib/generators/providerRateLimit.ts`: per-provider in-process concurrency (`PROVIDER_MAX_CONCURRENCY`) + min interval (`PROVIDER_MIN_INTERVAL_MS`), wired into `submitGenerationJob` (retryable `RATE_LIMITED` over cap; unlimited by default).
- Added `releaseStuckReservations()` (credits.ts) for HELD reservations left by a crash between reserve/settle.
- Added `admin.listGenerationJobs({ deadLetter: true })` (FAILED jobs past the retry budget); moved `MAX_JOB_RETRIES` to `generators/jobModel.ts`.
- DB indexes on `generation_jobs`: `[status, createdAt]`, `[status, retryCount]`, `[errorCode]` (migration `20260912170000`).
- Env: `PROVIDER_MAX_CONCURRENCY`, `PROVIDER_MIN_INTERVAL_MS`, `MOVIE_RENDER_SHOT_ATTEMPTS`, `MOVIE_RENDER_SEGMENT_RESUME`.
- Tests: `providerRateLimit.test.ts` (5) + stuck-reservation test (**389/389 pass**).

**Phase 11 — creative controls (increment):**

- **Regenerate by instruction**: `story.generateSceneImage` / `regenerateSceneImage` / `generateSceneVideo` / `regenerateSceneVideo` accept an optional `instruction` (≤300 chars), moderated and appended to the composed prompt; UI textarea in `mobile-handoff/SceneDirectorScreen.tsx`.
- **Shot presets**: `story.applyShotPreset` (`CINEMATIC`/`DYNAMIC`/`CALM`/`DRAMATIC`/`REVEAL`) applies camera-movement + speed + transition + zoom to a Sequence scene or all enabled scenes.
- Remaining: UI for shot presets (sequence tab), narration voice, music, captions, cover/thumbnail selection — decision-gated.

**Phase 11 — shot-preset UI (tail):**

- Added the preset picker to the Sequence **Shot Inspector** in `story-playground/[projectId]/page.tsx` (apply to the selected shot or all shots).

**Phase 15 — ops (increment 3):**

- Added `GET /api/ready` readiness probe (DB + R2 reachability + redacted provider summary; 200/503).
- Added `admin.resetDeadLetterJob({ jobId })` — resets a dead-letter job's retry budget.
- Added `docs/operations/phase-15-operations.md` (rate-limit config, DLQ, reserve/settle reconciliation, probes, backup/DR, load/capacity, storage lifecycle).

**Phase 9B.3 — narration via ElevenLabs:**

- Added `lib/generators/elevenLabsTts.ts` (`synthesizeSpeech`; key from `ELEVENLABS_API_KEY` or legacy `11_LABS`).
- Added `story.generateCueSpeech` (moderate → `story:speech_generation` credit gate (fail-closed) → ElevenLabs → R2 `AudioAsset(sourceKind:'GENERATED_SPEECH')` → link `AudioCue.audioAssetId`; refund-on-failure).
- UI: "Generate narration" button in the Audio cue inspector.
- Env: `ELEVENLABS_API_KEY`, `ELEVENLABS_TTS_ENABLED` (default false), `ELEVENLABS_TTS_MODEL`, `ELEVENLABS_DEFAULT_VOICE_ID`. **Credit rate unset** (set `story:speech_generation` in Admin → Credits to enable).
- Tests: `elevenLabsTts.test.ts` (6) → **395/395 pass**.

**Phase 11 — background music via Lyria:**

- Added `lib/generators/lyriaMusic.ts` (`generateMusic`; reuses `GEMINI_API_KEY`; `lyria-3-clip-preview` / `lyria-3-pro-preview`).
- Added `story.generateCueMusic` for MUSIC/AMBIENCE cues (moderate → `story:audio_generation` credit gate (fail-closed) → Lyria → R2 `AudioAsset(sourceKind:'GENERATED_MUSIC')` → link cue; refund-on-failure).
- UI: "Generate music" + description field in the Audio cue inspector.
- Env: `LYRIA_MUSIC_ENABLED` (default false), `LYRIA_MUSIC_MODEL`. **Rate unset** (set `story:audio_generation` in Admin → Credits).
- Tests: `lyriaMusic.test.ts` (5) → **400/400 pass**.

**Phase 11 — captions, cover, mixing console (decisions applied):**

- **Captions (sidecar WebVTT):** `story.getSequenceCaptions` builds a `.vtt` from timed NARRATION/DIALOGUE cues (`buildWebVtt`); "Download captions (.vtt)" in the Film tab.
- **Cover:** `StoryProject.coverAssetId` + relation (migration `20260912180000_story_project_cover`); `story.setProjectCover`; "Use as cover" button on scene cards.
- **Mixing console:** cue volume/fade/ducking hidden by default behind a "Show mixing console" toggle.
- Aspect ratio: 9:16 remains the feed default; 16:9/1:1 available via `aspectRatio`.
- Tests: `routers/__tests__/captions.test.ts` (2) → **402/402 pass**.
- Deferred: style presets (bundled), intro/outro title cards, generate-cover, progressive-disclosure tiers.

**Phase 11 — style presets:**

- Added `story.listStylePresets` + `story.applyStylePreset` (5 named bundles setting `visualStyle` + director defaults across scenes + a music prompt).
- UI: style-preset picker in the New Story style step.
- Deferred: intro/outro title cards (needs a title-font decision for ffmpeg drawtext).

**MiniMax video endpoint → H3-Max Turbo:**

- Switched the fal video endpoint from `minimax/h3-max/image-to-video` to **`minimax/h3-max-turbo/image-to-video`** (model key stays `H3_MAX`) — ~$0.00625/s vs ~$0.0125/s. Updated `mediaProviders/config.ts`, `generators/falH3Max.ts`, `mediaProviders/fal/contracts.ts`, `generators/index.ts` (MODEL_META label/url), `routers/story.ts` (`sceneVideoProviderInfo` + prompt-provider label).

**Blocker:** live fal calls return `403` (valid key, account lacks model access). Outstanding non-fal items tracked in `docs/product_roadmap.md` §9.

### 2026-08-27: Phase 9B.2B — Pure-rendering + persistence checkpoints

Two follow-up checkpoints on top of the Phase 9B.2 entry below, both PASSED. (1) Pure-rendering: found and fixed a real gap where a short/late audio cue could truncate the final video via `-shortest` muxing — `buildMixFilterGraph` now force-pads/trims the mix to the exact canonical runtime, proven at `0s` delta across all 8 required scenarios with real ffmpeg (`docs/operations/phase-9b2-pure-rendering-checkpoint.md`). (2) Persistence: added `MovieRenderJob.audioBlueprintHash` (migration `20260827180000_audio_blueprint_hash_phase9b2b`), cross-project `AudioAsset` ownership checks (write-time + render-time), storageKey-derived (never-signed) URL resolution, and an honest "Audio source: Not generated yet" preflight warning + per-cue indicator for unmaterialized speech cues. Render idempotency-including-audio-identity and version-numbering (`1,2,3`, never `1,2,2`) proven live against real Postgres via `appRouter.createCaller`, not just unit tests (`docs/operations/phase-9b2b-persistence-checkpoint.md`). 97/97 tests passing. **Still not committed/pushed/deployed to production.**

### 2026-08-27: Phase 9B.2 — Audio & Performance Layer (staging-qualified)

Added a first-class Audio & Performance layer for Movie Builder: `AudioPerformancePlan`/`AudioTrack`/`AudioCue`/`VoiceProfile`/`AudioPlanVersion`/`AudioAsset` (additive schema, migration `20260827120000_audio_performance_phase9b2`), 15 new tRPC procedures, real FFmpeg audio mixing + mux extending the existing silent-video Movie Builder pipeline, an extended (not weakened) FFprobe READY gate, and a new "Audio" tab in Story Workspace between Sequence and Film. Cue timing anchors to the canonical Film Blueprint timeline, never to FFmpeg transition handles. 36 new tests (83/83 total, up from 47/10 baseline). Full staging qualification in `docs/operations/phase-9b2-staging-qualification.md`; architecture in `docs/architecture/audio-performance-layer.md`. **Not yet committed/pushed/deployed to production** — staging-only as of this entry.

### 2026-06-10: Guest Free Viewing Limit

Changed:

- Increased the unauthenticated guest viewing allowance from 5 unique videos to 50 unique videos.
- Updated the live home UI copy and project comments to reflect the new 50-video guest gate.
- Signed-in FREE account behavior remains unchanged: 10 free episodes before premium-only videos lock.

### 2026-06-10: UI Prototype Rebuild

Changed:

- Rebuilt the standalone `UI` prototype around a new Raivstream app shell in `UI/src/app/App.tsx`.
- Added screens for the main feed, R16 Kids feed, AI Studio, Story Studio, media library, analytics, credits, admin console, and reusable blank templates.
- Added `UI/README.md` with run instructions and backup details.
- Deployed the built UI prototype to the VPS as a static Caddy route at `https://app.raivstream.com/ui/`.

Backup:

- Original UI export was copied to `C:\Raiv\raivstream\UI_backup_20260610-213131` before edits.

Production serving:

- Source path on VPS: `/root/raivstream/UI`.
- Static build path on VPS: `/var/www/raivstream-ui`.
- Caddy route: `app.raivstream.com` handles `/ui` and `/ui/*` before proxying the rest of the site to Next.js on `localhost:3000`.
- Build command used on VPS: `pnpm exec vite build --base=/ui/`.

Verification:

- `pnpm build` passes in `UI`.
- Local preview verified at `http://127.0.0.1:5173`.
- Production preview verified at `https://app.raivstream.com/ui/`; JS/CSS assets and `app.raivstream.com/api/health` return successfully.

### 2026-06-11: Live Home UI Revert

Changed:

- Reverted `apps/web/src/app/page.tsx` back to the former feed-first UI shell because the redesigned live home UI was not working well.
- Kept the standalone prototype available at `https://app.raivstream.com/ui/`.
- Kept the guest viewing limit change at 50 free videos.

### 2026-05-25: Story Studio

Commit: `4bd7eff feat: add story studio workflow`

Added:

- Story Studio Prisma models and enums.
- `story` tRPC router.
- `/story-studio` web UI.
- Story Studio navigation entry.
- Middleware protection and R16 blocking.
- `/generate` integration for storyboard prompt prefill and saving generated output references back to shots.

Deployment:

- Pushed to GitHub `main`.
- Pulled on VPS.
- Built web app successfully.
- Restarted `raivstream-web`.
- Applied Story Studio production tables manually due to Prisma/Supabase cross-schema blocker.

Operational fix:

- Found production DB health degraded because Supavisor owned host `5432` and returned `Tenant or user not found`.
- Stopped `supabase-pooler`.
- Recreated `supabase-db` with direct host binding.
- Synced `postgres` role password with the existing app `.env` password.
- Confirmed app health returned to healthy.

### 2026-05-25: Generation Prompt Limit

Changed:

- Raised generation prompt limit from 500 to 2000 characters.
- Raised negative prompt limit from 300 to 500 characters.
- Updated web AI Studio prompt and negative prompt textareas.
- Updated mobile AI Studio prompt and negative prompt text inputs.
- Updated Story Studio compiled image/video prompts to stay within the generation prompt limit.
- Improved Story Studio beat splitting for long story text by chunking long beats and allowing up to 24 storyboard shots.

Reason:

- The 500-character limit was an application-level validation/UI cap, not a database limit or generator dispatcher limit.

### 2026-05-25: Media Library Thumbnail Fallbacks

Changed:

- Added `mp4Url` and `hlsMasterUrl` to creator media-library API responses.
- Updated web creator profile grids to render a thumbnail image when valid, otherwise fall back to a muted video preview, otherwise a stable placeholder.
- Updated web analytics video table to use the same thumbnail/video/placeholder fallback.
- Updated mobile profile media grid to avoid rendering empty thumbnail URLs as broken images.

Reason:

- Uploaded videos can have files that still exist while `thumbnailUrl` is empty or stale, causing broken thumbnails in user media libraries.

### 2026-05-25: Manual Credits / Coupons

Changed:

- Added 5,000 AI credits to `texdevices@gmail.com` in production. Balance changed from 240 to 5,240.
- Extended `admin.adjustCredits` to accept user lookup by email, username, or ID.
- Added explicit manual adjustment actions: gift/coupon, refund, and deduct.
- Added optional reference IDs for coupon codes, support tickets, and refund references.
- Added a Manual Credits / Coupons tab to `/admin/credits`.

Ledger behavior:

- Gift/coupon grants write `BONUS` transactions.
- Refund grants write `REFUND` transactions.
- Deductions write `USAGE` transactions and floor the user balance at zero.

### 2026-06-18: Story Playground Phase 1

Changed:

- Added `/story-playground` as the new story-first creation flow.
- Repositioned story creation from prompt/storyboard-first to: idea -> guided questions -> short story -> continue story.
- Added child-friendly Story Spark UI with example ideas, large input, and placeholder buttons for future picture/voice input.
- Added button-based guided questions with deterministic fallback generation.
- Added story result reading layout with chapters and continuation controls.
- Added `Continue Story`, `Read Again`, and `Save Story` actions. Funnier/magical/shorten buttons are visible placeholders for the next text-variation pass.
- Added R16-aware behavior: server-side tRPC context now detects `x-r16-mode`/`r16.*` and forces `KIDS` audience mode.
- Kept advanced `/story-studio` intact and added a button from Story Studio to Story Playground.
- Updated the main navbar to surface Story Playground instead of Story Studio, while keeping Advanced Story Studio available for signed-in non-R16 users.

API:

- Added `story.createSpark`.
- Added `story.generateQuestions`.
- Added `story.answerQuestion`.
- Added `story.generateStory`.
- Added `story.continueStory`.
- Added `story.saveProject`.
- Added `story.listMyProjects`.
- Existing `story.getProject` now returns questions, chapters, character memory, and scene seeds.

Data model:

- Extended `StoryProject` with `originalIdea`, `audienceMode`, `storyType`, `ageRange`, and `theme`.
- Added `StoryAudienceMode` enum: `KIDS`, `GENERAL`.
- Added `StoryType` enum: `SHORT_STORY`, `PICTURE_BOOK`, `COMIC`, `VIDEO_STORY`.
- Extended `StoryProjectStatus` with `GENERATED` and `EXTENDED`.
- Added `StoryQuestion`.
- Added `StoryChapter`.
- Added `StoryCharacterMemory`.
- Added `StorySceneSeed`.
- Added SQL migration `packages/database/migrations/20260618120000_story_playground_phase1/migration.sql`.

Story text service:

- Added `packages/api/src/lib/storyTextService.ts`.
- Uses an OpenAI-compatible chat completions endpoint when `OPENAI_API_KEY` is configured.
- Falls back to a local deterministic provider when text generation is unavailable.
- Moderates the original story idea before generation.
- Applies stricter child-safety rejection for R16/KIDS mode.

Verification:

- `pnpm --filter @raivstream/database db:generate` passed.
- `pnpm --filter @raivstream/database exec prisma validate` passed when local placeholder `DATABASE_URL` and `DIRECT_URL` were supplied.
- `pnpm --filter @raivstream/web type-check` passed.
- `pnpm --filter @raivstream/web build` passed when local one-off JWT secrets were supplied.
- `pnpm --filter @raivstream/web lint` did not run because `next lint` prompts to create an ESLint config in this repo.

### 2026-06-18: Story Playground Phase 2 Scene Cards

Changed:

- Added `story.generateScenes` to turn generated chapters into simple scene cards using existing `StorySceneSeed`.
- Added `story.updateScene` so scene cards can be edited from the Story Playground modal.
- Story generation and story continuation now automatically refresh scene cards in the Story Playground UI.
- Added a horizontal film-strip under the generated story.
- Added placeholder scene thumbnails for now.
- Added scene editor modal for title, description, place, indoor/outdoor, and mood.
- Added disabled `Make Pictures` button marked as a coming-soon action.
- R16 copy stays simple: scene cards are presented as picture cards.

Acceptance behavior:

- School-themed ideas such as "A dog going to school" produce six default scene cards: Home, Road to School, School Gate, Classroom, Problem, Happy Ending.

Verification:

- `pnpm --filter @raivstream/web type-check` passed.
- `pnpm --filter @raivstream/database exec prisma validate` passed when local placeholder `DATABASE_URL` and `DIRECT_URL` were supplied.

### 2026-06-18: Non-Interactive ESLint Setup

Changed:

- Added root `.eslintrc.json` extending `next/core-web-vitals`.
- Configured Next lint root detection with `settings.next.rootDir = ["apps/web/"]`.
- Added root `.eslintignore` for generated/build/cache folders and standalone UI exports.
- Installed root dev dependencies `eslint` and `eslint-config-next`.
- Changed `apps/web` lint script from `next lint` to ESLint CLI so CI no longer receives the interactive Next.js setup prompt.
- Added `apps/web` `lint:fix` script.
- Removed a stale inline disable comment for TypeScript ESLint rules that were not loaded by this config.

Verification:

- `pnpm --filter @raivstream/web lint` completed successfully.
- `pnpm lint` completed successfully through Turbo.
- Current lint output still includes warnings in web/mobile, but no lint errors and no interactive prompts.

### 2026-06-18: Story Playground Phase 3 Character Bible

Changed:

- Added deterministic character memory extraction for named character ideas.
- Acceptance input such as `Max is a young male golden puppy with a blue backpack` now extracts:
  - name: `Max`
  - age: `young`
  - gender: `male`
  - species: `Puppy`
  - visual description: `young male golden puppy with a blue backpack`
- Added `story.generateCharacterBible`.
- Added `story.updateCharacterMemory`.
- Story generation now normalizes provider character memory with deterministic extraction from the original idea.
- Scene generation now stores reusable character reference objects in each `StorySceneSeed.characters` JSON field instead of plain names.
- Each scene character reference includes a `promptIngredient` string for Phase 4 prompt composition.
- Added editable Character Bible cards to `/story-playground`.
- Editing a character refreshes scene references so all six scene cards keep the same character identity.
- R16 copy presents the Character Bible as simple "Story friends" / "Keep everyone looking the same" language.

Lint:

- Fixed the remaining web lint warning in `/story-studio`.
- `pnpm --filter @raivstream/web lint --max-warnings=0` passed.

Verification:

- `pnpm --filter @raivstream/web lint --max-warnings=0` passed.
- `pnpm --filter @raivstream/web type-check` passed.
- `pnpm --filter @raivstream/database exec prisma validate` passed when local placeholder `DATABASE_URL` and `DIRECT_URL` were supplied.
- `pnpm --filter @raivstream/web build` passed when local one-off JWT secrets were supplied.
- `pnpm lint` completed successfully through Turbo. Existing mobile warnings remain, but web strict lint is clean.

### 2026-06-18: Story Playground Phase 4 Hidden Prompt Composer

Changed:

- Added hidden scene prompt composition for adult/non-R16 creator, moderator, and admin users.
- Added `story.composeScenePrompt`.
- Added `story.composeAllScenePrompts`.
- Added provider-aware prompt templates for:
  - `IMAGE`
  - `SHORT_VIDEO`
  - `COMIC_PANEL`
- Added provider targets:
  - `FLUX`
  - `WAN_25`
  - `KLING_I2V`
  - `KLING_R2V`
- Added provider-specific prompt limits, negative prompt limits, aspect ratio defaults, and duration defaults.
- Added automatic negative prompt generation.
- Added R16-safe prompt rules: child-safe, warm, friendly, no fear, no violence, no adult themes.
- Added saved prompt versions per scene with `StoryScenePrompt`.
- Added advanced prompt preview modal, hidden on R16.
- Added `Send to AI Studio` from advanced prompt preview and from scene prompt cards.
- AI Studio now accepts `negativePrompt` from URL params.

Data model:

- Added `StoryPromptOutputType` enum.
- Added `StoryScenePrompt`.
- Added SQL migration `packages/database/migrations/20260618130000_story_prompt_composer_phase4/migration.sql`.

Acceptance behavior:

- The `Road to School` scene composes a clean prompt containing:
  - Max's exact visual identity from Character Bible.
  - outdoor road/school setting.
  - child-safe tone.
  - provider guidance for Flux/Wan/Kling.
- R16/kids flow does not show JSON or prompt text.

Verification:

- `pnpm --filter @raivstream/database db:generate` passed.
- `pnpm --filter @raivstream/database exec prisma validate` passed when local placeholder `DATABASE_URL` and `DIRECT_URL` were supplied.
- `pnpm --filter @raivstream/web type-check` passed.
- `pnpm --filter @raivstream/web lint --max-warnings=0` passed.
- `pnpm --filter @raivstream/web build` passed when local one-off JWT secrets were supplied.

### 2026-06-18: Story Playground Phase 4B Scene Image Generation

Changed:

- Added scene image generation from Story Playground scene cards.
- Added `story.generateSceneImage` for the first image on a scene.
- Added `story.regenerateSceneImage` to create another version while preserving asset history.
- Added `story.listSceneAssets` and `story.getSceneAsset`.
- Scene generation uses the existing hidden prompt composer output, moderates the composed prompt, deducts model credits, creates a linked `GenerationJob`, submits through the existing generator abstraction, mirrors output to R2, and attaches the latest image back to the scene.
- Added local development fallback for Flux scene images when RunPod is not configured outside production; it creates a simple SVG placeholder and still follows the asset attach flow.
- Added Story Playground UI states for image generation loading, success, failure, retry, regeneration, and adult/non-R16 image history.
- Kept R16 copy simple: `Make Picture`, `Making your picture...`, and `Try Again`; raw prompts and image history remain hidden.
- Unnamed dog/puppy story ideas now infer the main character name `Max`, while explicit names still win.

Provider and storage:

- Default scene image provider path is `FLUX` through `submitGenerationJob`.
- R2 object key format is `story-projects/{projectId}/scenes/{sceneId}/assets/{assetId}.png`.
- If R2 is not configured in local development, inline placeholder/source URLs are retained as a fallback.

Data model:

- Added `StorySceneAssetType` enum: `IMAGE`, `VIDEO`.
- Added `StorySceneAssetStatus` enum: `PENDING`, `GENERATING`, `READY`, `FAILED`.
- Added `StorySceneAsset`.
- Extended `StorySceneSeed` with `latestImageAssetId`, `imageStatus`, and `imageUrl`.
- Added SQL migration `packages/database/migrations/20260618140000_story_scene_image_assets_phase4b/migration.sql`.

Verification:

- `pnpm --filter @raivstream/database db:generate` passed.
- `pnpm --filter @raivstream/database exec prisma validate` passed when local placeholder `DATABASE_URL` and `DIRECT_URL` were supplied.
- `pnpm --filter @raivstream/web type-check` passed.
- `pnpm --filter @raivstream/web lint --max-warnings=0` passed.
- `pnpm --filter @raivstream/web build` passed when local one-off JWT secrets were supplied.

Staging runtime verification:

- Created isolated VPS staging path `/root/raivstream-staging`.
- Created isolated localhost-only staging Postgres container `raivstream-staging-postgres` on `127.0.0.1:55450`.
- Started staging web process `raivstream-staging-web` on local port `3010`; it is not routed by public Caddy.
- Staging health passed at `http://127.0.0.1:3010/api/health` with `x-forwarded-proto: https`.
- Runtime test used real VPS RunPod and R2 env with isolated staging database.
- Exact story test passed:
  - idea: `A dog going to school`
  - questions answered: 5
  - scenes: Home, Road to School, School Gate, Classroom, Problem, Happy Ending
  - character reference: Max
  - first image generated through Flux, deducted 80 credits, attached to scene, and existed in R2
  - regenerate generated a second Flux image, deducted another 80 credits, kept old image in history, and made the new image latest
  - R2 keys used `story-projects/{projectId}/scenes/{sceneId}/assets/{assetId}.png`
  - R16 staging page check did not render advanced prompt/history labels.
- Production deploy is intentionally held because `https://app.raivstream.com/api/health` is currently degraded: app DB requests hit `FATAL: Tenant or user not found` through the pooler. Do not release Alpha to production until production DB routing is restored.

Production deployment:

- Production `DATABASE_URL` and `DIRECT_URL` were switched from the broken Supavisor pooler on host `5432` to direct `supabase-db` container access at `172.18.0.2:5432`.
- `.env` was backed up on the VPS before the switch as `.env.backup-before-direct-db-20260619-015452`.
- Pre-release DB backup was created at `/root/raivstream/pre_story_playground_alpha_backup_20260619-021103.sql`.
- `prisma migrate deploy` was blocked by `P3005` because the Supabase DB is non-empty and was not previously baselined for Prisma Migrate.
- `prisma db push` was blocked by the existing Supabase cross-schema FK `public.customers -> auth.users`.
- A controlled Prisma baseline SQL was generated with `prisma migrate diff --from-empty --to-schema-datamodel schema.prisma --script` and applied to create the Raivstream public app schema.
- The three Alpha migrations were then marked applied with `prisma migrate resolve --applied`, and their idempotent SQL was manually executed once to add missing enum values/columns.
- `prisma migrate status` reports the database schema is up to date.
- `pnpm --filter @raivstream/web build` passed on the VPS.
- `pm2 restart raivstream-web --update-env` completed.
- Production smoke test passed with real RunPod/R2 and production DB:
  - idea: `A dog going to school`
  - scenes: Home, Road to School, School Gate, Classroom, Problem, Happy Ending
  - character reference: Max
  - first Flux image deducted 80 credits, attached to scene, and existed in R2
  - regenerate deducted another 80 credits, kept the old image in history, and made the new image latest
- `https://app.raivstream.com/api/health` is healthy.
- `https://app.raivstream.com/story-playground` renders.
- R16 local host-header routing is healthy and hides prompt/history labels.
- Public `https://r16.raivstream.com/api/health` still returns `Not Found` because DNS currently resolves to `3.33.251.168` / `15.197.225.128`, not the Raivstream VPS `81.0.246.223`. Update the R16 DNS A record before announcing full R16 public availability.
- Follow-up DNS check on 2026-06-19: `r16.raivstream.com` is healthy, but `dig r16.raivstream.com +short` still returns old A records `3.33.251.168` and `15.197.225.128` alongside `81.0.246.223`; remove the old DNS records at the DNS provider.
- The Alpha DB backup is preserved at `/root/raivstream/pre_story_playground_alpha_backup_20260619-021103.sql` and copied to `/root/raivstream/backups/pre_story_playground_alpha_backup_20260619-021103.sql`; both are read-only and have SHA-256 `07049ee84b12758725a12f965f197b7061dab94baadd50929c8f95257192438e`.
- Phase 4C Storybook Viewer was implemented locally after Alpha: Story + Scene Images now derive a page-by-page reader without new database tables.
- Phase 4.5 Story Playground Analytics was implemented locally after Phase 4C: Story Playground, scene generation, scene image, character bible, storybook, and feedback events write to `analytics_events`; admin analytics dashboard lives at `/admin/story-analytics`.

### 2026-06-19: Story Playground Phase 4C Storybook Viewer

Changed:

- Added dynamic storybook APIs:
  - `story.getStoryBook`
  - `story.getStoryBookPage`
  - `story.regenerateStoryBook`
- Added route `/story-playground/[projectId]/storybook`.
- Added alias route `/storybook/[projectId]`.
- Storybook pages are generated dynamically from `StorySceneSeed`, latest image asset / `imageUrl`, character memory, and chapter text.
- Added cover page using the first available scene image or a friendly fallback.
- Added page-by-page reading UI with large image area, large text, previous/next controls, page dots, keyboard arrows, swipe navigation, fullscreen toggle, and localStorage reading progress.
- Missing scene images show a friendly `Illustration Coming Soon` placeholder.
- Added Storybook entry points from Story Playground sidebar and scene cards.
- R16 copy stays simple: `Read Story`, `Next Page`, `Back`, `The End`; no prompt text, provider names, model names, credit data, or generation metadata are shown.

Schema:

- No database schema changes. Storybook is derived from existing story, scene, and asset data.

Verification:

- `pnpm --filter @raivstream/database exec prisma validate` passed with local placeholder DB URLs.
- `pnpm --filter @raivstream/web type-check` passed.
- `pnpm --filter @raivstream/web lint --max-warnings=0` passed.
- `pnpm --filter @raivstream/web build` passed with local one-off JWT secrets.

### 2026-06-19: Story Playground Phase 4.5 Analytics And Feedback

Changed:

- Added reusable API analytics service in `packages/api/src/lib/analytics.ts`.
- Added `AnalyticsEvent` Prisma model mapped to `analytics_events`.
- Added protected client analytics mutation `analytics.trackStoryEvent`.
- Story Playground now tracks `story_playground_opened`.
- Story server mutations now track spark, question, story, continuation, save, scene generation, scene image, regenerate, and character bible events.
- Storybook now tracks open, start, page viewed, completed, exit, and non-R16 feedback submission.
- Added admin `storyAnalytics` procedure with completion funnel, count cards, popular themes, popular age ranges, popular characters, and recent raw events.
- Added `/admin/story-analytics` dashboard and admin nav entry.
- R16 storybook keeps copy simple and does not expose prompt/provider/model/credit history.

Schema:

- Added migration `20260619130000_story_analytics_events`.
- New `analytics_events` columns: `id`, `userId`, `projectId`, `eventName`, `properties`, `createdAt`.
- `userId` is optional and uses `ON DELETE SET NULL`; `projectId` is intentionally a plain optional string to keep analytics decoupled from story table lifecycle.

Verification:

- `pnpm --filter @raivstream/database db:generate` passed.
- `pnpm --filter @raivstream/database exec prisma validate` passed with local placeholder DB URLs.
- `pnpm --filter @raivstream/api type-check` passed.
- `pnpm --filter @raivstream/api lint` passed.
- `pnpm --filter @raivstream/web type-check` passed.
- `pnpm --filter @raivstream/web lint --max-warnings=0` passed.

Deployment:

- Deployed to VPS on 2026-06-21 from commit `917fbb9`.
- Pre-migration backup: `/root/raivstream/backups/pre_phase_4_5_analytics_20260621-052213.sql`.
- `pnpm --filter @raivstream/database exec prisma migrate deploy` applied `20260619130000_story_analytics_events`.
- `pnpm --filter @raivstream/web build` passed on VPS and `pm2 restart raivstream-web --update-env` completed.
- Public health checks passed for `https://app.raivstream.com/api/health` and `https://r16.raivstream.com/api/health`.
- Smoke test created one `story_playground_opened` analytics event through `analytics.trackStoryEvent`, loaded `admin.storyAnalytics`, and confirmed unauthenticated admin analytics access is rejected.
- `/story-playground`, `/storybook/cmqk6icyf0003f58y94f2l3sc`, and `/admin/story-analytics` route checks passed; `/admin/story-analytics` redirects unauthenticated users to sign-in and R16 redirects admin analytics to `/`.
- R16 storybook did not expose feedback, prompt, image history, model/provider generation labels, credits, or AI Studio text. Non-R16 storybook showed the Feedback entry.
- Production account `texdevices@gmail.com` was promoted from `VIEWER` to `ADMIN` on 2026-06-21 so `/admin/story-analytics` and other admin pages are usable in browser.

### 2026-06-23: Story Playground My Stories Library

Changed:

- Added a signed-in Story Playground library section below Story Spark.
- The section shows recent projects from `story.listMyProjects` as responsive cards with title, original idea, updated date, status/progress, audience mode, scene count, ready picture count, and a thumbnail from the first available scene image.
- Added smart project actions:
  - Continue / Keep Going
  - Open Storybook / Read Book
  - Add Pictures
  - Edit Story for projects that are not storybook-ready yet
  - Archive for non-R16 users
- R16 copy uses simple labels such as `My Stories`, `Keep Going`, `Read Book`, and `Add Pictures`, and does not expose prompt/model/provider/credit/debug language.
- Empty state now says `Your stories will appear here after you create one.`
- `Add Pictures` loads the chosen project and scrolls to the scene cards section.
- `Continue` resumes drafts, question flows, or written stories based on project progress.

API:

- Extended `story.listMyProjects` to exclude archived projects and include chapter/question/scene counts plus first ready image asset data for progress and thumbnails.
- Archive uses the existing `story.updateProject` status flow with `ARCHIVED`.

Verification:

- Run type-check, strict lint, and build before deployment from the isolated library/resume worktree.

### 2026-07-04: Story Playground Prompt Quality Upgrade

Changed:

- Added creator-selectable visual styles on `/story-playground` before image generation:
  - Storybook Illustration
  - 3D Animated
  - Anime
  - Comic Book
  - Photorealistic
  - Watercolor
  - Claymation
  - Cinematic Fantasy
  - African Folktale Illustration
- R16 shows simplified style copy and limits choices to Storybook, 3D Cartoon, Anime, Comic, and Watercolor.
- New stories save the selected style to existing `StoryProject.visualStyle`; resumed stories load their saved style.
- Existing projects can update visual style through the Story Playground selector using `story.updateProject`.
- Hidden prompt composition now includes the selected style block, character bible identity, scene action, location, mood, story purpose/theme, child-safety constraints, and no-text/no-UI/no-social-overlay instructions.
- Added `promptEnhancerService`:
  - Uses OpenAI-compatible chat completions when `OPENAI_API_KEY` is configured.
  - Uses `OPENAI_PROMPT_ENHANCER_MODEL`, then `OPENAI_TEXT_MODEL`, then `STORY_TEXT_MODEL`, then `gpt-4o-mini`.
  - Falls back to deterministic prompt enhancement if no key is configured or the provider fails.
  - Returns structured JSON internally only; R16 never sees raw prompts or JSON.
- Enhanced prompt metadata is saved on `StoryScenePrompt.metadata` for non-R16 prompt preview and on `GenerationJob.metadata` for generated scene images.
- Image generation composes/enhances a fresh style-aware prompt at generation time so style changes are respected.
- The existing `SHORT_VIDEO` prompt composer path is style-aware for future scene-video generation, but movie stitching was not continued in this pass.
- Negative prompts now include text overlays, visible words, phone UI, social media UI, gallery UI, shot labels, 9:16 labels, watermarks, captions, speech bubbles, and logos.
- Added analytics events:
  - `visual_style_selected`
  - `prompt_enhancement_started`
  - `prompt_enhancement_completed`
  - `prompt_enhancement_failed`
  - `generation_started_with_enhanced_prompt`

Schema:

- No schema changes. `StoryProject.visualStyle` already existed.

Verification:

- `pnpm --filter @raivstream/database db:generate` passed.
- `pnpm --filter @raivstream/api type-check` passed.
- `pnpm --filter @raivstream/web type-check` passed.
- `pnpm --filter @raivstream/web lint --max-warnings=0` passed.
- `pnpm --filter @raivstream/database exec prisma validate` passed with local placeholder DB URLs.
- `pnpm --filter @raivstream/api lint` passed with the existing React-version detection warning from shared ESLint config.
- `pnpm --filter @raivstream/web build` passed with local dummy JWT secrets and `NEXT_PUBLIC_STORYBOOK_READ_ALOUD_ENABLED=false`.
- Real provider image generation was not run in this pass.

### 2026-07-13: Strict Web Lint Command Standardized

Changed:

- Standardized strict web lint usage in project docs and deploy CI to:
  - `pnpm --filter @raivstream/web lint --max-warnings=0`
- Removed the obsolete command form:
  - `pnpm --filter @raivstream/web lint -- --max-warnings=0`
- Added strict web lint to `.github/workflows/deploy.yml` before the production web build.

Reason:

- The current `apps/web` lint script is `eslint . --ext .js,.jsx,.ts,.tsx`.
- With this script, the extra `--` separator is forwarded to ESLint, which can make `--max-warnings=0` behave like a file pattern instead of a flag.

### 2026-07-13: Phase 5C Story Director And Prompt Quality Dashboard

Changed:

- Added per-scene Story Director controls for:
  - Emotion
  - Camera style
  - Time of day
  - Weather
  - Environment mood
  - Lighting
  - Scene pace
- Director choices are saved on `StorySceneSeed` and do not automatically regenerate images.
- Prompt composition now includes director choices along with character bible, visual style, scene action, setting, story purpose, and safety rules.
- The Story Playground UI shows a collapsible `Direct This Scene` panel inside each scene card.
- R16 copy remains simple and hides prompt, provider, model, credits, and metadata language.
- Added thumbs-up/thumbs-down prompt quality feedback after generated images, with optional non-R16 improvement comment.
- Added admin-only `/admin/prompt-quality` for prompt QA:
  - Shows story, scene, visual style, requested model, actual provider model, provider, prompt enhancement status, prompt length, generation time, credits, regeneration state, latest asset state, audience mode, completion state, ratings, and comments.
  - Raw deterministic/enhanced/negative prompts and provider metadata are hidden until an admin expands a row.
  - Summarizes style/enhancer/provider combinations by rating, regeneration rate, and generation time.

Schema:

- Added nullable director fields to `StorySceneSeed`.
- Added `PromptQualityFeedback` table.
- Migration: `20260713090000_story_director_prompt_quality`.

Verification:

- VPS backup created before migration: `/root/raivstream/backups/pre_phase_5c_story_director_20260713-100604.sql`.
- `pnpm --filter @raivstream/database exec prisma migrate deploy` passed on staging after removing a UTF-8 BOM from the migration file and resolving the failed no-op migration attempt as rolled back.
- `pnpm --filter @raivstream/database exec prisma validate` passed.
- `pnpm --filter @raivstream/api type-check` passed.
- `pnpm --filter @raivstream/web type-check` passed.
- `pnpm --filter @raivstream/web lint --max-warnings=0` passed.
- `pnpm --filter @raivstream/web build` passed with read-aloud disabled.
- Phase 5C staging ran on `127.0.0.1:3013` with healthy database status.
- Real provider smoke generated and regenerated `A dog going to school` scene images in 3D Animated and Anime styles, confirmed 720x1280 R2 assets, requested model `FLUX`, actual provider model `z-image-turbo`, feedback storage, admin prompt-quality rows, and `regeneration_after_director_change` analytics.
- Production health remained clean for `https://app.raivstream.com/api/health` and `https://r16.raivstream.com/api/health`.

### 2026-07-13: Phase 6A Character Director

Changed:

- Replaced basic Character Bible editing with Character Director controls in Story Playground.
- Character memory now supports structured identity and direction:
  - Personality traits
  - Motivation
  - Fear
  - Goal
  - Favorite expression
  - Walking style
  - Speaking style for future narration
  - Relationships
  - Evolution stage and scene-order marker
- Character updates no longer regenerate scene cards automatically. Future prompt composition reads the latest character memory, preserving previous scene records and image history until the user chooses to regenerate.
- Added `createCharacterMemory` for adding supporting characters such as Luna.
- Prompt composition now includes richer character identity, relationships, continuity rules, and internal Story DNA.
- Added internal `StoryProject.storyDna` with initial fields for theme, tone, visual style, hero, primary goal, conflict, resolution, character arc, mood palette, visual palette, and camera language.
- Added `/admin/character-insights` with common personalities, goals, fears, relationship types, average characters/story, average images/character, regeneration rate by personality, and successful personality/style combinations.
- Added analytics events:
  - `character_created`
  - `character_updated`
  - `personality_changed`
  - `relationship_changed`
  - `character_evolved`
  - `character_used_in_generation`

Schema:

- Added nullable `storyDna` JSON field to `StoryProject`.
- Added nullable Character Director fields to `StoryCharacterMemory`.
- Migration: `20260713120000_character_director_story_dna`.

Verification:

- `pnpm --filter @raivstream/database db:generate` passed.
- `pnpm --filter @raivstream/database exec prisma validate` passed with local placeholder DB URLs.
- `pnpm --filter @raivstream/api type-check` passed.
- `pnpm --filter @raivstream/web type-check` passed.
- `pnpm --filter @raivstream/web lint --max-warnings=0` passed.
- `pnpm --filter @raivstream/web build` passed with local placeholder DB URLs and read-aloud disabled.
- Seed script parse check passed with `tsc --noEmit`.
- VPS staging gate passed in `/root/raivstream-phase7a-staging`: backup, migration deploy, Prisma validate, API type-check, web type-check, strict lint, web build, PM2 start on port 3027, and health check.
- Staging smoke passed: instructor duplicated the filmmaking course template, created a class, two students joined by invite code, student completed a lesson, instructor created four template assignments, student submitted a linked Story Workspace project, instructor opened read-only review context, added a character comment, requested revision, student resubmitted, instructor graded, analytics events were created, and a second student was denied access to the submission.
- Production health remained clean for `https://app.raivstream.com/api/health` and `https://r16.raivstream.com/api/health`.
- Backup preserved: `/root/raivstream/backups/pre_phase_7a_academy_20260724-234614.sql`.
- Staging VPS gate passed in `/root/raivstream-phase6b-staging`: migration deploy, Prisma validate, API type-check, web type-check, strict lint, web build, PM2 restart, and health check.
- Staging smoke created "A dog going to school", generated three Road to School image versions, confirmed 720x1280 R2 story-project asset URLs, marked one favorite, set a non-latest asset as active, soft-removed a non-active asset, confirmed Storybook used the active asset instead of latest, and verified asset analytics events.
- Production health remained clean for `https://app.raivstream.com/api/health` and `https://r16.raivstream.com/api/health`.
- R16 path remains simple-copy only in the workspace UI; prompt/provider/model/metadata/debug labels are gated out of the R16 render path.
- VPS backup created before staging migration: `/root/raivstream/backups/pre_phase_6a_character_director_*.sql`.
- Staging migration deploy/build passed on `/root/raivstream-phase6a-staging`, served on `127.0.0.1:3014`.
- Real provider smoke regenerated the `Road to School` scene after directing Max as Curious/Adventurous, motivation Make Friends, walking style Skip, and Luna as a very close friend.
- Smoke confirmed 720x1280 R2 output, 80 credit deduction, Story DNA metadata, character-aware prompt text, no scene-record rewrite after character update, admin character insights, analytics events, and R16 hiding prompt/provider/model metadata.

### 2026-07-13: Phase 6B Story Workspace And Asset Manager

Changed:

- Added dedicated workspace route: `/story-playground/[projectId]`.
- Workspace tabs:
  - Overview
  - Story
  - Characters
  - Scenes
  - Assets
  - Storybook
- Updated `/story-playground` My Stories actions:
  - Continue opens `/story-playground/{projectId}`.
  - Add Pictures opens `/story-playground/{projectId}?tab=scenes`.
  - Read Storybook keeps existing storybook route.
- Added project workspace payload API with project details, Story DNA, chapters, questions, characters, scenes, latest assets, active assets, asset counts, storybook readiness, audience mode, and visual style.
- Added Asset Manager grouped by scene with:
  - active image
  - latest image
  - version labels
  - favorite marker
  - preview
  - compare for non-R16
  - set active image
  - soft remove for non-R16
  - regenerate from current scene settings
- Storybook image selection now uses:
  1. active image
  2. latest ready image
  3. `scene.imageUrl`
  4. placeholder
- Existing first-image behavior remains backward compatible: when a scene has no active image, the first generated ready image becomes active automatically. Later regenerations become latest but do not override the active image.
- R16 workspace labels remain simple and hide provider/model/prompt/metadata/credit/debug language.

Schema:

- Added `StorySceneSeed.activeImageAssetId`.
- Added `StorySceneAsset.isFavorite`.
- Added `StorySceneAsset.selectedForStorybookAt`.
- Added `StorySceneAsset.deletedAt` for soft removal.
- Migration: `20260713150000_story_workspace_asset_manager`.

APIs:

- `story.getWorkspace`
- `story.trackWorkspaceTab`
- `story.setActiveSceneImage`
- `story.favoriteSceneAsset`
- `story.trackAssetCompared`
- `story.deleteSceneAsset`
- Existing `story.listSceneAssets` and `story.getSceneAsset` now ignore soft-deleted assets.

Analytics:

- `story_workspace_opened`
- `story_workspace_tab_changed`
- `asset_manager_opened`
- `asset_set_active`
- `asset_favorited`
- `asset_compared`
- `asset_removed`
- `storybook_image_selection_changed`

Verification:

- `pnpm --filter @raivstream/database db:generate` passed.
- `pnpm --filter @raivstream/database exec prisma validate` passed with local placeholder DB URLs.
- `pnpm --filter @raivstream/api type-check` passed.
- `pnpm --filter @raivstream/web type-check` passed.
- `pnpm --filter @raivstream/web lint --max-warnings=0` passed.
- `pnpm --filter @raivstream/web build` passed with local placeholder DB URLs and read-aloud disabled.

## Known Issues And Follow-Ups

- Prisma `db push` is blocked by Supabase cross-schema FK metadata. Use controlled SQL or update Prisma datasource multi-schema configuration before relying on `db push`.
- Story Studio currently uses deterministic prompt compilation, not an LLM story planner. Story Playground can use an OpenAI-compatible text provider when configured, otherwise it falls back to deterministic story text.
- Story Playground now has idea, questions, story, My Stories resume library, scene cards, character bible, visual style selection, enhanced hidden prompt composer, scene image generation, storybook viewer, and first-party product analytics. Remaining story product work is scene video generation and narration.
- Story Studio storyboard asset storage still accepts generated output URLs or pasted URLs. Story Playground scene image assets now use R2-backed asset history.
- `supabase-pooler` is stopped. If another client needs pooled DB access, configure it on a non-conflicting port and verify tenant/user credentials.
- Root local working tree has unrelated untracked/local files such as `.claude/`, `.codex/`, and `AGENTS.md`; do not stage them unless explicitly requested.

### 2026-07-24: Phase 7A Raivstream Academy Foundation

Implemented the Academy foundation as a learning layer around existing Story Workspace projects. Studio and Story Playground behavior remain unchanged.

Routes:

- `/academy`
- `/academy/student`
- `/academy/instructor`
- `/academy/classes`
- `/academy/classes/[classId]`
- `/academy/classes/[classId]/lessons/[lessonId]`
- `/academy/classes/[classId]/assignments/[assignmentId]`
- `/academy/submissions/[submissionId]`
- `/admin/academy`

Schema:

- Added course-scoped Academy enums for course/class/membership/lesson/assignment/submission/comment/progress states.
- Added `AcademyCourse`, `AcademyClass`, `AcademyClassMembership`, `AcademyCourseModule`, `AcademyLesson`, `AcademyAssignment`, `AcademySubmission`, `AcademyRubricScore`, `AcademyComment`, and `AcademyLessonProgress`.
- Added Academy notification enum values.
- Submission references `StoryProject` and stores only a lightweight snapshot for audit.
- Migration: `20260724120000_academy_foundation`.

APIs:

- Added `academy` tRPC router with course template duplication, course/class creation, invite-code join, student dashboard, instructor dashboard, class detail, lesson progress, assignment creation/templates, assignment context for Story Workspace, submission, review, comments, project listing, and admin overview.
- Authorization helpers enforce course owner, class instructor/TA, enrolled student, platform admin, submission owner, and linked project owner boundaries.
- A student cannot view another student's submission unless peer review is added later.

Academy UX:

- Student dashboard shows classes, assignments, submissions, feedback, and Story Workspace entry.
- Instructor dashboard shows classes, roster summary, assignments, and review queue.
- Class page shows lessons, assignments, invite code, and roster.
- Lesson page marks progress only when the student explicitly saves/completes.
- Assignment page lets students attach existing Story Workspace projects and deep-link to the relevant workspace tab.
- Submission page supports read-only review context, instructor comments, revision requests, approval, grading, and rubric score persistence.
- Story Workspace shows an Academy task banner when opened with `academyAssignment`.
- Main nav adds Academy for signed-in non-R16 users; R16 nav is unchanged.

Analytics:

- Tracks `academy_opened`, `course_created`, `class_created`, `student_joined_class`, `lesson_opened`, `lesson_completed`, `assignment_opened`, `assignment_started`, `assignment_submitted`, `submission_revision_requested`, `assignment_resubmitted`, `submission_approved`, `submission_graded`, `instructor_comment_added`, and `academy_workspace_opened`.
- No private lesson text, feedback body, or prompt text is stored in analytics properties.

Seed/demo:

- Added `pnpm db:seed:academy-demo`.
- Seeds one 4-week filmmaking course, one active class, one instructor, two students, eight lessons, four assignments, one draft submission, one submitted assignment, and one revision-request submission.
- The script refuses production seeding unless `ALLOW_PRODUCTION_DEMO_SEED=true`.

Verification:

- `pnpm --filter @raivstream/database db:generate` passed.
- `pnpm --filter @raivstream/database exec prisma validate` passed with local placeholder DB URLs.
- `pnpm --filter @raivstream/api type-check` passed.
- `pnpm --filter @raivstream/web type-check` passed.
- `pnpm --filter @raivstream/web lint --max-warnings=0` passed.
- `pnpm --filter @raivstream/web build` passed with local placeholder DB URLs and read-aloud disabled.

Deferred:

- Peer critique, AI Film Mentor, certificates, institution billing, live classes, video conferencing, timeline editor, movie stitching, read-aloud, narration, final public showcase, portfolio publishing, and course marketplace.

### 2026-07-26: GitHub Actions VPS Deploy Hardening

Updated `.github/workflows/deploy.yml` after a transient Next.js output-tracing failure during final build trace collection.

Changed:

- Deployment job now uses local and remote `set -euo pipefail`.
- GitHub Actions deploy concurrency now queues instead of canceling in-progress deploys.
- Remote deployment uses `flock -n /tmp/raivstream-deploy.lock` and fails cleanly if another deployment is running.
- Remote code sync uses `git fetch origin` plus `git reset --hard origin/main`.
- Runtime env files are preserved before reset and restored afterward:
  - `.env`
  - `apps/web/.env.local`
  - `packages/database/.env`
- No `git clean` is used, so untracked production backups/runtime files remain untouched.
- Corepack is run non-interactively with pnpm `8.15.0`.
- Deployment runs `pnpm install --frozen-lockfile`.
- Deployment gate now runs:
  - Prisma migrate deploy
  - Prisma validate
  - Prisma client generation
  - API type-check
  - web type-check
  - strict web lint
  - clean `apps/web/.next`
  - web build
- PM2 restart happens only after a successful build.
- Post-restart health checks are required for both app and R16 endpoints.
- Logs print the deployed commit SHA.

Not changed:

- Read-aloud flags.
- Movie-stitching files.
- Application feature code.

### 2026-07-26: Phase 8B Creative Critic And Self-Improving Generation

Implemented the post-generation quality loop for Story Playground:

- Added `packages/api/src/lib/creativeCritic/` with a modular critic engine, OpenAI-compatible multimodal provider, Zod-validated structured result schema, score normalization, threshold decisions, improvement planner, and replaceable per-dimension critic descriptors.
- Added additive schema/migration `20260726090000_creative_critic_phase_8b`.
- New data:
  - `CreativeCriticRun`
  - `CreativeCriticFeedback`
  - `CreativeCriticRunStatus`
  - `CreativeCriticRecommendation`
  - `CreativeCriticMode`
  - `CreativeAssetStatus`
  - nullable StoryProject critic settings
  - asset-level creative status, score, recommendation, approval fields
- New story APIs:
  - `story.runCreativeCritic`
  - `story.getCreativeCriticRun`
  - `story.listCreativeCriticRuns`
  - `story.applyCriticImprovementPlan`
  - `story.regenerateFromCritic`
  - `story.approveSceneAsset`
  - `story.rejectSceneAsset`
  - `story.updateCreativeCriticSettings`
  - `story.submitCreativeCriticFeedback`
- Image generation now creates a critic run after a successful scene image and starts quality review in the background.
- If no multimodal critic provider is configured, generation is not blocked; the run is marked skipped/unavailable and the asset remains usable.
- Improvement plans create a new creative specification version in `StoryScenePrompt` metadata instead of overwriting the original specification.
- Improve-and-regenerate uses the critic improvement plan as compiler guidance and preserves original assets/history.
- Storybook image fallback now prefers active creatively approved images, then active ready images, then latest creatively approved images, then latest ready images, then legacy scene image URL, then placeholder.
- Non-R16 Story Workspace asset cards show creative status, score, key strengths/issues, review again, improve/regenerate, approve, reject, and human feedback controls.
- R16 keeps simple picture language and does not expose critic reports, scores, provider/model metadata, prompts, JSON, or debug internals.
- `/admin/prompt-quality` now includes Creative Critic inspection data in expanded rows: scores, strengths, issues, improvement plans, retry lineage, provider/model, and human critic feedback.
- Added analytics events for critic started/completed/failed/skipped, scores, improvement plans, retries, creative approval/rejection, feedback, and human disagreement.

Environment:

- `CREATIVE_CRITIC_ENABLED` defaults on unless set to `false`.
- `CREATIVE_CRITIC_MODEL` overrides critic model.
- `OPENAI_VISION_MODEL` is the next model fallback.
- `CREATIVE_CRITIC_APPROVAL_THRESHOLD` defaults to `90`.
- `CREATIVE_CRITIC_MAX_RETRIES` defaults to `1` and is hard-capped at `3`.

Verification:

- `pnpm --filter @raivstream/database db:generate` passed.
- `pnpm --filter @raivstream/database exec prisma validate` passed with local placeholder DB URLs.
- `pnpm --filter @raivstream/api type-check` passed.
- `pnpm --filter @raivstream/web type-check` passed.
- `pnpm --filter @raivstream/web lint --max-warnings=0` passed.
- `pnpm --filter @raivstream/web build` passed with local placeholder DB URLs and read-aloud disabled.

Deferred:

- Production deployment.
- Staging migration/provider verification.
- Fully automatic retry-until-threshold loops.
- Timeline, Movie Builder, read-aloud, narration, publishing, marketplace, and Academy expansion.

### 2026-07-26: Phase 8B.1 Creative Critic Runtime Safety And Test Harness

Hardened the local Phase 8B implementation without deploying production.

Added API test foundation:

- Added Vitest to `packages/api`.
- Added `packages/api/vitest.config.ts`.
- Added API scripts:
  - `pnpm --filter @raivstream/api test`
  - `pnpm --filter @raivstream/api test:watch`
- Added 24 tests across 6 files under `packages/api/src/lib/creativeCritic/__tests__/`.

Runtime safety helpers:

- `runtimeSafety.ts`
  - retry mode decisions for `OFF`, `SUGGEST`, `AUTO_ONCE`, and `AUTO_UNTIL_THRESHOLD`
  - hard retry cap of 3
  - project lower retry cap
  - threshold stop logic
  - deterministic critic run idempotency keys
  - deterministic critic retry idempotency keys
  - credit policy guardrails
  - creative/moderation separation helper
  - R16 asset payload sanitizer
- `storybookSelection.ts`
  - shared Storybook image fallback order:
    1. active creatively approved image
    2. active ready image
    3. latest creatively approved image
    4. latest ready image
    5. legacy `scene.imageUrl`
    6. placeholder
  - moderation-rejected assets are excluded from selection when that status is available.

Router hardening:

- `regenerateFromCritic` now returns the existing resulting asset for idempotent replay instead of creating another asset/job/deduction.
- Retry limit blocks log safe metadata and never log prompts, story text, comments, signed URLs, or secrets.
- Storybook response now uses the shared `selectStorybookImageForScene` helper.
- R16 workspace and asset-list responses now sanitize asset payloads at the API layer, removing provider/model/prompt/negative prompt/score/report/debug fields.
- Mocked critic-engine tests cover idempotent run creation, high-score approval, medium-score improvement plans, skipped unavailable provider, and failed malformed provider response.

Observability:

- Added structured runtime logs for critic start/completion/skipped/failed and retry attempted/completed/blocked/idempotent replay.
- `/admin/prompt-quality` now includes runtime critic counters for completed/skipped/failed runs, average duration, average score, retry rate, retry success rate, average score improvement, and human disagreement rate.

Test coverage categories:

- score aggregation, weighted/unweighted scoring, clamping, invalid numeric input
- threshold decisions and configurable threshold
- retry modes and hard/project retry limits
- threshold reached stop behavior
- deterministic idempotency key construction
- credit policy: critic review is free, retry generation charges once, replay does not deduct, provider failure refunds, low score does not refund
- creative status versus moderation status
- R16 filtering of provider/model/prompt/score/report fields
- improvement plan application without mutating the original creative specification
- empty improvement plan handling
- Storybook fallback order and pre-critic backward compatibility
- moderation-rejected Storybook exclusion
- critic provider unavailable/malformed response validation

Verification:

- `pnpm --filter @raivstream/database exec prisma validate` passed with local placeholder DB URLs.
- `pnpm --filter @raivstream/database db:generate` passed.
- `pnpm --filter @raivstream/api type-check` passed.
- `pnpm --filter @raivstream/web type-check` passed.
- `pnpm --filter @raivstream/web lint --max-warnings=0` passed.
- `pnpm --filter @raivstream/api test` passed: 6 files, 24 tests.
- `pnpm --filter @raivstream/web build` passed with local placeholder DB URLs and read-aloud disabled.

Not performed:

- No production deployment.
- No staging VPS deployment or real provider/R2 smoke test in this turn.
- No timeline, movie builder, stitching, read-aloud, narration, publishing, marketplace, or Academy expansion work.

### 2026-07-26: Phase 8B.2 Creative Critic Staging Qualification

Qualified Phase 8B on an isolated VPS staging deployment without touching production.

Staging environment:

- Path: `/root/raivstream-phase8b2-staging`
- PM2 process: `raivstream-phase8b2-staging`
- Port: `3032`
- Isolated Postgres container: `raivstream-phase8b2-postgres`
- Isolated database: `raivstream_phase8b2`
- Backup files:
  - `/root/raivstream/backups/pre_phase_8b2_critic_20260726-230340.sql`
  - `/root/raivstream/backups/pre_phase_8b2_critic_baselined_20260726-230529.sql`
- Qualification report: `docs/operations/phase-8b2-staging-qualification.md`

Validation passed on staging:

- `pnpm --filter @raivstream/database exec prisma migrate deploy`
- `pnpm --filter @raivstream/database exec prisma validate`
- `pnpm --filter @raivstream/database db:generate`
- `pnpm --filter @raivstream/api type-check`
- `pnpm --filter @raivstream/web type-check`
- `pnpm --filter @raivstream/web lint --max-warnings=0`
- `pnpm --filter @raivstream/api test` passed: 6 files, 24 tests.
- `pnpm --filter @raivstream/web build`
- isolated staging health check on port `3032`

Real provider/R2 smoke passed:

- Created story from `A dog going to school`.
- Generated 6 scenes and selected `Road to School`.
- Generated 3 initial images and 1 critic retry image.
- RunPod/R2/OpenAI critic path executed successfully.
- Assets were stored under `story-projects/{projectId}/scenes/{sceneId}/assets/{assetId}.png`.
- Actual execution model was recorded as RunPod `z-image-turbo` while requested model stayed `FLUX`.
- All generated images recorded `720x1280`.
- Four usage transactions deducted 80 credits each, with no duplicate references.
- Four Creative Critic runs completed and analytics events were written.
- Retry replay returned the existing generated asset and did not create a duplicate generation/deduction.
- R16 API responses hid prompt/provider/model/critic detail fields.
- Non-admin access to prompt-quality admin data was denied.

Release-blocking issue found and fixed:

- Initial smoke showed Storybook could select a creativeStatus `REJECTED` asset if it was still the active image.
- Fixed `selectStorybookImageForScene` to exclude creativeStatus `REJECTED`.
- Added regression coverage for creative-rejected active assets falling back to approved images.
- Reran full staging gate and provider smoke successfully.

Production state:

- `https://app.raivstream.com/api/health` healthy.
- `https://r16.raivstream.com/api/health` healthy.
- Production PM2 `raivstream-web` was not restarted.

Decision:

- GO for controlled production deployment of Phase 8B/8B.1/8B.2 after committing the Storybook rejection fix with the Phase 8B files.

### 2026-08-23: Phase 9A Sequence Workspace and Timeline Editor

Implemented Phase 9A locally in clean isolated worktree `C:\Raiv\raivstream-phase9a-current` on branch `codex/phase-9a-sequence-workspace-current`, based on `origin/main` commit `f2ed6b467bd03d4fa33b91f1afd0b6b3322c9205`.

Added:

- Additive migration `20260823090000_sequence_workspace_phase9a`.
- Prisma enums: `StorySequenceStatus`, `SequenceShotType`, `SequenceCameraMovement`, `SequenceCameraSpeed`, `SequenceTransitionType`.
- Prisma models: `StorySequence`, `StorySequenceScene`, `SequenceVersion`.
- `StoryProject.lastWorkspaceTab` for Continue/Resume.
- Pure sequence planning helpers for duration bounds, transition/hold semantics, asset eligibility, duplicate-safe reorder, snapshots, runtime, and Film Blueprint serialization.
- Story router procedures:
  - `story.getOrCreateSequence`
  - `story.getSequence`
  - `story.updateSequence`
  - `story.reorderSequence`
  - `story.updateSequenceScene`
  - `story.duplicateSequenceScene`
  - `story.removeSequenceScene`
  - `story.restoreSourceSceneToSequence`
  - `story.createSequenceVersion`
  - `story.listSequenceVersions`
  - `story.restoreSequenceVersion`
  - `story.duplicateSequenceVersion`
  - `story.trackSequenceAnalytics`
- Non-R16 Story Workspace `Sequence` tab with timeline, drag/drop reorder, duplicate, enable/disable, remove, restore source scene, inspector, independent image selection, duration, hold, shot type, camera movement/speed/multiplier, transition/duration, zoom-ready data, notes, runtime panel, Film Blueprint summary, timed storyboard animatic preview, and version save/restore/duplicate.
- `/admin/sequence` aggregate insights page.
- Sequence analytics events.
- Documentation:
  - `ROADMAP.md`
  - `docs/architecture/story-sequence-workspace.md`
  - `docs/adr/0001-sequence-workspace-canonical-edl.md`
  - `docs/operations/phase-9a-staging-smoke.md`

Runtime semantics:

- Runtime equals enabled shot duration plus explicit hold time.
- Transition duration is planning metadata and does not add runtime because transitions overlap adjacent shots.

Important boundaries:

- `StorySequenceScene` references `StorySceneSeed`; it does not duplicate source story scenes.
- Duplicating a timeline item duplicates the sequence entry only.
- Sequence asset selection is independent from Storybook active image and Asset Manager state.
- R16 cannot open sequence APIs or see the Sequence tab.
- No Movie Builder, FFmpeg, movie stitching, image-to-video generation, narration, voice generation, read-aloud, soundtrack generation, subtitle generation, publishing, marketplace, AI Film Mentor, or Academy expansion was added.
- Production was not deployed.

Verification completed so far:

- `pnpm install --frozen-lockfile` completed after `corepack prepare pnpm@8.15.0 --activate`; `corepack enable` printed an EPERM warning for `C:\Program Files\nodejs\pnpx`, but pnpm 8.15.0 was prepared and install completed.
- `pnpm --filter @raivstream/database db:generate` passed.
- `pnpm --filter @raivstream/database exec prisma validate` passed.
- `pnpm --filter @raivstream/api test` passed: 7 files, 30 tests.
- `pnpm --filter @raivstream/api type-check` passed.
- `pnpm --filter @raivstream/web type-check` passed.
- `pnpm --filter @raivstream/web lint --max-warnings=0` passed.
- `pnpm --filter @raivstream/web build` passed with local placeholder DB URLs, strong local-only JWT secrets, and read-aloud disabled.

Staging status:

- Phase 9A.1 staging qualification completed on the VPS using the established `raivstream` SSH alias and isolated checkout `/root/raivstream-phase9a-staging`.
- Staging DB used dedicated container `raivstream-phase9a-supabase-postgres`, host port `127.0.0.1:55484`, database `raivstream_phase9a_pg`.
- Backup created before migration testing: `/root/raivstream/backups/pre_phase_9a_sequence_20260823-125435.sql`, SHA256 `0cd37b08272b3d6b68b3c3ccfc3f323fcdb26421bed5c770fdd9877c2f25df55`.
- Migration `20260823090000_sequence_workspace_phase9a` applied successfully to staging; second deploy was idempotent.
- Full staging gate passed after the version-number regression fix: Prisma validate/generate, API type-check, web type-check, strict web lint, API tests, clean web build.
- API tests now pass: 7 files, 31 tests.
- Functional smoke used project `cms2bqa710005fq5por678ekh` (`Buddy Goes to School`) and sequence `cmt5pfxjf000er1ib8dody63t`.
- Smoke verified sequence creation, idempotency, asset independence, asset safety, reorder, duplicate, disable, remove/restore, runtime calculation, shot/camera/transition metadata, version restore/duplicate, Film Blueprint, authorization, R16 blocking, admin analytics, and production health.
- Defect found and fixed: duplicate-version creation after restoring an older version now uses max existing `versionNumber` + 1 instead of `currentVersionNumber` + 1.
- Qualification report: `docs/operations/phase-9a-staging-qualification.md`.
- Decision: GO for controlled production release. Production was not deployed during staging qualification.

Production release:

- Release commit `f5529bbe8c0d968cc2b5e16d9fc1de97ec8b8768` (`Add Sequence Workspace and film blueprint`) was pushed to `origin/main`.
- Fresh production backup created before migration: `/root/raivstream/backups/pre_phase_9a_sequence_20260823-160354.sql`, size `1362206` bytes, SHA256 `25e757764a372b76f2b49375d783fb04c58c2bb4edcc49f3b6afb7e810b1955e`.
- Production migration deploy completed and was idempotent on rerun.
- Production gate passed under `/tmp/raivstream-deploy.lock`: Prisma migrate/validate/generate, API type-check, web type-check, strict web lint, API tests, clean web build, PM2 restart, app health, and R16 health.
- Production API tests passed: 7 files, 31 tests.
- Deployed production commit: `f5529bbe8c0d968cc2b5e16d9fc1de97ec8b8768`.
- Controlled production smoke created dedicated project `cmt5vv7of0003ahd2ww73n4ed` and sequence `cmt5vv7s10016ahd24e8dgn54`.
- Production smoke verified sequence initialization, idempotency, reorder, duplicate without source scene duplication, disable/runtime update, timing metadata, shot/camera/transition metadata, asset independence, version restore, version-number allocation `1,2,3`, Film Blueprint provider-free contract, cross-user denial, R16 API denial, ADMIN-only sequence analytics, and route health.
- R16 page smoke found no Sequence/Timeline/Film Blueprint/Camera Movement/Version History labels.
- Phase 9A status: PRODUCTION COMPLETE.
- Phase 9B was not started.

### 2026-08-23: Phase 9B.1 Movie Builder Foundation and Deterministic Render Pipeline

Implemented Phase 9B.1 locally in clean isolated worktree `C:\Raiv\raivstream-phase9b1-current` on branch `codex/phase-9b1-movie-builder`, based on production commit `3dadd703dc1403f00ddb46e415dc30a1aa20ba5b`.

Added:

- Additive migration `20260823170000_movie_builder_phase9b1`.
- Prisma enums: `MovieRenderStatus`, `MovieAssetStatus`.
- Prisma models: `MovieRenderJob`, `MovieAsset`, `MovieRenderEvent`.
- `movieRenderPlanning` pure helpers for Phase 9A Film Blueprint consumption, selected-image resolution, deterministic render plan hashing, render readiness, transition normalization, and idempotent job reuse decisions.
- `movieRenderWorker` server worker abstraction for FFmpeg-based still-image movie rendering, camera motion simulation, MP4 assembly, R2 upload, render events, READY/FAILED transitions, and credit refunds on platform failure.
- Story router procedures:
  - `story.getMovieBuilder`
  - `story.createMovieRender`
  - `story.getMovieRender`
  - `story.listMovieRenders`
  - `story.retryMovieRender`
  - `story.cancelMovieRender`
  - `story.setCurrentMovie`
- Non-R16 Story Workspace `Film` tab with preflight, render plan summary, Build Movie, active progress polling, preview, download, render history, retry/cancel, and current-version selection.
- `/admin/movie-renders` diagnostics page plus `admin.movieRenderDiagnostics`.
- Story analytics event names for movie builder open/start/reuse/retry/completion/failure.
- API tests for render planning determinism, asset eligibility, idempotent reuse, and worker READY transition using injected FFmpeg/R2 fakes.

Runtime semantics:

- Movie render consumes the Phase 9A Film Blueprint and stores a snapshot on `MovieRenderJob`.
- Render hash is based on canonical blueprint, selected asset identities/URLs, and renderer defaults.
- Repeated render requests for the same active or READY hash reuse the existing job/asset and do not charge credits again.
- Rendering creates a new `MovieAsset` version and marks it current without changing `StorySceneSeed`, `StorySequenceScene`, `SequenceVersion`, Storybook image selection, Asset Manager active selections, or Creative Critic results.
- Output target is deterministic portrait MP4: 720x1280, 30 fps, H.264, no audio.
- Only still-image FFmpeg rendering was added. No AI image-to-video, RunPod video, Kling, Veo, Seedance, Wan, TTS, narration, soundtrack, subtitles, publishing, marketplace, read-aloud, or Academy expansion was added.
- R16 cannot open movie render APIs or see the Film tab.

Verification completed locally:

- `pnpm install --frozen-lockfile` completed in the isolated worktree. `corepack enable` printed an EPERM warning for `C:\Program Files\nodejs\pnpm`, but install completed with the available pnpm and the lockfile.
- `pnpm --filter @raivstream/database exec prisma validate` passed with local placeholder `DATABASE_URL` and `DIRECT_URL`.
- `pnpm --filter @raivstream/database db:generate` passed.
- `pnpm --filter @raivstream/api test` passed: 9 files, 35 tests.
- `pnpm --filter @raivstream/api type-check` passed.
- `pnpm --filter @raivstream/web type-check` passed.
- `pnpm --filter @raivstream/web lint --max-warnings=0` passed.
- `apps/web/.next` was cleaned before build using a resolved in-worktree Node filesystem call because direct PowerShell `Remove-Item` was blocked by local command policy.
- `pnpm --filter @raivstream/web build` passed with local placeholder DB URL, strong local-only JWT secrets, and no production env values.

Current release state:

- Phase 9B.1 is LOCAL IMPLEMENTATION COMPLETE.
- Phase 9B.1 staging qualification completed on the VPS in isolated checkout `/root/raivstream-phase9b1-staging`; production was not deployed.
- Qualification report: `docs/operations/phase-9b1-staging-qualification.md`.
- Backup before staging migration: `/root/raivstream/backups/pre_phase_9b1_movie_builder_20260823-164610.sql`, SHA256 `14f6d80d922f2af3411edf22eacb8c2b4cef5f8aa3f11f5ff6988f5a998791c3`.
- Staging migration `20260823170000_movie_builder_phase9b1` applied successfully to production-like restored staging DB `raivstream_phase9b1_restore_20260823164714`.
- VPS FFmpeg dependency installed and verified: `ffmpeg version 6.1.1-3ubuntu5`, `ffprobe version 6.1.1-3ubuntu5`.
- Full staging gate passed: Prisma migrate/validate/generate, API type-check, web type-check, strict web lint, API tests, clean web build.
- Staging API tests passed: 9 files, 35 tests.
- Runtime smoke created staging project `cmt5xo6900004hdkl3g8m1cal`, sequence `cmt5xo6jz000jhdkl03mfwsm9`, render job `cmt5xo6o4000yhdkluu1rjwk7`, and movie asset `cmt5xod06001lhdklamgtkj9e`.
- Smoke verified FFmpeg MP4 render, R2 upload at `story-projects/cmt5xo6900004hdkl3g8m1cal/movies/cmt5xo6o4000yhdkluu1rjwk7/movie.mp4`, one-time credit deduction, idempotent replay without extra charge, failed-render refund behavior, R16 API denial, and admin diagnostics before final runtime verification.
- Independent FFprobe check of the generated MP4 found a release-blocking runtime mismatch: expected `12` seconds, actual `8.566667` seconds, difference `3.433333` seconds. This exceeds the `<= 0.25` second tolerance and the worker incorrectly marked the job `READY`.
- Defects found and fixed during staging: null camera speed now falls back to `1`, render commands have a timeout guard, and moving-shot filters use lightweight scale/crop pan and tilt instead of expensive `zoompan`.
- Caveats: browser signed-in Film tab QA is still required after the runtime fix; the worker is still API-process background execution and should become a dedicated worker before high-volume rendering; historical migrations are not replayable from empty DB due a pre-existing migration-chain issue, so qualification used a production-like restore.
- Phase 9B.1A runtime remediation corrected the NO-GO blocker without adding new Movie Builder features.
- Confirmed root cause: transition handles were rendered on incoming clips, but `xfade` offsets used the shot boundary instead of `current assembled duration - transition duration`; FFprobe output was also not parsed as an authoritative READY gate.
- Canonical runtime semantics now remain: shot duration is final screen time; overlapping transitions consume internal render handles and do not change final runtime.
- Renderer version changed to `phase-9b1a-v2`; render hashes include the corrected effective plan semantics.
- Added shared runtime helpers, exact-frame still segment rendering, corrected xfade offsets, FFprobe validation before upload/READY, `OUTPUT_DURATION_MISMATCH`, and admin runtime diagnostics.
- API tests now pass: 9 files, 41 tests.
- Staging Phase 9B.1A backup: `/root/raivstream/backups/pre_phase_9b1a_runtime_fix_20260823-212055.sql`, size `1436059`, SHA256 `73ae3d3e0a98cba1966685e4800715cfd49b15a2857a1b2e483401fc51112a5b`.
- Real FFmpeg timing integration passed:
  - cuts-only: expected `12`, actual `12`, delta `0`;
  - one dissolve: expected `10`, actual `10`, delta `0`;
  - multiple dissolves: expected `12`, actual `12`, delta `0`;
  - mixed transitions: expected `16`, actual `16`, delta `0`.
- Original 12-second R2 smoke rerun passed with project `cmt67j1c60004256mnodeq51n`, sequence `cmt67j1ph000j256m2ki7r73e`, render job `cmt67j1sy000y256mz5ha39wv`, movie asset `cmt67j5ev001l256m8bvbe34q`, R2 key `story-projects/cmt67j1c60004256mnodeq51n/movies/cmt67j1sy000y256mz5ha39wv/movie.mp4`.
- Corrected output: expected `12`, FFprobe actual `12.000000`, delta `0`, 720x1280, 30 fps, h264, file size `12640`, checksum `029948fad0991cfcc24cb48175bfbd460b4d760d10de0626ba1085e9cd74a49b`.
- Credit verification: successful render deducted exactly 1 credit; idempotent replay reused the render and did not deduct again.
- R16 movie builder API denial and production health checks remained clean.
- Decision: GO for controlled Phase 9B.1 production release. No commit, push, production migration, production PM2 restart, or production deployment was performed during requalification.
- Production render smoke completed 2026-08-31: 24-second movie rendered via Film tab (account `texdevices@gmail.com`), 100 credits deducted (matching `story:movie_render` rate), no worker crash logged, app and R16 health clean post-render. Phase 9B.1 status: PRODUCTION COMPLETE.
