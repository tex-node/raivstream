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
| AI generation | xAI Grok Imagine, Wan 2.5, LTX-2, Nano Banana (via RunPod) |
| Credits | Custom credit system — ₦1,000 = 1,000 credits, deducted per AI generation |
| Cache | Upstash Redis (optional) |
| Monitoring | Sentry, PostHog |
| Process manager | PM2 (`raivstream-web`) on VPS |
| Reverse proxy | Caddy — db.raivstream.com → Kong:8000, app.raivstream.com → Next.js:3000 |
| CI/CD | GitHub Actions → SSH deploy on push to main |

## Key File Paths
```
packages/api/src/index.ts              — appRouter (auth, video, feed, interaction, user, analytics, generation)
packages/api/src/trpc.ts              — router, publicProcedure, protectedProcedure
packages/api/src/lib/jwt.ts           — signAccessToken, verifyAccessToken, signRefreshToken, extractBearerToken
packages/api/src/lib/credits.ts       — deductCredits(), refundCredits(), MODEL_FEATURE_KEY map
packages/api/src/lib/authService.ts   — registerUser, loginUser, refreshTokens, logoutUser, requestPasswordReset, resetPassword
packages/api/src/lib/generators/
  index.ts                            — submitGenerationJob(), pollJobStatus(), MODEL_META
  grokImagine.ts                      — xAI Grok Imagine (XAI_API_KEY) — image generation
  nanoBanana.ts                       — Nano Banana video generation
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
  app/page.tsx                        — landing page (signed-out) / video feed (signed-in)
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
  components/feed/FeedTabs.tsx          — tab switcher
  components/feed/VideoFeed.tsx         — vertical scroll feed + PaywallModal
  components/feed/PaywallModal.tsx      — freemium gate overlay (5 free episodes)
  components/video/VideoCard.tsx        — individual video card
  components/video/VideoPlayer.tsx      — HTML5 / HLS video player
  components/video/VideoInteractions.tsx — like/dislike/star buttons
  components/layout/Navbar.tsx          — top nav (glass-blur on marketing, transparent on feed)
  lib/auth.tsx                          — React AuthProvider + useAuth() + useUser()
  lib/trpc.ts                           — tRPC client setup (Tanstack Query)
  lib/stripe.ts                         — Stripe server client + STRIPE_PLANS
  lib/paystack.ts                       — Paystack helpers + CREDIT_PACKAGES + VIEWER_PLAN
  lib/credits.ts                        — (see packages/api/src/lib/credits.ts — server side)
  middleware.ts                         — cookie-based redirect for protected routes
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

## Credit System
- 1,000 credits = ₦1,000 (configured in `FeatureCreditRate` table via seed.ts)
- `deductCredits()` in `packages/api/src/lib/credits.ts` uses atomic `updateMany WHERE balance >= cost` — race-condition safe
- `refundCredits()` called automatically if provider submission fails
- Costs: nano_banana=50, grok_imagine=100, ltx2=150, wan_25=200, higgsfield=400, kling=500, thumbnail=20, transcribe=30, enhance=100
- Credit packages: starter (1k cr / ₦1k), popular (5k cr / ₦4.5k — best value), pro (10k cr / ₦8k)
- `generation.create` deducts before job creation; `generation.listModels` returns `creditCost` from DB

## Freemium Gate
- FREE tier users get 5 unique episodes per day before hitting a paywall
- Enforced server-side in `interaction.trackProgress` (FORBIDDEN error) and client-side in `VideoFeed` via `user.episodeGate`
- `PaywallModal` overlays the feed; Viewer plan CTA is ₦1,500/month via Paystack

## Database Models (schema.prisma)
- **User** — email, username, passwordHash, role (VIEWER|CREATOR), premiumTier (FREE|VIEWER|CREATOR)
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
- **GenerationJob** — userId, model, prompt, status, providerJobId, outputUrl, thumbnailUrl, videoId
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

## Feed Types
- `forYou` — public, scored by engagementScore + recency
- `trending` — public, sorted by viewCount window
- `viewersPick` — public, sorted by avgStarRating
- `following` — **auth required**, videos from followed creators

All feeds use **cursor-based pagination** (ISO date strings or float scores as cursor).

## VPS Infrastructure
- **Server**: Contabo VPS at 81.0.246.223
- **Supabase**: self-hosted Docker Compose at /root/supabase/docker (16 services)
- **Postgres**: exposed on 127.0.0.1:5432 (direct, bypassing broken Supavisor)
- **Caddy**: /etc/caddy/Caddyfile — db.raivstream.com → :8000, app.raivstream.com → :3000
- **App**: /root/raivstream — git pull + PM2 (`pm2 restart raivstream-web --update-env`)
- **Deploy**: GitHub Actions `.github/workflows/deploy.yml` — SSH on push to main
- **Env file**: /root/raivstream/.env (symlinked to apps/web/.env.local and packages/database/.env)

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
- `XAI_API_KEY` — xAI API key for Grok Imagine (console.x.ai) — **required for /generate to work**
- `RUNPOD_API_KEY` — RunPod key for LTX-2 and Wan 2.5
- `NANO_BANANA_API_KEY` / `NANO_BANANA_API_URL` — Nano Banana provider

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
- tRPC routers: auth, video, feed, interaction, user, analytics, generation
- R2 presigned upload flow
- Paystack integration (Viewer subscription + credit packages, webhooks)
- Stripe subscription scaffolding (Creator plan, international)
- Credit system with atomic deduction, refunds, transaction history
- AI Video Studio: Grok Imagine (live), Wan 2.5, LTX-2, Nano Banana, Kling/Higgsfield (placeholders)
- Freemium episode gate (5 free episodes, PaywallModal)
- Web pages: landing (marketing), feed, upload, video view, profile, pricing, credits, generate, analytics, search, settings, sign-in, sign-up, forgot-password, reset-password
- Mobile screens: feed, upload, profile, search, video modal, sign-in/sign-up (connected to app.raivstream.com)
- Mobile auth: Zustand store + SecureStore persistence
- Navbar: glass-blur on marketing, transparent on feed, avatar dropdown
- UI design: dark navy (#050b18) + violet/purple ambient glow design system
- Auto-deploy: GitHub Actions SSH deploy on push to main → pm2 restart

**Still to build / verify:**
- Add email service (Resend/SendGrid) for password reset emails — currently logs URL to server console
- Schema migration on VPS for PasswordResetToken table (`pnpm exec prisma db push`)
- HLS video transcoding worker integration
- Creator analytics data pipeline (cron jobs / event writes)
- Redis caching layer
- Badge award cron jobs
- Content moderation system
- Full test suite
