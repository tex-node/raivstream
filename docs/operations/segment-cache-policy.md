# Export segment cache policy

**Status:** cache shipped (#213), A/B passed, retention policy decided 2026-10-31.

## What the cache is

Per-scene segments rendered by the export pipeline, stored at:

```
story-projects/{projectId}/export-segments/{segmentKey}.mp4
segmentKey = sha256(rendererVersion | filters | WxH | segmentIndex | sourceAssetId)
```

Project-scoped deliberately: asset-scoped keys would let two projects share a
segment but would also serve one project's segment into another's assembly, which
is silent contamination the moment the two diverge in any assembly-affecting way.

## Measured behaviour

| Arm | frames | format | audio | cache | segment loop |
|---|---|---|---|---|---|
| cache off | 993 | 33.113991 | 1427 | — | 10,973 ms |
| cache cold (6 misses + writes) | 993 | 33.113991 | 1427 | `hit=0 miss=6` | 14,861 ms |
| cache warm, scene 3 asset changed | 993 | 33.113991 | 1427 | `hit=5 miss=1` | **5,515 ms** |
| reference, same assets, cache off | 993 | 33.113991 | 1427 | — | 10,973 ms |

Assembled output is **byte-identical** between the warm-cache run and the
cache-off reference (`md5 725c1b2848469ed1dabfe04096c9e06e`, same byte length), so
a hit returns exactly what a render would have produced.

Cold cost is ~1 s per R2 upload; warm saves ~50%. The value is iterative work —
change a scene, re-export, repeat — which is the Phase 2 use case.

## Retention: 30 days

Objects older than **30 days** are deleted by a sweep (`selectExpiredSegmentKeys`
implements the predicate; `EXPORT_SEGMENT_TTL_DAYS = 30`).

Why a TTL rather than a per-project cap: it is a listing plus a delete, it bounds
growth without tracking per-project usage, and the cost of an expired entry is one
cold segment — a performance regression, never a correctness one. A per-project
LRU cap would be more storage-efficient and considerably more machinery; the
precedent (share retention) is TTL-based for the same reason.

An object with no `lastModified` is **kept**: unknown age is not evidence of
staleness, and deleting on unknown would be the fail-open version of this policy.

## Invalidation

Nothing else deletes segments. The key covers renderer version, filter chain,
dimensions, segment index and source asset, so:

- a new scene asset misses exactly that scene's segment;
- a renderer or filter change misses every segment (correct: the old ones are
  unusable, and the TTL sweep collects them);
- a project-level flag that changes the rendered prompt is **not** in this key —
  `identityRefsEnabled` is covered by `sourceHash` at the export level, so a flag
  flip produces a new export row and a full render. If a future flag changes
  segment content without changing `sourceHash`, it must be added to
  `buildExportSegmentKey` or the cache will serve pre-flag segments.
