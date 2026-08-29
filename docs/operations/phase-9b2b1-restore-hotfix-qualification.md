# PHASE 9B.2B.1 RESTORE HOTFIX QUALIFICATION

## Final verdict

**PHASE 9B.2B.1 RESTORE HOTFIX — QUALIFIED FOR PRODUCTION RETRY**

---

## Root cause

- **Exact failing Prisma write**: `tx.audioCue.create({ data: { ...cueRest } })` inside `restoreAudioVersion`'s reconstruction transaction (`packages/api/src/routers/story.ts`, pre-fix).
- **Relation field that leaked**: `audioAsset` — `6bfb6a4` added `include: { audioAsset: { select: {...} } }` to `audioPlanInclude` (for the Audio tab's `<audio>` preview player). `saveAudioVersion` stores `snapshot: plan.tracks` verbatim, so every snapshotted cue thereafter carries a nested `audioAsset` object (or `null`). The old restore code destructured off only `id, trackId, createdAt, updatedAt` before spreading the rest into `create()` — `audioAsset` was never in that exclusion list, so Prisma rejected it: `Unknown argument \`audioAsset\`. Did you mean \`audioAssetId\`?`. Deterministic for any plan with ≥1 track.
- **Why staging qualification previously missed it**: the persistence-checkpoint and workspace-acceptance scripts that exercise save→restore were last run against `dfb09c9`, *before* `6bfb6a4` added the `audioAsset` include. The subsequent browser QA pass on `6bfb6a4` tested the new sliders/audio-player controls but never clicked Save Version → Restore. No test in the suite exercised save-then-restore against the post-`6bfb6a4` read shape until this hotfix's reproduction test and the production Section 12 smoke test that actually caught it live.

## Implementation

**Files changed:**
- `packages/api/src/routers/story.ts` (105 insertions, 26 deletions) — the only implementation change.
- `packages/api/src/routers/__tests__/audioVersionRestore.test.ts` (new) — regression suite.
- `packages/api/scripts/phase9b2b1-restore-acceptance.ts` (new) — staging acceptance script, reusable for future regression checks of this exact path.

**Write mapper / sanitization approach**: explicit whitelist, not spread-then-delete, per the brief's exact guidance. Two new exported pure functions:
- `toAudioTrackRestoreCreateInput(snapshotTrack, planId)` — emits only `planId, type, name, enabled, volume, order`.
- `toAudioCueRestoreCreateInput(snapshotCue)` — emits only the 18 real `AudioCue` scalar/FK columns (`sequenceSceneId, characterMemoryId, voiceProfileId, audioAssetId, enabled, order, startTimeSeconds, durationSeconds, trimStartSeconds, trimEndSeconds, volume, fadeInSeconds, fadeOutSeconds, text, performancePreset, performanceDirection, duckingEnabled, duckingAmountDb, metadata`).

Both are named-field constructors, not object spreads — no relation this read shape gains in the future (`voiceProfile`, `characterMemory`, `sequenceScene`, …) can leak into a restore write again just because it got added to an `include` somewhere. The reconstruction transaction itself was also extracted into a standalone exported function, `restoreAudioVersionForPlan(ctx, input)`, so it's directly testable against a mock Prisma client (matching the existing `assertAudioAssetOwnership` test convention) rather than only reachable through the tRPC mutation — the router's `restoreAudioVersion` is now a thin wrapper that calls it and then tracks analytics.

**Track reconstruction**: reviewed for the same class of problem (brief §3) — it had it too (the same unfiltered spread), now fixed by the same whitelist mapper.

**Audio asset ownership during restore** (brief §6): added defense-in-depth — every distinct `audioAssetId` referenced anywhere in the snapshot is re-validated with the same `assertAudioAssetOwnership` check `addCue`/`updateCue` use at write time, *before* any deletion/recreation begins. In practice a snapshot's `audioAssetId` values were already validated when first written onto a cue, so this doesn't change legitimate behavior — but it closes the theoretical gap and is directly tested (test I below).

**Confirmation no renderer/runtime changes**: `git diff --stat` shows exactly one file touched — `story.ts`. `audioMixing.ts`, `movieRenderWorker.ts`, `movieRenderPlanning.ts`, and `audioPlanning.ts` (snapshot/hash/render-identity code) are byte-for-byte unchanged (confirmed via `git diff` returning no output for each). Per the brief's own rule, the 8 real-FFmpeg fixture scenarios were **not** re-run — renderer code is unchanged, so re-running them would be ceremony, not signal.

## Tests

- **Reproduction test, run before crediting the fix**: the *exact* pre-fix reconstruction logic (verbatim copy of the old spread-based loop) was run standalone against a strict mock Prisma client that validates `create()` arguments the same way the real Prisma client does. It threw `Unknown argument \`audioAsset\`` — genuine reproduction, not an assumed one. (This check lived in a throwaway script, deleted after confirming; the permanent regression suite tests the *fixed* code, since the old code no longer exists to import once the fix's own refactor lands.)
- **Targeted restore test suite** (`audioVersionRestore.test.ts`): **13/13 passing** — covers all 10 required cases (A–J) plus a NOT_FOUND case and 2 direct mapper-whitelist unit tests:
  - A: track with zero cues restores cleanly
  - B: unmaterialized speech cue (no `audioAssetId`) restores cleanly
  - C: materialized cue restores with `audioAssetId` preserved
  - D: **the reproduction test** — proves the relation-expanded `audioAsset` object never reaches a Prisma `create()` call
  - E: `voiceProfile`/`characterMemory` relation objects (hypothetical future includes) don't leak either — the whitelist protects the whole class, not just today's one field
  - F: restore reproduces exactly the saved creative values, not the mutated live ones
  - G: restore doesn't perturb monotonic version numbering (verified via the same exported `nextAudioVersionFromExisting` `saveAudioVersion` already relies on)
  - H: restored state is readable back afterward
  - I: a snapshotted cue referencing another project's audio asset is rejected, and nothing is applied (pre-existing data proven untouched)
  - J: restore never reads or writes `MovieRenderJob` at all — an existing immutable render snapshot is structurally unreachable from this code path
- **Full API test suite**: **131/131 passing**, 16/16 files (baseline 118 + 13 new; zero regressions elsewhere).
- **API typecheck**: clean, 0 errors.
- **Web typecheck**: clean, 0 errors.

## Restore acceptance (staging, real deployed process)

Ran `phase9b2b1-restore-acceptance.ts` against the actually-deployed staging process (not a mock), on a disposable throwaway sequence:

| Step | Result |
|---|---|
| v1 saved state | `startTimeSeconds: 0, volume: 0.8`, cue attached to a real same-project `AudioAsset` |
| Live mutation | `startTimeSeconds: 5, volume: 0.15` |
| Restore v1 | **no exception** (`threw: false`) |
| Restored state | `startTimeSeconds: 0, volume: 0.8` — exactly the saved values, not the mutated ones |
| Audio asset preservation | `audioAssetId` preserved exactly |
| Relation leak result | proven absent — restore succeeded, meaning no `Unknown argument` ever fired |
| Version monotonic result | save after restore → `versionNumber: 2` (not reused/regressed) |
| Simplest production failure shape (track, no cue, save→restore) | **passes** — the minimal reproduction of the original production break now succeeds |

Additionally re-ran the full `phase9b2b-audio-workspace-acceptance.ts` walkthrough against the **shared, complex, multi-relation QA fixture** (not just isolated test data) — its own `save_version_and_restore` check now reports `restoredToSavedValue: true` for the first time since `6bfb6a4` was deployed.

## Security / provenance

- Ownership result: cue with a same-project asset restores correctly, `audioAssetId` preserved (test C, staging acceptance).
- Cross-project rejection result: a snapshotted cue referencing another project's asset is rejected with `NOT_FOUND` *before* any deletion/recreation — the plan's pre-existing tracks are left completely untouched (test I).
- The worker's own independent 4 typed checks (`AUDIO_ASSET_NOT_FOUND`, `AUDIO_ASSET_PROJECT_MISMATCH`, `AUDIO_ASSET_STORAGE_KEY_MISSING`, `AUDIO_ASSET_STORAGE_KEY_MISMATCH`) are untouched — `movieRenderWorker.ts` was not modified.

## Regression (staging)

- Film preflight: all three states (ready/warnings-present/silent) confirmed correct, unchanged.
- R16: server-side `FORBIDDEN` confirmed, unchanged.
- Silent Movie Builder: fresh no-audio-plan render reached `READY`, charged exactly 100 credits, `hasAudio: false` — unaffected.
- Pricing: `story:movie_render = 100 credits, active` on staging; zero `story:speech_generation`/`story:audio_generation` rates — unchanged, not touched by this hotfix.
- Snapshot behavior: not re-qualified via the full real-ffmpeg A/B harness (correctly — no snapshot/render-identity code changed; re-running it would be ceremony per the brief's own rule). Structural proof instead: test J proves `restoreAudioVersionForPlan` never touches `MovieRenderJob` at all, and the code diff proves zero changes to any snapshot/hash-producing file.

## Staging

- DB identity: `raivstream_phase9b2_pg` (127.0.0.1:55484) — confirmed via the staging safety gate before every step, never production.
- Deployed hotfix: synced directly (uncommitted at deploy time, per the brief's instruction to commit only after staging qualification passes) — `packages/api/src/routers/story.ts` and the new test file.
- Process health: `raivstream-phase9b2-audio-staging` restarted cleanly, online, 0 unstable restarts.
- Migration result: **no new migration** — confirmed via `prisma migrate status` before and after (13/13, "Database schema is up to date!" both times), matching the expectation that a pure application-code fix needs none.
- Production (`raivstream-web`) confirmed untouched throughout — restart count and uptime unaffected by any step of this hotfix.

## Release audit

**SHIP** (this commit):
- `packages/api/src/routers/story.ts` — the fix
- `packages/api/src/routers/__tests__/audioVersionRestore.test.ts` — regression tests
- `packages/api/scripts/phase9b2b1-restore-acceptance.ts` — reusable staging acceptance script for this exact path
- `docs/operations/phase-9b2b-production-release-attempt-1.md` — the prior report this hotfix directly resolves (kept for causal context)
- `docs/operations/phase-9b2b1-restore-hotfix-qualification.md` — this report

**EXCLUDE** (left untracked/local, unrelated to this surgical patch):
- `packages/database/migrations/migration_lock.toml` — standing rule, unchanged
- `packages/api/scripts/phase9b2b-diagnostic-demo-broken-fixture.ts` — explicitly disposable (already flagged in an earlier round)
- `packages/api/scripts/rc-set-qa-password.ts` — one-off browser-QA utility, unrelated to this fix
- `packages/api/scripts/prod-release-audio-api-smoke.ts`, `packages/api/scripts/prod-release-baseline-counts.ts` — tooling from the first (rolled-back) production attempt; reusable for attempt #2, but that's a separate decision from this surgical hotfix commit
- `packages/api/scripts/phase9b2b-rc-silent-regression-check.ts` — already an open "not yet committed" item from an earlier round, unrelated to this fix specifically
- `docs/operations/phase-9b2b-audio-preview-controls-qa.md`, `docs/operations/phase-9b2b-staging-release-candidate.md` — earlier-round reports, unrelated to this hotfix

`migration_lock.toml` confirmed excluded. No unrelated changes in the SHIP scope — `git diff --stat` shows exactly one modified file (`story.ts`) plus the new test/script/doc files listed above.
