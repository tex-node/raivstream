## What this document is not

Not an implementation spec, not a commitment, and not a schedule. The phases are **ordered, not
dated**. Two prerequisite reads have not happened yet, which is exactly why nothing here carries
a date: the size of Phases 1 and 2 is unknown until they are done.

---

## Framing: the promise has two halves

Rush's inspected promise is not only a film-production tool. It has two sides.

**The Studio half — staged film production.** A production is a *document* with stages
(Story → Treatment → Outline → Script → Scene breakdown → Cast → Look → Coverage → Storyboard
→ live). The unit of work is a **shot with revisioned takes**, continuity is carried by
**ordered reference-asset IDs** rather than text re-described in every prompt, and a
**scope-aware director** can address the screenplay, a scene, a shot, or the bible.

**The Watch half — consumption and distribution.** A curated viewing surface, filmmaker
profiles and public handles, a film-submission pipeline with revenue-share terms, a licensed
actor supply side, a free editor, a separate manual studio, a twelve-lesson academy, and a
creator partnership programme. That half is not decoration; it is what turns finished films
into an audience and a business.

### Raivstream's position

Raivstream's gap to that promise is **not raw model access** — it owns its integrations
(FLUX2, MiniMax H3, ElevenLabs) where Rush orchestrates third-party providers. Track D already
produces reference-conditioned scene stills. The 5.0 creative layer already has
Brief → Bible → Plan → Preview → Produce → Review → Director → Approval → Outputs, though it
is flagged off. The Academy exists. Movie Builder exists for stills-based assembly.

What is missing is the **identity store**, the **take model**, the **staged surface**, and
almost the **entire consumption/distribution half**. Those are the phases.

---

## Status log (newest first)

The dated status log lives in [roadmap-history.md](roadmap-history.md), newest first,
alongside the per-phase status notes. This document states intent; that one records what happened.

## Phase 0 — Baseline proof

**Goal.** Close the unexercised paths before layering anything on top of them.

**What it changes.** Nothing in the product; it establishes that the pipeline the roadmap
claims to improve actually works on both surfaces.

**Status.** See [Phase 0 — Baseline proof](roadmap-history.md#phase-0--baseline-proof--status-notes).

**Exit criteria.** Both the GENERAL and R16 surfaces proven end-to-end.

**Dependencies.** None.

**Does not do.** No new capability, no schema change, no UI.

---


**Closed 2026-11-04.** The eight acknowledged failure lines were the only thing keeping this phase open. All eight now emit a `[creative.stage] stage=<name> status=fail reason=<what failed>` line — `intent` and `bible` at the request boundary via `logPreProjectStage`, `plan`/`preview`/`director`/`approval` at their guard clauses before the throw, `produce` at the cast gate and `review` in the per-asset catch naming the scene. The shrink-only set in `stageFailureCoverage.test.ts` is **empty** (verified by reading the file, not by the test exiting 0), and `stageFailureFiring.test.ts` observes three of them firing — `approval reason=version_not_found`, `director reason=project_not_found`, `preview reason=invalid_state_transition` — because a line that exists and never runs is instrumentation by assertion.

## Phase 1 — Identity store

**Goal.** Replace re-described identity text with named, typed, reusable reference assets —
one shape that serves both a production bible and a reference-element workflow.

**What it changes.** *(Scoped against the read below: this is "promote a field", not "add a
table" - `CharacterReferenceAsset` already exists with an id, a character relation, status,
assetUrl, providerModel and an `approvedReferenceAssetId` pointer.)* Three pieces, sequenced so
the behaviour change is **last and reversible**:

1. **Promote the existing asset to a first-class entity** - `category` (character | environment
   | prop), `medias[]` variants (front / side / full / wardrobe), typed `properties[]`,
   `reviewStatus`, `ipDetected`, and a `usageMeta` ledger. Additive; **no behaviour change**.
2. **Add user-owned vs performer-owned ownership** - the Actor Programme seam. Additive; **no
   behaviour change**.
3. **Replace `lockedIdentityBlock` text injection with ordered reference IDs at generation time.**
   This is the only piece that changes every generated scene, and the only part of Phase 1 that
   can regress output that currently works. It ships **last, behind a flag**, with a baseline
   captured first: measure the current text-path output against the approved reference (PSNR
   against the reference, or the existing critic score) before (1) and (2) land, then compare the
   flag-on path against that baseline. If the output regresses, the flag goes off and the text
   path stays.

**(1) and (2) look like the work; (3) is the work.** They have migrations, so they read as the
phase; only (3) changes what a creator sees. Sequencing them this way makes Phase 1 a promotion
followed by a behaviour change that can be undone, not a promotion that quietly altered every
scene.

**Hard rule.** A character shot whose required reference is missing is **refused**, not
generated from text. Falling back to text is how identity drifts.

**Exit criteria.** A character is created once and reused across scenes; every generated shot
records the ordered reference IDs it consumed; and **the flag-on path matches or beats the
baseline on the same test, and can be turned off per project.** Without that last clause
"shipped behind a flag" degrades into "shipped, flag never tested".

**Dependencies.** (1) and (2): none beyond Phase 0 — they can start immediately. (3): the
baseline measurement, which must describe the current text path *before* the additive work
lands.

**Does not do.** No public actor surface, no verification, no licensing, no casting. The
performer field is the seam for a later Actor Programme; that marketplace is deferred.

---

## Phase 2 — Take model

**Goal.** Make a scene's video a **take with a revision**, so regenerating one shot does not
invalidate the whole film.

**What it changes.** *(Scoped against the read below: the assembly path is a single re-render
today, so this is the month end of the plan.)* Three things, in this order:

1. **Per-scene segment persistence for story export.** `renderOutputDerivative` builds one
   filter graph over all scenes and uploads a single `out.mp4`; there is no per-scene artefact.
   Movie Builder already persists segments per job - the pattern exists, it has simply never
   been applied to the story export path.
2. **Re-assembly by splicing one new take** into the existing segments instead of re-rendering
   every scene. The export must reference specific per-scene asset IDs rather than only a
   whole-film hash, which today re-renders everything when one scene changes.
3. **Revision/take semantics on top** - revision, take number, parent take, idempotency key,
   expected revision, typed conflicts - so a retry is safe and a conflicting regenerate is
   refused rather than forking the film.

(1) is the blocker; (3) is the part that is conceptually easy once (1) and (2) exist.

**Status.** See [Phase 2 — Take model](roadmap-history.md#phase-2--take-model--status-notes).

Evidence, not adjectives:

- **Nine stage lines fired** on the lighthouse run `cmvylvazc…`: intent (`request=`), bible (`projectId=`), plan,
  preview, produce (`run_finished COMPLETED generated=8 failed=0`), review, director
  (`affectedSceneIds=["SCENE_02"]`), approval, output (`measured=47.333333`).
- **Four distinct critic vectors** across four scenes: overalls 85 / **70** / 85 / 85, per-dimension spread
  including `characterIdentity: 0`.
- **Output duration matches the probe to the millisecond**: `row=47.333333 probe=47.333333 diff=0`.
- Credits: **1,120**.

**The finding to carry: an aggregate can hide a catastrophe.** SCENE_03 scored `overall: 85` with
**`characterIdentity: 0`** — the character was absent from the frame and the overall did not move. That is the
concrete argument for per-dimension gating, recorded in
`docs/operations/critic-threshold-policy.md` where that decision lives.

**The gate caught a defect, and was not relaxed to pass.** The duration gate failed on the run because
`creative_outputs.durationSeconds` was `Int?`/`integer` and stored `47` for a measured `47.333333`. The fix was a
column migration (`Float?` / `double precision`) applied **through the deploy's migration step** — creative tables
cannot be migrated by hand — after which the same output re-rendered at `diff=0`. The threshold never moved; the
column did.

**Deferred, named:** planner persistence (`totalRuntimeSeconds` is `null` on three independent plans — a product
decision about what a stated duration means) and **eight acknowledged missing failure lines** (shrink-only set,
enforced by `stageFailureCoverage.test.ts`).

**Phase 3 record (superseded by the close-out above):** Provider restored (the first submit after funding still 403'd — propagation lag, which the
provider's own code comment names as retryable — and the retry succeeded). Gated lighthouse run on `cmvylvazc…`:
**all nine `[creative.stage]` lines fired** — intent, bible, plan, preview, produce (`run_finished COMPLETED
generated=8 failed=0`), review, director (`affectedSceneIds=["SCENE_02"]`), approval, output. **Critic variation
across four scored runs:** overall 85 / **70** / 85 / 85, with per-dimension spread including `characterIdentity: 0`
on SCENE_03 — not a constant vector. **Duration gate failed on the run and the cause was the column:**
`creative_outputs.durationSeconds` was `Int?`/`integer`, so a measured `47.333333` stored `47`; fixed to Float (#265,
through the deploy's migration step) and the same output re-rendered to `row=47.333333 probe=47.333333 diff=0 match=true`.
**Plan `totalRuntimeSeconds` is null on a third independent plan** — recorded, not fixed: a product decision about what a
stated duration means. Credits spent: **1,120**. Evidence in `docs/rushfeature.md` and SESSION.md.

**Phase 3.5 scoped** — see `docs/operations/phase-3.5-watch-scoping.md`. `Video` is already film-shaped for
playback (`completionRate`, `avgWatchTime`, `engagementScore`), so the gap is **attribution and
ingestion**: `CreatorProfile`, `FilmSubmission`, `RevenueTerms`, `FilmPayout`, four routes
(`/watch`, `/watch/[id]`, `/filmmakers/[username]`, `/submit`), an admin submissions queue with a revenue
terms editor, and three analytics events (`film_submitted`, `film_accepted`, `film_declined`). The
acceptance criterion requires attribution to be *derived* (join, never copied) and approval to **not**
publish.

**Scope, stated once more so it survives the milestone:** the film is still a **versioned snapshot** — a
new take produces a new export row. The take model provides shot-level idempotency and revision
(`takeNumber`, `parentTakeId`, `isLatest`, typed conflict); the **cache** provides the speedup, and does so
independently of the flag. Neither makes the film a mutable entity; that needs a stable film identity and a
live-content policy for swapping takes inside published films, both still deferred.

**Scope statement (piece 2, confirmed).** The take model gives **shot-level revisions and
idempotency** (`takeNumber`, `parentTakeId`, `idempotencyKey`). The film remains a **versioned
snapshot** keyed on `sourceHash` = the ordered per-scene-take composition: a new take produces a
new export row and re-assembles with N-1 segment-cache hits. The film is **not** a stable entity
that can be patched in place - that would need a stable film identity plus a live-content policy
for swapping a take inside a published film, both deferred.

**Exit criteria.** Change scene 3 → only scene 3 re-renders and the film re-assembles; the
other scenes keep their existing takes.

**Reads before writing code (none cost credits).**

- **A — segment-cache portability.** `movieRenderWorker` persists per-segment artefacts per
  job; `renderOutputDerivative` builds one filter graph over all scenes and uploads a single
  `out.mp4`. Does the Movie Builder pattern port cleanly, or is the story export's shape
  structurally different? This decides whether (1) is a cache-key change or a renderer rewrite.
  **The read must end with one of two sentences, before any code:**
  - *"It ports: the first piece is a cache key; weeks."*
  - *"It doesn't port: the first piece is a renderer refactor, which is a behaviour change and
    needs the flag treatment; Phase 2 is bigger than planned."*

  Those two have different rollback stories, and the second makes the phase larger before a
  line of code exists. A read that ends without choosing has not finished.
- **B — revision semantics.** Use Phase 9A's `SequenceVersion` monotonic `max+1` pattern as the
  model (never reuse a version number), alongside the export's `sourceHash` discipline.
- **C — `sourceHash` coverage.** `sourceHash` was `sceneId:assetId` pairs plus
  `EXPORT_RENDERER_VERSION`. Does it include **project-level behaviour flags** such as
  `identityRefsEnabled`, which now changes the rendered output? If it covers only per-scene
  asset identity, then flipping a behaviour flag does not change the hash while it does change
  the output - and Phase 2's A/B is confounded by a cache that cannot see the difference.
  **A hash that does not cover a behaviour-determining input is a cache that lies** - the same
  class as a flag that is true in the database and false in the code.

**Baseline.** The current behaviour is a full re-render on any asset change, and it is
measurable from `story_video_exports` without spending credits: count distinct `sourceHash`
values per project against asset changes.

**Dependencies.** Phase 1. A take model without a reference store produces revisioned takes of
inconsistent characters.

**Does not do.** No new UI; the take model is a data-and-assembly change.

---

## Phase 3 — Staged production surface and a named manual studio

**Goal.** Expose the staged production model that already exists in the 5.0 creative layer as
a first-class surface, with approvals at each stage.

**What it changes.**
- Surface the creative stages (Brief → Bible → Plan → Preview → Produce → Review → Director →
  Approval → Outputs) over the story production data.
- **Per-stage explicit approval**, so a creator signs off on the script, the scenes, and the
  takes rather than only the final film.
- The manual surface lives at **its own route**, distinct from the guided flow — Rush calls its
  equivalent a manual studio, and the distinction matters because the guided path assumes
  defaults that the manual path exposes.

**Exit criteria.** A creator sees and approves each stage; the manual surface exists as its own
route and does not require the guided flow.

**Dependencies.** Phase 2. Staged production is only meaningful if a shot is an addressable,
revisioned unit.

**Does not do.** No new generation capability. This phase is mostly exposure of what exists,
behind flags, plus approval state.

---

## Phase 3.5 — Watch and Submit Films

**Goal.** The consumption and distribution half — the part Raivstream does not have at all.

**What it changes.**
- **Watch**: a curated film library, filmmaker profiles and public handles, curated originals
  presented alongside user work.
- **Submit Films**: an application flow, an admin review step, and recorded revenue-share terms
  for accepted films.

**Exit criteria.** A finished production can be submitted, reviewed, accepted, and watched on a
curated surface, with its revenue terms recorded.

**Dependencies.** Phase 3 — a production must exist before it can be watched. Explicitly
**not** dependent on Phase 4.

**Does not do.** No editing surface, no paid subscriptions, no actor marketplace, no partner
programme. It is the viewing and submission loop, nothing more.

**The publishable unit is the assembled film.** Scene assets are not feed records, and there is
no scene-asset → feed bridge on either surface: `publishExport` is the only story-to-feed path,
by design. Publishing individual scene videos would need its own moderation, its own kids-policy
answer (is a single scene kids-safe when the film was reviewed as a whole?), and its own feed
semantics (one story = nine feed items). That is a different product, not a missing feature.

---

## Phase 4 — Scoped director

**Goal.** One conversational interface over script, scene, shot, and bible — scope-aware.

**What it changes.**
- Explicit scope targeting: rewrite the screenplay, direct one scene, direct one shot, update
  the bible.
- A **cost estimate before apply**, so a director instruction can be declined on price.

**Exit criteria.** "Direct shot 12C" regenerates only that shot's take.

**Dependencies.** Phase 2. A scope-aware director over a whole-film hash just triggers full
re-renders with a better interface.

**Does not do.** No new model; it reuses the existing director machinery with scope.

---

## Phase 5 — Cinematic vocabulary and look

**Goal.** Make "look" a first-class object rather than a prompt fragment.

**What it changes.** Lens, sensor, movement, lighting and grade fields on the director
controls; a resolution ladder with plan gating, mirroring the existing credit-rate mechanism.

**Exit criteria.** A look is saved, named, and reusable.

**Dependencies.** Phase 2 (independent of 3, 3.5, 4).

**Does not do.** No new provider, no new model.

---

## Phase 6 — Presets and LoRAs as product objects

**Goal.** Saved looks that can be applied, shared, and reused across productions.

**What it changes.** A preset entity with a variant and a strength control, selectable per
generation and shareable between creators.

**Exit criteria.** A saved look can be applied, shared, and reused.

**Dependencies.** Phase 5.

**Does not do.** No marketplace for presets, no revenue share on them.

---

## Phase 7 — Auto mode

**Goal.** The on-ramp: one sentence → the existing pipeline, no questions, defaults, capped
credits.

**What it changes.** A path that skips the guided question flow, chooses defaults, and runs
through to an export under a per-film credit cap.

**Exit criteria.** A one-line prompt yields a publishable film without a single follow-up
question.

**Dependencies.** Phase 2, so a bad shot can be regenerated cheaply.

**Does not do.** No new models; it is a policy and defaults layer over the existing pipeline.

---

## Phase 8 — Motion/object operator *(optional)*

**Goal.** A distinct operator class from image-to-video: **motion control** (keep the source
performance, re-render the subject) and **replace objects** (re-synthesise a masked region),
with mode-dependent reference budgets.

**Exit criteria.** A source clip plus reference images produces either a motion-transferred or
an object-swapped output.

**Dependencies.** Phase 1 (references feed the operator).

**Does not do.** It is not a gap in Rush's studio promise. This is new capability, and it is
deliberately optional.

---

## Phase 9 — Academy content tied to the surface

**Goal.** Curriculum that teaches the controls that exist.

**What it changes.** Twelve lessons across four modules, each tied to a shipped control from
Phases 1–5 — building an actor, holding continuity, choosing a camera and lens, taking over the
edit.

**Exit criteria.** Twelve lessons / four modules, each referencing a control a creator can
actually reach.

**Dependencies.** Phases 1–5 shipped. Curriculum follows surface, never precedes it.

**Does not do.** No new product capability.

---

## Future plans (not scheduled)

Each of these is recorded so it is not silently dropped, and deferred so it is not silently
promised.

- **RushCut / editing surface** — a full editor is a separate project with its own interaction
  model; the gap is real and the decision to build it should be made separately.
- **Actor Programme marketplace** — the performer ownership field exists from Phase 1; the
  public supply side (verification, licensing, casting) is a legal and product layer, not a
  phase.
- **Creator Partners programme** — business development, not product.
- **Admin takedown of another creator's video** — named product gap from the audit: an admin
  can reject (block and require re-review) but cannot withdraw another creator's content. A
  reversible, non-moderation hide is a policy decision: who may do it, what reasons are
  recorded, how it is appealed.
- **Pricing model decision** — Rush's pass-through versus Raivstream's configurable credit
  ledger. A business decision, not a feature; pricing should not change while Phases 1–3 are in
  flight.
- **Human-in-the-loop service tier** — Rush's Pro Studio sells director prompt optimisation as
  a human service; Raivstream has admin moderation, not a paid human service.
- **Provider breadth** — adding Seedance, Kling, Veo or Sora is ongoing integration work, not a
  roadmap phase.
- **Second moderation pass over the assembled film** — deferred by policy; revisit only if a
  concatenation can read wrong in sequence.
- **Support chat, light-theme mirrors** — polish, not capability.

---

## Ordering rationale

- **Phase 0 first** because the last unexercised path is the very surface the roadmap claims to
  improve.
- **Phase 1 before Phase 2** because a take model without a reference store produces revisioned
  takes of inconsistent characters.
- **Phase 2 before Phases 3 and 4** because staged production and scoped direction are only
  meaningful if a shot is an addressable, revisioned unit.
- **Phase 3 before 3.5** because a production must exist before it can be watched.
- **Phase 3.5 before Phase 4** because a film can be watched before it can be directed
  shot-by-shot, and the distribution half is the larger missing surface.
- **Phases 5–7 independent after Phase 2** — polish and on-ramp, orderable at will.
- **Phase 8 optional** — a new capability, not a gap.
- **Phase 9 last** — curriculum follows surface.

---

## Prerequisite reads

**Status.** See [Other status notes](roadmap-history.md#other-status-notes).

1. **Track D's reference shape — answered: references are already assets with IDs.**
   `CharacterReferenceAsset` carries `id`, `characterId` → `StoryCharacterMemory`, `status`,
   `assetUrl`, `prompt`, `providerModel` (default FLUX2) and `isLatest`, and the character
   carries `approvedReferenceAssetId` / `approvedAt`. Phase 1 is therefore a **promotion**, not
   a new table - with the caveat that the *text* path (`lockedIdentityBlock`) is still what
   reaches the prompt.
2. **Export incrementality — answered: full re-render today.** `renderOutputDerivative`
   concatenates every scene in one filter graph and uploads one `out.mp4`; `sourceHash` covers
   every scene/asset pair, so one change re-renders the film. Per-segment persistence exists
   only in Movie Builder, not in story export. Phase 2 must build the segment cache before any
   take can be spliced, which makes it a **weeks-to-a-month** phase rather than a small one.
3. **Baseline for Phase 1 piece (3) — not yet taken.** A measurement of the **current text-path
   output** against the approved reference (PSNR against the reference, or the existing critic
   score), captured **before** the additive work lands. This is a prerequisite for piece (3)
   only: (1) and (2) can start immediately, and (3) waits for the baseline. That is the correct
   dependency - the baseline has to describe the world before the flag exists.

---

## Summary

Raivstream's gap to Rush is not raw model access — it owns that. The gap is the identity store,
the take model, the staged surface, and the entire Watch/Submit distribution half.

Phases 1–2 are the architectural work: weeks, not days. Phase 3 is mostly exposure of what
already exists behind flags. Phase 3.5 is the largest genuinely new surface. Everything after
that is polish, optional capability, or a recorded business decision rather than a scheduled
feature.

Phase 0 stands as the honest starting point: the audit is done, the R16 acceptance render is
not.

## Phase template (proven on Phase 1)

Phase 1 is the first phase in this roadmap that closed on its own exit criterion rather than
on an argument. Its sequence is the template for Phase 2 and Phase 3:

1. **Capture a baseline** on the current deploy, scored by whatever gate will judge the phase.
2. **Ship the additive pieces first**, with no behaviour change (schema, migrations, columns
   nothing consumes yet).
3. **Ship the behaviour change behind a per-project flag**, default off.
4. **A/B on the same deploy** — same worker, same critic, same assets. A global env flag makes
   the comparison two deploys apart, which is not a comparison.
5. **Keep the flag on only if the result matches or beats the baseline.** Otherwise it stays
   off and the old path remains.
6. **Replicate on a second scene/character before generalising.** One sample with a favourable
   delta is a hypothesis.
7. **State the experiment's scope in the record**, so a narrow result cannot later be read as a
   broad one.

Three checks catch the silent failures that make a result meaningless rather than wrong:

- **Calibrate any scoring gate against a known-bad input** before trusting it on anything good.
  A critic that reads its own handwriting is worse than no critic, because it manufactures
  evidence.
- **Assert a behaviour flag in the path that consumes it**, not in the database that stores it.
  A flag can be true in storage and `undefined` in every consumer.
- **Guard the branch before committing**, the same way a gate's exit code is checked before
  merging. A tool that reports success while doing something else is the default failure mode.

## Sequence determination (2026-11-04)

Read from the plan and the history, not from any session summary. Every classification cites its evidence.

| phase | classification | evidence |
|---|---|---|
| **0 — Baseline proof** | **complete** (2026-11-04) | `**Status.**` pointer at line 50; the eight acknowledged failure lines are unexercised paths, which is what this phase exists to close |
| **1 — Identity store** | **in progress** | identity is measured and conditioned (history: median 70, best 90, control 80), but only 3 of 7 measured beats clear the floor and 22 flags remain — "every generated shot carries the reference" is not yet true across the library |
| **2 — Take model** | **in progress** | the creative take path shipped and is proven (take 2, 20 → 90, charge verified); the **story** take model's scoped constraints landed last session; the take-aware **export re-assembly** is still unbuilt (history: "piece (2) started") |
| **3 — Staged production surface** | **complete** | history: *"Phase 3 (2026-11-01) — SHIPPED"* and *"Phase 3: PROVEN AND CLOSED (2026-11-02)"*; the staged surface, approval, and manual studio exist as routes |
| **3.5 — Watch and Submit Films** | **complete** | history: schema, ingestion, and UI shipped 2026-11-01 (`/submit`, films router, `FilmSubmission`/`RevenueTerms`/`CreatorProfile`) |
| **4 — Scoped director** | **not started** | dependency: Phase 2 take addressing ("*direct shot 12C* regenerates only that shot's take") — the creative take path exists, the **story** per-shot addressing does not |
| **5 — Cinematic vocabulary** | **not started** | dependency: Phase 2 |
| **6 — Presets and LoRAs** | **not started** | dependency: Phase 5 |
| **7 — Auto mode** | **not started** | dependency: Phase 2 |
| **8 — Motion/object operator** | **not started** (optional) | dependency: Phase 1 |
| **9 — Academy content** | **not started** | dependency: Phases 1–5 shipped |

### The next phase: **Phase 2 — Take model (remaining work)**

Exit criterion: *"Change scene 3 → only scene 3 re-renders and the film re-assembles; the other scenes keep their existing takes."*

**CORRECTION 2026-11-04.** The paragraph that stood here said *"what remains is the half that has no code: the take-aware export path … the story side is not."* **That was wrong, and it is preserved here so the record shows both the claim and the correction.** The read found the mechanism already built: `computeSourceHash` hashes ordered `sceneId:assetId` pairs and `buildExportSegmentKey` keys on `sourceAssetId` — both asset-id keyed, so a new take changes exactly one key by construction, and the story export already passes `projectId` into `renderOutputDerivative` so the cache can key segments.

What was missing was **evidence**, not code. It now exists: `exportTakeComposition.test.ts` drives the renderer's own cache decision across three arms and asserts **hit = N−1, miss = 1**, that the missed key is scene 3's and not another segment, that the assembled timeline signature is identical, and that the source hash changes only because scene 3 changed. Phase 2's exit criterion is met **by construction and now by test**.

Dependencies: met (Phase 1's reference store exists; takes exist on both tables with project-scoped constraints).

### Debt-to-phase mapping

| debt | blocks which phase | disposition |
|---|---|---|
| **Planner persistence** (`explicit.durationSeconds` captured at intent, lost at plan) | **Phase 3's stage contract** — a stage cannot be approved if the plan it produced drops what the creator asked for | **prerequisite to any Phase 3 re-entry**, parallel to Phase 2 |
| **The eight acknowledged failure lines** | **Phase 0's exit** ("both surfaces proven end-to-end") | **prerequisite to calling Phase 0 complete**, parallel to Phase 2 |
| **Video re-render** (deferred; discontinuity trade-off recorded) | **Phase 3.5 distribution quality** — flagged films cannot be promoted without it | **parallel**; no phase's exit criterion requires it |
| **Thin-input projects** (7) | **Phase 1's exit** ("every generated shot carries the reference") | **parallel, external dependency** — needs better creator input, not a pipeline change |
| **The ledger writer** | **Phase 3.5 revenue** | **blocked** on a revenue pool that does not exist; parallel |
| **Ruleset-requires-current-head** | nothing | **parallel infrastructure** — it blocks merges, not phases; mitigated by `gh pr update-branch` |

**One consequence worth stating:** Phase 2 is the next phase, and **no debt blocks it**. The two debts that are prerequisites (planner persistence, the eight failure lines) gate Phase 3 re-entry and Phase 0's closure respectively — so they can be worked in parallel without delaying the sequence.