# Mobile UI Handoff Reconciliation

## Release history

**Release 1 — `be8f8a4`** (`codex/ui-mobile-handoff-production`): implemented
and staging-qualified all 8 handoff screens, deployed to production. Status:
**IMPLEMENTATION DEPLOYED / CANONICAL ACTIVATION INCOMPLETE.** The screens
were real, functional, and reachable at `/m/**` — but `/m` was never linked
from anywhere in the application, so no ordinary user could reach them.
Production smoke testing at the time navigated directly into `/m/**` and
declared success without proving a normal user journey ever landed there.
That was a real gap in the smoke methodology, not a fabricated result: the
UI genuinely worked at `/m/**`, it just wasn't canonical.

**Release 2 — this document's release** (corrective): makes the same
screens the actual canonical `/story-playground` experience. `/m/**` now
permanently redirects to the equivalent canonical route (308, via
`next.config.js`) rather than serving a second, separately-maintained
implementation. See "Canonical route activation" below.

## Source

Source handoff: `C:\Raiv\raivstream\UI\design_handoff_raivstream_mobile`
Target: `apps/web` (Next.js) — not `apps/mobile`, a disconnected relic of the
old video-feed product (upload/search/video screens, no story/chapter/
character/scene concepts). Voice-generation work (Phase 9B.2C) remains
paused and is absent from this branch entirely — it was built from `481fce4`,
production's actual deployed baseline, before any Phase 9B.2C.1 code existed.

## Screen inventory

The handoff's `Raivstream Redesign.dc.html` contains three sibling
prototypes, confirmed by grepping every `data-screen-label`/`sc-if` marker in
the file: **RS desktop** (10 reference screens — Home, Projects, Project
Overview, Story Workspace, Character Director, Character detail, Scenes,
Scene Director, Asset Manager, Journey map), **RS mobile** (the 8 new
screens — the actual scope of this work), and **R16 reader** (5 screens — a
separate consumer reading-app product, not the creator-side R16-safety mode
this codebase already has; out of scope here).

| Handoff screen | Purpose | Existing Raivstream equivalent | API dependency | Status |
|---|---|---|---|---|
| Home | Project list, resume, start new | `story-playground` project list | `story.listMyProjects` | Shipped: `/m` |
| Project Overview | Single-project summary + entry points | Workspace "Overview" tab | `story.getWorkspace` | Shipped: `/m/[projectId]` |
| Story | Chapter text, paragraph-level AI direction | Workspace "Story" tab | `story.getWorkspace` (chapters) | Shipped: `/m/[projectId]/story` — AI action chips inert (no rewrite-dispatch endpoint exists) |
| Characters | Cast list | Character Director list | `story.getWorkspace` (characterMemory) | Shipped: `/m/[projectId]/cast` |
| Character detail | 7-section character profile | Character Director detail | `story.getWorkspace` | Shipped: `/m/[projectId]/cast/[characterId]` |
| Scenes | Scene list w/ status | Workspace "Scenes" tab | `story.getWorkspace` (sceneSeeds) | Shipped: `/m/[projectId]/scenes` |
| Scene Director | Direction controls + generate | Scene Director | `story.updateSceneDirector`, `story.generateSceneImage`/`regenerateSceneImage` | Shipped: `/m/[projectId]/scenes/[sceneId]` — real 7-field schema, not the mockup's invented 11-key set |
| Assets | Asset grid, favorite, tags | Asset Manager | `story.getWorkspace`, `story.favoriteSceneAsset` | Shipped: `/m/[projectId]/assets` |

No mobile design was supplied for **Audio, Sequence, Film (Movie Builder), or
Storybook**. These remain fully accessible — unmodified, unredesigned — via a
"More" section on Project Overview that links directly into the existing
desktop-styled implementation (`/story-playground/[projectId]?tab=audio` /
`?tab=sequence` / `?tab=film` / `?tab=storybook`), hidden for R16 to match
the desktop workspace's own visibility rule. This was a real gap found
during QA (see Known limitations) and fixed before this doc was written, not
a planned omission.

## Design tokens

Reconciled with the existing (previously scaffolded, unused) Nocturne token
sheet in `globals.css` (`--noc-*`: page/bar/card surfaces, t1–t6 text ramp,
magenta→purple→blue accent gradient, tints) and `tailwind.config.ts`. No
second theme was introduced. Two additions only: a `noc-shimmer` keyframe for
loading skeletons, and a `prefers-reduced-motion` rule disabling all
animation duration app-wide (new, not previously present).

## Navigation

Real Next.js routes per screen rather than the prototype's single-page
in-memory state machine — proper URLs, back-button, and deep-linking, same
visual/interaction design. The previously-unused `Shell.tsx` component was
extended (app bar, back button, "Saved" pill, scroll region, optional bottom
action bar, 5-tab bottom bar) rather than duplicated. Tab-bar active-state
mapping ports the prototype's own logic exactly: Home stays lit on Overview,
Cast stays lit on Character detail, Scenes stays lit on Scene Director.

## Canonical route activation (corrective release)

**Method A** (component extraction — preferred per the corrective brief) was
used: every screen's presentation/logic was extracted from its original
`/m/**` page file into a reusable component under
`apps/web/src/components/mobile-handoff/` (`HomeScreen`,
`ProjectOverviewScreen`, `StoryScreen`, `CastScreen`, `CharacterDetailScreen`,
`ScenesScreen`, `SceneDirectorScreen`, `AssetsScreen`). There is exactly one
implementation of each screen; nothing is duplicated between route trees.

**Canonical route wiring**:
- `/story-playground` → `HomeScreen` (was the creation wizard; the wizard
  moved, byte-for-byte unchanged, to `/story-playground/new` and is now
  linked from `HomeScreen`'s "Start something" cards).
- `/story-playground/[projectId]` (no `tab`, or `tab=overview`) →
  `ProjectOverviewScreen`.
- `/story-playground/[projectId]/story` → `StoryScreen` (new nested route).
- `/story-playground/[projectId]/characters` (+`/[characterId]`) →
  `CastScreen` / `CharacterDetailScreen` (new nested routes; named
  `characters` rather than `cast` to match the app's own pre-existing
  `?tab=characters` convention rather than inventing a third naming
  variant).
- `/story-playground/[projectId]/scenes` (+`/[sceneId]`) → `ScenesScreen` /
  `SceneDirectorScreen` (new nested routes).
- `/story-playground/[projectId]/assets` → `AssetsScreen` (new nested
  route).
- `/story-playground/[projectId]?tab=X` for `X` in
  `{story,characters,scenes,assets}` renders the **same** components inline
  (no redirect) — so any old bookmark using the legacy query-param
  convention keeps working, not just the new nested paths.
- `/story-playground/[projectId]?tab=X` for `X` in
  `{sequence,audio,film,storybook,insights}` — **completely unchanged**,
  the original ~1760-line workspace component's existing rendering, reached
  by an early-return branch inserted after its last hook call and before
  its own render logic. Nothing inside that legacy render path was touched.
- `?legacy=1` on any of the five now-componentized tabs is an intentional,
  documented escape hatch back to the original inline rendering for that
  tab — used today only by `CastScreen`'s "+ Add a character" link, since
  character creation (a form embedded in the legacy Characters tab) isn't
  reimplemented in the new UI yet. Verified working live on staging.
- `/m` and every `/m/**` path permanently redirect (308, `next.config.js`
  `redirects()`) to their canonical equivalent, preserving project/character/
  scene IDs. The old `/m/**` page files were deleted — Section 6's "there
  should be ONE implementation" is satisfied structurally, not just by
  convention. Verified live: `/m/[projectId]/scenes` → 308 →
  `/story-playground/[projectId]/scenes`.

**Why `/story-playground` itself was never reachable from ordinary
navigation before this release, and still mostly isn't from the site
root**: the app's `Navbar` hides its entire desktop nav (including the
existing "Story Playground" link) whenever `isFeed` is true — and the site
root `/` *is* the legacy video-feed page. This is pre-existing behavior,
untouched by this release, and out of scope for it (this corrective release
is scoped to making `/story-playground` itself canonical, exactly as
Section 2/4 of the brief defines "canonical" — not to changing the legacy
feed's own navigation chrome). Once a user reaches `/story-playground` by
any means — the Navbar link on a non-feed page, a bookmark, a direct
URL — they now land in the new UI automatically.

## Backend / schema

Zero Prisma schema changes, zero migrations, zero new tRPC procedures. Every
screen calls procedures that already existed in production: `listMyProjects`,
`getWorkspace`, `updateSceneDirector`, `generateSceneImage`,
`regenerateSceneImage`, `favoriteSceneAsset`.

## Features intentionally simplified or omitted (documented, not faked)

- **Story AI action chips** (Develop this idea / Strengthen conflict /
  etc.): no rewrite-per-paragraph endpoint exists — story text is
  regenerated wholesale via `continueStory`/`generateStory`, not edited
  paragraph-by-paragraph. Chips render and toggle selection exactly as
  designed but dispatch nothing. No fake success state, no call to a
  nonexistent endpoint.
- **Scene Director's 11 mocked control dimensions** (Performance: Emotion/
  Character behaviour/Energy; Camera: Shot size/Angle/Movement; etc.) don't
  map 1:1 onto the real 7-field `directorSettingsSchema`. Shipped the real 7
  fields (emotion, cameraStyle, timeOfDay, weather, environmentMood,
  lighting, scenePace) in the design's 5-group layout instead of inventing 4
  fields the backend can't persist.
- **"Generate picture" progress bar**: the real `generateSceneImage`/
  `regenerateSceneImage` mutation is synchronous (blocks until the image is
  ready). The design's 4-step copy/percentage schedule (0/900/2100/3100ms)
  is used as client-side cosmetic pacing for the wait — real generation,
  polished wait state, never a fabricated result. If the real call finishes
  early, the UI jumps straight to review; if slower, it holds at the final
  step until the real result arrives.
- **Assets filter chips**: the design mocks 4 (All/Chosen/Scenes/
  Characters). This backend has one asset category (per-scene generated
  images, no separate character-portrait type), so "Scenes"/"Characters"
  would always equal "All"/empty. Shipped real, backed filters only: All,
  Favorites.
- **"+ Add a character"**: links to the existing desktop character-creation
  flow rather than reimplementing it in the new shell.

## Voice-generation exclusion

Confirmed structurally, not just by policy: this branch (`codex/
ui-mobile-handoff-production`) was cut directly from `481fce4` — production's
actual deployed commit, which predates Phase 9B.2C.1 entirely. There is no
`VoiceGenerationJob`, provider registry, provider adapter, Generate Voice
button, voice model selector, or any other Phase 9B.2C artifact anywhere in
this branch's history, confirmed live in the Audio Workspace (loads and
functions with zero voice-generation UI present).

## R16 behavior

- Home: "Create an Advert"/"Create a Short Film" starters hidden, only
  "Create a Story"/"Start from an Idea" shown.
- Overview: "Storybook" stat row and the entire "More" (Audio/Sequence/
  Film/Storybook) section hidden.
- Story: "Tap any paragraph to direct it." hint hidden; paragraphs are not
  selectable, AI action chips never render.
- Scene Director: all 5 director control groups replaced with "Advanced
  scene controls aren't shown here."; only Generate/Regenerate remains.

All verified live against `?r16=1` on real staging data.

**R16 retains all existing capability restrictions and server-side
isolation.** Two minor presentation differences remain: some kid-friendly
copy from the legacy interface has not yet been fully replicated in the new
handoff screens, and creator/admin technical asset metadata remains
available only through the existing advanced surface. Neither limitation
exposes restricted functionality or data.

## Responsive qualification

Verified clean (no horizontal overflow, centered 440px-max-width column,
correct text truncation) at 360×800, 375×812, 390×844, 430×932, 768×1024
(tablet), and 1024×768/1440×900 (desktop) — confirmed via
`getBoundingClientRect`/`scrollWidth` checks in addition to visual
screenshots.

## Staging qualification (real data, real mutations)

Full click-through of all 8 screens against the shared QA project ("The
Brave Firefly's Journey") twice — once before, once after the projectId/More
-section/badge fixes below:

- Real navigation (tab bar, back button) between every screen.
- Real `updateSceneDirector` mutation, verified persisted across a hard
  reload.
- One real, full `generateSceneImage` run on a Draft scene through to
  Keep — real R2-hosted image, real status transition Draft → Ready,
  verified both in the Scenes list and via the Assets grid.
- Real `favoriteSceneAsset` toggle, verified persisted, then cleaned up
  (un-favorited) after testing — the generated image itself was left in
  place, since it's real functional output, not disposable test data.
- Real Active/Latest/Approved/Favorite/Storybook-selected badges confirmed
  distinct and correct on the Assets grid.
- Audio, Sequence, Film (Movie Builder — `story:movie_render` confirmed
  still exactly 100 credits), and Storybook all confirmed reachable and
  fully functional through the new "More" links.

## Post-activation gate audit (this release)

Ten additional gates were run after the canonical activation above, before
this was considered release-complete. Two real, release-critical gaps were
found and fixed as a direct result:

1. **Fresh story creation never redirected anywhere** — `generateStory`'s
   success handler only ever called `setStep('story')`, keeping the user on
   `/story-playground/new` inside its own embedded story/scene editor
   (unchanged legacy code). There was no path by which finishing the
   creation wizard sent a user to the new canonical UI at all. Fixed:
   `onSuccess` now does `router.push(\`/story-playground/${projectId}\`)`
   immediately after scene generation completes. Verified end-to-end on
   staging with a real `createSpark → generateQuestions → answerQuestion ×5
   → generateStory → generateScenes` run: landed at
   `/story-playground/<newId>` showing the new Overview with real content
   (1 chapter, 4 characters, 6 scenes). Cleaned up afterward.
2. **`/story-playground/[projectId]/cast` 404'd** — the canonical nested
   route is named `characters` (matching the app's pre-existing
   `?tab=characters` convention), but nothing aliased the equally-plausible
   `cast` spelling (only `/m/:id/cast` → `/characters` existed). Fixed by
   adding `/story-playground/:projectId/cast(/:characterId)` redirects on
   the canonical tree itself, not just from `/m`.
3. **Analytics/resume-state parity gap** — the legacy workspace component's
   `useEffect` that calls `story.trackWorkspaceTab` (persists
   `StoryProject.lastWorkspaceTab`, used by the "Continue Your Stories"
   resume action; fires a `story_workspace_tab_changed`/`asset_manager_
   opened` analytics event) still fires correctly for the legacy `?tab=X`
   access pattern on the unchanged component, but never fired for the five
   new dedicated nested routes, since those are separate page components
   that never called it. Fixed: added a shared `useTrackTab` hook
   (`components/mobile-handoff/useTrackTab.ts`), wired into all five new
   screens plus `CharacterDetailScreen`/`SceneDirectorScreen` (tracked as
   their parent tab, matching the legacy component's own granularity — it
   never had separate "character detail" or "scene director" tab
   identities either). Similarly, the legacy list page's one-time
   `story_playground_opened` analytics event moved with it to
   `/story-playground/new`; added the same event to the new `HomeScreen`,
   since that's the actual primary entry point now.
4. Verified narrow/explicit branching in `[projectId]/page.tsx` — exactly
   five `if (tab === '...')` string-equality checks, no wildcard
   fallthrough; structurally guaranteed (not just by convention) that the
   dedicated nested routes (`/story`, `/characters(+detail)`, `/scenes
   (+director)`, `/assets`) can never reach the legacy render path, since
   Next.js routes them to entirely separate page files.
5. Verified every `next.config.js` redirect preserves nested dynamic
   segments exactly (`/m/:id/cast/:characterId` →
   `/story-playground/:id/characters/:characterId`, tested live with real
   IDs, not just inspected).
6. Repository-wide search for `/m` navigation references
   (`["'\`]/m["'/]` across `apps/web/src`) returned zero matches outside
   `next.config.js`'s redirect definitions themselves — no remaining
   in-app `/m` destination anywhere.
7. All 13 deep links from the corrective brief's list tested via direct
   hard navigation (not clicks): all 200, survived independently.
8. Two lower-severity, non-security parity gaps found and **not** fixed
   (documented instead, since fixing them would expand this release's
   scope beyond routing/composition reconciliation):
   - The legacy workspace swapped in kid-friendly copy throughout
     Overview/Story/Characters for R16 users (e.g. "Keep Writing" vs
     "Continue Writing", "My Characters" vs "Edit Characters", "Cards" vs
     "Scenes"). The new screens use one consistent (adult-register) copy
     for all users. Nothing sensitive is exposed either way — this is a
     tone/warmth regression for R16 users, not a capability or safety gap
     (every actual R16 hiding rule — Storybook stat, More section, Story
     hint/chips, Scene Director controls — is preserved, see below).
   - The legacy Scenes/Assets tabs showed extra technical metadata
     (provider/model/dimensions) to ADMIN/MODERATOR/CREATOR roles on each
     asset. The new Assets/Scenes screens don't surface this for anyone —
     an under-exposure, not an over-exposure, and a minor convenience loss
     for internal/creator power users only.
9. Confirmed `/` (the legacy video-feed product) was not touched, and
   is intentionally out of scope: **the Raivstream Story Playground
   canonical application begins at `/story-playground`; the legacy `/`
   video-feed surface was outside the supplied mobile handoff and remains
   unchanged in this release.** A future phase could make `/` itself open
   directly into Story Playground — that is a separate product/navigation
   decision, not part of this corrective activation.
10. Re-ran the full staging acceptance walkthrough from a cold sign-in,
    zero manual `/m` entry, covering both the existing-project journey and
    the fresh-creation journey above — see the Staging qualification
    section for the consolidated route sequence.

## Known limitations

1. **Pre-existing hard-reload auth race** (not introduced or worsened by
   this work): on a hard URL reload/direct navigation (not a soft/SPA tab
   click), `useUser()`'s `isLoaded`/`isSignedIn` can resolve after a
   project-scoped query has already rendered its error/empty branch,
   producing a brief "This project couldn't be loaded" / empty-state flash
   before self-correcting once auth resolves (typically 1-3s). Confirmed via
   `/api/auth/me` calls that this is a genuine, if brief, session-timing
   condition, not a routing or data bug — and confirmed the same class of
   race exists on the pre-existing desktop pages, which share the same
   `useUser()` pattern. Not fixed here, since fixing it would mean touching
   shared auth-loading behavior well outside this UI-only change's scope;
   flagged as a follow-up.
2. Character portraits, scene-card thumbnails without a ready image, and
   avatar placeholders use deterministic gradient placeholders (matching the
   handoff's own placeholder convention) rather than real images, since
   `StoryCharacterMemory` has no portrait-image field.
3. The Story screen's paragraph selection generalizes the prototype's
   hardcoded "exactly 2 selectable paragraphs" to "every paragraph
   selectable, single-select" — a real-content necessity (unbounded
   paragraph count), not a fidelity shortcut.

## Responsive Desktop Reconciliation

### Root cause

The activation release above made `/story-playground` render the handoff's
components at their canonical routes, but those components — and the
`Shell` chrome wrapping them — were built exclusively against the handoff's
one supplied artboard (a 390×844 phone mock). Nothing in the mobile-handoff
tree carried a `>= 1024px` layout rule, and `Shell`'s desktop treatment
(shipped in commit `9615ead`) was a decorative ~440px-wide "phone frame"
centered in the viewport with an ambient background — a nicer-looking
phone, not a desktop composition. The user's own words: "the current
implementation appears to preserve the handoff's narrow mobile column at
desktop widths instead of adapting the interface into a proper desktop
workspace." Confirmed by direct inspection of `https://app.raivstream.com/
story-playground` at desktop widths prior to this fix.

### Original mobile width cap

No component declared a literal `max-width: 440px` in code — the "cap" was
`Shell.tsx`'s removed `.noc-shell-frame` class (`max-width: 440px` at
`@media (min-width: 768px)`, with a 44px border-radius and a phone-frame
box-shadow token from the design handoff's README). Below that, every one
of the 8 screen components used single-column flex/grid layouts with no
`lg:` (or equivalent) responsive variants at all — so even after removing
the frame, nothing would have used the freed width without the per-screen
work described below.

### Chosen breakpoints

Tailwind's existing `sm`/`md`/`lg`/`xl`/`2xl` scale, plus one new custom
screen, added to `apps/web/tailwind.config.ts`:

| Tier    | Range          | Tailwind prefix |
|---------|----------------|------------------|
| Mobile  | 0–639px        | (base, unprefixed) |
| Tablet  | 640–1023px     | `sm:` / `md:` |
| Desktop | 1024–1439px    | `lg:` |
| Wide    | 1440px+        | `wide:` (new custom screen) |

`lg:` (1024px) is the desktop-shell threshold everywhere: the sidebar
appears, the mobile bottom tab bar disappears, and every screen's grid/
split-panel rules activate at that same breakpoint, matching the mandated
QA viewport `1024×768` exactly. `xl:`/`wide:` further widen grids (Cast,
Scenes, Assets) as more columns comfortably fit; they never change nav or
shell structure, only column counts.

### Shell behavior

`apps/web/src/components/layout/Shell.tsx` was rewritten (not patched):

- **Mobile (`< 1024px`)**: unchanged from the handoff — full-width, sticky
  top app bar (back/title/subtitle/Saved pill), scrollable content, sticky
  bottom tab bar (Home/Story/Cast/Scenes/Assets).
- **Desktop (`>= 1024px`)**: a new, persistent, `position: fixed` left
  `Sidebar` (264px / `lg:w-64`) carrying the Raivstream wordmark, the same
  5 primary nav items as the mobile tab bar, and a secondary "More" section
  (Audio/Sequence/Film/Storybook — hidden for R16 and when no project is in
  context, matching the mobile tab bar's own disabled-state and R16 rules).
  The main content column is offset `lg:ml-64` and the mobile bottom tab
  bar is hidden (`lg:hidden`). The Shell itself imposes **no width cap** on
  its children at any breakpoint — each screen owns its own content/
  reading/grid width, per Section 14 of the brief.
- `apps/web/src/app/globals.css`: the old `.noc-shell-frame` phone-frame
  class (and the desktop ambient-background/flex-center rules on
  `.noc-shell-viewport`) were deleted outright, not merely resized —
  confirmed via a repo-wide search that no other file still references
  `noc-shell-frame`.

### Navigation behavior

Both `BottomTabBar` (mobile) and `Sidebar` (desktop) are driven by the same
`primaryNavItems(projectId)` helper, so active-tab highlighting, disabled
state (no project in context), and href targets can never drift between
the two — there is exactly one nav-item source of truth. R16 hides the
sidebar's "More" section exactly as it hides the equivalent legacy-tab
links elsewhere; verified live on staging at both 390×844 and 1440×900
(see Staging results below).

### Per-screen desktop changes

| Screen | Mobile (unchanged) | Desktop (`lg:` and up) |
|---|---|---|
| Home | Single column, 2-col starter grid | Content capped `1280px`; continue-cards become a 2-col grid; starters expand to 4 columns |
| Project Overview | Single column stack | CSS grid split: left/main column (hero, primary CTA, Story/Characters) + fixed 360px right column (stats, More) |
| Story | Full-width paragraph stack | Reading column capped at `760px`, centered in the (still-wide) workspace — app width and reading width are separate, per Section 14 |
| Cast | Single-column row list | Card grid: 2 cols at 1024, 3 at 1280, 4 at 1440+; avatar moves above name (portrait-card layout) instead of beside it |
| Character detail | Single column (avatar, then every accordion) | Grid split: 280px sticky profile column + accordion detail column |
| Scenes | Single-column card stack | Card grid: 2 cols at 1024, 3 at 1280+ |
| Scene Director | Preview, then all controls stacked beneath | Grid split: sticky preview column + 420px controls column, side by side |
| Assets | 2-col thumbnail grid | Grid widens: 3 cols at 1024, 4 at 1280, 6 at 1440+; content capped `1440px` |

All mutation/query logic (`getWorkspace`, `updateSceneDirector`,
`generateSceneImage`/`regenerateSceneImage`, `favoriteSceneAsset`,
`trackWorkspaceTab`, etc.) is untouched — every change in this phase is
Tailwind className additions (plus, where a class needed to win over an
existing inline `style` on the same CSS property, Tailwind's `!important`
modifier) to the JSX these components already rendered.

### Measurements (staging, `raivstream-phase9b2-audio-staging`, port 3037)

Captured via `getBoundingClientRect()`/`getComputedStyle()` (screenshots on
this pane are unreliable — see Known limitations below), at
`1440×900` against the seeded QA project (`cmtb8u7ga000b9s38pewi3miz`):

- Sidebar: `256px` wide, `display: flex` (desktop), `display: none` at
  `< 1024px`; mobile bottom tab bar: `display: none` at `>= 1024px`,
  `display: flex` below it.
- Project Overview grid: `712px 360px` columns (1184px content column,
  1280px max-width minus `lg:px-10` gutters, minus the 264px sidebar).
- Story reading column: `760px` wide (fixed, independent of the 1184px
  workspace width around it).
- Cast grid at 1440: `264px × 4` columns (4 characters/row).
- Character detail: `280px` profile column + `720px` detail column.
- Scenes grid at 1440: 3 columns (`~355px` each).
- Scene Director at 1440: `637px` preview column (sticky) + `420px`
  controls column.
- Assets grid at 1440: 6 columns (`~171px` each), content capped `1440px`.
- Zero horizontal overflow (`document.documentElement.scrollWidth ===
  window.innerWidth`) confirmed at all 9 mandated viewports: `360×800`,
  `390×844`, `430×932`, `768×1024`, `1024×768`, `1280×800`, `1366×768`,
  `1440×900`, `1920×1080`. At `1920×1080` the content column correctly
  holds at its `1280px` cap rather than stretching edge to edge.
- R16 (`?r16=1`) at both `390×844` and `1440×900`: sidebar/legacy "More"
  section absent, Storybook stat row absent — same as the non-R16 mobile
  behavior, just also verified in the new desktop sidebar.

### Staging results

Deployed to `raivstream-phase9b2-audio-staging` (port 3037) by syncing only
the 11 changed files (`Shell.tsx`, `globals.css`, `tailwind.config.ts`, and
all 8 `mobile-handoff/*.tsx` screens) into the existing staging checkout,
rebuilding, and restarting the pm2 process. Full walkthrough at both
`390×844` (mobile, to confirm zero regression) and `1440×900` (desktop, the
release's actual target) covering: sign-in → Home → Project Overview →
Story → Cast → Character detail → Scenes → Scene Director → Assets, plus
the sidebar's "More" links into the untouched Audio/Sequence/Film/
Storybook legacy-tab views. All real data (no mocks), same seeded QA
project used throughout this arc. Console: two pre-existing, unrelated
errors observed and NOT attributable to this change — an R2 CORS
restriction on one scene-asset thumbnail (tracked separately, see
`docs/r2-cors-setup.md`) and a CSP-blocked `fetch` to
`app.raivstream.com` (a staging-environment `NEXT_PUBLIC_APP_URL`
misconfiguration, pre-existing). No new console errors, no hydration
errors, no broken interactions.

### Production results

Deployed via the standard `main` push → GitHub Actions pipeline (run
`33295321260`, "Build & deploy web", succeeded in 2m42s). Deployed SHA
`b9a5844`, confirmed via `git rev-parse HEAD` on the VPS and matching what
was pushed. Both health endpoints healthy post-deploy:
`https://app.raivstream.com/api/health` and
`https://r16.raivstream.com/api/health` (database status `ok`).

Live verification at `https://app.raivstream.com/story-playground` using a
disposable smoke account (registered, verified, then deleted with
`verifiedGone: true` — see Known limitations for why a real project wasn't
also created this round):

- **1440×900**: sidebar `256px` wide, `display: flex`; mobile bottom tab
  bar `display: none`; starter grid `264px × 4` columns; zero horizontal
  overflow. Same desktop composition observed on staging, now confirmed
  live.
- **390×844**: sidebar `display: none`; bottom tab bar `display: flex`;
  zero horizontal overflow; identical to the pre-existing mobile
  experience.
- `story:movie_render` confirmed unchanged at exactly **100 credits**
  (`creditsPerUnit: 100`) via direct query against the production credit
  rate table.
- One pre-existing `401` console entry from an early unauthenticated
  `/api/auth/me` probe before sign-in completed — expected, not a
  regression.

### Verdict (superseded by the precedence-audit round below)

Initial verdict at SHA `b9a5844` was PASS, but that build still carried
the `.noc-shell-main` flex-column regression described in "Follow-up:
inline-style/class precedence audit" above — present at every viewport,
including the ones this verdict was based on. The regression didn't
visibly break the specific checks run at the time (short-content pages
happened to render correctly regardless), so it was not caught before
that verdict was issued. The corrected, current verdict is below.

### Final verdict

**RAIVSTREAM RESPONSIVE DESKTOP RECONCILIATION — PASS**

Final SHA: `b8ccf27e8c132b6994287dd625120e71737874f0` (short: `b8ccf27`),
merged to `main` from `codex/ui-mobile-handoff-production`, deployed and
re-verified live at both `390×844` and `1440×900` after the precedence
audit and shell regression fix — including the specific bottom-nav
pinning check the regression broke
(`navBottom: 844 === windowInnerHeight: 844` on production, matching the
post-fix staging result). The 1440×900 desktop view is a real workspace
composition — persistent sidebar, wide multi-column grids (measured 4
Cast / 3 Scenes / 6 Assets columns), split-panel detail/director screens,
a measured 2.0:1 main:utility column ratio on Overview, capped-width
reading (760px) and dashboard columns — not the mobile layout centered or
scaled. Success-test self-assessment: a viewer shown only a 1440×900
screenshot of this release would reasonably read it as a desktop creative
application, not a mobile app enlarged.

### Known limitations (this phase)

1. The tablet tier (`640–1023px`, `sm:`/`md:`) inherits the mobile layout
   as-is (2-column starter grid, single-column everything else) rather
   than receiving its own intermediate treatment — acceptable because
   nothing overflows or breaks at that width, but it is not the
   "tablet expands intelligently" ideal described in the brief; flagged as
   a follow-up rather than blocking this release, since the brief's
   pass/fail bar is specifically the desktop (`>= 1024px`) composition.
2. **Superseded** — the initial pass of this release used Tailwind's `!`
   important modifier to win over pre-existing inline `style` properties
   on the same element. A follow-up round removed every `!` and instead
   moved every breakpoint-varying layout property (`display`,
   `flexDirection`, `gap`, `padding`, `width`/`height`,
   `gridTemplateColumns`, `whiteSpace`) out of inline `style` and into
   `className`, leaving inline `style` only for values that never change
   by breakpoint. See "Follow-up: inline-style/class precedence audit"
   below for the full account, including a real regression this caught
   and fixed in `Shell.tsx`.
3. Production live verification used an empty (no-project) disposable
   account rather than a real project, to avoid spending real AI
   generation credits purely to re-confirm layout code that was already
   exhaustively verified against the real, rich seeded QA project on
   staging (identical component code, identical build pipeline — no
   server/business-logic differences between the two environments for
   this purely-frontend change). The Home screen's desktop shell/grid
   composition was confirmed live on production instead, which exercises
   the same Shell/Sidebar/nav code every other screen shares.

## Follow-up: inline-style/class precedence audit

A second pass, prompted by direct review of the diff, treated every
Tailwind `!important` added in the first pass as a signal to re-examine
the underlying inline `style` rather than a fix in itself. Two things came
out of that: one real regression, and a repo-wide cleanup.

### The regression: `.noc-shell-main` was missing its flex-column context

When `.noc-shell-frame` (the old ~440px phone frame) was deleted and
replaced by `.noc-shell-main`, the rewrite kept `min-height: 100dvh` but
dropped `display: flex; flex-direction: column; position: relative` —
properties the old class also carried, which is what made the sticky top
app bar, the `flex: 1` scroll region, the sticky action bar, and the
bottom tab bar behave as a pinned app-shell chrome (the standard
"min-height + flex-column" sticky-footer pattern) instead of a plain
scrolling document. Confirmed live on staging before the fix: at
`390×844` on the Home screen, `.noc-shell-main` computed to
`display: block`, and the bottom tab bar sat at `top: 360.75px / bottom:
437.75px` — nowhere near the `844px` viewport bottom, `position: static`.
This was present at **every** viewport, not just desktop — the desktop
symptom (a workspace that still looked cramped) was a second-order effect
of the same missing rule, not a separate bug. Fixed by restoring
`display: flex; flex-direction: column; position: relative` to
`.noc-shell-main` in `globals.css`. Re-verified on staging post-fix:
`navBottom: 844 === windowInnerHeight: 844` at `390×844`, `mainDisplay:
"flex"`. This is exactly the class of bug the precedence audit was meant
to catch — a global/shell-level constraint that can make the whole
application look wrong regardless of how correct the per-screen grids
are.

### The cleanup: removing inline layout properties instead of stacking `!`

Every `lg:!`/`xl:!`/`wide:!` override from the first pass was removed.
Where a layout property (`display`, `flexDirection`, `gap`, `padding`,
`width`/`height`, `gridTemplateColumns`, `whiteSpace`, `position`) needed
to differ by breakpoint, it was moved out of the element's inline `style`
object and into `className` as a base Tailwind utility plus `lg:`/`xl:`/
`wide:` variants — e.g. `style={{ padding: '14px 18px 32px' }}` became
`className="px-[18px] pt-3.5 pb-8 lg:px-10 lg:py-10"`. Inline `style` now
carries only values that never change by breakpoint (colors, borders,
border-radius, font-weight, one-off pixel values like a fixed hero
height). Applied to all 8 mobile-handoff screens.

One additional, distinct case surfaced during this pass: `.noc-btn-primary`
(`width: 100%`) is a plain custom class, not an inline style, but because
it's defined in `globals.css` *after* the `@tailwind utilities;`
directive, it was beating a responsive utility class (`lg:w-auto`) on
plain file order at equal specificity — the same trap, one layer removed,
with no inline style to blame. The correct fix for that shape of conflict
is different: `globals.css`'s custom `.noc-*` classes are now wrapped in
Tailwind's `@layer components { ... }` block, which is hoisted ahead of
`@tailwind utilities`'s generated output regardless of where it sits in
the source file — so any Tailwind utility, including a responsive variant,
now reliably wins over these classes without `!important` anywhere.

### `ProjectOverviewScreen` restructure

Rebuilt to the specified target: mobile keeps the exact original stack
(hero → CTA → Story/Characters → stats → More); `md:` (tablet, 768px+)
becomes a balanced `1fr 1fr` two-column split; `lg:` (desktop) becomes a
real `2fr 1fr` (~2/3 main, ~1/3 utility) workspace split — main column
(hero, primary action, Story/Characters), utility column (metadata stats,
More). The "More" section now renders inside the utility column with its
own bordered card treatment at `lg:` (`lg:rounded-2xl lg:border lg:p-4`)
so it reads as a distinct panel rather than a mobile menu tacked onto the
end of a long page; on mobile it's unchanged (no card, no border).

### `CharacterDetailScreen` and remaining screens

`CharacterDetailScreen` already had the target profile-column (sticky,
left) + editable-details-column (right) split from the first pass; this
round only removed its `!` overrides (avatar `width`/`height`/`fontSize`,
container `padding`) in favor of moving those into `className`, with no
structural change. `CastScreen`, `HomeScreen`, `ScenesScreen`,
`StoryScreen`, `AssetsScreen`, and `SceneDirectorScreen` received the same
treatment — same grids/splits as documented above, same measurements,
just with every layout property now living in `className`.

### DOM measurements after the audit (staging, `1440×900`, same seeded QA project)

| Metric | Value |
|---|---|
| Viewport width | 1440px |
| Shell outer width (`.noc-shell-viewport`) | 1440px |
| Sidebar width | 256px |
| Main workspace width (`.noc-shell-main`) | 1184px |
| Home content width | 1184px |
| Overview content width | 1184px (main column 714.7px, utility column 357.3px — a 2.0:1 ratio, matching the ~2/3 : ~1/3 target) |
| Story reading-column width | 760px |
| Assets grid width | 1104px (1184px content minus the screen's own `lg:px-10` gutters) |
| Assets visible columns | 6 |
| Cast visible columns | 4 |
| Scenes visible columns | 3 |

All values land inside the expected qualitative ranges (shell ≈100%
viewport; sidebar 220–280px; main = remaining width; Home/Overview/Assets
≈1000–1250px usable workspace; Story prose ≈680–820px) — confirmed via
`getBoundingClientRect()`/`getComputedStyle()`, not inferred. Re-ran the
zero-horizontal-overflow and R16 (`?r16=1`, "More" absent) checks at both
`390×844` and `1440×900` post-fix; both pass.

Typecheck and build clean after this round
(`pnpm --filter @raivstream/web type-check` / `build`). Deployed to
staging (`raivstream-phase9b2-audio-staging`), then to production via the
same `main` push pipeline — see the updated final SHA below.
