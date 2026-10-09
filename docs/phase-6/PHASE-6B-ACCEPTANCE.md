# Raivstream 5.0 — Phase 6B Acceptance Record
**Date:** 2026-10-09  
**Branch:** `main`  
**Status:** COMPLETE ✓

---

## Phase 6B Scope

TTS/ElevenLabs bridge — narration plan, cue seeding, voice generation.  
No audio generation in production (credit rates not seeded). No provider calls during tests.

---

## Gate Checklist

### A — Schema migration (additive)

- [x] `AudioAsset.projectId String` → `String?` — made nullable for Creative 5.0 assets
- [x] `AudioAsset.project StoryProject @relation` → `StoryProject? @relation` (relation updated)
- [x] Migration file: `20261009100000_phase6b_audio_asset_nullable_project/migration.sql`
- [x] Migration uses `DO $$ BEGIN...END $$` guard for idempotency
- [x] Story-domain assets unaffected (projectId still set for all existing rows)
- [x] All changes additive — no existing data modified, no destructive ALTER
- [x] `AudioAsset.creativeVersionId` (Phase 6A) referenced correctly from new code

### B — Narration plan builder (pure function)

- [x] `buildNarrationPlan(plan, bible)` — pure, no DB, deterministic
- [x] Creates one `NarrationCue` per scene with non-empty narration text
- [x] Skips scenes with empty/null narration silently
- [x] `startTimeSeconds` resolved from `plan.timeline` by `sceneId`
- [x] `durationSeconds` from `scene.estimatedDurationSeconds`
- [x] `performanceDirection` composed from `voiceStyle` + `style/mood` from `AudioLanguageSpec`
- [x] Falls back to `"clear, measured delivery"` when bible has no audio direction
- [x] `primaryLanguage` defaults to `"en"` when bible has no `audioLanguage`
- [x] Exported as `NarrationPlan` + `NarrationCue` typed interfaces

### C — Narration cue seeding (idempotent DB write)

- [x] `seedNarrationCues(prisma, { planId, plan, bible })` — writes AudioCue rows
- [x] Finds NARRATION track by `planId` and `type: 'NARRATION'`
- [x] Returns early (0 created, 0 skipped) when NARRATION track not found
- [x] Idempotent: fetches existing cues, filters by `metadata.sceneId`, skips duplicates
- [x] Each created cue carries `metadata: { sceneId, language }` for idempotency key
- [x] Returns `null` when `isCreativeAudioEnabled()` is false (silent no-op)
- [x] `AudioCue.sequenceSceneId = null` — Creative 5.0 cues do not reference StorySequenceScene

### D — TTS generation (fail-closed)

- [x] `generateNarrationForCue(prisma, input)` — adapts story.ts `generateSpeechForCue` pattern
- [x] Gate 1: returns `null` when `isCreativeAudioEnabled()` is false
- [x] Gate 2: `resolveFeatureCreditRate(prisma, 'story:speech_generation')` → PRECONDITION_FAILED when not configured
- [x] Gate 3: `isElevenLabsTtsEnabled()` → PRECONDITION_FAILED when false
- [x] Gate 4: `moderatePrompt(text)` → BAD_REQUEST when blocked
- [x] Credits deducted BEFORE provider call — refunded on any failure
- [x] Voice resolution: `VoiceProfile.voiceRef` → `elevenLabsDefaultVoiceId()` fallback
- [x] Storage key pattern: `creative/{creativeProjectId}/audio/{cueId}-{Date.now()}.mp3`
- [x] `AudioAsset` created atomically: `projectId = null`, `creativeVersionId` set, `sourceKind = 'SYNTHETIC_TTS'`
- [x] `AudioCue.audioAssetId` set after successful asset creation (cue materialised)
- [x] `AudioAsset.promptText` = narration text (traceability)
- [x] `AudioAsset.providerJobId` = `elevenlabs:{voiceId}` (provenance)
- [x] Refund path: `refundCredits(...)` called on every throw after deduction

### E — No credit seeding

- [x] `story:speech_generation` rate NOT seeded — generation remains unavailable until rates authorized
- [x] `story:audio_generation` rate NOT seeded
- [x] All paths fail-closed when rate is missing

### F — Tests (26 tests, 0 fail)

- [x] `buildNarrationPlan` — 6 tests: mapping, language defaults, performance direction, empty narration
- [x] `seedNarrationCues` — 7 tests: creation, idempotency (partial + full), flag off, track not found, metadata
- [x] `generateNarrationForCue` — 13 tests: flag off paths, NOT_FOUND, BAD_REQUEST (no text), PRECONDITION_FAILED (rate missing), PRECONDITION_FAILED (TTS disabled), BAD_REQUEST (moderation), success flow, VoiceProfile.voiceRef, default voice, refund on synthesis failure, refund on upload failure, no asset on failure

### G — Regression

- [x] API tests: **1475 pass, 5 skipped, 0 fail** (76 test files)
- [x] TypeScript — API: **0 errors**
- [x] TypeScript — Web: **0 errors**
- [x] Phase 6A acceptance gates unchanged

---

## Architecture decisions

### Why AudioAsset.projectId is nullable

Creative 5.0 projects are anchored to `creativeVersionId`, not a legacy `StoryProject`. Making `projectId` nullable (additive migration) follows the same pattern used for `AudioPerformancePlan.projectId` in Phase 6A. Story-domain assets continue to have `projectId` set — the FK constraint still applies to non-NULL values.

### Why buildNarrationPlan is a pure function

The narration plan is deterministic from the production plan + bible. Keeping it pure makes it cheap to call at any stage and trivially unit-testable without DB mocks.

### Why generateNarrationForCue is fail-closed at two gates

The credit gate (PRECONDITION_FAILED before provider call) ensures no silent spend. The ElevenLabs gate (PRECONDITION_FAILED when disabled) ensures no accidental live calls on servers where the flag is not set. Both gates are checked before `deductCredits` — no credits move unless all preconditions pass.

### Why AudioCue.sequenceSceneId is null for Creative 5.0 cues

`StorySequenceScene` belongs to the Story domain. Creative 5.0 scenes have no counterpart. The `metadata.sceneId` string carries the identity anchor instead.

---

## Scope exclusions confirmed

- No audio generation in production (credit rates not configured)
- No MiniMax adapter
- No Lyria calls (Phase 6C)
- No Series, Episodes, Spinoffs
- No Homer/MovieDirector changes
- No R16 changes
- No Phase 5 versioning semantics modified
- No Phase 6C–6E code

---

## Phase 6B Final Report

```
A — Schema migration (AudioAsset.projectId nullable):    PASS
B — buildNarrationPlan (pure, typed):                    PASS
C — seedNarrationCues (idempotent DB write):              PASS
D — generateNarrationForCue (fail-closed TTS bridge):    PASS
E — Credit infrastructure (no seeding):                  PASS
F — Tests (26/26):                                       PASS
G — Regression (1475 pass, 0 fail):                      PASS
```

**PHASE 6B COMPLETE — TTS BRIDGE VERIFIED — AWAITING PHASE 6C AUTHORIZATION.**
