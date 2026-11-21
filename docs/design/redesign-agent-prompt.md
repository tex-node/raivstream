# Redesign prompt — Raivstream UI/UX

**Paste-ready brief for a redesign agent.** Companion to `docs/design/ui-ux-brief.md` (inventory + constraints) and the six decisions recorded there on 2026-11-21. Read that file first; this prompt says what to build and in what order.

---

## Your task

Redesign the Raivstream UI/UX in the existing Next.js 15 App Router codebase (`apps/web`) and the Expo app (`apps/mobile`), preserving every route, every server-side gate, and the kids product (R16). You are changing **how the product looks and navigates**, not what it enforces. All data comes from tRPC; no new REST endpoints for UI data.

Work in reviewable increments: one branch per phase, gates green at every commit, no phase left half-wired.

---

## The product spine: Homer first (2026-11-21, operator direction)

**The app revolves around Homer.** The home surface is not a dashboard, a nav grid, or a feed — it is one question:

> **"What are you thinking?"**

The creator answers in their own words. Homer classifies the answer and offers **a few buttons** — the smallest set that fits what they said — leading into one of four paths:

| Path | What Homer offers | Lands in |
|---|---|---|
| **Ad** | a short, single-idea spot | the beat composer (hook → benefit → CTA) |
| **Commercial** | a produced spot with scenes | plan → produce → assemble |
| **Film** | a multi-scene story with a cast | project → plan → scenes → film |
| **Writing** | story text, chapters, storybook | Story Playground |

**Rules for this spine:**

- **One input, then a small choice.** After the answer, show **2–4 buttons**, never a menu of every capability. The product's job is to choose, not to make the creator choose.
- **The four paths are the same four objects the backend already models.** Ad and commercial are both `projectType === 'COMMERCIAL'` (ad = one beat set, no scenes; commercial = scenes). Film and writing are the story/film paths. Do not invent a fifth type.
- **Homer's question is the front door**, so the five-destination nav demotes to a utility: a slim bar for Watch, Projects, Library, Account — never the five-destination menu as the primary way to start work.
- **Provenance applies to the routing too.** When Homer decides "this sounds like a film", that is `HOMER_INFERENCE` and must be visible as a proposal the creator can override with one tap ("No — an ad").
- **No dead end.** After the classification, the creator can always type again instead of answering; the composer/flow opens *from* an answer, never as a form that ignores it.

**Acceptance for the spine:** a first-time signed-in creator lands on "What are you thinking?", types one sentence, sees at most four suggested paths with the chosen one marked as Homer's read, taps one, and reaches a flow pre-filled with their sentence. Two taps from idea to work.

---

## The seven decisions you implement (do not re-open)

1. **Story Studio stays as "Advanced".** `Story Playground` is the default story path; `/story-studio` remains reachable and labelled Advanced. The label must do real work: denser UI is acceptable there, but it is never offered as a starting point.
2. **The ad composer is the default Create path for commercial projects.** `projectType === 'COMMERCIAL'` becomes a fork in Create, opening a beat composer (hook → benefit → CTA), not the generic film flow.
3. **Homer gains a decision timeline over time.** Every creative decision with its provenance, when it was made, and what it superseded. Current-state-only is not sufficient.
4. **Academy gets a mobile screen.** Consumption and submission only — class list, lesson, assignment, submit.
5. **Admin stays a dense internal tool.** Group the 17 items (Money / Content / Renders / People), tighten tables, do not product-style it.
6. **One visual language** across feed and studio. The existing `var(--noc-*)` tokens are the single source. A second token set fails this requirement even if it looks better.
7. **Homer is the front door.** Home is "What are you thinking?", the answer routes to **Ad / Commercial / Film / Writing** as a few buttons, and the nav demotes to a utility. This outranks the previous five-destination prominence: the destinations still exist, but they are no longer how work begins.

### Order matters because of one dependency

**Surface the commercial readability gate before making the composer the default path.** Today `commercialGraphicVerdict` (in `packages/api/src/lib/creative/output/graphicPlan.ts`) returns the exact creator-facing sentences — text that will clip, on screen too briefly, overlapping another line, cannot fit at a readable size — and the publish gate is **opt-in behind `CREATIVE_GRAPHIC_GATE`**, with no UI. If the composer ships first, a creator writes three beats, hits publish, and learns the rules only from a refusal. Build the inline surface first; flip the default second.

---

## Phases (each shippable on its own)

### Phase 1 — Token set and component language (answers #6)

- One token file for colour, type scale, spacing, radius, motion, elevation, focus ring. Every existing `var(--noc-*)` maps into it; no component keeps a raw hex.
- Primitives: `Button` (primary/secondary/ghost/danger + loading), `Field` + `FieldMessage` (hint / warning / blocking, one shape), `Panel`, `Sheet`, `Dialog`, `Tabs`, `Chip` (used by provenance and by gates), `Table` (dense variant for admin), `EmptyState`, `Skeleton`.
- **Gate message component**: one component renders every blocking sentence in the product. It must accept `{ severity, message, action? }` and be usable inline (under a field) and at page level.
- Acceptance: a screenshot of the feed, a project page and an admin table share type scale and spacing rhythm; no raw hex remains in changed files.

### Phase 2 — Navigation and the Create fork (answers #1, #2)

- Keep the five destinations (Watch / Create / Learn / Films / Account) and R16's two. Do not re-flatten.
- Create becomes a real fork: **New film**, **New commercial** (beat composer), **Story**, **AI Studio**, **Director**, **Avatar**, **Upload**, **Advanced story studio** (labelled Advanced, visually subordinate).
- Move the platform decision into the fork page (`/create`): two large choices — *a film* or *a commercial* — then the appropriate flow. Do not add a type dropdown later in the flow.
- Acceptance: `/create` offers film vs commercial; choosing commercial lands in the beat composer; Story Studio is visibly "Advanced".

### Phase 3 — Commercial beat composer with inline gates (the dependency)

- Three beats on a phone frame: **hook → benefit → CTA**, in funnel order, with the order enforced in the UI (not just the server).
- Inline, before submit: the exact `graphicIssues` sentences, via the tRPC query you add (`creative.commercial.textIssues({ hook, benefit, cta, durationSeconds })`) — **do not reimplement the rules client-side**; a second copy of a gate is how gates disagree with themselves.
- Show the **cost** of producing before the click (credits, from server data).
- The CTA of the composer is "Produce", disabled while a blocking issue exists, with the reason visible — not a toast.
- Acceptance: typing a 60-character hook shows a blocking message immediately and the Produce button names why it is disabled; shortening it clears the block without a page reload.

### Phase 4 — Homer decision timeline (answers #3)

- Vertical timeline: each decision with provenance chip (`USER_EXPLICIT` / `USER_APPROVED` / `HOMER_INFERENCE` / `HOMER_PROPOSAL`), timestamp, and **what it superseded**.
- Filters by provenance; the four must be visually distinguishable at a glance, never colour-only (chip text + icon + shape).
- The current state stays visible beside the timeline — the timeline is history, not replacement.
- Acceptance: a decision approved later shows its proposal earlier; filtering to `HOMER_PROPOSAL` hides approved history but leaves the record reachable.

### Phase 5 — Academy on mobile (answers #4)

- Expo screens: class list, lesson reader, assignment, submission. Consumption + submission only, no authoring.
- Inherit Phase 1 tokens; do not invent a mobile-only palette.
- Acceptance: a signed-in user can read a lesson and submit an assignment without a web detour.

### Phase 6 — Admin grouping (answers #5)

- Group the 17 destinations into Money (Credits, Revenue, Usage & Ledger, FAL Refunds), Content (Moderation, Prompt Quality, Character Insights), Renders (AI Jobs, Providers, Provider Health, Movie Renders, Sequence, Films), People (Users, Organizations, Awards, Academy, Story Analytics).
- Dense tables, sticky headers, keyboard navigation, no decoration.
- Acceptance: an operator reaches a refund or a render failure in ≤2 clicks from `/admin`.

---

## Invariants — breaking these is a failed redesign

| Invariant | Consequence |
|---|---|
| Every route keeps its URL | Nothing 404s; you group, you do not move |
| R16 blocks `/generate`, `/upload`, `/credits`, `/pricing`, `/analytics`, `/settings`, `/subscription`, `/admin` | Middleware enforces; do not link what it blocks |
| No prompts, JSON, provider names or credit numbers in R16 | Product rule, tested |
| Five destinations, not flat links | Re-flattening recreates the original defect |
| Gates stay server-side | A UI that hides a gate must still let the server refuse |
| Cost and credits computed server-side | Never compute price in the client |
| `planHasNoHistory` stays green | Any plan edit keeps 0 dated lines and ≥5 resolving pointers |
| 2,784 API tests, 5 skipped; API + web type-checks 0; web strict lint 0 | Run all four gates before every PR |

---

## Definition of done per phase

1. Branch from `main`, never commit to `main`.
2. Gates: API type-check, API suite, web type-check, web strict lint (`--max-warnings=0`), `planHasNoHistory`.
3. Screenshots or a short recording for visual phases.
4. Docs updated: `docs/rushfeature.md` (status pointers only, **no dates**), `docs/operations/roadmap-history.md` (dated entry), `SESSION.md`.
5. PR body states which decision it implements and any invariant it touches.

---

## What NOT to do (read this twice)

**Product**

- **Do not turn Home into a dashboard, a tile grid, or a capability menu.** Home is one question.
- **Do not show more than four choices** after the creator answers. If you need a fifth, the classification is wrong.
- **Do not add a chat box or a transcript.** Homer is a structured loop with a visible record; the value is the record, not the conversation.
- **Do not add a mode selector before the question** (no "pick: ad / film / story" screen). The question comes first; the choice comes after the answer.
- **Do not invent project types.** Ad and commercial are one backend type with two shapes; film and writing already exist.
- **Do not let Homer's routing be invisible.** If Homer reads the answer as a film, say so and allow one-tap override.
- **Do not make the creator re-type their idea** in the flow they land in — carry it as the premise.
- **Do not break the four provenances.** `USER_EXPLICIT`, `USER_APPROVED`, `HOMER_INFERENCE`, `HOMER_PROPOSAL` stay four, and stay distinguishable beyond colour.

**Craft**

- No second design system, second gate implementation, or second copy of the readability rules. The client asks the server; it does not compute.
- No "just in time" cost warnings after the click. Price appears before the button that spends.
- No gate that speaks only as a refusal. Blocking messages appear while typing, in the creator's words.
- Do not make Advanced Story Studio or Admin beautiful at the cost of density; both are dense on purpose and must say so.
- Do not redesign the feed into the studio's language without keeping its over-video legibility.
- Do not add a route, component or token without updating the docs entry that names it.

**Process**

- Do not commit to `main`; do not ship a phase with a red gate; do not leave a phase half-wired.
- Do not re-open a decided question — if a decision seems wrong, say so in the PR body and implement it as decided.
