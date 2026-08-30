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
