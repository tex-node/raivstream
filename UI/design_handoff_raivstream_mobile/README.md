# Handoff: Raivstream mobile (creator app) + full desktop prototype

## Overview
Raivstream turns a written story into a film. This package covers the **new mobile UI for the Raivstream creator app** (8 screens, previously desktop-only), plus the existing desktop prototype and the R16 reader app it links to, so the mobile work lands consistently with everything around it.

Data model the UI assumes (already in the codebase): `StoryProject → chapters → sceneSeeds → assets`, plus a Character Bible per project.

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes showing intended look and behavior. They are **not production code to copy**. The task is to **recreate these designs in the app's existing environment** (React/Next, whatever the repo uses) with its established component library, routing, and state patterns. If no UI environment exists yet, pick the framework that fits the project and implement there.

`Raivstream Redesign.dc.html` is a single-file prototype: markup in one template, state in one class at the bottom of the file (`class Component`). Read the class first — it holds all screen state, mock data, and the interaction logic.

## Fidelity
**High fidelity.** Colors, type sizes, radii, spacing, and copy are final. Recreate pixel-accurately, substituting the codebase's own primitives (Button, Card, Tabs, Sheet) where they can hit these values. Layout is dark-mode only.

---

## Mobile screens (the new work)

Frame: **390 × 844** (iPhone 14/15 class). Structure of every mobile screen, top to bottom:

1. **Status bar** — 15px 26px 6px padding, 12.5px/600 text.
2. **Contextual app bar** — 8px 18px 12px, bottom border `rgba(233,233,237,.07)`. Optional 36×36 back button (radius 10, bg `rgba(233,233,237,.05)`), title 15.5px/600, subtitle 11.5px `#75798c`, right-aligned "Saved" pill (11px, `rgba(79,214,232,.1)` bg, `#8fdfe8` text, 5px cyan dot).
3. **Scroll region** — `flex:1; overflow-y:auto`, scrollbar hidden.
4. **Contextual action bar** — Scene Director only. 12px 18px, top border, bg `rgba(7,8,16,.92)`. Full-width primary CTA, min-height 50, radius 14, 15.5px/600, `#0B0D14` text on `linear-gradient(90deg,#d946a8,#b25ad9,#4f8bd6)`.
5. **Bottom tab bar** — 5 tabs (Home, Story, Cast, Scenes, Assets). 9px 6px 24px, top border, bg `rgba(7,8,16,.92)`. Each tab: min 56×48 tap target, 16px glyph over 10.5px/500 label. Active `#f0a3d4`, inactive `#75798c`. Home tab stays active on Project Overview; Cast on Character detail; Scenes on Scene Director.

Icons in the prototype are text glyphs (`⌂ ✎ ☺ ▦ ✦`) — **replace with Phosphor icons** (Nocturne's icon set): House, PencilSimple, SmileyWink/UsersThree, SquaresFour, Sparkle.

### 1. Home (`m: 'home'`)
- H1 25px/500, `letter-spacing:-.02em`, line-height 1.2 — "What are we making today?"
- Sub 13.5px `#75798c` — "Good evening, Ada. Two projects are waiting."
- **Continue cards** (2): row, 12px padding, radius 16, bg `rgba(233,233,237,.04)`, 1px border `rgba(233,233,237,.08)`. 64×64 thumb radius 12 + title 15.5px/500 (ellipsised) + meta 11.5px `#75798c` + 3px progress bar (`linear-gradient(90deg,#d946a8,#4f8bd6)`). Pressed: bg `rgba(178,90,217,.12)`. Tap → Project Overview.
- **Starters**: 2×2 grid, gap 9, each min-height 86, radius 14, icon 17px `#b5abfc` top, label 13.5px/500 bottom. Pressed: border `rgba(178,90,217,.5)`. Copy: Create a Story / Create an Advert / Create a Short Film / Start from an Idea.
- **Latest**: 5 rows, 11px vertical padding, 1px bottom rule `rgba(233,233,237,.06)`; 6px status dot, 13.5px text, 11.5px `#75798c` timestamp.

### 2. Project Overview (`m: 'overview'`)
- 186px hero: `radial-gradient(80% 90% at 25% 20%,#5b2f6b,transparent 62%), radial-gradient(70% 80% at 85% 80%,#1f4a6b,transparent 60%), linear-gradient(165deg,#141626,#0b0c14)`, bottom-anchored caption over `linear-gradient(180deg,transparent,rgba(7,8,16,.88))`. Kicker 10.5px/.12em uppercase `#f0a3d4`; H1 24px/500.
- Primary CTA "Continue Scene 03" → Scene Director (full width, min-height 50, radius 14, gradient fill).
- 5 stat rows (Story / Characters / Scenes / Assets / Sequence): label 13.5px, value 14px/500, note 11.5px in a per-row color (`#f0a3d4` warning, `#8fdfe8` good, `#9397ab` neutral).
- Two outline buttons (Story, Characters), 1fr 1fr, min-height 46, radius 12, border `rgba(233,233,237,.12)`.

### 3. Story (`m: 'story'`)
- Kicker "Chapter 1 · The gate", H1 24px/500, hint 12.5px `#75798c` — "Tap any paragraph to direct it."
- Body paragraphs: **17px, line-height 1.72**, `#e9e9ed`, 11px 12px padding, radius 12, `text-wrap:pretty`.
- Tapping paragraph 1 or 2 toggles selection (bg `rgba(178,90,217,.12)`) and reveals a wrapping row of AI action chips below it: 9px 13px, radius 999, 12.5px, bg `rgba(178,90,217,.14)`, border `rgba(178,90,217,.32)`. Actions: Develop this idea / Strengthen conflict / Explore another ending / Make this funnier / Increase tension. Only one paragraph selected at a time.
- **Story health** card: radius 16, bg `rgba(233,233,237,.04)`, 4 labelled 3px bars (Premise 92%, Character clarity 78%, Conflict 54%, Ending 38%).

### 4. Characters (`m: 'cast'`)
- 4 rows: 56px circular avatar, name 15.5px/500 + role 10.5px uppercase `#75798c`, line 12.5px `#9397ab`. Radius 16 card, pressed border `rgba(178,90,217,.5)`. Tap → Character detail.
- Footer: dashed "+ Add a character", min-height 48, border `1px dashed rgba(233,233,237,.16)`.

### 5. Character detail (`m: 'char'`)
- Header: 84px avatar + name 21px/500 + "Lead · appears in all 6 scenes" 12.5px `#75798c`.
- **7 accordion sections** (progressive disclosure): Appearance, Personality, Motivation & goal, Fear, Relationships, Movement style, Evolution / arc. Header row min-height 48 with label 14px/500 + hint 11.5px `#75798c` + `+`/`−` affordance. Open body: 14px/1.62 `#cfd3e5` paragraph + 11.5px chips (`rgba(233,233,237,.06)`, radius 999). Appearance open by default; sections toggle independently (state per key).

### 6. Scenes (`m: 'scenes'`)
- 6 vertical cards, gap 12, radius 18. 16:9 gradient still on top; body 14px padding with `01`-style number (11px, .1em), title 14.5px/500 uppercase, status pill top-right, action line 13.5px `#9397ab`, cast chips + right-aligned CTA text `#b5abfc` ("Regenerate →" / "Direct →" / "Generate →").
- Status colors: Ready `rgba(79,214,232,.14)` / `#8fdfe8`; Generating `rgba(217,70,168,.16)` / `#f0a3d4`; Draft `rgba(233,233,237,.08)` / `#b2b6ca`; Empty `rgba(233,233,237,.05)` / `#75798c`. The active scene (03) gets border `#b25ad9`; others `rgba(233,233,237,.08)`.

### 7. Scene Director (`m: 'scene'`) — the interaction-heavy screen
- 16:10 preview at top. During generation: overlay `rgba(11,13,20,.72)` with status label 14px and a 62%-wide 4px progress bar (`linear-gradient(90deg,#d946a8,#4fd6e8)`, `transition: width 400ms`). On review: "New picture" badge top-left (`rgba(217,70,168,.9)` bg, `#0B0D14` text).
- Scene heading: `03` + `SCHOOL GATE`.
- **Review card** (review state only): bg `rgba(178,90,217,.1)`, border `rgba(178,90,217,.32)`, radius 16, copy "Continuity checked against Max and the gate. Keep this one?", then **Keep** (gradient) and **Improve** (outline) buttons, min-height 44.
- **Control groups** — 5 groups, each a .1em uppercase 11px label over stacked controls. Each control: 12.5px `#b2b6ca` label + a horizontally scrollable row of segmented options (min-height 40, radius 11, 13px/500). Selected: bg `rgba(178,90,217,.2)`, fg `#F7F8FC`, border `rgba(178,90,217,.5)`. Unselected: transparent, `#9397ab`, border `rgba(233,233,237,.11)`.
  - Performance: Emotion (Nervous/Hopeful/Bold), Character behaviour (Hesitant/Eager/Still), Energy (Low/Medium/High)
  - Camera: Shot size (Wide/Medium/Close), Angle (Low/Eye/High), Movement (Static/Push in/Track)
  - Environment: Time of day (Morning/Midday/Dusk), Weather (Clear/Overcast/Rain), Mood (Hopeful/Tense/Warm)
  - Lighting: Light (Soft/Dramatic/Warm/Cool/Natural)
  - Pace (Still/Gentle/Energetic/Fast)
- Sticky bottom CTA label follows state: `Generate picture` → `Creating…` → `Try again`.

### 8. Assets (`m: 'assets'`)
- Horizontally scrollable filter chips (All 34 / Chosen 6 / Scenes / Characters), 9px 14px, radius 999; active = accent-tinted.
- 2-column grid, gap 10, radius 14 tiles. 4:3 image, optional corner tag (STORYBOOK `rgba(217,70,168,.85)` / SEQUENCE `rgba(79,214,232,.85)`, 9.5px/600, radius 5), heart top-right (`#f0a3d4` when favourited, else `rgba(247,248,252,.45)`), then title 12.5px/500 (ellipsised) + meta 11px `#75798c`. Tagged tiles get border `rgba(178,90,217,.4)`.

### Prototype-only chrome (do not ship)
The top bar above the phone (brand + Desktop/Mobile/R16 switch) and the "Jump to a mobile screen" chip rail below it exist so reviewers can navigate the prototype. They are not product UI.

---

## Interactions & Behavior
- **Tab navigation** sets the mobile screen; deep screens (Character detail, Scene Director, Project Overview) show a back affordance rather than a tab.
- **Generate picture** is a real state machine, 3.9s total. Timeline: `0ms "Preparing your scene…" 12%` → `900ms "Creating the image…" 46%` → `2100ms "Checking continuity…" 78%` → `3100ms "Almost ready…" 94%` → `3900ms` review at 100%. Progress bar animates `width 400ms`. Wire this to the real generation job's status events; the labels are the intended user-facing copy.
- **Keep** clears generation state and returns to Scenes. **Improve** / **Try again** restarts the same run.
- **Story paragraph tap** toggles a single selected paragraph and reveals contextual AI actions (chips are display-only in the prototype; they should dispatch the corresponding rewrite request).
- **Accordions** toggle independently and persist while on the screen.
- Every control selection is immediate and local — no save button; the header shows a persistent "Saved" state.
- Hover states are desktop-only; on mobile use the pressed states noted per component (accent-tinted bg or accent border).

## State Management
From the prototype's `Component` class — mirror this shape:
- `product`: `'rs' | 'rsm' | 'r16'` — prototype-only view switch; in the real app these are separate apps/routes.
- `m`: `'home' | 'overview' | 'story' | 'cast' | 'char' | 'scenes' | 'scene' | 'assets'` — mobile route.
- `picks`: `Record<controlLabel, optionLabel>` — Scene Director selections; persist per `sceneSeed`.
- `gen`: `'idle' | 'running' | 'review'`, plus `pct` (string %) and `genLabel` (status copy).
- `open`: `Record<sectionKey, boolean>` — Character detail accordions (UI-only).
- `sel`: `'p1' | 'p2' | null` — selected story paragraph (UI-only).
- `page`: 1–6 — R16 reader position.
Data fetching: project list, one project with chapters + sceneSeeds + cast, asset list per project, and a generation job with streaming status.

## Design Tokens
Nocturne (bundled as `nocturne-styles.css`) is the source of truth; the prototype's literals map to it as follows.

Surfaces: page `#0B0D14`; sidebar/bars `#070810` / `rgba(7,8,16,.92)`; card fill `rgba(233,233,237,.04)`; hairline `rgba(233,233,237,.08)`; soft rule `rgba(233,233,237,.06)`.
Text: primary `#F7F8FC`; body `#e9e9ed`; secondary `#cfd3e5`; muted `#9397ab` / `#b2b6ca`; faint `#75798c`.
Accents: magenta `#d946a8`, purple `#b25ad9`, blue `#4f8bd6`, cyan `#4fd6e8`; tints `#f0a3d4`, `#b5abfc`, `#8fdfe8`, `#e7e5fe`.
Signature gradient (primary actions, progress, active markers only — never as a background flood): `linear-gradient(90deg,#d946a8,#b25ad9,#4f8bd6)` (4-stop variant adds `#4fd6e8`).
Type: Inter. Mobile scale 10.5 / 11 / 11.5 / 12.5 / 13.5 / 14 / 15.5 / 17 / 21 / 24 / 25px. Headings weight 500, labels 600, body 400. Tight headings `letter-spacing:-.02em`; uppercase kickers `.1em`–`.14em`.
Radii: 5, 10, 11, 12, 14, 16, 18, 999. Phone frame 44.
Spacing: 6 / 7 / 9 / 10 / 12 / 14 / 16 / 18 / 20 / 24 / 26px.
Tap targets: never below 44px (tabs 48, primary CTAs 50).
Elevation: `0 0 0 1px rgba(233,233,237,.14), 0 34px 80px rgba(0,0,0,.65)` (phone frame only); elsewhere elevation is a 1px edge, not a shadow.

## Assets
No bitmaps. Every image is a placeholder built from layered radial + linear gradients (see the `IMG` map at the top of the logic script) — swap for real generated stills. Icons: Phosphor. `raivstream-logo.jpg` in the project root is the brand mark.

## Files
- `Raivstream Redesign.dc.html` — the whole prototype: RS desktop, **RS mobile (new)**, R16 desktop + mobile, journey map. Mobile branch is the block marked `RAIVSTREAM MOBILE`; all logic and mock data are in the script at the end.
- `support.js` — prototype runtime only. Do not port.
- `nocturne-styles.css` — the Nocturne design-system token sheet + component layer.


## Screenshots
`screenshots/` — captured from the prototype. Mobile shots show the whole 390×844 frame; desktop shots are the top of each view (scroll the prototype for the rest).

Mobile (the new work):
- 01-mobile — Home
- 02-mobile — Project Overview
- 03-mobile — Story (paragraph AI actions)
- 04-mobile — Characters
- 05-mobile — Character detail (accordions)
- 06-mobile — Scenes
- 07-mobile — Scene Director, idle
- 08-mobile — Scene Director, generating (progress + status copy)
- 09-mobile — Scene Director, review (Keep / Improve)
- 10-mobile — Assets

Desktop (existing, for reference):
- 01/02-desktop — Home
- 03-desktop — Projects
- 04-desktop — Journey map
- 05-desktop — Project Overview
- 06-desktop — Story Workspace
- 07-desktop — Character Director
- 08-desktop — Scenes
- 09-desktop — Asset Manager
- 10-desktop — Journey map
- 11/12/13-desktop — Scene Director (review, generating)
- 01/02-14-desktop-scene-director-idle — Scene Director, idle state
