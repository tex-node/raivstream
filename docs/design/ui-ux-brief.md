# Raivstream — UI/UX inventory and redesign brief

**Status:** written 2026-11-21 for an agent taking on a full UI/UX redesign.
**Author:** the implementation session that built these surfaces, not a designer.
**What this is:** every menu, every route, every screen, and every product concept an agent needs before touching a pixel — plus the constraints that make a redesign expensive if ignored.

---

## 0. How to use this document

1. Read §1 (product model) and §2 (information architecture) before proposing anything. The navigation was deliberately reduced to **five destinations** in a recent change; a redesign that re-flattens it will undo a considered decision.
2. §3 is the complete route inventory with the *job* of each route. Use it as the scope boundary.
3. §4 and §5 describe the two specialist areas that are hardest to redesign blind: **Homer** (the creative assistant) and **text commercials with motion graphics**.
4. §6 lists the **known UX debts** — the contradictions a redesign should resolve rather than reproduce.
5. §7 lists **what must not break**. These are enforced by tests and middleware, not by taste.

---

## 1. Product model

### 1.1 What Raivstream is

A short-form **vertical video** platform (TikTok-shaped consumption) with a **creation studio** on top: AI image/video generation, story authoring, film assembly, an academy, and a commercial-ad path.

### 1.2 Audiences

| Audience | Entry | What they can do |
|---|---|---|
| **Guests** | `/` (public feed) | Watch 5 unique episodes (`sessionStorage`), then a hard paywall modal |
| **Signed-in free** | `/` | Watch 10 episodes server-side-tracked, then a dismissable banner; premium-only videos are locked |
| **Viewer (paid)** | `/pricing` | Unlimited watch |
| **Creator** | `/create`, `/projects` | Everything above plus generation, story authoring, film assembly, publishing |
| **MODERATOR / ADMIN** | `/admin` | Moderation queue, credits, revenue, provider health, diagnostics |
| **Kids (R16)** | `r16.raivstream.com` | **Watch + make stories only.** Every adult route is blocked by middleware and must not be linked |

### 1.3 Money

- **Credits:** ₦1,000 = 1,000 credits. Deducted per generation, refunded on provider failure.
- **Subscriptions:** Paystack (NGN Viewer) and Stripe (USD Creator).
- **Per-item rates (DB-configurable):** Flux 80, Wan 2.6 200, Seedance 200, HunyuanVideo 300, LTX-2 150, CogVideoX 250, Higgsfield 400 (placeholder), Kling I2V 500, Kling R2V 450, thumbnail 20, transcribe 30, prompt-enhance 100.
- **A produced episode measures ~280 credits for one scene, ~920 for four.** That matters to UI: cost must be visible *before* a click, not after.

---

## 2. Information architecture (current, deliberate)

The header centre is **five destinations**, not twelve flat links. Mobile gets a drawer; the avatar menu is reduced to account actions.

```
Watch      /
Create     /projects        ├ Projects
           /create           ├ New film
           /story-playground ├ Story Playground
           /generate         ├ AI Studio
           /director         ├ Director
           /avatar           ├ Avatar
           /upload           ├ Upload a video
           /story-studio     └ Advanced story studio (legacy, denser)
Learn      /academy
Films      /watch           ├ Watch films
           /submit          └ Submit a film
Account    /settings        ├ Profile (/{username})
                           ├ Library
                           ├ Credits
                           ├ Settings
                           └ Admin (ADMIN/MODERATOR only)
```

**R16 replaces the whole model** with two destinations: **Watch** (`/`) and **Stories** (`/story-playground`, `/story-playground/new?type=story`).

**The one place with a real hierarchy is Create**, because the paths differ in kind: a project you continue, a new film, a story, a single asset, a prompt, an upload.

---

## 3. Route inventory

### 3.1 Watch / consume

| Route | Job | Notes |
|---|---|---|
| `/` | Public feed | CSS snap scroll, muted autoplay, guest CTA, paywall after 5 (guest) / 10 (signed-in) |
| `/v/[id]` | Single video view | — |
| `/watch` | Films | Finished films from the community |
| `/search` | Search | — |
| `/notifications` | Notifications | — |
| `/{username}` | Creator profile | — |
| `/filmmakers/[username]` | Public filmmaker page | — |
| `/series/[seriesId]` | Series | Multi-episode grouping |

### 3.2 Create — projects and films

| Route | Job |
|---|---|
| `/projects` | Every film and story the user has started |
| `/projects/[projectId]` | A single project's workspace |
| `/create` | New film: brief → plan → produce → assemble |
| `/studio/[studioId]` | Studio view |
| `/library` | Everything the user has generated |
| `/upload` | Publish own footage (presigned R2 PUT) |
| `/submit` | Enter a finished film |

### 3.3 Create — Story Playground (the main authoring flow)

Workspace shell: `/story-playground/[projectId]/layout.tsx`, with tabs:

| Route | Tab | Job |
|---|---|---|
| `/story-playground` | — | My stories, resume cards, Story Spark entry |
| `/story-playground/new` | — | New story / new film chooser (`?type=`) |
| `/story-playground/[projectId]` | Overview | Project state, next action |
| `…/story` | Story | Chapters, continue-story |
| `…/characters` | Characters | Character bible (memory, traits, goals, fears) |
| `…/characters/[characterId]` | Character | One character's detail |
| `…/scenes` | Scenes | Scene cards, prompts, image generation |
| `…/scenes/[sceneId]` | Scene | One scene: prompt, asset history, regenerate |
| `…/assets` | Assets | Asset manager, active vs latest, favourites |
| `…/storybook` | Storybook | Page-by-page reader |
| `/storybook/[projectId]` | — | Shareable storybook |
| `/story-studio` | — | **Legacy** denser story editor (still linked in Create) |

Plus, inside the project layout: **Film** tab (assembly/preview/download), **Audio** tab (narration/music tracks), **Sequence** tab (timeline/edit decision list) — all non-R16.

### 3.4 Create — generation and direction

| Route | Job | Notes |
|---|---|---|
| `/generate` | AI Studio: one image or one clip | Radio Image/Video, model dropdown with price, seed-image field, poll progress |
| `/director` | Scene brief → production-ready shot prompts | Claude-backed, exact scene count, quick-note revisions |
| `/avatar` | Character portrait | — |

### 3.5 Learn

| Route | Job |
|---|---|
| `/academy` | Academy home |
| `/academy/classes` | Class list |
| `/academy/classes/[classId]` | Class |
| `…/lessons/[lessonId]` | Lesson |
| `…/assignments/[assignmentId]` | Assignment |
| `/academy/submissions/[submissionId]` | Submission review |
| `/academy/student` | Student dashboard |
| `/academy/instructor` | Instructor dashboard |
| `/join`, `/join/[code]` | Join a class by code |
| `/org/[slug]` | Organisation page |

### 3.6 Commerce and account

| Route | Job |
|---|---|
| `/pricing` | Paystack Viewer + Stripe Creator + credit packages |
| `/credits` | Balance, purchase, history |
| `/credits/success` | Paystack callback verification |
| `/subscription/success` | Subscription return |
| `/settings` | Account settings |
| `/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password` | Auth |

### 3.7 Admin console (17 destinations, sidebar)

Overview · Users · Moderation · Credits · AI Jobs · Providers · Organizations · Awards · Story Analytics · Prompt Quality · Character Insights · Sequence · Movie Renders · FAL Refunds · Academy · Revenue · Usage & Ledger.

Plus detail pages: `/admin/users/[userId]`, `/admin/organizations/[orgId]`, and `/admin/provider-health`, `/admin/films`.

**This is a diagnostic console, not a product surface.** A redesign should make it *faster to read*, not prettier; it is used under incident pressure.

### 3.8 Mobile (Expo)

Tabs: `index` (feed), `search`, `upload`, `generate`, `avatar`, `profile`; plus `library` and `video/[id]` modals; auth screen.

Mobile uses the same tRPC API with Bearer tokens. **It mirrors the web's product model but has no Academy, no Director, no admin.**

---

## 4. Homer — the creative assistant

Homer is the in-house name for the **creative understanding and directing layer**. Two surfaces:

### 4.1 What Homer does

| Procedure (`creative.homer.*`) | Job |
|---|---|
| `interpret` | Turn the creator's free-text premise into structured story state: premise, genre, tone, themes, entities (characters, locations, objects), threads |
| `nextDirectingQuestion` | Ask the single most useful next question — not a form |
| `proposeDecision` | Propose one creative decision with a **rationale** |
| `approveAndSave` | Persist a decision once the creator approves it |
| `buildScenePlan` | Turn approved decisions into a scene plan |
| `generateAnimatic` | Build a timed animatic from the plan |
| `getAnimaticState` | Poll animatic state |
| `directScene` | Direct one scene (shot, camera, performance notes) |
| `approveAnimatic` | Accept the animatic and hand off to production |

### 4.2 The provenance model — the important idea

Every decision carries one of four provenances, and the UI **must** distinguish them:

| Provenance | Meaning |
|---|---|
| `USER_EXPLICIT` | The creator said it |
| `USER_APPROVED` | Homer proposed it, the creator accepted |
| `HOMER_INFERENCE` | Homer derived it from what was written |
| `HOMER_PROPOSAL` | Homer suggests it, not yet accepted |

A redesign that renders all four identically destroys the product's core trust argument: **the creator can always see what they said versus what the machine assumed.**

### 4.3 Views

- `HomerUnderstandingView` — shows the interpreted state (premise, genre, tone, themes, characters/locations/objects, threads).
- `HomerDirectingView` — shows decisions, rationales, provenance, and the next question.

### 4.4 Where Homer sits in the flow

```
idea → Homer interprets → creator answers the next question → decisions (proposed → approved)
     → scene plan → animatic → approve → production (stills → clips) → assembly → publish
```

**Homer is not a chatbot.** There is no free-form chat surface. It is a structured loop with a visible state and a next action. A redesign should resist adding a chat box: the value is the record, not the transcript.

---

## 5. Text commercials and motion graphics (newest surface)

Commercials are a project type (`projectType === 'COMMERCIAL'`) with three authored beats: **hook → benefit → CTA** (funnel order enforced).

| Layer | What exists today |
|---|---|
| Copy contract | Publish gate: a pass publishes, a missing beat blocks naming the first failing field, no copy is `COMMERCIAL_UNSCORED` |
| Legibility gate | `graphicIssues` refuses text that will wrap, is on screen too briefly, overlaps another line, or cannot fit at a readable size — **opt-in** via `CREATIVE_GRAPHIC_GATE=1` |
| Renderer | `buildGraphicArgs` composes three timed typographic beats with fade / rise / slide; proven by frame-difference (moving during ramp, frozen after) |
| Not yet wired | The creator cannot see these refusals while typing, and the overlay is not applied to an exported ad |

**Design implication:** the ad composer wants to be a *preview*, not a form — three beats on a phone frame, with readability feedback inline.

---

## 6. Known UX debts (resolve these, don't reproduce them)

1. **Two story systems.** `Story Playground` (new, guided) and `Story Studio` (old, dense) both exist and both are linked. One should be retired or clearly labelled "advanced".
2. **Three generation entry points.** AI Studio (one asset), Story Playground scenes (in-story), Director (prompt sets). They overlap conceptually and are visually unrelated.
3. **Admin is 17 flat items.** Most are read-only diagnostics; grouping (Money / Content / Renders / People) would halve the scan time.
4. **The gate speaks after the fact.** Copy and readability problems surface at publish, not while typing.
5. **Cost is invisible until too late.** Credit price is shown in the model dropdown but not in the produce/assembly buttons.
6. **R16 is a separate product with a shared component tree.** Any shared component must be checked against kids-mode rules (no prompts, no JSON, no credits UI, no admin).
7. **Feed has its own visual language** (transparent nav over video) that the rest of the app does not share.
8. **Empty states are inconsistent** across projects, library, storybook, academy.

---

## 7. Constraints a redesign must not break

| Constraint | Why |
|---|---|
| **R16 hides/blocks** `/generate`, `/upload`, `/credits`, `/pricing`, `/analytics`, `/settings`, `/subscription`, `/admin` | Middleware enforces it; linking bounces the child to the feed |
| **No raw prompts, JSON, provider names or credit metadata in R16** | Product rule, tested |
| **Every route keeps its URL** | Nothing 404s; navigation groups, it does not move |
| **Five destinations, not flat links** | Deliberate design decision; re-flattening re-opens "the nav cannot say what the product is" |
| **tRPC is the only data path** | No REST endpoints for UI data |
| **Money and credits are server-side** | Client never computes price |
| **Publish gates are server-side** | A UI that hides a gate must still let the server refuse |
| **Accessibility:** keyboard nav, focus return on menus, `aria-label` on drawers | Existing patterns |

### Tests that will catch regressions

`planHasNoHistory` (docs), `commercialContract`, `graphicPlan`/`graphicArgs`/`commercialGraphicVerdict`, `sweepExpiredRuns`, `runner`, `productionWorker`, Academy, story workspace, R16 sanitisation, admin access. Current suite: **2,784 passing, 5 skipped**.

---

## 8. Decisions taken (2026-11-21, operator)

These are settled. A redesign implements them; it does not re-open them.

| # | Question | Decision | What it changes |
|---|---|---|---|
| 1 | Story Studio | **Advanced** | `Story Playground` is the default story path; `/story-studio` stays, labelled *Advanced*, and is never the primary entry. The nav already says "Advanced story studio" — the redesign must make the *label* do real work: denser UI is acceptable there, and it must not be offered to new users as a starting point. |
| 2 | Ad composer | **Default Create path for commercial projects** | `/create` branches by project type: a commercial project opens the **beat composer** (hook → benefit → CTA on a phone frame with inline readability and cost), not the generic film flow. `projectType === 'COMMERCIAL'` becomes a first-class fork in Create, not a setting. |
| 3 | Homer | **Timeline over time** | Homer gains a **decision history**: every decision with its provenance, when it was made, and what it superseded. Current-state-only is insufficient. Design implication: a vertical timeline with provenance chips, filters (said / approved / inferred / proposed), and the ability to see what a decision replaced. |
| 4 | Academy mobile | **Yes, a screen** | Expo app gains Academy: class list, lesson, assignment, submission. This is new mobile work, not a port of web markup; keep it to consumption + submission, not authoring. |
| 5 | Admin | **Dense internal tool** | Do not product-style it. Group the 17 items (Money / Content / Renders / People), tighten tables, keep density. Optimise for incident reading, not beauty. |
| 6 | Feed vs studio | **One visual language** | The feed's cinematic treatment and the studio's calm layout become **one system**: shared tokens, shared components, the feed keeping translucency only where it sits over video. No second design language. |

### Consequences worth stating plainly

- **One visual language** means the current `var(--noc-*)` token set becomes the single source. Any redesign that introduces a second set has failed requirement 6, even if it looks better.
- **Ad composer as default** means the commercial path needs its own Create entry, not a checkbox inside the film flow.
- **Homer timeline** is the largest new build of the six: provenance over time is a data + UI change, not a restyle.
- **Academy mobile** is the only item that adds a platform surface; sequence it after the web language is settled so it inherits rather than invents.
- **Advanced Story Studio** and **dense Admin** are the two places where a designer is *allowed* to be ugly on purpose — and both must be labelled so users know why.

## 9. Suggested redesign sequence

1. **Design the object model on screen**: project → plan → scenes → assets → film. Every surface is a view of this.
2. **One creation flow**, with AI Studio / Story Playground / Director as *modes* rather than destinations.
3. **One gate pattern**: inline, before the click, in the creator's words — copy contract + legibility + cost.
4. **R16 as a first-class skin**, not a subset of the adult product.
5. **Admin: group, don't decorate.**

---

*This brief is inventory and constraint. It is deliberately opinionated about what not to break and deliberately silent about visual direction — that is the designer's job.*
