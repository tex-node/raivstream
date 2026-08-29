# Phase 9B.2B — Strict, Typed Worker Asset Resolution

**Status:** PASSED. 115/115 tests, both live checkpoints re-run clean on real Postgres + real ffmpeg.

## The rule, made concrete

```
valid same-project audio asset
  -> resolve storageKey -> download/normalize/render

speech intent with no materialized audio asset
  -> handled by preflight/product semantics (never reaches this code at all)

persisted cue or snapshot referencing foreign/mismatched asset
  -> hard failure -> job FAILED -> never READY
```

This is a deliberate escalation from the prior round. Previously a materialized cue that failed to resolve was silently dropped (the render still completed, just without that cue's audio). Now: once a cue claims an `audioAssetId`, every step of resolving it either succeeds cleanly or the **whole render fails** with a typed code. Nothing is silently skipped anymore for a cue that claims real audio — only a cue that never claimed one (no `audioAssetId` at all) is exempt, and that's handled entirely upstream, before this code ever runs.

## The exact 10-step sequence, per cue, in `movieRenderWorker.ts`

```
1.  require audioAssetId               (cuesWithSource's own pre-filter — cues with none never reach here)
2.  load asset from DB                 (per-cue findUnique, always fresh — never trusts the blueprint alone)
3.  require asset exists               -> AUDIO_ASSET_NOT_FOUND
4.  require asset.projectId matches    -> AUDIO_ASSET_PROJECT_MISMATCH   (checked BEFORE any fetch/download)
5.  require asset.storageKey exists    -> AUDIO_ASSET_STORAGE_KEY_MISSING
6.  resolve runtime URL from storageKey (DB-trusted key only — see snapshot boundary below)
7.  download
8.  probe (raw, before normalize)      -> AUDIO_ASSET_PROBE_FAILED
9.  normalize
10. mix                                (once, outside the loop, over every resolved source)
```

Step 4 runs strictly before step 6/7 — a cross-project reference can never become a storage access side channel; nothing about the foreign asset is ever fetched, probed, or touched beyond reading its `projectId` off the DB row.

Four typed error codes, prefix-matched by `failJob` (refactored from a nested ternary chain into an ordered array of known prefixes, more specific ones checked first):

```
AUDIO_ASSET_NOT_FOUND
AUDIO_ASSET_PROJECT_MISMATCH
AUDIO_ASSET_STORAGE_KEY_MISSING
AUDIO_ASSET_PROBE_FAILED
```

## The snapshot boundary — DB always wins

The render snapshot's own `cue.storageKey` (pinned at blueprint-build time, added two rounds ago) is **never consulted for actual resolution anymore**. Step 6 always uses the freshly-fetched, DB-trusted `asset.storageKey` — a tampered or stale snapshot value is silently replaced by the trusted one, never followed. This is a reversal from the prior round's "prefer the pinned snapshot key" design, made deliberately: the snapshot's `storageKey` field remains valuable as *provenance metadata* (what did we intend to use when this render was created), but it is no longer the *source of truth* for what actually gets fetched — that's exclusively the live DB row, re-verified on every render. A malicious or corrupted snapshot can point `cue.storageKey` at anything; it can never redirect an actual fetch.

`getPublicUrlForKey(asset.storageKey)` falls back to `asset.publicUrl` only when no R2-derived URL is available (e.g. local/test fixtures) — that fallback is still a DB-trusted field, never client- or snapshot-supplied.

## Defense-in-depth test matrix — all present

| Case | Expectation | Test |
|---|---|---|
| Same-project asset + correct key | Render continues | Existing happy-path test, updated with a real `storageKey` |
| Asset missing | `FAILED` / `AUDIO_ASSET_NOT_FOUND` | New |
| Foreign-project asset | `FAILED` / `AUDIO_ASSET_PROJECT_MISMATCH`, zero fetches for either cue on the track | Rewritten — tampered cue now ordered first in the fixture to prove nothing is fetched at all before the throw |
| Same asset ID + tampered snapshot `storageKey` | DB-trusted key always used; the tampered value is never fetched | New — asserts the fetched URL contains the trusted key's path fragment and not the tampered one |
| Asset row with missing `storageKey` | `FAILED` / `AUDIO_ASSET_STORAGE_KEY_MISSING` | New |
| (bonus) Downloaded bytes fail to probe as audio | `FAILED` / `AUDIO_ASSET_PROBE_FAILED`, normalize never runs | New |

All in `packages/api/src/lib/__tests__/movieRenderWorkerAudio.test.ts` (6→9 tests this round). The mock's `audioAsset.findMany` was replaced with `findUnique` throughout, matching the real per-cue lookup exactly (the batched, scoped-then-unscoped `findMany` pair from the prior round is gone — this round's design never needed it).

## Checkpoint fixture changes required

Both the real-ffmpeg checkpoint (`scripts/phase9b2-audio-render-checkpoint.ts`) and the unit tests needed every fixture `AudioAsset` to carry a `storageKey` now (previously optional/null) — auto-stamped centrally in `runScenario` (`story-projects/${projectId}/audio/${assetId}.wav`) rather than at each of the 8 call sites. The checkpoint script also now explicitly deletes `process.env.R2_PUBLIC_URL` at the top: it synthesizes local audio and feeds it in as `data:` URIs via `publicUrl`, never uploads to real R2, so `getPublicUrlForKey` must return null for these synthetic keys to correctly fall through to the `publicUrl` fallback — otherwise, on a host where R2 IS configured (staging/prod, where this checkpoint actually runs), the worker would construct a real-looking but nonexistent R2 URL and the download would 404.

## Live re-verification, both checkpoints

- **8-scenario real-ffmpeg checkpoint**: 8/8, `hasAudio: true` on every non-silent scenario, `0s` delta, real aac/44100/2ch data — resolved this time via the new storageKey-based path with the `R2_PUBLIC_URL`-unset fallback, not the old direct-publicUrl path. (`docs/operations/phase-9b2-pure-rendering-checkpoint-results.json`, re-saved.)
- **Persistence checkpoint**: idempotency/snapshot, version numbering, and both ownership cases unchanged and still clean — this round's worker rewrite doesn't touch story.ts's persistence/idempotency layer at all. Zero leftover rows after cleanup.

## Test suite

**115/115 tests passing, 15 files** (up from 112 — `movieRenderWorkerAudio.test.ts` went 6→9).
