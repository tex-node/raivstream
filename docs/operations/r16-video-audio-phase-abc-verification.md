# R16 Video-with-Audio — Release Verification Record

**Date:** 2026-10-09  
**Prepared by:** Claude Sonnet 4.6 (automated verification)  
**Status:** READY FOR HUMAN RELEASE REVIEW (conditional — staging acceptance pending)  
**Latest verification pass:** 2026-10-11 — real-DB integration **PASS** (4/4), regression **PASS**, parallel integration-timeout **FIXED**; see **§13** (first pass) and **§14** (release-gate closure).

---

## 1. Candidate

| # | Commit | Subject |
|---|--------|---------|
| Base | `8ace7a06ed3ff85f304bd04dab23887a47446c45` | verify(phase6d): verification pass — orphan detection, integration test, acceptance record |
| Phase A | `c188f76421e156e6b8ad53fbf2476221b3d8deda` | feat(r16): Phase A -- per-scene narration script and TTS pipeline |
| Phase C | `4330faaef9e71b32fe9240dce59a163ad0fb4e83` | feat(r16): Phase C -- FFmpeg audio/video assembly |
| Phase B | `9d8ca179d79c84de8712ba0740d1276861d98a56` | feat(r16): Phase B -- fail-closed story background music generation |

**Release HEAD:** `9d8ca179d79c84de8712ba0740d1276861d98a56`  
**Branch:** `main`  
**Parent chain:** `9d8ca17 → 4330faa → c188f76 → 8ace7a0` ✓ (linear, no rebasing)

### Working-tree status at verification time

```
 M .claude/settings.local.json   ← IDE config only; excluded from all commits ✓
 M packages/api/src/routers/story.ts                  ← narration recovery fix (release-relevant, uncommitted)
 M packages/api/src/lib/creative/__tests__/phase6d.integration.test.ts  ← mock-hoist fix (release-relevant, uncommitted)
?? packages/api/src/lib/story/narrationScript.ts      ← narration resolve helper (new, uncommitted)
?? packages/api/src/lib/story/__tests__/narrationScript.test.ts  ← narration regression (new, uncommitted)
 D SESSION.md / ?? session.md    ← session file (case-rename); excluded from release commits
?? (various untracked UI/docs/scripts files — not staged, not released)
```

**The narration recovery fix and its regression test are working-tree changes on top of the three Phase A/B/C commits.** They must be included when the candidate is committed (see §1a).

---

## 1a. Second verification pass — 2026-10-09 (narration recovery fix + regression)

A follow-up pass added the **narration recovery fix** and a focused regression, and re-ran the suite. Status below supersedes the earlier narration limitation in §4.4 and §9(1).

### Narration recovery — FIXED

`generateStoryNarration` previously persisted a generated script **before** the moderation check, so a flagged script was reused on retry and failed forever. The logic is now extracted into a pure helper `resolveNarrationScript` (`packages/api/src/lib/story/narrationScript.ts`) used by the procedure, which orders the steps **generate → moderate → persist**. A moderation-rejected script is never written to `storySceneSeed.narrationScript`, so a subsequent retry generates and moderates a **fresh** script. (Safety: no audio is synthesized for flagged content; the credit/refund path is unchanged.)

**Regression evidence** — `packages/api/src/lib/story/__tests__/narrationScript.test.ts` (3/3 PASS):

| # | Assertion | Result |
|---|-----------|--------|
| 1 | A moderation-rejected script is **not persisted** | PASS |
| 2 | A retry **generates and moderates a fresh script** (the rejected one is never stored) | PASS |
| 3 | An existing approved script is reused without generating/persisting again (idempotent) | PASS |

### Regression suite (this pass)

Command: `pnpm --filter @raivstream/api test` (full `packages/api`)

```
Test Files  84 passed (84)
      Tests  1557 passed | 5 skipped (1562)
   Duration  21.24s
```

TypeScript: `pnpm --filter @raivstream/api type-check` → **EXIT 0**. Zero failures; the 3 new narration tests are included (was 1559 → now 1562).

### Phase 6D integration re-run — BLOCKED BY ENVIRONMENT (NOT a real-DB pass)

The instruction was to run `phase6d.integration.test.ts` against a reachable disposable PostgreSQL. In the verification sandbox this could **not** be done, and the run took its **database-skip path**:

```
🟡 [phase6d integration] Test database not reachable — all tests will be skipped.
 ✓ src/lib/creative/__tests__/phase6d.integration.test.ts (4 tests)
```

Reasons (all environmental, not code):
- Docker Desktop engine is not running and `com.docker.service` cannot be started (requires admin); the sandbox user is not elevated.
- The local PostgreSQL 17 service listens on `:5432` with `scram-sha-256` auth; no credential is available and `pg_hba.conf` is not writable without admin.
- A self-hosted disposable cluster (`initdb`/`pg_ctl` on `:5433`, trust) starts but is **killed by the sandbox** on command exit (detached child processes are terminated), so the server cannot persist for the test run.

**Consequence:** the 4 "passing" `phase6d.integration` tests in this pass are the skip path and **prove nothing about the partial unique index or concurrency**. The previously recorded real-DB result (§3.5: `4 passed — race=19/20 reuse=1/20`) stands only from the earlier environment that had a reachable cluster and must be **re-produced** by an operator with a reachable disposable Postgres (see §10 S12). The narration regression (above) is fully verified and is NOT dependent on a database.


## 2. Files under review

### Phase A (`c188f76`)
| File | Role |
|------|------|
| `packages/database/schema.prisma` | `narrationScript String?` on `StorySceneSeed` |
| `packages/database/migrations/20261009120000_.../migration.sql` | `ADD COLUMN IF NOT EXISTS "narrationScript" TEXT` |
| `packages/api/src/lib/storyIntelligence/types.ts` | `PlanSceneNarrationInput` type + interface method |
| `packages/api/src/lib/storyIntelligence/openAIStoryIntelligenceProvider.ts` | `planSceneNarration` OpenAI implementation |
| `packages/api/src/lib/storyIntelligence/localStoryIntelligenceProvider.ts` | `planSceneNarration` deterministic local implementation |
| `packages/api/src/lib/analytics.ts` | `'story_narration_generated'` event |
| `packages/api/src/routers/story.ts` | `generateStoryNarration` r16Procedure |
| `packages/api/src/lib/creative/__tests__/phase6d.integration.test.ts` | `beforeEach` import fix (1 line) |
| `packages/api/src/lib/storyIntelligence/__tests__/planSceneNarration.test.ts` | 10 unit tests |

### Phase C (`4330faa`)
| File | Role |
|------|------|
| `packages/api/src/lib/creative/output/render.ts` | FFmpeg music mux, `rename` import, `backgroundMusicUrl?` param |
| `packages/api/src/lib/story/storyVideoExportService.ts` | `backgroundMusicUrl` threading + source-hash invalidation |
| `packages/api/src/lib/creative/output/__tests__/render.test.ts` | 7 unit tests |
| `packages/api/src/lib/story/__tests__/storyVideoExport.test.ts` | 5 unit tests |

### Phase B (`9d8ca17`)
| File | Role |
|------|------|
| `packages/database/schema.prisma` | `backgroundMusicUrl String?` on `StoryProject` |
| `packages/database/migrations/20261009130000_.../migration.sql` | `ADD COLUMN IF NOT EXISTS "backgroundMusicUrl" TEXT` |
| `packages/api/src/lib/credits.ts` | `STORY_BACKGROUND_MUSIC_FEATURE_KEY = 'story:background_music'` |
| `packages/api/src/lib/analytics.ts` | `'story_background_music_generated'` event |
| `packages/api/src/routers/story.ts` | `generateStoryMusic` r16Procedure |
| `packages/api/src/lib/creative/__tests__/phase_r16_music.test.ts` | 5 unit tests |

---

## 3. Verification checks

### 3.1 TypeScript

| Package | Command | Result |
|---------|---------|--------|
| `packages/api` | `npx tsc -p tsconfig.json --noEmit` | **EXIT 0 — PASS** |
| `packages/database` | No tsconfig (Prisma-only package) | N/A — Prisma `validate` ran; schema valid |

### 3.2 Linting

| Package | Command | Result |
|---------|---------|--------|
| `packages/api/src` | `npx eslint src --ext .ts --max-warnings 0` | **EXIT 0 — PASS** |

### 3.3 Unit tests — Phase A, B, C (targeted)

Command: `npx vitest run planSceneNarration.test.ts phase_r16_music.test.ts render.test.ts storyVideoExport.test.ts`

| Test file | Tests | Result |
|-----------|-------|--------|
| `planSceneNarration.test.ts` | 10 | **PASS** |
| `phase_r16_music.test.ts` | 5 | **PASS** |
| `render.test.ts` | 7 | **PASS** |
| `storyVideoExport.test.ts` | 5 | **PASS** |
| **Total** | **27** | **PASS** |

### 3.4 Full regression suite

Command: `npx vitest run` (full `packages/api`)

```
Test Files  1 failed | 82 passed (83)
      Tests  2 failed | 1552 passed | 5 skipped (1559)
   Duration  34.71s
```

**Failing file:** `phase6d.integration.test.ts` (2 tests)  
**Cause:** Pre-existing intermittent mock-isolation artifact when vitest runs parallel workers against the disposable PostgreSQL cluster. Demonstrated by running that file in isolation:

```
 ✓ src/lib/creative/__tests__/phase6d.integration.test.ts (4 tests) 5308ms
   race=19/20 reuse=1/20
Tests  4 passed (4)
```

**Assessment:** The 2 failures are NOT regressions introduced by Phase A/B/C. The Phase 6D concurrency guarantees are proven by the 4/4 pass in isolation. Full-suite isolation interference is a pre-existing test infrastructure issue.

**Zero regressions in the 1552-test baseline.** All 27 new Phase A/B/C tests pass.

### 3.5 Phase 6D integration tests (isolation)

Command: `npx vitest run src/lib/creative/__tests__/phase6d.integration.test.ts`

```
Tests  4 passed (4)  — race=19/20 reuse=1/20
```

**Status: PASS**

---

## 4. Phase A verification — R16 narration

### 4.1 R16 / ownership gate
- `generateStoryNarration` is on `r16Procedure` (defined in `trpc.ts:120`):  
  `export const r16Procedure = t.procedure.use(isAuthed).use(requireR16);`  
  `requireR16` throws FORBIDDEN if `ctx.isR16` is not true. **Gate enforced at middleware layer. ✓**
- `ensureProject(ctx, input.projectId)` at entry: loads project by `userId`, throws NOT_FOUND if missing. **Ownership enforced. ✓**
- Scene loaded with `where: { id: input.sceneId, projectId: input.projectId }` — scene must belong to the project. **Scene ownership enforced. ✓**

### 4.2 Educational path isolation
- Procedure explicitly rejects `contentType === 'EDUCATIONAL'` with PRECONDITION_FAILED: `"Use generateEducationalNarration for educational stories."` **Educational path remains on existing validated procedure. ✓**
- `generateEducationalNarration` is unchanged in this commit set.

### 4.3 Narration script content
- Script is derived from `sceneTitle`, `sceneDescription`, `chapterBody`, `genre`, `tone`, `mood` — scene-contextual fields from the approved story.
- `audienceMode` is hardcoded to `'KIDS'` in the provider call — regardless of any client parameter.
- After generation, script is passed through `moderatePrompt()` before any credit deduction or synthesis. **Content moderated before spending. ✓**
- Script is persisted (`narrationScript` field) on first generation; subsequent calls reuse without AI round-trip. **Idempotent. ✓**

### 4.4 Narration recovery — FIXED (was "stuck script on moderation failure")
The script is now generated → moderated → **persisted only after moderation passes** via `resolveNarrationScript` (`packages/api/src/lib/story/narrationScript.ts`). A flagged script is never written to `storySceneSeed.narrationScript`, so a retry generates and moderates a fresh script. Regression: `narrationScript.test.ts` (3/3 PASS). See §1a.

### 4.5 Credit and audio asset path
- Credit deducted under `STORY_SPEECH_GENERATION_FEATURE_KEY` (existing key, not the new B key).
- On synthesis failure: refund issued under same key, error rethrown. **Refund-on-failure present. ✓**
- Audio asset created as `audioAsset` row with `sourceKind: 'GENERATED_SPEECH'`, associated to `projectId` and `userId`. **Asset association correct. ✓**
- `narrationAudioUrl` written to `StorySceneSeed` row. **Audio URL persisted to scene. ✓**

### 4.6 What is proven by mocks vs. staging
| Check | Proven by unit tests | Requires staging |
|-------|---------------------|-----------------|
| R16 gate enforcement | ✓ (trpc middleware unit) | — |
| Educational rejection | ✓ (procedure unit) | — |
| Narration text content quality | Partial (deterministic local provider) | Real OpenAI call |
| ElevenLabs TTS output quality | ✗ (mocked) | Staging with ElevenLabs key |
| R2 upload success | ✗ (mocked) | Staging with R2 configured |
| End-to-end audio playback | ✗ | Staging |

**Phase A assessment: PASS (unit); STAGING REQUIRED for TTS and R2 paths.**

---

## 5. Phase C verification — audio/video assembly

### 5.1 Background music threading
- `storyVideoExportService.ts` selects `backgroundMusicUrl` from `storyProject` with `select: { ..., backgroundMusicUrl: true }`. Value originates from DB row, not from client input. **No client injection possible. ✓**
- Passed to `renderOutputDerivative` as `backgroundMusicUrl` parameter.
- In `renderOutputDerivative`, the parameter is typed `string | null | undefined`; when falsy, no music processing path is taken.

### 5.2 Source-hash invalidation
- `backgroundMusicUrl` is included in the hash payload as a synthetic `{ sceneId: '__music__', assetId: backgroundMusicUrl }` pair when set. **Music change produces different hash → new export row. ✓**
- Test `storyVideoExport.test.ts` case C demonstrates the hash difference directly.

### 5.3 FFmpeg filter correctness
**Narration + music path (amix):**
```
[0:a]afade=t=in:ss=0:d=1[narr];
[1:a]afade=t=in:ss=0:d=1,volume=0.3[bgm];
[narr][bgm]amix=inputs=2:duration=first:dropout_transition=2[amixed]
```
- Music is streamed with `-stream_loop -1` to avoid premature end. ✓
- `duration=first` means total duration is set by the narration (input 0), not music. ✓
- Music is at 30% volume relative to narration (1.0 weight). Intelligibility preserved. ✓
- Fade-out NOT applied to narration path (duration unknown at concat time). Documented limitation.

**Video-only + music path:**
```
[1:a]afade=t=in:ss=0:d=1,afade=t=out:st=${fadeOutStart}:d=1,volume=0.3,atrim=duration=${totalDur}[bgmt]
```
- `effectiveDurationSeconds` from derivation is used for fade-out start and `atrim`. Duration known here. ✓
- Video stream copied (`-c:v copy`), not re-encoded. ✓

### 5.4 Export failure handling
- On `renderOutputDerivative` failure: `storyVideoExportService` catches, updates row to `status: 'FAILED'`, returns the FAILED state. **No false completed status. ✓**
- Temp directory cleaned in `finally` block in `render.ts`. **Temp file cleanup present. ✓**

### 5.5 Existing narration path
- The `hasAudio` path (educational narration mux) is **unchanged in logic**. Phase C only adds the music overlay step after the existing concat — the concat result is renamed (no extra pass) when `backgroundMusicUrl` is null. **Existing educational path not regressed. ✓**

### 5.6 What is proven by mocks vs. staging
| Check | Proven by unit tests | Requires staging |
|-------|---------------------|-----------------|
| FFmpeg invoked with correct filter args | ✓ (7 render tests) | — |
| Source hash invalidation | ✓ (export service tests) | — |
| Real FFmpeg produces valid audio stream | ✗ (stub 8-byte MP4) | Staging with real media |
| Audio/video sync in final file | ✗ | Staging |
| Music intelligibility / mixing quality | ✗ | Staging |
| Clipping / distortion under loud source material | ✗ | Staging |

**Phase C assessment: PASS (unit); STAGING REQUIRED for real media quality.**

---

## 6. Phase B verification — fail-closed music

### 6.1 Procedure isolation
- `generateStoryMusic` is on `r16Procedure`. Separate from `generateCueMusic` (on `protectedProcedure`). **R16 StoryProject path is separate from CreativeVersion path. ✓**

### 6.2 Ownership check
- `storyProject.findFirst({ where: { id: input.projectId, userId: ctx.user.id } })` — ownership enforced. **✓**

### 6.3 Fail-closed behavior (four gates, in order)
| Gate | Condition | Behavior |
|------|-----------|----------|
| Idempotency | `project.backgroundMusicUrl` is set | Returns existing URL, `reused: true`, no charge |
| Feature flag | `!isLyriaMusicEnabled() \|\| !geminiApiKey()` | Returns `{ backgroundMusicUrl: null, reused: false }`, no charge |
| Credit rate | `!rate.configured` (RATE_MISSING or RATE_INVALID) | Returns `{ backgroundMusicUrl: null, reused: false }`, no charge |
| Content moderation | prompt fails moderatePrompt | Throws BAD_REQUEST, no charge |

All four gates return gracefully (or throw, for moderation) **before** any deduction or Lyria call when the environment is unconfigured. **Production is safe: LYRIA_MUSIC_ENABLED not set, credit rates unseeded. ✓**

### 6.4 Credit deduction and refund
- Deducted under new key `STORY_BACKGROUND_MUSIC_FEATURE_KEY = 'story:background_music'`. Distinct from `story:speech_generation` and `story:audio_generation`. **No cross-key charge contamination. ✓**
- On R2/Lyria failure: refund issued under same key, error rethrown. **Refund-on-failure present. ✓**
- Production credit rates: **unseeded, not modified by this commit set. ✓**

### 6.5 Asset association
- `backgroundMusicUrl` written to `storyProject` row, tied to `projectId`. **Music URL associated to correct project. ✓**

### 6.6 What is proven by mocks vs. staging
| Check | Proven by unit tests | Requires staging |
|-------|---------------------|-----------------|
| All four fail-closed gates | ✓ (phase_r16_music.test.ts) | — |
| R16 gate enforcement | ✓ | — |
| Ownership check | ✓ (procedure unit) | — |
| Lyria call with correct prompt | ✗ (mocked) | Staging with Lyria enabled |
| Music audio quality | ✗ | Staging |

**Phase B assessment: PASS (unit); live Lyria path NOT TESTED (fail-closed by design in current production config).**

---

## 7. Database migration verification

| Migration | Timestamp | Table | Change | Safety |
|-----------|-----------|-------|--------|--------|
| `20261009110000_phase6d_music_cue_lock` | (base, previously verified) | `audio_cues` | partial unique index | Previously accepted |
| `20261009120000_phase_a_story_scene_narration_script` | 2026-10-09 12:00 | `story_scene_seeds` | `ADD COLUMN IF NOT EXISTS "narrationScript" TEXT` | ✓ |
| `20261009130000_phase_b_story_project_background_music` | 2026-10-09 13:00 | `story_projects` | `ADD COLUMN IF NOT EXISTS "backgroundMusicUrl" TEXT` | ✓ |

**Ordering:** Phase A migration (120000) precedes Phase B (130000). Both follow Phase 6D migration (110000). Chronologically correct. ✓

**Safety analysis:**
- Both migrations use `ADD COLUMN IF NOT EXISTS` — idempotent and safe to replay. ✓
- Both columns are nullable TEXT — no default required, no lock contention on large tables. ✓
- No data seeding, no credit rate modification, no provider enablement in either migration. ✓
- Existing rows: unaffected (columns will be NULL for all existing rows). ✓
- Rollback: columns can be dropped with `DROP COLUMN` — no foreign key constraints on these fields. Rollback path is clean.
- Neither migration touches Phase 6D tables (`audio_cues`, `audio_tracks`, `credit_balances`). ✓

**Disposable cluster test:** Phase 6D integration test (port 5433) ran against the fully migrated schema (both A and B migrations applied) and passed 4/4. **Migration compatibility with existing data confirmed. ✓**

---

## 8. Safety invariants review

| Invariant | Status |
|-----------|--------|
| R16 gate on `generateStoryNarration` | ✓ ENFORCED — `r16Procedure` + `requireR16` middleware |
| R16 gate on `generateStoryMusic` | ✓ ENFORCED — `r16Procedure` |
| R16 gate on `requestExport` | ✓ ENFORCED — double-checked at router (`r16Procedure`) and service layer |
| Educational path unchanged | ✓ `generateEducationalNarration` untouched; new procedure rejects EDUCATIONAL content |
| KIDS moderation on narration script | ✓ `moderatePrompt()` applied before synthesis; `audienceMode: 'KIDS'` hardcoded |
| KIDS moderation on music prompt | ✓ `moderatePrompt()` applied before Lyria call |
| No external URL injection as media source | ✓ audio/video URLs loaded from DB rows, not client input |
| Credit refund on failure | ✓ Both procedures have try/catch refund paths |
| Live Lyria disabled | ✓ `LYRIA_MUSIC_ENABLED` not set; fail-closed gate returns null before any call |
| Production music credit rates unseeded | ✓ No rate seed in migrations or startup code |
| Phase 6E not started | ✓ Confirmed — no Phase 6E code in any of the three commits |
| `feat/ui-redesign` worktree isolated | ✓ These commits are on `main`; UI-redesign changes remain in their own worktree |

---

## 9. Known limitations and unresolved risks

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | ~~Stuck narration script on moderation failure~~ **FIXED**: script is persisted only after moderation passes (`resolveNarrationScript`); a flagged script is never stored, so retries generate a fresh script. | Was Low | FIXED — regression `narrationScript.test.ts` (3/3) |
| 2 | **Narration + music path: no fade-out on narration audio**. The amix `duration=first` approach doesn't support a predictable fade-out because concatenated duration is unknown until after FFmpeg runs. | Low (cosmetic; no safety impact) | LIMITATION — may be addressed in future audio polish pass |
| 3 | **Full-suite vitest integration test intermittent failures**: 2/4 phase6d tests occasionally fail when run concurrently with 82 other test files (mock isolation in parallel workers). Pass 4/4 in isolation. | Low (pre-existing, non-regression) | BLOCKED — environment issue; tracked separately |
| 4 | **Real media quality not verified**: FFmpeg filter correctness proven with stub MP4 data; actual audio/video quality, speech intelligibility, and sync require staging validation with real R2-hosted media. | Medium (staging gate) | NOT TESTED — operator acceptance required |
| 5 | **Lyria live path not tested**: `generateStoryMusic` live Lyria call is blocked by fail-closed flag in all environments. Cannot be exercised without `LYRIA_MUSIC_ENABLED=true` and a seeded credit rate. | Medium (feature incomplete until music separately authorized) | NOT TESTED — by design |

---

## 10. Staging acceptance checklist

These checks are REQUIRED before deployment authorization. They cannot be completed from code and unit tests alone.

| # | Check | Status |
|---|-------|--------|
| S1 | Generate an **educational R16 story** and export it with narration. Confirm audio present in exported file. | NOT TESTED |
| S2 | Generate a **non-educational R16 story** using `generateStoryNarration`. Confirm audio URL returned, scene `narrationAudioUrl` updated. | NOT TESTED |
| S3 | Export a narration-only video (no background music). Confirm valid video+audio stream in output. | NOT TESTED |
| S4 | Probe final export with `ffprobe` or equivalent: confirm video stream, audio stream, and approximate duration. | NOT TESTED |
| S5 | Confirm music generation returns `{ backgroundMusicUrl: null }` when `LYRIA_MUSIC_ENABLED` is not set (current production default). | NOT TESTED (staging env) |
| S6 | Confirm music generation returns `{ backgroundMusicUrl: null }` when `story:background_music` credit rate is absent from DB. | NOT TESTED |
| S7 | Confirm moderation rejection blocks narration script synthesis (inject test content). | NOT TESTED |
| S8 | Confirm a failed narration synthesis issues a credit refund (simulate R2 failure). | NOT TESTED |
| S9 | (Music separately authorized) Export video with background music. Confirm audio streams blended, speech intelligible. | NOT TESTED — requires music authorization |
| S10 | Confirm R16/KIDS moderation guard rejects request from non-R16 session on `generateStoryNarration`. | NOT TESTED |
| S11 | Confirm educational content type rejected by `generateStoryNarration` with correct error code. | NOT TESTED |
| S12 | Run phase6d integration tests in isolation on staging cluster. Confirm 4/4. | PASS (local disposable cluster) |

**Items S9** is conditional on a separate music authorization. All others are executable on staging with the narration feature enabled.

---

## 11. Deployment restrictions

- **DO NOT PUSH** to remote until human release review is complete.
- **DO NOT DEPLOY** to staging or production without operator staging acceptance (S1–S8, S10–S11 minimum).
- **DO NOT SEED** `story:background_music` credit rates in staging or production.
- **DO NOT SET** `LYRIA_MUSIC_ENABLED=true` in staging or production without separate music authorization.
- **DO NOT BEGIN Phase 6E.**
- Migrations safe to apply to disposable/staging DB — require DBA review before production.

---

## 12. Final assessment

**Release HEAD:** `9d8ca179d79c84de8712ba0740d1276861d98a56`

| Phase | TypeScript | Lint | Unit tests | Integration | Staging |
|-------|-----------|------|------------|------------|---------|
| A — narration | PASS | PASS | 10/10 PASS | N/A | NOT TESTED |
| C — assembly | PASS | PASS | 12/12 PASS | N/A | NOT TESTED |
| B — music | PASS | PASS | 5/5 PASS | N/A | NOT TESTED (fail-closed) |
| Phase 6D base | PASS | PASS | — | 4/4 PASS (isolation, earlier env); re-run BLOCKED here — see §1a | Previously accepted |

**Regression (second pass, §1a):** 1557 passed | 5 skipped | 0 failed (1562). Narration recovery regression `narrationScript.test.ts` 3/3 PASS. Phase 6D real-DB integration re-run **blocked by environment** (DB-skip path — not a real-DB pass; see §1a).

**Safety gates:** All R16, KIDS-mode, credit, refund, moderation, and fail-closed invariants confirmed in code review and unit tests. Live Lyria and production credit rates remain disabled/unseeded.

**Recommendation:** **READY FOR HUMAN RELEASE REVIEW — CONDITIONAL**

Condition: staging acceptance items S1–S8, S10–S11 must be executed and recorded by an authorized operator before deployment authorization is granted. Item S9 (music-enabled export) requires separate music authorization.

---

## 13. Final release verification — 2026-10-11 (this candidate, real disposable PostgreSQL)

Independent verification pass on the exact local candidate. §1–§12 are historical; this section records what was reproduced on **this** working tree. Automated verification; no staging access.

### 13.1 Candidate & environment (recorded actual state)

| Item | Value |
|------|-------|
| Branch | `main` (tracks `origin/main`, **ahead 5**) |
| HEAD | `9d8ca179d79c84de8712ba0740d1276861d98a56` (Phase B) |
| Ancestry | `9d8ca17 → 4330faa → c188f76 → 8ace7a0` all confirmed ancestors of HEAD (linear) |
| Committed A/B/C | `c188f76` (A), `4330faa` (C), `9d8ca17` (B); base `8ace7a0` (6D) |
| Uncommitted — **release-relevant** | `packages/api/src/routers/story.ts` (M), `packages/api/src/lib/creative/__tests__/phase6d.integration.test.ts` (M), `packages/api/src/lib/story/narrationScript.ts` (??), `packages/api/src/lib/story/__tests__/narrationScript.test.ts` (??) |
| Uncommitted — not release | `.claude/settings.local.json` (M), `SESSION.md`↔`session.md` case-rename (D/??), UI/docs/scripts untracked |
| **Candidate under test** | **HEAD + the four release-relevant working-tree files above** |

The uncommitted `phase6d.integration.test.ts` change hoists `isLyriaMusicEnabled`/`lyriaModelId` into the shared `vi.hoisted` mock object so `restoreMocks:true` cannot strip their implementations. The diff **adds** mock wiring and assertion-neutral comments only — no test is skipped or weakened (diff reviewed line-by-line).

### 13.2 Real PostgreSQL integration (Workstream 2) — PASS

- **Server:** disposable PostgreSQL **17.11** cluster (`initdb` + `postgres.exe`, trust auth, port **5433**, isolated under the OS temp dir) — never the VPS.
- **DB:** `raivstream_phase6d_test`; created per the documented Phase 6D procedure (`PHASE-6D-ACCEPTANCE.md` §Check 1): `prisma db push` (**80 public tables**) **then** the real partial-index migration `packages/database/migrations/20261009110000_phase6d_music_cue_lock/migration.sql` applied verbatim.
- **Index verified (`pg_indexes`):** `CREATE UNIQUE INDEX audio_cues_music_track_unique ON public.audio_cues USING btree ("trackId") WHERE ((metadata ->> 'kind'::text) = 'MUSIC_TRACK'::text)`.
- **Command:** `npx vitest run src/lib/creative/__tests__/phase6d.integration.test.ts`
- **Result:** `Test Files 1 passed (1) · Tests 4 passed (4) · EXIT 0` — reproduced twice. `[phase6d] race=19/20 reuse=1/20`.
- **This is a real-DB pass, not the skip path:** the DB was reachable, so `beforeAll` connected and the 4 tests executed (no "Test database not reachable" skip message).

| # | Required evidence | Where proven | Result |
|---|---|---|---|
| 1 | Partial unique index exists with intended predicate | `pg_indexes` query | PASS |
| 2 | Concurrent requests cannot create duplicate music cues | Race test — 20 iterations, `cues.length === 1` | PASS |
| 3 | Losing request handles the uniqueness conflict and refunds | Race test — `conflicted === 1`, `deducts − refunds === 1` | PASS |
| 4 | Sequential retries reuse without a second charge/generation | Idempotency test — `reused === true`, `creditsUsed === 0`, same `assetId`, Lyria not called | PASS |
| 5 | Credit transactions reconcile to exactly one net charge | Race test — `totalNetCharges === 20`, final balance `3000 − 2000` | PASS |
| 6 | Orphaned unmaterialised cue recovery | Orphan test — CONFLICT before deduct → delete → clean retry | PASS |

Iteration counts: all 20/20 iterations produced exactly one cue and one net charge; **19** took the race/conflict path, **1** took the sequential/reuse path (single-process event loop — both prove the invariant).

### 13.3 Release regression (Workstream 3)

| Check | Command | Result |
|-------|---------|--------|
| Type-check | `pnpm --filter @raivstream/api type-check` | **EXIT 0 — PASS** |
| Lint | `pnpm --filter @raivstream/api lint` | **EXIT 0 — PASS** |
| Phase A/B/C + narration (targeted) | `npx vitest run planSceneNarration phase_r16_music render storyVideoExport narrationScript` | **5 files, 30 passed, EXIT 0** |
| Real-DB integration (isolated) | see §13.2 | **4/4 PASS, EXIT 0** |
| Full API suite | `npx vitest run` | **83/84 files · 1553 passed \| 9 skipped · 1 failed suite** |

**The single full-suite failure is NOT a test regression:** the failed *suite* is `phase6d.integration.test.ts`, whose `beforeAll` (connect + `TRUNCATE` of 11 tables) exceeds vitest's 10 s default under 84-file parallel load → `Error: Hook timed out in 10000ms`; its 4 tests are **skipped** (**0 test-level failures**). In isolation the same file passes 4/4 against the live cluster. This is the pre-existing environment/parallelism limitation recorded in §3.4/§9(3), reproduced on this candidate.

**Skipped tests (9):** 5 pre-existing — `homerCreate.test.ts` `it.skip` (real Homer call) ×1 and `gateQ_realAI.test.ts` `it.skipIf(!AI_ENABLED)` ×4 (Gate Q real-AI) — plus the 4 integration tests skipped by the hook timeout above.

**FFmpeg / real-media render — BLOCKED (no binary):** `ffmpeg`/`ffprobe` are not installed here, and `render.ts` spawns `ffmpeg` from PATH. Filter construction, duration alignment, fades, and failure handling are covered by `render.test.ts` (7) and `storyVideoExport.test.ts` (5) via an injected ffmpeg stub, plus code review of `render.ts`; **actual media quality/output cannot be validated without a real FFmpeg + real R2 media → staging (S3/S4/S9).**

**Fail-closed music/credit gates:** verified by `phase_r16_music.test.ts` (5) and code review of `generateStoryMusic` (`packages/api/src/routers/story.ts:7671`): ownership → idempotency → `isLyriaMusicEnabled()/geminiApiKey()` → `resolveFeatureCreditRate` → moderation → deduct, with refund-on-failure. No live Lyria call is reachable (`LYRIA_MUSIC_ENABLED` unset; rate unseeded).

### 13.4 Staging acceptance S1–S11 (Workstream 4)

**No staging access is available to this automated pass.** No S-check was executed against staging and none is fabricated. "Unit-level proof" below is local evidence only; the staging action itself remains NOT TESTED and requires an authorized staging operator with provider credentials.

| # | Check | Staging status | Unit-level proof on this candidate | Needs operator? |
|---|-------|----------------|-------------------------------------|-----------------|
| S1 | Educational R16 story → export with narration audio | NOT TESTED | — | Yes (real TTS/R2) |
| S2 | Non-educational R16 `generateStoryNarration` → URL + `narrationAudioUrl` | NOT TESTED | narration logic (`narrationScript` 3) | Yes |
| S3 | Export narration-only video → valid video+audio | NOT TESTED | `render.test.ts` (7) | Yes |
| S4 | `ffprobe` final export (streams + duration) | BLOCKED (no ffmpeg locally) | — | Yes |
| S5 | Music returns `null` when `LYRIA_MUSIC_ENABLED` unset | NOT TESTED | `phase_r16_music` (flag gate) | Yes |
| S6 | Music returns `null` when rate absent | NOT TESTED | `phase_r16_music` (rate gate) | Yes |
| S7 | Moderation rejection blocks synthesis | NOT TESTED | `narrationScript` (1) + `story.ts` step order | Yes |
| S8 | Failed synthesis → refund | NOT TESTED | `phase_r16_music` refund path | Yes |
| S9 | Music-enabled export blended/intelligible | NOT TESTED — requires music authorization | — | Yes (music auth) |
| S10 | R16/KIDS guard rejects non-R16 session | NOT TESTED | `r16Procedure`/`requireR16` + unit | Yes |
| S11 | Educational type rejected by `generateStoryNarration` | NOT TESTED | procedure unit (PRECONDITION_FAILED) | Yes |
| (S12) | phase6d integration isolated on staging cluster | — | **local disposable cluster: 4/4 PASS (§13.2)** | Optional re-run |

### 13.5 Final audit & recommendation

- **Candidate commit:** `9d8ca17` **plus** the four release-relevant uncommitted working-tree files (§13.1). Nothing staged, committed, pushed, or deployed.
- **Real-DB integration:** PASS (real PostgreSQL 17.11, 4/4).
- **Regression / type-check / lint:** PASS (0 test-level failures; 1 integration *suite* hook-timeout under parallel load, reproduced as pre-existing).
- **Staging S1–S11:** NOT TESTED / BLOCKED (no staging access; S4/S9 additionally gated).
- **Unresolved risks:** (a) the integration test cannot run inside the full parallel suite (hook timeout) — must run in isolation (as done here); (b) real FFmpeg media output unverified locally; (c) live Lyria path fail-closed and untested by design; (d) migrations `20261009120000`/`20261009130000` still require `prisma migrate deploy` on staging/production under DBA review.
- **Recommendation:** **CONDITIONAL — READY FOR HUMAN RELEASE REVIEW.** Code-level verification is green on this candidate and the database-integration gate is now a **real-DB PASS** (previously blocked). Release remains conditional on the authorized staging operator executing S1–S8 and S10–S11 (S9 only under separate music authorization).

---

## 14. Release-gate closure — 2026-10-11 (parallel-timeout fix + re-verification)

Second automated pass. §13 is the prior pass; this section supersedes its full-suite/FFmpeg status and adds the test-harness fix, the migration exercise, and the operator checklist.

### 14.1 Candidate (actual state, re-verified)

| Item | Value |
|---|---|
| Branch / HEAD | `main` / `9d8ca17` (tracks `origin/main`, ahead 5) |
| Ancestry | `9d8ca17 → 4330faa → c188f76 → 8ace7a0` (linear, confirmed) |
| Staged | none |
| Committed A/B/C | `c188f76` (A), `4330faa` (C), `9d8ca17` (B) |
| Uncommitted — release code | `routers/story.ts` (`35754ac…`), `phase6d.integration.test.ts` (`d797e91…`), `lib/story/narrationScript.ts`, `lib/story/__tests__/narrationScript.test.ts` |
| Uncommitted — test infra (this pass) | `packages/api/vitest.config.ts`, `packages/api/vitest.integration.config.ts` (new), `packages/api/package.json` (`test:integration`) |
| Uncommitted — docs | `docs/operations/r16-video-audio-phase-abc-verification.md`, `session.md` |
| Uncommitted — not release | `.claude/settings.local.json`, `SESSION.md`↔`session.md` case-rename, UI/docs/scripts untracked |

### 14.2 Parallel integration-timeout fix (Workstream 2) — RESOLVED

**Reproduced deterministically (2/2):** `npx vitest run` → `phase6d.integration.test.ts` fails at the *suite* level with `Error: Hook timed out in 10000ms`; 1553 passed | 9 skipped; **0 test-level failures**.

**Root cause:** the integration test's `beforeAll` (Prisma `$connect` + 11 `TRUNCATE`s) uses vitest's default 10 s `hookTimeout`; under 84 parallel fork workers the worker's event loop is starved and setup exceeds 10 s. Confirmed **not** lock contention — only this file opens a real DB connection (no other test constructs `PrismaClient`/`$connect`).

**Fix (smallest deterministic — isolation, not a timeout bump):**
- `packages/api/vitest.config.ts`: `exclude: [...defaults, 'src/**/*.integration.test.ts']`.
- `packages/api/vitest.integration.config.ts` (new): includes only `*.integration.test.ts`, `fileParallelism: false`, `hookTimeout/testTimeout: 60000`.
- `packages/api/package.json`: new script `test:integration`.

No assertions removed, no test skipped, no unrelated test disabled.

**Verified after the fix:**
```
pnpm --filter @raivstream/api test              → Test Files 83 passed (83); Tests 1553 passed | 5 skipped (1558); EXIT 0
pnpm --filter @raivstream/api test:integration  → Test Files 1 passed (1);  Tests 4 passed (4);               EXIT 0  [race=19/20 reuse=1/20]
```
The standard unit suite is green; the DB integration is green in its documented, isolated invocation.

### 14.3 PostgreSQL guarantees (Workstream 3) — PASS (real DB)

- **Server:** disposable PostgreSQL **17.11**, `localhost:5433`, trust auth, OS temp dir. DB `raivstream_phase6d_test`; schema via `prisma db push` (80 tables) + the real partial-index migration.
- **Index (`pg_indexes`):** `CREATE UNIQUE INDEX audio_cues_music_track_unique ON public.audio_cues USING btree ("trackId") WHERE ((metadata ->> 'kind'::text) = 'MUSIC_TRACK'::text)`.
- **Command/result:** `pnpm --filter @raivstream/api test:integration` → **4/4 PASS, EXIT 0** (reproduced twice). Real-DB path — no "not reachable" skip.

| # | Guarantee | Test | Result |
|---|---|---|---|
| 1 | Intended partial index + predicate | `pg_indexes` | PASS |
| 2 | No duplicate cue under concurrency | Race (20 iters, `cues.length===1`) | PASS |
| 3 | Losing request → conflict + refund | Race (`conflicted===1`, `deducts−refunds===1`) | PASS |
| 4 | Retry reuses, no second charge/generation | Idempotency | PASS |
| 5 | Exactly one net charge | Race (`totalNetCharges===20`, balance `3000−2000`) | PASS |
| 6 | Orphaned unmaterialised cue recovery | Orphan | PASS |

### 14.4 Media rendering (Workstream 4) — BLOCKED (no FFmpeg)

`ffmpeg`/`ffprobe` are absent: not on PATH, not via `where.exe`, no winget package, no `ffmpeg-static`/`@ffmpeg-installer` in `node_modules`, no common install dir. `render.ts` spawns `ffmpeg` from PATH, so a real render cannot run here. **No software was downloaded or installed** (no authorized isolated environment with FFmpeg was available). **Actual media validation — output container/playability, narration-only output, music mix, duration/sync, fades/levels, render/upload/provider failure handling, temp cleanup, and status transitions — remains NOT TESTED and requires an environment with FFmpeg (operator checklist S3/S4/S9).** Unit-level coverage: `render.test.ts` (7) + `storyVideoExport.test.ts` (5) assert FFmpeg argument construction and failure/cleanup logic via an injected stub; source review of `render.ts` confirms duration alignment, fades, and temp-dir cleanup.

### 14.5 Staging acceptance S1–S11 (Workstream 5) — operator-ready checklist

No staging access in this pass; none executed and none fabricated. **Do not seed rates or enable live music for S5/S6/S9.**

| # | Check | Preconditions | Safe procedure | Expected result | Evidence | Who |
|---|---|---|---|---|---|---|
| S1 | Educational R16 story → export w/ narration | Staging R16 account; TTS+R2 configured; `story:speech_generation` rate | Generate educational story → export | Video+audio; narration audible | Export URL + `ffprobe` | Operator |
| S2 | Non-educational `generateStoryNarration` | Staging R16; OpenAI + ElevenLabs + R2 | Call procedure on a scene | `{ audioUrl }`; scene `narrationAudioUrl` set | tRPC response + DB row | Operator |
| S3 | Narration-only export | From S2 | Export without music | Valid video+audio stream | `ffprobe` output | Operator |
| S4 | Probe final export | From S3 | `ffprobe` the export | Video + audio stream, expected duration | ffprobe JSON | Operator |
| S5 | Music `null` when flag off | `LYRIA_MUSIC_ENABLED` unset | Call `generateStoryMusic` | `{ backgroundMusicUrl: null, reused: false }`, no charge | tRPC response + ledger | Operator |
| S6 | Music `null` when rate absent | No `story:background_music` rate | Call `generateStoryMusic` | `null`, no charge | tRPC response + ledger | Operator |
| S7 | Moderation blocks synthesis | Staging | Inject disallowed narration content | BAD_REQUEST; nothing persisted; no charge | Error + DB check | Operator |
| S8 | Failed synthesis → refund | Staging (simulate R2 failure) | Force upload failure | Refund under same key; error surfaced | Ledger USAGE+REFUND net 0 | Operator |
| S9 | Music-enabled export blended | **Music authorization**; flag on; rate seeded | Generate music → export | Blended audio, speech intelligible | Export + listening + ffprobe | Operator + Music auth |
| S10 | R16/KIDS guard rejects non-R16 | Staging non-R16 session | Call `generateStoryNarration` | FORBIDDEN | tRPC error | Operator |
| S11 | Educational rejected by narration proc | Staging R16 | Call with `contentType=EDUCATIONAL` | PRECONDITION_FAILED ("Use generateEducationalNarration") | tRPC error | Operator |
| (S12) | phase6d integration isolated | Reachable disposable PG | `pnpm --filter @raivstream/api test:integration` | 4/4 | Test output | **Agent (local PASS)** / Operator (staging) |

### 14.6 Migration review (Workstream 6) — prepared for DBA

| Migration | Table | Change | Lock / impact | Idempotent | Rollback | Ordering |
|---|---|---|---|---|---|---|
| `20261009120000_phase_a_story_scene_narration_script` | `story_scene_seeds` | `ADD COLUMN IF NOT EXISTS "narrationScript" TEXT` | Nullable, no default → PG ≥11 metadata-only (no rewrite); brief `ACCESS EXCLUSIVE` for the catalog update only | Yes | `DROP COLUMN "narrationScript"` | after 6D (`110000`) |
| `20261009130000_phase_b_story_project_background_music` | `story_projects` | `ADD COLUMN IF NOT EXISTS "backgroundMusicUrl" TEXT` | Same as above | Yes | `DROP COLUMN "backgroundMusicUrl"` | after `120000` |

- **Exercised on a disposable DB (this pass):** dropped both columns → applied both migrations → columns re-created as `text nullable=YES`; re-apply emitted `NOTICE: column … already exists, skipping` (idempotent).
- **Preflight queries:** confirm `story_scene_seeds`/`story_projects` exist; confirm the columns are absent; check `pg_stat_activity` for long-running transactions before the brief catalog lock.
- **Post-migration verification:** `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE …` → `text`, nullable.
- **Dependencies:** none beyond the base tables. **DBA judgment items:** confirm no app instance caches the pre-migration column list and that deploy ordering applies migrations before the new code (`deploy.yml` runs `migrate deploy` before build/type-check).
- **Not run against production. No approval claimed.**

### 14.7 Final audit & remaining conditions

- **Files modified this pass:** `packages/api/vitest.config.ts`, `packages/api/vitest.integration.config.ts` (new), `packages/api/package.json`, `docs/operations/r16-video-audio-phase-abc-verification.md`, `session.md`. No tracked release-code file was altered; all pre-existing working-tree changes preserved.
- **Unresolved blockers:** (1) media rendering not verified (no FFmpeg); (2) staging S1–S11 not executed (no access; S9 needs music authorization); (3) DBA approval for the two migrations outstanding; (4) live Lyria path fail-closed and untested by design.
- **Recommendation:** **CONDITIONAL — READY FOR HUMAN RELEASE REVIEW.** The parallel integration-timeout defect is fixed; both the unit suite and the real-DB integration suite are green; the migrations are exercised and safe on a disposable DB. Remaining conditions are the staging-operator checks and DBA sign-off (plus FFmpeg-based media validation).
