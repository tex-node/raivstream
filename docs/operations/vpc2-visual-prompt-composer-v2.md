# Visual Prompt Composer V2 — Implementation & Local Qualification

**Branch:** `feat/visual-prompt-composer-v2`  
**Base commit:** `07c3752` (from `main`)  
**Date:** 2026-09-05  
**Status:** LOCAL QUALIFICATION COMPLETE + HUMAN REVIEW PASS — not yet deployed

---

## 1. What was built

Visual Prompt Composer V2 (VPC-2) transforms structured story intelligence (Phase A `StoryBlueprint` + `DirectedScene`) into high-quality, provider-neutral visual generation instructions using a **deterministic composition layer**. No LLM call is made by the composer itself; composer cost is always $0.

### Pipeline (V2 path)

```
SCENE + PROJECT + CHAPTER (DB row)
  ↓
safeParseDirectedScene()   ← reads StorySceneSeed.directorMetadata JSON (Phase A)
safeParseStoryBlueprint()  ← reads StoryChapter.blueprint JSON (Phase A)
  ↓
composeV2BasePrompt()
  │
  ├── deriveCharacterLocks()       ← Character Visual Lock from StoryCharacterMemory
  ├── parseCameraSpec()            ← V1 enum → V2 constrained vocabulary
  ├── collectAllConflicts()        ← deterministic conflict detection (non-fatal)
  ├── buildBudgetedPrompt()        ← priority-based budget; required sections never dropped
  ├── buildBudgetedNegativePrompt()
  └── CanonicalVisualPrompt{}      ← in-memory; stored in GenerationJob.metadata
  ↓
promptEnhancerService (optional, existing LLM polisher, unchanged)
```

V1 path is preserved exactly when the flag is off. V2 replaces only the deterministic BASE prompt; the optional LLM polisher continues to run on top.

### Feature flag

```
VISUAL_PROMPT_COMPOSER_V2_ENABLED=true
```

Default: off. Flag off = exact V1 behaviour. Flag on = V2 with non-fatal fallback to V1 on error.

---

## 2. New files

| File | Purpose |
|------|---------|
| `packages/api/src/lib/visualPromptComposer/types.ts` | All VPC-2 TypeScript types, feature flag |
| `packages/api/src/lib/visualPromptComposer/characterLock.ts` | Character Visual Lock derivation |
| `packages/api/src/lib/visualPromptComposer/camera.ts` | Camera spec parser & renderer |
| `packages/api/src/lib/visualPromptComposer/conflicts.ts` | Deterministic conflict detection |
| `packages/api/src/lib/visualPromptComposer/injection.ts` | Story-content injection defense |
| `packages/api/src/lib/visualPromptComposer/budget.ts` | Priority-based prompt budgeting, Jaccard similarity |
| `packages/api/src/lib/visualPromptComposer/r16.ts` | R16/KIDS safety negative terms, overlay protection |
| `packages/api/src/lib/visualPromptComposer/composer.ts` | Main `compose()` function |
| `packages/api/src/lib/visualPromptComposer/index.ts` | Public barrel exports |
| `packages/api/src/lib/visualPromptComposer/__tests__/vpc2.test.ts` | 99 unit tests |
| `packages/api/src/lib/visualPromptComposer/__tests__/benchmark.ts` | 32-scene benchmark script |

Modified: `packages/api/src/routers/story.ts` — V2 integration in `composeEnhancedScenePrompt`

---

## 3. Architecture

### 3.1 Character Visual Lock

Derived from `StoryCharacterMemory` at compose time — no new DB table.

- Extracts `signatureItems` (accessories, clothing keywords — 30+ patterns including backpack, hat, scarf, glasses, braids)
- Captures `physicalDescription`, `species`, `ageDescription`, `gender`
- `isFocal = true` for the first scene-named character or first character in memory
- Up to 4 characters per scene (focal character always included; scene-named characters prioritised)
- `characterLockToPromptString()` renders to a deterministic ingredient string per character

### 3.2 CanonicalVisualPrompt

An in-memory struct — not a DB table. Stored in `GenerationJob.metadata.vpcCanonical` for provenance. Shape:

```typescript
type CanonicalVisualPrompt = {
  version: 'visual_prompt_v2';
  medium: 'IMAGE' | 'VIDEO';
  sceneId, storyTitle, sceneTitle, storyBeat?, dramaticPurpose?,
  focalSubject, characters: CharacterVisualLock[],
  action, emotion?, environment, timeOfDay?, weather?,
  spatialRelationships?,
  camera: CameraSpec,    // { shotSize, angle, movement?, freeformHint? }
  composition: CompositionSpec,  // { layout, verticalFraming: '9:16' }
  lighting: LightingSpec,
  continuity: string[],   // DirectedScene rules + BlueprintRules + CharacterLock names
  style: string,           // normalised style key
  stylePromptBlock: string,
  requiredDetails: string[],
  forbiddenDetails, negativePromptParts,
  audienceMode,
  detectedConflicts: string[],  // non-fatal warnings
  renderedPrompt, renderedNegativePrompt,
};
```

### 3.3 Priority-based prompt budgeting

Sections have priority numbers (0 = highest). Required sections never dropped. Optional sections dropped from lowest priority first when over budget.

| Priority | Label | Required |
|----------|-------|---------|
| 0 | style | ✓ |
| 1 | story_context | ✓ |
| 2 | character_identity | ✓ |
| 3 | action | ✓ |
| 4 | environment | ✓ |
| 5 | spatial | |
| 6 | emotion | |
| 7 | camera | |
| 8 | composition | |
| 9 | lighting | |
| 10 | continuity | |
| 11 | required_details | |
| 12 | mood | |
| 13 | safety | ✓ |
| 14 | overlay_protection | ✓ |

### 3.4 Camera vocabulary

V1 enum → V2 constrained shot sizes: `CLOSE_UP→close_up`, `MEDIUM_SHOT→medium`, `WIDE_SHOT→wide`, `OVER_THE_SHOULDER→medium_close`, `BIRDS_EYE_VIEW→extreme_wide + overhead angle`, `EYE_LEVEL→medium + eye_level angle`. Free-form `DirectedScene.cameraIntent` can further refine shot, angle, and movement (VIDEO-only).

### 3.5 R16 / KIDS safety

Server-authoritative. `audienceMode = 'KIDS'` adds extra negative terms (violence, weapons, adult themes, dark horror, etc.) and `checkKidsSafety()` throws `VpcError('UNSAFE_VISUAL_REQUEST')` if action text contains unsafe content.

**Overlay protection (shared by all modes):** The negative prompt always includes `phone UI`, `social media UI`, `gallery UI`, `shot labels`, `9:16 labels`, `captions`, `speech bubbles`, `visible words`, `app interface`, `gallery controls`, `social overlay`, `subtitle bar`, `watermarks`.

### 3.6 Injection defense

12 regex patterns covering: "ignore previous instructions", "reveal system prompt", "DAN mode", "jailbreak", "override safety", and variants. Story text sanitised via `sanitizeStoryContent()` before embedding in prompt. Detection also available separately via `containsInjectionAttempt()`.

### 3.7 Conflict detection

Deterministic, non-fatal (warnings only, never throws). Detected conflicts stored in `canonical.detectedConflicts[]`. Categories:

- Indoor/outdoor mismatch (keyword-based regex against `locationType`)
- Day/night lighting contradiction
- Solo subject hint vs multiple characters
- Wardrobe conflict (formal attire + swimming)
- Camera contradictions (extreme close-up + pan, overhead + pan)

**Known false-positive classes:** Location strings that contain indoor keywords but describe outdoor areas (e.g., "school gate", "front door"). These are non-fatal and correctly treated as warnings.

### 3.8 Scene differentiation

`isProblematicallySimilar(a, b)` uses Jaccard similarity on `canonical.action` fields (not full prompt) to flag repetitive adjacent scenes. Threshold: similarity > 0.8.

---

## 4. Integration point

Integration in `packages/api/src/routers/story.ts` → `composeEnhancedScenePrompt()`.

```typescript
// V2 path (flag on)
if (isVisualPromptComposerV2Enabled()) {
  const ds = safeParseDirectedScene(input.scene.directorMetadata);
  try {
    const v2 = composeV2BasePrompt(input, ds);
    base = v2 as any;
    characterIdentity = v2.characterIdentity;
  } catch (err) {
    console.warn('[vpc2] V2 composer failed, falling back to V1:', ...);
    // V1 fallback — existing deterministic path runs
  }
}
```

### 4.1 Blueprint continuity threading

`composeV2BasePrompt()` now reads the persisted Phase A blueprint from the authoritative
`StoryChapter.blueprint` column through `scene.chapter.blueprint`:

```typescript
const blueprint = safeParseStoryBlueprint(input.scene.chapter?.blueprint);
```

- `StoryChapter.blueprint` (`Json?`) is selected by the three scene-prompt call sites
  (`generateSceneImageAsset`, `composeScenePrompt`, `composeAllScenePrompts`) via
  `chapter: { select: { blueprint: true } }`.
- Parsing reuses the existing Phase A `storyBlueprintSchema` (Zod); no new validator and
  no schema/migration change were introduced.
- When the column is absent or `null` (historical projects), the composer runs with
  `blueprint = null` — continuity falls back to DirectedScene rules plus character locks.
- When the column is present but malformed/legacy JSON, `safeParseStoryBlueprint()` fails
  safe to `null` (no throw, no fabricated fields); the scene still composes.
- Blueprint continuity rules are consumed by `resolveContinuity()` and surface in
  `canonical.continuity` and the `continuity` prompt section when budget allows.
- The persisted blueprint is read-only here; it is never rewritten, and none of its
  internals are exposed to R16 responses (R16 sanitisation happens at the router layer).

Provenance stored in `GenerationJob.metadata`:
```typescript
promptComposerVersion: 'visual_prompt_v2' | 'v1'
vpcCanonical: CanonicalVisualPrompt | undefined
```

---

## 5. Test suite

**99 unit tests** in `__tests__/vpc2.test.ts` across 14 suites:

1. Character Visual Lock — derivation, signature items, multi-char cap
2. Action resolution — prop extraction, injection sanitisation
3. Multi-character composition — two_shot vs group, spatial cues
4. Camera — enum mapping, free-form parsing, conflict detection
5. Continuity — DirectedScene rules, blueprint rules, lock names
6. Style preservation — all registered styles round-trip
7. Cultural fidelity — Nigerian names, Lagos locations, cornrows preserved
8. R16 / KIDS safety — extra negatives, `UNSAFE_VISUAL_REQUEST` throw
9. Prompt injection defense — 12 patterns neutralised, clean text passed
10. Prompt budget — required sections survive truncation, optional dropped
11. Fallback / flag — V2 output shape, composerCost === 0
12. Historical project compatibility — STORYBOOK, PHOTOREALISTIC, AFRICAN_FOLKTALE round-trips
13. Scene differentiation — Jaccard on action fields (not full prompt)
14. Conflict detection — indoor/outdoor, day/night, wardrobe

**Full API suite:** 271/271 pass (99 new + 172 existing — no regressions)

---

## 6. Benchmark

Run: `node_modules/.bin/tsx packages/api/src/lib/visualPromptComposer/__tests__/benchmark.ts`

**12 stories, 32 scenes** (KIDS + GENERAL, 8 visual styles):

| Metric | Result | Target |
|--------|--------|--------|
| Character identity in prompt | 100.0% | ≥ 95% |
| Required action present | 100.0% | ≥ 95% |
| Environment specific | 100.0% | ≥ 90% |
| Camera term present | 100.0% | ≥ 80% |
| Composition present | 100.0% | ≥ 80% |
| Continuity rules present | 100.0% | ≥ 90% |
| Style preserved | 100.0% | 100% |
| Overlay protection in neg | 100.0% | 100% |
| Median latency | 0.18 ms | — |
| p95 latency | 2.64 ms | — |
| Composer provider cost | $0 | $0 |

**Gate targets: ALL MET**

Conflicts flagged: 4/32 scenes (all non-fatal; 3 location-keyword false-positives, 1 solo-subject warning). Zero crashes or thrown errors during benchmark.

---

## 7. Human review rubric (gate §91 requirement)

Minimum 6 benchmark stories reviewed manually, scored 1–5 per dimension:

| Dimension | What to check |
|-----------|--------------|
| Character identity retention | Are character names, species, visual traits present? |
| Action retention | Is the key action clearly described? |
| Environment specificity | Is the location specific and distinct? |
| Camera presence | Is shot type named? |
| Composition | Is framing specified? |
| Continuity | Are continuity rules referenced? |
| Style preservation | Does the style prompt block match? |
| Required-detail retention | Are scene-critical props mentioned? |
| Forbidden-detail absence | No phone UI, no subtitle bar, no watermark terms in positive prompt? |
| Overlay protection in negative | Are all 6 required overlay terms in negative prompt? |

Threshold: average ≥ 4.0 / 5.0 across reviewed scenes.

Review result recorded in `docs/operations/vpc2-human-review-2026-09-05.md`: **PASS**, average **4.92 / 5.00**.

---

## 8. Known limitations

- ~~`StoryBlueprint` chapter continuity rules are not yet threaded...~~ **Resolved.** The persisted Phase A blueprint (`StoryChapter.blueprint`) is now threaded through `scene.chapter.blueprint` into `composeV2BasePrompt()` (see §4.1). Null and malformed legacy JSON both degrade safely to `blueprint = null`. No schema or migration change. Regression coverage: `packages/api/src/routers/__tests__/vpc2BlueprintContinuity.test.ts`.
- Location-string conflict detection uses keyword matching — produces false positives for ambiguous locations ("school gate", "front door"). Non-fatal.
- `scene.characters` field is typed `unknown` in the DB schema; VPC-2 handles this gracefully but cannot rely on structured character ordering from that field.

---

## 9. Production status

**DO NOT ENABLE IN PRODUCTION** without a separate gate authorization.

- Feature flag default: OFF
- This document covers local implementation + qualification only
- No staging or production deployment authorized by the VPC-2 gate
- Next required step before any production deployment: separate gate document + staging smoke + production authorization
