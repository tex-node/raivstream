## Status log (newest first)

Dated status entries, most recent first. These were previously appended to the end of
the document by tooling, which put the live state of the work underneath a template
section; they are collected here so the current shape is findable (2026-11-04).

- **2026-11-04 — Take constraint verified in the database and pinned by a class test.** Read all three layers: `pg_indexes`
  shows `creative_produced_assets_projectId_sceneId_kind_takeNumber_key UNIQUE (projectId, sceneId, kind, takeNumber)`;
  `schema.prisma` and the migration agree. **Shipped:** `schemaScope.test.ts` asserts that every project-scoped model's unique
  constraint keyed on `sceneId` carries `projectId` — the exact shape that made the take migration unappliable — and pins the
  corrected constraint specifically. The rule is narrow on purpose (`assetId`/`versionId`/`runId`/`seriesId` are globally
  unique, so requiring `projectId` there would be noise and the rule would be disabled within a week). **Finding:** the same
  defect exists **pre-existing in `StorySceneAsset`** — `@@unique([sceneId, assetType, takeNumber])` and
  `@@unique([sceneId, idempotencyKey])` — recorded as **shrink-only named exceptions**, so a new violation fails the test and
  removing one also fails it. Suite green at **2,276 tests**.

- **2026-11-04 — StorySceneAsset's two unscoped constraints closed in schema, database and test.** Read first:
  `pg_indexes` showed `UNIQUE (sceneId, assetType, takeNumber)` and `UNIQUE (sceneId, idempotencyKey)`, owner
  **`supabase_admin`**. **Collision check before the change:** 0 duplicate `(projectId, sceneId, assetType, takeNumber)` rows;
  2,741 rows, 814 distinct `sceneId`s, and **0 `sceneId`s shared across projects** — so widening was safe rather than lucky.
  **The migration caught its own mistake:** `ALTER TABLE … DROP CONSTRAINT` **silently skipped**, because Prisma creates
  **unique indexes**, not table constraints — `pg_indexes` then showed *five* unique indexes instead of three, and
  `DROP INDEX IF EXISTS` removed the leftovers. Exit code was 0 both times, which is why the verification is the index list,
  not the exit code. **Final state:** pkey + `UNIQUE (projectId, sceneId, assetType, takeNumber)` +
  `UNIQUE (projectId, sceneId, idempotencyKey)`; `RECORDED_EXCEPTIONS` in `schemaScope.test.ts` is now **empty**, with the
  mechanism retained so a new violation must be added deliberately and a fixed one fails until its entry is removed.
  Suite green at **2,276 tests**.

- **2026-11-04 — Identity disclosure shipped: the film page now says why a film is not promoted.** The read found the film
  page (`apps/web/src/app/v/[id]/page.tsx`) is a client component reading `video.getById`, and `videoCardSelect` did **not**
  carry `sourceProjectId`; `projectIdentity()` already existed in `quarantineFeed.ts` and its own comment states that *"the feed
  clause and the film-page disclosure BOTH call this"* — the intended design, one level short of wired. **Shipped:** `sourceProjectId`
  added to the card select; a new **`video.identityDisclosure`** procedure returning `{ scored, minIdentity, belowFloor, floor }`
  computed by **the same `projectIdentity()`** the feed uses (a label and an exclusion computed twice could disagree); and an
  `IdentityDisclosure` label on the film page carrying the number — *"scored 62 against a floor of 85 for live content. It is not
  promoted in feeds."* — hidden on R16. **4 tests, both cases:** below-floor shows with its score and floor; above-floor shows
  nothing; unsourced film is not scored; a sourced film with no scores is not labelled. Note the floor here is
  **`QUARANTINE_IDENTITY_FLOOR` = 85** (live content), distinct from the creative production floor of 75 — the disclosure reports
  the rule that actually excludes the film, not a different one.

- **2026-11-03 — The 5 below-floor scenes are pre-conditioning renders the pipeline cannot re-render.** The read is unambiguous:
  **`refs_at_production=0` on every below-floor scene** (`cmuzaoi6` 60×3, `cmvyapup` 70), so they are **un-conditioned legacy
  renders**, not evidence against the lever — the references arrived after they were produced. Counter-datum worth keeping:
  **`cmvylvaz` scored 80 with zero references**, so framing alone can carry a beat to the floor. Re-rendering the two projects that
  now hold approved references returned **`newAssets=0`** — `produce()` reused `READY` rows, no score moved, no flag cleared
  (live flags still **22**). The pipeline has **no new-take path**, and resetting is refused by `assertNotResetAfterCharge`, so
  the 5 are **not re-renderable today**: the blocker is a missing capability, not a threshold. **Lever chosen and not yet built:
  per-scene enforcement** — a first-class new take (new asset row, render, score, keep the better of two). Higher-resolution
  references and framing escalation were deliberately **not** attempted, because both assume the re-render path that does not
  exist and would have measured reuse rather than the lever.

- **2026-11-03 — Migration applied as `supabase_admin`; the first take ran and scored 70 (from 60).** `creative_produced_assets`
  is owned by **`supabase_admin`**, so the deploy's `postgres` migration step cannot alter it — the columns had never appeared and
  the failure looked like a skipped runner. Applied as the owner. **The original unique constraint was impossible:**
  `("sceneId","kind","takeNumber")` collides across projects (`SCENE_04` exists in more than one), so it is
  `("projectId","sceneId","kind","takeNumber")` — schema and migration corrected. **The "stale client" claim was wrong:**
  `takeNumber` was already generated (109 occurrences); the grep that said otherwise pointed at a path that does not exist here.
  **First take:** take 2 over parent take 1, previous take **demoted not deleted** (`isLatest=false`, both `READY`),
  `framingInPrompt=true`, `references=4`, and a score of **70 against the old take's 60** — an improvement that still misses the
  floor of 75, so this scene is a **measured ceiling**, not an un-conditioned artefact. **The charge silently failed:**
  `deductCredits` threw because the owner has **no `CreditBalance` row** and `createNewTake`'s `.catch(() => 0)` swallowed it —
  `creditsCharged=0` with **no `CreditTransaction`**, the same silent-zero class as `castReferences`, now in the newest path.

- **2026-11-03 — Takes measured: one charged and cleared 20 → 90; three refused loudly for balance.** `cmvyapup SCENE_03` take 2:
  **20 → 90**, 4 references, `framingInPrompt=true`, **charged 80 with a verified `CreditTransaction -80`** (5,480 → 5,400). `cmuzaoi6`'s three scenes
  **refused** with *"Insufficient credits — you need 80 but have 0"* — the `chargeOrThrow` contract working; before the helper those would have been
  `creditsCharged=0` "successes". **Counter-datum resolved:** `cmvylvaz` scored 80 un-conditioned and `cmuzaoi6` scored 70 with four references, but
  `cmvyapup` scored **90 with four references** — so references do not suppress framing; **scene variance does**. **Floor decision: 75 stands** —
  three measured points (90 conditioned, 80 un-conditioned, 70 conditioned) put 75 inside the distribution. The remaining tail is blocked by an
  **account balance**, not by calibration; lowering the floor to 72–73 would admit a scene that is simply weaker than its siblings.

- **2026-11-03 — ARC CLOSE.** Capability: 0–50 → **median 70, best 90**, conditioning proven in the payload. Floor: **75 stands**, ~3 of 7 measured beats clear it, most creative output flagged by design. Takes: live, chargeable (verified −80 per take), parent demoted not deleted, guard intact. Silent-zero: `chargeOrThrow` makes it impossible on the newest path; one annotated tolerant site remains (`runner.ts:202`). Residue: **22 live flags** — 5 below-floor scenes with measured conditioned takes, 7 thin-input projects, 73 out-of-scope with audit, 2 accepted loss, 4 resolved. Infrastructure debts named: creative-table ownership (`supabase_admin`), projectId-scoped take constraint, and the branch ruleset requiring checks on the **current head** (a stale base produces "2 of 2 required status checks are expected" even when every check on the old head passed — `gh pr update-branch`, not a re-push). Full record: `docs/operations/creative-arc-close.md`.

- **2026-11-03 — Silent-zero class CLOSED: the transaction shim exists and the tolerance is gone.** The read named the
  exact shape `deductCredits` needs — idempotency `findUnique` (null by default, forceable), `featureCreditRate.findUnique`
  (`{creditsPerUnit, isActive}`), `prisma.$transaction(fn)`, and inside it `creditBalance.updateMany` (`{count:1}`/`{count:0}`),
  `creditBalance.findUnique` (post-decrement), `creditTransaction.create`. **`withCreditCharge()`** supplies all of it and
  mutates-and-returns the client, so **one shim serves four mock shapes** across all **7** runner files (factory-return,
  nested client, inline factory, purpose-built factory) — verified by grep, no assertion weakened. **One fixture bug found and
  fixed on the way:** the first version rated only `generate:flux2`, so video assets (`generate:h3_max`) failed as
  missing-rate — it now rates every key by default with an explicit `featureKeys` restriction. **Tolerance deleted:**
  `chargeProductionAsset()` and its `unrated` branch are gone; the runner calls `chargeOrThrow` unconditionally because a
  missing rate is a **configuration error, not a free render** (the rate table is seeded and active in production). Class
  state: `castReferences` fixed (#318), `createNewTake` fixed (#323), `runner` fixed here — **no credit path can report zero
  without charging or throwing**. Suite green at **2,274 tests**.

## Phase 0 — Baseline proof — status notes

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
**Closed 2026-11-04.** The eight acknowledged failure lines were the only thing keeping this phase open. All eight now emit a `[creative.stage] stage=<name> status=fail reason=<what failed>` line — `intent` and `bible` at the request boundary via `logPreProjectStage`, `plan`/`preview`/`director`/`approval` at their guard clauses before the throw, `produce` at the cast gate and `review` in the per-asset catch naming the scene. The shrink-only set in `stageFailureCoverage.test.ts` is **empty** (verified by reading the file, not by the test exiting 0), and `stageFailureFiring.test.ts` observes three of them firing — `approval reason=version_not_found`, `director reason=project_not_found`, `preview reason=invalid_state_transition` — because a line that exists and never runs is instrumentation by assertion.

## Phase 2 — Take model — status notes

**Phase 3 (2026-11-01) — SHIPPED. Read outcome: sprint, not project.** The 5.0 layer is fully wired
(twelve `RAIVSTREAM_5_*` env flags, twelve creative subrouters, no stubs) and `/create` already exists and
is linked from the Navbar, so with flags off the route was live but every call failed with "Raivstream 5.0
is not enabled". Enabled the core chain in production (master, create, intent, bible, preview, production,
director, review, approval, output), leaving **studio, series and audio off**; verified the flag in the
running process (`pm2 jlist` on web and worker), then verified the gate opens (`creative.project.create`
succeeded and `list` returned 1). Health 200, `/create` 200. Rollback: remove ten env lines and restart.
**Phase 3: PROVEN AND CLOSED (2026-11-02).**
**Live-content policy decided (2026-11-02): flag, do not unpublish.** A rejected live asset is flagged for human
review and stays visible until someone looks; an automated gate does not get unilateral power over published
content. Every live rejection writes an audit row naming the asset, the breached dimension, its score and floor, the
run and the critic version — without it, "flagged" is indistinguishable from "silently ignored". The policy is
**prospective**: the gate has zero production rejections so far. Revisit if a flag sits unreviewed past 14 days, if
the re-score batch finds more than 5% of live assets below floor, or if a viewer reports a flagged asset whose
dimension is below half its floor. Details in `docs/operations/critic-threshold-policy.md`.
**Gate defect narrowed 2026-11-03 — the null-bible hypothesis is REFUTED.** Runtime probe (no production, no credits) on
`cmvzvo9ym…`: `include: { productionPlan, brief, bible }` returns `bible_present=true` with
`chars=["Lighthouse Keeper","Lost Bird"]`, and `creativeBible.findFirst` agrees. So `project.bible` is **not** null and
`castCharacters` was **not** empty — the guard's `names.length === 0` short-circuit cannot explain `NO_REFUSAL`. Static
reading is also clean: one `produce()` implementation (`production/service.ts:324`), the router calls it
(`routers/creative/production.ts:70`), and the deployed file has the gate (line 356) plus the include (line 303).
**What remains is a single runtime fact: whether the gate executes and what `castCharacters.length` is when it does.**
The next read is one log line inside the gate on the deployed build — static analysis has now been exhausted twice.
**No production was run; the refusal was NOT produced**, so the gate remains untrusted. Credits from the earlier aborted
run are **unconfirmed** and deliberately not quoted.
**Sequence attempted 2026-11-03 and it FAILED at the gate — production does not refuse what the test refuses.**
Deployed `449e58a`, health 200, project `cmvzvo9ym…`, cast derived correctly (`["Lighthouse Keeper","Lost Bird"]`,
bibles-with-characters 4 → 5). Then **`production.produce()` ran without refusing** (`GATE_REFUSAL=NO_REFUSAL`) and logged
`stage=produce status=ok scene=SCENE_01 references=0 identityBlock=yes`, leaving one IMAGE in `GENERATING`. The wired gate
has a passing test **through the same entry point**, so this is a production-vs-test disagreement — the class this project
keeps catching. Leading hypothesis (unproven): `project.bible` is null/empty from `include: { …, bible: true }`, so
`castCharacters` was `[]` and the gate's `names.length === 0` guard short-circuited it. **The cast stage never ran**
(0 reference rows for the project); the script then died on a Prisma error while creating references. **Both acceptance
conditions remain unmet**, and the more important finding is that **the gate cannot be trusted in production until the
bible demonstrably reaches it**. Next: read `produce()`'s `project.bible` at runtime, not another run.
**Cast stage blocked by an ownership chain, read 2026-11-02.** `StoryCharacterMemory.projectId` points at
**`StoryProject`**, and `CharacterReferenceAsset.characterId` points at `StoryCharacterMemory` — so a **creative project
cannot own a reference attached to a character**, only one with `characterId = null`, and `resolveCreativeReferences()`
matches by the `character.name` relation, which is null there. Literal reuse is blocked by the **schema**, not the code.
**Bridge scoped:** add `CharacterReferenceAsset.characterName String?` written by both paths; resolver matches
`OR: [character.name, characterName]`; cast stage generates per derived character (`projectId` = creative project,
`characterName`, `READY`) and skips names that already have a `READY` reference; **production blocks until every cast
character is approved** (chosen over fail-open — conditioning on nothing is the failure this chain chased for four
sessions). **Not built this session**, so both acceptance conditions (`references>0`, a `FLUX2_EDIT` job) remain
**unmet**, and the three free assertions were scoped rather than written against behaviour that does not exist.
**Cast derivation shipped (2026-11-02): steps 1-2 of the build, proven free; step 3 and the run NOT done.**
`deriveCast()` replaces the hardcoded `characters: []` for `STORY` — parses the creator's subject first and alone, splits
on "and"/commas, strips articles, bounds at `MAX_CAST = 4`, de-dupes, and marks every description as a proposal pending
creator approval. `extractSubject()` fills `explicit.subject` from the "about …" clause verbatim. **10 free tests** pin
the lighthouse cast (`Lighthouse Keeper`, `Lost Bird`) and caught two bugs before any spend: the derivation missed the
already-stripped subject entirely, and (once fixed) let the leading-article pattern swallow the summary into a character
named *"a lost bird I understand this as a story targeting 30s"*. **Still missing: step 3, the cast stage that generates
and approves one reference per character.** Without it no `CharacterReferenceAsset` rows exist for these characters, so
`references` stays 0 and both acceptance conditions (`references>0`, a `FLUX2_EDIT` job) remain **unmet** — recorded as
unmet, not approximated. Next session: build the cast stage, then one re-production (~1,120 credits).
**Why the bible has no characters — read 2026-11-02: never-extracted.** `domainKnowledgeFor()` **hardcodes
`characters: []` for `STORY`** (`intelligence/service.ts:51`), and the interpreter does not populate `explicit.subject`
(the free interpretation of the lighthouse idea returned only `durationSeconds: 30`). `seedBibleFromInterpretation()`
persists faithfully — it is handed `[]`. **Across 78 creative bibles, only 4 have characters.** Same read located the
planner gap precisely: intent **captures** `durationSeconds: 30`, and `productionPlan.totalRuntimeSeconds` is null, so
the duration is lost between intent and plan. **Operator decision: generate references at CAST TIME** (compose prompt →
generate → approve → produce), the story pipeline's model, because approval stays the human decision point; rejected
"reuse only" (a fresh idea conditions on nothing) and "lazy" (unpredictable first render). **Scoped build:** derive
characters for STORY, populate `explicit.subject`, add the cast stage writing `CharacterReferenceAsset` rows, then
resolution already works. **Acceptance: `references>0` in the log plus a `FLUX2_EDIT` job** — until then the identity
number measures text-to-image. **Cost: one re-production, ~1,120 credits.** The floor stays at 85.
**Measured re-production (2026-11-02): min identity 0, unchanged — and the cause is data, not conditioning.**
Project `cmvzluerv…`, run `cmvzlujkm…`, 4 scenes, **1,120 credits**. Per-scene identity: **80 / 60 / 0 / 70**, min **0** — the
same 0–50 band. **Diagnosis from the log:** every scene logged `references=0 identityBlock=no`, and the jobs are
`model=FLUX` — **FLUX2_EDIT was never called**. The conditioning code is correct but had nothing to work with: a freshly
interpreted creative project's **bible carries no characters**, so no identity block was composed and no reference could
be resolved (`scene.characters` was empty too, so the name filter matched nothing against the 6 READY assets). **This is a
wiring/data gap, not a conditioning failure and not a calibration question.** Next: populate `bible.characters` at intent
time and map them to reference assets at plan time; only then is `references>0` reachable. **The 99-flag backlog stays
deferred** — re-rendering while stills call FLUX with no references would repeat this spend for the same number.
**Identity floor unreachable BY CONSTRUCTION in the creative pipeline (read 2026-11-02).** The 0–50 minimums are not
mis-calibration. **Stills model:** creative uses `fal-ai/flux-2` — *text-to-image only* — while story uses
`fal-ai/flux-2/edit`, which takes `imageUrls` (max 4). **References:** `FalFlux2Input` has only `prompt`,
`aspectRatio`, `seed`; no `imageUrls` reaches generation. **Prompt:** no identity block or positional binding is
composed; the only `EntityReference`s are built in `director/resolver.ts` for the **critic**, not for generation.
**Resolution:** no `characterReferencesFromScene()` equivalent exists. The media contract says it for this endpoint:
*"Text-to-image only (no image_url/image_urls on this endpoint)"*. **Follows:** a build — route creative stills through
the reference-conditioned endpoint, compile the identity block, add reference resolution, then re-produce and measure.
**The floor stays at 85**, and **the 97-asset backlog should wait**: re-rendering under text-only stills would
reproduce 0–50 at full price.
**Quarantine CERTIFIED on three surfaces (2026-11-02).** Deploy `a297b75` confirmed (VPS `HEAD=a297b75`, health 200).
Against the live tRPC endpoints: below-floor video `cmvzdewzf…` absent from **forYou, trending and viewersPick**;
unsourced historical video `cmvtzf9qf…` present in **all three** (the NULL branch proven on every surface, where a bare
`notIn` would have removed it everywhere); direct link `/v/cmvzdewzf…` → 200. The fourth assertion was **mis-specified,
not failed**: `viewersPick`'s fallback exists to avoid an empty feed and may relax the star filter, so unrated rows there
are intended — the fixed bug was the **clause loss** (including `withdrawnAt: null`), not the presence of 0-star videos.
**Two bugs recorded separately:** quarantine-on-viewersPick (this phase, fixed #279) and `viewersPick` never applying
its star filter / dropping `withdrawnAt` (a **pre-existing defect found this session**, not a regression of this work).
The fallback now carries an INTENT comment warning that removing it as "unused" is the trap that already fired.
**Quarantine probed on real data (2026-11-02) — partial.** Published one below-floor output (`min identity 50`) as video
`cmvzdewzf0001b1exbttsx1tv` with provenance written at publish time. **Passed:** the NULL-branch proof (an unsourced
historical video appears in all three feeds) and exclusion from `forYou` + `trending`. **Failed:** the same video
appears in **`viewersPick`**, whose source contains the clause — unexplained, and suspicious because `viewersPick`
also returned 14 items including a **0-star** video despite filtering `starRatingCount >= 3`. **Impossible:** the
above-floor control, because every creative project's minimum identity is 0–50 — **no project has ever cleared 85**.
Quarantine is therefore **live on two surfaces and unverified on one**; `viewersPick`'s filter behaviour needs
investigation before the clause can be called proven.
**Creative publish shipped (2026-11-02): approved outputs only.** `creative.output.publish` requires an APPROVED
`CreativeApproval` and a READY output with media, is idempotent by media URL, and **writes provenance at publish time**
(`sourceProjectId`, `sourceVersionId`, and `sourceProducedAssetId` only when the version has exactly one READY asset —
a film spans many scenes, so guessing a single source would let a score act on an asset that did not produce the film).
Preconditions have two-directional tests (no approval, PENDING, REJECTED, unrendered, no media) plus idempotency and
provenance tests: 16. **Two separate spends, explicitly:** the 99-flag backlog is a **re-render** decision (~97 × 80 +
video) that quarantine cannot reach because no video came from those assets; creative publish is **forward-looking** and
does nothing for the backlog. Disclosure is now readable but deferred to ship with the feed clause.
**Quarantine wiring (2026-11-02): the column landed, the links did not.** `Video.sourceProducedAssetId` shipped
nullable (NULL = source unknown = fail-open, mirroring the unscored rule). **No populate path exists:** all four
`Video`-creating paths (generation, library, story export, upload) were read and none touches a `CreativeOutput`, and
the 5.0 pipeline has no publish-to-feed step. **Backfill declined on measurement:** the URL join returns **0 matches**
across 14 videos × 44 ready outputs, so option (a) is unreliable here and option (c) is impossible — none of the 99
flagged assets is a video's source. **Named number: 14/14 videos (100%) have NULL source** — the population quarantine
cannot reach, stated rather than implied. `feedQuarantineIsWired(videosWithSource)` now reports on **data, not
schema**: a column is not wiring, one populated row is. The inert test was updated (not deleted) to assert the
pre-populate state. Disclosure still deferred: nothing to read yet.
**Quarantine shipped (2026-11-02), with the honest wiring gap.** `lib/films/quarantine.ts` — asset below the identity
floor stops being **promoted** (feed excludes, library and direct link include), unscored assets are **not**
quarantined (quarantine fails open on unknown, the opposite of approval), 13 tests. **Verified on real data:** 99
flags, 99 below floor; 109 images, 1 unscored, 0 unscored-but-flagged. **The feed cannot apply it yet:** `Video` has
no `sourceProducedAssetId`, so a feed predicate has nothing to join against — `feedQuarantineIsWired()` returns
`false` and a test asserts it, because shipping that filter would exclude zero rows while looking like enforcement.
**Reframe:** the flags are the backlog quarantine absorbs, and the un-quarantine path is a re-render with the
identity fix, not 99 review decisions. **Phase 1 reframe:** identity measurement was never running for the library —
SCENE_03 was the pattern, not the outlier. **Lift quarantine when** below-floor falls under 5%.
**802 critic re-scores — RUN (2026-11-02): 89% of scoreable images are below the identity floor, so the 5% change
condition fired on the first run.** 109 images, 95 processed, **97 flags, all on `characterIdentity`, scores 0–80
against floor 85**, 4 provider failures. Table `creative_review_flags` + resumable image-only runner shipped
(#270–#272); the pilot caught a selection bug (VIDEO assets 400 at the critic — 10 of 20 failures that looked like a
provider problem but were a population problem). Idempotency holds per asset via `(assetId, runId)`; a second run
added 2 flags only because 4 assets had failed and were retried. **Implication:** the constant-90 backlog is not a
clean-up list — the old critic was not measuring identity — and per-asset flagging cannot absorb ~89%, so the live
content policy's revisit condition is met and needs an operator decision (wider action, or a cut-off by dimension).
**802 critic re-scores — SCOPED, NOT BUILT (2026-11-02).** Re-runs the current critic and the per-dimension gate over
the 802 assets approved under the constant-90 critic. **Writes:** new scores into `creative_review_runs.scores`, the
gate verdict per asset, and — per the flag policy — an audit row per live rejection (new `creative_review_flags`
table: asset, scene, project, dimension, score, floor, runId, criticVersion, createdAt, review fields, unique on
`(assetId, runId)` so a resumed batch cannot double-flag). **Cost:** 802 critic calls at fractions of a cent;
the runner must be **resumable** (cursor on `createdAt`) and **rate-limited**, and must skip assets already re-scored
under the current critic version. **Acceptance:** after the batch, the number of live assets below floor is known and
every one has an audit row — the output is a **number, not a cleanup**. **It does not unpublish anything** (the
policy is flag); it does not modify scores on the original runs; and it does not act on assets whose project is
inactive. Blocked on nothing except the flag table and the runner.
**Next phase (operator decision, 2026-11-02): PER-DIMENSION GATING.** Scope: one predicate that fails a creative
asset when any dimension falls below its own threshold, even if the aggregate passes; a test matrix across the nine
dimensions; no credits and no schema change. Blocking condition: none — the identity generalisation landed and the
evidence above is from production. The `overall: 85` + `characterIdentity: 0` case is its first acceptance test.
**Phase 3 status: Blocked on the fal account (operator-confirmed 2026-11-02).** The operator confirmed the
account is still locked, so this session ran no probe and no production: the previous two independent checks
already carry the exact evidence (`fal image disabled: account locked or balance exhausted (HTTP 403)`, and
`run_finished FAILED generated=0 failed=8`). Balance unchanged at 9,120. Everything the repository owns is
ready: 9/9 success stage lines, the output failure line, the shrink-only failure-disposition contract test,
critic variation proven on real assets, measured duration written in both READY paths, fourteen flags
deploy-durable, `FAL_KEY` valid in-process. **The unblock is external and singular: restore the fal account.**
Then one image (~80 credits), one lighthouse run (~640), and the verdict becomes *Proven* or *Proven except
X* — with the two duration questions answered separately: (1) output row vs probe becomes answerable with an
output; (2) plan-declared-30 s stays unanswerable while `totalRuntimeSeconds` is null.
**Provider still blocked (2026-11-02, second check).** Pre-flight clean on everything the repo owns — both
processes `RAIVSTREAM_5_ENABLED=true`, `CREATE=true`, `FAL_KEY=set`. Direct single-image submit returned
**`fal image disabled: account locked or balance exhausted (HTTP 403)`** again. No run attempted: it would
fail 8/8 assets at 0 credits and change no measurement. The unblock is external — restore the fal account —
and the instrumentation is ready to record the next attempt either way.
**Output failure gate closed; provider blocked (2026-11-02).** `output/service.ts` now logs
`stage=output status=fail` in both catch blocks, and `stageFailureCoverage.test.ts` enumerates all nine
stages, requiring a failure disposition for each (a real `'fail'` call, or an acknowledged-gap entry — the
gap set is asserted to be exactly the known eight, so it may shrink but not grow). `FAL_KEY` is present
**in-process** in both apps (len 69) and in both env files, so the fal HTTP 403 is **account state**
("account locked or balance exhausted"), not configuration. **No run attempted** — it would fail identically.
**Phase 3 verdict: Blocked**, on the fal account; the two duration questions remain: (1) output-row-vs-probe
unanswerable without an output; (2) plan-declared-30 s unanswerable while `totalRuntimeSeconds` is null.
**All nine stage lines shipped (2026-11-02).** Pre-project identity decided: `intent` and `bible` are
identified by a **request id** threaded to `project.create` (`[creative.stage] request=<uuid> stage=intent
status=ok`, and the bible line carries `projectId` as detail), so the pre-project line joins to the project's
`stage=plan project=<id>` line. Never a fabricated project id — four tests assert that the pre-project line
contains `request=` and **not** `project=`. The gated run is the only thing left.
**Critic score variation proven (2026-11-02), and the proof is sharper than expected.** Two scored runs on
real assets persist distinct vectors: SCENE_01 `{80,90,85,90,80,75,90,85,80,90}` vs SCENE_03
`{70,80,90,85,80,75,90,80,85,90}` across ten dimensions — **but both have `overall: 85`**. Exposing only the
overall would have looked exactly like the constant-score regression; the dimensions are what make variation
visible. **Plan duration:** the stored plan has `totalRuntimeSeconds = null` and no scored scenes array, so the
17.13 s is not "the plan said 17" — no declared runtime reaches the output path. **Gated run not performed**:
`intent` and `bible` still lack a stage line (no project id at that boundary), so a run now would be a partial
measurement.
**Stage logging (2026-11-02): 7 of 9 boundaries instrumented.** `director` (start + ok, with instruction,
directiveId, affectedSceneIds, impact) and `preview` (ok at `project.updateStatus` when status becomes
APPROVED) joined output, review, plan, produce and approval. **Remaining: intent and bible**, which carry no
project id at their boundary — they must be gated by a request id threaded through to project creation, or by
their outcome, and **not** by a fabricated project id. No gated run yet, so all three measurement gates
remain unmeasured.
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
**Phase 2 complete (2026-11-01) — the flag is default-on for projects that iterate.** Flipped
`takeAwareExportEnabled` using `max(video takeNumber) > 1`: **57 of 166 projects** enabled (the criterion is
take history; 40 of those are also export-ready). Verified after the change: 57 enabled, worker `ready`
with `export_segment_sweep scanned=60 deleted=0`, health 200. The obsolete `RENDER_SEGMENTS_ENABLED` was
removed from the production env — the renderer reads only `CACHE_SEGMENTS_ENABLED`, and the enforcement
test keeps the deleted flag deleted. Reversible with one `UPDATE ... SET = false`.
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
**Status 2026-11-01.** Piece (1) complete: the renderer split is the only pipeline (the
single-graph branch is deleted, enforcement test in `output.test.ts`), segments cache by
`sourceAssetId`, and the cache is proven under chained iteration. Piece (2) started: `takeNumber`,
`parentTakeId` and `idempotencyKey` are additive columns on `StorySceneAsset`, backfilled; the
take-aware export path and its per-project flag are not yet built.
### Planner persistence — CORRECTED AND CLOSED (2026-11-04)

## Other status notes

**Both reads are complete (2026-10-30).** They were prerequisites, not estimates, and their
results are what the Phase 1 and Phase 2 sections above are now scoped against.
- **2026-11-04 — Sequence determination: Phase 2 (take model, remaining) is next; no debt blocks it.** Read from the plan and this history, not from a session summary. Classifications: **Phase 0 in progress** (status pointer; the eight acknowledged failure lines are exactly the unexercised paths it exists to close); **Phase 1 in progress** (identity measured and conditioned — median 70, best 90, control 80 — but 3 of 7 measured beats clear the floor and 22 flags remain); **Phase 2 in progress** (creative take path proven at 20 → 90 with a verified charge; story take constraints landed; **take-aware export re-assembly unbuilt**); **Phase 3 complete** (history: SHIPPED 2026-11-01, PROVEN AND CLOSED 2026-11-02); **Phase 3.5 complete** (schema, ingestion, UI shipped 2026-11-01); **Phases 4–9 not started**, each naming its unmet dependency. **Next: Phase 2's remaining half** — exit criterion *"change scene 3 → only scene 3 re-renders and the film re-assembles"*; the missing piece is the take-aware export keyed on the ordered per-scene-take composition. **Debt mapping:** planner persistence is a prerequisite to Phase 3 re-entry; the eight failure lines are a prerequisite to calling Phase 0 complete; video re-render, thin-input projects, the ledger writer and the branch ruleset are **parallel** — none blocks a phase's exit criterion. **Consequence:** the sequence can proceed without waiting on any debt.
- **2026-11-04 — Phase 2 exit criterion proven: hit = N-1, miss = 1, timeline identical.** Three arms against the existing mechanism, no production code changed: **arm 1** cold cache -> **hit 0, miss 3**; **arm 2** scene 3 given a new asset id (`asset-3` -> `asset-3-take-2`), other scenes untouched; **arm 3** -> **hit 2, miss 1**, and the missed key is exactly `buildExportSegmentKey({segmentIndex: 2, sourceAssetId: "asset-3-take-2"})` - not another segment, and not the baseline key for that position, while the other two keys are byte-identical to baseline. **Timeline signature identical:** `SCENE_01:4.000|SCENE_02:5.000|SCENE_03:4.000` before and after. **Source hash changes**, and only because scene 3's pair changed - the other two pairs are byte-identical inputs, which is what leaves their takes in place. **Correction recorded in the plan:** the Phase 2 body claimed *"the take-aware export path ... the story side is not"* - false, since `computeSourceHash` and `buildExportSegmentKey` are both asset-id keyed and the cache was already wired; the earlier claim is preserved with the correction dated beside it. **Limit stated:** the proof is at the key boundary, not through `renderOutputDerivative` (which needs ffmpeg and an R2 store); the renderer's `[export.segments] hit/miss` counters are computed from exactly these keys, and a live render check remains unbudgeted rather than assumed.
- **2026-11-04 — Phase 0 closed: the acknowledged failure-line set went 8 to 0, and three lines were observed firing.** All nine stages now have a failure disposition: `intent` and `bible` at the request boundary via `logPreProjectStage`; `plan`, `preview`, `director`, `approval` at guard clauses *before* the throw (a log in a catch that may not run is not instrumentation); `produce` at the cast gate; `review` in the per-asset catch naming the scene; `output` already had one. **Set read back from the file: `SET_ENTRIES [] COUNT 0`** - not inferred from a green test. **Firing observed** for three: `approval reason=version_not_found`, `director reason=project_not_found`, `preview reason=invalid_state_transition from=PREVIEW to=GENERATING` (the last two visible in the suite's own output). Every reason names what failed. **No assertion weakened:** the shrink-only test still asserts the set is exactly the recorded list, now empty, so a new stage without a fail line still fails CI. **The flaky test** (`full audio > educational export`) did not fail this session.
- **2026-11-04 — Bookkeeping corrected: Phase 2 complete, Phase 1 externally blocked; planner persistence scoped.** Phase 2 moved from **in progress** to **complete** with its evidence inline (three-arm `exportTakeComposition.test.ts`, **hit = N−1, miss = 1**, missed key by identity, identical timeline signature). Phase 1 renamed **in progress — externally blocked**, naming the fact plainly: its remaining coverage waits on **creator input for 7 thin-intent projects**, which is not an engineering queue item and should not be scheduled like one. **Planner-persistence read:** `explicit.durationSeconds` is captured at `intent/interpreter.ts:117-118`; `totalRuntimeSeconds` is **declared nowhere** in `packages/api/src` or `schema.prisma`, yet `audio/service.ts:401` computes `Math.max(1, Math.round(plan.totalRuntimeSeconds))` and `output/derivation.ts:42` consumes it — a field two consumers require and no producer provides, so the audio path gets `NaN` rather than a runtime. **Not a one-liner:** it needs a type declaration, a producer in `buildCreativePlan` from the shot durations it already sums, and a re-check of the audio rounding. **Scoped in the plan** with its acceptance criterion: a 30-second idea yields `totalRuntimeSeconds === 30`; no stated duration yields the summed scene durations; both asserted by test. **The `plan.totalRuntimeSeconds: 30` seen in `musicChargeRace.test.ts` is a fixture literal, not a produced value** — worth stating because it made the field look implemented.
- **2026-11-04 — Planner persistence: the debt was misdiagnosed; the field was produced all along, the test was missing.** `totalRuntimeSeconds` is **declared at `plan.ts:70`** and **produced at `plan.ts:315`** (`totalRuntimeSeconds: cursor`, the ordered sum). The previous session's "declared nowhere" came from a `Get-ChildItem` call that **errored on a bad path and returned nothing** — a failed command read as absence. **Shipped:** `planRuntimePersistence.test.ts` (3 tests against a builder-made plan: 30-second idea -> `targetDurationSeconds === 30` and runtime equal to the scene sum; no duration -> `undefined` target and summed runtime; runtime finite, which is what the consumers round); the `musicChargeRace` fixture now calls `buildCreativePlan` instead of hand-writing the field, so removing the production breaks it. **Withdrawn:** the claim that `audio/service.ts:401` and `output/derivation.ts:42` compute `NaN` — with the field produced they receive a finite number; the NaN path was reachable only for a plan object built outside the builder, which is what the old fixture did. **Design settled:** `totalRuntimeSeconds` is what the plan builds, `targetDurationSeconds` is what the creator asked for; collapsing them would make the timeline disagree with itself. **Phase 3 re-entry unblocked.**
- **2026-11-04 — Chose Phase 5 over Phase 4, because Phase 4 is blocked by the take model, and shipped look's first slice.** Read both phases from the plan: Phase 4 (scoped director) exits on *'Direct shot 12C regenerates only that shot's take'*; Phase 5 (cinematic vocabulary) exits on *'a look is saved, named, and reusable'*. Both name Phase 2 as their only dependency. **The code contradicted Phase 4's availability:** takes are keyed `(projectId, sceneId, kind, takeNumber)` at `schema.prisma:2630` with **no `shotId`**, though `CreativeProducedAsset.shotId` exists at `:2612` — two shots in one scene would collide on take number and violate the unique index. Phase 4 needs the constraint extended to `shotId` (the same class as the story constraint fixed in `20261104020000`), so its exit criterion is unreachable today and it is marked **blocked** in the plan with a dated correction. **Phase 5 shipped its first slice:** `look.ts` with `buildLook()` (normalises, falls back on out-of-ladder values), `lookToPrompt()` (deterministic projection), `lookResolution()` (9:16 ladder) — **8 tests**. **Persistence scoped, not built:** `CinematicLook` table unique on `(projectId, name)`, save/rename/list service, and the consumer that applies a stored look; acceptance = a look is saved, survives a re-read, is applied to a production, and a second production reuses it without re-entering fields.
- **2026-11-04 — Phase 4 unblocked: the creative take constraint now addresses shots, via two partial indexes.** Three-layer read first: `pg_indexes` showed `creative_produced_assets_projectId_sceneId_kind_takeNumber_key` (no `shotId`), the schema declared the same four columns, and the migration that created it was `20261103190000`. **Collision check before altering:** **0 duplicate** `(projectId, sceneId, kind, takeNumber)` rows; **435 rows, 0 with a `shotId`**, 0 scenes with multiple shots - so the change was safe. **The nullable decision, taken rather than discovered:** with `shotId` NULL everywhere and Postgres treating NULLs as distinct, a plain five-column unique would have *allowed* two scene-level takes to share a take number. So the constraint became **two partial indexes** - `..._scene_take_key` (`WHERE "shotId" IS NULL`) and `..._shot_take_key` (`WHERE "shotId" IS NOT NULL`, including `shotId`). **A second lesson on the same object:** the first attempt used `DROP INDEX` and failed with *"constraint ... requires it"* - this index **was** backed by a constraint, the inverse of the previous migration where `DROP CONSTRAINT` was a silent no-op. **Neither statement is universally right; the object decides**, and the error message is what distinguishes them. Applied as `supabase_admin`; `pg_indexes` now shows pkey plus the two partial indexes and not the old one. `takeShotScope.test.ts` (5 tests) pins both halves - two shots in one scene at take 1 occupy different slots, the same shot at the same take collides, scene-level takes still split by take number - and asserts the migration carries both WHERE clauses. **Phase 4 moves to "not started - dependency met", with the block entry preserved.**
- **2026-11-04 — Phase 4 first slice: shot-scoped take regeneration, proven on a fixture that builds the missing state.** The read found shots exist in the plan (`PlanShot.shotId`, `plan.ts:14`) and reach the provider manifest (`adapter.ts:54`) but **`shotId` is **never written to a produced asset** — 0 of 435 rows, 0 scenes with two shots — so shot-level production does not exist yet. `createNewTake()` now takes an optional `shotId`, scoping the previous-take lookup and the demotion to that slot (`shotId IS NULL` for scene-level), reusing `chargeOrThrow`, parent demotion and `assertNotResetAfterCharge` rather than a parallel take path. `shotTakeRegeneration.test.ts` (5 tests) **builds the state the database lacks** — two shots in one scene, each with take 1 — and asserts the "only that shot" half: shot B take 2 created with shot B take 1 as parent, shot B take 1 demoted, **shot A take 1 untouched** (same id, `isLatest` true, same url), and the charge written on the new row key. **What remains for the exit criterion:** the production path that emits per-shot assets at all — without it "direct shot 12C" has no shot to address.
- **2026-11-04 — Per-shot production shipped (opt-in): the take capability now has its subject, and the multiplier was stated first.** The collapse was `routeProduction` (`capabilityRouter.ts:97`): it looped scenes and pushed one `IMAGE` spec each, ignoring `scene.shots`, which is why `shotId` was never written to a row. It now accepts `{ perShot: true }` and emits one IMAGE spec per shot with its `shotId` and a prompt naming that shot; the runner persists `shotId`. **Cost, stated before building:** every scene template carries **three** `shotIdeas` (15 arrays, all length 3), so per-shot triples stills — **4 scenes: 4 stills / 320 credits → 12 stills / 960 credits** at 80 each, before video. That is why it is **opt-in**, not default: a default that triples a production's cost is a spend decision. **Proven** by `perShotProduction.test.ts` (5 tests: default one still per scene with no `shotId`; per-shot one per shot with unique ids; prompt names the shot; the multiplier asserted), together with `shotTakeRegeneration.test.ts` the chain is complete at code level — regenerating shot B leaves shot A untouched. **Named gap:** the end-to-end proof on a real production is bounded at ~960 credits and is not spent here.
- **2026-11-04 — Shot-level proof: 160 credits spent, scores identical, and my own proof design was confounded.** Project `cmvzvo9y`, scene `SCENE_01` (3 shots), owner balance 5,400. Two shot stills via `routeProduction(..., { perShot: true })`, each charged **80 through `chargeOrThrow`**; balance **5,400 -> 5,240**, spend measured. **Control** (existing composite `cmvzvof0`, reused not re-bought): identity **80**, composition **85**, overall **85**. **Shot arm**: `SCENE_01_SHOT_01` and `_SHOT_02`, both identity **80**, composition **85**, overall **85** - equal to the composite, prompts distinct (`66d440ac...` vs `d3e91aa3...`). **The confound, recorded rather than smoothed:** the shot arm ran with `framingInPrompt=false references=0` because the proof passed `bible: null` into `routeProduction`, so no character references and no identity framing reached the provider. This is shot-prompt-only versus a fully conditioned composite. It establishes that a plain shot prompt matched conditioned output at 80/85/85 - encouraging, and silent on whether per-shot *improves* identity. **Phase 4 stays open** with the gap named: a conditioned per-shot comparison (~160 more credits) is owed.

## Phase 4 — Scoped director — status notes

**Dependency resolved 2026-11-04.** The block recorded above was real: takes were keyed without `shotId`, so two shots in one scene collided on take number. The constraint is now **two partial unique indexes** — `creative_produced_assets_scene_take_key` for `shotId IS NULL`, `creative_produced_assets_shot_take_key` for `shotId IS NOT NULL` — because a plain five-column unique would have treated `NULL` shot ids as distinct and silently allowed two scene-level takes to share a take number. Verified in `pg_indexes`; the old constraint dropped; 435 rows, 0 collisions before the change. `takeShotScope.test.ts` pins both halves. **Phase 4 is startable.**

**First slice shipped 2026-11-04 — shot-scoped take regeneration.** The read found that shots exist in the plan (`PlanShot.shotId`, `plan.ts:14`) and are named in the provider manifest (`adapter.ts:54`), but **`shotId` is never written to a produced asset**: 0 of 435 rows carry one, so shot-level production does not exist yet. `createNewTake()` now accepts an optional `shotId` and scopes the previous-take lookup and demotion to that slot (`shotId IS NULL` for scene-level, the value otherwise), reusing the existing charge/demotion/reset-guard machinery rather than a parallel path. `shotTakeRegeneration.test.ts` builds the state the database lacks — **two shots in one scene, each holding take 1** — and proves the "only that shot" half: shot B take 2 is created with shot B take 1 as its parent, shot B take 1 is demoted, and **shot A take 1 is untouched** (`isLatest` still true, same id, same url). **Still to build for the exit criterion:** the production path that emits per-shot assets in the first place — today every asset is scene-level, so "direct shot 12C" has no shot 12C to address until that exists.

**Per-shot production shipped 2026-11-04 — the take capability now has its subject.** The read named where shots collapse: `routeProduction` (`capabilityRouter.ts:97`) looped `plan.scenes` and pushed exactly one `IMAGE` spec per scene, ignoring `scene.shots`, so `shotId` was never written to a row. `routeProduction(plan, bible, context, { perShot: true })` now emits one IMAGE spec per shot, each carrying its `shotId` and a prompt naming that shot; the runner writes `shotId` onto the asset row. **The multiplier is stated before the build, not discovered after:** every scene template carries **three** `shotIdeas` (15 arrays, all length 3), so per-shot production triples the stills — a 4-scene project goes from **4 stills (320 credits)** to **12 (960 credits)** at 80 each, before video. Because a default that triples cost is a spend decision, per-shot is **opt-in**; the scene-level composite remains the default. **Proven** (`perShotProduction.test.ts`, 5 tests): default emits one still per scene with no `shotId`; per-shot emits one per shot with unique ids; each prompt names its shot; the multiplier assertion is in the test. Combined with `shotTakeRegeneration.test.ts`, the chain is complete at the code level — **regenerating shot B leaves shot A untouched**. **Remaining for the exit criterion's full proof:** a real production with `perShot` enabled, bounded at ~960 credits for a 4-scene project, which is a spend decision and is not made here.

**Shot-level proof, spent 2026-11-04 — 160 credits, and a confound in the design.** Ran the shot arm on `cmvzvo9y` `SCENE_01` (3 shots, owner balance 5,400): two shot stills through `routeProduction(..., { perShot: true })`, each charged **80 via `chargeOrThrow`** — balance **5,400 → 5,240**, the spend measured rather than estimated. **Control:** the existing scene composite (`cmvzvof0`), whose latest critic run is identity **80**, composition **85**, overall **85**. **Shot arm:** `SCENE_01_SHOT_01` and `_SHOT_02`, both identity **80**, composition **85**, overall **85** — identical to the composite, with distinct prompts (hashes `66d440ac...` and `d3e91aa3...`). **The confound:** the shot specs ran with `framingInPrompt=false references=0`, because the proof called `routeProduction(plan, null)` — no bible, so no character references and no identity framing. The comparison is shot-prompt-only versus fully-conditioned composite, not like-for-like. What it does establish: a shot-level prompt with no conditioning matched a conditioned composite at 80/85/85, a positive signal for shot prompts and silent on whether per-shot improves identity. **Named gap:** a conditioned per-shot comparison (two shot stills with references and framing, ~160 credits) is still owed before Phase 4 can be called met on real bytes.

**CORRECTION 2026-11-04 — this phase is blocked by the take model's granularity.** The exit criterion is *"Direct shot 12C regenerates only that shot's take"*, but takes are keyed `(projectId, sceneId, kind, takeNumber)` (`schema.prisma:2630`) — **no `shotId`**, even though `CreativeProducedAsset.shotId` exists (`:2612`). Two shots in one scene would therefore collide on the same take number and violate the unique index. Shot-level takes need the constraint extended to include `shotId` — the same class as the scene-scoped constraint fixed in `20261104020000_story_scene_asset_scope`. **Phase 4 is not startable until that lands; its exit criterion is unreachable today.**

## Phase 5 — Cinematic vocabulary and look — status notes

**Status 2026-11-04 — first slice shipped.** `look.ts` defines the object (lens, movement, lighting, grade, 9:16 resolution ladder); `buildLook()` normalises rather than passing values through (an out-of-ladder value falls back to the default, because a look applies to every shot and one typo should not become an unparseable prompt fragment); `lookToPrompt()` projects deterministically; `lookResolution()` keeps the ladder on 9:16. **8 tests.**

## Sequence determination — status notes

| phase | classification | evidence |
|---|---|---|
| **0 — Baseline proof** | **complete** (2026-11-04) | `**Status.**` pointer at line 50; the eight acknowledged failure lines are unexercised paths, which is what this phase exists to close |
| **1 — Identity store** | **in progress — externally blocked** | identity measured and conditioned (median 70, best 90, control 80); 3 of 7 measured beats clear the floor and 22 flags remain — the remaining coverage is **blocked on creator input for 7 thin-intent projects**, not an engineering queue item |
| **2 — Take model** | **complete** (2026-11-04) | creative take path proven (take 2, 20 → 90, charge verified); story take constraints landed; the take-aware export is **proven by `exportTakeComposition.test.ts`** — three arms, **hit = N−1, miss = 1**, the missed key established by identity, and an identical timeline signature (history: "piece (2) started") |
| **3 — Staged production surface** | **complete** (2026-11-04: re-entry unblocked) | history: *"Phase 3 (2026-11-01) — SHIPPED"* and *"Phase 3: PROVEN AND CLOSED (2026-11-02)"*; the staged surface, approval, and manual studio exist as routes |
| **3.5 — Watch and Submit Films** | **complete** | history: schema, ingestion, and UI shipped 2026-11-01 (`/submit`, films router, `FilmSubmission`/`RevenueTerms`/`CreatorProfile`) |
| **4 — Scoped director** | **in progress** (take capability 2026-11-04) | dependency: Phase 2 take addressing ("*direct shot 12C* regenerates only that shot's take") — the creative take path exists, the **story** per-shot addressing does not |
| **5 — Cinematic vocabulary** | **in progress** (first slice 2026-11-04) | dependency: Phase 2 |
| **6 — Presets and LoRAs** | **not started** | dependency: Phase 5 |
| **7 — Auto mode** | **not started** | dependency: Phase 2 |
| **8 — Motion/object operator** | **not started** (optional) | dependency: Phase 1 |
| **9 — Academy content** | **not started** | dependency: Phases 1–5 shipped |

**CORRECTION 2026-11-04.** The paragraph that stood here said *"what remains is the half that has no code: the take-aware export path … the story side is not."* **That was wrong, and it is preserved here so the record shows both the claim and the correction.** The read found the mechanism already built: `computeSourceHash` hashes ordered `sceneId:assetId` pairs and `buildExportSegmentKey` keys on `sourceAssetId` — both asset-id keyed, so a new take changes exactly one key by construction, and the story export already passes `projectId` into `renderOutputDerivative` so the cache can key segments.

| debt | blocks which phase | disposition |
|---|---|---|
| **Planner persistence** (`explicit.durationSeconds` captured at intent, lost at plan) | **Phase 3's stage contract** — a stage cannot be approved if the plan it produced drops what the creator asked for | **closed 2026-11-04** — the read found the field produced; the gap was a test, not a builder |
| **The eight acknowledged failure lines** | **Phase 0's exit** ("both surfaces proven end-to-end") | **prerequisite to calling Phase 0 complete**, parallel to Phase 2 |
| **Video re-render** (deferred; discontinuity trade-off recorded) | **Phase 3.5 distribution quality** — flagged films cannot be promoted without it | **parallel**; no phase's exit criterion requires it |
| **Thin-input projects** (7) | **Phase 1's exit** ("every generated shot carries the reference") | **parallel, external dependency** — needs better creator input, not a pipeline change |
| **The ledger writer** | **Phase 3.5 revenue** | **blocked** on a revenue pool that does not exist; parallel |
| **Ruleset-requires-current-head** | nothing | **parallel infrastructure** — it blocks merges, not phases; mitigated by `gh pr update-branch` |
- **2026-11-04 — The per-shot conditioning claim was wrong: both arms carry the same references, and the live failure is now unreproduced.** Read both branches of `routeProduction`: the per-shot push spreads the same `characterRefs` the composite does, so there is no dropped field. A direct comparison against `cmvzvo9y` / `SCENE_01` returned **refs=2 and 4 resolved references for BOTH arms** - composite and shot identical. **Withdrawn:** last session's "the per-shot spec never carries character references"; it was inferred from a live log line without checking the branch. **What still stands and is now unexplained:** the live run logged `references=0 framingInPrompt=false` with the bible passed and a prompt hash identical to the un-conditioned run. That evidence is kept, the mechanism is unknown, and the gap is restated as **unreproduced** rather than diagnosed. **Shipped:** `perShotConditioning.test.ts` (4 tests) - both arms non-empty, per-shot refs **equal** the composite's, the shot prompt still differs (addressing survives conditioning), and an unmatched bible yields empty refs in both arms. **No spend.** Next step is to log `spec.characterRefs.length` in the same process immediately before a generate call - zero credits - instead of changing a router the read shows is correct.
- **2026-11-04 — Conditioning drop located at the call site: the adapter reads resolved URLs, the experiment passed semantic refs.** Instrumented `generateStill` (the call site, not construction) with `[creative.spec] scene=... semanticRefs=<n> resolvedRefs=<m>` plus `MISMATCH=char_refs_unresolved`. Reading the adapter settles it: it consumes **`spec.referenceImageUrls`** - a resolved URL list - while `routeProduction` emits **`characterRefs`** (names + descriptions). **Only the runner resolves one into the other.** The live `references=0 framingInPrompt=false` runs called `generateStill(spec)` directly with a router spec, so the adapter saw semantic refs and no URLs, chose FLUX2 text-to-image, and logged 0 - with a prompt hash identical to the un-conditioned run, because the identity block and framing are composed by the runner and were never applied. **No defect in the router or the adapter; the experiment bypassed the layer that conditions.** Outcome 1 of the three predicted branches, confirmed by reading rather than by a second spend. **Shipped:** `callSiteInstrument.test.ts` (4 tests) - mismatch flagged, agreement cleared, plain path unflagged, and the instrument proven to fire before the provider call. **Withdrawn:** both earlier claims (bible: null, then "never carries references"). **No spend.** Phase 4 gap restated: per-shot production is conditioned when it runs through the runner; no experiment has exercised that path.
- **2026-11-04 — Phase 4 closed: conditioned per-shot comparison run through the runner, 240 credits, scores comparable or better.** Two runner defects had to be fixed first, both silent-success shapes: `runCreativeProduction` called `routeProduction(plan, bible)` with no options, so per-shot specs were **unreachable from the only path that conditions**; and the resume key was `sceneId:kind`, so a per-shot run matched the scene composite, generated **0 assets and reported COMPLETED** (observed twice, balance unchanged). Fixed in `#349` with `perShot`/`sceneIds`/`kinds` options and a shot-aware resume key (video seeding still uses the scene key). **The comparison:** control `SCENE_01` composite (runner-by-construction - per-shot did not exist when it was made) identity **80** / composition 85 / overall 85; shot arms **80/85/85**, **80/85/85**, **90/85/85**. Every arm logged `[creative.spec] semanticRefs=2 resolvedRefs=4`. **Cost 240 credits**, balance **5,160 -> 4,920**, three stills at 80. **Finding:** per-shot buys addressing and *at least* parity, with one arm at the 90 band - the honest claim is comparable-or-better on three samples, not a proven quality gain. **Phase 4 exit criterion met on real bytes**, with the conversational director interface still unbuilt and explicitly out of scope.
- **2026-11-04 — Phase 5 persistence shipped: a look is a saved, named, reusable object.** Scope decided from the read, not from the plan phrasing: `(projectId, name)` unique, because "reusable" means across every production in one film and a collision inside a project is a decision to surface. Additive migration `20261104230000_cinematic_look` applied as `supabase_admin`; verified in `pg_indexes` (pkey + `_projectId_name_key` + `_projectId_idx`) rather than by exit code. Service `saveLook` / `renameLook` / `listLooks` / `lookPromptForProduction` with **`LookNameConflictError`** for duplicate save and duplicate rename. Consumer: `runCreativeProduction({ lookName })` resolves the look once per run and composes its fragment onto every still prompt before identity framing. **Acceptance criterion:** saved under a name (yes), survives a re-read (yes), reused by a second production without re-entering fields (yes, at prompt composition), **applied to a real production (not yet on bytes - one still at 80 credits)**. Tests: 9 in `look/__tests__/persistence.test.ts` plus the 8 from the first slice. **No spend.**
- **2026-11-05 — Phase 5 closed on bytes, with two findings: the look scored worse, and the render charged nothing.** One still through the runner with `{ lookName: "Noir" }` on `SCENE_02`: `[creative.look] scene=SCENE_02 name=Noir fragmentChars=113 inPrompt=true` immediately before `[creative.spec] semanticRefs=2 resolvedRefs=4`; asset READY with URL; critic **identity 70 / composition 75 / overall 75** against the same scene at **80 / 85 / 85** without the look. **Finding 1:** the look is a regression on this scene, not an upgrade - 85mm low-key monochrome cost 10 points of identity and 10 of composition. **Finding 2:** balance 4,920 before and after - **zero charged**, because the runner reused the superseded row and the credit idempotency key is derived from the asset id, so re-rendering into the same row replays the key, bills the provider and writes no transaction. That is the same silent-zero class `assertNotResetAfterCharge` was built for, sitting in the reuse path beside it. **Acceptance criterion: all four clauses proven** - saved, re-read, reused by a second production, applied on bytes - with the caveat that the byte-level proof cost 0 credits for the wrong reason. **Phase 5 complete.** Next from the plan: Phase 6 (presets and LoRAs as product objects), which depends on Phase 5 and is not started.
- **2026-11-05 — The reuse-path billing hole: a retry counter that restarts at 1 made a paid render free.** The read named it: `creditKeys.prodAsset.charge(assetId, attempt)` includes the RETRY attempt, which begins at 1 on every run, so a second run over a reused row replayed `prod:charge:<id>:1` - `deductCredits` treated it as a duplicate, wrote nothing, and the provider was billed anyway (balance 4,920 before and after a real render). `assertNotResetAfterCharge` never fired because the reuse path does not reset a row: it re-renders one that is FAILED or READY, which is the adjacent path the guard was never written for. **Fix:** `nextChargeAttempt()` derives the attempt from the row's own `CreditTransaction` history (max + 1), and the runner uses it whenever it reuses a row; a READY row still skips generation and charge entirely. **Tests:** 6 - no history starts at 1, a charged row can never reuse attempt 1, a charged-then-refunded row still advances (the charge row is the durable record), another asset's history does not leak, and two source-level assertions that the runner uses the helper and that READY still short-circuits. All six fail on the previous HEAD: the helper file and its import do not exist there. **No spend.** This is the fourth instance of the silent-zero class: cast references, the take reset, the tolerant rate, and now row reuse.
- **2026-11-05 — Phase 6 opened with a read, not a migration: half the phase already shipped, and the LoRA half has no provider.** The plan's exit (*"a saved look can be applied, shared, and reused"*) is already two-thirds true: `CinematicLook` is applied via `runCreativeProduction({ lookName })` and reused across a project since Phase 5. The new capability is **sharing between creators**, and it needs **no table** - a shared look is the same object copied into another project, with `LookNameConflictError` deciding collisions. **The gap the read found:** the plan promises "a variant and a strength control", but `FluxInput` carries only `prompt`/`steps`/`guidance`/`seed` - **no LoRA or adapter argument** - and the only `.safetensors` mentions are CogVideoX model filenames on a network volume. A strength control would be an object nothing can apply. **Shipped:** `shareLook(...)` reusing `lookPromptForProduction` + `saveLook` (no parallel path), with 6 tests: full field copy, applies in the receiving project, source untouched, collision is the same typed conflict, explicit overwrite, missing source fails loudly. **Scoped out with blockers named:** LoRAs (no provider parameter), "variant" (no distinguishing definition), any new table (nothing needs one; the Phase 5 precedent is that a table shipped before its type was exercised had to be corrected). **No spend.**
- **2026-11-05 — Phase 6 closed on its exit criterion, with the mechanism gap turned into a specification.** Verified against code, not against the previous report: **applied** (the Phase 5 byte proof, `[creative.look] ... inPrompt=true`), **reused** (second production applies a saved look without re-entering fields), **shared** (`shareLook` copies every field into the receiving project and it applies there through the same consumer). **The clause most likely to hide a gap did hide one:** `shareLook` takes `fromProjectId`/`toProjectId` and checks neither ownership nor that the owners differ, so it crosses the creator boundary mechanically but without authorization - and no router calls it yet, so the permission boundary does not exist rather than being weak. Recorded, not fixed: fixing it belongs to the router that will call it. **"Variant and a strength control" is not buildable:** `FluxInput` is `prompt`/`steps`/`guidance`/`seed` with no adapter argument. **The blocker is now specified in three pieces** - a provider parameter (`loras: [{ path, strength }]` in the RunPod payload and `FluxInput`), storage (a volume path or upload for the `.safetensors`, where today only CogVideoX model filenames exist), and threading (a strength field surviving `CinematicLook -> spec -> FluxInput`). That turns "unbuildable" into a checklist the next reader can run against the provider. **Phase 6 marked complete on its exit criterion**, with the mechanism gap preserved as a dependency. **No build, no migration, no spend.**
- **2026-11-05 — Phase 7 read: the auto flag was UI-only, the cap does not exist, and "cheap" was verified at 80 per still.** `IntentQuestion.canAutoDecide` is declared in `shared/types.ts` with the comment "the UI offers a Let Raivstream decide choice" and is consumed by **only** `components/creative/InterpretationPanel.tsx` plus tests — **no server path decides a deferrable question**, so the flag is rendered and never applied. **"Capped credits" has no mechanism at all:** the repo has character ceilings and ffmpeg wall-clock ceilings, no per-run or per-film credit ceiling; charges are per-asset rates. **"Cheap" verified against the rate table:** `generate:flux2` 80 active (and `generate:flux` 80 inactive), so a 4-scene film at three shots each is **12 stills / 960 credits** against **320** for scene composites — cheap per shot, not per film. **Shipped:** `autoResolveIntent()` — the server half of the flag, deciding every deferrable question (creator's words when an option matches, else the first option, never empty) and **refusing** with `blockedBy` when a question is not deferrable. 7 tests, including that a blocked question never receives a decision. **Scoped out:** the credit cap, mechanism named — a per-run ceiling checked **before each charge** in the runner loop. **No spend, no migration.**
- **2026-11-05 — The per-run credit cap shipped: auto mode is "capped" now, not only "defaulted".** Read first: `CreativeProductionRun` had counts and timestamps and **no ceiling of any kind**; every charge was a per-asset rate. The ceiling is now persisted on the run - `creditCeiling` (null = uncapped) and `creditsSpent` (default 0) - because a money ceiling in memory restarts at zero on every resume, quietly restoring the whole budget. **Per run, not per asset:** the 80 that `generate:flux2` charges is a rate; the cap accumulates across every asset the run pays for. **Checked before the charge**, so it withholds the next asset rather than reporting an overrun the ledger already has, and refusal is a typed `CreditCapExceededError` naming ceiling, spend and next cost. A partially-completed run is not aborted for having spent. **Migration** `20261105160000_production_run_credit_cap`, additive and nullable, applied as `supabase_admin` and verified in `information_schema`. **Tests: 11**, including the one that catches ephemeral state - a resumed run inheriting the previous attempt's ceiling AND spend. **No spend.** Phase 7's shipped surface is now `autoResolveIntent` (defaults with refusal) plus this cap; the remaining Phase 7 gap is the end-to-end "one line to publishable film", which needs both wired into a router.
- **2026-11-05 — Auto mode wired end to end: `creative.project.auto` composes the refusal and the cap.** The two shipped pieces were unreachable from any router, so "one line in, a capped film out" had never been assembled. The new procedure runs `interpret -> autoResolveIntent -> createFromIntent -> plan -> runCreativeProduction`, every step an existing service, with the composition in `runAutoProduction` taking injected dependencies so it is testable without a database. **Blocked contract:** a non-deferrable question returns `status:"blocked"` with `blockedBy` and the prompts BEFORE a project exists or a charge occurs - asserted by `createProject`/`buildPlan`/`runProduction` never being called - and the decisions already made come back with it so the creator is not asked twice. **Default ceiling 480**, from arithmetic rather than taste: 80 per composite still, one still per scene, six-beat film = 6 × 80, with per-shot work left to a deliberate request at three times the cost. The ceiling is never null on this path. **13 tests** at the composition boundary (step order, explicit ceiling, blocked short-circuit, decisions surfaced). **Not proven on bytes:** no auto run has produced a film; a bounded real run is 1-2 scenes at 80-160 credits and was not spent. No spend this session either.
- **2026-11-05 — Bounded auto run: the cap worked, the film did not complete, and the ceiling was wrong twice.** One sentence through `creative.project.auto` on the deployed build (0b03632): every question auto-resolved, project and 4-scene plan created, production ran under an explicit ceiling. **Spend 920** (balance 4,920 -> 4,000), ceiling 960; the cap refused the charge that would have reached 1,120 **before** spending it - the guard behaving exactly as specified. **Assets:** 8 attempted, 7 READY (4 stills, 3 videos); the 4th video is the refused one. **Defect 1:** the ceiling derivation used the cheapest video rate in the table (80) while the runner charges `generate:h3_max` at **200**, so the default is now **1680** = 6 x (80 + 200). **Defect 2:** the cap refusal surfaced as a failed asset on a run still marked `COMPLETED`, so a caller cannot distinguish a capped run from a finished one without comparing `creditsSpent` with `creditCeiling` - the silent-success shape again, this time on the cap itself. **Phase 7 stays open** on the completeness clause: no single sentence has yet produced a complete, publishable film.
- **2026-11-05 — A capped run no longer reports COMPLETED: the guard changed the work, not the report.** Read: the per-asset `catch` swallowed `CreditCapExceededError` as an ordinary asset failure, the loop continued, and the final status came from an inline `generated/failed` ternary (runner.ts finalize block) - which is why a run that refused a 1,120-credit charge still said `COMPLETED` with `creditsSpent` 920. The status enum already had **PARTIAL**, so no migration was needed. **Fix:** detect the cap error in that catch, stop the loop (every later charge would be refused identically), mark the asset failed with the error code, and finalise through `finalRunStatus` -> PARTIAL with `lastError = "CREDIT_CAP_EXCEEDED ceiling=<n> spent=<n> stoppedAt=<i>/<m>"`. **Under-ceiling runs still report COMPLETED**, so the status keeps its information. **Default ceiling corrected to 1680** = 6 x (80 + 200), from the rate the runner actually charges. **Tests: 18** in the cap suite (up from 11) - capped-never-completed, under-ceiling-still-completed, empty-and-failed-is-FAILED, the reason format, and three source assertions that the runner uses `finalRunStatus`, detects the cap, and records the reason. **No spend:** the second film run (~1,120 at the corrected ceiling) was not affordable in this session and is recorded as the remaining cost.
- **2026-11-06 — Full auto run at the corrected ceiling: cap held, film one scene short, three findings that are not the cap.** Same sentence through `creative.project.auto` at the default 1680: **4 scenes, spent 920 of 1680, run COMPLETED, 6 of 8 assets READY**, balance **4,000 -> 3,160 (net 840 measured)**. **The two missing assets share one cause:** `SCENE_01`'s still was rejected by content moderation - *"Your prompt was flagged for graphic violence"* - and its video then failed because H3-Max is image-to-video and had no seed image. One flag cost a whole scene. **Finding 2:** the sentence was classified **EDUCATION** rather than STORY (the word "teaches"), so auto-resolve decided *"What age group are we teaching?"* and *"How long should the lesson be?"* - the classification is wrong, not the defaults. **Finding 3:** the run reports `creditsSpent` 920 while the measured net is 840; the ledger shows a charge of 80 plus its **refund** (scene 1's rejected still), and the run counter never decrements on refund, so counter and ledger disagree by exactly the refunded amount. **Phase 7 stays open on completeness** with the blocker named: a moderation rejection removes a scene because the path has no fallback (softened retry or scene drop). **Spend 840 credits, measured.**
- **2026-11-06 — Moderation fallback shipped, and the refund counter fixed in the same change.** The read found both mechanisms already present and unused for this purpose: `suggestSafeRewrite` (`promptModeration.ts:190`) for softening, and `refundCredits` in the runner's catch. The defect was that the runner treated a rejection as final (`if (rejected || providerFinal) break;`), so one flag produced a failed still, a video that could not seed, and a run that reported success. **Now:** one softened retry with the rewritten prompt (a rewrite identical to the original is rejected as a retry - it would fail again and cost a charge to learn nothing); a second rejection **drops the scene with the reason recorded** (`SCENE_DROPPED moderation_rejected`); its video is skipped with `action=skip_video reason=scene_dropped` rather than failing for want of a seed; and the run finalises **PARTIAL** whenever `droppedScenes > 0`. **Net spend:** `netSpendAfterRefund` takes a refunded charge off `creditsSpent`, so the cap counts money actually kept - the real run's 920 gross vs 840 net divergence is closed by construction, and the refund idempotency key now matches the charge key instead of the retry-loop counter. **Tests: 15** (retry-then-drop decisions, identical-rewrite refusal, dropped-scene recording, seed-chain rule, PARTIAL status, net-vs-gross arithmetic, plus four source assertions that the runner wires each piece). **No spend.** **Phase 7 still open on completeness** - the fallback turns a deleted scene into a documented gap, but no complete film has been produced, and the **EDUCATION-vs-STORY classification gap** (a story sentence read as a lesson because of "teaches") is untouched and is the likeliest source of the next flag.
- **2026-11-06 — Fallback wiring corrections caught by the suite (not by review).** Two defects introduced during the wiring and fixed before merge: (1) the run ROW was finalised with PARTIAL while the RETURNED result still computed an inline ternary, so caller and database disagreed — the return now calls the same `finalRunStatus`; (2) `finalRunStatus` had lost the original `failed > 0 && generated > 0 -> PARTIAL` rule, so partially-produced runs began reporting COMPLETED — restored, with three expectation changes recorded deliberately: the safety test's "never retried" contract became "one softened retry, then drop", and five prompt-moderation mocks needed the new `suggestSafeRewrite` export. Suite 2,402 green, 194 files.
- **2026-11-06 — Narrative beats a lone verb: the type classifier no longer reads "teaches" as a lesson.** The read named it: `detectProjectType` is a **keyword count** (`signalScore` substring match over `TYPE_SIGNALS`, `interpreter.ts`), and EDUCATION listed a bare `teach` - so *"A lighthouse keeper finds an injured bird and teaches it to fly again"* scored EDUCATION 1, STORY 0, and the type drove the questions: auto-resolve answered *"What age group are we teaching?"* for a story. **Fix:** bare `teach`/`learn`/`learner` removed in favour of pedagogical phrases (`teach children`, `lesson about`, `learn how`, `let's talk about`, `how does`), plus a **narrative-form rule** that promotes STORY when the sentence opens on a protagonist performing a story action. **Both directions tested** (7 tests): lighthouse + two teaching-free stories -> STORY with no education question; three genuine lessons -> EDUCATION with their own questions. **The regression this could have caused was real and caught:** removing bare `teach` failed *"Teach children how gravity works"* and two Phase 10 tests, which the phrase list now covers - a classifier that never returns EDUCATION would be a different bug. Suite 2,409 green. **No spend.** Phase 7 still open on completeness; next full run ~840-1,120 credits.
- **2026-11-06 — Third full auto run: classifier fix confirmed, failure moved to video prompts, fallback scope too narrow.** Same sentence at ceiling 1680: classification **STORY** (EDUCATION 0), decisions were "Should the ending feel hopeful...?" and "Who is this story for?" - **no teaching questions**. **All four stills READY**, including SCENE_01, whose still the first run had rejected, so the classifier fix closed the image flag it was aimed at. **Net spend 720** (balance 3,160 -> 2,440), run **PARTIAL**, 6 of 8 READY. **The two failures are videos** (SCENE_01, SCENE_02): "Your prompt was flagged for graphic violence". **The fallback did not fire** because the retry/drop path is gated on the IMAGE kind - a rejected video gets neither a softened retry nor a drop record, which is why dropped=0 while two assets failed. That is a scope defect in the fallback written last session, not a classifier regression. **Phase 7 remains open on completeness** with the next step named: extend the fallback to VIDEO and inspect why the video prompt trips a filter its own still passes. Cost of the next full run ~720 credits.
- **2026-11-06 — Fallback widened to video; the root cause was the prompt, not the gate.** The read named the gate (`rejected && spec.kind === IMAGE && !moderationRetried`) and read the two actual prompts: they differ only by "Motion sequence" vs "Key visual" and the `Camera:` line, so the video was flagged for the same scene text its still had passed. The moderation error names the phrase - *"finds an injured bird"* - and the still had been softened while the video kept the original, because the fallback mutated only the still spec. **Fix:** the gate covers every asset kind (one softened retry for a rejected video, reusing the still already in `byKey` as the seed so nothing is regenerated or re-charged), and a still's rewrite is stored per scene and applied to that scene's video prompt (`applySoftenedPrompt`). Drop records carry the kind (`SCENE_DROPPED moderation_rejected kind=VIDEO`). **Tests: 10 new** - propagation and its no-op cases, the kind in the record, and four source assertions. Suite 2,418 green. **No spend.** Phase 7 open on completeness; next full run ~720 credits.
- **2026-11-06 — Fourth full auto run: stills all READY, the same two videos still rejected, and two measurement defects hide why.** Same sentence at ceiling 1680: classification **STORY**, decisions *"Should the ending feel hopeful...?"* and *"Who is this story for?"*, **all four stills READY**, **net spend 720** (balance 2,440 -> 1,720), run **PARTIAL**, 6 of 8 READY. SCENE_01 and SCENE_02 videos failed with the same graphic-violence message. **What cannot be said from the data:** whether the widened fallback retried them. The outer failure handler overwrites `errorMessage` with `lastError.message`, destroying any `SCENE_DROPPED` marker - so `dropped=0` in my query proves nothing - and no log records whether a softened retry was attempted or what text it used. **Hypothesis, labelled as one:** the stills passed first time, so `sceneSoftened` was empty and the video kept the original scene text; the propagation only fires when a still was softened, and here the still needed no softening while the video tripped on the same phrase plus its motion and camera additions. That points at **moderation tuning for video**, not at the fallback's scope. **Open in order:** stop overwriting `errorMessage`; record retry attempts; decide whether video prompts are softened proactively. **No complete film; Phase 7 stays open.**
- **2026-11-06 — Instrumentation fixed: a drop is structured, a retry is counted, and the fourth run's silence is explained.** Read: the asset's `errorMessage` has four writers, and the outer `if (!ready)` failure handler runs **after** the drop and overwrote `SCENE_DROPPED` with `lastError.message` - which is why `dropped=0` proved nothing. **Fix:** drops live in a structured field (`creative_production_runs.droppedAssets` JSONB, `[{sceneId, kind, reason}]`) and `moderationRetries` INT, both persisted at finalisation, with the failure handler preserving a drop's reason; every softened retry increments the counter and logs `asset=<id> kind=<K> attempt=<n> rewritten=true softenedChars=<n>` - counts and length only, never prompt text. Migration `20261106110000_run_drop_instrumentation` applied and verified in `information_schema`. **Proactive-softening decision recorded, not implemented:** a **pre-flight moderation check is feasible and free** because `moderatePrompt` is exactly what `assertPromptAllowed` calls, so the composed prompt can be checked and softened **before** the charge - converting a paid rejection into a free refusal, and avoiding the side effect of proactively rewriting prompts that would have passed. **Tests: 6 new**, suite 2,424 green. **No spend.** Phase 7 open on completeness; fifth run ~720 credits, now with instrumentation that can report what it did.
- **2026-11-06 — Pre-flight moderation shipped, and the video hypothesis answered for free: the still passes, the video does not.** The check now sits **before** the ceiling guard and the charge: a rejected prompt gets one softening attempt, is re-checked, and on a second failure is refused with `PREFLIGHT_REFUSED kind=<K> reason=<r>` - **no charge, no provider call**. A passing prompt is unchanged. **The free finding, obtained by moderating run 4's own composed prompts without submitting anything:** SCENE_01 **IMAGE allowed / VIDEO flagged** for the same scene text - hypothesis **confirmed** - and SCENE_02 flagged in **both** arms, consistent with run 4 having softened that still and never its video. The flagged phrase is the scene description itself. The video prompt's only difference is `Motion sequence` vs `Key visual` plus the `Camera:` line, so the filter is scoring the *combination*, not a violent word. **Tests: 9 new**, suite 2,433 green. **No spend:** the hypothesis cost 0 credits and the fifth run now tests a pre-flight-guaranteed prompt set rather than re-buying the discovery.
- **2026-11-06 — Whole-film pre-flight run free: 5 pass, 0 soften, 3 refused - and the softening has never worked.** Moderated all eight composed prompts before any spend. Every refusal reported `no_rewrite`; the read found why: `suggestSafeRewrite` returns `{ flaggedPhrase, safeRewrite }` and **every caller read `.rewritten`**, a field that does not exist - so the fallback has been a no-op since it was written, and the new pre-flight inherited the same wrong name. **Fixed** at both call sites (code, no spend). **Two further findings:** `VIOLENCE_REPLACEMENTS` has no rule for the injury phrasing this story uses, so even a working rewrite offers nothing; and moderation is **non-deterministic** - SCENE_04's still was refused in the first table and allowed in the second, minutes apart, no prompt change. **Decision: do not run the fifth film.** Three of eight assets would be refused with no rewrite, and one flipped state between identical checks; ~720 credits would buy a documented partial judged by a flaky filter. **Next:** extend the replacement map for injury phrasing, treat pre-flight as a sample rather than a guarantee, then run.
- **2026-11-07 — Injury phrasing softens; the filter measured stable over 24 checks.** The read found `VIOLENCE_REPLACEMENTS` was a flat list of graphic-violence terms with **no injury entry**, and that `suggestSafeRewrite` rewrote only **inside the flagged clause** - so when moderation flagged the composed prompt for a combination, the injury phrase was never touched and no rewrite was offered. **Fixed both ways:** injury terms map to narrative-safe alternatives (`injured`/`wounded`->`fragile`, `blood`->`marked`, `bleeding`->`resting`, `hurt`->`troubled`) and the map is applied to the **whole text**. **Genuine violence still flags and still maps to its own replacements** - both directions tested (6 tests). **Stability table, 3 repetitions x 8 assets = 24 checks, 0 credits:** with the new map **4 pass, 4 soften, 0 refused, 0 flips**; `SCENE_01 VIDEO`, `SCENE_02 IMAGE`, `SCENE_02 VIDEO`, `SCENE_04 IMAGE` all soften deterministically. Against the old map the same run gave 4 refused and also 0 flips, which reclassifies the earlier SCENE_04 flip as a sample artefact rather than a genuinely unstable filter. **Decision:** every asset passes or softens with no flips, so the fifth run is worth **~720 credits** - deferred to its own session, which re-runs this table first. Suite 2,439 green. **No spend.**
- **2026-11-08 — Fifth auto run: the pre-flight worked on real money, and the film stopped on the provider account.** Gate re-established on deployed `35066c5`: **4 pass / 4 soften / 0 refused / 0 flips** (24 checks). The run produced **6 of 8 READY** - and for the first time **SCENE_01 and SCENE_02 are READY**, the two scenes every previous run lost to moderation, because the pre-flight softened their prompts **before the charge** (`moderationRetries=3`, three `preflight=softened` lines, zero refusals). **The two failures are not content and not the cap:** `SCENE_04` IMAGE returned **`Forbidden`** and its VIDEO **`fal video disabled: account locked or balance exhausted`**. Net spend **840** of 1680 (balance 1,720 -> 880), status `PARTIAL`, `droppedAssets=null` because nothing was dropped - the provider refused outright. **Phase 7 remains open on an external blocker:** the fal account is locked or out of balance; finishing the film needs one scene (~280 credits) once it is restored. Suite 2,439 green.
