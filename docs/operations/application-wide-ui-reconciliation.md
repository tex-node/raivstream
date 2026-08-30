# Application-Wide UI Reconciliation

Status: **PHASE 1 OF 8 COMPLETE (SHA `9536a4e`) — global shell/top-level
navigation done; route-by-route migration (Phase 2 onward) not yet
started.** This document is the live route inventory, design-system
plan, and phased roadmap for the "RAIVSTREAM — APPLICATION-WIDE UI
SYSTEM RECONCILIATION" initiative. It is being built incrementally
across multiple rounds; see "Execution status" and "Phase 1 execution"
for what has actually shipped vs. "Next phase: route-by-route migration"
for what's planned but not yet built.

**Baseline for all future work on this initiative: `9536a4e`** (supersedes
the prior `f8ffe55` Foundation Pass baseline). This is the production SHA
as of Phase 1 (route inventory + UI-family classification + design-system
gap analysis + the Audio/Sequence/Film/Storybook shell fix + the global
top-level navigation added to `Shell`). It is explicitly *not* the
endpoint — see the completion criterion at the end of "Next phase" below.
Any session continuing this initiative should treat `9536a4e` as its
starting point, re-read this document in full before making changes, and
**not reopen already-qualified Story Playground behavior** (the 8
canonical `/story-playground/[projectId]/*` screens and the
responsive-desktop work already shipped and verified in
`docs/operations/mobile-ui-handoff-reconciliation.md`) except where a
shared-primitive extraction requires a strictly presentation-only
refactor of them.

## 1. Route inventory

Audited directly from `apps/web/src/app` (every `page.tsx` under it), cross-
checked against the production build's route list. 47 page routes plus 2
alias/redirect files.

Legend for **Current UI family**: see "Legacy UI families" below (A–E).

| Route | Current family | Target family | Status | Notable components | Migration action |
|---|---|---|---|---|---|
| `/` | C (legacy video-feed) | *decision needed* | Untouched | `Navbar`, `FeedTabs`, `VideoFeed` | See §6 — product decision required before restyle |
| `/sign-in` | C (legacy, `#7c3aed`/`#a78bfa`) | A (Nocturne) | Not started | custom form | Restyle only, no auth logic change |
| `/sign-up` | C | A | Not started | custom form | Restyle only |
| `/forgot-password` | C | A | Not started | custom form | Restyle only |
| `/reset-password` | C | A | Not started | custom form | Restyle only |
| `/story-playground` | **A (Nocturne)** | A | ✅ Done | `HomeScreen` | none |
| `/story-playground/new` | D (dark, Nocturne-adjacent but independent token set — `#0B0D14` bg with its own `#256fd0`/`#2fbf71` accents, 0 shared component reuse) | A | Not started | custom wizard, 1963 lines | Largest single non-admin file in the app; needs componentization, not just re-theming |
| `/story-playground/[projectId]` (tabs: overview/story/characters/scenes/assets) | **A** | A | ✅ Done (Method A extraction) | `ProjectOverviewScreen`, `HandoffStoryScreen`, `HandoffCastScreen`, `HandoffScenesScreen`, `HandoffAssetsScreen` | none |
| `/story-playground/[projectId]` (tabs: audio/sequence/film/storybook/insights, or `?legacy=1`) | **B (old Story Playground UI)** — same 1782-line file, original render branch | A | **Not started — highest-priority gap** | inline, same file | This is the exact "Story Playground looks new but Audio looks old" failure mode named in §34 |
| `/story-playground/[projectId]/story` | A | A | ✅ Done | `StoryScreen` | none |
| `/story-playground/[projectId]/characters` | A | A | ✅ Done | `CastScreen` | none |
| `/story-playground/[projectId]/characters/[characterId]` | A | A | ✅ Done | `CharacterDetailScreen` | none |
| `/story-playground/[projectId]/scenes` | A | A | ✅ Done | `ScenesScreen` | none |
| `/story-playground/[projectId]/scenes/[sceneId]` | A | A | ✅ Done | `SceneDirectorScreen` | none |
| `/story-playground/[projectId]/assets` | A | A | ✅ Done | `AssetsScreen` | none |
| `/story-playground/[projectId]/storybook` | C-variant ("blueprint slate": `#172033`/`#2f80ed`/`#2fbf71`) | A | Not started | custom, 437 lines | Reading view may stay specialized per §13, but chrome should migrate |
| `/storybook/[projectId]` | — | — | N/A | re-exports the route above verbatim | Alias only, not a separate migration target |
| `/story-studio` | C (legacy, uses `Navbar`) | *needs product decision* | Not started | `Navbar` | Likely superseded by Story Playground — confirm before restyling a page that may be dead |
| `/academy` | E ("blueprint slate": `#172033`/`#2f80ed`/`#2fbf71`/`#b13b63`) | A | Not started | custom | |
| `/academy/classes` | E | A | Not started | custom | |
| `/academy/classes/[classId]` | E | A | Not started | custom | |
| `/academy/classes/[classId]/lessons/[lessonId]` | E | A | Not started | custom | Preserve lesson/read behavior |
| `/academy/classes/[classId]/assignments/[assignmentId]` | E | A | Not started | custom | |
| `/academy/submissions/[submissionId]` | E | A | Not started | custom | |
| `/academy/instructor` | E (thin) | A | Not started | 1-line passthrough — check underlying component | |
| `/academy/student` | E (thin) | A | Not started | 1-line passthrough — check underlying component | |
| `/admin` (+ layout) | D (own dark-navy/violet shell: `#050b18` bg, `#a78bfa` accent, already has a real responsive sidebar+drawer shell) | A tokens, keep shell shape | Not started | `AdminLayout` (bespoke, structurally sound) | Token/component swap, not a structural rebuild — see §16 |
| `/admin/users` | D | A tokens | Not started | tables | |
| `/admin/moderation` | D | A tokens | Not started | tables, 397 lines | |
| `/admin/credits` | D | A tokens | Not started | tables, 459 lines | Revenue-adjacent — highest caution |
| `/admin/jobs` | D | A tokens | Not started | tables | |
| `/admin/story-analytics` | D | A tokens | Not started | tables |
| `/admin/prompt-quality` | D | A tokens | Not started | tables, 265 lines | |
| `/admin/character-insights` | D | A tokens | Not started | tables | |
| `/admin/sequence` | D | A tokens | Not started | tables | |
| `/admin/movie-renders` | D | A tokens | Not started | tables | Do not touch renderer/credit logic — display only |
| `/admin/academy` | D | A tokens | Not started | tables | |
| `/admin/revenue` | D | A tokens | Not started | tables, revenue-adjacent — highest caution |
| `/settings` | C | A | Not started | `Navbar` | |
| `/credits` | C | A | Not started | `Navbar` — real Stripe/Paystack checkout entry points | Revenue-adjacent — restyle, do not touch checkout logic |
| `/credits/success` | C | A | Not started | | |
| `/pricing` | C-variant (`#050b18`/`#7c3aed`/`#38bdf8`) | A | Not started | real Stripe/Paystack entry points | Revenue-adjacent |
| `/subscription/success` | C | A | Not started | | |
| `/notifications` | C | A | Not started | `Navbar` | |
| `/analytics` | C | A | Not started | `Navbar`, 326 lines | |
| `/search` | C | A | Not started | `Navbar` | |
| `/generate` | C | A | Not started | `Navbar`, 568 lines | Legacy video-feed creation flow — confirm still in active use before large restyle investment |
| `/upload` | C | A | Not started | `Navbar`, 361 lines | Same caution as `/generate` |
| `/[username]` | C | A | Not started | `Navbar`, 535 lines | Legacy profile page |
| `/v/[id]` | C | A | Not started | `Navbar` | Legacy video detail page |

**Route inventory total: 47 page routes** (+ 2 alias/redirect files, not
counted separately). **9 routes already migrated** (the Story Playground
canonical tree from the prior responsive-reconciliation work). **38 routes
not yet migrated.**

## 2. Legacy UI families

Confirmed by direct inspection (color literals, shared-component imports),
not assumed:

- **A — Nocturne (new handoff system).** `--noc-*` CSS custom properties,
  `.noc-*` utility classes, `Shell`/`Sidebar`/`BottomTabBar`,
  `components/mobile-handoff/*`, `components/mobile/primitives.tsx`. Scope
  today: `/story-playground` and its 8 canonical project-scoped routes only.
- **B — Old Story Playground UI.** Lives *inside* the same
  `story-playground/[projectId]/page.tsx` file as family A, in the original
  ~1780-line render path that still serves the Audio/Sequence/Film/
  Storybook/Insights tabs and the `?legacy=1` escape hatch. This is not a
  separate route to migrate — it's a second visual system embedded in the
  same file as the first, which is exactly why users can currently
  experience "new UI → old UI" without ever leaving one URL.
- **C — Legacy video-feed UI.** The pre-pivot, TikTok-style product:
  `Navbar`, `bg-black`, a violet/blue gradient identity (`#7c3aed` →
  `#2563eb`, accent `#a78bfa`), `#050b18` as a secondary dark surface. Used
  by `/`, auth routes, settings, credits, pricing, notifications, analytics,
  search, generate, upload, `[username]`, `v/[id]`, `story-studio`. This is
  the largest family by route count.
- **D — Admin/utility UI.** Its own dark-navy shell (`#050b18` bg, `#a78bfa`
  accent) — visually a close cousin of family C but with an already-correct
  responsive shell (persistent desktop sidebar, mobile slide-in drawer,
  route-aware active state). Structurally reusable; only tokens/components
  need to change, not the shell shape. `/story-playground/new` also lands
  in this bucket by behavior (dark, Nocturne-adjacent bg) but does *not*
  share admin's component tree — it's its own one-off.
- **E — Academy / Storybook-reading specialized UI.** A third, older
  "blueprint slate" palette (`#172033` bg, `#2f80ed` blue, `#2fbf71` green,
  `#b13b63` accent) distinct from both B and C. Used by all of `/academy/**`
  and by `/story-playground/[projectId]/storybook`.

Five visual systems are live in production today (A–E), not the "seven
unrelated systems" ceiling warned about in the brief, but still four more
than the target of one.

## 3–5. Design system extraction & global shell — plan (not yet built)

What already exists and should be the foundation (not replaced):

- **Tokens**: `--noc-*` in `globals.css` — page/bar/card/hairline/rule
  surfaces, a 6-step text ramp, magenta/purple/blue/cyan accents + tints,
  the brand gradient. Missing tokens the brief asks for that Nocturne
  doesn't yet define: explicit `success`/`warning`/`error` semantic colors
  (family C/D/E all invent their own — `#2fbf71` green and `#e35d5d`/red
  variants appear inconsistently across files) and a named shadow scale.
- **Shell**: `components/layout/Shell.tsx` (`Sidebar` + `BottomTabBar` +
  sticky top bar) is project-workspace-scoped today (takes a `projectId`
  and 5 fixed tabs). It is *not* a general application shell — it has no
  concept of top-level product destinations (Home, Academy, Account) or an
  Admin section. Building the app-wide `AppShell` described in §5 of the
  brief means either generalizing `Shell` or building a second, thinner
  `AppShell` that `Shell` nests inside when a project is open. This is an
  architecture decision, not a styling one, and should be scoped/reviewed
  before building, since the current `Shell` is a shipped, qualified,
  production component with real users.
- **Primitives**: `components/mobile/primitives.tsx` has `Card`,
  `SectionLabel`, `SegRow`, `Pill`, `Accordion`, `EmptyState`, `Skeleton`.
  Missing, per the brief's list: `Button`/`IconButton` as real components
  (today `.noc-btn-primary`/`.noc-btn-outline` are CSS classes applied
  ad hoc, not a component with variants), `Tabs`, `Badge`/`StatusPill`
  (partially covered by `Pill`), `Input`/`Textarea`/`Select`/`Checkbox`/
  `Radio`/`Toggle` (none exist yet — every form in the app hand-rolls its
  own), `Modal`/`Drawer`/`Dropdown`/`Tooltip` (none exist), `Table`/
  `DataList`/`Pagination`/`Breadcrumbs`/`Toast` (none exist — admin pages
  hand-roll tables today).

Building the full primitive set listed in the brief (~30 components) plus
a real `AppShell` is itself a substantial, multi-session engineering effort
before a single non-Story-Playground route can be migrated onto it with
integrity — migrating pages onto placeholder/incomplete primitives would
just create a sixth visual family.

## 6. Root `/` — product decision (RESOLVED)

Per the brief's own instruction ("do not silently redirect `/` merely to
make UI consistency easier... document this as a product decision before
changing behavior"): `/` is confirmed to be the pre-pivot TikTok-style
video-feed product (`Navbar` + `FeedTabs` + `VideoFeed`, full-screen
vertical video, black background, violet/blue gradient identity) — a
different product surface from the story-to-film creator tool this whole
initiative is themed around.

**Decision (user, explicit): `/` stays the video feed. Restyle it onto
Nocturne tokens/components; do not redirect it or replace it with Story
Playground or a new authenticated home.** Restyling `/`'s actual content
is scoped to "3. Legacy feed family" in the route-by-route migration
roadmap below, not this Phase 1 — Phase 1 only needed to know *that* `/`
stays the feed, so the global-navigation work could correctly treat it as
one of the app's permanent top-level destinations rather than a
placeholder pending removal.

## Execution status

Scope for this round, per explicit user direction after the audit above:
**"Foundation first"** — build toward a real shared system, but migrate
only the single highest-value target this round: closing the exact
"Story Playground looks new but Audio looks old" failure mode named in
the brief, rather than a shallow pass across all 47 routes.

### Done this round

**AppShell reconciliation for the project-workspace advanced tabs**
(Audio, Sequence, Film, Storybook, Insights, and the `?legacy=1` escape
hatch). Root cause: `story-playground/[projectId]/page.tsx` renders these
five tabs (and the legacy-escape variants of Overview/Story/Cast/Scenes/
Assets) through the file's own ~1780-line original render path, which
wrapped its output in the *old* video-feed product's `<Navbar />` — a
completely different, wrong-context navigation bar (Home/Search/Upload/
Profile for a TikTok-style feed) — instead of the persistent Nocturne
`Sidebar`/`BottomTabBar` chrome the rest of the project workspace already
uses. This was the actual mechanism behind the "new UI → old UI" jump: a
user browsing Overview/Story/Cast/Scenes/Assets (Nocturne shell, sidebar
present) who then opened Audio from the sidebar's "More" section landed
on a page with a different navbar entirely.

Fix: replaced every `<div className="min-h-screen bg-[#0B0D14] ..."><Navbar
/>...</div>` wrapper in that file (5 call sites — the loading, signed-out,
and error early-returns, plus the main return) with `<Shell backHref=...
title=... activeTab="home" projectId={projectId}>`, matching the exact
pattern `ProjectOverviewScreen` already uses. **Nothing inside the
wrapper changed** — `renderHero()`, `renderAcademyBanner()`, the
Audio/Sequence/Film/Storybook/Insights tab-pill sub-nav, all four
`render*()` function bodies (queries, mutations, state, the character/
scene/asset-preview modals) are byte-for-byte unchanged. This is
deliberately a chrome-only fix: it satisfies "UI ONLY... preserve all
qualified behavior" for Audio/Sequence/Film by construction, since no
line of their actual rendering logic was touched, only the wrapper they
sit inside.

Verified on staging (`raivstream-phase9b2-audio-staging`), real seeded
project, real data, both viewports:

- **1440×900**: Sidebar (256px, Home/Story/Cast/Scenes/Assets + More)
  present and correctly highlighted on Audio, Sequence, and Film tabs.
  Real content confirmed rendering under each (Audio: track types, cue
  inspector, voice profiles, version history; Sequence: shot list; Film:
  Movie Builder / render controls) — same data as before, just inside
  Shell instead of Navbar.
- **390×844**: Bottom tab bar present; on the long-content Sequence tab
  the page correctly scrolls as a whole (the `.noc-shell-main` flex-column
  sticky-footer behavior from the responsive-reconciliation fix holds up
  here too — confirmed `navBottom` moves past the viewport on tall
  content, `overflow: false`).
- **R16** (`?r16=1&tab=audio`): unchanged pre-existing redirect logic
  (`isR16 && tab is sequence/audio/film → setTab('storybook')`) still
  fires correctly; sidebar's "More" section still absent under R16.
- Console: only the same three pre-existing, unrelated errors already
  documented in the responsive-reconciliation doc (R2 CORS on one
  thumbnail, a staging-only CSP-blocked fetch to `app.raivstream.com`,
  and transient 401s from an early unauthenticated probe before login
  completed) — zero new errors.

Typecheck and build clean
(`pnpm --filter @raivstream/web type-check` / `build`). Diff is exactly
one file, 7 insertions / 8 deletions (an import swap and 5 wrapper
replacements) — no backend/schema/migration/renderer/credits/voice files
touched.

### Not done this round (deferred, per the "foundation first" scoping)

- **The ~30-component shared UI library** (§3 of the brief: Button,
  Input, Select, Modal, Table, Toast, etc.) was **not built** this round.
  Reasoning, stated plainly rather than overclaimed: the Audio/Sequence/
  Film/Storybook internals (track lists, cue cards, forms, tables) still
  use the same ad hoc inline Tailwind arbitrary-value markup they used
  before this round — only the outer chrome changed. Building a
  speculative component library with no real consumer yet risks guessing
  wrong at the API shape; the more reliable path is extracting shared
  primitives *as* a page is actually migrated onto them, validated by
  that real usage. This round proved the shell-reconciliation approach
  works; a follow-up round should migrate the *internals* of Audio/
  Sequence/Film/Storybook onto real shared primitives (Button, Badge/
  StatusPill, Input/Textarea/Select, Modal), extracting each primitive
  from its first real caller rather than pre-building the full list.
- All other route families (auth, admin, academy, account/settings,
  legacy feed, `/`, `story-playground/new`) remain unmigrated, exactly as
  inventoried in §1 above. No product decision has been made about `/`.
- The tab-pill sub-navigation inside Audio/Sequence/Film/Storybook/
  Insights was left as-is (not migrated onto a shared `Tabs` component) —
  it already sits correctly inside Shell's own scrollable region and
  works, so changing it further this round would have been scope creep
  beyond the stated fix.

### Production verification

Deployed via the standard `main` push → GitHub Actions pipeline (run
`33298866373`, succeeded in 2m43s). Deployed SHA `b163c2c`, confirmed via
`git rev-parse HEAD` on the VPS. Both health endpoints healthy post-deploy.

Live smoke test starting from `https://app.raivstream.com/` (root),
signing in, then navigating to a disposable smoke project's Audio tab —
using a disposable account + zero-AI-cost project created via direct
Prisma insert (`StoryProject` with no chapters/scenes, to avoid spending
real generation credits on a check that doesn't need real content):
sidebar (256px) present and correctly showing on the Audio tab; real tRPC
calls (`story.getWorkspace`, `story.getAudioPlan`,
`story.listVoiceProfiles`, `story.listAudioVersions`,
`story.trackWorkspaceTab`) all returned `200`; `story:movie_render`
re-confirmed unchanged at exactly 100 credits. The only console errors
present were `ERR_BLOCKED_BY_CLIENT`/`ERR_NAME_NOT_RESOLVED` entries
attributable to the legacy video-feed root page's video sources from
earlier in the same browser tab's session (confirmed via
`read_network_requests` that every actual request made *by* the Audio
page itself returned `200`) — not a regression from this change.
Disposable smoke account and project deleted and verified gone
(`verifiedGone: true`) immediately after.

### Route inventory update

Recount after this round: **10 of 47 routes now on family A (Nocturne)**
— the 9 from the prior responsive-reconciliation release, plus
`story-playground/[projectId]`'s Audio/Sequence/Film/Storybook/Insights
tabs, which now share the Nocturne *shell* (family A navigation chrome)
while their inner content remains family B markup (Nocturne color values,
non-Nocturne component patterns) — a hybrid state, recorded honestly
rather than marked fully migrated. **37 routes still fully unmigrated.**

## Next phase: route-by-route migration

The Foundation Pass unified the application's *navigation chrome* for one
slice of the app; it did not unify the application's *visual language*.
That distinction matters and should not get blurred in a future status
update: a route counts as migrated in this roadmap only when its shell
**and** its internal component-level markup (buttons, inputs, cards,
tables, states) are on the Nocturne system — not when it merely renders
inside `Shell`.

The next phase is the actual route-by-route migration of the 37
remaining routes from §1's inventory, in this order:

1. **Global application shell and top-level navigation.** Settle `/` (a
   product decision, per §6 above, before any restyle or redirect),
   define authenticated Home, and generalize navigation for Account
   access, Academy, and admin entry points alongside the existing
   project-workspace `Shell`. This is the prerequisite everything else in
   this phase nests inside — do it first.
2. **Auth + account/settings.** Sign-in, sign-up, forgot/reset password,
   verification, profile, credits, settings. No auth-logic changes.
3. **Legacy feed family.** `/` (once §1 resolves the product decision),
   search, generate, upload, video detail, and related feed surfaces.
4. **Academy + specialized Storybook views.** Preserve lesson/course and
   read-aloud behavior exactly.
5. **Admin family.** Normalize shell tokens, cards, tables, forms, and
   status states onto Nocturne — the shell shape (sidebar + mobile
   drawer) already confirmed reusable in the Foundation Pass audit, so
   this is a token/component swap, not a structural rebuild. Revenue-
   adjacent pages (`/admin/credits`, `/admin/revenue`) need the most care.
6. **Advanced workspace internals.** Restyle Audio, Sequence, Film, and
   Storybook's actual internal markup (track lists, cue cards, shot
   controls, render/preflight panels, forms) onto shared primitives,
   preserving every piece of qualified behavior exactly — this is where
   the Foundation Pass's shell-only fix gets finished.
7. **Shared primitives, extracted from the real migrations above** —
   Button, IconButton, form fields (Input/Textarea/Select/Checkbox/
   Radio/Toggle), Panel/Card, Table/DataList, Modal/Drawer,
   Badge/StatusPill, Tabs, EmptyState/ErrorState/LoadingState, Toast. Per
   the Foundation Pass's own finding: extract each primitive from its
   first 1–2 real callers as steps 2–6 hit a genuine duplication, rather
   than pre-building a speculative library ahead of any consumer.
8. **Final whole-app visual acceptance** at the full mandated viewport
   set (§22 of the original brief — 360×800 through 1920×1080), mobile
   and desktop, plus the R16 route-level audit (§25) and the acceptance
   matrix (§27) — now actually achievable across the full route set
   rather than one slice of it.

**Completion criterion for this phase**: do not report it complete after
another wrapper-level improvement. It is complete only when the §1 route
inventory matrix reaches something close to **47/47 migrated or
explicitly, individually product-excluded** (not silently skipped) — a
real per-route count, checked against the matrix, not a qualitative
impression that "the app feels more consistent now."

## Phase 1 execution: global shell & top-level navigation

Scoped to the roadmap's own Phase 1 definition: "settle `/`, authenticated
home, sidebar/topbar behavior, account access, Academy, admin entry
points." Root `/` is now settled (§6, resolved — stays the video feed,
content restyle deferred to Phase 3), which retired "authenticated home"
as a separate open question: there is no new unified home page to build,
`/` remains the entry point by decision.

**The real, confirmed gap this phase closed**: navigation between the
app's top-level destinations only worked in one direction. The legacy
`Navbar` (used by `/` and its sibling legacy-feed routes) already links to
Story Playground, Academy, Settings, Credits, and Admin — both in its
desktop center-nav and its avatar dropdown. But `Shell` (used by the
entire Story Playground/project-workspace tree) had **no** links back out
to Home, Academy, Account, or Admin at all — a user inside Story
Playground could only leave via the browser back button or by typing a
URL. This is exactly the kind of "shell not yet unified" gap Phase 1 was
supposed to find and fix.

**Fix**: `components/layout/Shell.tsx` gained a `globalDestinations()`
helper (Home → `/`, Academy → `/academy`, Account → `/settings`, Admin →
`/admin`) with the exact same R16 (Academy + Admin hidden) and role
(`ADMIN`/`MODERATOR` for Admin) gating `Navbar` already uses — not a new
policy, matched to the existing one. Surfaced two ways:

- **Desktop**: a compact icon row next to the brand wordmark at the top
  of the persistent `Sidebar`, always visible alongside the project nav.
- **Mobile**: a new "more destinations" icon button in `Shell`'s sticky
  top app bar opens a bottom-sheet drawer (backdrop-dismissible) listing
  the same destinations with full labels. This is the first real,
  consumer-driven use of a drawer/bottom-sheet pattern in the app — kept
  as a local implementation inside `Shell` rather than extracted to a
  shared `Drawer` component yet, since it has exactly one caller so far;
  per the "extract primitives from real usage" principle, it becomes a
  real shared-primitive candidate once a second caller needs the same
  pattern (a natural fit for Phase 5's Admin mobile drawer, which already
  hand-rolls an equivalent overlay in `AdminLayout`).

**Verified on staging**, real QA account (role `ADMIN`), both viewports:
desktop icon row shows all 4 destinations (Home/Academy/Account/Admin);
under `?r16=1` it correctly drops to 2 (Home/Account only), matching
`Navbar`'s R16 behavior exactly. Mobile drawer opens, shows all 4 links
with correct hrefs, sits as a proper bottom sheet (confirmed via
`getBoundingClientRect` — not the hidden desktop sidebar's copy, which
was a false-positive the first measurement attempt caught and corrected
for), closes on backdrop click, zero horizontal overflow. Typecheck and
build clean. Diff is exactly one file (`Shell.tsx`).

**Not done in this phase** (correctly deferred to their own numbered
steps in the roadmap, not silently skipped): `/`'s actual content restyle
(Phase 3), Auth/Account/Academy/Admin's own internal visual migration
(Phases 2, 4, 5), and extracting the drawer pattern into a shared,
independently-documented `Drawer` component (Phase 7, once a second real
caller exists).

## Final report — Foundation Pass (superseded by "Final report — Phase 1" below)

1. **Starting production SHA**: `9c15238` (last-deployed before this
   initiative)
2. **Candidate SHA**: `b163c2c958d316c5377a9d7e984f6ffd5fedd2e2`
3. **Route inventory total**: 47 page routes (+2 alias/redirect files)
4. **Routes migrated this round**: 0 new full-family migrations; 5
   render-path call sites in 1 route (`story-playground/[projectId]`)
   moved from the legacy `Navbar` to the Nocturne `Shell` for the
   Audio/Sequence/Film/Storybook/Insights tabs — a shell-level fix, not a
   full visual-family migration (their internal markup is unchanged)
5. **Routes intentionally excluded this round**: all 37 other unmigrated
   routes — deferred per the user's explicit "foundation first, highest-
   value target only" scoping decision, not silently skipped
6. **Shared design primitives**: not built this round (see "Not done this
   round" above for the reasoning — no speculative library without a real
   consumer)
7. **Global shell**: not generalized into a top-level `AppShell` this
   round; the existing project-scoped `Shell` was extended to cover the
   advanced workspace tabs it didn't reach before
8. **Root/feed**: unchanged; confirmed to be the pre-pivot video-feed
   product, flagged per the brief's own gate as a product decision, not
   restyled or redirected
9. **Auth**: unchanged (still family C)
10. **Story Playground**: unchanged, already family A from the prior
    release, no regression
11–17. **Overview/Story/Cast/Character/Scenes/Scene Director/Assets**:
    unchanged, already family A, no regression
18. **Audio**: shell reconciled to family A (Nocturne Sidebar/BottomTabBar
    now wraps it); internal markup still family B (unchanged, "UI ONLY,
    preserve all qualified behavior" — satisfied by construction since no
    render-function code was touched)
19. **Sequence**: same as Audio
20. **Film**: same as Audio
21. **Storybook**: the in-workspace tab card (linking out to the
    dedicated reading route) shares the same shell fix; the dedicated
    `/story-playground/[projectId]/storybook` reading route itself is
    unchanged (still family C-variant)
22. **Academy**: unchanged (family E)
23. **Account**: unchanged (family C) — note: `/account` as such doesn't
    exist as a route; `/settings` is the closest equivalent and is
    unchanged
24. **Admin**: unchanged (family D); structurally reusable shell already
    confirmed, tokens not yet swapped
25. **Generate/upload/search/video**: unchanged (family C)
26. **Forms**: unchanged; no shared form-control components built this
    round
27. **Tables**: unchanged; no shared table pattern built this round
28. **Modals**: unchanged; the three existing fixed-overlay modals
    (character edit, scene edit, asset preview) in
    `story-playground/[projectId]/page.tsx` are unaffected by the shell
    swap (they're `position: fixed`, viewport-relative) and were not
    migrated onto a shared `Modal` component
29. **Empty/error/loading states**: the workspace's own loading/signed-
    out/error states now render inside `Shell` instead of a bare
    `Navbar`-wrapped div (more consistent chrome), but their inner
    copy/markup is unchanged
30. **Mobile QA**: done for the migrated slice — `390×844` verified on
    staging (bottom nav present, correct scroll behavior on long content,
    zero overflow) and spot-checked on production
31. **Tablet QA**: not separately re-run this round (no tablet-specific
    layout changed — the fix is chrome-only and inherits the existing
    responsive shell)
32. **Desktop QA**: done — `1440×900` verified on staging (sidebar
    present and correctly highlighted on Audio/Sequence/Film, real
    content unchanged) and re-verified on production via a real click-
    through from a disposable account
33. **R16**: verified — the pre-existing `isR16` tab-redirect logic
    (Audio/Sequence/Film → Storybook) and the sidebar's "More" section
    visibility are both unchanged and confirmed working post-fix, on
    staging
34. **Functional QA**: real tRPC calls confirmed succeeding in production
    for the Audio tab (`getWorkspace`, `getAudioPlan`,
    `listVoiceProfiles`, `listAudioVersions`, `trackWorkspaceTab`, all
    `200`); Sequence and Film content confirmed rendering with real data
    on staging
35. **Console/logs**: zero new errors on staging or production; the only
    errors present are the three pre-existing, already-documented,
    unrelated issues (R2 CORS on one thumbnail, a staging-only CSP
    misconfiguration, and legacy-feed video-source blocks from earlier
    tab history)
36. **Backend/schema audit**: clean — diff is exactly one frontend file
    (`story-playground/[projectId]/page.tsx`, 7 insertions / 8 deletions)
    plus this documentation file; zero backend/schema/migration/renderer/
    worker files touched
37. **Voice exclusion**: untouched; no voice-provider code in scope or
    touched
38. **Movie rate invariant**: confirmed unchanged at exactly 100 credits
    (`story:movie_render`, `creditsPerUnit: 100`) via direct query against
    the production credit-rate table, post-deploy
39. **Production backup**: not taken this round — this release contains
    zero schema/migration changes (frontend-only diff), consistent with
    this session's established policy that a fresh backup is only
    required ahead of releases carrying migrations
40. **Production smoke**: done — see "Production verification" above;
    disposable account/project created, verified, and deleted
    (`verifiedGone: true`)
41. **Known limitations**: (a) 37 of 47 routes remain unmigrated and are
    explicitly deferred, not silently dropped; (b) Audio/Sequence/Film/
    Storybook now share Nocturne's *navigation chrome* but not yet its
    *component-level* visual language — their internal buttons, inputs,
    cards, and tables are still hand-rolled Tailwind-arbitrary-value
    markup, which is why this report does not claim those four tabs are
    "fully migrated"; (c) the ~30-component shared UI library from §3 of
    the brief remains unbuilt; (d) `/` (root) still requires an explicit
    product decision before any UI work can proceed there
42. **Final verdict**: see below

**RAIVSTREAM APPLICATION-WIDE UI RECONCILIATION — PASS WITH LIMITATIONS
(FOUNDATION PASS — SHA `f8ffe55` — NOT THE ENDPOINT)**

This round delivered the audit (full route inventory, UI-family
classification, design-system gap analysis) and one real, verified,
production-deployed fix — closing the specific "Story Playground looks
new but Audio looks old" navigation-chrome failure mode named in the
brief — scoped exactly per the user's explicit "foundation first, highest-
value target" direction. It does not claim, and must not be read as
claiming, that the application-wide reconciliation itself is complete:
37 of 47 routes are unmigrated, no shared component library exists yet,
and `/` still awaits a product decision. The shell is becoming unified;
the application is not yet visually unified. `f8ffe55` is the confirmed
baseline for the next phase — see "Next phase: route-by-route migration"
above for the required order, the extract-primitives-from-real-usage
approach, and the explicit completion criterion (something close to
47/47 migrated or individually product-excluded, not another wrapper-
level improvement reported as done).

## Phase 1b: feed shell restyle (root `/`)

Continuation of Phase 1, per the user's explicit direction: root `/`
decision reconfirmed as **restyle in place, do not redirect or remove**
— `/` stays the legacy feed product, preserved exactly, restyled onto
Nocturne. (Note on continuity: the instruction referenced resuming from
SHA `f2a2062`; the actual current baseline at the time was `9536a4e`
— `f2a2062` predates the Shell global-nav work in "Phase 1 execution"
above, which is real, verified, and already live. Continued from the
current baseline rather than reverting it, since discarding shipped,
verified work would contradict the spirit of "continue Phase 1," and
this round's diff is additive/independent of that work regardless of
which SHA it's read against.)

### Audit: what carries feed behavior vs. what's safe chrome

Before touching any code, read every component the feed actually renders
(`app/page.tsx`, `components/layout/Navbar.tsx`, `components/feed/
FeedTabs.tsx`, `components/feed/VideoFeed.tsx`, `components/feed/
PaywallModal.tsx`, `components/video/VideoCard.tsx`, `components/video/
VideoInteractions.tsx`, `components/video/VideoPlayer.tsx`) to separate
presentation from behavior:

- **Safe chrome (restyled this round)**: `Navbar` (search/notifications/
  upload/avatar-dropdown/sign-in-up — all pure UI wiring to existing
  routes and mutations, no business logic of its own), `FeedTabs` (fully
  controlled by props, zero internal state or data fetching), `VideoFeed`'s
  own wrapper chrome (loading spinner, empty state, fetch-next-page
  spinner, desktop progress dots, the signed-in-FREE sticky banner —
  every one of these is decoration around behavior that lives elsewhere,
  not behavior itself), `PaywallModal` (a fully prop-driven modal, three
  `router.push` calls, no mutations or queries), and the root `page.tsx`'s
  own loading spinner and signed-out join-CTA overlay.
- **Real behavior, explicitly NOT touched this round**: `VideoFeed`'s
  actual feed logic (the four `trpc.feed.*` infinite queries, guest
  episode tracking via `sessionStorage`, the server-side FREE-tier
  episode gate, scroll/wheel/keyboard navigation, prefetching); all of
  `VideoCard` (view/progress tracking mutations, HLS/MP4/image branching,
  image-autoscroll timers, the premium-lock gate) *except* its one static
  subscribe button (a plain `router.push`, zero data dependency — restyled
  as the one safe exception); and all of `VideoInteractions` (211 lines of
  real optimistic like/dislike/star-rating/follow mutations) and
  `VideoPlayer` (209 lines, not even opened this round — the risk of
  restyling a raw `<video>` playback component without a dedicated audit
  outweighs the benefit of a color pass this round).

This matches the user's own instruction — shell/chrome first, then
cards/search/nav surfaces, not a wholesale rewrite — with one deliberate
boundary drawn tighter than "feed cards" might suggest: a full-screen
video overlay's *own* interaction buttons are closer to behavior than
chrome (they're real mutation-wired controls, not decoration), so
`VideoInteractions` and `VideoPlayer` are flagged as their own follow-up
rather than folded into this pass.

### What changed

Six files, all color/token substitutions only (`#7c3aed`/`#2563eb` →
`var(--noc-gradient)`, `#a78bfa`/violet accents → `var(--noc-purple)`/
`var(--noc-lavender-tint)`, `#050b18`/black-with-opacity surfaces →
`var(--noc-bar)`/`var(--noc-bar-alpha)`/`var(--noc-card)`, white-with-
opacity text → the `--noc-t*` ramp, `#34d399` R16 accent →
`var(--noc-cyan)`): `Navbar.tsx`, `FeedTabs.tsx`, `VideoFeed.tsx`,
`PaywallModal.tsx`, `app/page.tsx`, and the one isolated spot in
`VideoCard.tsx`. Zero lines of query/mutation/state/effect logic changed
in any of them — every `useEffect`, `useState`, `trpc.*` call, event
handler, and conditional render branch is byte-identical to before.

One precedence issue caught and fixed inline (same class of bug as the
earlier responsive-reconciliation work): several `hover:` states
(notification bell, avatar ring, dropdown items, sign-in link) initially
got their base color via inline `style`, which — as established earlier
— silently defeats a `hover:` class on the same property. Fixed by moving
those specific colors to Tailwind arbitrary-value classes
(`text-[var(--noc-t5)] hover:text-[var(--noc-t1)]`) instead of inline
`style`, so the hover states actually work.

### Verified on staging, real QA account (`ADMIN` role, both signed-in and
signed-out), both viewports

- **1440×900**: logo accent computed to `rgb(178, 90, 217)` (`--noc-
  purple`), sign-up/generate CTA gradients computed to the exact 3-stop
  `--noc-gradient`, confirming the token swap took effect (not just
  present in source). Avatar dropdown opens and lists the same items as
  before (Profile/Story Playground/Academy/Upload/Analytics/Advanced
  Story Studio/AI Studio/Credits/Settings/Admin — Admin present because
  the QA account is `ADMIN`-role, matching existing gating). Search input,
  notification bell, and FeedTabs switching all functional.
- **390×844**, `?r16=1`: logo reads "R16 Kids", tab reads "Kids Feed"
  (both correctly gated), desktop center-nav correctly hidden, "Kids"
  accent computed to `rgb(79, 214, 232)` (`--noc-cyan`), zero horizontal
  overflow.
- Console: only the same pre-existing, already-documented, unrelated
  errors (R2 CORS, staging CSP misconfiguration, stale 401s) — zero new
  errors from this round's changes.

Typecheck clean; build clean (one retry needed due to the known,
previously-documented transient `next/font/google` fetch flake — resolved
immediately on retry with no code changes, consistent with every prior
occurrence this session). Diff is exactly 6 frontend files, all
presentation-only — zero backend/schema/migration/renderer/credits/
voice/provider files touched, satisfying the round's stated boundaries
in full.

### Explicitly deferred from this round

`VideoInteractions.tsx` and `VideoPlayer.tsx` (like/dislike/follow/star-
rating mutation UI and the raw video-playback component) — flagged
above as carrying real behavior dense enough to warrant their own
dedicated audit rather than folding into a chrome pass. This is the
correct continuation of "migrate shell/chrome first, followed by feed
cards/search/navigation surfaces" — the *cards*' presentational shell
(the overlays, title/creator/tags block, premium-lock CTA in `VideoCard`)
is done; the cards' *interaction controls* are the next slice, not yet
started.

## Final report — Phase 1

1. **Starting production SHA**: `f8ffe55` (Foundation Pass baseline)
2. **Candidate SHA**: `9536a4e10f9a13b2c03be2bed1b0fa8f1ed680e8` (short:
   `9536a4e`) — deployed via the standard `main` push → GitHub Actions
   pipeline (run `33303046322`, succeeded in 2m36s), confirmed live via
   `git rev-parse HEAD` on the VPS and `/api/health` (both `app.` and
   `r16.` subdomains healthy)
3. **Route inventory total**: 47 page routes (+2 alias/redirect files) —
   unchanged, no new routes added or removed
4. **Routes migrated this round**: 0 additional routes reach full
   family-A status (shell + internals). This round's work is
   cross-cutting navigation topology, not a per-route visual migration —
   it makes *every* route in the Story Playground tree able to navigate
   out to Home/Academy/Account/Admin, which the route matrix doesn't
   capture as a single countable "route migrated" line item. Recorded
   honestly rather than inflating the 10/47 count.
5. **Routes intentionally excluded this round**: all 37 unmigrated routes
   from §1, unchanged — this round touched shell/navigation code only
6. **Shared design primitives**: still none formally extracted; the
   mobile bottom-sheet drawer built this round is a real, working, first
   use of that pattern, kept local to `Shell.tsx` pending a second caller
7. **Global shell**: **this round's actual deliverable** — `Shell` now
   carries global top-level destination links (desktop icon row +
   mobile drawer), closing the one-directional-navigation gap; see
   "Phase 1 execution" above for the full account
8. **Root/feed**: product decision resolved (`/` stays the feed); no
   content restyle performed (deferred to Phase 3, per the roadmap)
9–24. **Auth/Story Playground/Overview through Admin**: unchanged from
   the Foundation Pass report above; no regressions introduced by this
   round's `Shell.tsx` change (verified — the project-scoped nav, R16
   gating, and every existing Sidebar/BottomTabBar behavior are byte-
   identical except for the new destination row/drawer being added)
25. **Generate/upload/search/video**: unchanged
26. **Forms**: unchanged
27. **Tables**: unchanged
28. **Modals**: unchanged; the new mobile drawer is a distinct pattern
    (bottom sheet, not a centered dialog) from the existing fixed-overlay
    modals in the project-workspace page, not a consolidation of them
29. **Empty/error/loading states**: unchanged
30. **Mobile QA**: done — `390×844` on staging, drawer opens/closes
    correctly, correct destination set, zero overflow
31. **Tablet QA**: not separately re-run (no tablet-specific behavior
    changed by this round)
32. **Desktop QA**: done — `1440×900` on staging, icon row present with
    correct hrefs and title/aria-labels
33. **R16**: verified — desktop icon row and mobile drawer both correctly
    drop to Home/Account only under `?r16=1`, matching `Navbar`'s
    existing R16 gating exactly (not a new policy)
34. **Functional QA**: real navigation confirmed via actual DOM
    measurement of link hrefs and rendered positions (not merely that
    the code compiles) on staging
35. **Console/logs**: zero new errors on staging; only the same three
    pre-existing, already-documented, unrelated issues present
36. **Backend/schema audit**: clean — diff is exactly one frontend file
    (`components/layout/Shell.tsx`); zero backend/schema/migration/
    renderer/worker files touched
37. **Voice exclusion**: untouched; not in scope
38. **Movie rate invariant**: not re-checked this round (no code path
    anywhere near credits/rendering was touched — re-verifying an
    invariant that provably cannot have changed would be theater, not
    verification; last confirmed at exactly 100 credits in the Foundation
    Pass round immediately prior)
39. **Production backup**: not taken — zero schema/migration changes
40. **Production smoke**: done — live at `https://app.raivstream.com/`,
    a disposable non-admin (`VIEWER` role) account confirmed the desktop
    icon row shows exactly Home/Academy/Account (Admin correctly absent
    for a non-admin user — the complementary case to the `ADMIN`-role
    account already verified on staging), zero horizontal overflow, and
    every real network request the page made (`story.listMyProjects`,
    `story.getWorkspace`, `analytics.trackStoryEvent`, etc.) returned
    `200`. Disposable account deleted and verified gone
    (`verifiedGone: true`) immediately after.
41. **Known limitations**: (a) the drawer pattern isn't yet a shared,
    documented component — it has one caller; (b) global destination
    links use `title`/`aria-label` for accessibility on the icon-only
    desktop row but have not been through a full keyboard-navigation
    audit (tab order, focus rings) — flagged for Phase 8's final
    acceptance pass, not silently assumed fine; (c) all limitations
    carried over from the Foundation Pass report remain unchanged
42. **Final verdict**: see below

**RAIVSTREAM APPLICATION-WIDE UI RECONCILIATION — PASS WITH LIMITATIONS
(PHASE 1 OF 8 — ROUTE-BY-ROUTE MIGRATION ROADMAP — SHA `9536a4e` — NOT
THE ENDPOINT)**

Phase 1's actual objective — a unified global shell/top-level navigation
— is delivered and verified live: a user anywhere in the Story Playground
workspace can now reach Home, Academy, Account, and (if authorized) Admin
directly, closing the one-directional-navigation gap confirmed at the
start of this round. Verified with both an `ADMIN`-role account (staging)
and a plain `VIEWER`-role account (production), correct R16 gating,
zero regressions to existing project-scoped navigation, zero new console
errors, zero backend/schema changes. `9536a4e` is now the baseline for
Phase 2 (Auth + account/settings). The route-migration count remains
0/47 net-new by this round's own honest accounting (§4 above) — this
round's contribution is cross-cutting infrastructure, not a countable
route migration, and should be read as exactly that rather than progress
toward the 47/47 completion criterion.
