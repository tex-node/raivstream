# Rush Parity Roadmap

A planning document. It records the ordered phases by which Raivstream can match the promise
of rush.film, and names explicitly what is deferred and why. No phase here is complete; this
is a plan, not a changelog.

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

## Phase 0 — Baseline proof

**Goal.** Close the unexercised paths before layering anything on top of them.

**What it changes.** Nothing in the product; it establishes that the pipeline the roadmap
claims to improve actually works on both surfaces.

**State.**
- Admin-transition audit — **complete**. One admin write site, no third instance of the
  "sets one axis, forgets the paired one" class; the axis rule is documented at the write site.
- R16/KIDS acceptance render (export → publish → moderation → feed) — **not done, and blocked
  on credits rather than on code.** Measured state (2026-10-30): the KIDS story is complete at
  nine scenes; it has **zero video assets** and **eleven FAILED image assets**, every one with
  the same message — *"Insufficient credits — you need 80 but have 0"* — all within thirty
  seconds of each other, with `generationJobId` null on every row (they failed at the credit
  gate, before any provider call). The account balance is 0.
  The real sequence is: **top up → nine scene images → nine scene clips → export → publish.**
  An earlier draft said "~720 credits for nine clips" — wrong twice: 720 is nine *images* at 80
  credits, and it assumed the images already existed. Budget images **and** clips, and expect to
  start by funding the account.

**Exit criteria.** Both the GENERAL and R16 surfaces proven end-to-end.

**Dependencies.** None.

**Does not do.** No new capability, no schema change, no UI.

---

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

**Exit criteria.** Change scene 3 → only scene 3 re-renders and the film re-assembles; the
other scenes keep their existing takes.

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

**Both reads are complete (2026-10-30).** They were prerequisites, not estimates, and their
results are what the Phase 1 and Phase 2 sections above are now scoped against.

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

