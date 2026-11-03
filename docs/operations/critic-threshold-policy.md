# Creative Critic threshold policy

**Status:** decided 2026-10-31. Supersedes the implicit 90. Updated the same day with the
per-dimension gate.

## The decision

`DEFAULT_CREATIVE_CRITIC_THRESHOLD = 80` **and** `DEFAULT_CREATIVE_IDENTITY_THRESHOLD = 85`.

Auto-approval requires **both**: `overallScore >= 80` **and** `characterIdentityScore >= 85`.
The identity reads from the per-dimension scores, never from the aggregate, and **fails closed**
when `characterIdentity` is missing or non-numeric.

## Why identity is gated separately

The aggregate can hide the axis a phase is about. Phase 1 was about character identity, and an
asset can score 85 overall on composition and lighting while the character has drifted - which
is exactly the regression the phase exists to prevent.

The numbers come from the same calibration as the overall threshold:

| Asset | Overall | Identity |
|---|---|---|
| reference-conditioned (`flux-2/edit`) | 85 | 90 |
| pre-reference (`flux-2`) | 75 | 80 |

85 sits between the two identity points, so the gate answers "did the character hold."

## issues is advisory and can contradict recommendation

Recorded because someone will eventually try to use it as a filter:

- **799 of 801** `APPROVE` runs carry a non-empty `issues` list, so an empty list is not
  synonymous with approval.
- **4 of 8** `SUGGEST_REFINEMENT` runs carry `issues: []`, so an empty list can accompany a
  recommendation to refine - an internal disagreement in the critic's own output.

**Do not use `issues.length === 0` as a proxy for quality.** The `recommendation` field (now
derived from both scores) is the gate; the issues list is context for a human.

## Why 80 and not another number

The value is set by the calibration data, not by taste:

| Asset | Conditioning | Overall | Identity |
|---|---|---|---|
| `cmvuy10bu…` (scene 1, Sneaky Hopper) | reference-conditioned (`flux-2/edit`) | **85** | **90** |
| older scene 1 image | pre-reference (`flux-2`) | **75** | 80 |

80 is the only value between those two points, so the gate answers the question
the phase is about — **did the creator use their references?** — rather than
"was this perfect".

- 90 would reject the reference-conditioned asset (85): the gate would mean
  "is this perfect".
- 70 would pass both: the gate would mean nothing.

## What the threshold does and does not do

- Assets below 80 return `SUGGEST_REFINEMENT` rather than being blocked. **The
  threshold gates auto-approval, not publication.**
- **It does not retroactively re-score anything.** The 802 assets approved under
  the constant-90 critic remain **provisionally approved pending re-score**.
  This decision is forward-looking only. Reading "threshold 80" as a
  re-evaluation of the backlog is a misreading.

## Context: why the previous value was meaningless

Until 2026-10-30 the critic returned a constant. `creativeCriticProvider.ts`
sent a fully filled-in JSON example instead of a schema, and gpt-4o-mini echoed
it: across 802 completed runs there was exactly one distinct score, 90. A
threshold of 90 therefore equalled the only producible score, and every asset
auto-passed by construction. See the SESSION.md entry for 2026-10-30.

## Revisit

Per-dimension gating has landed (Phase 1, piece 3 follow-through): auto-approval requires
`overall >= 80` **and** `characterIdentity >= 85`. See "The decision" above.

## Watch: the gate's first real rejection

The identity gate was designed from calibration, not from a failure. Checked against every
completed run at the time it shipped, **zero assets would have been newly rejected** — the 802
constant-90 rows carry `characterIdentity = 90` and pass trivially. So the gate is currently
validated by its test matrix and by nothing else.

The event it exists for is:

```
overallScore >= 80 AND (characterIdentityScore IS NULL OR characterIdentityScore < 85)
```

**That event is worth alerting on**, because it is the first evidence the gate does anything.
Two interpretations if it never fires over a long window:

- the gate is unnecessary (assets do not drift in this way), or
- the identity dimension is not measuring drift.

Both are worth knowing, and neither can be distinguished by reasoning about the code. Until the
first rejection, treat the gate as **prospective and unproven in production** rather than
validated.

## Related open work

- 802 provisionally-approved assets: a re-score sweep needs a **policy** for what
  happens when a re-score returns `SUGGEST_REFINEMENT` on something already live
  in a feed (withdraw / flag / leave with a note). Named in
  `docs/rushfeature.md` future plans alongside the admin takedown gap.

## The case that forces per-dimension gating (2026-11-02, production)

The lighthouse run produced four scored assets. One of them:

| scene | overall | characterIdentity | storyAlignment |
|---|---|---|---|
| SCENE_03 | **85** | **0** | 75 |

**An overall of 85 passed the gate while the character was absent from the frame.** The other three scenes scored
85 / 70 / 85 with characterIdentity 80 / 60 / 80, so the aggregate moved by 15 points across a 60-point spread in
the dimension that actually matters for a character-driven film.

Two consequences, both now recorded as requirements rather than observations:

1. **A dimension threshold is not a stricter overall threshold.** No single aggregate cut-off separates SCENE_03
   from SCENE_01 — both are 85. Only the per-dimension value distinguishes them.
2. **The failure is silent by construction.** Nothing in the pipeline treats `characterIdentity: 0` as exceptional,
   so the asset would proceed to cut with an absent character and every log line would say `status=ok`.

This is the evidence base for the per-dimension gating phase; the acceptance test is the SCENE_03 row above.

## Per-dimension floors (shipped 2026-11-02)

The aggregate gate is no longer sufficient. An asset fails if **any** dimension falls below its floor, even when
`overall` passes. Thresholds are data — `DEFAULT_DIMENSION_FLOORS` in `qualityScorer.ts`, one table:

| dimension | floor | why |
|---|---|---|
| `characterIdentity` | **85** | unchanged from Phase 1; identity drift is the failure the critic exists to catch |
| `continuity` | 70 | catches visible wardrobe/lighting/set jumps between scenes |
| `composition` | 70 | a usable frame clears 70 without being remarkable |
| `lighting` | 70 | below this the subject reads as unlit |
| `emotion` | 65 | most subjective; flags a dead performance, not a plain one |
| `visualStyle` | 65 | tolerates a loose interpretation of the chosen style |
| `environment` | 65 | tolerates a sparse but readable set |
| `storyAlignment` | 70 | the "reads as the right moment" line |
| `sceneClarity` | 70 | comprehension floor for a single look |
| `technicalQuality` | 70 | artefacts, warping, extra limbs — below this the asset is not shippable |

**Fail-closed:** a missing or non-numeric dimension is a breach, never an exemption. `null`, `'n/a'`, `NaN` and an
absent key all fail, and so does a `null` scores object.

**The aggregate stays.** `overall >= 80` is still a gate; the floors are additional. A uniformly mediocre asset
(every dimension 82) passes the floors and fails the aggregate — both checks are load-bearing.

### Acceptance case

SCENE_03 (production, 2026-11-02): `overall: 85`, `characterIdentity: 0` → **SUGGEST_REFINEMENT**, with the breach
named as `['characterIdentity']`. Test: `dimensionFloors.test.ts`, "the SCENE_03 acceptance case".

### The honest caveat, recorded at ship time

**This gate has zero rejections in production so far.** The 802 constant-90 assets carry `identity: 90`, and every
real run to date clears its floors. Its first genuine rejection will be its proof, and that has not happened yet.
That is the correct state for a gate built from calibration rather than from a live failure — but it means the gate
is *untested against reality*, only against its matrix (21 cases: 10 dimensions × 3 boundary points, aggregate
interplay, the SCENE_03 row, and four fail-closed shapes).

## Live-content policy (decided 2026-11-02: **flag, do not unpublish**)

The gate had zero production rejections when this policy was written. It is therefore **prospective**: it
describes what will happen the first time a per-dimension floor rejects an asset that is already live, not what has
happened.

### The decision

**A rejected live asset is flagged for human review and stays visible until a person looks at it.** An automated
gate does not get unilateral power over published content.

Reasoning: the control is the human review, not the automation. This is the same principle that allows
self-approval with an audit trail, and the inverse of the admin-takedown gap — an automated mechanism acting on live
content without a human in the loop would be the `isKidsSafe` class one layer up. The cost is latency, and latency
is the correct price for not letting a score remove a published film.

### What the gate does, by asset state

| asset state | gate result | effect |
|---|---|---|
| **new** (not published) | any dimension below floor | `SUGGEST_REFINEMENT`, no publish. Breach named, e.g. `['characterIdentity']`. |
| **live** (published) | any dimension below floor | **flag row written, asset stays live**, breach named. No feed change. |
| any | missing/malformed scores | fails closed, same as above for its state |

### The audit requirement

Every rejection of a **live** asset must write a row naming:

- `assetId`, `sceneId`, `projectId`
- the breached `dimension`, its `score`, and the `floor` it missed
- the `runId` and the critic/threshold version used
- `createdAt`, and the reviewer fields once someone acts (`reviewedAt`, `reviewedById`, `decision`, `note`)

**Without that row, "flagged for review" is indistinguishable from "silently ignored"** — and the second is what the
system does today. The row is the difference between a policy and a hope.

### The condition under which this policy should change

Revisit — toward faster action, not toward automation for its own sake — if **any** of these occur:

1. **A flagged asset stays unreviewed for more than 14 days.** Flagging is only safe if review actually happens.
2. **The 802 re-score batch finds more than 5% of live assets below a floor.** That is a population problem, not an
   individual-review problem, and per-asset flagging would not keep up.
3. **A flagged asset with a dimension below half its floor is reported by a viewer before review.** At that severity,
   latency stops being an acceptable price.

None of these has occurred yet; they are stated now so the policy is changed by evidence rather than by discomfort.

## 802 re-score batch result (run 2026-11-02)

**The 5% change condition fired on the first run, by a wide margin.**

| measure | value |
|---|---|
| image assets in the population | **109** |
| processed | 95 (+10 skipped as already re-scored) |
| flagged | **97** (89 from the batch, 8 from the pilot) |
| share of scoreable images below floor | **~89%** |
| breached dimension | `characterIdentity` — **every single flag** |
| score range vs floor 85 | **0 – 80** |
| failures | 4 (provider 400 on specific assets) |

Two findings, and the second is the larger one:

1. **The number is not a clean-up list; it is a verdict on the old critic.** 802 assets approved under the
   constant-90 critic are, under the current per-dimension gate, overwhelmingly below the identity floor. The old
   score of 90 was not measuring identity — the same failure the SCENE_03 row showed in miniature.
2. **Policy revisit condition #2 is met:** more than 5% of live assets are below floor, so per-asset flagging cannot
   keep up. The policy says that is a population problem, and the population is the backlog.

**Idempotency, precisely.** No asset was flagged twice — the `(assetId, runId)` unique key and the critic-version skip
guarantee it. A second run added **2** flags because 4 assets had *failed* the first time and were retried; a retry
that succeeds is new information, not a double count. "Zero new flags" holds only for runs whose predecessor had no
failures.

**Selection bug found by the pilot, worth carrying:** the first version included VIDEO assets and 10 of 20 failed with
`Creative critic provider failed with 400` — the critic scores a still frame. A 50% failure rate that looked like a
provider problem was a population problem, the same class as the earlier cohort's cold-cache error.

**What this does not do:** it does not unpublish anything, does not change the original runs, and does not resolve any
flag. Resolution is human review, and there are now 97 rows waiting for it.

## Quarantine — the population treatment (shipped 2026-11-02)

**Trigger:** 97 of 109 image assets scored below the `characterIdentity` floor (~89%), every flag on that one
dimension. Revisit condition #2 fired on the first run. Per-asset review cannot absorb 89%, so the treatment is
population-level.

`packages/api/src/lib/films/quarantine.ts` — `quarantineVerdict()`, `shouldSurface()`, `feedExclusionWhere()`, 13 tests.

### Three surfaces, three behaviours

| surface | below floor | unscored |
|---|---|---|
| For You / trending / discover | **excluded** (promotion stops) | included |
| creator's own library | included | included |
| direct link / film page | included | included |

**Quarantine fails OPEN on unknown, unlike approval which fails CLOSED.** An unscored asset is unknown, not bad;
quarantining it would hide the entire unscored library — a threshold applied to absent data. The tests assert both
directions explicitly, and a `null` / `''` / `NaN` identity score is treated as unscored rather than as `0`.

### The finding that makes this inert today, stated plainly

**The feed cannot apply quarantine yet.** `Video` carries no reference to the `CreativeProducedAsset` that produced
it — there is no `sourceProducedAssetId`, and the publish path does not write one. A feed predicate has nothing to
join against, and shipping one anyway would exclude zero rows while appearing to enforce a policy: the false-pass
shape this project keeps catching. `feedQuarantineIsWired()` returns `false`, and a test asserts it, so nobody can
ship that filter believing it works.

**Prerequisite:** a `Video.sourceProducedAssetId` column populated at publish time, then a feed clause. That is a
build with a backfill question (most existing videos have no recorded source), not a predicate.

### Verified against real data (not fixtures)

- **99 flags, 99 below floor** — every flagged asset is genuinely below the identity floor.
- **109 image assets, 1 unscored, 0 unscored-but-flagged** — the unscored asset was not quarantined by the batch.

### The reframe

The flags are no longer *"97 assets awaiting individual review"*. They are **the backlog that quarantine absorbs**.
The un-quarantine path is a **re-render with the identity fix**, not a review decision per asset — which is a cost
question (~97 stills × ~80 credits, plus video), not a policy question.

### Phase 1 reframe — the identity measurement was never running

SCENE_03 (`overall: 85`, `characterIdentity: 0`) was **the pattern, not the outlier**. Across a 109-asset library the
identity score sits between 0 and 80 while the aggregate stayed near 85. The Phase 1 claim that identity gating was in
place was true of the *code* and false of the *library*: nothing had ever measured it there.

### When quarantine should be lifted

When the below-floor count falls under **5%** of image assets — whether by re-render with the identity fix or by the
backlog ageing out — quarantine is no longer a population treatment and should be removed rather than kept as a
permanent invisible state. Stated now so it cannot become one.

## Wiring quarantine to the feed (2026-11-02) — the column landed, the links did not

`Video.sourceProducedAssetId` shipped **nullable**. NULL means "source unknown", and unknown is **fail-open** in
`quarantine.ts`: an unsourced video is not quarantined, exactly as an unscored asset is not. That symmetry is the
whole reason the column is nullable rather than required — the alternative is guessing, and a guessed link lets a
score act on content it never scored.

### The populate path: there isn't one yet

Four code paths create a `Video` — generation publish, library publish of a `StorySceneAsset`, story export, and
upload. **None of them reads a `CreativeOutput`.** The 5.0 creative pipeline renders outputs (44 READY, all with
URLs) and has no publish-to-feed step, so there is no write-time fact to record. The link was not forced in; it is
absent because the flow is absent.

### The backfill: measured, then declined

| option | result |
|---|---|
| (a) join `videos.mp4Url` → `creative_outputs.assetUrl` | **0 matches** across 14 videos × 44 ready outputs |
| (b) leave NULL | the default — historical videos stay surfaced (fail-open) |
| (c) targeted pass for the 99 flagged assets | **impossible**: none of those assets is a video's source, because no video ever came from them |

**The named number: 14 of 14 videos (100%) have `sourceProducedAssetId IS NULL`.** That is the population quarantine
cannot reach, and it is stated rather than implied. It is also the correct value — the data genuinely lacks the link,
so the honest column is empty.

### The wiring now reports on data, not schema

`feedQuarantineIsWired(videosWithSource: number)` returns `videosWithSource > 0`. A column's existence is not
wiring; **one populated row** is. Today it returns `false`, and the test asserts both the inert case (a fresh
database) and the live case, so the rule survives the flip.

The old "not wired" test was **updated, not deleted** — it now asserts the predicate is inert when **no video carries
a source**, which is the real pre-populate state.

### What follows the link

The film-page disclosure is still deferred, for the same reason it was deferred before: there is nothing to read. Once
a publish path writes `sourceProducedAssetId`, both the feed clause and the disclosure become one-line reads.

### Lift condition, unchanged

Quarantine lifts when below-floor assets fall under **5%** of images. The un-quarantine path remains a **re-render with
the identity fix** (~97 × 80 credits plus video) — a spend decision, not a policy one.

## Creative publish — the link that makes quarantine load-bearing (2026-11-02)

Operator decision: **approved outputs only.** A creative output becomes a feed video only when its version carries an
APPROVED `CreativeApproval` and the output is `READY` with media — the `publishExport` rule applied to the creative
pipeline, rather than a second publishing path with weaker preconditions.

### What the publish path writes

`creative.output.publish` → `outputService.publish`:

| field | value |
|---|---|
| `mp4Url` | the output's `assetUrl` |
| `sourceProjectId` | the project |
| `sourceVersionId` | the approved version |
| `sourceProducedAssetId` | **only when the version has exactly one READY asset** — a film spans many scenes, so the single-asset column is often not knowable |
| `moderationStatus` | `PENDING`, the existing publish rule |

Idempotent by media URL: a second publish of the same output returns the existing video and creates nothing.

**Provenance is written at publish time, never derived at read time** — the Phase 3.5 attribution rule. A read-time join
is an inference that goes stale the moment an asset is re-rendered.

### Preconditions, both directions tested

Refused with a typed error: no approval row, `PENDING` approval, `REJECTED` approval, output not `READY`, and `READY`
with no media. A publish path that accepts an unapproved version would let a rendered-but-unblessed cut reach a feed.

### Two separate spends, and they must not be conflated

1. **The 99-flag backlog is a re-render decision** (~97 × 80 credits + video). Quarantine cannot reach those assets
   because **no video ever came from them** — there is nothing to quarantine, only something to regenerate.
2. **Creative publish is a forward-looking capability.** It makes quarantine meaningful for work produced from now on.
   It does **nothing** for the backlog.

Saying "quarantine handles the backlog" would be false: quarantine stops promotion, and those assets were never
promoted. They need the identity fix and a re-render.

### Disclosure

Now readable — a film page can walk `Video.sourceProjectId` → assets → minimum identity — but it is not shipped in this
pass. It is a one-line read on top of a link that now exists, and it belongs with the feed clause that consumes the same
link.

## Quarantine on real data (2026-11-02) — partial, and stated as partial

One below-floor creative output was published to prove the clause on production rows rather than mocks.

| check | result |
|---|---|
| publish writes provenance | ✅ `sourceProjectId` + `sourceVersionId` set; `sourceProducedAssetId` **null** (the film spans several assets — the designed behaviour) |
| below-floor video (`min identity 50`) absent from `forYou` | ✅ absent (13 items) |
| below-floor video absent from `trending` | ✅ absent |
| below-floor video absent from `viewersPick` | ❌ **present** — clause is in that query's source, so this is **unexplained** |
| unsourced historical video still surfaced | ✅ present in forYou, trending **and** viewersPick — the NULL branch proven on real rows |
| above-floor control | ❌ **cannot be constructed**: every creative project's minimum identity is 0–50, so no project has ever cleared 85 |

Two things follow, and neither is a pass:

1. **`viewersPick` needs its own investigation before quarantine can be called live.** It filters `starRatingCount >= 3` yet returned 14 items including a 0-star video, which suggests that filter is not taking effect — so the query may not be applying its where clause as written. Quarantine cannot be trusted on a surface whose other filters are already inert.
2. **No creative work has ever passed the identity floor.** The above-floor control is not deferrable by choice; it does not exist. That is the strongest evidence yet that the 89% below-floor figure is a property of the library, not of the gate.

## Quarantine certified on three surfaces (2026-11-02)

Deploy `a297b75` confirmed (`DEPLOY=success`, VPS `HEAD=a297b75`, health 200). Assertions run against the live tRPC
endpoints, not the source:

| # | assertion | observed |
|---|---|---|
| 1 | below-floor video absent from forYou / trending / viewersPick | ✅ absent from **all three** (13 items each) |
| 2 | below-floor video reachable by direct link | ✅ `/v/cmvzdewzf…` → **200** |
| 3 | unsourced historical video appears in all three feeds | ✅ present in **forYou, trending and viewersPick** |
| 4 | 0-star video absent from viewersPick | ❌ **mis-specified** — see below |

**Assertion 3 is the NULL-branch proof on every surface**: a bare `notIn` would have removed that video from all three
feeds. It appears in all three.

**Assertion 4 was wrong as written, not failed.** `viewersPick`'s fallback exists to *avoid an empty feed* and is
explicitly allowed to relax `starRatingCount >= 3`. With no video at 3+ ratings, the fallback runs on **every** request,
so unrated rows there are the intended behaviour. The bug fixed in #279 was the **loss of the moderation, withdrawal and
quarantine clauses**, not the presence of unrated videos. Asking for 0-star exclusion would have re-introduced the
empty-feed problem the fallback exists to solve.

### Two bugs, two provenances

1. **Quarantine unverified on `viewersPick`** — this phase's gap. Found, fixed (#279), proven here.
2. **`viewersPick` never applied its star filter, and its fallback dropped `withdrawnAt: null`** — a **pre-existing
   defect found on 2026-11-02** because a feed's output was finally read instead of trusted. It is **not** a regression
   from the quarantine work and must not be credited to it. Withdrawn videos could have appeared in a feed before this
   fix, which is the more serious of the two.

## Why no creative output has ever cleared the identity floor (read 2026-11-02)

The 99 flags and the 0–50 minimums are not a calibration problem. **The creative pipeline never conditions on a
reference image, and its still model cannot accept one.**

Read side by side against the story pipeline, which scores 90 with positional binding:

| question | story pipeline | creative pipeline |
|---|---|---|
| stills model | `fal-ai/flux-2/edit` — **reference-conditioned** (`falFlux2Edit.ts:17`) | `fal-ai/flux-2` — **text-to-image only** (`falFlux2.ts:19`) |
| reference images passed | yes: `imageUrls` (max 4) from approved refs (`falFlux2Edit.ts:22,39`) | **no** — `FalFlux2Input` has only `prompt`, `aspectRatio`, `seed` (`falFlux2.ts:22-26`) |
| identity in prompt | positional binding + `lockedIdentityBlock` (`lib/story/characterIdentity.ts:73`, `routers/story.ts:1604-1624`) | nothing identity-specific is composed for generation |
| reference resolution | `characterReferencesFromScene()` at four call sites (`routers/story.ts:1604`) | no equivalent; `director/resolver.ts:28` builds `EntityReference`s for the **critic**, not for generation |
| provider capability note | — | the media contract states it plainly for this endpoint: *"Text-to-image only (no image_url/image_urls on this endpoint)"* (`mediaProviders/fal/contracts.ts:66`) |

**Outcome: case 1 — the creative pipeline does not use references at all.** The identity floor is unreachable **by
construction**: a text-only still cannot hold a character across scenes, and the critic is correctly reporting that.
The floor stays at 85; lowering it would only stop the measurement from telling the truth.

**What follows** is a build, not a calibration tweak: route creative stills through the reference-conditioned endpoint
and compose the identity block the story path already uses. Scope, in order:

1. `generationAdapter.generateStill` gains reference URLs and calls `submitFalFlux2Edit` (or the same
   `image_urls` path) instead of `submitFalFlux2`.
2. The creative bible's character entries (`adapter.ts:29` reads `StoryCharacterMemory.visualDescription`) are
   compiled into a `lockedIdentityBlock`-equivalent and a positional binding, mirroring `characterIdentity.ts`.
3. Reference resolution at production time: the plan's `characters` per scene resolved to approved reference assets —
   the creative path has no `characterReferencesFromScene` equivalent and needs one.
4. Then one measured re-production: the same lighthouse idea, expecting a materially higher minimum identity. Until
   that number exists, "the wiring works" is an assumption.

**Cost and risk:** one build, no credits to develop it; the measurement run is the usual ~640 (or a single-scene
probe at ~80). **The 97-asset backlog should wait for this** — re-rendering it under text-only stills would reproduce
the same 0–50 scores at full price.

## Why the creative bible has no characters (read 2026-11-02)

Answered by reading, and by one **free** interpretation — no production, no credits.

**The interpretation, verbatim:**

```json
{"projectType":"STORY","explicit":{"durationSeconds":30},
 "summary":"I understand this as a story targeting 30s . Goal: tell a story. I'll preserve your original words: \"A 30-second animated short about a lighthouse keeper and a lost bird.\""}
```

and the derived domain knowledge:

```
characters=[]
```

### Cause: never-extracted, not extracted-then-dropped

Two independent gaps, both upstream of the conditioning code:

1. **`domainKnowledgeFor()` hardcodes `characters: []` for `STORY`** (`lib/creative/intelligence/service.ts:51`). Every story project therefore starts with an empty cast, by construction.
2. **The interpreter does not populate `explicit.subject`** for this text — `explicit` came back with only `durationSeconds`. The knowledge derivation builds its text from `summary + explicit.subject`, so even a text-driven extraction would have nothing structured to work from.

`seedBibleFromInterpretation()` itself is correct: it persists `bible.characters` faithfully (`bible/service.ts:49`). It is being handed `[]`.

### Across the library

**78 creative bibles, 4 with characters (4 characters total).** Extraction has effectively never worked for story projects; the four that exist came from a different path, not from this one.

### A finding worth carrying out of the same read

The intent engine **did** capture `explicit.durationSeconds: 30` — and the stored `productionPlan.totalRuntimeSeconds` is `null` on every project. So the stated duration is captured at intent and **lost between intent and plan**, which locates the planner-persistence gap precisely (still deferred; it is a product decision about what a stated duration means).

## Cast stage: decided 2026-11-02 (operator)

**Generate references at cast time.** After the bible, the creative chain gains a cast stage: compose a reference prompt per character, generate one reference image, require approval, then produce. This is the story pipeline's model, and it keeps approval as the human decision point — consistent with the Phase 1 finding that approval is where the human decision belongs.

Rejected: *reuse existing references only* (a fresh idea with new characters would still condition on nothing — the lighthouse case exactly) and *lazy generation on first use* (fewer gates, but it makes the first render slower and less predictable, and moves the approval question into production).

### Scoped build that follows

| step | change |
|---|---|
| 1 | `domainKnowledgeFor(STORY)` derives characters from the interpretation instead of returning `[]` — names plus visual descriptions, bounded (a cast of 1–4) |
| 2 | The interpreter populates `explicit.subject` from the idea text so step 1 has structured input |
| 3 | A `CAS`/cast stage in the creative chain: per character, compose a reference prompt, generate one image, store it as a `CharacterReferenceAsset` (status `READY`, approval gate), owner = the project |
| 4 | Resolution then finds them: `resolveCreativeReferences()` already reads `CharacterReferenceAsset` by character name — no change needed once rows exist |

**Acceptance test:** the production log shows **`references>0`** on at least one scene, and a `FLUX2_EDIT` job exists for the run. Only then is the identity number meaningful; until then it measures text-to-image.

**Cost:** one re-production after the build — **~1,120 credits** at the last run's price.

**The floor stays at 85.** The number is 0 because nothing was conditioned, not because 85 is wrong.

## The cast stage's structural blocker, read 2026-11-02

The story reference path was read in full, and reusing it literally is **not possible** without a bridge. The
ownership chain forbids it:

| model | key | points at |
|---|---|---|
| `StoryCharacterMemory` | `projectId` | **`StoryProject`** (not `CreativeProject`) |
| `CharacterReferenceAsset` | `characterId?` | `StoryCharacterMemory` |
| `CharacterReferenceAsset` | `projectId` | a **plain string, no relation** — so a creative project *can* own a row |

So a creative project can own a `CharacterReferenceAsset` row, but **only with `characterId = null`**, because a
creative project cannot have a `StoryCharacterMemory`. And `resolveCreativeReferences()` matches
`character: { name: { in: names } }` — a relation that is null for such a row, so it would never match.

The literal reuse is therefore blocked by the schema, not by the code.

### The bridge, scoped

1. **Additive column:** `CharacterReferenceAsset.characterName String?`, written by both paths (the story path sets it
   from `character.name`; the cast stage sets it from the derived cast).
2. **Resolver:** match `OR: [{ character: { name: { in: names } } }, { characterName: { in: names } }]` — one query,
   covers both owners.
3. **Cast stage:** for each derived character, compose the reference prompt from `visualDescription`, generate via the
   shared provider path, store `CharacterReferenceAsset` with `projectId = creativeProject.id`, `characterName`, status
   `READY`; skip any character that already has a `READY` reference for that name.
4. **Approval gate:** production blocks until every cast character has an approved reference. Chosen over fail-open
   because a production that silently conditions on nothing is precisely the failure this chain has been chasing for
   four sessions; the story pipeline already requires approval before conditioning.

**Acceptance is unchanged:** `references>0` in the production log **and** a `FLUX2_EDIT` job for the run.

### What was NOT done this session

The bridge, the cast stage and the re-production were **not built**. Both acceptance conditions remain **unmet**, and
the three "free assertions" could not be written meaningfully: two of them (approval gate blocks production, existing
approved reference is not regenerated) describe behaviour that does not exist yet. Writing tests against absent
behaviour would be the shape of a false pass, so they are scoped rather than faked.

## Three negatives on the input side (measured 2026-11-03)

| lever | change | identity |
|---|---|---|
| description quality | provisional sentence → story-grade description + story prompt shape | **70 → 70** |
| reference count / dilution | already one labelled reference | **70** |
| re-roll (new sample, same inputs) | second generation of the same scene | **70** |

Baseline for the scene was 70. Three independent input-side changes produced the same number. **The distribution is tight at this framing**: a fresh sample is not a lottery ticket, so per-scene enforcement ("re-roll until it passes") has no headroom to exploit here.

### What the within-film spread says

The film's four scenes scored **80 / 70 / 70 / 70**. The 10-point spread on identical framing and identical conditioning is **sample variance**, not a framing difference — which also means a single 80 is not evidence that 80 is reachable on demand.

### Experiment B (framing) was not run, and why

The free version required a close-up/full-body pair from the same film. All four scenes share 9:16 framing and generic descriptions ("Establish the character and their world", "Introduce the obstacle…"), so **no such pair exists** in the data. Producing one would cost another still and, given three 70s in a row, would most likely measure the same 70. It is recorded as *untested*, not as *refuted*.

### Backlog arithmetic, recomputed on the measured distribution

At floor 75 the measured scores are: 1 of 4 scenes at **80** (clears), 3 of 4 at **70** (does not).

- **Best case:** ~25% of 99 clear (≈24), ~75 (≈75) remain flagged.
- **If the 80 is variance** (consistent with three 70s), the clearing share could be **0 of 99**.

Spend is unchanged: **≥ 7,760 credits** for stills alone, before video and fresh cast references. So the honest range is **0–24 of 99 cleared for ≥ 7,760 credits**, and the re-roll evidence pushes toward the low end.

### Credit note (corrected)

These experiments spent **0 platform credits** — `generateStill` is called directly, and credit deduction lives in the production runner, not the adapter. The provider was billed for the images; the platform balance stayed at **5,760**, measured via the project→owner join before and after.