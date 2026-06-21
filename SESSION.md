# Raivstream Session

This file is the living project/session record for Raivstream. Update it every time a feature is added, changed, deployed, or materially debugged so future development starts from the current GitHub/VPS reality.

Last updated: 2026-06-19
Current GitHub commit deployed to VPS: latest pushed `main` verified on 2026-05-25

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
- `pnpm --filter @raivstream/web lint -- --max-warnings=0` passed.

Verification:

- `pnpm --filter @raivstream/web lint -- --max-warnings=0` passed.
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
- `pnpm --filter @raivstream/web lint -- --max-warnings=0` passed.
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
- `pnpm --filter @raivstream/web lint -- --max-warnings=0` passed.
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
- `pnpm --filter @raivstream/web lint -- --max-warnings=0` passed.
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
- `pnpm --filter @raivstream/web lint -- --max-warnings=0` passed.

## Known Issues And Follow-Ups

- Prisma `db push` is blocked by Supabase cross-schema FK metadata. Use controlled SQL or update Prisma datasource multi-schema configuration before relying on `db push`.
- Story Studio currently uses deterministic prompt compilation, not an LLM story planner. Story Playground can use an OpenAI-compatible text provider when configured, otherwise it falls back to deterministic story text.
- Story Playground now has idea, questions, story, scene cards, character bible, hidden prompt composer, scene image generation, storybook viewer, and first-party product analytics. Remaining story product work is scene video generation and narration.
- Story Studio storyboard asset storage still accepts generated output URLs or pasted URLs. Story Playground scene image assets now use R2-backed asset history.
- `supabase-pooler` is stopped. If another client needs pooled DB access, configure it on a non-conflicting port and verify tenant/user credentials.
- Root local working tree has unrelated untracked/local files such as `.claude/`, `.codex/`, and `AGENTS.md`; do not stage them unless explicitly requested.
