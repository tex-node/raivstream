# VPC-2 Handover Report — 2026-09-05

**For:** Next agent continuing Raivstream VPC-2 work  
**From:** Session `ea2fe19d` (Claude Sonnet 4.6)  
**Branch:** `feat/visual-prompt-composer-v2`  
**Last commit:** `02be6de`  
**Gate document:** Phase VPC-2 — Visual Prompt Composer V2 (94 sections, provided by user)

---

## 1. Hard constraints — read before anything else

These are VERBATIM from the gate document. Do NOT deviate.

| Constraint | Detail |
|-----------|--------|
| **NEVER use** | `C:\Users\XPS\OneDrive\Documents\Claude\Raivstream\raivstream` — frozen prototype, read-only reference only |
| **Authoritative worktree** | `C:/Raiv/raivstream` — all work happens here |
| **Branch** | `feat/visual-prompt-composer-v2` (created from `main` at `07c3752`) |
| **DO NOT START** | Phase B |
| **DO NOT START** | Visual Prompt Composer V2 Prompt Critic |
| **DO NOT RESUME** | Voice work |
| **DO NOT INVENT OR CHANGE** | Pricing |
| **NEVER MODIFY** | `story:movie_render = 100 credits` |
| **Do NOT deploy** | To staging or production |
| **Do NOT merge** | To main — not authorized yet |
| **NEVER print** | DATABASE_URL or any credential from .env to transcript |
| **NEVER reset** | Real (non-QA) user passwords |
| **NEVER run** | `db push` from prototype directory |
| **NEVER apply** | Clerk auth to production repo |
| **Do NOT manually grant** | Production credits for QA |
| **Do NOT trigger** | Paid cloud generation during smokes |
| **Do NOT expose** | Stack traces, Prisma errors, provider errors, R2 keys, JWT details |
| **DO NOT REQUEST** | Database passwords or API keys in chat |

---

## 2. What was completed in this session

### 2.1 Implementation (all committed at `02be6de`)

Visual Prompt Composer V2 is fully implemented. It is a **deterministic, no-LLM** composition layer that takes Phase A story intelligence outputs and produces high-quality, provider-neutral visual generation instructions. Composer cost is always $0.

**Files created** in `packages/api/src/lib/visualPromptComposer/`:

| File | Purpose |
|------|---------|
| `types.ts` | All VPC-2 types; `CharacterMemoryInput`, `SceneInput`, `ProjectInput`, `VpcComposerInput`, `VpcComposerOutput`, `CanonicalVisualPrompt`, `CharacterVisualLock`, `CameraSpec`, `CompositionSpec`, `LightingSpec`, `VpcError`, `isVisualPromptComposerV2Enabled()` |
| `characterLock.ts` | `deriveCharacterLocks()` — builds `CharacterVisualLock[]` from `StoryCharacterMemory`; 30+ signature-item keywords; caps at 4 characters; `characterLockToPromptString()` for rendering |
| `camera.ts` | V1 enum → V2 constrained vocabulary; free-form `DirectedScene.cameraIntent` parser; `parseCameraSpec()`, `cameraSpecToString()`, `detectCameraConflicts()` |
| `conflicts.ts` | Deterministic, non-fatal conflict detection: indoor/outdoor, day/night, solo-vs-group, wardrobe, camera contradictions; `collectAllConflicts()` |
| `injection.ts` | 12 injection-defense regex patterns; `sanitizeStoryContent()`, `sanitizeActionText()`, `sanitizeEnvironmentText()`, `containsInjectionAttempt()` |
| `budget.ts` | Priority-based prompt budgeting (required sections never dropped); `buildBudgetedPrompt()`, `buildBudgetedNegativePrompt()`; Jaccard similarity for scene differentiation: `promptSimilarityRatio()`, `isProblematicallySimilar()` |
| `r16.ts` | KIDS extra negative terms; shared overlay-protection terms (`phone UI`, `social media UI`, `gallery UI`, `shot labels`, `subtitle bar`, `watermarks`, etc.); `buildNegativePromptParts()`, `checkKidsSafety()`, `kidsSafetyText()` |
| `composer.ts` | Main `compose(input: VpcComposerInput): VpcComposerOutput` — no LLM call, `composerCost: 0` always; 15-section priority-ordered prompt builder |
| `index.ts` | Public barrel: `composeV2`, `isVisualPromptComposerV2Enabled`, `VPC_VERSION`, `VpcError`, all key types |
| `__tests__/vpc2.test.ts` | 99 unit tests across 14 suites — all pass |
| `__tests__/benchmark.ts` | 32-scene benchmark across 12 stories — all metrics 100%, median 0.18ms, cost $0 |

**File modified:** `packages/api/src/routers/story.ts`
- Added V2 imports from `visualPromptComposer`
- Extended `ScenePromptContext` with `directorMetadata?: unknown`
- Added `safeParseDirectedScene()`, `safeParseStoryBlueprint()`, `composeV2BasePrompt()` helpers
- V2 code path in `composeEnhancedScenePrompt()` gated by `isVisualPromptComposerV2Enabled()`
- Non-fatal fallback to V1 on any error
- Provenance stored in `GenerationJob.metadata`: `promptComposerVersion`, `vpcCanonical`

**File created:** `docs/operations/vpc2-visual-prompt-composer-v2.md` — full architecture, test, and benchmark documentation.

### 2.2 Test results

```
99/99   VPC-2 unit tests (14 suites)
271/271 Full API suite (99 new + 172 existing — zero regressions)
TypeScript: EXIT:0 (clean)
Lint: clean, no ESLint warnings
Build: compiled successfully in 44s; JWT secret failure is pre-existing
        local limitation (production secrets live on VPS .env only)
```

### 2.3 Benchmark results

Run: `cd C:/Raiv/raivstream && node_modules/.bin/tsx packages/api/src/lib/visualPromptComposer/__tests__/benchmark.ts`

All 8 gate metrics: **100%**. All gate targets: **MET**.

---

## 3. What the gate document still requires

The gate document's section 91 Completion Gate lists items not yet fully satisfied. The implementation and local qualification are done. What remains:

### 3.1 Human review rubric (gate §91 item)

The gate requires manually reviewing at least **6 benchmark stories**, scoring each 1–5 on 10 dimensions. The benchmark script already prints all 32 prompts. To complete this:

1. Run the benchmark: `node_modules/.bin/tsx packages/api/src/lib/visualPromptComposer/__tests__/benchmark.ts`
2. Read the positive prompt output for ≥6 stories
3. Score against the rubric in [`docs/operations/vpc2-visual-prompt-composer-v2.md`](vpc2-visual-prompt-composer-v2.md) (Section 7)
4. Average score must be ≥4.0/5.0

To also print the actual rendered prompts (benchmark currently only prints metrics), modify `benchmark.ts` to add `console.log(out.prompt)` after each scene.

### 3.2 StoryBlueprint continuity threading (known gap, non-blocking)

In `story.ts → composeV2BasePrompt()`, the `blueprint` argument is currently hardcoded to `null`:

```typescript
// story.ts, inside composeV2BasePrompt call site:
const blueprint: StoryBlueprint | null = null;
```

Phase A writes `StoryBlueprint` to `StoryChapter.blueprint` (JSON field). The `composeV2BasePrompt` function accepts `blueprint` and the `composer.ts` reads it — the plumbing is complete on the composer side. What's missing is threading the chapter's blueprint through from the tRPC call context. This is a future improvement, not a blocker for local qualification.

To wire it: in `composeEnhancedScenePrompt`, find the chapter for the scene and pass its `blueprint` JSON through `safeParseStoryBlueprint()`.

### 3.3 V1 vs V2 prompt comparison document (optional for gate)

The gate references a side-by-side comparison for the benchmark runs. The current benchmark only runs V2 (V1 requires the flag to be off). To produce a V1/V2 comparison: run benchmark with flag off, capture output; run with flag on, capture output; diff the `renderedPrompt` strings.

---

## 4. Architecture — key facts for the next agent

### 4.1 The composer is always deterministic

`compose()` in `composer.ts` makes **zero LLM calls**. Given the same input, it returns the same output. Latency is <1ms per scene. This is by design — the existing `promptEnhancerService` (an optional LLM polisher in `story.ts`) runs on top of the V2 base if configured.

### 4.2 How Phase A data flows in

- `DirectedScene` — stored as JSON in `StorySceneSeed.directorMetadata`. Read by `safeParseDirectedScene()` in `story.ts`, then passed as `directedScene` to `composeV2BasePrompt()` → `compose()`. If null (Phase A not run, or parse fails), composer falls back to raw scene fields.
- `StoryBlueprint` — stored as JSON in `StoryChapter.blueprint`. Currently `null` at the call site (threading gap above). The composer handles `null` gracefully.

### 4.3 No new DB tables or migrations

`CanonicalVisualPrompt` is in-memory + stored in the existing `GenerationJob.metadata` JSON blob. `CharacterVisualLock` is derived at compose time from the existing `StoryCharacterMemory` Prisma model. Nothing was added to `schema.prisma`.

### 4.4 The V1 path is exactly preserved when flag is off

When `VISUAL_PROMPT_COMPOSER_V2_ENABLED` is not `"true"`, `composeEnhancedScenePrompt` executes exactly as before. The V2 code path is entirely additive — no branching of existing code was removed.

### 4.5 Feature flag wiring

```typescript
// packages/api/src/lib/visualPromptComposer/types.ts
export function isVisualPromptComposerV2Enabled(): boolean {
  return process.env.VISUAL_PROMPT_COMPOSER_V2_ENABLED === 'true';
}
```

To test V2 locally: set `VISUAL_PROMPT_COMPOSER_V2_ENABLED=true` in `packages/api/.env` (dev env). Do not set it in production env without gate authorization.

### 4.6 Composer input shape

```typescript
type VpcComposerInput = {
  scene: SceneInput;          // id, title, description, locationType, etc.
  project: ProjectInput;      // title, audienceMode, visualStyle, characterMemory[]
  chapter?: ChapterInput;     // blueprint JSON (currently null at call site)
  medium: 'IMAGE' | 'VIDEO';
  maxPromptLength: number;    // 1800 in story.ts
  maxNegativePromptLength: number; // 900 in story.ts
  audienceMode: StoryAudienceMode; // 'KIDS' | 'GENERAL'
  directedScene?: DirectedScene | null;  // from Phase A
  blueprint?: StoryBlueprint | null;     // from Phase A (currently null)
};
```

### 4.7 Conflict detection produces false positives (known, non-fatal)

Location strings containing indoor keywords but describing outdoor places produce false positive indoor/outdoor conflicts. Examples: "school gate" (contains "school"), "front door of home", "school gate street". These are logged as warnings in `canonical.detectedConflicts[]` and do not affect prompt quality or throw errors.

---

## 5. Monorepo context

- **Monorepo tool:** Turborepo
- **Stack:** Next.js 15.5.12, tRPC v11, Prisma/PostgreSQL, TypeScript strict
- **API package:** `packages/api` — all prompt composition lives here
- **Run tests:** `pnpm --filter @raivstream/api test` (from `C:/Raiv/raivstream`)
- **Type check:** `pnpm --filter @raivstream/api exec tsc --noEmit` (from `C:/Raiv/raivstream`)
- **Lint:** `pnpm --filter @raivstream/api lint` (from `C:/Raiv/raivstream`)
- **Run benchmark:** `node_modules/.bin/tsx packages/api/src/lib/visualPromptComposer/__tests__/benchmark.ts` (from `C:/Raiv/raivstream`)
- **Build:** `pnpm --filter web exec next build` — compiles successfully; JWT secret env-validation failure at runtime is pre-existing (production secrets on VPS only)

---

## 6. Memory files to read

Before starting work, read these memory files:

- `C:\Users\XPS\.claude\projects\C--Users-XPS-OneDrive-Documents-Claude-Raivstream-raivstream\memory\MEMORY.md` — index
- `memory/feedback_repo_safety.md` — hard invariants (which repo to use, what never to run)
- `memory/project_repo_identity.md` — authoritative paths, PM2 ids, domains
- `memory/project_pivot.md` — product context (story-to-film AI creator)
- `memory/design_nocturne.md` — design system tokens

---

## 7. What the next agent should NOT do

- Do not run any git command from `C:\Users\XPS\OneDrive\Documents\Claude\Raivstream\raivstream` — that is the frozen prototype
- Do not push `feat/visual-prompt-composer-v2` to remote or open a PR without explicit user instruction
- Do not merge to `main` — not authorized
- Do not create any new LLM calls inside the composer — it must remain deterministic and cost $0
- Do not modify `story:movie_render = 100 credits` — in `packages/api/src/lib/creditCosts.ts` or wherever it lives
- Do not start Phase B, Prompt Critic, voice work, or pricing work
- Do not deploy to staging or production
- Do not read or print any .env credential values to transcript

---

## 8. Recommended next steps (in priority order)

These are the only remaining items that align with the VPC-2 gate. Do not start anything outside this list without a new gate document from the user.

1. **Human review (gate §91):** Run benchmark, read prompts for ≥6 stories, score on rubric in ops doc. Record scores. If average <4.0, identify failing dimensions and fix the corresponding composer module.

2. **Blueprint threading (optional improvement):** Wire `StoryChapter.blueprint` through to `composeV2BasePrompt()` in `story.ts` so continuity rules from Phase A flow into VPC-2 prompts.

3. **V1/V2 side-by-side comparison (optional for gate):** Run benchmark with flag off to capture V1 prompts; run with flag on for V2. Document differences.

4. **Await next gate document:** Any work beyond the above — staging deployment, production deployment, Phase B, Prompt Critic — requires the user to provide a new gate document explicitly authorizing that scope.
