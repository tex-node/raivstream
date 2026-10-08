# PHASE 4 AUTHORIZATION AND ARCHITECTURE

**Project:** Raivstream 5.0  
**Document type:** Architecture Gate — Pre-Implementation  
**Date:** 2026-10-08  
**Author:** Claude Sonnet 4.6 (architecture gate audit)  
**Status:** AWAITING AUTHORIZATION  

---

## 1. PHASE 3 STATE (BASELINE)

Phase 3 delivered a complete story-to-animatic pipeline, verified under production conditions on 2026-10-08.

### What Phase 3 built

- **Story Intelligence (Phase A):** Homer interpreter — `creative.homer.interpret` — consumes free-text story input and produces a structured `HomerStoryState` (premise, genre, tone, themes, entities, beats, structuralArc, threads, complexity, audienceMode). Gated by `isHomerInterpreterEnabled()`.

- **Animatic Generation (Phase B–C):** `creative.homer.generateAnimatic` extracts scenes from `HomerStoryState.beats`, calls `submitFrameGeneration()` per scene, stores `HomerAnimatic` + `HomerAnimaticFrame[]` in the database, and returns the animatic for display. `isFalImageEnabled()` gates FAL credit consumption (requires `FAL_MEDIA_PROVIDER_ENABLED + FAL_IMAGE_ENABLED + FAL_KEY`). The DB-only path (flag disabled) was verified in Condition B. Live FLUX-2 generation was verified in Condition C (3 credits, 3 first frames, visual continuity confirmed).

- **Phase 3 acceptance evidence:** `docs/operations/phase-3-browser-acceptance-b01-b20.md` (Conditions A–C PASS, 2026-10-08).

### What Phase 3 does NOT include

- Any connection between the approved animatic and a `CreativeProject` record.
- Any credit-spending production run.
- Any video generation.
- Any post-animatic UI beyond the animatic display on `/create`.

### Workspace stage achieved

`PREVIEW` — the third of six stages: UNDERSTAND → PLAN → **PREVIEW** → PRODUCE → REVIEW → DELIVER.

---

## 2. CREATOR JOURNEY — CURRENT END-TO-END

This is the verified creator journey as of Phase 3 completion. Every step is traced to actual code.

```
[/create page]
  1. Story input
       ConvStage: story_input
       Action: user types story text

  2. Homer interpret
       ConvStage: story_interpreting → story_understanding
       Procedure: creative.homer.interpret
       Output: HomerStoryState (beats, entities, themes, structuralArc)
       Storage: none (client state only)

  3. Homer direct
       ConvStage: story_directing
       Procedure: creative.homer.direct (no-op currently: client-state only)
       Action: user reviews/adjusts HomerCreativeDecision[]
       Storage: none (client state only)

  4. Animatic generate
       ConvStage: story_animatic
       Procedure: creative.homer.generateAnimatic
       Output: HomerAnimatic record + HomerAnimaticFrame[] records
       FAL: submitFalFlux2() per scene (when enabled)
       Storage: homerAnimatic + homerAnimaticFrame tables

  5. Animatic approve  ← PHASE 3 ENDS HERE
       Procedure: creative.homer.approveAnimatic
       DB effect: NONE (client gate only — returns { ok: true })
       Client effect: triggers createProject.mutate() + planMutation.mutateAsync()

[/projects/{id} — phase 3 navigates here but UI is incomplete]
  6. Project created
       Procedure: creative.project.create (inferred from approveAnimatic → createProject.mutate())
       Output: CreativeProject (status: IDEA)
       Storage: creativeProject table

  7. Production plan created
       Procedure: creative.production.plan
       Output: CreativeProductionPlan (status: PREVIEW), CreativeBible populated
       Storage: creativeProductionPlan, creativeBible tables

  8-12. PRODUCE → REVIEW → DELIVER
       Procedures: creative.production.produce, creative.review.run,
                   creative.director.applyInstruction, creative.approval.decide,
                   creative.output.derive + render
       Status: CODE EXISTS, UI NOT WIRED TO ANIMATIC, NOT IN CREATOR FLOW
```

---

## 3. POST-ANIMATIC CAPABILITY (WHAT ALREADY EXISTS)

The following systems are fully implemented in the API. They are not exposed to the creator after Phase 3 only because the animatic bridge is missing.

### 3.1 Production planning (`creative.production.plan`)

**File:** `packages/api/src/lib/creative/production/service.ts`  
**Method:** `plan(prisma, { projectId, userId })`  
**What it does:**
1. Reads `CreativeBible` for the project.
2. Calls `buildCreativePlan()` → produces `CreativeProductionPlanState` (scenes → shots, model assignments, duration estimates).
3. Calls `enrichCreativePlan()` → applies director preferences and available models.
4. Calls `buildPreview()` → creates preview thumbnails/metadata.
5. Persists `CreativeProductionPlan` with `status: 'PREVIEW'`.
6. Sets `CreativeProject.status = 'PREVIEW'`.

**Gap:** `buildCreativePlan` currently derives scenes from `CreativeBible.story` (HomerStoryState). It does not read approved `HomerAnimaticFrame.imageUrl` values as seed images for video generation shots. This is the primary bridge missing.

### 3.2 Production run (`creative.production.produce`)

**File:** `packages/api/src/lib/creative/production/service.ts`  
**Method:** `produce(prisma, { projectId, userId })`  
**What it does:**
1. Checks for an active `CreativeProductionRun` (prevents double-start).
2. Creates `CreativeProductionRun` with `status: 'RUNNING'`, `heartbeatAt` tracking.
3. Calls `runCreativeProduction()` **detached** (fire-and-forget).
4. `runCreativeProduction` generates `CreativeProducedAsset` records (kind: IMAGE or VIDEO) per scene/shot, calls model provider adapters.

**Credit boundary:** `produce()` is the explicit credit-spending trigger. Nothing before this call spends production credits.

**Supported models:** FLUX2, KLING_I2V, KLING_R2V, H3_MAX (image-to-video with `seedImageUrl`), SEEDANCE, VEO3, VEED_FABRIC, FLUX_KONTEXT.

### 3.3 Production status (`creative.production.productionStatus`)

**File:** `packages/api/src/routers/creative/production.ts`  
**What it returns:** `progressPercent`, `stage`, `stages[]`, `currentSceneIndex`, `images[]`, `videos[]`.  
**Polling pattern:** client polls this query while status is `RUNNING`.

### 3.4 Review (`creative.review.run`)

**File:** (review router)  
**What it does:** Evaluates `CreativeProducedAsset[]` where `status = 'READY'` and `kind = 'IMAGE'`. Creates `CreativeReviewRun` with findings. Used for quality gate before director loop.

### 3.5 Director loop (`creative.director.*`)

**Procedures:** `direct`, `propose`, `applyInstruction`, `explore`, `applyDirective`  
**What it does:** Applies `CreativeDirective` records (mode: DIRECT/EXPLORE/REVIEW, impact: CreativeImpactLevel) to `CreativeProducedAsset` or `CreativeBible`. Used to refine specific shots or adjust visual language after first generation.

### 3.6 Approval (`creative.approval.decide`)

**Kinds:** `CREATIVE` | `PRODUCTION` | `OUTPUT`  
**Statuses:** `PENDING` | `APPROVED` | `REJECTED` | `CHANGES_REQUESTED` | `INVALIDATED`  
**Note:** No current call creates a `CREATIVE` approval on animatic approval. This is a gap.

### 3.7 Output (`creative.output.derive + render`)

**What it does:** Assembles approved `CreativeProducedAsset[]` (videos + audio if present) into the final deliverable.

---

## 4. KEY ARCHITECTURAL GAP (ANIMATIC → PROJECT BRIDGE)

This is the single structural gap that blocks the creator from reaching PRODUCE.

### 4.1 `approveAnimatic` is a no-op

```typescript
// packages/api/src/routers/creative/homer.ts
approveAnimatic: creativeProcedure
  .input(z.object({ animaticId: z.string() }))
  .mutation(async ({ ctx, input }) => {
    // ← no DB write of any kind
    return { ok: true };
  })
```

The client calls this, then immediately calls `createProject.mutate()` and `planMutation.mutateAsync()` in the UI. The animatic's creative state (storyHash, HomerStoryState, HomerCreativeDecision[], approved frame imageUrls) is **never written to the project**.

### 4.2 `CreativeProject` has no link to `HomerAnimatic`

The Prisma schema has no field on `CreativeProject` or `CreativeBible` that references `HomerAnimatic.id`. The animatic floats as an orphan record after project creation.

### 4.3 `buildCreativePlan` does not read animatic frames

The production plan is built from `CreativeBible.story` (HomerStoryState beats). The approved `HomerAnimaticFrame.imageUrl` values — the validated visual anchors from Phase 3 — are not passed as `seedImageUrl` to the image-to-video shot specifications.

### 4.4 `HomerCreativeDecision[]` is never persisted

The directing decisions the creator makes on the animatic stage (HomerCreativeDecision[]) exist only in client state. `CreativeBible.visualLanguage` (which stores `directingDecisions`) is never populated from the animatic flow.

### 4.5 No `CREATIVE` approval record is created

The `CreativeApproval` table supports `kind: 'CREATIVE'`. Animatic approval is the canonical CREATIVE approval event. No record is created at approval time, so the approval trail is missing.

---

## 5. PHASE 4 SCOPE OPTIONS

Five options evaluated, ordered from minimal to maximal.

### Option A: Animatic Bridge Only (Micro)

**Scope:** Fix the animatic → project bridge (gap §4). No new user-facing features.

**Changes:**
1. `approveAnimatic` mutation: persist `HomerStoryState` → `CreativeBible.story` via `saveHomerState()`, persist `HomerCreativeDecision[]` → `CreativeBible.visualLanguage.directingDecisions`, create `CreativeApproval(kind: 'CREATIVE', status: 'APPROVED')`, store `animaticId` on project (new field or `CreativeBible` attachment).
2. `buildCreativePlan` / `enrichCreativePlan`: read approved animatic frames, set `shot.seedImageUrl` per scene.
3. No UI changes.

**Credits required:** 0 (plan only, no production run).  
**Verdict:** Necessary foundation — not sufficient on its own for a shippable creator experience.

---

### Option B: Bridge + Production Trigger (Recommended Minimum) ✅

**Scope:** Option A + surface the production plan and trigger to the creator on `/projects/{id}`.

**Changes (in addition to Option A):**
4. Project workspace page (`/projects/{id}`): show the production plan (scenes, shots, model assignments, estimated duration).
5. Expose a "Produce" button that calls `creative.production.produce`.
6. Poll `creative.production.productionStatus` while `status === 'RUNNING'`.
7. Display `CreativeProducedAsset[]` (images then videos) as they arrive.

**Credits required:** Variable (1 credit per video shot, model-dependent). Triggered explicitly by creator.  
**Verdict:** Smallest coherent path from PREVIEW → PRODUCE. Delivers demonstrable creator value. Recommended minimum for Phase 4.

---

### Option C: Bridge + Production + Review Loop

**Scope:** Option B + surface the review run and director loop.

**Changes (in addition to Option B):**
8. Trigger `creative.review.run` automatically after production completes.
9. Display `CreativeReviewRun` findings in the workspace.
10. Expose director instruction input (calls `creative.director.applyInstruction`).
11. Re-run affected shots after director changes.
12. `creative.approval.decide(kind: 'PRODUCTION')` to close the production loop.

**Credits required:** Additional credits per re-run shot.  
**Verdict:** Complete PRODUCE → REVIEW cycle. Natural next step after Option B is proven.

---

### Option D: Full DELIVER (Output Assembly)

**Scope:** Option C + final output derivation and delivery artifact.

**Changes (in addition to Option C):**
13. `creative.output.derive + render`: assemble approved assets into final video file.
14. `creative.approval.decide(kind: 'OUTPUT')` for final sign-off.
15. Download/share mechanism for the delivered file.

**Credits required:** Minimal (output assembly is compute, not generation).  
**Verdict:** Completes the full creator journey. Requires Option C to be stable first.

---

### Option E: Series / Episode Management

**Scope:** Extend Phase 4 to include Series creation from approved projects.

**Changes:** Series router is already implemented (`creative.series.*`). Adding series management to the creator workspace would allow episodic content planning.

**Verdict:** Premature. Complete single-episode flow first (Options B–D). Series adds complexity without validating the core loop.

---

## 6. RECOMMENDED PHASE 4 SCOPE

**Recommended:** Option B — Bridge + Production Trigger.

**Rationale:**

1. **Creator-first principle:** The creator has approved their story, directed their animatic, and seen their visual anchors. The natural continuation is to animate those frames into video. Every other capability (review loop, director changes, series) is predicated on having a first production run to react to.

2. **Validated visual anchors:** Phase 3 proved the animatic first-frames have quality and visual continuity. Using them as `seedImageUrl` for image-to-video generation (KLING_I2V / H3_MAX) directly applies that validation — the video extends what the creator already approved.

3. **Credit boundary is clean:** The existing `creative.production.produce` call is already the explicit credit-spend trigger. Option B requires no new credit boundary design.

4. **Smallest coherent feature:** Options A alone is invisible to the creator. Option B is the minimum that makes Phase 4 observable and testable.

5. **No new schema design required:** The bridge changes are targeted mutations and one new field. No table redesign, no migration complexity beyond adding `approvedAnimaticId` to `CreativeProject`.

6. **Review loop (Option C) is natural Phase 5:** After Phase 4, the creator can see their first production output. The review/director loop is most valuable when reacting to real output, which is why it belongs in Phase 5, not Phase 4.

---

## 7. CREATOR JOURNEY — TARGET (POST PHASE 4)

```
[/create page — unchanged from Phase 3]
  1-5. Story → Homer → Animatic → Approve   (Phase 3, no change)

[/projects/{id}]
  6.  Project created                         (Phase 3 flow, no change)
  7.  Animatic bridge                         ← NEW: approveAnimatic persists state
        - CreativeBible.story = HomerStoryState
        - CreativeBible.visualLanguage.directingDecisions = HomerCreativeDecision[]
        - CreativeApproval(kind: CREATIVE, status: APPROVED) created
        - CreativeProject.approvedAnimaticId = animaticId

  8.  Production plan                         ← ENHANCED: reads animatic seed images
        - creative.production.plan
        - shots include seedImageUrl from approved HomerAnimaticFrame.imageUrl
        - CreativeProductionPlan (status: PREVIEW) with frame anchors

  9.  Creator reviews plan                    ← NEW: workspace shows plan
        - Scene list, shot breakdown, model assignments
        - Estimated credit cost displayed

 10.  Creator triggers produce                ← NEW: explicit credit spend
        - creative.production.produce
        - CreativeProductionRun (status: RUNNING)

 11.  Production progress                     ← NEW: live polling
        - creative.production.productionStatus
        - CreativeProducedAsset[] appear as READY
        - Images shown first, then videos

 12.  DELIVER (Phase 5+)                      (out of scope for Phase 4)
```

---

## 8. APPROVAL SEMANTICS

The `CreativeApproval` table already defines the full approval chain:

| Kind | Trigger | Meaning |
|------|---------|---------|
| `CREATIVE` | Animatic approval | Creator accepts story + visual direction. Phase 4 bridge must write this. |
| `PRODUCTION` | Post-production review | Creator accepts generated video output. Phase 5 scope. |
| `OUTPUT` | Final delivery | Creator approves assembled deliverable for export. Phase 5+ scope. |

**Phase 4 creates:** One `CREATIVE` approval per project, written inside `approveAnimatic`.

---

## 9. PRODUCTION BOUNDARY

Phase 4 must not auto-trigger production. The creator explicitly presses "Produce" in the workspace UI. This maps directly to `creative.production.produce`.

No code path in Phase 4 calls `produce()` automatically. The production plan (`plan()`) is non-credit-spending and runs during the bridge step.

---

## 10. IMAGE-TO-VIDEO CONTINUITY

The approved `HomerAnimaticFrame.imageUrl` values are FLUX-2 images stored in R2 (`https://pub-c675f86280084efd8ae900212aae6f27.r2.dev/generated/fal/flux2/`). These are:

- Publicly accessible via R2 CDN URL.
- Already validated for visual continuity in Phase 3 (Condition C acceptance).
- Suitable as `seedImageUrl` for KLING_I2V and H3_MAX image-to-video models.

**Continuity chain:**  
`HomerAnimaticFrame.imageUrl` (Phase 3 FLUX-2) → `shot.seedImageUrl` in `CreativeProductionPlanState` → passed to `generateVideo(spec)` in `runCreativeProduction` → video output preserves visual identity from the approved animatic.

This is the core creative continuity mechanism of Phase 4.

---

## 11. R16 / KIDS SAFETY

All creative procedures use `creativeProcedure = t.procedure.use(isAuthed).use(isNotR16)`. The `isNotR16` middleware throws FORBIDDEN if `ctx.isR16 === true`. This gate applies to every procedure in the Phase 4 bridge:

- `creative.homer.approveAnimatic` ✓ (already gated)
- `creative.production.plan` ✓ (already gated)
- `creative.production.produce` ✓ (already gated)
- `creative.production.productionStatus` ✓ (already gated)

Phase 4 introduces no new procedure types. The R16 gate is inherited without any change required.

**KIDS mode:** No Phase 4 change needed. `audienceMode` in `HomerStoryState` flows through to `CreativeBible.story` via the bridge. Downstream content moderation already reads `audienceMode` from the bible.

---

## 12. REVIEW → DIRECT LOOP (PHASE 5 SCOPE)

The review and director loop is fully implemented in the API:

```
creative.review.run → CreativeReviewRun (findings)
creative.director.applyInstruction → CreativeDirective (mode: DIRECT)
creative.director.explore → CreativeDirective (mode: EXPLORE)
creative.director.applyDirective → apply change to CreativeProducedAsset
creative.approval.decide(kind: 'PRODUCTION') → close loop
```

Phase 4 **must not** expose these to the creator. They require first-pass production output to react to, which Phase 4 creates. Exposing the review loop before the creator has seen any output is premature.

The workspace UI in Phase 4 should show produced assets but offer no edit/director controls. Those land in Phase 5.

---

## 13. MISSING PIECES — CLASSIFICATION

Categorized from the Phase 3 → Phase 4 gap analysis:

### ALREADY EXISTS — no new code

| Capability | Location | Status |
|-----------|----------|--------|
| Production plan creation | `production/service.ts:plan()` | Exists, needs bridge input |
| Production run orchestration | `production/service.ts:produce() + runCreativeProduction()` | Exists, untouched |
| Production status polling | `production.ts:productionStatus` | Exists, untouched |
| KLING_I2V image-to-video | `generators/kling.ts` | Exists, untouched |
| H3_MAX image-to-video | `generators/h3max.ts` | Exists, untouched |
| CreativeApproval schema | `schema.prisma:CreativeApproval` | Exists, untouched |
| isNotR16 gate | `trpc.ts:isNotR16` | Exists, applies automatically |

### NEEDS ADAPTATION — existing code, targeted changes

| Capability | Location | Change |
|-----------|----------|--------|
| `approveAnimatic` mutation | `homer.ts:approveAnimatic` | Add DB writes (story, visualLanguage, approval) |
| `buildCreativePlan` | `production/plan.ts` | Read animatic seedImageUrl per scene |
| `enrichCreativePlan` | `production/plan.ts` | Accept pre-validated seed images; skip image generation for pre-approved scenes |
| Project workspace UI | `apps/web/src/app/projects/[id]/page.tsx` | Add plan view + produce button + status poll |

### GENUINELY NEW — net-new code

| Capability | Description |
|-----------|-------------|
| `CreativeProject.approvedAnimaticId` | New Prisma field linking project to its source animatic |
| Animatic seed propagation | Logic to resolve `HomerAnimaticFrame.imageUrl[]` by `sceneIndex` into plan shot specs |
| Production plan UI component | Scene/shot breakdown display in the workspace (read-only for Phase 4) |
| Produce gate UI | Budget estimate + explicit "Produce" button with confirmation |

---

## 14. PHASE 4 ACCEPTANCE CRITERIA

The following conditions define Phase 4 complete. Each maps to a verifiable browser acceptance test.

### C-01: Bridge persistence
- Creator approves animatic on `/create`.
- DB: `CreativeBible.story` = non-null HomerStoryState.
- DB: `CreativeBible.visualLanguage.directingDecisions` = non-null array.
- DB: `CreativeApproval` row exists (kind: CREATIVE, status: APPROVED).
- DB: `CreativeProject.approvedAnimaticId` = approved animaticId.
- FAL credits consumed: 0.

### C-02: Production plan with seed images
- After bridge: `creative.production.plan` completes.
- DB: `CreativeProductionPlan` exists with non-null `plan` JSON.
- Plan JSON: each scene's primary shot has `seedImageUrl` = corresponding `HomerAnimaticFrame.imageUrl`.
- FAL credits consumed: 0.

### C-03: Production trigger
- Creator navigates to `/projects/{id}`, sees plan.
- Creator presses "Produce".
- DB: `CreativeProductionRun` row created (status: RUNNING).
- DB: `CreativeProject.status` transitions from PREVIEW → GENERATING.
- FAL credits consumed: per model (authorized separately).

### C-04: Production assets appear
- `creative.production.productionStatus` returns `progressPercent > 0`.
- At least one `CreativeProducedAsset` reaches `status: READY`.
- Workspace UI displays the asset.

### C-05: Production completes
- All shots reach READY or FAILED.
- `CreativeProductionRun.status` transitions to COMPLETED or PARTIAL.
- `CreativeProject.status` transitions to REVIEW.

### C-06: Navigation persistence
- Creator refreshes `/projects/{id}` mid-production.
- Production status and assets are preserved from DB.
- No re-trigger of production.

### C-07: Regression
- `pnpm test` passes (74+ test files, 0 failures).
- `pnpm tsc --noEmit` passes (0 errors).
- `pnpm lint` passes (0 errors, ignoring React version warning).

### C-08: R16 safety
- With `isR16: true` context: `approveAnimatic`, `plan`, `produce` all return 403 FORBIDDEN.
- No credits consumed in R16 context.

---

## 15. SCHEMA CHANGES REQUIRED

Exactly one new field. No table additions, no migrations beyond this.

```prisma
// packages/database/prisma/schema.prisma
model CreativeProject {
  // ... existing fields ...
  approvedAnimaticId  String?          // NEW: links to HomerAnimatic.id
  approvedAnimatic    HomerAnimatic?   @relation(fields: [approvedAnimaticId], references: [id])
}

model HomerAnimatic {
  // ... existing fields ...
  approvedByProjects  CreativeProject[]  // NEW: back-relation
}
```

**Migration:** `ALTER TABLE "CreativeProject" ADD COLUMN "approvedAnimaticId" TEXT REFERENCES "HomerAnimatic"("id")` — non-breaking, nullable, no data migration needed.

---

## 16. API CHANGES REQUIRED

### 16.1 `creative.homer.approveAnimatic` (adaptation)

Current: returns `{ ok: true }` with no DB writes.  
Phase 4: adds these DB writes in order:

```typescript
// 1. Save story state to CreativeBible
await saveHomerState(prisma, { projectId, userId, state: homerState });

// 2. Save directing decisions to visualLanguage
await saveDirectingDecisions(prisma, { projectId, decisions });

// 3. Create CREATIVE approval record
await prisma.creativeApproval.create({
  data: { projectId, kind: 'CREATIVE', status: 'APPROVED', decidedBy: ctx.userId }
});

// 4. Link animaticId to project
await prisma.creativeProject.update({
  where: { id: projectId },
  data: { approvedAnimaticId: input.animaticId }
});
```

**Note:** `approveAnimatic` currently takes only `animaticId`. It needs `projectId` added to its input. The client already has `projectId` at approval time (from the `createProject.mutate()` that follows).

**Sequencing:** The current client flow calls `approveAnimatic` then `createProject.mutate()`. This must be reversed: project creation first, then `approveAnimatic` with `projectId`. Or `approveAnimatic` creates the project internally. The cleaner design is: `approveAnimatic` creates the project + plan atomically, eliminating the two-step client call.

### 16.2 `buildCreativePlan` (adaptation)

Current: derives scenes from `CreativeBible.story.beats`.  
Phase 4: after plan scenes are derived, reads `HomerAnimaticFrame[]` by `animaticId` from `CreativeProject.approvedAnimaticId`, maps each `HomerAnimaticFrame.imageUrl` by `sceneIndex` to the corresponding plan scene's primary shot `seedImageUrl`.

### 16.3 No other API changes required.

---

## 17. UI CHANGES REQUIRED

### 17.1 `/create` page — `approveAnimatic` call sequencing

The current flow on animatic approve:
```
approveAnimatic(animaticId) → createProject.mutate() → planMutation.mutateAsync() → navigate
```

Phase 4 flow:
```
approveAnimatic(animaticId) → navigate to /projects/{id}
  (approveAnimatic creates project + plan atomically server-side)
```

This simplifies the client: one mutation, one navigation.

### 17.2 `/projects/{id}` workspace — production plan display

New section: "Production Plan"
- Scene list with shot breakdown.
- Per-shot: visual prompt, model assignment, estimated duration.
- Seed image thumbnail from approved animatic frame (where available).
- Total estimated credit cost.
- "Produce" button (disabled until plan loads; requires confirmation modal with credit cost).

### 17.3 `/projects/{id}` workspace — production progress

New section: "Production" (appears after "Produce" is pressed)
- Progress bar from `productionStatus.progressPercent`.
- Scene-by-scene status indicators (QUEUED / GENERATING / READY / FAILED).
- Produced assets displayed as they reach READY (images and videos).

### 17.4 No changes to any other page.

---

## 18. WHAT PHASE 4 MUST NOT TOUCH

These systems are verified stable and outside Phase 4 scope. Any change to them requires a separate authorization.

| System | Location | Reason |
|--------|----------|--------|
| Homer interpreter | `lib/homer/interpreter.ts` | Phase 3 validated, no change |
| Animatic service | `lib/homer/animaticService.ts` | Phase 3 validated, no change |
| FAL Flux-2 generator | `lib/generators/falFlux2.ts` | Phase 3 validated, no change |
| MovieDirector | `lib/director/movieDirector.ts` | Not in scope |
| Video generation models | `lib/generators/kling.ts`, `h3max.ts`, etc. | Read only (for seedImageUrl passing); no logic change |
| Audio / ElevenLabs | `lib/audio/` | Phase 5+ |
| MiniMax | `lib/generators/minimax.ts` | Phase 5+ |
| Series router | `routers/creative/series.ts` | Phase 5+ |
| Review router | `routers/creative/review.ts` | Phase 5 scope |
| Director router | `routers/creative/director.ts` | Phase 5 scope |
| Output router | `routers/creative/output.ts` | Phase 5+ |
| Moderation | `lib/moderation/` | No change |
| Pricing / credits | `lib/billing/` | No change |
| R16 / KIDS middleware | `trpc.ts:isNotR16` | No change (inherited) |
| Export system | `lib/export/` | Phase 5+ |
| Provider adapters | `lib/providers/` | No change |
| CI/CD pipeline | `.github/workflows/` | No change |

---

## 19. DEPENDENCY GRAPH

```
Phase 3 (COMPLETE)
  └─ Animatic: HomerAnimatic + HomerAnimaticFrame (approved, imageUrls in R2)

Phase 4A — Bridge (prerequisite for all)
  ├─ approveAnimatic → creates CreativeProject, CreativeBible, CreativeApproval
  └─ schema: CreativeProject.approvedAnimaticId

Phase 4B — Plan enrichment (requires 4A)
  └─ buildCreativePlan reads animatic frames → shot.seedImageUrl

Phase 4C — UI: plan display (requires 4B)
  └─ /projects/{id}: shows plan with seed image thumbnails + credit estimate

Phase 4D — UI: produce trigger (requires 4C)
  └─ /projects/{id}: "Produce" button → creative.production.produce

Phase 4E — UI: progress + assets (requires 4D)
  └─ /projects/{id}: status poll + asset display

Phase 5 (out of scope)
  ├─ Review run + director loop
  ├─ Production approval (kind: PRODUCTION)
  ├─ Output derivation + render
  └─ Series / episodes
```

---

## 20. CREDIT MODEL

| Step | Credits | Gate |
|------|---------|------|
| `approveAnimatic` (bridge) | 0 | Non-credit |
| `creative.production.plan` | 0 | Non-credit |
| Creator reviews plan | 0 | Non-credit |
| `creative.production.produce` | Variable | **Explicit creator action** — credit boundary |
| Per KLING_I2V shot | ~1–2 credits | Consumed inside `runCreativeProduction` |
| Per H3_MAX shot | TBD by model pricing | Consumed inside `runCreativeProduction` |

**Credit disclosure:** The workspace UI must display the total estimated credit cost before the creator presses "Produce". The confirmation modal shows this cost and requires explicit acknowledgement.

---

## 21. RISK REGISTER

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `approveAnimatic` atomicity failure mid-write | Low | Wrap all DB writes in a Prisma transaction |
| `HomerAnimaticFrame.imageUrl` null (generation failed) | Possible | `enrichCreativePlan` must handle null seedImageUrl gracefully — fall back to text-to-video without seed |
| KLING_I2V rejects R2 CDN URL as seed | Unknown | Test in Phase 4 Condition A acceptance; fall back to FLUX_KONTEXT if rejected |
| Production run starts before plan is ready | Prevented | `produce()` already checks for PREVIEW status; plan must complete first |
| Double-click "Produce" double-starts run | Handled | `produce()` already checks for active `CreativeProductionRun`; returns existing run |
| Large plan exceeds Prisma JSON column limits | Low | Plans are bounded by scene count (typically 3–6); not a practical concern |
| `approvedAnimaticId` FK constraint fails on delete | Low | Use `onDelete: SetNull` on the relation; project survives animatic deletion |

---

## 22. PHASE 4 IMPLEMENTATION SLICES (ORDERED)

Ordered by dependency. Each slice is independently testable.

```
Slice 1 — Schema migration
  File: packages/database/prisma/schema.prisma
  Change: Add CreativeProject.approvedAnimaticId (nullable String)
  Migration: non-breaking ALTER TABLE

Slice 2 — approveAnimatic bridge
  File: packages/api/src/routers/creative/homer.ts
  Change: approveAnimatic mutation writes to CreativeBible, CreativeApproval, CreativeProject
  Test: Condition C-01

Slice 3 — Plan seed enrichment
  File: packages/api/src/lib/creative/production/plan.ts
  Change: buildCreativePlan/enrichCreativePlan reads animaticFrames, sets seedImageUrl
  Test: Condition C-02

Slice 4 — /create page mutation resequencing
  File: apps/web/src/app/create/page.tsx
  Change: approveAnimatic creates project atomically; client calls one mutation
  Test: Condition C-01 (UI path)

Slice 5 — Workspace: plan display
  File: apps/web/src/app/projects/[id]/page.tsx
  Change: Add plan section (scenes, shots, seed thumbnails, credit estimate)
  Test: Visual verification

Slice 6 — Workspace: produce trigger
  File: apps/web/src/app/projects/[id]/page.tsx
  Change: Add "Produce" button + confirmation modal
  Test: Condition C-03

Slice 7 — Workspace: production progress
  File: apps/web/src/app/projects/[id]/page.tsx
  Change: Add status poll + asset display
  Test: Conditions C-04, C-05, C-06

Slice 8 — Regression
  Command: pnpm test && pnpm tsc --noEmit && pnpm lint
  Test: Condition C-07

Slice 9 — R16 safety verification
  Method: API call with R16 context on all Phase 4 procedures
  Test: Condition C-08
```

---

## 23. PHASE 4 AUTHORIZATION REQUEST

**Phase 4 name:** Animatic-Anchored Production  
**Workspace stage delivered:** PREVIEW → PRODUCE  
**Recommended scope:** Option B (Bridge + Production Trigger)  

**Summary of changes:**
- 1 Prisma schema field (`approvedAnimaticId`)
- 1 mutation adaptation (`approveAnimatic` — adds DB writes)
- 1 plan enrichment adaptation (`buildCreativePlan` — reads seed images)
- 1 UI page adaptation (`/create` — mutation resequencing)
- 1 UI page addition (`/projects/{id}` — plan view + produce trigger + progress)

**Code changes:** 5 files (2 API, 1 schema, 2 UI)  
**New tables:** 0  
**Credits required for implementation:** 0  
**Credits consumed at runtime:** Per production run (variable, gated by explicit creator action)  
**Deployment required:** Yes (standard PM2 restart + Prisma migration)  

**What Phase 4 does NOT deliver:**
- Review loop (Phase 5)
- Director changes (Phase 5)
- Output assembly / delivery (Phase 5+)
- Audio / voice (separate phase)
- Series / episodes (separate phase)

**Hard constraints carried forward:**
- Do not modify MovieDirector, Homer interpreter, animaticService, FAL generators, audio, MiniMax, ElevenLabs, Series, export, provider adapters, moderation, pricing, R16/KIDS middleware.
- Do not deploy without authorization.
- Do not generate production assets during implementation.
- Do not begin Phase 5 (Review → Direct loop) without separate authorization.

---

*Document complete. Awaiting Phase 4 implementation authorization.*
