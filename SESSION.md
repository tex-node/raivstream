# Raivstream Session

This file is the living project/session record for Raivstream. Update it every time a feature is added, changed, deployed, or materially debugged so future development starts from the current GitHub/VPS reality.

Last updated: 2026-05-25
Current GitHub commit deployed to VPS: `4bd7eff feat: add story studio workflow`

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
- Guest users can browse with a freemium gate.
- Signed-in free users have a server-side episode gate for premium-only videos.
- R16 kids mode filters to approved kids-safe content only.
- `VideoCard` handles images, vertical videos, landscape image/video backdrop behavior, and premium locks.

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
- Story Studio can open `/generate` with prefilled prompt, aspect ratio, duration, project ID, and storyboard shot ID.
- `/generate` now saves completed generated outputs back to the originating storyboard shot when launched from Story Studio.

### Admin

- Admin and moderator roles are enforced by tRPC middleware and web route checks.
- Admin pages cover overview, users, moderation queue, credit rates, jobs, and revenue.
- Moderation queue supports approve/reject/flag plus rating and kids-safe metadata.

### Credits And Payments

- Credit balance is stored per user.
- Credit transaction ledger records purchases, usage, bonuses, and refunds.
- Feature credit rates are DB-configurable through admin UI.
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

Story Studio tables currently exist in production:

- `story_projects`
- `story_characters`
- `story_environments`
- `storyboard_shots`

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

## Known Issues And Follow-Ups

- Prisma `db push` is blocked by Supabase cross-schema FK metadata. Use controlled SQL or update Prisma datasource multi-schema configuration before relying on `db push`.
- Story Studio currently uses deterministic prompt compilation, not an LLM story planner. It is structured and stored, but future work can add AI-assisted story expansion, character consistency checks, and environment generation.
- Storyboard asset storage currently accepts generated output URLs or pasted URLs. A future enhancement should add direct R2 upload/select-from-generation history.
- `supabase-pooler` is stopped. If another client needs pooled DB access, configure it on a non-conflicting port and verify tenant/user credentials.
- Root local working tree has unrelated untracked/local files such as `.claude/`, `.codex/`, and `AGENTS.md`; do not stage them unless explicitly requested.

