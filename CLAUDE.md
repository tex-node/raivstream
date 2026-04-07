# Raivstream — Claude Context

## What This Is
Short-form vertical video platform (TikTok-style). Turborepo monorepo with a Next.js 15 web app, Expo mobile app (Android + iOS primary endpoint), shared tRPC API package, and a Prisma/PostgreSQL database package.

## Monorepo Layout
```
raivstream/
├── apps/
│   ├── web/          — Next.js 15 (secondary endpoint, deployed to Vercel)
│   └── mobile/       — Expo SDK 50 (PRIMARY endpoint — Android + iOS)
└── packages/
    ├── api/          — tRPC v11 router (shared by web and mobile)
    └── database/     — Prisma schema + generated client
```

## Tech Stack
| Layer | Technology |
|---|---|
| Mobile (primary) | Expo SDK 50, React Native, TypeScript, expo-router |
| Web (secondary) | Next.js 15 App Router, React 18, TypeScript, Tailwind CSS |
| API | tRPC v11, Zod |
| Data fetching | Tanstack Query v5 (react-query) |
| Auth | Custom JWT (email + password, access + refresh tokens, bcryptjs) |
| Database | PostgreSQL + Prisma ORM — VPS-hosted Supabase via Docker |
| Storage | Cloudflare R2 (S3-compatible, `@aws-sdk/client-s3`) |
| Payments | Stripe (3-tier subscriptions) |
| Cache | Upstash Redis (optional) |
| Monitoring | Sentry, PostHog |

## Key File Paths
```
packages/api/src/index.ts              — appRouter (auth, video, feed, interaction, user, analytics)
packages/api/src/trpc.ts              — router, publicProcedure, protectedProcedure
packages/api/src/lib/jwt.ts           — signAccessToken, verifyAccessToken, signRefreshToken, extractBearerToken
packages/api/src/routers/
  auth.ts                             — register, login, refresh, logout, logoutAll
  video.ts                            — upload flow, getById, updateMetadata, delete
  feed.ts                             — forYou, trending, viewersPick, following
  interaction.ts                      — like, dislike, starRating, watchProgress
  user.ts                             — profile, follow, search
  analytics.ts                        — creator dashboard stats
packages/database/schema.prisma       — all DB models

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

apps/web/src/
  app/page.tsx                        — home feed
  app/layout.tsx                      — root layout (TRPCProvider + AuthProvider)
  app/upload/page.tsx                 — video upload flow
  app/v/[id]/page.tsx                 — single video view
  app/[username]/page.tsx             — creator profile
  app/analytics/                      — creator analytics dashboard
  app/pricing/                        — subscription pricing page
  app/subscription/                   — Stripe checkout/manage
  app/settings/                       — user settings
  app/search/                         — search page
  app/sign-in/page.tsx                — custom JWT sign-in form
  app/sign-up/page.tsx                — custom JWT sign-up form
  app/api/trpc/[trpc]/route.ts        — tRPC HTTP handler (JWT context factory)
  app/api/stripe/                     — Stripe webhook + checkout endpoints
  components/feed/FeedTabs.tsx        — tab switcher
  components/feed/VideoFeed.tsx       — vertical scroll feed
  components/video/VideoCard.tsx      — individual video card
  components/video/VideoPlayer.tsx    — HTML5 / HLS video player
  components/video/VideoInteractions.tsx — like/dislike/star buttons
  components/layout/Navbar.tsx        — top navigation
  lib/auth.tsx                        — React AuthProvider + useAuth() + useUser()
  lib/trpc.ts                         — tRPC client setup (Tanstack Query)
  lib/stripe.ts                       — Stripe server client
  middleware.ts                       — cookie-based redirect for protected routes
```

## Auth Pattern (Custom JWT — no Clerk)
- `auth.register` — creates User with bcrypt-hashed password, returns access + refresh tokens
- `auth.login` — constant-time password compare, returns tokens
- `auth.refresh` — rotates refresh token (family-based reuse detection)
- `auth.logout` / `auth.logoutAll` — revokes refresh token family from DB
- Access token: 15 min, signed with `JWT_ACCESS_SECRET`
- Refresh token: 30 days, signed with `JWT_REFRESH_SECRET`, stored hashed in DB
- Mobile: tokens persisted via `expo-secure-store`, state managed by Zustand (`apps/mobile/lib/auth.ts`)
- Web: tokens persisted via `localStorage`, `raiv_auth_present=1` cookie used for middleware redirects
- tRPC `protectedProcedure` enforces auth via `ctx.user != null` (not the cookie)

## Database Models (schema.prisma)
- **User** — email, username, passwordHash, role (VIEWER|CREATOR), premiumTier (FREE|VIEWER_PREMIUM|CREATOR_PREMIUM|ULTIMATE)
- **RefreshToken** — userId, tokenHash, family, expiresAt, revokedAt (enables token rotation + reuse detection)
- **Video** — rawVideoUrl (R2 private), mp4Url (CDN), hlsMasterUrl, status (UPLOADING→PROCESSING→READY), engagementScore
- **VideoInteraction** — liked, disliked, starRating (1–5), watchTime, completed
- **WatchHistory** — lastPosition, completed, watchedAt
- **Follow** — followerId ↔ followingId
- **Subscription** — Stripe IDs, tier, status, period
- **Badge / UserBadge / VideoBadge** — weekly achievement badges
- **FeaturedContent** — curated sections (section, position, week)
- **Category / VideoCategory** — many-to-many video categorisation

## Video Upload Flow
1. Client → `video.requestUpload` → creates UPLOADING Video record + R2 presigned PUT URL (1h expiry)
2. Client → PUT file directly to R2 (bypasses server)
3. Client → `video.confirmUpload` → sets mp4Url, status → PROCESSING (or READY if no transcode)
4. Client → `video.updateMetadata` → title, description, tags, thumbnail, categories

## Feed Types
- `forYou` — public, scored by engagementScore + recency
- `trending` — public, sorted by viewCount window
- `viewersPick` — public, sorted by avgStarRating
- `following` — **auth required**, videos from followed creators

All feeds use **cursor-based pagination** (ISO date strings or float scores as cursor).

## Common Pitfalls (already fixed)
- Tanstack Query v5: `onSuccess` removed from `useQuery` → use `useEffect` watching `data` instead
- Tanstack Query v5: mutation `isLoading` renamed to `isPending`
- Keep tRPC at v11 in both `packages/api` and `apps/web` — mixing v10/v11 breaks the build
- Prisma `.$extends()` returns `DynamicClientExtensionThis`, not `PrismaClient` — cast with `as unknown as PrismaClient` in `packages/database/index.ts`
- After schema changes always run `npx prisma generate` from `packages/database/`
- `packages/api` has its own `tsconfig.json` scoped to `src/**/*.ts` — needed to prevent root tsconfig from picking up web app files

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

## Environment Variables (see .env.example)
Required to run:
- `DATABASE_URL` / `DIRECT_URL` — Supabase VPS PostgreSQL: `postgresql://postgres:<pw>@<vps-ip>:5432/postgres`
- `JWT_ACCESS_SECRET` — 64-char random (openssl rand -base64 48)
- `JWT_REFRESH_SECRET` — different 64-char random
- `R2_ENDPOINT` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` / `R2_PUBLIC_URL`
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- Stripe Price IDs: `STRIPE_VIEWER_PREMIUM_PRICE_ID`, `STRIPE_CREATOR_PREMIUM_PRICE_ID`, `STRIPE_ULTIMATE_PRICE_ID`

Optional:
- `UPSTASH_REDIS_URL` / `UPSTASH_REDIS_TOKEN` — Redis cache
- `TRANSCODE_WORKER_URL` / `TRANSCODE_WORKER_SECRET` — async HLS transcoding worker
- `SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_KEY` — monitoring

## Implementation Status
**Done:**
- Monorepo structure, Turborepo config
- Full Prisma schema (15 models including RefreshToken)
- Custom JWT auth (register/login/refresh/logout with token rotation)
- tRPC routers: auth, video, feed, interaction, user, analytics
- R2 presigned upload flow
- Stripe subscription scaffolding
- Web pages: home feed, upload, video view, profile, pricing, analytics, search, settings, sign-in, sign-up
- Mobile screens: feed, upload, profile, search, video modal, sign-in/sign-up
- Mobile auth: Zustand store + SecureStore persistence

**Still to build / verify:**
- Run `pnpm db:push` against Supabase VPS to apply schema (requires live DATABASE_URL)
- HLS video transcoding worker integration
- Creator analytics data pipeline (cron jobs / event writes)
- Redis caching layer
- Badge award cron jobs
- Content moderation system
- Full test suite
