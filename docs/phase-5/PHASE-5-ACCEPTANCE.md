# Raivstream 5.0 — Phase 5 Acceptance Record
**Date:** 2026-10-08  
**Branch:** `main`  
**Status:** PENDING CONTROLLED LIVE ACCEPTANCE

---

## Phase 5 Scope

Review → Direct → Targeted Iteration: adds the missing creative loop.

```
PRODUCED ASSET → REVIEW → DIRECT → INTERPRET CHANGE
  → TARGETED REPLAN → TARGETED REPRODUCTION → REVIEW
```

---

## Gate Checklist

### A — Architecture audit (EXISTS/ADAPT/NEW)

- [x] Full EXISTS/ADAPT/NEW map produced before any code changes
- [x] EXISTS: All schema models (CreativeVersion, CreativeDirective, CreativeReviewRun, CreativeReviewResolution, CreativeApproval/INVALIDATED, CreativeOutput)
- [x] EXISTS: `director.{propose,applyInstruction,direct,explore,versions}` router + service
- [x] EXISTS: `review.{run,get,resolve}` router + service
- [x] EXISTS: `approval.{decide,list,invalidateProjectApprovals}` router + service
- [x] EXISTS: `interpretDirective` + `analyzeImpact` + `planSceneIds`
- [x] EXISTS: `snapshotVersion` (new version + invalidates approvals)
- [x] EXISTS: `apply()` deletes only affected scene assets (targeted regeneration)
- [x] EXISTS: `produce()` accepts REVIEW/DIRECTING/REFINING (targeted reproduction path)
- [x] EXISTS: `ReviewPanel.tsx` + `DirectorPanel.tsx` (full UI — propose + applyInstruction + produce)
- [x] EXISTS: Project page mounts both panels in correct states
- [x] ADAPT: `runner.ts:146` — pass `currentVersionId` to `creativeProducedAsset.create`
- [x] NEW: `CreativeProducedAsset.versionId String?` FK migration
- [x] NEW: Phase 5 test suite (26 tests in `phase5.test.ts`)
- [x] NEW: This acceptance document

### B — Schema migration (non-destructive)

- [x] `CreativeProducedAsset.versionId String?` added (nullable FK)
- [x] FK target: `CreativeVersion.id`, `ON DELETE SET NULL ON UPDATE CASCADE`
- [x] Back-relation `CreativeVersion.producedAssets CreativeProducedAsset[]` added
- [x] Index: `@@index([versionId])` added
- [x] Migration file: `20261008130000_phase5_produced_asset_version_id/migration.sql`
- [x] Migration SQL uses `IF NOT EXISTS` / `DO $$ BEGIN ... END $$` guards — additive only
- [x] `prisma validate` PASS
- [x] `prisma generate` PASS — client regenerated
- [x] No destructive changes; existing rows unaffected (column nullable)

### C — Runner ADAPT: versionId stamping

- [x] `runner.ts:146` updated: `creativeProducedAsset.create` now passes `versionId: project.currentVersionId ?? null`
- [x] New assets are stamped with the version active at production time
- [x] Existing READY assets (skipped by runner) retain their prior `versionId`
- [x] Targeted reproduction (after `applyInstruction`) produces new assets with the new version's `versionId`
- [x] TypeScript: `project.currentVersionId` is a scalar field — no explicit include required, returned by default

### D — Phase 5 tests

- [x] `packages/api/src/lib/creative/__tests__/phase5.test.ts` created (26 tests)
- [x] Coverage:
  - A: Directive interpretation (tests 1–8): single-scene LOCAL, all-scenes PROJECT, EXPLORE mode + count clamping, wardrobe CHARACTER scope, scene-index targeting, execution plan
  - B: Impact analysis (tests 9–13): normalization rules, NONE on empty, downstream message
  - B+: `planSceneIds` returns correct IDs, skips out-of-bounds
  - D: Review service types (tests 21–23): ReviewFinding fields, resolve kind contract, enum exclusions
  - E: Produced-asset version tracking (tests 24–26): versionId stamped on create, null when no currentVersionId, no duplicate for READY prior
  - F: Approval invalidation (tests 27–29): invalidate contract, INVALIDATED in enum, decide status set
  - G: End-to-end chain (tests 30–32): targeted deletion scope, new versionId on regenerated assets, REVIEW transition
- [x] All 26 tests PASS

### E — Regression

- [x] API tests: **1449 pass, 5 skipped, 0 fail** (75 test files, `packages/api`)
- [x] TypeScript — API: **0 errors** (`pnpm --filter @raivstream/api type-check`)
- [x] TypeScript — Web: **0 errors** (`pnpm --filter @raivstream/web type-check`)
- [ ] ESLint — API: pending
- [ ] ESLint — Web: pending
- [ ] Web tests: pending (no web test changes required; UI components pre-existing)

---

## Architecture decisions

### Why `versionId` is nullable

Assets created before Phase 5 deployed have no version association. Making `versionId` nullable means the migration is additive — zero downtime, zero backfill required. The runner now stamps new assets; old assets remain linked to their project but not to a specific version.

### Why the runner uses `project.currentVersionId` directly

`currentVersionId` is a scalar field on `CreativeProject` and is returned by `findUnique` without `include`. No query modification was needed. The value is set by `directorService.snapshotVersion` on every directive → it reflects the version active at production time.

### Why targeted deletion happens in `directorService.apply()`, not the runner

The runner is idempotent: it skips READY assets. Deleting targeted assets in `apply()` (before the runner runs) means the runner sees them as missing and regenerates them. This separation keeps the runner stateless with respect to which directive triggered the regeneration.

### Why `ReviewPanel` + `DirectorPanel` needed no changes

The Phase 5 UI loop was fully implemented in a prior sprint. `ReviewPanel` already chains `propose` → `applyInstruction` → `produce`. `DirectorPanel` already surfaces change/preserve/impact and triggers the same chain. Phase 5 completes the backend link (versionId stamping) and adds test coverage.

---

## Scope exclusions confirmed

- No audio, ElevenLabs, MiniMax music, final soundtrack
- No final assembly, FFmpeg output
- No Series, Episodes, Spinoffs, Campaigns
- No Studio workflows
- No new video/image providers
- No R16 middleware changes

---

## Controlled live acceptance — Pending

**Procedure (Gates A–H):**

### A — Deploy / Migration (pending)
- [ ] `git push origin main` triggers CI/CD deploy to VPS
- [ ] `prisma migrate deploy` applies `20261008130000_phase5_produced_asset_version_id`
- [ ] VPS health check: `/api/health` → `{"status":"ok"}`

### B — Fresh project in REVIEW state (pending)
- [ ] Authenticate as acceptance user
- [ ] Homer `interpret` → 3-scene story
- [ ] `generateAnimatic` → all frames READY
- [ ] `approveAnimatic` → project APPROVED, versionNumber=1
- [ ] `produce` → 8 assets READY, projectStatus=REVIEW
- [ ] All 8 assets have `versionId` = version 1 ID

### C — Review run (pending)
- [ ] `review.run` → at least 1 ReviewRun created, findings populated
- [ ] `review.get` → runs + resolution map returned
- [ ] Resolve one finding as FIX → `CreativeReviewResolution` created

### D — Director propose (pending)
- [ ] `director.propose` with instruction "Make scene 2 more tense" → decision returned (no DB write)
- [ ] Decision has `impact: 'LOCAL'`, `affectedSceneIndices: [1]`

### E — Apply instruction → new version (pending)
- [ ] `director.applyInstruction` with same instruction → new versionNumber=2 created
- [ ] `CreativeApproval` for versionNumber=1 status → INVALIDATED
- [ ] scene 2 IMAGE+VIDEO assets deleted (two rows removed from creative_produced_assets for sceneId=SCENE_02)
- [ ] scene 1, 3, … assets remain READY

### F — Targeted production (pending)
- [ ] `produce` called → runner runs
- [ ] Only 2 new assets created (SCENE_02 IMAGE + VIDEO)
- [ ] New assets have `versionId` = versionNumber=2 ID
- [ ] Unaffected scene assets retain `versionId` = versionNumber=1 ID
- [ ] projectStatus → REVIEW

### G — Review Version 2 (pending)
- [ ] `review.run` called on REVIEW assets → new ReviewRun created
- [ ] `review.get` → returns runs including both Version 1 and Version 2 runs

### H — Final reconciliation (pending)
- [ ] No credit double-charge: `applyInstruction` charges 0 credits; only `produce` charges (2 scenes × 2 kinds = 4 deductions)
- [ ] No orphan assets: total `creative_produced_assets` count = 8 (6 original + 2 new)
- [ ] Navigation: `/projects/${projectId}` loads correctly in REVIEW state
- [ ] Regression: API 1449/1449 PASS

---

## Final phase report

```
PHASE 5 IMPLEMENTATION:
A — Architecture audit (EXISTS/ADAPT/NEW):       PASS
B — Schema migration (versionId, non-destructive): PASS
C — Runner: versionId stamped on create:          PASS
D — Phase 5 tests (26 tests):                     PASS
E — Regression (1449 API pass, 0 fail):           PASS
F — TypeScript (API + Web, 0 errors):             PASS

CONTROLLED LIVE ACCEPTANCE:
A — Deploy / migration:           PENDING
B — REVIEW state, assets stamped: PENDING
C — Review run:                   PENDING
D — Director propose:             PENDING
E — Apply instruction, new version: PENDING
F — Targeted production:          PENDING
G — Review Version 2:             PENDING
H — Final reconciliation:         PENDING
```

**IMPLEMENTATION COMPLETE — AWAITING CONTROLLED LIVE ACCEPTANCE (Gates A–H)**
