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
| AI generation | xAI Grok Imagine, Wan 2.5, LTX-2, Nano Banana (Google Gemini), Veo 3.1 (Google Gemini) |
| Credits | Custom credit system — ₦1,000 = 1,000 credits, deducted per AI generation |
| Cache | Upstash Redis (optional) |
| Monitoring | Sentry, PostHog |
| Process manager | PM2 (`raivstream-web`) on VPS |
| Reverse proxy | Caddy — db.raivstream.com → Kong:8000, app.raivstream.com → Next.js:3000 |
| CI/CD | GitHub Actions → SSH deploy on push to main |

## Key File Paths
```
packages/api/src/index.ts              — appRouter (auth, video, feed, interaction, user, analytics, generation, admin)
packages/api/src/trpc.ts              — router, publicProcedure, protectedProcedure, adminProcedure, moderatorProcedure
packages/api/src/lib/jwt.ts           — signAccessToken, verifyAccessToken, signRefreshToken, extractBearerToken
packages/api/src/lib/credits.ts       — deductCredits(), refundCredits(), MODEL_FEATURE_KEY map
packages/api/src/lib/authService.ts   — registerUser, loginUser, refreshTokens, logoutUser, requestPasswordReset, resetPassword
packages/api/src/lib/generators/
  index.ts                            — submitGenerationJob(), pollJobStatus(), MODEL_META
  grokImagine.ts                      — xAI Grok Imagine (XAI_API_KEY) — image generation (model: grok-2-image-1212)
  nanoBanana.ts                       — Nano Banana image gen via Google Gemini REST API (GEMINI_API_KEY)
  veo3.ts                             — Veo 3.1 video gen via Google Gemini :predictLongRunning endpoint
  ltx2.ts                             — LTX-Video 2 via RunPod
  wan25.ts                            — Wan 2.5 via RunPod
  placeholders.ts                     — Kling, Higgsfield (coming soon stubs)
packages/api/src/routers/
  auth.ts                             — register, login, refresh, logout, logoutAll
  video.ts                            — upload flow, getById, updateMetadata, delete
  feed.ts                             — forYou, trending, viewersPick, following
  interaction.ts                      — like, dislike, starRating, watchProgress (episode gate enforced)
  user.ts                             — profile, follow, creditBalance, creditHistory, episodeGate
  analytics.ts                        — creator dashboard stats
  generation.ts                       — create (deducts credits), pollStatus, myJobs, cancel, publish
  admin.ts                            — getOverview, listUsers, setUserRole, adjustCredits, setUserBan,
                                        listCreditRates, updateCreditRate, createCreditRate,
                                        listGenerationJobs, listPurchases
packages/database/schema.prisma       — all DB models (see Database Models section)

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
  app.json                            — apiUrl: https://app.raivstream.com

apps/web/src/
  app/page.tsx                        — TikTok-style feed visible to ALL users (signed-in and guests)
  app/layout.tsx                      — root layout (TRPCProvider + AuthProvider)
  app/upload/page.tsx                 — video upload flow
  app/v/[id]/page.tsx                 — single video view
  app/[username]/page.tsx             — creator profile
  app/analytics/                      — creator analytics dashboard
  app/pricing/page.tsx                — pricing page (Paystack Viewer + Stripe Creator + credit packages)
  app/credits/page.tsx                — credit balance + purchase UI
  app/credits/success/page.tsx        — Paystack callback verification
  app/generate/page.tsx               — AI Video Studio (model selector, prompt, output, history)
  app/settings/                       — user settings
  app/search/page.tsx                 — search page
  app/admin/layout.tsx                — admin layout (responsive sidebar — mobile drawer, desktop fixed)
  app/admin/page.tsx                  — admin overview (stats, model usage, job status, revenue)
  app/admin/users/page.tsx            — user management (role, credits, ban)
  app/admin/credits/page.tsx          — credit rate management (inline edit + add rate)
  app/admin/jobs/page.tsx             — generation job history (filter by status/model)
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
  components/feed/FeedTabs.tsx          — tab switcher (Following tab hidden for guests)
  components/feed/VideoFeed.tsx         — vertical scroll feed + PaywallModal + scroll/swipe handling
  components/feed/PaywallModal.tsx      — freemium gate overlay (5 free episodes)
  components/video/VideoCard.tsx        — individual video card (detects image URLs to avoid VideoPlayer spinner)
  components/video/VideoPlayer.tsx      — HTML5 / HLS video player (starts muted for autoplay)
  components/video/VideoInteractions.tsx — like/dislike/star buttons
  components/layout/Navbar.tsx          — top nav (glass-blur on marketing, transparent on feed; Admin link for ADMIN/MODERATOR)
  lib/auth.tsx                          — React AuthProvider + useAuth() + useUser()
  lib/trpc.ts                           — tRPC client setup (Tanstack Query)
  lib/stripe.ts                         — Stripe server client + STRIPE_PLANS
  lib/paystack.ts                       — Paystack helpers + CREDIT_PACKAGES + VIEWER_PLAN
  lib/credits.ts                        — (see packages/api/src/lib/credits.ts — server side)
  middleware.ts                         — cookie-based redirect for protected routes (includes /admin)
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
- `UserRole` enum: `VIEWER | CREATOR | MODERATOR | ADMIN` (ADMIN and MODERATOR added)
- `adminProcedure` — requires role === ADMIN
- `moderatorProcedure` — requires role === ADMIN or MODERATOR
- Admin routes gated in `middleware.ts` + layout role check → redirect to `/` if unauthorized
- Navbar shows 🛡️ Admin link for ADMIN/MODERATOR users
- To promote a user to ADMIN on VPS, use Node.js one-liner from `packages/database/` with Prisma client

## Credit System
- 1,000 credits = ₦1,000 (configured in `FeatureCreditRate` table via seed.ts or admin UI)
- `deductCredits()` in `packages/api/src/lib/credits.ts` uses atomic `updateMany WHERE balance >= cost` — race-condition safe
- `refundCredits()` called automatically if provider submission fails
- Costs (DB-configurable via /admin/credits): nano_banana=50, grok_imagine=100, ltx2=150, wan_25=200, veo3=300, higgsfield=400, kling=500, thumbnail=20, transcribe=30, enhance=100
- Credit packages: starter (1k cr / ₦1k), popular (5k cr / ₦4.5k — best value), pro (10k cr / ₦8k)
- `generation.create` deducts before job creation; `generation.listModels` returns `creditCost` from DB
- Feature key format: `generate:model_name` (e.g. `generate:veo3`, `generate:nano_banana`)

## Freemium Gate
- FREE tier users get 5 unique episodes per day before hitting a paywall
- Enforced server-side in `interaction.trackProgress` (FORBIDDEN error) and client-side in `VideoFeed` via `user.episodeGate`
- `PaywallModal` overlays the feed; Viewer plan CTA is ₦1,500/month via Paystack

## Database Models (schema.prisma)
- **User** — email, username, passwordHash, role (VIEWER|CREATOR|MODERATOR|ADMIN), premiumTier (FREE|VIEWER|CREATOR)
- **RefreshToken** — userId, tokenHash, family, expiresAt, revokedAt
- **PasswordResetToken** — userId, tokenHash, expiresAt, usedAt (1-hour TTL, single use)
- **Video** — rawVideoUrl (R2 private), mp4Url (CDN), hlsMasterUrl, status (UPLOADING→PROCESSING→READY), engagementScore
- **VideoInteraction** — liked, disliked, starRating (1–5), watchTime, completed
- **WatchHistory** — lastPosition, completed, watchedAt
- **Follow** — followerId ↔ followingId
- **Subscription** — Paystack + Stripe fields, provider, tier, status
- **CreditBalance** — userId (unique), balance (Int)
- **CreditTransaction** — userId, amount (+/-), type (PURCHASE|USAGE|BONUS|REFUND), featureKey, balanceBefore, balanceAfter
- **FeatureCreditRate** — featureKey (unique), creditsPerUnit, isActive — admin-configurable costs
- **GenerationJob** — userId, model (NANO_BANANA|GROK_IMAGINE|LTX2|WAN_25|KLING|HIGGSFIELD|VEO3), prompt, status, providerJobId, outputUrl, thumbnailUrl, videoId
- **Badge / UserBadge / VideoBadge** — weekly achievement badges
- **FeaturedContent** — curated sections (section, position, week)
- **Category / VideoCategory** — many-to-many video categorisation

## Video Upload Flow
1. Client → `video.requestUpload` → creates UPLOADING Video record + R2 presigned PUT URL (1h expiry)
2. Client → PUT file directly to R2 (bypasses server)
3. Client → `video.confirmUpload` → sets mp4Url, status → PROCESSING (or READY if no transcode)
4. Client → `video.updateMetadata` → title, description, tags, thumbnail, categories

## AI Generation Flow
1. User selects model + enters prompt on `/generate`
2. `generation.create` deducts credits atomically (PAYMENT_REQUIRED if insufficient)
3. Job record created (QUEUED), submitted to provider
4. If provider fails → credits auto-refunded, job marked FAILED
5. UI polls `generation.pollStatus` every 3s until COMPLETED or FAILED
6. User can publish completed job to feed via `generation.publish`

## AI Model Details
| Model | Status | Provider | API | Notes |
|---|---|---|---|---|
| Grok Imagine | Live | xAI | `XAI_API_KEY` | Image only. Model: `grok-2-image-1212` |
| Nano Banana | Live | Google Gemini | `GEMINI_API_KEY` | Image only. REST POST to `gemini-3.1-flash-image-preview:generateContent`. Returns base64 inline data → uploaded to R2 |
| Veo 3.1 | Live | Google Gemini | `GEMINI_API_KEY` | Video. Endpoint: `:predictLongRunning`. Body: `{instances:[{prompt}], parameters:{aspectRatio}}`. Only supports `16:9` or `16:10` (NOT 9:16). Poll `GET /v1beta/{operationName}`. Video URI in `response.generatedVideos[0].video.uri` |
| LTX-2 | Beta | RunPod | `RUNPOD_API_KEY` | Video via RunPod Serverless |
| Wan 2.5 | Beta | RunPod | `RUNPOD_API_KEY` | Video via RunPod Serverless |
| Kling | Coming Soon | Kuaishou | — | Placeholder |
| Higgsfield | Coming Soon | Higgsfield AI | — | Placeholder |

## Feed Architecture
- `forYou` — public, scored by engagementScore + recency
- `trending` — public, sorted by viewCount window
- `viewersPick` — public, sorted by avgStarRating
- `following` — **auth required**, videos from followed creators
- All feeds visible to guests (no sign-in required to browse)
- Guests see floating "Sign up free / Sign in" CTA at bottom
- Following tab hidden for guests in FeedTabs
- All feeds use **cursor-based pagination** (ISO date strings or float scores as cursor)

## Feed Implementation Details
- `VideoFeed.tsx`: CSS `scroll-snap-type: y mandatory` handles mobile touch natively — NO custom touch handlers
- Scroll event listener tracks `activeIndex` via `Math.round(scrollTop / clientHeight)`
- Desktop: wheel handler calls `goTo(index)` for one-video-per-tick
- Desktop: keyboard arrow keys also call `goTo()`
- Desktop: progress dots (right side, max 8) click to `goTo()`
- `VideoPlayer.tsx`: starts **muted** (`isMuted: true`) so browser autoplay policy allows `play()`
- `VideoCard.tsx`: `isImageUrl()` helper detects image extensions — routes to `<img>` instead of `<VideoPlayer>` to avoid infinite spinner on AI-generated images published to feed

## VPS Infrastructure
- **Server**: Contabo VPS at 81.0.246.223
- **Supabase**: self-hosted Docker Compose at /root/supabase/docker (16 services)
- **Postgres**: exposed on 127.0.0.1:5432 (direct, bypassing broken Supavisor)
- **Caddy**: /etc/caddy/Caddyfile — db.raivstream.com → :8000, app.raivstream.com → :3000
- **App**: /root/raivstream — git pull + PM2 (`pm2 restart raivstream-web --update-env`)
- **Deploy**: GitHub Actions `.github/workflows/deploy.yml` — SSH on push to main
- **Env file**: /root/raivstream/.env (symlinked to apps/web/.env.local and packages/database/.env)
- **Manual rebuild**: `cd /root/raivstream && git pull && pnpm --filter @raivstream/web build && pm2 restart raivstream-web --update-env`

## Common Pitfalls (already fixed)
- Tanstack Query v5: `onSuccess` removed from `useQuery` → use `useEffect` watching `data` instead
- Tanstack Query v5: mutation `isLoading` renamed to `isPending`
- Keep tRPC at v11 in both `packages/api` and `apps/web` — mixing v10/v11 breaks the build
- Prisma `.$extends()` returns `DynamicClientExtensionThis`, not `PrismaClient` — cast with `as unknown as PrismaClient` in `packages/database/index.ts`
- After schema changes: run `pnpm exec prisma generate` from `packages/database/`, then `pnpm exec prisma db push` on VPS
- `packages/api` has its own `tsconfig.json` scoped to `src/**/*.ts`
- `useSearchParams()` must be wrapped in `<Suspense>` in Next.js App Router
- R2 / Stripe env vars are optional at build time (warn, don't crash) — see `lib/env.ts`
- XAI_API_KEY must be set in .env for Grok Imagine to work — not optional at runtime
- GitHub Actions deploy runs `pnpm --filter @raivstream/web build` — if build fails, VPS keeps old `.next` and serves stale code. Always check `pm2 logs` + confirm `required-server-files.json` timestamp after deploy
- Duplicate env vars in `.env` — first occurrence wins in most loaders. Remove placeholder lines like `GEMINI_API_KEY=your_key_here` that override real values below
- Veo 3 only supports landscape aspect ratios (`16:9`, `16:10`) — `9:16` causes API error
- Admin pages use `trpc.admin.*` not `api.admin.*` — web app exports `trpc` not `api`
- `useAuth()` returns `isLoaded` not `loading`
- R2 uploads (video upload page): requires **R2 S3 API token** (not a Cloudflare API token). Cloudflare API tokens (`cfat_` prefix) work for server-side S3 SDK calls but NOT for presigned URLs. Create the token via R2 → Manage R2 API Tokens → Create API Token (Object Read & Write, scoped to bucket). The resulting Access Key ID is a 32-char hex string with no prefix.
- R2 CORS must be configured on the bucket (Cloudflare → R2 → bucket → Settings → CORS Policy) with `AllowedMethods: [GET, PUT, HEAD]` and `AllowedHeaders: [*]` — without this, browser XHR PUT to presigned URLs is blocked
- R2 presigned URLs: do NOT include `ContentLength` in `PutObjectCommand` — it causes browser signature mismatch. Set `requestChecksumCalculation: 'WHEN_REQUIRED'` and `responseChecksumValidation: 'WHEN_REQUIRED'` on the S3Client to prevent SDK injecting CRC32 checksum headers that browsers can't replicate
- CSP `connect-src` in `middleware.ts` must include `https://*.r2.cloudflarestorage.com` and `https://generativelanguage.googleapis.com` — missing entries silently block XHR/fetch before they even leave the browser
- Upload button is `hidden sm:flex` on desktop + in avatar dropdown for mobile — always accessible regardless of screen size

## Dev Commands
```bash
pnpm install          # install all workspace deps
pnpm dev              # start all apps (turbo)
pnpm dev:web          # web only (port 3000)
pnpm dev:mobile       # Expo mobile only

pnpm db:push          # push schema to Supabase VPS (requires DATABASE_URL)
pnpm db:migrate       # create a tracked migration
pnpm db:generate      # regenerate Prisma client after schema change
pnpm db:studio        # open Prisma Studio GUI
pnpm db:seed          # run packages/database/seed.ts

pnpm lint             # lint all packages
pnpm type-check       # TypeScript check across monorepo
pnpm build            # build all packages
```

## Environment Variables
**Required to run:**
- `DATABASE_URL` / `DIRECT_URL` — `postgresql://postgres:<pw>@localhost:5432/postgres`
- `JWT_ACCESS_SECRET` — 64-char random (openssl rand -base64 48)
- `JWT_REFRESH_SECRET` — different 64-char random
- `NEXT_PUBLIC_APP_URL` — `https://app.raivstream.com`

**AI generation:**
- `XAI_API_KEY` — xAI API key for Grok Imagine (console.x.ai)
- `GEMINI_API_KEY` — Google Gemini API key for Nano Banana + Veo 3.1 (aistudio.google.com)
- `GEMINI_IMAGE_MODEL` — image model name (default: `gemini-3.1-flash-image-preview`)
- `VEO_MODEL` — Veo model name (default: `veo-3.1-generate-preview`)
- `RUNPOD_API_KEY` — RunPod key for LTX-2 and Wan 2.5

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
- Full Prisma schema (17 models)
- Custom JWT auth (register/login/refresh/logout/forgot-password/reset-password)
- tRPC routers: auth, video, feed, interaction, user, analytics, generation, admin
- R2 presigned upload flow
- Paystack integration (Viewer subscription + credit packages, webhooks)
- Stripe subscription scaffolding (Creator plan, international)
- Credit system with atomic deduction, refunds, transaction history
- AI Video Studio: Grok Imagine (live), Nano Banana (live via Gemini), Veo 3.1 (live via Gemini), Wan 2.5 (beta), LTX-2 (beta), Kling/Higgsfield (placeholders)
- Freemium episode gate (5 free episodes, PaywallModal)
- Web pages: feed (public), upload, video view, profile, pricing, credits, generate, analytics, search, settings, sign-in, sign-up, forgot-password, reset-password
- Admin dashboard: overview, user management, credit rate management, job history, revenue
- Admin roles: ADMIN + MODERATOR with gated tRPC procedures
- Mobile screens: feed, upload, profile, search, video modal, sign-in/sign-up (connected to app.raivstream.com)
- Mobile auth: Zustand store + SecureStore persistence
- Navbar: glass-blur on marketing, transparent on feed, avatar dropdown with Admin link
- UI design: dark navy (#050b18) + violet/purple ambient glow design system
- Feed: visible to all users (guests + signed-in), smooth CSS snap scroll, muted autoplay, image/video detection
- Auto-deploy: GitHub Actions SSH deploy on push to main → pm2 restart

**Still to build / verify:**
- Add email service (Resend/SendGrid) for password reset emails — currently logs URL to server console
- HLS video transcoding worker integration
- Creator analytics data pipeline (cron jobs / event writes)
- Redis caching layer
- Badge award cron jobs
- Content moderation system
- Full test suite
