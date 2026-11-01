# Phase 2 piece (2) — take mutation: implementation plan

**State when written (2026-11-01):** `09b024e`, clean, 2,099 tests green, health 200.
Schema ready (`takeNumber`, `parentTakeId`, `idempotencyKey`, backfilled 2,715 assets /
1,901 with parent / max take 19). Composition hash is order-sensitive. Flag
`StoryProject.takeAwareExportEnabled` exists, default false, **0 of 166 projects**.
Baseline measured: any asset change → new hash, new row, full re-render (**10,973 ms**).

## The read that shrank the job

Regeneration **already creates a new row**: `regenerateSceneVideo` is a one-line wrapper
around `generateSceneVideoAsset(ctx, { ...input, isRegeneration: true })`, and
`isRegeneration` only drives analytics. The row is created at `story.ts:3445` with a fresh
`asset.id` before submission.

So there is no create-vs-update behaviour change. The work is insert-time numbering plus
two guards.

## The mutation

At the `storySceneAsset.create` in `generateSceneVideoAsset` (`story.ts:3445`), inside one
transaction with the `isLatest` flip:

1. **`takeNumber = max+1`, `parentTakeId = previous latest`** — computed in the same
   transaction that demotes the previous take. A stale read produces two take #3s.
2. **Stale revision → typed conflict.** If `expectedTakeNumber` is supplied and the current
   take is higher, throw `CONFLICT` carrying `currentTakeNumber`. Not last-write-wins.
3. **Derived idempotency key when the client omits one:**
   `sha256(sceneId | prompt | expectedTakeNumber | floor(now / 60s))`.
4. **`@@unique([sceneId, takeNumber])` ships with this change, never before it** — it would
   have failed the historical backfill, which is why #226 omitted it.

### Two P2002 sources, two handlers

This is the detail that will be lost if the mutation is written as one `try/catch`:

| Constraint | Meaning | Recovery |
|---|---|---|
| `(sceneId, idempotencyKey)` | duplicate request | **return the existing take** (success), analytics emits `reused`, not `created` |
| `(sceneId, takeNumber)` | another writer got there first | **re-read and retry once** with the next number — not a conflict |

A P2002 on `takeNumber` is not a stale client; it is a lost race. Treating it as a conflict
would fail a request that should have succeeded.

### The bucket decision, documented rather than emergent

A derived key with a 60-second bucket means a retry at **+30 s** returns the existing take,
and a retry at **+90 s** creates a new one. The second behaviour is a decision (a minute
later is a new intent), not an accident. Both must be tested:

- retry at +30 s → existing take, no new row;
- retry at +90 s → new take.

If the +90 s behaviour is wrong for the product, the fix is either a wider bucket or
client-supplied keys only — not leaving it implicit.

## The three-arm A/B

| Arm | Expectation |
|---|---|
| Flag off, regenerate scene 3 | new hash, new row, full re-render (baseline **10,973 ms**) |
| Flag on, regenerate scene 3 | take #2 with `parentTakeId` = take #1, new hash, new row, **N−1 cache hits**, one segment (~5,500 ms) |
| Flag on, same composition re-request | same hash, **existing row reused**, no render, no new row |

**Take-row assertion (the model's reason for existing):** after arm 2, scene 3 has **two
rows** — take 1 (`parentTakeId` null, `isLatest` false) and take 2 (`parentTakeId` = take
1's id, `isLatest` true). One row means the path still overwrites and the take model is
decorative.

Arm 3 is the one that catches a non-deterministic input in the composition hash — a
timestamp, a random id, an unordered set — the same class as a cache key that does not
cover its flag.
