# Roadmap history

Dated narrative for the [Rush parity roadmap](../rushfeature.md). The plan is **edited**;
this document is **appended**. Two documents because append-driven erosion is the failure mode:
one file cannot hold one rule for intent and another for history without one of them winning.

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
