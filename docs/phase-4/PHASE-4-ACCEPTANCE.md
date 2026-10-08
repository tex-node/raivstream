# Raivstream 5.0 — Phase 4 Acceptance Record
**Date:** 2026-10-08  
**Branch:** `main`  
**Commit:** `61b01cb`  
**Status:** PHASE 4 COMPLETE — GATE A–L PASS

---

## Phase 4 Scope

Animatic → Production Bridge: connects an approved Homer animatic to a real
`CreativeProject` with atomic persistence and enriched production plan seeds.

---

## Gate Checklist

### A — Schema migration (non-destructive)

- [x] `CreativeProject.approvedAnimaticId String?` added (nullable FK)
- [x] FK target: `HomerAnimatic.id`, `ON DELETE SET NULL ON UPDATE CASCADE`
- [x] Back-relation `HomerAnimatic.approvedByProjects CreativeProject[]` added
- [x] Migration file: `20261008120000_phase4_approved_animatic_id/migration.sql`
- [x] Migration SQL uses `IF NOT EXISTS` guards — additive only
- [x] `prisma validate` PASS
- [x] `prisma generate` PASS — client regenerated
- [x] No destructive changes; existing rows unaffected

### B — `PlanShot.seedImageUrl`

- [x] `PlanShot.seedImageUrl?: string` added to interface
- [x] `buildCreativePlan` accepts `animaticSeeds?: Array<{ sceneIndex: number; imageUrl: string | null }>`
- [x] Seeds are applied to the primary shot (shotIndex 0) of each scene by `sceneIndex` index
- [x] Non-seeded shots unaffected
- [x] `animaticSeeds` is optional — all existing callers are unchanged

### C — `plan()` service enrichment

- [x] `plan()` reads `project.approvedAnimaticId` after project fetch
- [x] If set, fetches `HomerAnimaticFrame[]` ordered by `sceneIndex ASC`
- [x] Passes frames as `animaticSeeds` to `buildCreativePlan`
- [x] Enrichment is conditional — projects without `approvedAnimaticId` are unaffected
- [x] Duplicate generation: no — seed is read-only reference to existing FAL-generated image URL

### D — `approveAnimatic` real persistence

- [x] Input extended: `animaticId`, `projectId`, `storyState`, `decisions`
- [x] Animatic ownership verified: `homerAnimatic.findFirst({ userId })`
- [x] Project ownership verified: `creativeProject.findFirst({ userId })`
- [x] Idempotency: if `project.approvedAnimaticId === animaticId`, returns early
- [x] `$transaction` atomicity:
  - `saveHomerState` → persists HomerStoryState to `CreativeBible.story`
  - `saveDirectingDecisions` → persists decisions to `CreativeBible.visualLanguage.directingDecisions`
  - `creativeProject.update({ approvedAnimaticId })` → links animatic
  - `creativeVersion.create({ versionNumber: 1 })` → required for approval FK
  - `creativeApproval.create({ kind: CREATIVE, status: APPROVED })` → gate record
- [x] Returns `{ ok: true, animaticId, projectId }`
- [x] `creativeProcedure` (isAuthed + isNotR16) — R16 safety untouched

### E — `/create` page wiring

- [x] `pendingAnimaticApprovalRef` added (stores animatic approval data between mutations)
- [x] `handleAnimaticApprove`:
  - No animatic → original `createProject.mutate()` flow unchanged
  - With animatic → sets `pendingAnimaticApprovalRef`, then calls `createProject.mutate()`
- [x] `createProject.onSuccess`:
  - If `pendingAnimaticApprovalRef.current` set → calls `approveAnimaticMutation.mutate({ animaticId, projectId, storyState, decisions })` and returns
  - Otherwise → original upload + plan + navigate flow unchanged
- [x] `approveAnimaticMutation.onSuccess` → clears draft, navigates to `/projects/${data.projectId}`
- [x] `starting` already includes `approveAnimaticMutation.isPending` — UI loading state correct
- [x] No race condition: project is always created before `approveAnimatic` is called

### F — Regression

- [x] API tests: **1423 pass, 5 skipped, 0 fail** (vitest run)
- [x] Web tests: **69 pass, 0 fail** (vitest run)
- [x] TypeScript — API: **0 errors**
- [x] TypeScript — Web: **0 errors**
- [x] ESLint — API: **0 errors** (`pnpm --filter @raivstream/api lint`)
- [x] ESLint — Web: **0 errors** (`pnpm --filter @raivstream/web lint`)
- [x] Existing `buildCreativePlan` callers unmodified (parameter is optional)
- [x] Existing `plan()` service behavior unmodified for non-Homer projects
- [x] `produce()` gate unchanged: still requires APPROVED status
- [x] R16 middleware (`isNotR16` on `creativeProcedure`): untouched

---

## Architecture decisions

### Why `createProject` first, then `approveAnimatic`

The approval step links an animatic to an existing project. Creating the project
first preserves the existing `createFromIntent` → `saveHomerState` →
`saveDirectingDecisions` flow, and the `approveAnimatic` transaction adds the
version + approval + animaticId link atomically on top. If `approveAnimatic`
fails, the project exists but is unlocked — the workspace re-approval flow
(existing "Approve" button) can recover without data loss.

### Why `pendingAnimaticApprovalRef` (not mutation chain in onSuccess)

React mutation `onSuccess` closures capture refs at call time. Using a ref to
carry the animatic approval data from the click handler through to
`createProject.onSuccess` avoids circular closure captures and keeps each
mutation's `onSuccess` single-purpose.

### Why seedImageUrl on primary shot only (shotIndex 0)

The animatic's approved first frame is the visual anchor for I2V generation.
Seeding all shots in a scene with the same image would force all shots to start
from the same frame, defeating continuity (each subsequent shot should evolve
from the previous shot's last frame, not the scene's first frame).

---

## Scope exclusions confirmed

- No review loop
- No Director post-production changes
- No output assembly, audio, music, series
- No MovieDirector redesign or Homer interpreter redesign
- No new video/image providers
- No FAL/moderation/pricing/R16 middleware redesign
- No new production architecture
- Production stack reused without modification

---

## Controlled live production acceptance — Results

**Acceptance date:** 2026-10-08  
**Acceptance user:** `b08acceptance@test.raivstream.com`  
**VPS commit at acceptance:** `61b01cb`

### G — Deploy / Migration

- [x] `git push origin main` triggered CI/CD Deploy to VPS
- [x] `prisma migrate deploy` applied `20261008120000_phase4_approved_animatic_id`
- [x] Migration additive only: `ALTER TABLE … ADD COLUMN IF NOT EXISTS "approvedAnimaticId" TEXT` + FK + index
- [x] VPS health check: `/api/health` → `{"status":"ok"}` post-deploy
- [x] Schema client regenerated on VPS; no runtime errors

### H — Fresh Homer Project → Animatic

- [x] Authenticated as acceptance user via `/api/auth/refresh`
- [x] Homer `interpret` → 3-beat story (STORY type)
- [x] `generateAnimatic` → animatic `cmuzamf120002jxbt7pwvl7yf`
- [x] `getAnimaticState` polled → all 3 frames READY, `imageUrl` populated (R2 CDN)
- [x] Project created: `cmuzaoi6g0009jxbt6vla6jzl`, status PREVIEW

### I — Animatic Approval (DB persistence)

- [x] `approveAnimatic({ animaticId, projectId, storyState, decisions })` called
- [x] Returns `{ ok: true, animaticId, projectId }`
- [x] DB verified: `creative_projects.approvedAnimaticId = 'cmuzamf120002jxbt7pwvl7yf'`
- [x] DB verified: `creative_versions` row with `versionNumber=1`, label `'Creative direction — animatic approved'`
- [x] DB verified: `creative_approvals` row with `kind='CREATIVE'`, `status='APPROVED'`
- [x] DB verified: `creative_bibles` has `story` (HomerStoryState) and `visualLanguage.directingDecisions`
- [x] Idempotency: second `approveAnimatic` call with same animaticId returned early without re-running transaction

### J — Plan Seeds from Animatic Frames

- [x] `creative.production.plan` called → plan returned with seedImageUrls populated
- [x] SCENE_01 shot0 `seedImageUrl` = R2 CDN frame 0 image URL ✓
- [x] SCENE_02 shot0 `seedImageUrl` = R2 CDN frame 1 image URL ✓
- [x] SCENE_03 shot0 `seedImageUrl` = R2 CDN frame 2 image URL ✓
- [x] SCENE_04 shot0 `seedImageUrl` = null (correct — animatic had 3 frames, not 4) ✓
- [x] Non-primary shots (shotIndex > 0) have no `seedImageUrl` ✓

### K — Explicit Produce

- [x] Project transitioned PREVIEW → APPROVED (existing approval gate, untouched)
- [x] `creative.production.produce` called → run `cmuzaqotc000mjxbtvkdbkrvl` started
- [x] `productionStatus` polled → `projectStatus: GENERATING` confirmed production running
- [x] `productionStatus` polled → `projectStatus: REVIEW`, `runStatus: COMPLETED`
- [x] 8 assets produced: 1 IMAGE + 1 VIDEO per scene × 4 scenes, all `status: READY`
- [x] Provider: `internal` — existing production stack (no new architecture) ✓

### L — Final Reconciliation

- [x] **Credit reconciliation:** `approveAnimatic` charges 0 credits (pure DB transaction, verified by code review — no calls to `deductCredits`/`reserveCredits`). Production charges once per scene×kind via `runner.ts:193`. 4 IMAGE (FLUX2) + 4 VIDEO (H3_MAX) = 8 deductions. No double-charge.
- [x] **No duplicate production runs:** single `runId: cmuzaqotc000mjxbtvkdbkrvl`, 8 assets each with unique `id` and distinct `sceneId+kind` combination.
- [x] **Navigation persistence:** `/projects/cmuzaoi6g0009jxbt6vla6jzl` loads correctly post-production; workspace shows REVIEW status and COMPLETED run.
- [x] **Safety/R16 boundaries:** `approveAnimatic` and `plan`/`produce` all gated by `creativeProcedure` (`isAuthed` + `isNotR16`). No changes to R16 middleware or guard logic. R16 check untouched.
- [x] **Regression — API:** 1423 pass, 5 skipped, 0 fail (74 test files, `packages/api`)
- [x] **Regression — Web:** 69 pass, 0 fail (3 test files, `apps/web`)

---

## Final phase report

```
PHASE 4 GATES:
A — Schema migration (non-destructive):   PASS
B — PlanShot.seedImageUrl:                PASS
C — plan() enrichment:                    PASS
D — approveAnimatic persistence:          PASS
E — /create page wiring:                  PASS
F — Regression (1492 total):              PASS

LIVE ACCEPTANCE (2026-10-08):
G — Deploy / migration applied to VPS:    PASS
H — Fresh Homer project, 3 READY frames:  PASS
I — Animatic approval, DB verified:       PASS
J — Plan seeds from animatic frames:      PASS
K — Explicit Produce → 8 assets READY:   PASS
L — Reconciliation, regression 1492/1492: PASS
```

**PHASE 4 COMPLETE — GATE A–L PASS — AWAITING EXPLICIT AUTHORIZATION FOR PHASE 5.**
