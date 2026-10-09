# Raivstream 5.0 — Phase 6C Acceptance Record
**Date:** 2026-10-09  
**Branch:** `main`  
**Status:** COMPLETE ✓

---

## Phase 6C Scope

Final-stage Google Lyria music generation bridge — typed music brief, credit
seeding, approval-gated generation, idempotent asset materialisation.

---

## Gate Checklist

### A — Credit rate seeding

- [x] `story:audio_generation` rate seeded at **100 credits/track** in `packages/database/seed.ts`
- [x] `unitLabel = 'track'` — matches one complete music track per creative version
- [x] Seeded via canonical `featureCreditRate.upsert` — idempotent
- [x] `story:speech_generation` rate NOT changed — remains unconfigured, fail-closed (Phase 6B contract preserved)

### B — `buildMusicBrief` (pure function)

- [x] Pure function: no DB, no side effects, deterministic
- [x] Creator instructions **always override** bible `AudioLanguageSpec` when non-empty
- [x] Priority order without creator instructions: `score` > `style`, plus `mood`, `tempo`, `sound`
- [x] All `AudioLanguageSpec` fields optional — graceful null/undefined bible
- [x] `durationSeconds = Math.max(1, Math.round(plan.totalRuntimeSeconds))` — never zero
- [x] `negativePrompt` always excludes vocals, singing, lyrics, speech, talking
- [x] Always includes "Instrumental background score." prefix and "No vocals, no lyrics." suffix
- [x] Returns typed `MusicBrief` interface: `{ prompt, negativePrompt, durationSeconds }`

### C — `generateMusicForVersion` lifecycle and gates

- [x] Gate 1: `isCreativeAudioEnabled()` → return null (silent no-op when disabled)
- [x] Gate 2: `isLyriaMusicEnabled()` → PRECONDITION_FAILED when false
- [x] Gate 3: `creativeApproval.findUnique({ versionId_kind: { versionId, kind: 'CREATIVE' } })` → PRECONDITION_FAILED when status ≠ 'APPROVED'
- [x] Gate 4: Audio plan exists → PRECONDITION_FAILED when absent
- [x] Gate 5: MUSIC track exists on plan → PRECONDITION_FAILED when absent
- [x] Idempotent: `audioCue.findFirst({ trackId, audioAssetId: { not: null } })` → returns `{ reused: true, creditsUsed: 0 }` without new charge
- [x] Gate 6: `resolveFeatureCreditRate(prisma, 'story:audio_generation')` → PRECONDITION_FAILED when not configured (fail-closed)
- [x] Credits deducted BEFORE provider call — refunded on any failure after this point
- [x] Unmaterialised cue created as intent record before provider call
- [x] `buildMusicBrief` called with bible + plan + optional creatorInstructions
- [x] `generateMusic` called with brief — no live calls during tests
- [x] Storage key: `creative/{creativeProjectId}/music/{cueId}-{Date.now()}.{ext}`
- [x] `AudioAsset` created atomically: `creativeVersionId` set, `projectId` unset, `sourceKind = 'SYNTHETIC_MUSIC'`
- [x] `AudioAsset.providerJobId = 'lyria:{modelId}'` — provenance traceability
- [x] `AudioAsset.promptText = brief.prompt` — traceability
- [x] `AudioCue.audioAssetId` set after successful asset creation (cue materialised)
- [x] Refund path: `refundCredits(...)` called on every throw after `deductCredits`
- [x] No asset created on any failure — structural invariant

### D — Adapter reuse

- [x] Reuses existing `packages/api/src/lib/generators/lyriaMusic.ts` — no new adapter
- [x] `generateMusic(input, deps?)` — synchronous HTTP, injectable deps for tests
- [x] `isLyriaMusicEnabled(env?)` — reads `LYRIA_MUSIC_ENABLED` env var
- [x] `lyriaModelId(env?)` — reads model string from env
- [x] No MiniMax or other music provider introduced

### E — Final-stage constraint

- [x] `generateMusicForVersion` requires CREATIVE approval record — never callable on scene planning, image gen, video gen, targeted scene regeneration, ordinary review, or page load
- [x] Structural safety verified: approval gate fires before any credit or provider call
- [x] `output/service.ts` `autoAssemble()` path does NOT call `generateMusicForVersion` — music is not triggered during rendering

### F — Tests (26 tests, 0 fail)

- [x] `buildMusicBrief` — 10 tests: creator instructions override, duration, score field priority, style fallback, mood/tempo/sound, null bible, empty bible, durationSeconds math, negativePrompt invariant, required fields
- [x] `generateMusicForVersion` — 16 tests: audio flag off (×2), Lyria disabled, approval absent, approval PENDING, no plan, no track, idempotent reuse, credit rate missing, success flow, creatorInstructions passthrough, refund on Lyria error, refund on upload null, no asset on Lyria error, no asset on upload error, structural approval safety

### G — Regression

- [x] API tests: **1501 pass, 5 skipped, 0 fail** (77 test files — 26 new Phase 6C tests included)
- [x] TypeScript — API: **0 errors**
- [x] TypeScript — Web: **0 errors**
- [x] Phase 6B acceptance gates unchanged

---

## Architecture decisions

### Why buildMusicBrief is a pure function

Music brief construction is deterministic from the approved creative state and the
project bible. Keeping it pure makes it cheap to test, cheap to call, and ensures no
side effects bleed into the approval-gated generation path.

### Why creator instructions take precedence

The creator is closer to the intended creative vision than any inferred preference.
`AudioLanguageSpec` fields are advisory signals; explicit creator instructions are
authoritative overrides. This keeps the feature useful even when the bible is sparse.

### Why the approval gate comes before credit deduction

No credits should move until the creative version is formally approved. The gate order
(Lyria enabled → CREATIVE approved → audio plan → MUSIC track → credit rate → deduct)
ensures every precondition is met before any spend occurs.

### Why the idempotency check is on AudioCue.audioAssetId

The AudioCue is the materialisation record. A null `audioAssetId` means the cue was
created (intent recorded) but the asset generation failed. A non-null `audioAssetId`
means the track was successfully generated and uploaded. Checking for an existing
materialised cue on the MUSIC track is the cheapest idempotency signal available.

### Why no MiniMax

Phase 6C spec explicitly restricts to the existing Lyria adapter. No new providers
are introduced. Future provider expansion is out of scope.

---

## Scope exclusions confirmed

- No live Lyria calls during tests or implementation
- No MiniMax or other music provider
- `story:speech_generation` rate NOT seeded (Phase 6B contract)
- Music generation NOT triggered from scene production, image generation, video generation, targeted scene regeneration, review, or page load
- No `CreativeApproval` bypass
- No Series, Episodes, Spinoffs changes
- No R16 changes
- No Phase 5 versioning semantics modified

---

## Phase 6C Final Report

```
A — Credit seeding (story:audio_generation @ 100 tokens/track):   PASS
B — buildMusicBrief (pure, typed, creator-instructions-first):    PASS
C — generateMusicForVersion (approval-gated, fail-closed, idempotent): PASS
D — Adapter reuse (lyriaMusic.ts, no new providers):              PASS
E — Final-stage constraint (no scene/review/page triggers):       PASS
F — Tests (26/26):                                                PASS
G — Regression (1501 pass, 0 fail):                               PASS
```

**PHASE 6C COMPLETE — LYRIA MUSIC BRIDGE VERIFIED.**
