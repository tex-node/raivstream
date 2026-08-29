# Phase 9B.2B — Symmetrical Audio Asset Ownership

**Status:** PASSED. All 3 mandated tests proven live against real Postgres; all 8 real-ffmpeg scenarios re-run clean.

## The four boundaries, symmetrically

| Boundary | Enforcement | Code |
|---|---|---|
| `addCue` | Reject a cross-project `audioAssetId` before write | `assertAudioAssetOwnership` |
| `updateCue` | Same check, only when attaching/replacing an asset (see three-way handling below) | `assertAudioAssetOwnership` |
| Audio Blueprint builder | Defensive skip — a cue's `audioAssetId` only survives into the blueprint if the caller's project-scoped map resolved it | `buildAudioBlueprint`'s `resolvedAudioAssets` param |
| Render worker | Independent re-verification, explicit `asset.projectId !== job.projectId` check, never solely trusting the WHERE clause | `movieRenderWorker.ts` audio branch |

Each layer is independently sufficient on its own — the point of having all four is that any one of them being bypassed (a bug, a migration artifact, a future refactor that drops a WHERE clause) still leaves the others standing.

## Canonical snapshot identity: `audioAssetId` + `storageKey`, never a URL

`AudioBlueprintCue` gained a `storageKey: string | null` field, populated at blueprint-build time from a project-scoped `AudioAsset` lookup (`resolveProjectAudioAssets` in `story.ts`) and never independently re-derived by `audioPlanning.ts` itself (that module still does zero I/O). The render worker prefers this pinned value (`cue.storageKey`) over the freshly-fetched asset's current one, falling back only for snapshots created before this field existed. The actual retrievable URL is resolved from that key only at render execution time, via `getPublicUrlForKey()` — never persisted into the blueprint, the render snapshot, or an `AudioPlanVersion` row. No signed URL is ever stored anywhere in this pipeline; R2 URLs in this codebase are permanent CDN URLs by construction (`${R2_PUBLIC_URL}/${key}`), not presigned.

`buildAudioBlueprint`'s new `resolvedAudioAssets` parameter defaults to an empty `Map` — fail closed: no map supplied means no `audioAssetId` ever resolves. All three production call sites (`readOnlyAudioBlueprint` for render snapshots/preflight, `getAudioBlueprint` for the creator preview, `saveAudioVersion` for version snapshots) now build and pass this map via the shared `resolveProjectAudioAssets` helper — there is one resolution path, not three slightly-different ones.

## `updateCue`'s three-way `audioAssetId` handling

```
undefined -> field omitted from input entirely -> leave unchanged
null      -> explicit clear -> write null, no ownership check needed
string    -> attach/replace -> must pass ownership check first
```

Made explicit in code (not just an implicit truthy-check) plus tightened the Zod schema (`z.string().min(1)`) so an empty string can never sneak past the truthy-check as a false "unchanged" or false "clear." `rest` still spreads `input` as-is into the Prisma `update` call, so the actual DB write inherits Prisma's own `undefined = omit` / `null = set NULL` semantics automatically — the added code only owns the "should we validate ownership first" decision.

## Three mandated tests — all proven

**1 & 2 — allowed / denied, live against real Postgres** (`packages/api/scripts/phase9b2b-persistence-checkpoint.ts`, re-run this round):

```json
"allowed": { "succeeded": true, "blueprintResolvedAudioAssetId": "cmtc5j32s...", "blueprintResolvedStorageKey": "story-projects/own-project/audio/own-asset.wav" },
"denied":  { "denied": true, "deniedCode": "NOT_FOUND", "leakedCuesInDb": 0 }
```

The `allowed` case additionally proves the new `storageKey` resolution actually works end-to-end through the real query path (`getAudioBlueprint` after the write), not just that the write itself succeeded. The `denied` case additionally confirms zero rows were left referencing the foreign asset — the rejected write genuinely never persisted anything.

Also unit-tested directly (`packages/api/src/routers/__tests__/audioAssetOwnership.test.ts`): `assertAudioAssetOwnership` (allowed / denied / nonexistent-id) and `resolveProjectAudioAssets` (cross-project id silently excluded from the resolved map; no query at all when no cue has an `audioAssetId`).

**3 — tampered persisted cue, worker refuses** (`packages/api/src/lib/__tests__/movieRenderWorkerAudio.test.ts`, new test): an `AudioBlueprint` is constructed **by hand**, bypassing `buildAudioBlueprint`'s own defensive resolution entirely — exactly simulating a bad reference that reached a snapshot by some path other than the normal write-time API. One cue's `audioAssetId` points at a real `AudioAsset` row that genuinely belongs to a different project. The worker's own `audioAsset.findMany` query is scoped by `projectId` and the code additionally re-checks `asset.projectId !== job.projectId` explicitly (defense-in-depth, not solely trusting the WHERE clause). Result: the render still completes `READY` using a second, legitimate cue on the same track, while the foreign asset's URL is **never fetched at all** (verified by tracking every URL `fetch` was called with).

## A regression this round's own checkpoint caught in itself

Re-running the 8-scenario real-ffmpeg checkpoint after adding the worker's `asset.projectId !== job.projectId` check initially came back `ok: true` — but with `hasAudio: false` on every non-silent scenario. The checkpoint's fixture `AudioAsset` mocks didn't carry a `projectId` field, so the new check (correctly) rejected every cue as unverifiable, silently degrading every scenario to a silent render — and the checkpoint's own pass/fail logic only checked video-duration delta, never `hasAudio`, so it reported `ok: true` on a checkpoint that had gone silently blind to the very thing it exists to prove.

Fixed two things, not one: the fixtures (`runScenario` now stamps every mock asset with the job's own `projectId`, matching a real scoped row) and the checkpoint's own rigor (`expectHasAudio` is now a required, explicitly-asserted parameter on every scenario — a mismatch throws immediately, and `expectHasAudio: true` scenarios additionally require the independently-reprobed final output to actually contain an audio stream). Re-run clean:

| Scenario | hasAudio | Audio codec | Sample rate | Channels | Video Δ |
|---|---|---|---|---|---|
| silent movie | false | — | — | — | 0s |
| speech only | true | aac | 44100 | 2 | 0s |
| ambience + SFX | true | aac | 44100 | 2 | 0s |
| music + speech ducking | true | aac | 44100 | 2 | 0s |
| overlapping cues | true | aac | 44100 | 2 | 0s |
| fade in/out | true | aac | 44100 | 2 | 0s |
| late-starting cue | true | aac | 44100 | 2 | 0s |
| early-ending cue | true | aac | 44100 | 2 | 0s |

Full output: `docs/operations/phase-9b2-pure-rendering-checkpoint-results.json` (re-saved this round).

## Test suite

**103/103 tests passing, 15 files** (up from 97/14 — +6: 5 in the new `audioAssetOwnership.test.ts`, 1 new tampered-cue worker test).
