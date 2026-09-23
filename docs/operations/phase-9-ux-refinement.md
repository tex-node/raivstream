# Phase 9 — Mind-Reader UX Refinement + Reliability + Performance

**Status:** implementation complete (local); unit suite 546/546, API + web type-check clean, web lint clean.
**Scope:** make the existing Raivstream 5.0 system feel dramatically more intuitive — not bigger. No new product capability beyond reliability/observability hardening.

---

## 1. The four UX workstreams

### 1.1 Progressive disclosure

The creator sees one meaningful stage at a time; capability exists before the interface asks the creator to understand it.

- **Backend-derived stage** — `workspaceProgressFor()` in `packages/api/src/lib/creative/project/state.ts` maps the technical status to a single creator-facing stage (`UNDERSTAND → PLAN → PREVIEW → PRODUCE → REVIEW → DELIVER`) plus the completed stages and advanced-detail availability. `serializeProject` returns it as `project.workspace`, so the UI never guesses.
- **Workspace** — `apps/web/src/app/projects/[projectId]/page.tsx` reveals the next stage; the full Brief / Creative Bible / Versions moved under `AdvancedDetails` (collapsed). The sidebar (`ProjectSidebar.tsx`) is stage-aware and only shows reachable sections, with advanced items behind an "Advanced details" disclosure.
- A first-time storyteller sees: *Here's what I understand* → plan → preview → production → review. Bible / Characters / Worlds / Versions appear only when they exist and the creator asks for them.

### 1.2 Direct is the dominant interaction

`DirectorPanel.tsx` now opens with **"What would you like to change?"** and contextual example chips (`Make her more confident`, `Make the lighting warmer`, `Make this scene feel more expensive`, `Keep everything except the wardrobe`, `Make the ending more hopeful`).

The Director answers with **I'll change / I'll preserve / Impact / This affects N scenes** *before* anything regenerates — the mind-reader moment. Backed by:
- `director.propose` — interpret a directive with **no persistence** (the preview).
- `director.applyInstruction` — propose → snapshot a version → apply → mark only affected scenes for regeneration.

### 1.3 Closed Review → Director loop

`ReviewPanel.tsx`: **Finding → Raivstream understands the problem → proposed correction → impact → [Fix it]**. The creator never translates a critic finding into a production instruction.

- `review/criticAdapter.ts` attaches `suggestedFixInstruction`, `suggestedPreserves` and `suggestedImpact` to every finding (Director-ready).
- `[Fix it]` runs `director.propose` with the suggested instruction and shows the change/preserve/impact, then `[Apply change]` (`director.applyInstruction`) and `[Regenerate N affected scenes]`. `[Keep as is]` and `[Direct myself]` remain.

### 1.4 Production feels alive

`ProductionPanel.tsx` shows a **stage checklist** derived from real work — never a fake percentage:
```
Creating your film
✓ Understanding your story
✓ Building characters
✓ Planning scenes
✓ Creating Scene 1
● Checking continuity
○ Preparing your final cut
```
For longer runs: **Scene 4 of 8** plus real dimensions — *Character consistency* (stills ready), *Visual continuity* (clips ready), *Final assembly* (waiting/ready). Stage logic lives in `production/stages.ts` (`deriveProductionStages`), returned by `production.productionStatus`.

---

## 2. Context pipeline — "Raivstream remembered"

`production/contextAdapter.ts` turns the inherited Series/Studio context (already seeded into the Creative Bible/Brief at creation time) into a compact `ProductionContext`. The plan stores it as `contextSnapshot` (context snapshotting), and `capabilityRouter.routeProduction` appends a semantic context line to generation prompts. Series/Studio context now auto-drives prompts through the existing semantic adapters — the creator experiences memory, not prompt text.

---

## 3. Reliability hardening

New model `CreativeProductionRun` (migration `20260923120000_creative_production_run`) — a durable, resumable run record with `status`, `attempt`, `stage`, scene counts, `idempotencyKey`, `contextSnapshot`, `heartbeatAt`, `finishedAt`.

- **Idempotent operations** — `produce` never starts a second run while one is genuinely active.
- **Refinement production** — the first production still requires an approved preview, but after a directive the creator can regenerate affected scenes from `REVIEW`/`REFINING`/`DIRECTING` (the "Apply change → Regenerate N affected scenes" path).
- **Durable/resumable runs** — the runner creates/updates the run row and heartbeats after each asset; `runCreativeProduction` returns `{ generated, failed, runId, status }` (`COMPLETED | PARTIAL | FAILED`).
- **Bounded retry** — transient provider failures retry in-run (`DEFAULT_MAX_ATTEMPTS = 2`) without user action.
- **Retry only affected scenes** — `director.apply` deletes produced assets for affected scenes only; the resumable runner regenerates just those.
- **Safe recovery after restart** — `recoverStuckProductions` re-kicks GENERATING projects whose run heartbeat is stale (`STALE_RUN_MS = 5 min`) and that have no in-flight assets; active runs are left alone. Exposed as `creative.production.recover` (scoped to the caller's projects).
- **Approval-state consistency** — `project.updateStatus` enforces the state machine (`canTransition`); impossible transitions throw `INVALID_STATE_TRANSITION`.
- **Version/output provenance validation** — `output.derive` requires a version with a plan; `output.render` refuses to render once the source version is no longer approved.
- **Observability** — structured `[creative.production]` events (`run_started`, `asset_started`, `asset_ready`, `asset_failed`, `run_finished`) log safe metadata only (never prompts, story text, URLs or secrets).

**Timeout policy:** per-generation timeouts remain owned by the existing generation adapter's polling; the runner adds bounded retry on top.

---

## 4. Performance — measure first

`observability/metrics.ts` records latency and failures with an in-memory ring buffer + summary (count, failures, avg, p95, max). Instrumented labels: `intent.interpret`, `plan.build`, `production.produce`, `production.status`, `review.run`, `output.derive`, `output.render`. `FIRST_VISUAL` is logged when the first still is ready. Read via `creative.observability.metrics` / `.timings`.

The creator-perception metric to watch is **time to first meaningful visual**, not total generation time.

---

## 5. Verification

- `pnpm --filter @raivstream/api type-check` — clean
- `pnpm --filter @raivstream/api test` — **546/546** (16 new Phase 9 tests in `packages/api/src/lib/creative/__tests__/phase9.test.ts`)
- `pnpm --filter @raivstream/web type-check` — clean
- `pnpm --filter @raivstream/web lint --max-warnings=0` — clean

Not performed in this phase: production deployment, real-provider smoke, staging qualification. The migration is additive and must be deployed with `prisma migrate deploy` before the durable run endpoints are exercised.
