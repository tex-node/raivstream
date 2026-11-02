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