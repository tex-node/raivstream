# Nocturne UI Reconciliation Plan

**Date:** 2026-08-23  
**Status:** AUDIT COMPLETE — implementation not yet started  
**Audit of:** redesign worktree at `C:\Users\XPS\OneDrive\Documents\Claude\Raivstream\raivstream`  
**Production baseline:** commit `3dadd703dc1403f00ddb46e415dc30a1aa20ba5b` ("Record Phase 9A production release")

---

## 1. Critical Finding: Separate Repository

The Nocturne redesign was implemented in a **completely separate repository**:

```
Redesign repo:   C:\Users\XPS\OneDrive\Documents\Claude\Raivstream\raivstream
Production repo: C:\Raiv\raivstream
```

The redesign repo contains one commit (`8635f258`), bootstrapped fresh with a toy schema.  
**The production repo at `C:\Raiv\raivstream` is completely clean** — git status shows only untracked files (AGENTS.md, the UI design handoff directory, a pending migration stub, a utility script). No tracked files were modified.

**Consequence:** There is no branch to revert. There are no diffs to apply from a git merge. The reconciliation is a cherry-pick exercise: extract Nocturne UI assets from the redesign repo and wire them to existing production APIs.

---

## 2. Rebuild Worktree / Branch Summary

| Item | Value |
|------|-------|
| Redesign repo path | `C:\Users\XPS\OneDrive\Documents\Claude\Raivstream\raivstream` |
| Branch | `main` |
| Base SHA | n/a (fresh repo — one commit) |
| Redesign HEAD SHA | `8635f258b0a6ea32d7c11cedc931f7835ef2ac97` |
| Production HEAD SHA | `3dadd703dc1403f00ddb46e415dc30a1aa20ba5b` |
| Committed file changes | `schema.prisma`, `seed.ts`, `package.json` (×5), `globals.css`, `layout.tsx`, `page.tsx`, `next.config.js`, `api/src/index.ts` |
| Deleted (committed) | `routers/feed.ts`, `routers/interaction.ts`, `routers/user.ts`, `routers/video.ts` |
| Untracked (new) | 8 route pages, `Shell.tsx`, `TRPCProvider.tsx`, `trpc.ts`, `tailwind.config.ts`, `middleware.ts`, sign-in/sign-up pages, Clerk webhook, Stripe webhooks, mobile app scaffolding |

---

## 3. File Classification

### 3A — SAFE UI / DESIGN WORK (candidates to extract)

These files contain no backend logic and can be adapted for the production repo.

| File (redesign repo) | What it contains | Action |
|---|---|---|
| `apps/web/src/app/globals.css` | Nocturne CSS custom properties, utility classes (noc-btn-primary, noc-btn-outline, noc-seg, noc-card, noc-pressable), scrollbar hiding | **Extract** — merge Nocturne section into production globals.css |
| `apps/web/tailwind.config.ts` | Nocturne color tokens (page, bar, magenta, purple, blue, cyan, t1–t6, tints), custom type scale, radius scale | **Extract** — merge tokens into production tailwind config |
| `apps/web/src/components/layout/Shell.tsx` | Mobile shell: status bar, app bar, scroll region, action bar slot, 5-tab bottom nav | **Extract** — adapt nav links to production routes, swap Clerk `useUser` → production `useUser` |
| `apps/web/src/app/projects/[id]/page.tsx` | Project overview — hero, stat rows, Continue CTA | **Adapt** — wire to `trpc.story.getProject`, map production fields |
| `apps/web/src/app/projects/[id]/story/page.tsx` | Chapter reader, paragraph AI action chips, story health bars | **Adapt** — wire to `trpc.story.listChapters` / `story.getProject` |
| `apps/web/src/app/projects/[id]/cast/page.tsx` | Character list — gradient avatars, role labels | **Adapt** — wire to `trpc.story.listCharacters` (StoryCharacterMemory) |
| `apps/web/src/app/projects/[id]/cast/[charId]/page.tsx` | Character detail — 7 accordion sections | **Adapt** — wire to `trpc.story.getCharacter` |
| `apps/web/src/app/projects/[id]/scenes/page.tsx` | Scenes list — status cards, cast chips | **Adapt** — wire to `trpc.story.listScenes` (StorySceneSeed) |
| `apps/web/src/app/projects/[id]/scenes/[sceneId]/page.tsx` | Scene Director — generation state machine, control groups | **Adapt** — wire to existing `trpc.story.generateSceneImage`, director settings |
| `apps/web/src/app/projects/[id]/assets/page.tsx` | Assets grid — filter chips, heart toggle | **Adapt** — wire to `trpc.story.listAssets` (StorySceneAsset), isFavorite toggle |
| `apps/web/src/app/page.tsx` | Home — project cards with progress bars, 2×2 starters, activity feed | **Adapt** — wire to `trpc.story.listMyProjects`, swap Clerk `useUser` → production `useUser` |

### 3B — BACKEND / DATA-MODEL REWRITES (do NOT apply to production)

These files are incompatible with production architecture and must NOT be copied.

| File (redesign repo) | Problem | Action |
|---|---|---|
| `packages/database/schema.prisma` | 5-model toy schema; missing 35+ production models; `User` has `clerkId` not `passwordHash`; drops Video, Academy, Sequence, Credits, Analytics, Moderation, StoryCharacterMemory, StorySceneAsset, CreativeCriticRun, SequenceVersion, etc. | **DISCARD — never apply** |
| `packages/database/seed.ts` | Seeds against the toy schema; hardcoded demo projects that don't match production data | **DISCARD** |
| `packages/api/src/index.ts` | Replaces production AppRouter (12 routers) with 5 stub routers; imports Clerk auth instead of JWT | **DISCARD** |
| `packages/api/src/routers/project.ts` | Uses `StoryProject` with `type: ProjectType` (toy enum); no production-compatible procedures | **DISCARD** |
| `packages/api/src/routers/chapter.ts` | Uses `Chapter` model (not production `StoryChapter`); no generationPrompt, no providerMetadata | **DISCARD** |
| `packages/api/src/routers/character.ts` | Uses `Character` model (not production `StoryCharacterMemory`); flattened strings | **DISCARD** |
| `packages/api/src/routers/scene.ts` | Uses `SceneSeed` model (not production `StorySceneSeed`); simulated generation timer | **DISCARD** |
| `packages/api/src/routers/asset.ts` | Uses `Asset` model with CSS gradient strings; not `StorySceneAsset` with R2 keys/URLs | **DISCARD** |

### 3C — DELETED PRODUCTION CAPABILITIES (must restore in production if they were touched)

These were deleted IN THE REDESIGN REPO, but since the redesign is a separate repo, **production versions are untouched**:

| Deleted in redesign | Status in production repo |
|---|---|
| `routers/feed.ts` | **INTACT** at `C:\Raiv\raivstream\packages\api\src\routers\feed.ts` |
| `routers/interaction.ts` | **INTACT** |
| `routers/user.ts` | **INTACT** |
| `routers/video.ts` | **INTACT** |
| All analytics, admin, auth, generation, runpod, notification, story, academy routers | **INTACT** — redesign never touched them |

### 3D — NEW MOCK / PLACEHOLDER LOGIC (in redesign — must not enter production)

| Placeholder | Location | Risk |
|---|---|---|
| 3.9-second generation timer | `scenes/[sceneId]/page.tsx` — `setTimeout` simulates image generation | Must be wired to real `trpc.story.generateSceneImage` |
| Hardcoded activity feed | `page.tsx` — 5 static strings ("Scene 03 picture is generating…") | Must be wired to real analytics/notification events |
| CSS gradient as asset "image" | `Asset` model has `gradient` string; no R2 key or URL | Asset thumbnails must use `StorySceneAsset.assetUrl` / `thumbnailUrl` |
| Demo seed data | `seed.ts` — "A Dog Going to School", "Lumen Coffee" | Never touch production DB |
| `SceneStatus.EMPTY/DRAFT/READY/GENERATING` | Toy enum; production uses `StorySceneAssetStatus.PENDING/GENERATING/READY/FAILED` per asset, not per scene | Scene status derivation must read from `StorySceneSeed.imageStatus` |

---

## 4. Schema Audit

### Auth architecture conflict — CRITICAL

| | Production | Redesign |
|---|---|---|
| Auth provider | Custom JWT (`passwordHash`, `RefreshToken`, `/api/auth/*` routes, `authService.ts`) | Clerk (`clerkId` on User, `@clerk/nextjs`, Clerk-hosted sign-in/sign-up, Clerk webhook) |
| `User.passwordHash` | ✅ Present | ❌ Removed |
| `User.clerkId` | ❌ Not present | ✅ Present |
| `RefreshToken` model | ✅ Present | ❌ Removed |
| `PasswordResetToken` model | ✅ Present | ❌ Removed |
| tRPC context | JWT userId from cookie | `auth()` from `@clerk/nextjs` |

**Action:** Production auth is unchanged. The redesign's Clerk imports must NOT enter production. When adapting UI components, replace `from '@clerk/nextjs'` with `from '@/lib/auth'`.

### Model comparison table

| Production Model | Redesign Model | Status | Action |
|---|---|---|---|
| `User` (passwordHash, role, premiumTier, creditBalance…) | `User` (clerkId only) | **CONFLICT** | Keep production `User`; strip `clerkId` from redesign UI |
| `StoryProject` (25+ fields: logline, synopsis, genre, tone, storyDna, creativeCriticMode…) | `StoryProject` (7 fields: title, type, completionPct, statusLabel only) | **CONFLICT** | Keep production `StoryProject`; map `completionPct` from status/scene counts |
| `StoryChapter` (chapterNumber, body, summary, generationPrompt, providerMetadata) | `Chapter` (number, title, content) | **REPLACED** | Keep production `StoryChapter`; map fields in UI adapter |
| `StoryCharacterMemory` (name, role, species, ageDescription, gender, visualDescription, personality JSON, personalityTraits JSON, motivation, fear, goal, relationships JSON, evolutionStage, evolutionNotes…) | `Character` (flat strings: appearance, personality, motivation, fear, relationships, movementStyle, evolution, traits[]) | **REPLACED** | Keep `StoryCharacterMemory`; map JSON fields to accordion sections |
| `StorySceneSeed` (orderIndex, description, locationType, indoorOutdoor, mood, emotion, cameraStyle, timeOfDay, weather, environmentMood, lighting, scenePace, characters JSON, imageStatus, imageUrl…) | `SceneSeed` (number, status enum, actionDesc, picks JSON, castNames[]) | **REPLACED** | Keep `StorySceneSeed`; derive `status` from `imageStatus`; map director fields to `picks` |
| `StorySceneAsset` (assetType, r2Key, assetUrl, thumbnailUrl, status, creativeStatus, criticScore, isFavorite, isLatest…) | `Asset` (gradient string, isFavourited, type: STORYBOOK/SEQUENCE) | **REPLACED** | Keep `StorySceneAsset`; show `thumbnailUrl`/`assetUrl` from R2 |
| `StorySequence` | ❌ Removed | **REMOVED** | Keep — Phase 9A production complete |
| `StorySequenceScene` | ❌ Removed | **REMOVED** | Keep |
| `SequenceVersion` | ❌ Removed | **REMOVED** | Keep |
| `CreativeCriticRun` | ❌ Removed | **REMOVED** | Keep |
| `CreativeCriticFeedback` | ❌ Removed | **REMOVED** | Keep |
| `PromptQualityFeedback` | ❌ Removed | **REMOVED** | Keep |
| `StoryScenePrompt` | ❌ Removed | **REMOVED** | Keep |
| `StoryCharacter` (legacy) | ❌ Removed | **REMOVED** | Keep (used by storyboard shots) |
| `StoryEnvironment` | ❌ Removed | **REMOVED** | Keep |
| `StoryboardShot` | ❌ Removed | **REMOVED** | Keep |
| `StoryQuestion` | ❌ Removed | **REMOVED** | Keep |
| `AcademyCourse` | ❌ Removed | **REMOVED** | Keep — Academy is production complete |
| `AcademyClass` / `AcademyClassMembership` | ❌ Removed | **REMOVED** | Keep |
| `AcademyLesson` / `AcademyAssignment` | ❌ Removed | **REMOVED** | Keep |
| `AcademySubmission` / `AcademyRubricScore` / `AcademyComment` | ❌ Removed | **REMOVED** | Keep |
| `AcademyLessonProgress` | ❌ Removed | **REMOVED** | Keep |
| `Video` + `VideoInteraction` + `WatchHistory` + `Follow` | ❌ Removed | **REMOVED** | Keep — video feed still in production |
| `GenerationJob` | ❌ Removed | **REMOVED** | Keep |
| `CreditBalance` / `CreditTransaction` / `FeatureCreditRate` | ❌ Removed | **REMOVED** | Keep — credit ledger must not be replaced |
| `Subscription` | ❌ Removed | **REMOVED** | Keep |
| `AnalyticsEvent` | ❌ Removed | **REMOVED** | Keep |
| `ModerationLog` | ❌ Removed | **REMOVED** | Keep |
| `Notification` | ❌ Removed | **REMOVED** | Keep |
| `RefreshToken` / `PasswordResetToken` | ❌ Removed | **REMOVED** | Keep — production auth depends on these |
| `Badge` / `UserBadge` / `VideoBadge` / `FeaturedContent` | ❌ Removed | **REMOVED** | Keep |

**Schema migration required for reconciliation:** NONE. All production models are intact. No additive migrations needed to apply Nocturne UI.

---

## 5. Router Audit

### Production procedures that cover redesign's new routers

| Redesign procedure | Equivalent production procedure | Action |
|---|---|---|
| `project.list` | `trpc.story.listMyProjects` | Wire UI to `story.listMyProjects`; map `completionPct` from project status |
| `project.getById` | `trpc.story.getProject` | Wire UI to `story.getProject` |
| `project.create` | `trpc.story.createProject` | Wire UI to `story.createProject` (title, storyType, audienceMode) |
| `chapter.list` | `trpc.story.listChapters` | Wire UI to `story.listChapters`; map `StoryChapter.body` → `content` |
| `chapter.update` | `trpc.story.updateChapter` | Wire UI to `story.updateChapter` |
| `character.list` | `trpc.story.listCharacters` (StoryCharacterMemory) | Wire UI; map JSON fields to accordion sections |
| `character.getById` | `trpc.story.getCharacter` | Wire UI to `story.getCharacter` |
| `scene.list` | `trpc.story.listScenes` | Wire UI to `story.listScenes`; derive display status from `imageStatus` |
| `scene.getById` | `trpc.story.getScene` | Wire UI to `story.getScene` |
| `scene.updatePicks` | `trpc.story.updateDirectorSettings` | Wire UI; map picks JSON to `directorSettingsSchema` fields |
| `scene.startGeneration` | `trpc.story.generateSceneImage` | Wire UI; remove mock 3.9s timer; use real generation job status polling |
| `scene.keepGenerated` | `trpc.story.selectStorybookImage` | Wire UI to real approval flow |
| `asset.list` | `trpc.story.listAssets` (StorySceneAsset with `isLatest=true`) | Wire UI; show `thumbnailUrl`/`assetUrl` from R2, not CSS gradient |
| `asset.toggleFavourite` | `trpc.story.toggleFavoriteAsset` | Wire UI to production favorite toggle |

**All redesign UI needs adapter code only — no new tRPC procedures need to be created.**

---

## 6. Auth Audit

| Question | Answer |
|---|---|
| What does production auth use? | Custom JWT — `passwordHash` on `User`, `RefreshToken` model, `authService.ts`, httpOnly cookie sessions (web), expo-secure-store (mobile), `/api/auth/*` REST routes |
| Is Clerk authoritative? | No. Clerk is NOT used in production. |
| Does the redesign assume Clerk? | Yes. `packages/api/src/index.ts` imports `auth` from `@clerk/nextjs`; `apps/web/src/app/page.tsx` imports `useUser` from `@clerk/nextjs`; sign-in/sign-up pages are Clerk-hosted; Clerk webhook at `/api/webhooks/clerk/route.ts` |
| Would existing users break? | If Clerk were applied to production, all existing users would lose auth (no `clerkId`, passwords not in Clerk). Catastrophic. |
| Action | Strip all `@clerk/nextjs` imports from adapted UI files. Replace with `import { useUser } from '@/lib/auth'`. The Clerk webhook and Clerk-hosted sign-in/sign-up pages must NOT be copied to production. |

---

## 7. Route Mapping

| Nocturne Screen (redesign) | Current Production Route | Current Tab/Feature | Backend Preserved? | Status |
|---|---|---|---|---|
| Home — project cards | `/` (video feed) | TikTok feed | ✅ | Route conflict — production home is video feed; Nocturne home should be `/story-playground` or replace feed if product pivot is approved |
| `/projects/[id]` | `/story-playground/[projectId]?tab=overview` | Overview tab | ✅ | Adapt UI to existing overview tab content |
| `/projects/[id]/story` | `/story-playground/[projectId]?tab=story` | Story tab | ✅ | Adapt chapter reader to `trpc.story.listChapters` |
| `/projects/[id]/cast` | `/story-playground/[projectId]?tab=characters` | Characters tab | ✅ | Adapt to `trpc.story.listCharacters` |
| `/projects/[id]/cast/[charId]` | n/a (character detail is in-panel in current UI) | Character Director panel | ✅ | New standalone route — wire to `trpc.story.getCharacter` |
| `/projects/[id]/scenes` | `/story-playground/[projectId]?tab=scenes` | Scenes tab | ✅ | Adapt to `trpc.story.listScenes` |
| `/projects/[id]/scenes/[sceneId]` | `/story-playground/[projectId]?tab=scenes` (scene inspector inline) | Scene Director panel | ✅ | New standalone route — wire to `story.getScene`, `story.generateSceneImage` |
| `/projects/[id]/assets` | `/story-playground/[projectId]?tab=assets` | Assets tab | ✅ | Adapt to `trpc.story.listAssets` |

### Features in production NOT represented in redesign

| Feature | Production Route | Redesign Coverage | Action |
|---|---|---|---|
| Video feed | `/`, `/v/[id]`, `/[username]` | ❌ Not in redesign | Keep existing pages — do not remove |
| TikTok video interactions | Feed components | ❌ Not in redesign | Keep existing components |
| Sequence Workspace | `/story-playground/[projectId]?tab=sequence` | ❌ Removed | Keep existing sequence tab |
| Storybook viewer | `/storybook/[projectId]`, `/story-playground/[projectId]?tab=storybook` | ❌ Removed | Keep existing storybook |
| Academy | `/academy/*` | ❌ Not in redesign | Keep — production complete |
| Admin dashboard | `/admin/*` | ❌ Not in redesign | Keep — production complete |
| Analytics | `/analytics` | ❌ Not in redesign | Keep |
| Credits | `/credits` | ❌ Not in redesign | Keep — credit ledger intact |
| AI Generation studio | `/generate` | ❌ Not in redesign | Keep |
| Notifications | `/notifications` | ❌ Not in redesign | Keep |
| Pricing | `/pricing` | ❌ Not in redesign | Keep |
| Settings | `/settings` | ❌ Not in redesign | Keep |
| Sign-in / Sign-up | Custom auth `/api/auth/*` | ⚠️ Redesign has Clerk-hosted versions | Keep production custom auth; do NOT copy Clerk sign-in/sign-up pages |
| Password reset | `/forgot-password`, `/reset-password` | ❌ Not in redesign | Keep |
| Film Blueprint / Story Studio | `/story-studio` | ❌ Not in redesign | Keep |
| Paystack / Stripe webhooks | `/api/paystack/*`, `/api/stripe/*` | ⚠️ Redesign has stub Stripe webhook | Keep production webhooks unchanged |
| R16 | `r16.raivstream.com` | ❌ Not in redesign | Keep as distinct subdomain experience |
| Creative Critic | Story Playground — Critic mode | ❌ Removed | Keep — Phase 9A production complete |
| Prompt quality dashboard | `/admin/prompt-quality` | ❌ Not in redesign | Keep |

---

## 8. Feature Preservation Matrix

| Feature | Current Route | Nocturne UI Location | Backend Preserved? | Status |
|---|---|---|---|---|
| Create Story | `/story-playground` (new project flow) | Home page starters | ✅ | **ADAPT** starter buttons → `trpc.story.createProject` |
| Resume Story | `/story-playground` (list) | Home page continue cards | ✅ | **ADAPT** continue cards → `trpc.story.listMyProjects` |
| Character Director | Story Playground characters tab | `/projects/[id]/cast/[charId]` | ✅ | **ADAPT** accordion → `StoryCharacterMemory` fields |
| Supporting Characters | Story Playground characters tab | `/projects/[id]/cast` | ✅ | **ADAPT** list → `trpc.story.listCharacters` |
| Scene Director | Story Playground scenes tab (inspector) | `/projects/[id]/scenes/[sceneId]` | ✅ | **ADAPT** — wire real generation, strip mock timer |
| Visual Style | Story Playground overview / creative spec | Missing from redesign | ✅ | **PRESERVE** existing production UI for visual style |
| Generate Picture | Story Playground scene inspector | `/projects/[id]/scenes/[sceneId]` CTA | ✅ | **ADAPT** — wire to `trpc.story.generateSceneImage` |
| Creative Critic | Scene inspector critic panel | ❌ Missing from redesign | ✅ | **PRESERVE** existing critic UI or add critic card to scene director page |
| Image History | Asset tabs in scene inspector | `/projects/[id]/assets` | ✅ | **ADAPT** — show `StorySceneAsset` list with `isLatest`, `isFavorite` |
| Asset Manager | Story Playground assets tab | `/projects/[id]/assets` | ✅ | **ADAPT** — wire to `trpc.story.listAssets` |
| Storybook | `/storybook/[projectId]` | ❌ Missing from redesign | ✅ | **PRESERVE** existing storybook page |
| Sequence Workspace | Story Playground sequence tab | ❌ Missing from redesign | ✅ | **PRESERVE** existing sequence UI / restyle separately |
| Film Blueprint | `/story-studio` | ❌ Missing from redesign | ✅ | **PRESERVE** existing film blueprint |
| Academy | `/academy/*` | ❌ Missing from redesign | ✅ | **PRESERVE** existing Academy — restyle separately in a later phase |
| Admin analytics | `/admin/*` | ❌ Missing from redesign | ✅ | **PRESERVE** existing admin dashboard |
| R16 | `r16.raivstream.com` | ❌ Missing from redesign | ✅ | **PRESERVE** — adapt Nocturne simplified variant later |
| Credits | `/credits` | ❌ Missing from redesign | ✅ | **PRESERVE** existing credits pages |
| Notifications | `/notifications` | ❌ Missing from redesign | ✅ | **PRESERVE** |

---

## 9. Nocturne Design Assets — What to Extract

All of the following can be safely extracted from the redesign repo and applied to the production repo with zero schema changes:

### From `apps/web/src/app/globals.css`
- `--noc-page: #0B0D14`
- `--noc-bar: #070810` / `--noc-bar-alpha: rgba(7,8,16,0.92)`
- `--noc-card: rgba(233,233,237,0.04)`
- `--noc-hairline: rgba(233,233,237,0.08)`
- `--noc-rule: rgba(233,233,237,0.06)`
- `--noc-gradient: linear-gradient(90deg, #d946a8, #b25ad9, #4f8bd6)`
- Utility classes: `.noc-card`, `.noc-btn-primary`, `.noc-btn-outline`, `.noc-seg`, `.noc-seg.active`, `.noc-gradient-text`, `.noc-pressable:active`

### From `apps/web/tailwind.config.ts`
- Colors: `page`, `bar`, `magenta` (`#d946a8`), `purple` (`#b25ad9`), `blue` (`#4f8bd6`), `cyan` (`#4fd6e8`), `t1`–`t6`, `pink-tint`, `lavender-tint`, `cyan-tint`
- Font size scale: 10.5px → 11 → 11.5 → 12.5 → 13.5 → 14.5 → 15.5 → 17 → 21 → 25px
- Border-radius scale: 5px / 10 / 11 / 12 / 14 / 16 / 18 / 999px

### From `apps/web/src/components/layout/Shell.tsx`
- Mobile shell layout (max-width 440px, centered)
- Simulated status bar (9:41 / 5G · 100%)
- App bar with back chevron, title, subtitle, "Saved" pill
- Scrollable content region + optional `actionBar` slot
- 5-tab bottom nav (Home / Story / Cast / Scenes / Assets)

---

## 10. Risk Areas

| Risk | Severity | Notes |
|---|---|---|
| Auth swap (Clerk into production) | 🔴 CRITICAL | Must NOT happen. All existing users use `passwordHash`. Replace `@clerk/nextjs` with `@/lib/auth` in all adapted UI files. |
| Schema replacement | 🔴 CRITICAL | Redesign schema is incompatible — drops 35+ models. Never run `db:push` from redesign repo against production or staging. |
| Mock generation timer | 🟠 HIGH | Scene Director's 3.9s timer must be replaced with real job polling before any feature testing. |
| Stale route clobber | 🟠 HIGH | Adding `/projects/[id]/*` routes to production without removing old tab query params could create duplicate entry points. Decide on a canonical routing strategy first. |
| Credit flows | 🟡 MEDIUM | All AI generation calls must still deduct credits via `deductCredits()`. Adapted scene director must not bypass credit checks. |
| R2 assets vs CSS gradients | 🟡 MEDIUM | Asset cards in redesign show CSS gradients; production shows R2 thumbnails. Must use `thumbnailUrl`/`assetUrl` from `StorySceneAsset`. |
| Creative Critic missing | 🟡 MEDIUM | The Scene Director in the redesign has no critic panel. Must preserve or re-add critic display when adapting that page. |
| Sequence Workspace | 🟡 MEDIUM | Phase 9A complete; not in redesign. Restyle separately — do not touch Sequence during initial Nocturne pass. |
| Academy | 🟡 MEDIUM | Not in redesign. Restyle separately — Academy has complex course/class/submission state. |
| R16 | 🟡 MEDIUM | Must remain a distinct subdomain experience. Nocturne simplified variant can follow as a separate step. |

---

## 11. Recommended Implementation Order

Implement incrementally in separate commits. Do not mix design tokens with API wiring in the same commit.

### Step 1 — Design System (no functional change)
Apply Nocturne tokens to production `apps/web`:
- Merge `globals.css` Nocturne section (below existing styles, no removals)
- Merge `tailwind.config.ts` Nocturne color/type/radius tokens
- Do not change any component files yet

### Step 2 — App Shell
Copy `Shell.tsx` to `apps/web/src/components/layout/Shell.tsx`:
- Replace `import { useUser } from '@clerk/nextjs'` → `import { useUser } from '@/lib/auth'`
- Update tab nav hrefs to match production route structure
- Keep existing `Navbar.tsx` for pages that don't use the Shell

### Step 3 — Home / Projects
Add `/story-playground` landing as Nocturne home (do not replace `/` video feed):
- Wire continue cards → `trpc.story.listMyProjects`
- Wire starter grid → `trpc.story.createProject` (map STORY/ADVERT/SHORT_FILM/IDEA to production `storyType` values)
- Wire activity feed → `trpc.notification.list` or `trpc.analytics.recentEvents`

### Step 4 — Story Workspace
Apply Nocturne shell to `/story-playground/[projectId]`:
- Keep all existing tabs (overview, story, characters, scenes, assets, sequence, storybook, insights)
- Apply Nocturne card/button/typography styling within each tab
- Do not change data fetching or tab routing

### Step 5 — Characters
Add standalone `/projects/[id]/cast/[charId]` route:
- Wire character detail accordion → `StoryCharacterMemory` fields
- Map `visualDescription` → Appearance section
- Map `personality` JSON → Personality section
- Map `motivation`, `fear`, `goal` → Motivation & Goal section
- Map `relationships` JSON → Relationships section
- Map `walkingStyle`, `speakingStyle` → Movement Style section
- Map `evolutionStage`, `evolutionNotes` → Evolution / Arc section

### Step 6 — Scene Director (standalone route)
Add `/projects/[id]/scenes/[sceneId]` route:
- Wire control groups to `trpc.story.updateDirectorSettings` (director settings schema already has Emotion/Camera/TimeOfDay/Weather/EnvironmentMood/Lighting/Pace)
- Replace 3.9s timer with real `trpc.story.generateSceneImage` call + job status polling
- Add Creative Critic panel below the review card
- Wire Keep → `trpc.story.selectStorybookImage`
- Ensure credit deduction happens inside `story.generateSceneImage` (already does)

### Step 7 — Assets (standalone route)
Add `/projects/[id]/assets` route:
- Wire to `trpc.story.listAssets` filtering `isLatest=true` or `isFavorite=true`
- Show `thumbnailUrl` from `StorySceneAsset` (not CSS gradient)
- Map `STORYBOOK` tag from `selectedForStorybookAt != null`
- Wire heart toggle → `trpc.story.toggleFavoriteAsset`

### Step 8 — Sequence (restyle only)
Apply Nocturne surface/border/text tokens to Sequence Workspace tab:
- Do NOT change `StorySequence`, `StorySequenceScene`, `SequenceVersion` data model
- Do NOT change sequence planning logic
- Style-only pass: card backgrounds, button gradients, timeline visual language

### Step 9 — Storybook (restyle only)
Apply Nocturne tokens to `/storybook/[projectId]`:
- Do NOT change storybook logic
- Style-only pass

### Step 10 — Academy (restyle only, separate phase)
Apply Nocturne tokens to `/academy/*`:
- Use existing Academy APIs (`trpc.academy.*`)
- Student dashboard, class page, lesson, assignment, submission pages

### Step 11 — R16 (separate phase)
Apply simplified Nocturne variant to R16 subdomain:
- Child-safe copy preserved
- Hidden provider/prompt/model/critic internals preserved
- R16 retains simplified Storybook workflow

---

## 12. What Does NOT Require a Database Migration

No migration is needed because:
1. The production schema is untouched
2. None of the Nocturne UI changes require new database fields
3. The only "new" data patterns are field mappings (e.g., deriving `completionPct` from existing scene counts — a query change, not a schema change)

**If a genuinely missing field is discovered during implementation:** stop and report it separately via the standard migration process. Do not silently add columns without review.

---

## 13. Verification Commands (run after each step)

```bash
# Schema validation
pnpm --filter @raivstream/database exec prisma validate
pnpm --filter @raivstream/database db:generate

# Type checking
pnpm --filter @raivstream/api type-check
pnpm --filter @raivstream/web type-check

# Lint
pnpm --filter @raivstream/web lint --max-warnings=0

# Tests
pnpm --filter @raivstream/api test

# Build
rm -rf apps/web/.next
pnpm --filter @raivstream/web build
```

---

## 14. UI Smoke Matrix (post-implementation)

| Screen | Route | Test | Using Existing Data? |
|---|---|---|---|
| Home (video feed) | `/` | Feed loads, tabs switch | ✅ |
| Story playground list | `/story-playground` (new) | Projects load from DB | ✅ |
| Story workspace | `/story-playground/[projectId]` | All tabs: overview, story, characters, scenes, assets, sequence, storybook, insights | ✅ |
| Character Director | `/projects/[id]/cast/[charId]` | All 7 accordion sections display | ✅ |
| Scene Director | `/projects/[id]/scenes/[sceneId]` | Controls display; generation triggers real job; status polling works; critic panel shows | ✅ |
| Assets | `/projects/[id]/assets` | R2 thumbnails load; filter chips work; heart toggle persists | ✅ |
| Storybook | `/storybook/[projectId]` | Scenes display in storybook order | ✅ |
| Academy student | `/academy/student` | Dashboard loads; classes visible | ✅ |
| Admin | `/admin` | User table, credits, jobs load | ✅ |
| R16 | `r16.raivstream.com` | Simplified experience; internals hidden | ✅ |

---

## 15. Mobile Smoke Breakpoints

Test all adapted pages at: 375px / 430px / 768px / 1024px / 1440px

Verify: navigation, workspace tabs, cards, modals, scene inspector, asset picker, Sequence, Storybook.

---

## 16. Confirmations

| Check | Status |
|---|---|
| New database created (`raivstream_v2`) | ✅ NOT created — no new database |
| `db:push` run against production or staging | ✅ NOT run |
| Production repo modified | ✅ NOT modified — production repo is clean |
| Redesign schema applied to any database | ✅ NOT applied |
| Existing users would lose data | ✅ No — no DB changes |
| Existing auth broken | ✅ No — custom JWT auth untouched |

---

## 17. Recommendation for Staging Qualification

After completing Steps 1–7 above on a feature branch in the production repo:

1. Deploy feature branch to staging environment
2. Run the verification commands above
3. Run UI smoke matrix using real staging data (existing projects, characters, scenes, assets)
4. Run mobile smoke at all five breakpoints
5. Verify that generation → credit deduction → job polling → asset display works end-to-end
6. Verify Creative Critic appears on generated images
7. Verify sequence workspace is unaffected
8. Verify Academy is unaffected
9. Verify R16 subdomain is unaffected
10. Produce a staging smoke report (format: `docs/operations/nocturne-phase1-staging-smoke.md`)
11. Only after staging sign-off: plan production deploy

**Do NOT deploy until staging qualification is complete and signed off.**
