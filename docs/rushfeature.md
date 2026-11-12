**State.** Two phases were scheduled after this note was first written, and one debt was closed, so the paragraph below is kept and corrected beside itself.

**Correction, preserved rather than deleted:** the paragraph that follows said no unblocked engineering remained. Phase 10 (longer-form) and Phase 11 (Homer) are now scheduled, with a memo and a read as their first deliverables; and the balance-invalidation gap is closed — invalidation sits on the MutationCache keyed by mutation path, so a caller cannot skip it, while the pill keeps its 30 s interval as the safety net for charges a server starts without a client mutation. The original note follows.

**State.** No unblocked engineering remains. Phases 0-7 and 9 are complete; the three open items are all blocked by
something no engineering can move:

- **Phase 8 - Motion/object operator** - optional, and blocked on a **provider capability that does not exist** (no motion-transfer or
  inpainting argument in the generator).
- **LoRAs** - blocked on a **provider parameter** (no adapter argument in `FluxInput`), with the three-part checklist recorded in Phase 6.
- **Phase 1's remaining coverage** - blocked on **creator input**: 3 of 7 measured beats clear the identity floor, and closing it needs
  seven thin-intent projects to become real briefs.

**The roadmap resumes** when a provider capability arrives, when creator input arrives, or when an operator deliberately chooses an
unscheduled remainder. **One such remainder is recorded and deliberately not scheduled:** the **conversational director interface** -
Phase 4's take capability is complete and proven, but the natural-language layer over it was never built. It is a choice, not an
oversight, and it needs no provider. **Phase 4's director interface is the only resume path that requires nothing external** - the other two wait on inputs that are not ours to move. Its size is recorded: a **parser over an existing enum plus one router call** - `interpretDirective` gains a `SHOT` scope, `createNewTake` already takes `shotId`, and **no model call and no provider path** are involved. **Correction, preserved rather than deleted:** the director is **no longer a resume path** - it was exposed as `creative.director.regenerateShot`, so the only remaining resume paths are **external** (provider capability, creator input) or a **provider-backed** LoRA line.

## What this document is not

Not an implementation spec, not a commitment, and not a schedule. The phases are **ordered, not
dated**. Two prerequisite reads have not happened yet, which is exactly why nothing here carries
a date: the size of Phases 1 and 2 is unknown until they are done.

**Correction, preserved rather than deleted:** both prerequisite reads have since happened and both phases are complete - the sentence above is kept so the document still shows what was unknown when it was written. The plan carries no dates by enforcement, not by uncertainty.

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

**Status.** See [history — Phase 0 — Baseline proof](roadmap-history.md#phase-0--baseline-proof--status-notes).

**Goal.** Close the unexercised paths before layering anything on top of them.

**What it changes.** Nothing in the product; it establishes that the pipeline the roadmap
claims to improve actually works on both surfaces.

**Status.** See [Phase 0 — Baseline proof](roadmap-history.md#phase-0--baseline-proof--status-notes).

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

**Status.** See [history — Phase 2 — Take model](roadmap-history.md#phase-2--take-model--status-notes).

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

**The earlier entry in this document said `totalRuntimeSeconds` was "declared nowhere". That was wrong, and it is
recorded here because the wrong version shaped a scoped build plan.** The field is **declared at `plan.ts:70`** on
`CreativeProductionPlanState` and **produced at `plan.ts:315`** (`totalRuntimeSeconds: cursor`, the ordered sum of the
scene durations). The earlier claim came from a `Get-ChildItem` invocation that errored on a bad path and returned no
output — a failed command read as evidence of absence.

**What was actually missing was a test.** `musicChargeRace.test.ts` supplied `plan: { totalRuntimeSeconds: 30 }` as a
fixture literal, so the suite would have stayed green if the builder stopped producing the field.

**Shipped:**

1. `planRuntimePersistence.test.ts` — three assertions against a plan the builder actually made: a 30-second idea
   carries `targetDurationSeconds === 30` and a runtime equal to the sum of its scenes; no stated duration carries
   `undefined` target and the summed runtime; and the runtime is finite, which is what the two consumers need.
2. The `musicChargeRace` fixture now builds its plan with `buildCreativePlan`, so removing the production of
   `totalRuntimeSeconds` breaks it.
3. The "consumers computing NaN" claim is withdrawn: with the field always produced, `Math.max(1, Math.round(...))` in
   `audio/service.ts:401` and `output/derivation.ts:42` receives a finite number. The NaN path was reachable only for a
   plan object constructed outside the builder — which is exactly what the old fixture did, and no longer does.

**The design decision this session settled:** `totalRuntimeSeconds` is what the plan *builds* (the ordered sum), and
`targetDurationSeconds` is what the creator *asked for*. They stay separate — collapsing them would make the timeline
disagree with the runtime and hide a pacing mismatch the plan already reports in `notes`.

**Phase 3 re-entry is unblocked.**

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

**Status.** See [history — Phase 4 — Scoped director](roadmap-history.md#phase-4--scoped-director--status-notes).

**State.** Complete — the exit criterion is met on real bytes: a shot-level still produced through the runner, conditioned (`resolvedRefs=4`), accepted by the critic at 80/85/85, 80/85/85, 90/85/85 against a composite control of 80/85/85, for 240 credits. The conversational director interface this phase describes remains unbuilt and is out of scope for the current arc.

**Not built: the conversational director interface.** The exit criterion - "direct shot 12C regenerates only that shot's take" - is met at the **capability** level: `createNewTake` addresses a `shotId`, the two partial unique indexes carry the scope, and the multi-shot case is proven against a fixture. What was never built is the **natural-language layer over it**. It needs no provider capability and no Phase 8: it is a **parser and a router over a proven capability**. It is the only unblocked, unbuilt engineering left in the plan, and it is **unscheduled by decision, not by dependency** - a reader here should see that distinction, not only in the closing note.

**Scope of the director remainder, recorded and not built.** The parser already exists in shape: `interpretDirective` (`director/interpreter.ts`) turns a directive into `{ mode, scope, changes }` with scopes **STORY, CHARACTER and VISUAL** - there is **no SHOT scope**, and `DirectiveScope` is the enum to extend. The capability already exists too: `createNewTake` takes an optional `shotId` and scopes the predecessor lookup and demotion to that slot. So the interface is **a parser over an existing enum plus one router call**, not a model call and not a new pipeline: extend `DirectiveScope` with `SHOT`, parse a shot reference (`shot 12C` -> scene + shot id) against the plan's shot list, and route to `createNewTake({ shotId })`. **Size: small** - the same shape as Phase 4's take work, with no provider involvement. **Acceptance criterion:** a sentence naming a shot regenerates **only that shot's take**, proven against the multi-shot fixture, with the untouched shot asserted - the same two-arm proof that closed Phase 4.

**Built: the director interface - resolution and routing, proven, with one seam named.** `director/shotDirective.ts` resolves a shot reference from a sentence and routes it to `createNewTake({ shotId })`. `DIRECTIVE_SCOPES` already carried `'SHOT'` before anything resolved it, so the enum needed no change; what was added is `resolveShotReference` (**accepted forms: a full shot id, scene+letter `1B`, scene+number `2.2`, and a bare scene number**) and `applyShotDirective`, which calls the injected capability **once, with the named shot only**. An unknown shot refuses with typed **`UnknownShotError`** (`code: 'UNKNOWN_SHOT'`) before the capability is called. **No model call, no provider path, no parallel take machinery.** **The sibling proof is split across suites, deliberately:** this one proves the routing passes exactly one id; `shotTakeRegeneration.test.ts` and `takeShotScope.test.ts` prove at storage level that the sibling row is untouched. **The seam, named:** no tRPC procedure calls `applyShotDirective` yet - the module is complete and proven, the surface that would expose it is not built.

**Exposed: `creative.director.regenerateShot`.** Input `{ projectId, instruction }`; the project lookup is filtered by `userId`, so ownership matches every other procedure in the router. Order is the contract: **resolve the shot -> read the run budget -> assert the ceiling -> call `createNewTake`**, so a director instruction can never charge past the cap - the reuse-path defect in a new location is exactly what the test asserts against. `UnknownShotError` maps to **`NOT_FOUND`**, not a 500, matching the router's convention for a named-but-absent reference. **No new take machinery, no model call.** Accepted forms remain: full shot id, `1B`, `2.2`, bare scene number.



**Per-shot conditioning — the drop was in the experiment, not the code.** An earlier note here claimed the per-shot spec "never carries character references". That was wrong twice over: the router does attach them, and the live `references=0` came from calling `generateStill` directly with a router spec. The adapter reads `spec.referenceImageUrls` (resolved URLs); only the runner turns `characterRefs` (names) into those URLs, so a direct call renders text-to-image and logs `references=0` — identical prompt hash to an un-conditioned run, which is exactly what was observed. **`[creative.spec]` now logs `semanticRefs=<n> resolvedRefs=<m>` at the call site** and appends `MISMATCH=char_refs_unresolved` when both disagree, so "conditioned" and "looks conditioned" are one line apart. Per-shot production is conditioned whenever it runs through the runner; the remaining gap is that no experiment has yet exercised that path end to end.

**Phase 4 exit criterion met on real bytes.** A shot-level image is produced through the runner, conditioned (`semanticRefs=2 resolvedRefs=4` on every arm), accepted by the critic, and addressing is proven: shot B take 2 with shot A untouched. **Measured comparison, scene `SCENE_01`, composite control reused:** control identity 80 / composition 85 / overall 85; shot arms **80 / 85 / 85**, **80 / 85 / 85**, **90 / 85 / 85** — comparable or better, one shot at the 90 band. **Cost: 240 credits**, balance 5,160 → 4,920, three stills at 80 each. Getting here required two runner defects to be fixed first, both silent-success shapes: the runner could not reach per-shot specs at all (no `perShot` option), and its resume key ignored `shotId`, so a per-shot run generated **0 assets and reported COMPLETED**. Neither was visible from the router-level tests; only driving the runner surfaced them.

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

**Status.** See [history — Phase 5 — Cinematic vocabulary and look](roadmap-history.md#phase-5--cinematic-vocabulary-and-look--status-notes).

**State.** Complete — persistence shipped — a look is a saved, named, reusable object. `CinematicLook` (`cinematic_looks`) keyed unique on **`(projectId, name)`**: scope decided from the read, because "reusable" means reusable across every production in one film, and a name collision inside a project is a decision to surface rather than a second row. Service: `saveLook`, `renameLook`, `listLooks`, `lookPromptForProduction`, with **`LookNameConflictError`** for a duplicate save and a duplicate rename — typed conflicts, not unique-violation stacks. Consumer: `runCreativeProduction({ lookName })` reads the look back from the project and composes its fragment onto every still prompt, so a second production reuses it **without re-entering a field**. **Proven**: saved → re-read → identical values; project-scoped isolation; duplicate save and duplicate rename both conflict; two productions compose the same saved look into their prompts; a missing look returns null rather than a silent default. **Not yet proven on bytes:** no production has been rendered with a look applied — one still at 80 credits would close it, and the criterion's "applied to a production" clause is currently proven at the prompt-composition layer.

**Look applied on bytes — and two findings it exposed.** One still rendered through the runner with `{ lookName: "Noir" }`: `[creative.look] scene=SCENE_02 name=Noir fragmentChars=113 inPrompt=true` immediately before `[creative.spec] semanticRefs=2 resolvedRefs=4`, asset `READY` with a URL, critic **identity 70 / composition 75 / overall 75**. The fragment reached the payload, so the fourth clause holds. **Finding 1 — the score went down.** The same scene without the look scored **80 / 85 / 85**; the Noir look (85mm, low-key, monochrome) scored 10 points lower on identity and 10 on composition. A look is not a free upgrade, and this one measured as a regression on this scene. **Finding 2 — the charge was zero.** Balance 4,920 before and after, because the runner reused the superseded row and the credit idempotency key is derived from the asset id: rendering again into the same row replays the key, bills the provider and writes no transaction. The `assertNotResetAfterCharge` guard exists for this; the reuse path is a hole beside it.

**Billing hole closed.** The zero charge above had a named cause: `prod:charge:<assetId>:<attempt>` carried a retry counter that restarts at 1 per run, so reusing a row replayed the key and wrote no transaction while the provider was billed. `nextChargeAttempt()` now derives the attempt from the row's own charge history and the runner uses it for reused rows; a READY row still skips generation and charge. **The guard did not fire because the path is beside it:** `assertNotResetAfterCharge` refuses a RESET, and reuse never resets — it re-renders a FAILED or READY row. That is the fourth instance of this class (cast references, take reset, tolerant rate, row reuse).

**Goal.** Make "look" a first-class object rather than a prompt fragment.

**What it changes.** Lens, sensor, movement, lighting and grade fields on the director
controls; a resolution ladder with plan gating, mirroring the existing credit-rate mechanism.

**Exit criteria.** A look is saved, named, and reusable.

**Dependencies.** Phase 2 (independent of 3, 3.5, 4).

**Does not do.** No new provider, no new model.

---

**Remaining for the exit criterion** (*"a look is saved, named, and reusable"*): persistence. Scope: a `CinematicLook` table (projectId, name, the five fields, unique on `(projectId, name)` — scoped, per the constraint rule), a save/rename/list service, and the consumer that applies a stored look in place of a literal. **Acceptance criterion:** a look is saved under a name, survives a re-read, is applied to a production through the director controls, and a second production can apply it without re-entering the fields. Deliberately not shipped with the pure slice: migrating a table for a type that had not been exercised is how the take model acquired an impossible constraint.

## Phase 6 — Presets and LoRAs as product objects

**Read before building — two halves of this phase are not what they look like.** *Applied and reused* already ship: Phase 5's `CinematicLook` is project-scoped, applied through `runCreativeProduction({ lookName })`, and reusable across a project's productions. The genuinely new capability in this phase is **sharing between creators**, which needs **no new table** — a shared look is the same object copied into another project, with the existing `LookNameConflictError` deciding collisions. **The LoRA half is blocked by the provider, not by the plan:** `FluxInput` carries `prompt`, `steps`, `guidance`, `seed` and no LoRA or adapter argument, and the only `.safetensors` references in the codebase are CogVideoX model filenames on a network volume. A `strength` control would therefore be an object nothing can apply — the plan's "variant and a strength control" describes a capability the provider layer does not expose.

**First slice shipped:** `shareLook(fromProjectId, name, toProjectId, overwrite?)` reusing `lookPromptForProduction` + `saveLook`, so there is no parallel path for a similar object. 6 tests: fields copied not subsets, the shared look applies in the receiving project through the Phase 5 consumer, the source is untouched, a collision is the same typed conflict, overwrite is explicit, and a missing source fails loudly. **Scoped out with named blockers:** LoRAs (no provider parameter), "variant" (no definition distinguishing it from the look fields), and any new table (nothing in the shipped slice needs one — the Phase 5 precedent is that a table shipped before its type was exercised had to be corrected).

**Exit criterion met; the described mechanism is not buildable, and that is a provider dependency rather than an unfinished build.** All three clauses hold in the shipped code: **applied** (`runCreativeProduction({ lookName })` composes the fragment and it reached the provider — `[creative.look] ... inPrompt=true`), **reused** (a second production applies it without re-entering fields), **shared** (`shareLook` copies every field into the receiving project and it applies there through the same consumer). **What the plan describes does not exist and cannot yet:** a preset entity with `variant` and a `strength` control. `FluxInput` carries `prompt`, `steps`, `guidance`, `seed` — no adapter argument — so a strength field would configure nothing. **The LoRA blocker, specified:** (1) a provider parameter — the RunPod payload and `FluxInput` would need a `loras: [{ path, strength }]` argument; (2) storage — a volume path or upload mechanism for the `.safetensors`; today the only volume references are CogVideoX model filenames; (3) threading — a strength field surviving `CinematicLook → spec → FluxInput` with validation. Until all three exist, this half stays a dependency. **The sharing clause has a second, quieter gap:** `shareLook` takes two project ids and checks neither ownership nor that the projects have different owners, so it copies across the creator boundary *mechanically* but without authorization. Nothing calls it from a router yet; when one is added, the permission boundary belongs there.

**The shareLook boundary now exists, at the service, where every caller must pass.** The function took no caller identity at all and checked no ownership, so a share copied a look out of any project and wrote it into any other - and with `overwrite: true`, destroyed one that was there. **No caller exists yet**, which is exactly when the boundary is cheapest to place. It now requires `callerId`, checks ownership of **both** ends before touching anything, and refuses with a typed **`LookShareForbiddenError` naming the side** (`source` for the read, `target` for the write). **The refusal precedes the source read** - a boundary that refuses after reading has already leaked - and the overwrite path is checked by the same guard, because an unauthorized overwrite is a destruction vector rather than a failed create. **Policy decided, not assumed: no cross-owner sharing and no admin bypass at this layer.** A boolean override in a service is a bypass any caller can pass; if a moderator ever needs to share across owners it belongs in a router with a role check and an audit record, and this function should receive the resolved decision, not a flag it cannot verify.

**Goal.** Saved looks that can be applied, shared, and reused across productions.

**What it changes.** A preset entity with a variant and a strength control, selectable per
generation and shareable between creators.

**Exit criteria.** A saved look can be applied, shared, and reused.

**Dependencies.** Phase 5.

**Does not do.** No marketplace for presets, no revenue share on them.

---

## Phase 7 — Auto mode

**Read before building — the gap is the policy, not the plumbing, and the cap does not exist.** The plan's "skips the guided question flow, chooses defaults" describes a layer that is half-wired: `IntentQuestion.canAutoDecide` exists (`shared/types.ts`, "the UI offers a 'Let Raivstream decide' choice") and is consumed by **exactly one thing** — the interpretation panel — plus tests. **No server code ever decides a deferrable question.** The flag is rendered and never applied. The second, harder gap: **"capped credits" has no mechanism.** The codebase contains character ceilings and ffmpeg wall-clock ceilings, and no per-film or per-run credit ceiling anywhere; every charge is a per-asset rate. **"Cheap" is verified, not assumed:** `generate:flux2` is **80 credits and active**, `generate:flux` 80 and inactive, so per-shot regeneration costs 80 per still — 12 stills for a 4-scene film at three shots each, **960 credits**, against **320** for scene composites. Cheap per shot, not cheap per film.

**First slice shipped:** `autoResolveIntent(interpretation)` — the server half of the flag. It decides every `canAutoDecide` question (using the creator's own words when an option matches, otherwise the first option, never an empty answer) and **refuses** when a question cannot be deferred, returning `blockedBy` instead of inventing a choice. 7 tests, including that a blocked question never receives a decision. Reuses the existing interpretation type; no new intent, plan or charge path.

**Scoped out, with the mechanism named:** the credit cap. A per-run ceiling carried on `CreativeProductionRun` (or the run options) and checked **before each charge** in the runner loop, aborting the run before it spends past the ceiling rather than discovering the overrun in the ledger afterwards. Until that exists, auto mode cannot honestly claim "capped" — it can claim "defaulted".

**The credit cap shipped — auto mode is now "capped", not only "defaulted".** The read found no ceiling of any kind on the run: `CreativeProductionRun` carried counts and timestamps, and every charge was a per-asset rate. The ceiling is now **persisted on the run** (`creditCeiling` null = uncapped, `creditsSpent` defaulting to 0), because a money ceiling held in memory starts again from zero on every restart — a resumed run would quietly regain its whole budget. **Counted per run, not per asset:** the 80 credits `generate:flux2` charges is a rate; the cap is "this run may spend at most N", accumulated across every asset the run pays for. **Checked before the charge**, so the guard refuses the next asset instead of reporting an overrun the ledger has already recorded, and the refusal is a typed `CreditCapExceededError` naming the ceiling, the spend so far and the next cost. **A partially-completed run is not aborted for having spent:** the cap withholds the next charge, it does not cancel the run.

**Migration:** `20261105160000_production_run_credit_cap` — additive and nullable, so every existing run stays uncapped. Applied as `supabase_admin` and verified in `information_schema` (`creditCeiling` nullable integer, `creditsSpent` integer NOT NULL default 0). **Tests:** 11 — within, exactly-on, and over the ceiling; the refusal naming ceiling/spend/next; a partially-completed run continuing; a null ceiling staying uncapped; a resumed run inheriting the previous attempt's ceiling *and* spend; a missing run row being uncapped rather than silently zero; and source assertions that the guard is evaluated before `chargeOrThrow` and that `creditsSpent` is persisted.

**The path shipped: `creative.project.auto`.** One procedure composes the pieces that shipped separately — `intentService.interpret` → `autoResolveIntent` → `projectService.createFromIntent` → `productionPlanService.plan` → `runCreativeProduction` with an explicit ceiling. Nothing is re-implemented: the refusal and the cap are the shipped functions, called in order, and the composition lives in `runAutoProduction` with every step injected so the path is testable without a database.

**The blocked contract:** a non-deferrable question returns `status: "blocked"` with `blockedBy` **and** the question prompts, before a project exists and before any charge — tested by asserting `createProject`, `buildPlan` and `runProduction` are never called. The creator sees which question stopped them, and the decisions already made are returned too, so they are not asked twice.

**The default ceiling is 480**, and the rationale is arithmetic rather than taste: a composite still costs 80 credits and the plan builder emits one still per scene for a six-beat film, so 6 × 80 covers a full film at scene granularity and nothing more. Per-shot production would be three times that for the same film, which is why auto mode spends on composites and leaves shot-level work to a deliberate request. The ceiling is never null on this path.

**Not yet proven on bytes:** no auto run has produced a film. The path is proven at the composition boundary (13 tests: order of steps, explicit ceiling, blocked-question short circuit, decisions reported) with a bounded real run available at one to two scenes, 80–160 credits, which this session did not spend.

**Bounded auto run attempted — the cap fired, and that is the finding.** One sentence (*"A lighthouse keeper finds an injured bird and teaches it to fly again"*) through `runAutoProduction` on the deployed build: the interpretation auto-resolved every question, the project was created, the plan built **4 scenes**, and production ran under an explicit ceiling. **Spend 920 credits, balance 4,920 → 4,000**, ceiling 960: the cap refused the charge that would have taken the run to 1,120 and did so **before** it spent. **What the run proves:** one sentence in, no follow-up questions, a real production under a ceiling, and a ceiling that stops an overrun rather than reporting it afterwards. **What it does not prove:** a complete, publishable film — 7 of 8 assets are READY (4 stills, 3 videos) and the fourth video is the one the cap refused. **Two defects the run exposed:** (1) the ceiling was derived from the draft video rate (80) while the runner charges `generate:h3_max` at **200**, so the default is now **1680** = 6 × (80 + 200); (2) the refusal surfaced as a failed asset on a run whose status is still `COMPLETED`, so a caller cannot tell a capped run from a finished one without comparing `creditsSpent` to `creditCeiling`. Phase 7 stays open on the completeness clause.

**A capped run now reports PARTIAL, with a machine-readable reason.** The prior run refused a charge correctly and then reported `COMPLETED`: the guard changed what the run *did* and not what it *said*. The per-asset `catch` swallowed `CreditCapExceededError` into an ordinary asset failure, the loop kept going, and the final status came from an inline `generated/failed` ternary. Now the cap error is detected in that catch, stops the loop (every remaining charge would be refused the same way), and the run finalises through `finalRunStatus` → **`PARTIAL`** with `lastError = "CREDIT_CAP_EXCEEDED ceiling=<n> spent=<n> stoppedAt=<i>/<m>"`, so a caller branches on the status or the reason without recomputing anything. **A run under its ceiling still reports `COMPLETED`** — the fix does not make every run look partial, which would remove the information the status carries. **Default ceiling is 1680** = 6 × (80 still + 200 video), derived from the rate the runner charges (`generate:h3_max`), not the table's cheapest row — the earlier 480 (stills only) and 960 (cheapest video) were both wrong and both were measured wrong by a real run.

**Still unproven:** no single sentence has produced a **complete** film. The last run spent 920 of 960 and withheld the fourth video; at the corrected 1680 a full run costs roughly **1,120** (four scenes), which this session did not spend.

**Full auto run at the corrected ceiling — the cap held, the film is still not complete, and the cause is moderation, not money.** Same sentence, default ceiling 1680: **4 scenes, spent 920 of 1680, run `COMPLETED` with 6 of 8 assets READY**, balance 4,000 → 3,160 (**net 840**). The two failures share one cause: `SCENE_01`'s still was **rejected by content moderation** — *"Your prompt was flagged for graphic violence"* — and its video then failed because H3-Max is image-to-video and had no seed. One rejection cascaded into two missing assets, so the film is a scene short. **Three findings, none of them the cap:** (1) the auto path inherits the moderation gate and has no recovery — it does not retry with a softened prompt or drop the scene, so a single flag costs a whole scene; (2) the sentence was classified **EDUCATION**, not STORY (*"teaches it to fly"*), so auto-decided questions were *"What age group are we teaching?"* and *"How long should the lesson be?"* — the classification, not the answers, is wrong; (3) `creditsSpent` counts a charge that was **refunded**, reporting 920 against a measured net of 840, so the run counter and the ledger disagree by the refunded amount.

**Phase 7 remains open on completeness**, with the blocker named: a publishable film needs all assets READY, and the path currently lets one moderation rejection remove a scene without a fallback.

**Moderation fallback shipped: retry once, then drop the scene and say so.** The read found the mechanism already existed — `suggestSafeRewrite` (`promptModeration.ts:190`) — and that the runner treated a rejection as final: `if (rejected || providerFinal) break;`, so one flag produced a failed still, a video with no seed, and a run that reported success. Now a rejection on a still gets **one softened retry** with the rewritten prompt; if that is rejected too, the scene is **dropped and recorded** (`SCENE_DROPPED moderation_rejected`), its video is skipped with `action=skip_video reason=scene_dropped` instead of failing for want of a seed, and the run finalises **PARTIAL** because `droppedScenes > 0`. **A rewrite identical to the original is not a retry** — it would be rejected again and cost a second charge to learn nothing. **Net spend:** a refunded charge now comes off `creditsSpent` (`netSpendAfterRefund`), so the cap counts money that was actually kept; the real run's 920-vs-840 divergence is closed by construction, and the refund key now matches the charge key.

**Still open:** the film has not been produced complete. With the fallback, a flagged scene is now a documented hole rather than a silent one, but the next full run (~840–1,120 credits) has not been spent, and the **type-classification gap** (a story sentence read as EDUCATION because of the word "teaches") remains untouched and is the likeliest cause of a second flag.

**Type classification fixed: narrative form now outranks a lone verb.** The read named the mechanism — a **keyword count** (`signalScore`, `interpreter.ts`, substring match against `TYPE_SIGNALS`) with a bare `teach` in the EDUCATION list, so *"teaches it to fly"* scored EDUCATION and won a 1–0 vote. The consequence chain is real: the type drives which questions are generated, and auto-resolve then answered *"what age group are we teaching?"* for a lighthouse story. **The fix is about form, not vocabulary:** bare `teach`/`learn`/`learner` are gone, replaced by pedagogical **phrases** (`teach children`, `lesson about`, `learn how`, `let's talk about`, `how does`), and a **narrative-form rule** promotes STORY when the sentence opens on a protagonist performing a story action. A story that mentions teaching is now a story; a genuine lesson still is a lesson.

**Both directions tested** (`classification.test.ts`, 7 tests): the lighthouse sentence and two other teaching-free stories classify STORY and are asked no education question; *"Let's talk about how volcanoes work"*, *"Explain photosynthesis to eight-year-olds"* and *"A lesson about the water cycle for students"* classify EDUCATION and still get their own questions. **The educational path was not sacrificed:** removing bare `teach` broke *"Teach children how gravity works"* and two Phase 10 tests, which is exactly the regression the phrase list exists to prevent — a classifier that never returns EDUCATION would be a different bug.

**Still open:** the film is unproven and the next full run costs **~840–1,120 credits**.

**Third full run: the classifier fix worked, and the failure moved to video prompts.** Same sentence, default ceiling 1680: classification **STORY** (signals {COMMERCIAL:0, EDUCATION:0, TRANSFORMATION:0, STORY:1}), auto-resolved decisions "Should the ending feel hopeful...?" and "Who is this story for?" - **no teaching questions**. All **four stills are READY**, including SCENE_01, whose still the first run had rejected: the classifier fix removed that flag. **Net spend 720** (balance 3,160 -> 2,440), ceiling 1680, run **PARTIAL**, 6 of 8 READY. **The two failures are videos** - SCENE_01 and SCENE_02 rejected with "Your prompt was flagged for graphic violence" - and **the fallback does not cover them**: the retry/drop path is gated on the IMAGE kind, so a rejected video gets no softened retry and no drop record (dropped=0). The film is short two videos, and the gap is in the fallback's scope rather than in the classifier.

**Next:** extend the moderation fallback to VIDEO specs (retry once, then record the drop) and inspect why the video prompt trips a violence filter that its own still passes - the two prompts are built differently and only the video one is flagged. Cost of the next full run: **~720 credits**.

**Fallback widened to video, and the root cause was the prompt, not the gate.** The read named the gate (`runner.ts`: `rejected && spec.kind === IMAGE && !moderationRetried`) and the prompts. The two prompts differ only by "Motion sequence" versus "Key visual" plus the `Camera:` line, so the video was flagged for the SAME scene text its still had already passed - and the moderation error names it: *"finds an injured bird"*. **The softened rewrite was never propagated:** the fallback mutated the still spec and left the video spec carrying the original phrase. **Both fixed:** the gate now covers every asset kind (a rejected video gets one softened retry, and its retry reuses the still already in `byKey` as the seed - no regeneration, no second charge for the still), and a still's rewrite is stored per scene and applied to that scene's video prompt. Drop records now name the kind (`SCENE_DROPPED moderation_rejected kind=VIDEO`) so a dropped video is distinguishable from a dropped scene. **Tests: 10 new** (propagation, no-op cases, kind in the record, and four source assertions that the gate is widened and the rewrite reaches the video).

**Still open:** the film is unproven. Next full run cost **~720 credits**; with the fallback now covering video, a second rejection becomes a recorded drop rather than a silent short fall.

**Fourth full run: the guard exists now, and the rewrite does not clear the video filter.** Same sentence, ceiling 1680: classification **STORY**, decisions *"Should the ending feel hopeful...?"* and *"Who is this story for?"*, **all four stills READY**, **net spend 720** (balance 2,440 -> 1,720), run **PARTIAL**, 6 of 8 READY. **The same two videos failed** (SCENE_01, SCENE_02) with the same moderation message, so the widened fallback either did not soften enough or never fired for them. **Two measurement defects make that undecidable from the data:** the outer failure handler overwrites `errorMessage` with `lastError.message`, destroying any `SCENE_DROPPED` marker (so `dropped=0` proves nothing), and nothing records whether a softened retry was attempted. **The likely cause, stated as a hypothesis rather than a finding:** the stills passed first time this run, so `sceneSoftened` was empty and the video kept the original scene text - the propagation only helps when a still was softened, and here nothing needed softening but the video still tripped the filter on the same phrase. That points at **moderation tuning for video**, not at the fallback's scope.

**Open, in order:** (1) stop overwriting `errorMessage` so a drop is visible; (2) record whether a retry was attempted and what text it used; (3) decide whether video prompts should be softened proactively - the still's text passes and the video's does not, so the difference is the motion/camera additions crossing a threshold. Next full run: **~720 credits**.

**Instrumentation fixed first, and the fourth run's silence is now explainable.** The read found four writers of the asset's `errorMessage` and one of them — the outer `if (!ready)` failure handler — ran **after** the drop and overwrote `SCENE_DROPPED` with `lastError.message`. That is why `dropped=0` proved nothing. **Drops are now structured:** `creative_production_runs.droppedAssets` (JSONB, `[{sceneId, kind, reason}]`) and `moderationRetries` (INT), both written at finalisation, plus a guard so the failure handler keeps a drop's reason instead of erasing it. **Retries are observable:** every softened retry increments the counter and logs `asset=<id> kind=<K> attempt=<n> rewritten=true softenedChars=<n>` — counts and length, never prompt text, because moderation terms are content. **The proactive-softening decision is recorded as the next step, not implemented:** a **pre-flight moderation check is feasible and free** — `moderatePrompt` is the function `assertPromptAllowed` already calls, so the composed video prompt can be checked *before* the charge and softened before submission. That converts a **paid rejection into a free refusal** and is a better shape than proactive rewriting, which would alter every video prompt including the ones that would have passed.

**Still open:** the fifth run, now able to say what it did. Cost **~720 credits**.

**Pre-flight moderation shipped, and it answered the video hypothesis for free.** The check now runs on the composed prompt **before** the ceiling guard and the charge: a rejected prompt gets one softening attempt and is re-checked; if it still fails, the asset is refused with `PREFLIGHT_REFUSED kind=<K> reason=<r>` and **nothing is charged and no provider call is made**. A passing prompt behaves exactly as before. **The free finding:** moderating run 4's own composed prompts showed **SCENE_01's still ALLOWED and its video FLAGGED** for the same scene text - hypothesis **confirmed**. The video prompt differs only by `Motion sequence` vs `Key visual` plus the `Camera:` line, and the flagged phrase is the scene description itself (*"Character Lighthouse Keeper Finds An Injured Bird: A lighthouse keeper finds an..."*). SCENE_02 was flagged in **both** arms, which is consistent with run 4 having softened that still and having never softened its video.

**Cost:** the hypothesis was answered for **0 credits**. The fifth run now buys a different thing: a film whose prompts are known to pass pre-flight before a single credit is spent.

**Whole-film pre-flight run free, and it found the reason four runs paid for rejections: the softening never worked.** Moderating all eight composed prompts (four stills, four videos) before any spend: **5 pass, 0 soften, 3 refused**. Every refusal reported **`no_rewrite`**, and the read explains it - `suggestSafeRewrite` returns `{ flaggedPhrase, safeRewrite }`, while **every caller read `.rewritten`**, a field that does not exist. The fallback has been a no-op since it was written, and the pre-flight inherited the same wrong name. **Fixed** (code, no spend): both call sites read `safeRewrite`. **Two further findings the table produced:** the `VIOLENCE_REPLACEMENTS` map has **no rule for the injury phrasing** this story uses (*"injured bird"*), so even a working rewrite would be offered nothing; and the moderation result is **not deterministic** - SCENE_04's still was refused in the first table and allowed in the second, minutes apart, with no prompt change. **Decision: do not run the fifth film.** Three of eight assets are refused with no rewrite available, and one asset flipped state between identical checks, so ~720 credits would buy a documented partial judged by a flaky filter. **Next, in order:** extend the replacement map for injury phrasing; treat pre-flight as a sample rather than a guarantee (repeat or accept variance); then run.

**Injury phrasing now softens, and the filter measured stable over 24 checks.** The read found the map was a flat term->replacement list of graphic-violence words (gore, decapitation, disembowelment) with **no injury entry**, and that `suggestSafeRewrite` only rewrote **inside the flagged clause** - so when moderation flagged the composed prompt for a combination rather than a word, the injury phrase was never touched. **Both fixed:** injury terms map to narrative-safe alternatives (`injured`->`fragile`, `wounded`->`fragile`, `blood`->`marked`, `bleeding`->`resting`, `hurt`->`troubled`), chosen to keep the sentence legible, and the map is applied to the **whole text** rather than the flagged clause. **Genuine violence is untouched:** gore, decapitation and the rest still flag on the blocklist and still map to their own replacements - the two directions are tested.

**Stability table (3 repetitions x 8 assets, 24 checks, 0 credits):** with the new map, **4 pass, 4 soften, 0 refused, 0 flips** - `SCENE_01 VIDEO`, `SCENE_02 IMAGE`, `SCENE_02 VIDEO` and `SCENE_04 IMAGE` all soften deterministically. Against the old map the same run gave 4 refused and still 0 flips, so the earlier SCENE_04 flip looks like a sample artefact rather than a genuinely unstable filter. **Decision:** with every asset passing or softening and no flips, the fifth run is worth **~720 credits** and belongs to its own session, which re-runs this table first.

**Fifth run: the pre-flight worked on real money, and the film stopped on the provider account.** Gate re-established on the deployed build (`35066c5`): **4 pass / 4 soften / 0 refused / 0 flips** across 24 checks. The run then produced **6 of 8 READY** - `SCENE_01` and `SCENE_02`, the two scenes every earlier run lost to moderation, are now **READY** because the pre-flight softened their prompts before the charge (`moderationRetries=3`, three `preflight=softened` lines, no refusals). **The two failures are not content and not the cap:** `SCENE_04` IMAGE failed with **`Forbidden`** and its VIDEO with **`fal video disabled: account locked or balance exhausted`**. Net spend **840** of 1680 (balance 1,720 -> 880), status `PARTIAL`, `droppedAssets=null` because nothing was dropped - the provider refused. **Phase 7 stays open on an external blocker, named:** the fal account is locked or out of balance, so no further generations are possible until it is restored. Remaining cost to finish the film: one scene, ~280 credits, once the account is live.

**Blocked on the provider account, confirmed by the operator.** Asked before probing; the answer was that the fal account is **still locked or out of balance**, so this session spent nothing and attempted nothing. No code path can move this: the run needs one still and one video for `SCENE_04` (~280 credits) and the provider is refusing every request with `Forbidden` / `account locked or balance exhausted`. **Everything on our side is ready** - the 24-check pre-flight gate holds (4 pass / 4 soften / 0 refused / 0 flips on the current build), `SCENE_01`-`SCENE_03` are READY, and the run resumes rather than restarts. **The next action is topping up the provider account, not another session.**

**Phase 7 complete: all eight assets READY, on a resumed run that cost 280 credits instead of 560.** Funded provider account, gate re-run first (`SCENE_04` IMAGE and VIDEO both `pass pass pass`, 0 refused / 0 flips), then **only SCENE_04** was targeted on the existing project - the six READY assets were not re-spent. Run `COMPLETED`, **8 of 8 READY**, net **280** (balance 880 -> 600), ceiling 1680, `droppedAssets=null`, `moderationRetries=0` because SCENE_04's prompts passed moderation clean. **Cumulative measured spend across six runs: 4,320 credits** (920 + 840 + 720 + 720 + 840 + 280). The film is in **REVIEW**, which is the state from which a creator approves and exports. **One data-hygiene defect found at the end:** the two SCENE_04 rows are `READY` with URLs but still carry the previous run's `errorMessage` (`Forbidden`, `fal video disabled`), because a successful regeneration overwrites status and url but not the old error text - a future reader would see half a story.

**Stale error text fixed.** The read found the success update wrote status, url, provider and thumbnail while leaving `errorMessage` untouched, so a regenerated row could be `READY` and still name the failure it replaced (`Forbidden`, `fal video disabled`). The three states are now explicit builders: `readyPatch` (with `errorMessage: null`), `failurePatch` (writes its own reason), `generatingPatch` (keeps the prior error until the attempt resolves - clearing at start would lose information a reader needs mid-run). **Priority, stated:** 97 places read `errorMessage` (diagnostics and output services among them), so this is a reporting defect, not a cosmetic one. **The run row does not share it:** `lastError` is written on every finalisation with the current stop reason, so a clean resume sets null - checked, not assumed.

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

**Read for the next session.** Optional, and the plan still says so. Its dependency is **Phase 1** (references feed the operator), and its capability - motion transfer and masked object replacement - is a **provider capability this layer does not expose**: the generator has no motion-transfer or inpainting argument, so it carries the same three-part shape as the LoRA blocker (provider parameter, model or mask storage, strength/region threading). **Worth doing when** the studio promise is otherwise complete and a provider exposes the operator; **not worth doing** as a workaround built on prompts.

## Phase 9 — Academy content tied to the surface

**Read for the next session.** No new capability; **twelve lessons in four modules**, each tied to a control a creator can reach, depending on Phases 1-5 having shipped. **This is content work gated by surface existence, not engineering** - the code it teaches already exists, and the risk is writing lessons for controls that are only partly proven (Phase 1 is still externally blocked on thin-intent input, with 3 of 7 measured beats clearing the floor).

**Recommendation, from the plan's own ordering and dependencies:** **Phase 9 next.** Its dependency (Phases 1-5) is met where it matters and is content-shaped, while Phase 8 is explicitly optional and blocked on a provider capability that does not exist yet. The caveat is Phase 1: lessons should be written against controls proven on real input (Phase 4, 5 and 7 are), not the identity store's unproven half. **Not started this session** - the choice belongs to the next one, made with this read in hand.

**Shipped: twelve lessons in four modules, each tied to a control that exists.** `RUSH_CONTROLS_COURSE_TEMPLATE` in `lib/creative/academy/`, exposed through `academy.templates.rush` so it is reachable where the other templates are. Modules: getting started (auto mode, its decisions, reading the result), directing (per-shot, the take model, the critic), look and feel (saving, applying, and the measured finding that a look can lower the score), finishing (the credit cap, pre-flight moderation, assembly and publishing). **Every lesson carries a control id, a reachable-at string and a code marker**, and a test asserts each marker is present in the file it claims - `schemaScope`'s shape, so a removed control fails CI rather than surprising a learner. **Excluded by design and tested as absent:** LoRAs, the motion/object operator, and the identity store - lessons must not promise what the code cannot deliver. **The Noir finding is taught honestly**: the lesson states 80/85/85 without a look against 70/75/75 with it, and says a look is a choice with consequences rather than an upgrade.

**Goal.** Curriculum that teaches the controls that exist.

**What it changes.** Twelve lessons across four modules, each tied to a shipped control from
Phases 1–5 — building an actor, holding continuity, choosing a camera and lens, taking over the
edit.

**Exit criteria.** Twelve lessons / four modules, each referencing a control a creator can
actually reach.

**Dependencies.** Phases 1–5 shipped. Curriculum follows surface, never precedes it.

**Does not do.** No new product capability.

---

## Phase 10 — Longer-form video

**Goal.** Decide, then build, longer-form generation using a provider that offers realtime sessions rather than one-shot clips.

**Verified before scheduling (three facts, each measured):** a **15-minute realtime session** is available; it costs **~$0.05 per
second**; and the provider accepts **live prompts and mid-generation keyframes**, which is what makes directing during generation
possible rather than only before it.

**Decisions the phase needs before any build.** *Does the take model survive?* A continuous session has no natural shot boundary, so
either takes become time-ranges in one session or the model is bypassed for this path — and the second answer invalidates the per-shot
machinery Phase 4 proved. *What is the credit rate per second?* Existing rates are per asset; a per-second rate changes the cap
arithmetic, and the cap is the only thing that has ever prevented an unbounded spend. *Does the product want a live directing surface?*
That is a product decision, not a capability question: realtime supervision is a different product from "render my film".

**First deliverable: a memo, not a build.** **Prerequisite:** the memo cannot be written well until the take-model question is
answered, because every cost and cap figure depends on whether a session is one unit or many.

---

## Phase 11 — Homer: the storytelling engine

**Naming caveat, preserved.** "Homer" is **not in this record** — the name is the operator's, and the entry maps it to the components
below. **Alias recorded: `homer.20` is a phase version marker** (the operator's answer, not an inference). The first session confirms
or corrects the mapping.

**What it is.** The story-intelligence cluster that takes a creator from an idea to a plan: intent interpretation, guided questions,
story text, beat planning, cast derivation, and the director's instruction parsing.

**What exists and works, each with a session behind it.**

| component | state |
|---|---|
| intent interpretation | `canAutoDecide` + `autoResolveIntent`, which refuses rather than inventing an answer |
| story text | chain: Claude → OpenAI-compatible → deterministic fallback |
| guided questions | generated and answerable, with a deterministic fallback |
| beat planning | `planStory` → blueprint; `sceneDerivation` → one scene per beat |
| cast derivation | `deriveCast` / `extractSubject` — a parser |
| story DNA | `StoryProject.storyDna`: theme, tone, hero, goal, conflict, resolution, arc, palettes, camera language |
| classification | keyword counter + narrative-form rule; the 12-field `EducationalContract` on the education path |
| director | `interpretDirective` over STORY / CHARACTER / VISUAL / SHOT |
| moderation | `suggestSafeRewrite` with a flagged-phrase locator |

**Named gaps — each from a measured failure, not an impression.** *The chain is invisible:* which model answered is not recorded per
project and not visible to the creator, and the canary rollout (Claude at 10%, allowlist) means two creators get different engines and
neither knows. *The cast extractor is a parser:* it split on "and"/commas and produced **Confrontin**; the LLM path works at 38/38, the
parser is only the fallback, and nothing in the story path requires the model to name characters. *The story path has no contract:*
education has twelve fields with per-field scoring while story has `storyDna` and no contract the generator must satisfy — no stated
requirement that a story contain a conflict, a turn, and a resolution. *The question flow is one-shot:* generated, answered, discarded,
so a refinement cannot refer to "the lighthouse idea you mentioned". *Refinement is paragraph-level:* `rewriteParagraph` rewrites one
paragraph; there is no "this draft lost its middle" operation and no critic for story text the way there is for images. *Moderation
interrupts rather than guides:* a flagged idea gets a replacement map, and the guide does not help reshape an idea that is structurally
problematic. *The classifier counts keywords:* fixed for the teach case, still a counter.

**Decisions the phase needs before any build.** Which model answers, and is it visible (a per-project record surfaced to the creator)?
Does the story path get a contract, and with which fields — with the arc's warning attached: **a contract that names shape without
naming content is the template defect wearing a schema**. Is memory per-project or per-creator? Does Homer critique — and if so, the
constant-90 critic is the cautionary tale for how a badly built one behaves.

**First deliverable: a read.** Locate the components, inventory the chain, confirm the mapping. No build until the inventory exists.

**Read complete — the inventory exists, and it corrected one gap.** Every component located, with the file and line a later session can
start from.

| component | where it lives | state confirmed |
|---|---|---|
| intent interpretation | `creative/auto/resolve.ts:56` (`autoResolveIntent`), reading `canAutoDecide` on questions minted in `creative/intent/interpreter.ts:260,268` | refuses rather than inventing an answer — the flag is on the question, and the resolver honours it |
| guided questions | `creative/intent/interpreter.ts:250` (`buildQuestions`), deterministic fallback `storyTextService.ts:298`, route `story.generateQuestions` (`routers/story.ts:4107`) | generated, answerable, with a fallback |
| story text | `storyTextService.ts:611-615` — `ClaudeNarrativeEngineProvider(OpenAICompatibleStoryTextProvider)`, behind `STORY_NARRATIVE_ENGINE_ENABLED` + `CLAUDE_API` | the chain is exactly Claude → OpenAI-compatible → deterministic |
| beat planning | `creative/intelligence/storyAdapter.ts:28` (`planStory`), then `lib/story/sceneDerivation.ts` | blueprint, then one scene per beat |
| cast derivation | `creative/intelligence/service.ts:89` (`deriveCast`), splitting on `\s+and\s+|,\s*` at `service.ts:70` | a parser, as recorded — the split is the mechanism that produced Confrontin |
| story DNA | `StoryProject.storyDna`, consumed by the critic and the prompt composer | present, not enforced |
| classification | `creative/intent/interpreter.ts` keyword counter + narrative-form rule; `EducationalContract` (12 fields) on the education path | as recorded |
| director | `creative/director/interpreter.ts:22` (`interpretDirective`) over STORY / CHARACTER / VISUAL / SHOT | as recorded |
| moderation | `promptModeration.ts:200` (`suggestSafeRewrite`) with the flagged-phrase locator | as recorded |

**Correction, preserved rather than deleted:** the gap list said *"which model answered is not recorded per project"*. **It is recorded.**
`StoryChapter.providerMetadata Json?` exists in the schema, and both chapter-creation paths write it — `routers/story.ts:4309` (chapter one)
and `:4736` (continuations) — carrying `provider: 'claude-narrative' | 'openai-compatible' | 'local-fallback'` and the model. **The real gap
is narrower and worse:** the record exists and is read **only by `/admin/prompt-quality`**, so an admin can see which engine wrote a story
and its creator cannot. The defect is not a missing record; it is a record with one reader who is not the person it is about.

****Shipped: the engine record reaches its creator, and the contract decision is taken (content, not shape).** *The engine record:* the read
found it existed and had one reader who was not the person it is about. `chapterSelect()` in the story router now selects
`providerMetadata`, and `apps/web/src/lib/storyEngine.ts` maps it to plain language per chapter — **Claude**, **an external language
model**, or the **built-in story writer with no language model used** — rendered on the story screen and **hidden on R16** (model metadata
is not shown to kids, consistent with the R16 rule). Two rules hold it: all three providers render **distinctly** (the deterministic
fallback is never dressed as Claude or as a generic "AI"), and a chapter with **no metadata renders nothing**, because absence is not
evidence of a particular engine. **9 tests.** *The contract decision, recorded and not built:* the operator chose the **content contract**
over shape-only and over the status quo. **Its fields, named:** `protagonist` and `want` (who wants what) · `obstacle` (what blocks it) ·
`turn` (what changes) · `resolution` (answered, denied, or transformed) · optional `sensoryAnchor` per beat, which the Claude narrative
prompt already asks for. **Two constraints bind the build:** it must be scorable the way the rewritten progression scorer scores — content
presence and coverage, never `sections.length === 4` — and it must **fail closed on a story with no resolution**, the same defect as a
lesson with no ending. **The shape-only trap is named with its three precedents:** the six-card template, the seven-slot progression, and
`scenes.length === 6` were each shape contracts that looked like requirements and measured conformance. **Nothing is built this session.**

**The read that gates the contract, done — and it changes the build.** The earlier note said the five contract fields "need fields the
schema doesn't have". **That is true of columns and false of data**, and the difference decides the build. `StoryProject.storyDna Json?`
already carries `hero`, `primaryGoal`, `conflict`, `resolution`, `characterArc`, plus theme, tone, palettes and camera language. So the read
went to the writer, `buildStoryDna`:

- **it takes no chapter body** — the function cannot read the story it summarises;
- `hero`, `primaryGoal`, `theme`, `tone`, `visualStyle` come from the idea, character memory, or **constants**;
- `conflict` and `resolution` are the first **scene-seed title** matching `/problem|challenge|trouble/` and `/ending|happy|finish|home/`,
  and when nothing matches they fall back to **constants** — `"a gentle obstacle to overcome"` and `"a positive ending with learning"`.

**So `resolution` can never be empty.** A contract that scores its presence would pass every story that exists, including one that stops
mid-sentence: it would be measuring a plan written before the story. That is `scenes.length === 6` in a schema, which is exactly the trap
the decision was meant to avoid. **The test that settles it** (`storyDnaProvenance.test.ts`, 7 assertions): with no scenes at all the field
still reports the constant; with an "Ending" scene it reports that scene's description; and no input produces emptiness. The function's
signature is the structural proof — no body, no extraction.

**Consequence for the build, stated before it starts:** the content contract must read the **chapter body**, not `storyDna`. It is a
contract **plus a re-plumbing of where the fields come from** — a body-reading extractor for `protagonist`/`want`/`obstacle`/`turn`/
`resolution`, with the fail-closed check on resolution, and `storyDna` left as the plan summary it actually is. The earlier phrasing is kept
above and corrected here rather than deleted.

**The content contract is built as a module, with its three decisions recorded and one seam named.** *Mechanism:* a **model call with a
required abstain** on the narrative chain — a regex over the body was rejected for the same reason a regex over scene titles was: it produces
a resolution for a story that has none. The deterministic tier **returns null for every field** rather than fabricating a contract. *Timing:*
**generation time**, one extraction per chapter, stored, so scoring is a read and the same story is never extracted twice. *Storage:* a new
**`StoryChapter.storyContract Json?`** column (migration `20261112120000_story_contract`), separate from `storyDna`, which stays the plan
summary it is. *The extractor* (`lib/story/storyContract.ts`) takes **the body and only the body** — no scenes, no idea, no interpretation —
and its output has five independently nullable fields plus optional sensory anchors. The abstain is the foundation and it is **tested, not
requested**: no model → all null; malformed response → all null; a resolution without a valid `outcome` → treated as absent. *The scorer*
reads content presence and coverage only: it measures `protagonist`, `want`, `obstacle`, `turn`, `resolution`, and it **does not read the
body, paragraphs, sections, beats or word counts** — the three shape precedents (six-card template, seven-slot progression,
`scenes.length === 6`) are named in the test that forbids them. *Fail-closed:* a **null resolution fails**, and its reason is reported
first, before the other four. **14 tests.** *Free proof, two stored bodies, no live model calls:* complete → all five fields, `pass=true`;
truncated → `turn=null`, `resolution=null`, `pass=false` with `RESOLUTION_MISSING`; no model → all null, fail. **The honest limit:** our layer
guarantees that absence of a model or an unparseable answer never yields a contract, but it **cannot verify that a live model abstained
rather than fabricating valid JSON** — that needs a dual-extraction or human spot-check later, and it is named rather than assumed. **Seam
named:** the extractor is not yet called at chapter creation, and the migration is written but applied nowhere, so generation-time storage is
the next wiring step.

**The contract is wired at generation, and the fabrication question is decided (evidence quoting).** *Wiring:* both chapter-creation
paths — chapter one and continuations — call the extractor **before the write**, on the body that is about to be stored, so what is read is
exactly what is stored. The extractor reuses **the same narrative chain** through a new `completeText` on `StoryTextProvider`: Claude first,
OpenAI-compatible behind it, and the **deterministic tier returns null** — the abstain, not a fabrication. *Versioning:* the stored contract
carries **`extractorVersion: 1`**, so the tightening below can find the rows written under the looser rule; this is the `errorMessage`
staleness class anticipated rather than discovered. *Distinguishability:* `describeStoredContract` reads a stored value as **`absent`**
(column null — never extracted), **`failed`** (`extractedBy: 'error'`, fields null), or **`extracted`**. A failed extraction is **stored**
rather than dropped, so `null` in the column can only mean "never read" — the difference between a gate and a blank wall. **20 tests.**
*Migration applied and verified:* `story_chapters.storyContract` exists as nullable `jsonb` per **`information_schema`** (not the tool's
exit code); 203 existing chapters are therefore `absent`, which is the correct reading rather than a failure. **Fabrication decision, not
built:** **evidence quoting** — the extractor must return the sentence it read each field from, and the scorer checks
`body.includes(quote)`. Chosen over dual extraction (2× cost, and two models can both invent) and same-model-twice (~2× and consistent
fabrics survive). Its failure mode is named honestly: a **real sentence that is not a resolution** passes the substring check — rarer and
harder than inventing a field, but real. A field whose quote is missing from the body is treated as **absent**, and the scorer's reason must
distinguish extraction failure from story failure, which is what `describeStoredContract` now makes possible. **The build is deferred** until a
live chapter exists to test the tightening against. *Consolidation, not a new rule:* "built but not wired" has now appeared four times — the
director, the educational derivation, the balance pill, and this contract — and it is one pattern: a component proven in isolation reads as
finished until someone asks what calls it.

**The scorer has a caller, and the per-chapter rule is settled.** *First, the honest record:* before this session `scoreStoryContract`
had **no caller** — the fifth instance of "built but not wired", occurring in the very session that consolidated the pattern. That is now the
cleanest evidence the pattern is about asking *what calls this* rather than about any component: the scorer was written, tested against a
complete and a truncated story, and never invoked. *The rule:* **the last chapter decides resolution; earlier chapters contribute the
stakes.** A five-chapter story legitimately has no resolution in chapter 2, so "any null fails" would fail every real multi-chapter story;
"any chapter resolves" would pass a story that resolved in chapter 3 and kept going. The evaluator reads chapters in `chapterNumber` order,
merges `protagonist`/`want`/`obstacle`/`turn` from any extracted chapter, and takes `resolution` **only from the last**. *Three states, not
two:* `pass`, `fail`, and **`unscored`** — an absent contract means nobody read the chapter, and a failed extraction means the reader broke,
so neither is reported as "the story has no resolution". `needsExtraction: true` is the signal a future trigger can act on. *The 203 absent
chapters, decided:* **lazy extraction** — judged when next looked at, never in a batch nobody asked for; exempt/unscored until then, and
backfill (203 model calls) rejected on cost. The trigger is deferred because the workspace read must not write, and that is named rather than
implied. *Wiring:* `story.getWorkspace` now returns `contractEvaluation`, the place a creator asks whether the story is complete; the reason
order is unchanged — `RESOLUTION_MISSING` first. *Free proof, three stories, no live calls:* complete 3-chapter → `pass`; truncated final
chapter → `fail` with `RESOLUTION_MISSING`; absent → **`unscored`, not a pass**, with `CONTRACT_ABSENT`. **28 tests.**

Two gaps re-checked and standing:** the cast extractor is a parser (the `and`/comma split at `service.ts:70` is the Confrontin mechanism),
and the story path has no contract — `storyDna` is stored but nothing requires a conflict, a turn or a resolution.

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

## Sequence determination

**Status.** See [history — Sequence determination](roadmap-history.md#sequence-determination--status-notes).

Read from the plan and the history, not from any session summary. Every classification cites its evidence.

### The next phase: **Phase 2 — Take model (remaining work)**

Exit criterion: *"Change scene 3 → only scene 3 re-renders and the film re-assembles; the other scenes keep their existing takes."*

What was missing was **evidence**, not code. It now exists: `exportTakeComposition.test.ts` drives the renderer's own cache decision across three arms and asserts **hit = N−1, miss = 1**, that the missed key is scene 3's and not another segment, that the assembled timeline signature is identical, and that the source hash changes only because scene 3 changed. Phase 2's exit criterion is met **by construction and now by test**.

Dependencies: met (Phase 1's reference store exists; takes exist on both tables with project-scoped constraints).

**Named defect, closed: ****************Educational scenes are wired: clamped at natural breaks, and `isLast` indexes the selected length.** *The maxima's provenance,* recorded before clamping: `directedSceneSchema`'s 120/120/200/400 are **prompt-response limits** - they mirror the JSON shape the scene-director prompt asks for - not numbers derived from the template's content, so clamping the derived value is the right direction rather than raising the schema. *Clamp direction:* truncate at a **natural break** (`;`, `,`, `.` or word boundary) and mark the cut with an ellipsis, which is the title rule applied to every derived field - never a mid-clause cut. *The `isLast` defect:* it indexed the caller's `count`, so a lesson compressed below that budget had its recap present but never labelled `RECAP`; it now indexes the selected length. *The caller's `count` is kept as a legitimate budget* and honoured by **compression** (first and last whole, middle bucketed), never by slicing. *Consolidation, not a new rule:* the `7` cut the recap, the scorer's `6` rewarded the template, and `count` labelled the wrong scene - **one class: a number describing something other than what it indexes.** *Free proof:* short 2-concept lesson -> 3 scenes, 2/2 concepts covered, recap labelled last, opening `Hey explorers - why does lava reach the surface?`; long 10-concept lesson at budget 6 -> 5 scenes, **10/10 concepts covered**, recap labelled last, max field 144 (inside every maximum).

The progression scorer now measures content, not shape.** It awarded a point for `scenes.length === 6` and another for the template string starting with `hook`, so **any lesson scored 5/5 for matching the template** - the constant-90 critic's exact failure, and the `6` was the fourth instance of this arc's template-number class. Rewritten to score the lesson against itself, scaled to 5: **concept coverage** (how many of the contract's key concepts appear in a scene), **examples used**, **recap present exactly when `recapIncluded` says so**, **hook derived** (the first scene opens with a question when one derives), and **wholeness** (every scene narrated). A variance test asserts two different lessons produce different contracts rather than the same score. *The nine, bucket by bucket, recorded before any move:* **template** - scene count, `Scene 5`, `Scene 6`, progression score, HOOK-first/RECAP-last; **`directScenes`' own** - expected-number-of-scenes (a **caller-supplied count is legitimate**, and the derivation honours it by compression rather than truncation), `directedSceneSchema` (validates shape, with field maxima of 120/200/400 that a joined purpose can exceed); **mechanism, not template** - recap narration (real: the lesson must end by recapping) and child address (real: the child is addressed, now inside the question). *Wiring, fifth stop:* the derived mapping exceeded `directedSceneSchema` maxima on `title`/`action`/`purpose` and needed a clamp pass and an `isLast` fix that indexes the selected length rather than `count` - a real change, not a test move - so the provider was reverted again to keep the suite green and the work is enumerated rather than half-landed.

The last template number is removed, and the scoring defect is named.** *The count's provenance:* the educational path computed **`Math.min(input.sceneCount, 7)`** at two sites - the hard `7` being the seven-entry template's slot count, not a product limit - and sliced the derived purposes by it. **The harm, proven first:** a ten-concept lesson derives **11 scenes including its recap**, and `slice(0, 7)` removes the ending entirely; the test asserting both is in the module. The caps are removed, so `count` can no longer cut a lesson's ending. *The scoring defect, named not fixed:* the progression dimension awards a point for **`scenes.length === 6`** and another for the template string starting with `hook`, so a lesson scores 5/5 for matching the template rather than its own content - **the same class as the constant-90 critic**, and a measurement defect rather than a stale assertion, because it reports a number that looks like quality. *Wiring, still not done:* turning the derivation on makes **9 tests red** across three files; five are the template asserts this arc has moved before, and four are `directScenes`' own count and `directedSceneSchema` tests plus the recap-narration and child-address mechanisms. **Consolidation, not a new rule:** the six-card list, the R16 `6`, and this `7` are **one class** - a template number surviving the template that produced it - and each was found the same way, by asking the number where it came from.

The opener is ruled: question first, with the address as a vocative inside the same sentence.** The operator rejected all three offered shapes and specified a fourth - *"Hey explorers - why does lava reach the surface?"* - because the question is what the sentence is doing while the address is a marker within it, so **neither the hook nor the relationship is dropped and it costs no time** (the objection to two opening sentences). Implemented as `composeLessonOpening({ hookLine, address })`: one sentence, hook continued in lower case after the vocative; address alone when no hook derives (no manufactured question); null when neither exists. **22 tests** in the module. **The seven-test read, classified before touching anything:** stale-template asserts were the scene count, the index-based `Scene 5`/`Scene 6`, and the progression scoring; intent-preserving were HOOK-first (the learner hears a question before the answer), RECAP presence and the child address. **The progression scoring turned out to be the defect itself** - it awarded a point for `scenes.length === 6` and another for the template string starting with `hook`, so a lesson scored 5/5 for matching the template rather than its own content. **Wiring stopped on a new conflict, recorded rather than chased:** `directScenes` carries its own count and `directedSceneSchema` tests that assert the previous shape, and slicing derived purposes by the old `count` silently dropped the recap. Both are named here for the next session's single pass.

A hook is now derived, as a property of the first scene - built and tested; the wiring needs a narration rewrite, named.** *The read:* `EducationalContract`'s twelve fields carry topic, concepts, examples, strategy and recap, and **nothing that means hook** - no opening question, no stake. So the hook derives from `keyConcepts[0]` rather than from an invented field. *The rule:* a concept already phrased as a question is used verbatim; `X is <predicate> that <verb phrase>` becomes **`Why does X <verb phrase>?`**; `X is <phrase> to <verb>` becomes **`What makes X <phrase> to <verb>?`**; anything else yields **null** - a lesson that opens on its concept is honest, and a manufactured tease is the twenty-second rule's own failure mode. *Built:* `deriveHookLine` plus `hookLine` on the first `EducationalScene`; the recap stays last and **scene count is unchanged** (2-concept lesson: 3 scenes, with or without a hook). **18 tests**, including traceability to the first concept, non-restatement, no generic tease, null when underivable, and a question-concept used verbatim. *Proof, verbatim:* `Why does lava reach the surface?` from `Lava is melted rock that reaches the surface`; `What makes the mantle hot enough to flow?` from `The mantle is hot enough to flow`. *Not wired, again deliberately:* switching the provider to the derived progression turned **7 tests red** across two files - scene count, index-based `Scene 5`/`Scene 6`, progression scoring, HOOK-first/RECAP-last, RECAP narration, and **child-directed-opener** - and the last of those is a genuine conflict rather than a stale assertion: the narration contract wants a child-addressing opener, while hook-first wants the question first. That is a narration-contract rewrite, not a re-point, so it is named and deferred.

Educational scenes: the derivation exists and is tested; the wiring is the remaining work, named.** *The read:* the generator is `educationalSceneProgression` in `localStoryIntelligenceProvider` - a fixed seven-entry list (Hook, Introduction, Core concept, Example, Second concept, Application, Recap) truncated by `slice(0, count)`. **The contract already carried the beats the template discarded:** `keyConcepts` (2-8), `examplesToUse` (max 6), `recapIncluded`, and `learningObjective` - the same shape as `planStory` producing beats that `buildSimpleScenes` ignored. **The eight-cap's provenance:** it is a Zod bound on `keyConcepts` and `sceneProgression`, not derived from lesson length, and the template held seven entries - so it is a schema number with a template's shadow, not a product decision. *What was built:* `lib/story/educationalSceneDerivation.ts` derives one scene per `keyConcepts` entry, in the contract's order, titles in the concept's own words, an example folded into its concept, and a recap scene **only when `recapIncluded`** says the lesson has one. **11 tests**, including a 10-concept lesson producing **10 scenes** (the old ceiling did not constrain the derivation), a two-concept lesson producing **2**, and zero fragments by `isFragment`. **Not wired, and reverted rather than forced:** the provider's educational scene builder assigns teaching roles by index and its narration contract expects Hook-first/Recap-last; switching its purpose source changed **4 regression tests that assert the template**, and the role/narration mapping has to change in the same pass. The wiring is therefore the named remaining work, not a silent one.

The paced path now compresses, and the R16 budget is derived rather than chosen.** *Paced path:* the old merge kept `max-1` beats and joined **all** overflow into one - a batch of five beats wearing a beat's clothes. It is replaced by **`compressToBudget`**, the same helper the scene derivation uses (shared, not forked): first and last item kept whole, middle bucketed evenly. Proof on a 30-beat story at tier MEDIUM: **7 scenes, 0 fragments, ending present**. *R16 budget, and the correction:* the `6` was **introduced by the session that removed the cap** - chosen, not derived - so it was the old limit wearing a new name. The operator's decision: **derive it from the story's length tier**. `kidsSceneBudget(tier)` now returns `STORY_PACE_CONFIG[tier ?? 'MEDIUM'].beatMax`, so a stated length sets the budget and an unstated one falls back to MEDIUM's ceiling rather than to a number nobody chose. Proof: the same 30-beat story produces **7 scenes**, 0 fragments, ending present. *Titles:* the six-word slice could end on `and` (`He carried it down in his cap and…`); labels now cut at a natural break, strip trailing function words, and mark a shortened title with an ellipsis - 3 tests, including that no title ends on a dangling conjunction. *Still named, not fixed:* `educationalSceneProgression` remains a fixed seven-entry template truncated by `slice(0, count)` with `sceneProgression` schema-capped at **8**.

Verification of the scene fix: the merge, the educational path, and every place that assumed six.** *The merge:* `mergeBlueprintBeatsToMax` keeps the first `max-1` beats and joins **all overflow into one final beat** (`' Then: '`). It runs only when `storyLength` is set on the paced path - verified by the free proof: an un-paced 30-beat story reaches derivation as **30 beats and produces 30 scenes**, so the merge is off there. On the paced path it is still lossy-by-design: it batches overflow into a single beat, which is a blueprint-size limit expressed as a merge rather than a batch. *The educational path is the same defect, second instance, named and not yet fixed:* `localStoryIntelligenceProvider.educationalSceneProgression` is a **fixed seven-entry template** (Hook, Introduction, Core concept, Example, Second concept, Application, Recap) truncated by `slice(0, count)`, and `sceneProgression` is capped at **8** in the schema. A lesson's scenes are therefore chosen from a list, exactly as a story's scenes used to be. *Assumed-six inventory, complete:* `DIRECTOR_MAX_SCENES = 6` and the director page's `maxScenes ?? 6` (a **separate feature**, a legitimate product limit for prompt-based direction), `suggestions.slice(0, 6)` and the admin prompt-quality `slice(0, 6)` (list lengths, not scenes), the six-word title slice in `sceneDerivation` (word count), and no scene-specific UI grid - the grids found are usage and profile layouts. *The free proof, two real stories:* general 30 beats -> **30 scenes, 30 traceable, 0 fragments, ending present**; R16 30 beats at budget 6 -> **6 scenes, 0 fragments, ending present**. *Named follow-up, not fixed:* derived titles are six-word slices and can end mid-phrase (`On the third winter he found`), which reads as a truncation even though the scene body is whole.

scene generation was template-driven, not story-derived.** The read confirmed it at `buildSimpleScenes`: a fixed six-card array - school (`Home`, `Road to School`, `School Gate`, `Classroom`, `Problem`, `Happy Ending`) and general (`Beginning`, `First step`, ...) - sliced to a count that defaulted to 6, with only one description touched by story text. **A template and a derivation produce the same shape of output; the labels are what tell them apart**, and the labels said template. The six lived in three places: the default parameter, the template arrays themselves, and a **floor** (`Math.max(beats.length, 6)`) that padded short stories up to six. **Fixed:** scenes now come from the chapter's own beats (`lib/story/sceneDerivation.ts`), one scene per beat, titled with the beat's words; the floor is gone so a short story produces few scenes and a long one produces many. **R16 compresses before splitting** - first and last beat kept, middle condensed into whole sentences, never a tail cut - because a film whose last beat was removed has no resolution, which is worse than a gap. The gap mechanism was **merged/truncated beats**, not a filter: the pace cap merged overflow beats and the template sliced what remained.

### Debt-to-phase mapping

**Row-level guard in the admin users table (named, not urgent).** `684f380` made each `<tr>` navigate to the user detail page. Two interactive elements inside that row - the **Credits button** and **`RoleSelect`** - carry their own `stopPropagation` since #379: **each element guards itself.** A third interactive element added to that row reintroduces the bug, because the action fires and then the row's `router.push` unmounts it. The durable shape is a **row-level guard** that checks whether the event target sits inside an interactive element before navigating. The two known cases are closed; this is named so the next element added there does not rediscover it.

**Balance invalidation is absent system-wide (named, not urgent).** No charge mutation invalidates `user.creditBalance`: `/generate` refetches by hand and `CreditBalancePill` refetches on focus and every 30 seconds. A future consumer that trusts cache invalidation will show a **stale balance after every spend**. This is the **sixth instance of the staleness class** - a value that renders once and is trusted thereafter - alongside the constant-90 critic, the cached feature flag, the truncated derivation, the reused export row and the stale `errorMessage`. The pill's interval is a **compensation, not a fix**: the durable version invalidates the balance query inside the charge mutations themselves, after which the interval becomes redundant rather than load-bearing.

**One consequence worth stating:** Phase 2 is the next phase, and **no debt blocks it**. The two debts that are prerequisites (planner persistence, the eight failure lines) gate Phase 3 re-entry and Phase 0's closure respectively — so they can be worked in parallel without delaying the sequence.
