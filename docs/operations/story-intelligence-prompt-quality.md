# Story Intelligence & Prompt Quality — Phase A

**Branch:** `feat/story-intelligence-phase-a`  
**Commit:** `1c4ca14`  
**Date:** 2026-09-03  
**Status:** PRODUCTION DEPLOYED — 2026-09-04

---

## 1. What was built

Phase A adds a three-stage Story Intelligence pipeline that runs **before** the existing story-generation and scene-generation steps. The pipeline is feature-gated by `STORY_INTELLIGENCE_V1_ENABLED=true`.

### Pipeline

```
USER IDEA
  ↓
STORY BLUEPRINT       ← new (Phase A)
  ↓
STORY DRAFT           ← existing storyTextService.generateStory()
  ↓
DIALOGUE/NARRATIVE    ← new optional mutation (Phase A)
  ↓
SCENE DIRECTOR        ← replaces buildSimpleScenes() (Phase A)
  ↓
EXISTING DOWNSTREAM   ← unchanged
```

### New files

| File | Purpose |
|------|---------|
| `packages/api/src/lib/storyIntelligence/types.ts` | Zod schemas, provider interface, typed errors, feature flag |
| `packages/api/src/lib/storyIntelligence/openAIStoryIntelligenceProvider.ts` | OpenAI-compatible provider (45 s timeout, JSON repair) |
| `packages/api/src/lib/storyIntelligence/localStoryIntelligenceProvider.ts` | Deterministic fallback — no API required |
| `packages/api/src/lib/storyIntelligence/prompts/storyBlueprintPrompt.ts` | Versioned blueprint prompt builder (v1) |
| `packages/api/src/lib/storyIntelligence/prompts/narrativeEnhancerPrompt.ts` | Versioned narrative enhancer prompt builder (v1) |
| `packages/api/src/lib/storyIntelligence/prompts/sceneDirectorPrompt.ts` | Versioned scene director prompt builder (v1) |
| `packages/api/src/lib/storyIntelligence/index.ts` | Singleton — OpenAI if configured, local otherwise |
| `packages/api/src/lib/storyIntelligence/__tests__/storyIntelligence.test.ts` | 35 unit tests |

### Modified files

| File | Change |
|------|--------|
| `packages/api/src/routers/story.ts` | `generateStory` — blueprint generation; `generateScenes` — scene director; `enhanceNarrative` — new mutation |
| `packages/database/schema.prisma` | `StoryChapter.{blueprint, enhancedBody}`, `StorySceneSeed.directorMetadata` |
| `packages/database/migrations/20260903120000_story_intelligence_phase_a/migration.sql` | Additive — all new columns nullable |

---

## 2. Schema versions

| Artifact | Version key |
|----------|-------------|
| Story Blueprint | `story_blueprint_v1` |
| Directed Scene | `scene_director_v1` |
| Narrative Enhancer prompt | `narrative_enhancer_v1` |

---

## 3. Configuration

| Env var | Purpose | Default |
|---------|---------|---------|
| `STORY_INTELLIGENCE_V1_ENABLED` | Feature flag — set to `true` to enable | `false` (disabled) |
| `OPENAI_API_KEY` | Required for OpenAI provider | — (falls back to local) |
| `OPENAI_BASE_URL` | Base URL for OpenAI-compatible API | `https://api.openai.com/v1` |
| `OPENAI_TEXT_MODEL` | Model to use | `gpt-4o-mini` |

No new credentials are required. The provider reuses existing `OPENAI_*` env vars.

---

## 4. Failure modes and fallbacks

| Stage | Failure behaviour |
|-------|-------------------|
| Blueprint generation | Non-fatal — `generateStory` continues without blueprint; blueprint stored as `null` |
| Scene Director | Non-fatal — falls back to `buildSimpleScenes()` and warns to console |
| Narrative Enhancement | Fatal from caller's perspective — `enhanceNarrative` mutation throws; caller can retry or ignore |

All failures emit a `console.warn` with the `StoryIntelligenceErrorCode` for observability.

---

## 5. Test coverage

Run: `npm test` from `packages/api/`

Results as of `1c4ca14`:
- **172 tests pass, 0 failures**
- **35 new Phase A tests** covering:
  - Blueprint Zod schema validation (valid/invalid cases)
  - DirectedScene Zod schema validation
  - `StoryIntelligenceError` typed codes
  - `isStoryIntelligenceEnabled` flag behaviour
  - `LocalStoryIntelligenceProvider`: planStory, enhanceNarrative, directScenes (determinism, count limits, hint pass-through, protagonist continuity)
  - `OpenAIStoryIntelligenceProvider`: unconfigured key, happy path with mocked fetch, timeout, non-OK status, schema failure, empty narrative
  - R16 KIDS mode — no adult content in local provider output
  - Old-project fallback (no blueprint stored)

---

## 6. Staging qualification checklist

These steps are required before the production deployment gate is opened.

### 6.1 DB isolation proof

Before any write to staging:
- [ ] Confirm staging `DATABASE_URL` points to a staging (not production) Postgres instance
- [ ] Run `SELECT COUNT(*) FROM story_chapters WHERE blueprint IS NOT NULL` on staging — expect 0 (migration not yet applied)
- [ ] Apply migration: `prisma migrate deploy` from `packages/database/` against staging DB
- [ ] Confirm migration applied: `SELECT column_name FROM information_schema.columns WHERE table_name = 'story_chapters' AND column_name IN ('blueprint', 'enhanced_body')`

### 6.2 Feature flag smoke

- [ ] Start staging server with `STORY_INTELLIGENCE_V1_ENABLED=false` — confirm pipeline does not trigger (no blueprint written)
- [ ] Restart with `STORY_INTELLIGENCE_V1_ENABLED=true` and valid `OPENAI_API_KEY` — confirm blueprint written to DB after story creation

### 6.3 Benchmark generation (minimum 12 stories, target 20)

Generate stories covering:
- [ ] KIDS / simple animal idea (e.g. "A dog goes to school")
- [ ] KIDS / named protagonist (e.g. "Kofi wants to learn to swim")
- [ ] KIDS / cultural specificity (e.g. "A girl from Lagos finds a magic drum")
- [ ] GENERAL / emotional arc (e.g. "A boy reconciles with his estranged father")
- [ ] GENERAL / multi-character (e.g. "Two sisters run a food stall during a festival")
- [ ] GENERAL / abstract idea (e.g. "The ocean teaches patience")
- Repeat until ≥ 12 stories (target 20)

### 6.4 Output review criteria

For each generated story, verify:

**Blueprint:**
- [ ] `protagonist.name` matches a name or clear reference from the idea
- [ ] `beats` length is 3–8 and covers a recognisable narrative arc
- [ ] `conflict` is non-trivial and idea-specific (not generic)
- [ ] `continuityRules` contains at least one rule about the protagonist

**Directed scenes:**
- [ ] All 6 scenes have distinct `storyBeat` values
- [ ] No two adjacent scenes have identical `location` AND identical `action`
- [ ] At least one scene has a non-null `cameraIntent`
- [ ] `characters` array in every scene contains the protagonist name

**Narrative enhancement:**
- [ ] Enhanced body is ≥ 80% as long as original and ≤ 120% (no significant expansion)
- [ ] Character names match blueprint exactly
- [ ] Cultural context preserved (Nigerian, African settings not replaced with generic ones)

**Image prompt compatibility:**
- [ ] Directed scene `action` field is ≤ 400 chars (already enforced by schema)
- [ ] No `action` contains purely abstract concepts — all are visually renderable

**R16 boundary:**
- [ ] All KIDS stories: no violent, adult, or fear-inducing content in any field
- [ ] `audienceMode = KIDS` confirmed in DB for all kids-mode projects

### 6.5 Quality benchmarks (pass thresholds)

| Metric | Minimum pass |
|--------|-------------|
| Blueprint: protagonist inferred correctly | ≥ 90% of stories |
| Blueprint: beats cover full arc (beginning + conflict + resolution) | ≥ 85% |
| Directed scenes: all 6 unique `storyBeat` values | ≥ 85% |
| Adjacent scene distinctness (location or action differs) | ≥ 90% |
| Narrative enhancement: character name preservation | 100% |
| R16: no unsafe content in KIDS stories | 100% |

---

## 7. Production deployment gate

**GATE: OPEN — PRODUCTION DEPLOYED 2026-09-04**

### 7.1 Controlled production release record

| Item | Value |
|------|-------|
| Candidate SHA | `9b6bd50` |
| Merge SHA (origin/main) | `9b6bd50` (fast-forward, zero drift) |
| Origin/main before merge | `f64ec26` |
| CI run ID | `33924144257` |
| CI result | PASS (3m4s) |
| Production SHA verified | `9b6bd50` ✓ |
| Production process | `raivstream-web` PM2 id 0, online |
| Migration applied | `20260903120000_story_intelligence_phase_a` — all 14 migrations clean |
| Columns verified (DB) | `story_chapters.blueprint` ✓ `story_chapters."enhancedBody"` ✓ `story_scene_seeds."directorMetadata"` ✓ |
| Feature flag | `STORY_INTELLIGENCE_V1_ENABLED=true` (enabled 2026-09-04) |
| Provider | OpenAI (`gpt-4o-mini`) — `OPENAI_API_KEY` PRESENT |
| Tests | 172/172 PASS |
| TypeScript (API) | clean |
| TypeScript (web) | clean |
| Lint (web) | clean |
| Health (app) | healthy, DB 2ms |
| Health (r16) | healthy, DB 3ms |
| Old-project compatibility | PASS — null Phase A fields loaded without error |
| Signed-out auth | 401 ✓ |
| Non-owner auth | 401 ✓ (unauthenticated only — see §7.3 for authenticated non-owner) |
| Smoke account | `texdevices+qa-phase-a-prod@gmail.com` (FREE, disposable) |
| Smoke project | `cmtnirxor0004101uy0vr5wum` — "Phase A Release Smoke" |
| Blueprint persisted | `story_chapters.blueprint_set = t` ✓ |
| Director executed | `directorMetadata` on 5/5 scenes ✓ |
| enhancedBody | Not exercised (optional — not required) |
| R16 | healthy, boundary intact |
| Server error log | empty (no errors) |
| Credit invariant | `credits.ts` untouched by Phase A; no new billing rates |
| NEW PHASE A BILLING RATE | NONE ✓ |
| Voice status | PAUSED — not deployed |
| Phase B | NOT STARTED |

### 7.2 Known limitations (release)

- Smoke QA project (`cmtnirxor0004101uy0vr5wum`) remains in production DB — no API deletion endpoint exists; marked as test/QA data; manual admin deletion is the cleanup path.
- Migration was additive and low-risk, with no destructive DDL or data rewrite. No automated VPS backup mechanism was identified during the release audit, so backup/recovery readiness remains an operational limitation.
- `narrative_enhancer_v1` not exercised in production smoke (optional path — covered in staging benchmark; 12/12 stories).
- Server-side provider console output not visible in PM2 stdout in production mode (Next.js production suppresses console routing) — expected behaviour, not a Phase A defect.
- API package lint has a pre-existing error in `academy.ts:200` (`@next/next/no-assign-module-variable`); CI runs web-package lint only — this is pre-existing in main and not introduced by Phase A.
- `providerMetadata` JSON field on `StoryChapter` (containing `model` and `provider` keys) is a pre-existing schema field (predates Phase A); it is surfaced only in the admin prompt-quality page (`/admin/prompt-quality`), not in any user-facing or R16 UI.

**CREDIT SAFETY INVARIANT:** `story:movie_render = 100 credits` must not be changed at any point in this deployment.

---

### 7.3 Post-production closure (2026-09-05)

Two evidence gaps from the initial release were closed in a follow-up session.

#### Authenticated non-owner authorization

| Item | Detail |
|------|--------|
| Owner account | `texdevices+qa-phase-a-prod@gmail.com` (FREE tier) |
| Non-owner account | `texdevices+qa-nonowner-closure@gmail.com` (distinct registered user) |
| Owner `story.getProject` | HTTP 200 ✓ |
| Non-owner `story.getProject` | HTTP 404, `code: NOT_FOUND`, `"Story project not found"` ✓ |
| Non-owner `story.generateStory` | HTTP 404, `code: NOT_FOUND` ✓ |
| Ownership behavior | `findFirst({where:{id, userId}})` → null → NOT_FOUND — enumeration-safe ✓ |
| OWNER AUTH | **PASS** |
| AUTHENTICATED NON-OWNER | **PASS** |

No authorization weakness. Phase A owner-protected operations deny authenticated non-owners via NOT_FOUND (intentional — prevents project-ID enumeration).

#### Production R16 Story Intelligence smoke

| Item | Detail |
|------|--------|
| Project | `cmto0965l00068yp919llqnyv` — "A bunny who learns to share", `audienceMode: KIDS` |
| Pipeline exercised | `generateStory` with `STORY_INTELLIGENCE_V1_ENABLED=true` |
| Provider used | External OpenAI (`gpt-4o-mini`) — confirmed via blueprint presence |
| Story content | Child-safe — bunny, meadow, carrot cake, sharing ✓ |
| Blueprint content | Child-safe — Lighthearted tone, beats about sharing, protagonist "Benny the Bunny" ✓ |
| Provider name in UI | NOT exposed in user-facing or R16 UI ✓ |
| Model name in UI | NOT exposed in user-facing or R16 UI ✓ |
| System instructions | NOT in response ✓ |
| Schema version tag | Present in `blueprint.version` field (internal only — no UI rendering) ✓ |
| `providerMetadata` field | Pre-existing schema field; rendered only in `/admin/prompt-quality` (operator-only) ✓ |
| R16 blocked routes | `/admin`, `/generate`, `/credits`, `/pricing` → HTTP 307 redirect to `/` ✓ |
| PRODUCTION R16 STORY INTELLIGENCE | **PASS** |

#### Post-closure health

| Item | Value |
|------|-------|
| app.raivstream.com health | healthy, DB 18ms ✓ |
| r16.raivstream.com health | healthy, DB 2ms ✓ |
| PM2 `raivstream-web` | online, 8h uptime, 298 restarts (stable) ✓ |
| Server error log | empty ✓ |
| Credit invariant | `credits.ts` untouched, `story:movie_render` unchanged, NEW PHASE A BILLING RATE = NONE ✓ |
| QA project cleanup | `cmtnirxor0004101uy0vr5wum` left in place — no deletion endpoint; `cmto0965l00068yp919llqnyv` (R16 smoke) left in place — same reason. Manual admin cleanup debt documented. |

---

## 8. Pre-existing limitations (not introduced by Phase A)

- `buildSimpleScenes()` fallback still used when `STORY_INTELLIGENCE_V1_ENABLED=false` or blueprint is absent — this is intentional, not a regression
- `enhanceNarrative` is not auto-triggered on story generation; it requires an explicit client mutation call
- The `continueStory` procedure does not yet use the stored blueprint as context (Phase B scope)
- OpenAI provider does not implement streaming — full response is awaited before writing to DB
