# Raivstream 5.0 — Phase 4 Acceptance Record
**Date:** 2026-10-08  
**Branch:** `main`  
**Commit:** `9b5e25c`  
**Status:** CODE COMPLETE — AWAITING CONTROLLED LIVE PRODUCTION ACCEPTANCE

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

## Pending: controlled live production acceptance

**Required before PHASE 4 COMPLETE declaration:**

1. Push to `origin/main` (CI/CD triggers)
2. On VPS: `prisma migrate deploy` applies `20261008120000_phase4_approved_animatic_id`
3. Fresh project via Homer → animatic → approve → verify in workspace:
   - `creative_projects.approvedAnimaticId` is set in DB
   - `creative_approvals` row with `kind='CREATIVE'`, `status='APPROVED'` exists
   - `creative_versions` row exists with `versionNumber=1`
   - Plan built → `plan.scenes[*].shots[0].seedImageUrl` populated from animatic frames
   - Project reaches PREVIEW → creator approves → APPROVED → Produce
4. Credit reconciliation: verify no unexpected charges during approval step
5. Produce one project: verify all assets generated, no duplicate generation

**Stop conditions (per authorization):**
- Migration requires destructive changes → STOP (not applicable — migration is additive)
- Approval cannot be made atomic → STOP (not applicable — `$transaction` confirmed)
- Existing production stack cannot consume animatic seeds → STOP (verify at acceptance step 3)
- Production cost is unclear → STOP (verify at acceptance step 4)
- Duplicate generation → STOP (verify at acceptance step 5)

---

## Final phase report format (to be filled at controlled acceptance)

```
PHASE 4 GATES:
A — Schema migration: PASS
B — PlanShot.seedImageUrl: PASS
C — plan() enrichment: PASS
D — approveAnimatic persistence: PASS
E — /create page wiring: PASS
F — Regression: PASS

LIVE ACCEPTANCE:
G — Migration applied to VPS: [PENDING]
H — Animatic → project link verified in DB: [PENDING]
I — Plan seeds populated from animatic frames: [PENDING]
J — PREVIEW → APPROVED → Produce flow: [PENDING]
K — Credit reconciliation: [PENDING]
L — No duplicate generation: [PENDING]

PHASE 4 COMPLETE — A/B/C/D/E/F/G/H/I/J/K/L PASS — AWAITING EXPLICIT AUTHORIZATION FOR PHASE 5.
```
