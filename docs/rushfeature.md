# Rush Parity Roadmap

A planning document. It records the ordered phases by which Raivstream can match the promise
of rush.film, and names explicitly what is deferred and why. No phase here is complete; this
is a plan, not a changelog.

**Start with the phase template** (below, "Phase template"). It exists because silent failures
were found the hard way: a scoring gate that echoed its own prompt, a behaviour flag that was
true in the database and false in the code, a cache key that did not cover a
behaviour-determining input, a commit that landed on the wrong branch. Each cost real time or
real credits.

Those four are **recent instances of a longer pattern, not a list of four mistakes**. The same
class predates this stretch: the 2026-10-13 migration incident (a `.hold` directory rename and a
partial migration deploy) and the `WEB_TC=1` / `API_TEST` gate that printed a failure and was
merged past. The pattern is months old and recurs; that is why the template is a control rather
than a postmortem. Use it rather than rediscovering them.

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

**Phase 3 (2026-11-01) — SHIPPED. Read outcome: sprint, not project.** The 5.0 layer is fully wired
(twelve `RAIVSTREAM_5_*` env flags, twelve creative subrouters, no stubs) and `/create` already exists and
is linked from the Navbar, so with flags off the route was live but every call failed with "Raivstream 5.0
is not enabled". Enabled the core chain in production (master, create, intent, bible, preview, production,
director, review, approval, output), leaving **studio, series and audio off**; verified the flag in the
running process (`pm2 jlist` on web and worker), then verified the gate opens (`creative.project.create`
succeeded and `list` returned 1). Health 200, `/create` 200. Rollback: remove ten env lines and restart.

**Stage logging (2026-11-02): 4 of 7 shipped, 3 blocked on their own signatures.** `stageLog.ts` helper plus
lines at **plan**, **produce**, **approval** (joining the existing **review** and **output**) — five stages
gated. Not added: `director` (anchor mismatch, not forced), `preview` (script exited early), and
`intent`/`bible` which carry **no projectId** at their boundary — intent runs before a project exists and the
bible helpers take no project id, so they need a decision about what identifies a pre-project stage rather
than a log line. **No re-run**, so all three gates remain unmeasured.

**Critic scores persisted (2026-11-01).** `evaluateWithCritic` now returns `{ findings, provider, scores }`;
`CreativeReviewRun` gains `scores Json?` (additive migration); `ReviewRunState` carries it; the run emits
`[creative.stage] … stage=review … scores={…}`. The drop was in translation, not the provider. Still open:
the eight per-stage `[creative.stage]` lines (intent, bible, plan, preview, produce, director, approval) and
the gated re-run. **Phase 3: functionally proven, unmeasured, one gate closer.**

**Phase 3 measurement fixes (2026-11-01): 1 of 3 shipped, no re-run.** Shipped: `creative_outputs.
durationSeconds` now persists the renderer's **measured** duration in both READY writers, plus a
`[creative.stage] … stage=output` line. Remaining: per-stage `[creative.stage]` lines for
intent/bible/plan/preview/produce/review/director/approval, and critic score exposure — `review/service.ts`
builds from `evaluated?.findings` while the nine scores live on `CreativeCriticRun`, so they are dropped in
translation. **Phase 3 is functionally proven and still unmeasured.**

**First real creator run through the 5.0 chain (2026-11-01): all stages succeeded, three gates failed.** Idea
*"A 30-second animated short about a lighthouse keeper and a lost bird"* → create, plan, produce (after
preview approval), REVIEW, critic findings, director (`affectedSceneIds: ["SCENE_02"]`, LOCAL, version 1),
CREATIVE approval, PORTRAIT + LANDSCAPE outputs both READY. Probe: **514 frames, 17.133333 s, AAC audio** in
both formats. Credits: 640 production, 0 approval/outputs. **Failures named:** no `[creative.*]` log line for
this project (log gate unmet); critic returned findings but **no per-dimension scores** (variation unproven);
**17.13 s against a 30 s idea**, and `creative_outputs.durationSeconds` is null while the file measures
17.133333. **Verdict: functionally proven end-to-end, not yet measured.**

**5.0 env gap closed (2026-11-01), and one false assurance removed.** All fourteen runtime flags are now
declared in `ecosystem.config.cjs` for both apps — ten enabled, three (`STUDIO`, `SERIES`, `AUDIO`)
**explicitly `'false'`** — because pm2 does not read `env_file` and the deploy workflow sources
`apps/web/.env.local` before `pm2 start`. That second fact was the finding: `STUDIO` and `SERIES` were live
`true` in both processes while a test asserted they were absent from the config. **Absence is not off.** The
test now asserts the value (`STUDIO_ENABLED: 'false'`), and the server's `.env.local` no longer carries
them, so the config is the only authority. Verified after a real deploy: core chain `true`, deferred stages
`false`, in both processes. **Ledger writer: blocked on a business input** — 0 subscriptions, 0 paid credit
purchases in 90 days, 108 watch-history rows over 9 videos. The pro-rata input is real; the money side is
empty. Unblocked by a first revenue period or a decision to seed a pool for testing. See the "Ledger Writer:
Blocked On" section in `docs/operations/phase-3.5-watch-scoping.md`.

**Phase 3.5 UI shipped (2026-11-01).** Four pages: `/submit` (effective terms shown before the button,
rejection-finality copy, already-submitted disabled), `/watch` (attribution from the join on every
render), `/filmmakers/[username]` (profile + accepted films, **no earnings panel**), `/admin/films` (queue
with pinned terms read-only, decline disabled until a reason is typed, **no payout field, no re-open**).
Verified live: `watch=1` with attribution `Rotimi Babs`, `filmmaker films=1`, `terms-standard-2026:500`,
`queue=0`; no earnings or payout figure appears in the built output. **Critical finding:** the flag did
**not** survive the deploy — `FILMS_ENABLED` had been exported into a shell and captured by
`pm2 restart --update-env`, so the deploy lost it and the pages returned 200 over empty API responses.
Root: **pm2 does not read `env_file`**; flags must be declared in `ecosystem.config.cjs` (now done for both
apps) or live in the env file the app loads. Ledger writer still pending a revenue period.

**Payout trigger decided (2026-11-01): revenue-period close, pool + pro-rata.** Not on approval (pays
before the film earns anything and makes `shareBps` decorative) and not manual (a placeholder in a money
path). The decision surfaced a gap: **no revenue basis exists** — `WatchHistory` has watch time, not value,
so the writer needs an operator-set `poolCents` per period:
`poolShare = floor(pool × filmWatchMs / totalFilmMs)`, `amountCents = floor(poolShare × pinnedShareBps /
10000)`. A period with no pool pays nothing (and must not mark itself paid); pinned terms are used, per
`termsPinning`. Payment execution is out of scope. **Also decided: a rejection is final for that video** —
`videoId` is `@unique`, and a status reset would erase the review trail and the pin — so `/submit` states
the rule, the filmmaker list offers "Submit a new film", and the admin queue never offers "re-open".
**No UI may preview payouts:** `/admin/films` has no payout field, `/filmmakers/[username]` has no earnings
panel until a period exists. See docs/operations/phase-3.5-payout-decision.md.

**Phase 3.5 ingestion shipped and the acceptance loop run (2026-11-01).** `films` router over
`submissionService`: `currentTerms`, `submit`, `mine`, `approved`, `filmmaker`, `queue`, `review`.
Terms pinned **at submission** (the terms on screen at consent), decline reason required, approval
writes only the submission row. End-to-end on real data: submit → pinned `terms-standard-2026` (500 bps) →
reject without reason refused → reject with reason, **video still APPROVED/READY** → approve on a second
film, **video still APPROVED/READY** → `/watch` `count=1` with attribution derived from the profile →
renaming the profile changed `/filmmakers/[username]` with no video row written. **Operational:** pm2 does
not read `env_file`; `FILMS_ENABLED` must be exported into the environment pm2 launches with (`.env` alone
left it `<absent>` in both processes). **Found by running it:** `FilmSubmission.videoId` is unique, so a
declined film cannot be resubmitted — the filmmaker needs a new video, which is defensible but should be a
stated rule. UI pages (`/submit`, `/watch`, `/filmmakers/[username]`, `/admin/films`) and payouts remain
to build; the ledger table is untouched.

**Phase 3.5 schema shipped (2026-11-01).** `CreatorProfile`, `FilmSubmission`, `RevenueTerms`,
`FilmPayout` added additively (no existing column altered; no call site changed). **Terms pinning decided
and tested before any consumer exists:** a film is paid under the terms pinned at acceptance
(`acceptedRevenueTermsId`), never under the terms effective at payout; `resolvePinnedTerms` consults only
the pinned id and returns null otherwise, with no "latest effective" fallback because that fallback is the
bug. Seven tests: editing the terms table leaves an accepted film's terms and payout unchanged; an
unpinned submission is refused rather than priced; integer basis points floor to the cent. Migration is
additive and **not yet applied** to production. Next: `/submit` + the admin queue, then `/watch` and
`/filmmakers/[username]`.

**Phase 3.5 scoped** — see `docs/operations/phase-3.5-watch-scoping.md`. `Video` is already film-shaped for
playback (`completionRate`, `avgWatchTime`, `engagementScore`), so the gap is **attribution and
ingestion**: `CreatorProfile`, `FilmSubmission`, `RevenueTerms`, `FilmPayout`, four routes
(`/watch`, `/watch/[id]`, `/filmmakers/[username]`, `/submit`), an admin submissions queue with a revenue
terms editor, and three analytics events (`film_submitted`, `film_accepted`, `film_declined`). The
acceptance criterion requires attribution to be *derived* (join, never copied) and approval to **not**
publish.

**Phase 2 complete (2026-11-01) — the flag is default-on for projects that iterate.** Flipped
`takeAwareExportEnabled` using `max(video takeNumber) > 1`: **57 of 166 projects** enabled (the criterion is
take history; 40 of those are also export-ready). Verified after the change: 57 enabled, worker `ready`
with `export_segment_sweep scanned=60 deleted=0`, health 200. The obsolete `RENDER_SEGMENTS_ENABLED` was
removed from the production env — the renderer reads only `CACHE_SEGMENTS_ENABLED`, and the enforcement
test keeps the deleted flag deleted. Reversible with one `UPDATE ... SET = false`.

**Scope, stated once more so it survives the milestone:** the film is still a **versioned snapshot** — a
new take produces a new export row. The take model provides shot-level idempotency and revision
(`takeNumber`, `parentTakeId`, `isLatest`, typed conflict); the **cache** provides the speedup, and does so
independently of the flag. Neither makes the film a mutable entity; that needs a stable film identity and a
live-content policy for swapping takes inside published films, both still deferred.

**Idempotency collapse resolved at the source (2026-11-01).** The UI now sends one
`crypto.randomUUID()` key **per regenerate press**, so two quick presses are two intents and two takes; the
derived 60-second bucket remains only as a fallback for API callers that supply no key. Decision: option 1
(client keys per press) — the bucket stays a safety net, and creator-visible behaviour no longer depends on
it. The flag decision is now policy: default-on for `max_take > 1` is defensible on five projects of
evidence, and the remaining question is which projects should get revision semantics, not whether the
mechanism works.

**Three-project cohort, both arms (2026-11-01) — 3/3 PASS.** Cold `hit=0 miss=5`, `0/6`, `0/6`; new takes
8, 5, 5 each with a parent and `isLatest`; warm `hit=4 miss=1`, `5/1`, `5/1`; every arm gated on
`[export.path] segments=true`. Two GENERAL projects and one KIDS project, so the surface difference is
covered. **Five projects of evidence total.** Harness finding: export eligibility depends on
`audienceMode` vs surface (KIDS exports on R16, GENERAL does not) — the first attempt failed with
"This story cannot be exported on this surface" because the harness passed `isR16: true` for everything.
**Widening proposal:** default-on for `max_take > 1` (40 projects) is now defensible; the one open risk is
that the derived-idempotency bucket collapses two *intentional* regenerations within 60 s into one take.
That is a product decision, not a correctness one.

**Cohort population (2026-11-01, measured before running).** 40 projects meet the original conditions;
38 have no failed generation in 7 days; **9 are cold-eligible** (newest asset newer than newest export);
**7 pass both**: `cmuakvg9u`, `cmubjeepf`, `cmv0wzock`, `cmuh3t0ow`, `cmucb152g`, `cmud2cjve`,
`cmv8feun4`. The two already-proven projects are no longer cold-eligible *because* they were exported —
they warmed their own caches, so consuming a candidate removes it from the pool. Five datapoints is
achievable with seven candidates, but only just, and the selection must be computed at run time.
**Criterion decision:** each project yields two numbers (cold `hit=0 miss=N`, warm `hit=N−1 miss=1`).
Measured as **three projects × both arms** is stronger than five projects × one number, because the arm
pair is what proves the loop; the breadth question is answered by three differently-shaped projects.

**Warm-cache loop, corrected (2026-11-01).** Gates held (`SELECTION_COUNT=5`, `ENABLED=5`). Two of five
projects reproduced the claim with `[export.path] segments=true`: **hit=12 miss=1** and **hit=5 miss=1**.
The other three were unmeasurable for two reasons that are not the cache: their **cold** export reused an
existing row (unchanged composition hash — correct idempotency, but it populates no cache), and their
regenerations failed at the provider again. Lesson: the cold arm needs a composition the export row does
not already have, or a project with no prior export. The policy split is visible in the logs:
`attempt=11 latest=10 parent=…` — numbering reads max, semantics read `isLatest`.

**Cohort run (2026-11-01).** Selection enforced both conditions in SQL and returned exactly 5;
enablement through a generated SQL file verified `ENABLED=5` before anything ran. **3 of 5 projects
took a new take with a parent and made it latest**; **2 failed at the provider** (take 3 FAILED, latest
stayed at 2). Cache lines were `hit=0 miss=13`, `hit=4 miss=2`, `hit=0 miss=12`: **cold caches render
every segment**, so `hit=N−1` was not demonstrated — that assertion presupposes a warm cache and the
loop must be export → regenerate → export. Two exports reused existing rows because the failed
regenerations left the composition unchanged, which is the idempotency working. Findings: a failed
generation consumes a take number and leaves a FAILED take (correct as history, a policy question for
revisions); and the cohort assertion was mis-specified for cold caches. **Decision: do not widen.**
Flag returned to 0 of 166. Prerequisites for a wider rollout: a warm-cache iteration loop per project
and an answer on whether failed attempts consume take numbers.

**Cohort attempt (2026-11-01) — not run, reasons recorded.** The unconditional-numbering split (#236) is
verified: two consecutive **flag-off** regenerates produced takes **15 then 16, each with a parent, no
collision**. The cohort itself did not execute: the `UPDATE ... WHERE id IN (...)` meant to enable five
projects was malformed and enabled none (verified `enabled=0`), and the first selected project is not
export-ready (`3 scene(s) do not have a ready video yet`). **Selection criteria for the next attempt:**
export-ready (scenes = ready videos) *and* take history; enable via a generated SQL file, then assert
`enabled=N` before running. The flag remains 0 of 166.

**Iteration-loop measurement (2026-11-01).** Flag off: 101,025 ms total for regenerate-3 → export →
regenerate-5 → export, both exports **hit=5 miss=1**. Flag on: 84,171 ms, both exports **hit=5 miss=1**.
Identical cache behaviour; the 17% difference is regenerate-time noise. **The take model does not speed
up iteration — the segment cache does, and it does so regardless of the flag.** Also found: with the flag
off, regenerate inserted `takeNumber=1` (the column default), so a second flag-off regenerate would
collide on the unique index and be rescued by the takeNumber retry, which is not flag-gated — meaning a
non-take-aware project would silently start numbering takes. Numbering must become unconditional
(correctness under the constraint) while idempotency and conflict stay behind the flag. Widening to a
cohort is blocked on that fix.

**A/B result (2026-11-01, one project, flag toggled in the DB).** Stale revision → typed
`REGENERATION_CONFLICT` (expected 1, current 7). Regenerate at the current take → take 8 written with
`parentTakeId` = take 7, `isLatest` true, take 7 demoted — the take-row assertion passed on real data.
Export with the new take → `[export.path] segments=true`, **hit=5 miss=1**, one segment rendered. Same
composition re-request → **same export id and same hash**, no new row. Arm 1 (flag off, full re-render)
was not re-run; the 10,973 ms baseline stands. **Idempotency reuse is now proven** with a supplied key: `take=13` created (charged 400), the retry
returned the same asset id with `reused=true`, **0 credits**, balance unchanged, no new row. Getting
there exposed an ordering bug (#233): the stale-revision check ran before the idempotency lookup, so a
duplicate of a request that had just succeeded was answered with `REGENERATION_CONFLICT`. Idempotency
now resolves first — same key means same intent. A same-payload retry that crosses the 60 s bucket
boundary is answered with `REGENERATION_CONFLICT`, not a new take: the client is told its expectation
is stale, which is the honest answer once the first attempt advanced the scene. **Superseded note:** a "duplicate"
regenerate five minutes later created take 9 because the derived key includes `floor(now/60s)` — the
documented decision (a retry a minute later is a new intent), not a defect. No request has yet landed
inside the same bucket, so the `(sceneId, idempotencyKey)` reuse branch has not executed in production.
Also found by running it (#231): take numbers are per `(sceneId, assetType)`, not per scene — the
backfill numbered images and videos together, so video takes collided with image takes.

**Scope statement (piece 2, confirmed).** The take model gives **shot-level revisions and
idempotency** (`takeNumber`, `parentTakeId`, `idempotencyKey`). The film remains a **versioned
snapshot** keyed on `sourceHash` = the ordered per-scene-take composition: a new take produces a
new export row and re-assembles with N-1 segment-cache hits. The film is **not** a stable entity
that can be patched in place - that would need a stable film identity plus a live-content policy
for swapping a take inside a published film, both deferred.

**Status 2026-11-01.** Piece (1) complete: the renderer split is the only pipeline (the
single-graph branch is deleted, enforcement test in `output.test.ts`), segments cache by
`sourceAssetId`, and the cache is proven under chained iteration. Piece (2) started: `takeNumber`,
`parentTakeId` and `idempotencyKey` are additive columns on `StorySceneAsset`, backfilled; the
take-aware export path and its per-project flag are not yet built.

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

