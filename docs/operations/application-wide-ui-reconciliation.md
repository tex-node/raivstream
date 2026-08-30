# Application-Wide UI Reconciliation

Status: **AUDIT PHASE COMPLETE — page-by-page migration not yet started.**
This document is the live route inventory and design-system plan for the
"RAIVSTREAM — APPLICATION-WIDE UI SYSTEM RECONCILIATION" initiative. It is
being built incrementally; see "Execution status" at the bottom for what has
actually shipped vs. what is inventoried/planned only.

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

## 6. Root `/` — product decision required

Per the brief's own instruction ("do not silently redirect `/` merely to
make UI consistency easier... document this as a product decision before
changing behavior"): `/` is confirmed to be the pre-pivot TikTok-style
video-feed product (`Navbar` + `FeedTabs` + `VideoFeed`, full-screen
vertical video, black background, violet/blue gradient identity) — a
different product surface from the story-to-film creator tool this whole
initiative is themed around. This was already flagged as out of scope in
the prior responsive-reconciliation release, with the user's explicit
agreement that changing `/` is "a separate product/navigation decision."
**No action taken on `/` in this phase; flagged here per the brief's own
gate, not decided unilaterally.**

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

### Route inventory update

Recount after this round: **10 of 47 routes now on family A (Nocturne)**
— the 9 from the prior responsive-reconciliation release, plus
`story-playground/[projectId]`'s Audio/Sequence/Film/Storybook/Insights
tabs, which now share the Nocturne *shell* (family A navigation chrome)
while their inner content remains family B markup (Nocturne color values,
non-Nocturne component patterns) — a hybrid state, recorded honestly
rather than marked fully migrated. **37 routes still fully unmigrated.**
