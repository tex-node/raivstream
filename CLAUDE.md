# Raivstream — Claude Context

## What This Is
Short-form vertical video platform (TikTok-style). Turborepo monorepo with a Next.js 15 web app, Expo mobile app (Android + iOS primary endpoint), shared tRPC API package, and a Prisma/PostgreSQL database package.

## Monorepo Layout
```
raivstream/
├── apps/
│   ├── web/          — Next.js 15 (primary web endpoint, deployed to VPS at app.raivstream.com)
│   └── mobile/       — Expo SDK 50 (PRIMARY endpoint — Android + iOS)
└── packages/
    ├── api/          — tRPC v11 router (shared by web and mobile)
    └── database/     — Prisma schema + generated client
```

## Tech Stack
| Layer | Technology |
|---|---|
| Mobile (primary) | Expo SDK 50, React Native, TypeScript, expo-router |
| Web | Next.js 15 App Router, React 18, TypeScript, Tailwind CSS |
| API | tRPC v11, Zod |
| Data fetching | Tanstack Query v5 (react-query) |
| Auth | Custom JWT (email + password, access + refresh tokens, bcryptjs) |
| Database | PostgreSQL + Prisma ORM — self-hosted Supabase on VPS (81.0.246.223) via Docker |
| Storage | Cloudflare R2 (S3-compatible, `@aws-sdk/client-s3`) |
| Payments (primary) | Paystack (NGN — subscriptions + credit purchases) |
| Payments (international) | Stripe (USD — Creator plan) |
| AI generation | xAI Grok Imagine, Wan 2.6 (RunPod public), Seedance 1.5 Pro (RunPod public), Flux.1 Dev (RunPod public), HunyuanVideo (RunPod custom), CogVideoX (RunPod custom, hidden), LTX-2 (RunPod custom, hidden), Nano Banana / Veo 3.1 (Google Gemini, hidden) |
| Credits | Custom credit system — ₦1,000 = 1,000 credits, deducted per AI generation |
| Content moderation | OpenAI omni-moderation-latest (prompt filter + image scan), manual admin queue |
| Cache | Upstash Redis (optional) |
| Monitoring | Sentry, PostHog |
| Process manager | PM2 (`raivstream-web`) on VPS |
| Reverse proxy | Caddy — db.raivstream.com → Kong:8000, app.raivstream.com → Next.js:3000, r16.raivstream.com → Next.js:3000 |
| CI/CD | GitHub Actions → SSH deploy on push to main |

## Key File Paths
```
packages/api/src/index.ts              — appRouter (auth, video, feed, interaction, user, analytics, generation, admin)
packages/api/src/trpc.ts              — router, publicProcedure, protectedProcedure, adminProcedure, moderatorProcedure
packages/api/src/lib/jwt.ts           — signAccessToken, verifyAccessToken, signRefreshToken, extractBearerToken
packages/api/src/lib/credits.ts       — deductCredits(), refundCredits(), MODEL_FEATURE_KEY map
packages/api/src/lib/authService.ts   — registerUser, loginUser, refreshTokens, logoutUser, requestPasswordReset, resetPassword
packages/api/src/lib/promptModeration.ts — moderatePrompt() — Layer 1: regex blocklist, Layer 2: OpenAI omni-moderation-latest text
packages/api/src/lib/contentScanner.ts   — scanAndUpdateVideo() — OpenAI omni-moderation-latest image scan, fire-and-forget
packages/api/src/lib/r2.ts            — uploadBufferToR2(), mirrorUrlToR2() — server-side R2 uploads for AI generation output
packages/api/src/lib/analytics.ts     - first-party event tracking for Story Playground funnel and feedback
packages/api/src/lib/generators/
  index.ts                            — submitGenerationJob(), pollJobStatus(), MODEL_META
  grokImagine.ts                      — xAI Grok Imagine (XAI_API_KEY) — image generation (model: grok-imagine-image)
  nanoBanana.ts                       — Nano Banana image gen via Google Gemini REST API (GEMINI_API_KEY) — hidden
  veo3.ts                             — Veo 3.1 video gen via Google Gemini :predictLongRunning endpoint — hidden
  ltx2.ts                             — LTX-Video 2 via RunPod custom serverless + ComfyUI-LTXVideo — hidden (needs RUNPOD_LTX2_ENDPOINT_ID)
  wan25.ts                            — Wan 2.6 via RunPod public endpoints (wan-2-6-t2v / wan-2-6-i2v); routes by seedImageUrl presence; providerJobId prefixed "t2v:" or "i2v:"
  flux.ts                             — Flux.1 Dev via RunPod public endpoint (black-forest-labs-flux-1-dev); flat JSON input
  hunyuanVideo.ts                     — HunyuanVideo via RunPod custom serverless + ComfyUI-HunyuanVideoWrapper (HyVideo* nodes) — needs RUNPOD_HUNYUAN_ENDPOINT_ID
  cogVideoX.ts                        — CogVideoX-5B via RunPod custom serverless + ComfyUI native nodes — hidden (needs RUNPOD_COGVIDEOX_ENDPOINT_ID)
  seedance.ts                         — Seedance 1.5 Pro I2V via RunPod public endpoint (seedance-v1-5-pro-i2v); requires seed image
  kling.ts                            — Kling I2V + R2V via Kuaishou API; JWT-signed (HS256, Node crypto — no external dep); KLING_I2V uses /v1/videos/image2video (seed image = opening frame); KLING_R2V uses /v1/videos/text2video with reference_image_list; both mirror output to R2
  placeholders.ts                     — Higgsfield (coming soon stub); Kling placeholder removed
  runpod.ts                           — RunPod API client: submitJob, getJobStatus, normaliseStatus, extractOutputUrl, aspectRatioToResolution, durationToFrames
packages/api/src/routers/
  auth.ts                             — register, login, refresh, logout, logoutAll
  video.ts                            — upload flow, getById, updateMetadata, delete; fires scanAndUpdateVideo() after publish
  feed.ts                             — forYou, trending, viewersPick, following; kidsOnly param for R16 mode
  interaction.ts                      — like, dislike, starRating, watchProgress (episode gate enforced)
  user.ts                             — profile, follow, creditBalance, creditHistory, episodeGate
  analytics.ts                        — creator dashboard stats
  generation.ts                       — create (prompt moderation → credit deduction → submit), pollStatus, myJobs, cancel, publish (fires scanAndUpdateVideo())
  admin.ts                            — getOverview, listUsers, setUserRole, adjustCredits, setUserBan,
                                        listCreditRates, updateCreditRate, createCreditRate,
                                        listGenerationJobs, listPurchases,
                                        moderationQueue, moderateVideo, getModerationStats
packages/database/schema.prisma       — all DB models (see Database Models section)
scripts/runpod.ts                     — RunPod dev CLI (pnpm runpod info|endpoints|models|health|test|status)

apps/mobile/
  app/_layout.tsx                     — root layout (hydrates Zustand auth store on launch)
  app/(tabs)/index.tsx                — home feed (TikTok-style vertical scroll)
  app/(tabs)/upload.tsx               — video upload flow
  app/(tabs)/profile.tsx              — user profile
  app/(tabs)/search.tsx               — search screen
  app/(auth)/sign-in.tsx              — combined sign-in / sign-up screen
  app/video/[id].tsx                  — single video modal
  lib/auth.ts                         — Zustand auth store (SecureStore persistence)
  lib/trpc.ts                         — tRPC client
  components/providers/TRPCProvider.tsx
  app.json                            — apiUrl: https://app.raivstream.com, EAS projectId: a836168f-922c-44b6-b42f-fbbe6f15d946
  metro.config.js                     — monorepo Metro config: watchFolders + nodeModulesPaths + unstable_enablePackageExports

apps/web/src/
  app/page.tsx                        — TikTok-style feed visible to ALL users (signed-in and guests)
  app/layout.tsx                      — root layout (async server component — reads x-r16-mode header, injects R16Provider)
  app/upload/page.tsx                 — video upload flow
  app/v/[id]/page.tsx                 — single video view
  app/[username]/page.tsx             — creator profile
  app/analytics/                      — creator analytics dashboard
  app/pricing/page.tsx                — pricing page (Paystack Viewer + Stripe Creator + credit packages)
  app/credits/page.tsx                — credit balance + purchase UI
  app/credits/success/page.tsx        — Paystack callback verification
  app/generate/page.tsx               — AI Studio: radio (Image/Video) + model dropdown; DEFAULT_IMAGE_MODEL=FLUX, DEFAULT_VIDEO_MODEL=WAN_25; HIDDEN_MODELS=['NANO_BANANA','VEO3']
  app/story-playground/page.tsx       — Story Playground Phase 1: idea → guided questions → short story → continuation
  app/settings/                       — user settings
  app/search/page.tsx                 — search page
  app/admin/layout.tsx                — admin layout (responsive sidebar — mobile drawer, desktop fixed)
  app/admin/page.tsx                  — admin overview (stats, model usage, job status, revenue)
  app/admin/users/page.tsx            — user management (role, credits, ban)
  app/admin/moderation/page.tsx       — content moderation queue (approve/reject/flag, content rating, kids-safe toggle)
  app/admin/credits/page.tsx          — credit rate management (inline edit + add rate)
  app/admin/jobs/page.tsx             — generation job history (filter by status/model)
  app/admin/prompt-quality/page.tsx   — admin prompt QA dashboard (style/provider quality, ratings, expandable prompt metadata)
  app/admin/character-insights/page.tsx — admin Character Director insights (traits, goals, fears, relationships, ratings)
  app/admin/revenue/page.tsx          — revenue summary + transaction table
  app/sign-in/[[...sign-in]]/page.tsx — JWT sign-in (reveal password, forgot password link)
  app/sign-up/[[...sign-up]]/page.tsx — JWT sign-up (reveal password, confirm password, strength bar)
  app/forgot-password/page.tsx        — request password reset email
  app/reset-password/page.tsx         — consume reset token, set new password
  app/api/trpc/[trpc]/route.ts        — tRPC HTTP handler (JWT context: cookie for web, Bearer for mobile)
  app/api/auth/login/route.ts         — POST login (sets httpOnly cookies)
  app/api/auth/register/route.ts      — POST register
  app/api/auth/refresh/route.ts       — POST token refresh
  app/api/auth/logout/route.ts        — POST logout
  app/api/auth/forgot-password/route.ts — POST — generates reset token, logs URL to console
  app/api/auth/reset-password/route.ts  — POST — validates token, updates password, revokes sessions
  app/api/paystack/initialize/route.ts  — POST — init subscription or credit purchase
  app/api/paystack/verify/route.ts      — GET  — verify payment reference, credit balance
  app/api/paystack/webhook/route.ts     — POST — Paystack event handler
  app/api/stripe/                       — Stripe webhook + checkout endpoints
  components/feed/FeedTabs.tsx          — tab switcher (Following tab hidden for guests; "Kids Feed" label on R16)
  components/feed/VideoFeed.tsx         — vertical scroll feed; guest sessionStorage tracking (50 ep) + signed-in episodeGate query (10 ep); sticky upgrade banner + PaywallModal; passes kidsOnly to feed queries
  components/feed/PaywallModal.tsx      — hard paywall overlay for GUESTS after 50 free episodes; 3 CTAs: sign-up (10 more free) / subscribe / sign-in
  components/video/VideoCard.tsx        — individual video card; isLocked prop → premium lock overlay; isImageUrl() helper routes to <img> instead of VideoPlayer; landscape images get blurred backdrop (same pattern as landscape videos)
  components/video/VideoPlayer.tsx      — HTML5 / HLS video player (starts muted for autoplay)
  components/video/VideoInteractions.tsx — like/dislike/star buttons
  components/layout/Navbar.tsx          — top nav (glass-blur on marketing, transparent on feed; R16 branding on kids subdomain)
  lib/auth.tsx                          — React AuthProvider + useAuth() + useUser()
  lib/r16.tsx                           — R16Provider + useR16() — kids mode context
  lib/trpc.ts                           — tRPC client setup (Tanstack Query)
  lib/stripe.ts                         — Stripe server client + STRIPE_PLANS
  lib/paystack.ts                       — Paystack helpers + CREDIT_PACKAGES + VIEWER_PLAN
  lib/credits.ts                        — (see packages/api/src/lib/credits.ts — server side)
  middleware.ts                         — cookie-based redirect for protected routes; R16 subdomain detection + blocked route list; x-r16-mode request header forwarding
packages/api/src/lib/storyTextService.ts — Story Playground text provider abstraction with OpenAI-compatible provider + deterministic fallback
```

## Auth Pattern (Custom JWT — no Clerk)
- `auth.register` — creates User with bcrypt-hashed password, returns access + refresh tokens
- `auth.login` — constant-time password compare, returns tokens
- `auth.refresh` — rotates refresh token (family-based reuse detection)
- `auth.logout` / `auth.logoutAll` — revokes refresh token family from DB
- `requestPasswordReset` — generates 32-byte random token, bcrypt-hashes, stores in PasswordResetToken
- `resetPassword` — verifies token, updates password, revokes all sessions atomically
- Access token: 15 min, signed with `JWT_ACCESS_SECRET`
- Refresh token: 30 days, signed with `JWT_REFRESH_SECRET`, stored hashed in DB
- Mobile: tokens persisted via `expo-secure-store`, state managed by Zustand (`apps/mobile/lib/auth.ts`)
- Web: tokens persisted via `localStorage`, `raiv_auth_present=1` cookie used for middleware redirects
- tRPC `protectedProcedure` enforces auth via `ctx.user != null` (not the cookie)

## Admin System
- `UserRole` enum: `VIEWER | CREATOR | MODERATOR | ADMIN`
- `adminProcedure` — requires role === ADMIN
- `moderatorProcedure` — requires role === ADMIN or MODERATOR
- Admin routes gated in `middleware.ts` + layout role check → redirect to `/` if unauthorized
- Navbar shows 🛡️ Admin link for ADMIN/MODERATOR users (hidden on R16 subdomain)
- To promote a user to ADMIN on VPS, use Node.js one-liner from `packages/database/` with Prisma client

## Content Moderation System
### Prompt moderation (`packages/api/src/lib/promptModeration.ts`)
- Runs **before** credit deduction in `generation.create` — rejected prompts cost nothing
- Layer 1: local regex blocklist (CSAM, extreme gore, non-consensual content) — always active, instant
- Layer 2: OpenAI `omni-moderation-latest` text scan — active when `OPENAI_API_KEY` is set (free endpoint)
- Both `prompt` and `negativePrompt` are checked
- Returns `{ allowed: boolean, reason?: string }` — reason shown to user on rejection

### Upload / publish scanning (`packages/api/src/lib/contentScanner.ts`)
- `scanAndUpdateVideo(prisma, videoId, imageUrl)` — fire-and-forget (never blocks the response)
- Triggered in `video.updateMetadata` (after user publish) and `generation.publish` (after AI publish)
- Sends thumbnail/output URL to OpenAI `omni-moderation-latest` with image input
- Decisions: `APPROVED` (no flags) → live in feed immediately | `FLAGGED` (any flag) → admin queue | `PENDING` (API down) → manual review
- Every decision logged to `ModerationLog` with `automated=true` and confidence score

### Admin moderation queue (`/admin/moderation`)
- `admin.moderationQueue` — paginated list filtered by PENDING / FLAGGED / APPROVED / REJECTED
- `admin.moderateVideo` — approve / reject / flag with optional content rating (G/PG/PG-13/R), kids-safe flag, reason
- `admin.getModerationStats` — live counts per status (refreshes every 30s)
- Reject action also sets `VideoStatus = BLOCKED`

### Feed filtering
- All feeds exclude `moderationStatus = REJECTED` videos
- R16 kids feed requires `moderationStatus = APPROVED` AND `isKidsSafe = true`

## R16 Kids Subdomain (r16.raivstream.com)
- Same Next.js app — subdomain detected in `middleware.ts` via `host` header (`r16.*`)
- Dev testing: append `?r16=1` to any URL on `app.raivstream.com`
- Middleware sets `x-r16-mode: 1` on the **request** headers (not response) so server components can read it via `headers()`
- Root layout (`app/layout.tsx`) is async, reads the header, wraps children in `<R16Provider isR16>`
- Client components call `useR16()` from `lib/r16.tsx`
- Blocked routes on R16: `/generate`, `/upload`, `/credits`, `/pricing`, `/analytics`, `/settings`, `/subscription`, `/admin` → redirected to `/`
- Feed: `kidsOnly=true` param → only `isKidsSafe=true` + `moderationStatus=APPROVED` videos
- Navbar: "R16 Kids" branding (green accent), hides Upload/AI Studio/Credits/Pricing/Admin
- FeedTabs: static "Kids Feed" label instead of tab switcher
- Caddy: `r16.raivstream.com { reverse_proxy localhost:3000 }` — add to /etc/caddy/Caddyfile
- DNS: A record `r16.raivstream.com → 81.0.246.223`

## Story Playground Phase 1
- Product direction: Idea → Guided Questions → Short Story → Continue Story → future scene/media generation.
- Default route: `/story-playground`. Advanced `/story-studio` remains available for non-R16 users but is no longer the main story flow.
- Main UI hides JSON, prompt engineering, camera fields, negative prompts, and technical shot terminology.
- Requires sign-in for persisted projects; no guest story-session system exists yet.
- Story Spark captures a short idea such as "A dog going to school".
- Guided question flow stores 3-6 simple button-answer questions in `StoryQuestion`.
- Story generation stores Chapter 1 in `StoryChapter`, updates `StoryProject`, and saves future scene hints in `StorySceneSeed`.
- Continue Story appends Chapter 2, Chapter 3, etc. while preserving previous context.
- Phase 2 scene cards use `story.generateScenes` and existing `StorySceneSeed`.
- School-themed ideas such as "A dog going to school" produce scene cards: Home, Road to School, School Gate, Classroom, Problem, Happy Ending.
- Story Playground shows a film-strip under the generated story, placeholder thumbnails, an edit-scene modal, and a disabled "Make Pictures" coming-soon button.
- Phase 6A Character Director uses `StoryCharacterMemory`, `story.generateCharacterBible`, `story.updateCharacterMemory`, and `story.createCharacterMemory`.
- Named character ideas such as "Max is a young male golden puppy with a blue backpack" must keep Max consistent across all scene cards.
- Scene cards store reusable character reference objects in `StorySceneSeed.characters`, including `promptIngredient` text for the future hidden prompt compiler.
- Story Playground shows editable Character Director cards. Character updates do not regenerate scene cards automatically; future prompt composition reads the latest character memory while previous scene/image records remain unchanged.
- `StoryProject.storyDna` stores internal Story DNA: theme, tone, visual style, hero, primary goal, conflict, resolution, character arc, mood palette, visual palette, and camera language. Do not expose this to R16 users.
- Phase 4 Hidden Prompt Composer uses `StoryScenePrompt`, `story.composeScenePrompt`, and `story.composeAllScenePrompts`.
- Prompt composer turns Scene Card + Character Bible + Mood + Setting into provider-ready prompts for `FLUX`, `WAN_25`, `KLING_I2V`, and `KLING_R2V`.
- Prompt output types: `IMAGE`, `SHORT_VIDEO`, `COMIC_PANEL`.
- Prompt versions are saved per scene with provider, output type, prompt, automatic negative prompt, aspect ratio, duration, and metadata.
- Advanced prompt preview and "Send to AI Studio" are shown only outside R16 and only for CREATOR/MODERATOR/ADMIN users.
- Phase 4B Scene Image Generation uses `StorySceneAsset`, `story.generateSceneImage`, `story.regenerateSceneImage`, `story.listSceneAssets`, and `story.getSceneAsset`.
- Scene images use the hidden prompt composer, existing generator abstraction, `GenerationJob`, credit deduction/refund flow, and R2 mirroring.
- Latest scene image fields live on `StorySceneSeed`: `latestImageAssetId`, `imageStatus`, and `imageUrl`.
- Story scene image R2 key format: `story-projects/{projectId}/scenes/{sceneId}/assets/{assetId}.png`.
- Adult/non-R16 users can view image history. R16 copy stays simple and never shows raw prompts or asset metadata/history.
- Staging runtime test on VPS passed with real RunPod/R2 using isolated staging DB: `A dog going to school` produced Home, Road to School, School Gate, Classroom, Problem, Happy Ending; Max was attached; first image and regenerate both deducted 80 credits, wrote R2 objects, and maintained history/latest links.
- Production Alpha deployment on 2026-06-19 switched `DATABASE_URL`/`DIRECT_URL` away from the broken Supavisor pooler to direct `supabase-db` container access at `172.18.0.2:5432`.
- Production DB was backed up at `/root/raivstream/pre_story_playground_alpha_backup_20260619-021103.sql` before schema changes.
- Supabase DB was not Prisma-migrate baselined, so `migrate deploy` hit `P3005` and `db push` hit the known Supabase cross-schema FK blocker. A controlled Prisma baseline SQL was applied, the three Alpha migrations were resolved as applied, and their idempotent SQL was manually executed once.
- Production smoke test passed with real RunPod/R2 and production DB. Main app health is clean and `/story-playground` renders.
- Public R16 is still DNS-blocked: `r16.raivstream.com` resolves to `3.33.251.168` / `15.197.225.128` instead of VPS `81.0.246.223`. Local R16 host-header routing is healthy and hides prompt/history labels.
- Phase 4C Storybook Viewer adds `/story-playground/[projectId]/storybook` and `/storybook/[projectId]`, with derived `story.getStoryBook`, `story.getStoryBookPage`, and `story.regenerateStoryBook` APIs. No schema changes; pages derive from StorySceneSeed + latest image + chapter text. R16 copy remains simple and hides prompt/provider/model/credit metadata.
- Phase 4.5 Analytics adds `AnalyticsEvent`, `analytics.trackStoryEvent`, server-side story event tracking, Storybook reading events, non-R16 feedback submission, and `/admin/story-analytics` for the Story Completion Funnel.
- Story Playground home now includes a signed-in library/resume section below Story Spark. `story.listMyProjects` returns non-archived recent projects with chapter/question/scene counts and first ready scene image data for progress labels and thumbnails. R16 copy uses `My Stories`, `Keep Going`, `Read Book`, and `Add Pictures`.
- Story Playground prompt quality upgrade adds creator-selectable visual styles, style-aware hidden prompt composition, OpenAI-compatible prompt enhancement via `OPENAI_API_KEY`, deterministic fallback, enhanced prompt metadata, stricter no-text/no-UI negative prompt terms, and analytics for style/enhancement events. R16 never shows raw prompts or JSON.
- R16/kids flow must never expose JSON or prompt text.
- Acceptance example: "Road to School" must include Max's exact visual identity, outdoor school-road setting, and child-safe tone.
- R16/tRPC context forces `audienceMode=KIDS` based on `x-r16-mode`, `r16.*` host, or `?r16=1`.
- Text generation goes through `storyTextService`: OpenAI-compatible chat completions when `OPENAI_API_KEY` is configured, deterministic local fallback otherwise.
- Prompt moderation runs before story generation; KIDS/R16 applies an extra child-safety keyword check.
- Story Playground now includes scene cards, character bible UI, hidden prompt compiler, scene image generation, storybook viewer, and first-party analytics; remaining story product work is scene video generation and narration.

## Credit System
- 1,000 credits = ₦1,000 (configured in `FeatureCreditRate` table via seed.ts or admin UI)
- `deductCredits()` in `packages/api/src/lib/credits.ts` uses atomic `updateMany WHERE balance >= cost` — race-condition safe
- `refundCredits()` called automatically if provider submission fails
- Costs (DB-configurable via /admin/credits): grok_imagine=100, flux=80, wan_25=200, seedance=200, hunyuan_video=300, ltx2=150, cog_video_x=250, higgsfield=400, kling_i2v=500, kling_r2v=450, thumbnail=20, transcribe=30, enhance=100
- Credit packages: starter (1k cr / ₦1k), popular (5k cr / ₦4.5k — best value), pro (10k cr / ₦8k)
- `generation.create` deducts before job creation; `generation.listModels` returns `creditCost` from DB
- Feature key format: `generate:model_name` (e.g. `generate:flux`, `generate:wan_25`, `generate:seedance`)

## Freemium Gate (two-tier)
**Guest (not signed in)**
- 5 unique episode IDs tracked in `sessionStorage` (`rv_guest_watched`)
- After the 5th: `PaywallModal` hard-overlays the feed (videos pause, scroll blocked)
- Modal CTAs: "Sign up free — get 10 more episodes" → `/sign-up` | "Subscribe — ₦1,500/mo unlimited" → `/pricing` | "Already subscribed? Sign in" → `/sign-in`

**Signed-in FREE tier**
- 10 unique episodes tracked server-side via `WatchHistory` count
- `user.episodeGate` query returns `{ watched, limit: 10, isGated, freeContentOnly }`
- After the 10th: dismissable sticky top banner appears ("🔒 Watching free content · Subscribe for unlimited")
- `isPremiumOnly=false` content plays forever — never blocked
- `isPremiumOnly=true` content shows a per-video padlock overlay + "Subscribe — ₦1,500/mo" button
- `interaction.trackProgress` throws `FORBIDDEN / EPISODE_GATE_REACHED` only for premium-only videos past limit

**VIEWER / CREATOR**
- `user.episodeGate` returns `freeContentOnly: false` immediately — no gate, no banner, no lock overlays

**`isPremiumOnly` field**
- Boolean on Video model — creators set this when publishing
- `false` = free content, always watchable after gate (unmonetised on platform)
- `true` = premium content, locked for FREE users past 10 episodes
- Exposed in all feed query selects so client can render lock overlays

## Database Models (schema.prisma)
- **User** — email, username, passwordHash, role (VIEWER|CREATOR|MODERATOR|ADMIN), premiumTier (FREE|VIEWER|CREATOR)
- **RefreshToken** — userId, tokenHash, family, expiresAt, revokedAt
- **PasswordResetToken** — userId, tokenHash, expiresAt, usedAt (1-hour TTL, single use)
- **Video** — rawVideoUrl (R2 private), mp4Url (CDN), hlsMasterUrl, status (UPLOADING→PROCESSING→READY), engagementScore, **isKidsSafe** (Boolean), **contentRating** (String? — G/PG/PG-13/R), **moderationStatus** (ModerationStatus — PENDING/APPROVED/REJECTED/FLAGGED)
- **ModerationLog** — videoId, moderatorId (null=automated), action, reason, automated (Boolean), confidence (Float?)
- **VideoInteraction** — liked, disliked, starRating (1–5), watchTime, completed
- **WatchHistory** — lastPosition, completed, watchedAt
- **Follow** — followerId ↔ followingId
- **Subscription** — Paystack + Stripe fields, provider, tier, status
- **CreditBalance** — userId (unique), balance (Int)
- **CreditTransaction** — userId, amount (+/-), type (PURCHASE|USAGE|BONUS|REFUND), featureKey, balanceBefore, balanceAfter
- **FeatureCreditRate** — featureKey (unique), creditsPerUnit, isActive — admin-configurable costs
- **GenerationJob** — userId, model (NANO_BANANA|GROK_IMAGINE|LTX2|WAN_25|KLING(legacy)|KLING_I2V|KLING_R2V|HIGGSFIELD|VEO3|FLUX|HUNYUAN_VIDEO|COG_VIDEO_X|SEEDANCE), prompt, status, providerJobId, outputUrl, thumbnailUrl, videoId
- **Badge / UserBadge / VideoBadge** — weekly achievement badges
- **FeaturedContent** — curated sections (section, position, week)
- **Category / VideoCategory** — many-to-many video categorisation

## Video Upload Flow
1. Client → `video.requestUpload` → creates UPLOADING Video record + R2 presigned PUT URL (1h expiry)
2. Client → PUT file directly to R2 (bypasses server)
3. Client → `video.confirmUpload` → sets mp4Url, status → PROCESSING (or READY if no transcode)
4. Client → `video.updateMetadata` → title, description, tags, thumbnail, categories → fires content scan (async)

## AI Generation Flow
1. User selects Image or Video mode via radio buttons on `/generate`, picks model from dropdown
2. `generation.create` runs prompt moderation (free, no credits deducted on block)
3. Credits deducted atomically (PAYMENT_REQUIRED if insufficient)
4. Job record created (QUEUED), submitted to provider
5. If provider fails → credits auto-refunded, job marked FAILED
6. UI polls `generation.pollStatus` every 3–10s (SLOW_MODELS poll at 10s) until COMPLETED or FAILED
7. User publishes via `generation.publish` → fires content scan (async) → video enters feed if APPROVED

## AI Model Details
| Model | UI Status | Provider | Env Required | Notes |
|---|---|---|---|---|
| Flux.1 Dev | Live (image) | RunPod public | `RUNPOD_API_KEY` | endpoint: `black-forest-labs-flux-1-dev`. Input: `{prompt, width, height, num_inference_steps, guidance, seed}`. Output: `{result: url}` |
| Grok Imagine | Live (image) | xAI | `XAI_API_KEY` | model: `grok-imagine-image` (NOT grok-2-image-1212 — deprecated 2026-02-24) |
| Wan 2.6 | Live (video) | RunPod public | `RUNPOD_API_KEY` | T2V: `wan-2-6-t2v`, I2V: `wan-2-6-i2v`. Routes automatically by seedImageUrl. providerJobId prefixed `t2v:` or `i2v:`. Duration snapped to 5/10/15s. Size: `"720*1280"` format. Output: `{result: url}` |
| Seedance 1.5 Pro | Live (video, I2V) | RunPod public | `RUNPOD_API_KEY` | endpoint: `seedance-v1-5-pro-i2v`. Requires seed image. Input: `{prompt, image, duration, aspect_ratio, resolution, generate_audio, camera_fixed}`. Duration 4–12s. Output: `{result: url}` |
| HunyuanVideo | Beta (video, T2V) | RunPod custom | `RUNPOD_API_KEY` + `RUNPOD_HUNYUAN_ENDPOINT_ID` | ComfyUI-HunyuanVideoWrapper (HyVideo* nodes). GPU: A100 40 GB required. 720p. Frames: multiples of 4, max 120. Exec timeout 20 min. Appears in UI automatically when endpoint ID is set |
| Nano Banana | Hidden | Google Gemini | `GEMINI_API_KEY` | hidden=true in MODEL_META |
| Veo 3.1 | Hidden | Google Gemini | `GEMINI_API_KEY` | hidden=true in MODEL_META |
| LTX-2 | Hidden | RunPod custom | `RUNPOD_LTX2_ENDPOINT_ID` | hidden=true until endpoint configured |
| CogVideoX | Hidden | RunPod custom | `RUNPOD_COGVIDEOX_ENDPOINT_ID` | hidden=true until endpoint configured |
| Kling I2V | Live | Kuaishou API | `KLING_ACCESS_KEY` + `KLING_SECRET_KEY` | `/v1/videos/image2video` — seed image becomes opening frame. Model: kling-v1-6. Duration: 5s or 10s. providerJobId prefix `i2v:` |
| Kling R2V | Live | Kuaishou API | `KLING_ACCESS_KEY` + `KLING_SECRET_KEY` | `/v1/videos/text2video` with `reference_image_list` — reference image guides style/subject. providerJobId prefix `r2v:` |
| Higgsfield | Coming Soon | Higgsfield AI | — | Placeholder |

## AI Studio UI (`/generate`)
- Radio buttons: Image | Video — switches model list and default model
- Dropdown: `{icon} {label} — {credits} credits` per visible model
- `DEFAULT_IMAGE_MODEL = 'FLUX'`, `DEFAULT_VIDEO_MODEL = 'WAN_25'`
- `HIDDEN_MODELS = ['NANO_BANANA', 'VEO3']` — client-side safety net (server also filters `hidden: true`)
- `SLOW_MODELS = ['LTX2', 'WAN_25', 'SEEDANCE', 'HUNYUAN_VIDEO', 'COG_VIDEO_X']` — poll every 10s instead of 4s
- Seed image URL field shown in video mode; required warning + blocked generate button if `requiresSeedImage` model selected without image
- MODEL_META fields: `mediaType: 'image'|'video'`, `hidden?: true`, `requiresSeedImage?: true`, `badge: 'live'|'beta'|'coming-soon'`
- `listModels` tRPC procedure filters `hidden: true` server-side before returning to client

## RunPod Notes
### Public endpoints (no setup required — just RUNPOD_API_KEY)
- Submit: `POST https://api.runpod.ai/v2/{slug}/run` with `{ input: {...} }`
- Poll: `GET https://api.runpod.ai/v2/{slug}/status/{jobId}`
- Output shape from public endpoints: `{ result: "https://..." }` — handled by `extractOutputUrl()` in `runpod.ts`
- Health check returns 401 for public endpoints (shared infrastructure — not owned by your account)

### Custom serverless endpoints (ComfyUI)
- Require endpoint ID set in `.env` — model hidden from UI until configured
- ComfyUI workflow JSON built server-side — node IDs are strings ('1', '2', …), inputs reference other nodes as `['nodeId', outputIndex]`
- All outputs mirrored to R2 via `mirrorUrlToR2()` — RunPod presigned S3 URLs expire, R2 URLs are permanent

### extractOutputUrl() in runpod.ts
Handles all known output shapes:
- Plain string: `"https://..."`
- `{ result: "https://..." }` — RunPod public endpoints (Wan 2.6, Seedance, Flux)
- `{ url: "https://..." }`, `{ video_url: "..." }`, `{ image_url: "..." }`, `{ message: "..." }`
- `{ videos: [{url}] }`, `{ gifs: [{url}] }`, `{ images: [{url}] }` — ComfyUI VHS nodes
- `["https://..."]` — string array
- Double-nested `{ output: { ... } }`

### RunPod dev CLI (`scripts/runpod.ts`)
```bash
pnpm runpod info                          # account balance (GraphQL clientBalance)
pnpm runpod endpoints                     # list custom serverless endpoints (GraphQL)
pnpm runpod models                        # show all model slugs/IDs + which are configured
pnpm runpod health <slug>                 # worker health (401 expected for public endpoints)
pnpm runpod test <model> "<prompt>"       # submit test job — models: flux|wan|seedance|ltx|hunyuan|cogvideo
pnpm runpod status <model> <jobId>        # poll every 5s until done, print raw output
```
Loads env from `apps/web/.env.local` then `.env`. Useful for debugging new output shapes.

## Feed Architecture
- `forYou` — public, scored by engagementScore + recency
- `trending` — public, sorted by viewCount window
- `viewersPick` — public, sorted by avgStarRating
- `following` — **auth required**, videos from followed creators; hidden on R16
- All feeds visible to guests (no sign-in required to browse)
- Guests see floating "Sign up free / Sign in" CTA at bottom
- All feeds use **cursor-based pagination** (ISO date strings or float scores as cursor)
- All feeds exclude `moderationStatus = REJECTED` videos
- R16 feeds: `kidsOnly=true` → `isKidsSafe=true` + `moderationStatus=APPROVED` only

## Feed Implementation Details
- `VideoFeed.tsx`: CSS `scroll-snap-type: y mandatory` handles mobile touch natively — NO custom touch handlers
- Scroll event listener tracks `activeIndex` via `Math.round(scrollTop / clientHeight)`
- Desktop: wheel handler calls `goTo(index)` for one-video-per-tick
- Desktop: keyboard arrow keys also call `goTo()`
- Desktop: progress dots (right side, max 8) click to `goTo()`
- `VideoPlayer.tsx`: starts **muted** (`isMuted: true`) so browser autoplay policy allows `play()`; mute button is `bottom-4 left-4` (bottom-left corner)
- `VideoCard.tsx`: `isImageUrl()` helper detects image extensions — routes to `<img>` instead of `<VideoPlayer>` to avoid infinite spinner on AI-generated images published to feed
- `VideoCard.tsx` landscape images: `onLoad` detects `naturalWidth > naturalHeight`, sets `isLandscapeImage` state, renders blurred backdrop `<img>` at `opacity: isLandscapeImage ? 1 : 0` — mirrors the VideoPlayer landscape backdrop pattern
- `VideoCard.tsx` premium lock: `isLocked` prop overlays padlock + "Subscribe" button (`z-20`) — VideoPlayer `isActive` is also suppressed so locked video never plays

## VPS Infrastructure
- **Server**: Contabo VPS at 81.0.246.223
- **Supabase**: self-hosted Docker Compose at /root/supabase/docker (16 services)
- **Postgres**: exposed on 127.0.0.1:5432 (direct, bypassing broken Supavisor)
- **Caddy**: /etc/caddy/Caddyfile — db.raivstream.com → :8000, app.raivstream.com → :3000, r16.raivstream.com → :3000
- **App**: /root/raivstream — git pull + PM2 (`pm2 restart raivstream-web --update-env`)
- **Deploy**: GitHub Actions `.github/workflows/deploy.yml` — SSH on push to main
- **Env file**: /root/raivstream/.env (symlinked to apps/web/.env.local and packages/database/.env)
- **Manual rebuild**: `cd /root/raivstream && git pull && pnpm --filter @raivstream/web build && pm2 restart raivstream-web --update-env`

## Common Pitfalls (already fixed)
- Tanstack Query v5: `onSuccess` removed from `useQuery` → use `useEffect` watching `data` instead
- Tanstack Query v5: mutation `isLoading` renamed to `isPending`
- Tanstack Query v5: `keepPreviousData` removed → just omit it (no replacement needed for most cases)
- Keep tRPC at v11 in both `packages/api` and `apps/web` — mixing v10/v11 breaks the build
- Prisma `.$extends()` returns `DynamicClientExtensionThis`, not `PrismaClient` — cast with `as unknown as PrismaClient` in `packages/database/index.ts`
- After schema changes: run `pnpm exec prisma generate` from `packages/database/`, then `pnpm exec prisma db push` on VPS
- `packages/api` has its own `tsconfig.json` scoped to `src/**/*.ts`
- `useSearchParams()` must be wrapped in `<Suspense>` in Next.js App Router
- R2 / Stripe env vars are optional at build time (warn, don't crash) — see `lib/env.ts`
- XAI_API_KEY must be set in .env for Grok Imagine to work — not optional at runtime
- Grok Imagine model name: `grok-imagine-image` — `grok-2-image-1212` was deprecated 2026-02-24
- GitHub Actions deploy runs strict lint with `pnpm --filter @raivstream/web lint --max-warnings=0` before `pnpm --filter @raivstream/web build`. Do not use `pnpm --filter @raivstream/web lint -- --max-warnings=0`; the extra `--` is passed to ESLint as a file pattern by the current script.
- GitHub Actions deploy runs `pnpm --filter @raivstream/web build` — if build fails, VPS keeps old `.next` and serves stale code. Always check `pm2 logs` + confirm `required-server-files.json` timestamp after deploy
- Duplicate env vars in `.env` — first occurrence wins in most loaders. Remove placeholder lines like `GEMINI_API_KEY=your_key_here` that override real values below
- Admin pages use `trpc.admin.*` not `api.admin.*` — web app exports `trpc` not `api`
- Mobile video scaling: always use `ResizeMode.CONTAIN` + always render blurred thumbnail backdrop — detection-based approaches (onReadyForDisplay, isLandscape state) are unreliable due to FlatList reuse and race conditions
- Mobile iOS audio: requires `Audio.setAudioModeAsync({ playsInSilentModeIOS: true })` called once on app mount (in FeedScreen useEffect) — without this, audio is silent when hardware silent switch is on
- Web landscape videos: `VideoPlayer.tsx` detects `videoWidth > videoHeight` via `loadedmetadata` event, sets `isLandscape` state, renders blurred `<video>` backdrop (blur+scale) with `opacity: isLandscape ? 1 : 0` — always in DOM so bgVideoRef is never null
- pnpm + Expo monorepo: `.npmrc` at root must have `public-hoist-pattern[]=*expo*` etc. so Metro can find transitive deps. `metro.config.js` in mobile app sets `watchFolders` + `nodeModulesPaths` for monorepo resolution. `superjson` must stay at v1.x (v2 depends on `copy-anything` which is ESM-only and Metro can't resolve it)
- EAS Update (OTA JS updates): run `npx eas-cli update --branch production --platform android` then `--platform ios` from `apps/mobile` on local machine (NOT VPS). Requires `expo-updates` installed and `app.json` `updates.url` + `runtimeVersion` configured. The `@expo/cli` `node:sea` Windows path bug must be patched in `node_modules/.pnpm/@expo+cli@0.17.13_.../externals.js` — add `!x.includes(':')` to the builtinModules filter
- `useAuth()` returns `isLoaded` not `loading`
- R2 uploads (video upload page): requires **R2 S3 API token** (not a Cloudflare API token). Cloudflare API tokens (`cfat_` prefix) work for server-side S3 SDK calls but NOT for presigned URLs. Create the token via R2 → Manage R2 API Tokens → Create API Token (Object Read & Write, scoped to bucket). The resulting Access Key ID is a 32-char hex string with no prefix.
- R2 CORS must be configured on the bucket (Cloudflare → R2 → bucket → Settings → CORS Policy) with `AllowedMethods: [GET, PUT, HEAD]` and `AllowedHeaders: [*]` — without this, browser XHR PUT to presigned URLs is blocked
- R2 presigned URLs: do NOT include `ContentLength` in `PutObjectCommand` — it causes browser signature mismatch. Set `requestChecksumCalculation: 'WHEN_REQUIRED'` and `responseChecksumValidation: 'WHEN_REQUIRED'` on the S3Client to prevent SDK injecting CRC32 checksum headers that browsers can't replicate
- R2 server-side uploads (`r2.ts`): also needs `requestChecksumCalculation: 'WHEN_REQUIRED'` — same fix applies to non-presigned PUTs
- CSP `connect-src` in `middleware.ts` must include `https://*.r2.cloudflarestorage.com` and `https://generativelanguage.googleapis.com` — missing entries silently block XHR/fetch before they even leave the browser
- R16 middleware: set `x-r16-mode` on the **request** headers via `NextResponse.next({ request: { headers } })` — setting it on the response headers does NOT make it readable by server components via `headers()`
- `app/layout.tsx` must be `async` to call `await headers()` for R16 detection
- RunPod public endpoint health check returns 401 — this is expected, use `pnpm runpod test` to verify instead
- RunPod public endpoint output shape is `{ result: "https://..." }` — NOT `{ url }`, `{ message }`, or `{ output }`. `extractOutputUrl()` in runpod.ts handles this
- Wan 2.6 providerJobId is prefixed `t2v:` or `i2v:` to route status polls to the correct endpoint — never strip this prefix
- Seeding credit rates on VPS: run node script from `packages/database/` directory (not repo root)
- New models appear in UI automatically when their `*_ENDPOINT_ID` is set in `.env` and app restarted with `--update-env` (hidden flag removed, badge set appropriately)

## Dev Commands
```bash
pnpm install          # install all workspace deps
pnpm dev              # start all apps (turbo)
pnpm dev:web          # web only (port 3000)
pnpm dev:mobile       # Expo mobile only
pnpm --filter @raivstream/web lint --max-warnings=0  # strict web lint; no extra "--"

pnpm db:push          # push schema to Supabase VPS (requires DATABASE_URL)
pnpm db:migrate       # create a tracked migration
pnpm db:generate      # regenerate Prisma client after schema change
pnpm db:studio        # open Prisma Studio GUI
pnpm db:seed          # run packages/database/seed.ts

pnpm runpod info      # RunPod account balance
pnpm runpod models    # show all configured model slugs/IDs
pnpm runpod test <model> "<prompt>"   # submit test job
pnpm runpod status <model> <jobId>    # poll job to completion

pnpm lint             # lint all packages
pnpm type-check       # TypeScript check across monorepo
pnpm build            # build all packages

# EAS Update (OTA mobile JS update — run from apps/mobile on LOCAL machine)
npx eas-cli update --branch production --platform android --message "..."
npx eas-cli update --branch production --platform ios --message "..."
```

## Environment Variables
**Required to run:**
- `DATABASE_URL` / `DIRECT_URL` — `postgresql://postgres:<pw>@localhost:5432/postgres`
- `JWT_ACCESS_SECRET` — 64-char random (openssl rand -base64 48)
- `JWT_REFRESH_SECRET` — different 64-char random
- `NEXT_PUBLIC_APP_URL` — `https://app.raivstream.com`

**AI generation:**
- `XAI_API_KEY` — xAI API key for Grok Imagine (console.x.ai)
- `GEMINI_API_KEY` — Google Gemini API key for Nano Banana + Veo 3.1 (aistudio.google.com) — models currently hidden
- `RUNPOD_API_KEY` — required for all RunPod models (public + custom endpoints)
- `RUNPOD_HUNYUAN_ENDPOINT_ID` — HunyuanVideo custom serverless endpoint (AMPERE_80 / A100 40 GB, id: fg28wk2tkqiy6q, workersMin=0, idleTimeout=60s); model weights on raivstream-models network volume (id: e16tbuujlv, EU-SE-1, 200 GB)
- `RUNPOD_COGVIDEOX_ENDPOINT_ID` — CogVideoX custom serverless endpoint (ADA_24 / RTX 4090, id: odz4a6rii63dmh, workersMin=0, idleTimeout=60s); model weights on raivstream-models volume; set in .env → visible in UI
- `RUNPOD_LTX2_ENDPOINT_ID` — LTX-Video 2 custom serverless endpoint; model hidden until set
- `KLING_ACCESS_KEY` + `KLING_SECRET_KEY` — Kuaishou Kling API credentials (klingai.com/developer); required for KLING_I2V and KLING_R2V
- Optional Kling config: `KLING_MODEL` (default: kling-v1-6), `KLING_MODE` (std|pro, default: std), `KLING_CFG` (0–1, default: 0.5)
- Optional public endpoint overrides: `RUNPOD_FLUX_PUBLIC_ENDPOINT`, `RUNPOD_WAN26_T2V_ENDPOINT`, `RUNPOD_WAN26_I2V_ENDPOINT`, `RUNPOD_SEEDANCE_PUBLIC_ENDPOINT`
- Optional Seedance config: `RUNPOD_SEEDANCE_RESOLUTION` (default: 720p), `RUNPOD_SEEDANCE_GENERATE_AUDIO` (default: false), `RUNPOD_SEEDANCE_CAMERA_FIXED` (default: false)
- Optional Flux config: `RUNPOD_FLUX_STEPS` (default: 28), `RUNPOD_FLUX_GUIDANCE` (default: 3.5)

**Content moderation:**
- `OPENAI_API_KEY` — sk-... — used for prompt moderation (text) + upload scanning (image). Free moderation endpoint, no per-call cost.

**Storage (required for video upload):**
- `R2_ENDPOINT` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` / `R2_PUBLIC_URL`

**Payments:**
- `PAYSTACK_SECRET_KEY` — sk_live_... or sk_test_...
- `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` — pk_live_... or pk_test_...
- `PAYSTACK_VIEWER_PLAN_CODE` — PLN_... (from Paystack dashboard)
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_VIEWER_PRICE_ID` / `STRIPE_CREATOR_PRICE_ID`

**Optional:**
- `UPSTASH_REDIS_URL` / `UPSTASH_REDIS_TOKEN` — Redis cache
- `TRANSCODE_WORKER_URL` / `TRANSCODE_WORKER_SECRET` — async HLS transcoding worker
- `SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_KEY` — monitoring

## Implementation Status
**Done:**
- Monorepo structure, Turborepo config, GitHub Actions CI/CD
- Full Prisma schema (19 models including ModerationLog, SEEDANCE in GenerationModel enum)
- Custom JWT auth (register/login/refresh/logout/forgot-password/reset-password)
- tRPC routers: auth, video, feed, interaction, user, analytics, generation, admin
- R2 presigned upload flow + server-side R2 mirroring for AI generation output
- Paystack integration (Viewer subscription + credit packages, webhooks)
- Stripe subscription scaffolding (Creator plan, international)
- Credit system with atomic deduction, refunds, transaction history
- AI Studio (`/generate`): radio + dropdown UI; live models: Flux.1 Dev, Grok Imagine, Wan 2.6 (T2V+I2V), Seedance 1.5 Pro (I2V), Kling I2V, Kling R2V; HunyuanVideo beta (needs endpoint ID); LTX2/CogVideoX/NanoBanana/Veo3 hidden
- RunPod custom serverless endpoints created: HunyuanVideo (fg28wk2tkqiy6q, A100 40 GB) + CogVideoX (odz4a6rii63dmh, RTX 4090); both workersMin=0 + idleTimeout=60s; model weights downloaded to raivstream-models network volume (EU-SE-1, 200 GB)
- Kling I2V + R2V: full implementation via Kuaishou REST API; JWT HS256 signed with Node crypto (no external dep); providerJobId prefixed `i2v:`/`r2v:`; output mirrored to R2
- RunPod dev CLI (`pnpm runpod`) for testing endpoints and debugging output shapes
- **Two-tier freemium gate**: guest hard-modal after 5 episodes (sessionStorage) + signed-in FREE soft-gate after 10 episodes (server-side); free content (`isPremiumOnly=false`) never blocked; per-video lock overlays + sticky dismissable banner for past-gate FREE users
- **Landscape image backdrop**: `VideoCard.tsx` detects landscape AI-generated images via `onLoad` and shows blurred backdrop (matches VideoPlayer landscape video behavior)
- **View counting fixed**: `trackProgress` checks WatchHistory before upsert — viewCount increments only on first watch per user, not on every 30s progress ping
- **engagementScore live**: `recomputeEngagementScore()` helper in interaction.ts runs fire-and-forget after every like/dislike/rating/view; formula: `(views×1 + likes×10 + avgStars×starCount×5) × recencyBoost` where `recencyBoost = 1/(1 + ageInDays/7)` (7-day half-life)
- **Guest view tracking**: `interaction.recordView` public procedure increments viewCount for unauthenticated users; `VideoCard` calls it once per video activation via `recordedViewId` ref
- Web pages: feed (public), upload, video view, profile, pricing, credits, generate, analytics, search, settings, sign-in, sign-up, forgot-password, reset-password
- Admin dashboard: overview, user management, credit rate management, job history, revenue, **moderation queue**
- Admin roles: ADMIN + MODERATOR with gated tRPC procedures
- Mobile screens: feed, upload, profile, search, video modal, sign-in/sign-up (connected to app.raivstream.com)
- Mobile auth: Zustand store + SecureStore persistence
- Mobile video: always ResizeMode.CONTAIN + blurred thumbnail backdrop (landscape + portrait both correct)
- Mobile audio: iOS silent switch handled via Audio.setAudioModeAsync({ playsInSilentModeIOS: true })
- EAS Update configured: expo-updates installed, app.json projectId + updates.url set, OTA deployed to production branch
- Navbar: glass-blur on marketing, transparent on feed, avatar dropdown with Admin link; R16 kids branding
- UI design: dark navy (#050b18) + violet/purple ambient glow design system
- Feed: visible to all users (guests + signed-in), smooth CSS snap scroll, muted autoplay, image/video detection
- Auto-deploy: GitHub Actions SSH deploy on push to main → pm2 restart
- **Content moderation**: prompt filter (Layer 1 regex + Layer 2 OpenAI), upload/publish image scanning, admin queue, feed filtering
- **R16 kids subdomain**: r16.raivstream.com — kids-safe feed (isKidsSafe=true + APPROVED only), simplified navbar, blocked adult routes
- **Story Playground Phase 1**: `/story-playground`, guided questions, short story generation, continuation chapters, story persistence, R16 kids-safe mode, OpenAI-compatible text provider fallback service
- **Story Playground Phase 2 scene cards**: `story.generateScenes`, editable `StorySceneSeed` film-strip, placeholder thumbnails, disabled Make Pictures action
- **Story Playground Phase 3 Character Bible**: deterministic character extraction, editable character cards, visual descriptions, scene-level character references, prompt ingredients for Phase 4
- **Story Playground Phase 4 Hidden Prompt Composer**: `StoryScenePrompt`, provider-aware prompt templates, automatic negative prompts, advanced preview, Send to AI Studio
- **Story Playground Phase 4B Scene Images**: `StorySceneAsset`, generate/regenerate scene image, R2 asset path, latest image attachment, non-R16 image history
- **Story Playground Phase 4C Storybook Viewer**: page-by-page reader from story scenes and latest images, cover page, reading progress, keyboard/swipe navigation, R16-safe reading mode
- **Story Playground Phase 4.5 Analytics**: `AnalyticsEvent`, reusable analytics tracker, Story Completion Funnel, storybook reading events, non-R16 feedback, `/admin/story-analytics`
- **Story Playground My Stories library**: `/story-playground` shows recent signed-in user projects with progress labels, first scene thumbnail, Continue/Open Storybook/Add Pictures/Edit/Archive actions, empty state, and R16-safe copy
- **Story Playground Prompt Quality Upgrade**: selectable visual styles, Story Director scene controls, style-aware prompt composer, `promptEnhancerService`, enhanced prompt preview for non-R16 creator/admin users, deterministic fallback, no-text/no-UI negative prompts, prompt quality feedback, `/admin/prompt-quality`
- **Story Playground Character Director**: structured character traits, goals, fears, relationships, walking/speaking style, evolution stage, internal Story DNA, character-aware prompt enhancement, `/admin/character-insights`
- **Story data model expansion**: StoryQuestion, StoryChapter, StoryCharacterMemory, StorySceneSeed, StoryScenePrompt, StorySceneAsset, AnalyticsEvent, StoryAudienceMode, StoryType, GENERATED/EXTENDED statuses

**Still to build / verify:**
- Add email service (Resend/SendGrid) for password reset emails — currently logs URL to server console
- Add `KLING_ACCESS_KEY` + `KLING_SECRET_KEY` to VPS `.env` — Kling I2V + R2V show as "live" in UI but return "not configured" error without keys
- Add `RUNPOD_HUNYUAN_ENDPOINT_ID` + `RUNPOD_COGVIDEOX_ENDPOINT_ID` to VPS `.env` to activate those models in UI
- HLS video transcoding worker integration
- Creator analytics data pipeline (cron jobs / event writes)
- Redis caching layer
- Badge award cron jobs
- Full test suite
- Story Playground Phase 2+: visual scene builder, character bible UI, hidden prompt compiler, story-to-media generation, R16 story publishing workflow
