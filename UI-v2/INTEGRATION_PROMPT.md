# Task: Integrate the Raivstream UI v2 redesign into the production web app

## Context — read these first
- Repo: `tex-node/raivstream` (Turborepo). Source of truth for current state: `SESSION.md`, `docs/architecture.md`, `docs/OVERVIEW.md`, `docs/product_roadmap.md`, and `AGENTS.md` if present. Read them before planning.
- The redesign reference lives at `C:\Raiv\raivstream\UI-v2` (standalone Vite + React 18 + Tailwind v4 + react-router app). It is a **design and interaction reference with mock data**, not code to deploy as-is. Read its `README.md`, `src/styles/index.css` (design tokens), `src/components/*` (shared UI), `src/screens/*` (12 screens) and `src/lib/data.ts` (the mock data you are replacing). Every `TODO` in it marks a backend hook.
- Target: `apps/web` (Next.js 15 App Router, tRPC v11 + TanStack Query v5, custom JWT auth with httpOnly cookies, Tailwind). Mobile (`apps/mobile`, Expo) is **out of scope** for this task.

## Goal
Make the UI v2 look and flow the real web UI of app.raivstream.com (and r16.raivstream.com), wired to the existing tRPC routers — without losing any existing capability and without schema changes unless unavoidable.

## Design rules (non-negotiable — these are the point of the redesign)
- Apple-style dark: true black on mobile, `#0e0e10` desktop window, `#1a1a1c` sidebar, `#1c1c1e` surfaces, system font stack (SF Pro → Geist fallback). Port the tokens from `UI-v2/src/styles/index.css` into apps/web's Tailwind setup (check whether apps/web is on Tailwind v3 or v4 and translate `@theme`/`@utility` accordingly). Scope them so existing pages don't change until they're migrated.
- One primary action per screen. The brand gradient (`#d46bf0 → #f0609f → #3fd0e6`) is used ONLY for that action, progress bars and selection rings — never as a background.
- Very few buttons: segmented controls, Settings-style grouped lists, and tap-to-cycle rows instead of button rows. Don't re-add the old dense toolbars.
- Mobile (<768px): floating glass tab bar with Watch · Create · Library on top-level screens; project screens use back · title · more + Story/Cast/Scenes segmented control + bottom-pinned primary action. Desktop (≥768px): Mac-style sidebar (Watch, Create, R16 Kids, Library, Insights, Projects list, profile → Settings) and a toolbar per screen.
- Touch targets ≥44px. Real `<button>`/`<a>`/`<label>`, aria labels on icon buttons, `aria-live` on generation status.

## Screen → backend mapping
Discover the exact procedure names in `packages/api/src/routers/*` before wiring — the names below come from SESSION.md and must be verified.

| UI v2 screen (route) | Existing feature / route | Wire to |
|---|---|---|
| Welcome (`/`) | `/sign-in`, `/sign-up` | Existing email/password auth + Google GIS button (`/api/auth/google`). **Remove the "Continue with Apple" button** — Apple sign-in does not exist in the backend; replace with Continue with Google + Continue with email. Keep the Watch/Create choice as the post-login landing preference. |
| Watch (`/watch`) | Home vertical feed | Feed procedures (For You / Following tabs; Trending & Viewers Pick may live behind the tab label or be dropped — ask), real `<video>` playback using `mp4Url`/`hlsMasterUrl` with existing `VideoCard` behaviors: guest 50-video gate, free-tier premium lock, like/comment/share/follow, landscape backdrop handling. |
| Create (`/create`) | `/story-playground` (new) | Prompt bar → existing story creation flow (`story.createSpark` → guided questions → `story.generateStory`). Story/Advert/Short film chips map to `StoryType`/existing options. "Continue" row ← `story.listMyProjects` (cover = first ready scene image, progress from scene/picture counts). |
| Story (`/project/:id/story`) | Workspace Story tab | `story.getWorkspace`; paragraph chips → `story.rewriteParagraph` with directives Develop this idea / Increase tension / Make this funnier / Explore another ending; story strength from existing story-health data if available; edit → `story.updateChapter`; truncation banner → `regenerateStoryText` / `completeUnfinishedStory`. "Turn into scenes" → `story.generateScenes` then navigate to Scenes. |
| Cast (`/project/:id/cast`) | Characters / Character Director | Character memory list + detail (look/personality/motivation/fear/relationships); edit via `story.updateCharacterMemory`, add via `story.createCharacterMemory`. |
| Scene Director (`/project/:id/scenes`) | `SceneDirectorScreen` / scenes tab | Scene strip ← scene seeds; direction rows ← the existing director fields on `StorySceneSeed` (emotion, camera style, time of day, weather, environment mood, lighting, pace) saved via `story.updateScene` (no auto-regenerate). Generate → `generateSceneImage`/`regenerateSceneImage` (FLUX2), then "Animate" → `generateSceneVideo` (H3_MAX). Replace the mock timer in `useGeneration` with real job polling; keep the user-facing status copy. Keep → set active asset; Redo → regenerate. Show `LowBalanceWarning` and moderation `flaggedPhrase` errors inline. Keep the shot-grid / multi-clip panel reachable (secondary, collapsed). |
| Library (`/library`) | Assets / media library | Films (`story.listMovieAssets` + published videos), Scenes (scene assets with active/favorite), Characters. Search filters client-side first. |
| R16 Kids (`/kids`) | r16 subdomain kids feed | Kids-safe feed only. Must respect existing R16 host detection (`x-r16-mode`/`r16.*`) and route restrictions; never show prompts, providers, models, credits or debug data. "Parents" lock exits via a parent check (design only exists — implement as a simple PIN/password confirm or leave a TODO and ask). |
| Insights (`/insights`) | Creator analytics page | Existing creator analytics data; single-series bar chart, 7D/28D/90D. |
| Credits (`/credits`) | Credits/billing | `user.creditBalance` (+ `lowBalance`), ledger from CreditTransaction, packs + prices from the real Paystack (NGN) / Stripe (USD) config — no hardcoded prices; checkout via the existing payment flows. |
| Settings (`/settings`) | Profile/account | User profile, preferences, sign-out, links to Credits/Insights/Kids/Admin (Admin link only for ADMIN/MODERATOR). |
| Admin (`/admin` review) | Admin moderation queue | Approve/reject/flag via existing admin procedures with role checks. Keep all other admin pages reachable from its sidebar (users, credits, jobs, revenue, providers, story analytics, prompt quality, movie renders, sequence, academy). |

## Do not lose these (not in UI v2 yet)
Storybook viewer, Sequence/timeline, Audio tab, Film/Movie Builder, Academy, AI Studio (`/generate`), Story Studio. Keep their routes working. Propose minimal entry points that fit the design (e.g. a "More" sheet from the project ⋯ button, or a Film segment) and **ask before removing or hiding any of them**. Don't restyle them in this task beyond what's needed to not look broken inside the new shell.

## How to work
1. Create a branch (e.g. `feat/ui-v2`). Do not deploy to production; no prod migrations; do not touch `.env*` or `cred/`.
2. Plan first: post a short plan with the route structure you'll use in App Router (e.g. a `(v2)` route group + shared layout), how the new UI is switched on (feature flag such as `NEXT_PUBLIC_UI_V2` or a per-user opt-in), and the list of procedures you'll call per screen. Wait for approval.
3. Build in this order, committing after each and keeping everything type-safe against the real router types: tokens + shared components → app shell (sidebar/tab bar) → Create + Story + Cast + Scene Director → Watch + Library → Credits + Settings + Insights → Kids → Admin.
4. Loading, empty and error states for every screen (skeletons in the same shapes; no spinners on full pages). Optimistic updates only where the API is idempotent.
5. No new schema unless unavoidable; if needed, follow the camelCase migration rule in `docs/architecture.md` §14.

## Definition of done
- `pnpm --filter @raivstream/api type-check`, `pnpm --filter @raivstream/web type-check`, `pnpm --filter @raivstream/web lint --max-warnings=0`, `pnpm --filter @raivstream/api test`, and `pnpm --filter @raivstream/web build` all pass.
- Manually verified at 390×844 and 1440×900: every screen renders with real data, the generate → keep/redo flow works end to end with real credits, R16 shows no prompt/provider/credit data, guest gate and premium locks still work, admin-only routes are still role-protected.
- Old UI still available when the flag is off.
- `SESSION.md` updated (Current State, Feature Map, Recent Changes) per its maintenance rule.
- Final report: what's wired, what's still mock/TODO, any procedures you had to add, and screenshots of each screen at both sizes.
