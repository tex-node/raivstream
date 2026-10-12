# Phase 0 — Candidate & Architecture Verification (READ-ONLY baseline)

**Date:** 2026-10-12
**Repo root:** `C:\Raiv\raivstream` (git `C:\Raiv\raivstream`; remote `tex-node/raivstream`)
**Method:** read-only (`git`, file reads, `gh`). No tracked file modified; no DB/Prisma write; no provider call.
**Verdicts:** VERIFIED (file:line) · NOT LOCATED (patterns listed) · CONTRADICTED (session.md vs tree).

> Working-directory note: the shell's cwd is `C:\UltraLeagueOS` (a *different* repo, `tex-node/ultraOS`). All findings are for `C:\Raiv\raivstream`.

---

## 1. Candidate provenance (session.md vs tree)

| session.md claim | Tree reality | Verdict |
|---|---|---|
| local `main` HEAD `9d8ca17`, ahead 5, unpushed | `git rev-parse main` = `9d8ca17`; ahead/behind vs `origin/main`(`a9cb10f`) = **0/5** | **VERIFIED** (main ref) |
| current worktree at `main` @ `9d8ca17` | worktree is on **`ci/r16-test-gates` @ `0a7c865`**; `## ci/r16-test-gates...origin/ci/r16-test-gates` | **CONTRADICTED** (HEAD is the CI branch, not `main`) |
| commits `c188f76` / `4330faa` / `9d8ca17` | present; ancestry `… → 4330faa → c188f76 → 9d8ca17` (log line 3–5) | **VERIFIED** |
| four uncommitted release files | ` M story.ts`, ` M phase6d.integration.test.ts`, `?? narrationScript.ts`, `?? narrationScript.test.ts` | **VERIFIED** (2 M + 2 ??) |
| test-harness fix uncommitted (`vitest.config.ts`, `vitest.integration.config.ts`, `package.json`) | **committed** in `81c5d0f` on `ci/r16-test-gates` (`git status` shows them clean) | **CONTRADICTED** |
| production VPS on `7324c47` | `git cat-file -t 7324c47` = commit (`fix: close authenticated readiness bypass on Create page`); VPS not inspectable read-only | **PARTIAL** (commit exists; VPS not verified) |
| no "UI-2" worktree | `git worktree list` has no `ui-2`; `git branch -a` shows only `feat/ui-redesign` | **VERIFIED ABSENT** (searched: worktree list, `git branch -a` for `ui-2|ui_2|ui2`) |

**git status:** `--porcelain=v1` = **34 lines** — ` M .claude/settings.local.json`, ` D SESSION.md`, ` M packages/api/src/lib/creative/__tests__/phase6d.integration.test.ts`, ` M packages/api/src/routers/story.ts`, plus untracked `.claude/*`, `.codex/`, `AGENTS.md`, `UI-v2/`, `UI/*`, `_to_delete/`, `docs/*`, six `docs/operations/r16-*.md`, `packages/api/scripts/r16-render-validation.ts`, `narrationScript*`, `scripts/ca25c-*`, `session.md`, `session/`, `skills/`, `test/`.
**Stashes:** none (`git stash list` empty).
**Worktrees (12):** `raivstream` (ci/r16-test-gates @0a7c865), `-ci6d` (ci/phase6d-gates @0217f39), `-upgrade` (feat/raivstream-upgrade @0217f39), `-ui-redesign` (feat/ui-redesign @4cf01ed), `-phase9b2-audio` (phase-d-anti-commercial-guard @f2dd60a), `-phase9a`, `-phase9a-current`, `-phase9b1-current`, `-prompt-quality`, `-library-commit`, 2× `.claude/worktrees/*`.

**`C:\Raiv\raivstream-upgrade`** (branch `feat/raivstream-upgrade`) carries **uncommitted Phase-1-look work**: `M .github/workflows/{ci,deploy}.yml`, `M apps/web/.../admin/layout.tsx`, `M apps/web/src/app/generate/page.tsx`, `M apps/mobile/app/(tabs)/generate.tsx`, `M packages/api/src/{lib/credits.ts,routers/admin.ts,routers/generation.ts,trpc.ts}`, `M packages/database/schema.prisma`, `?? apps/web/src/app/admin/usage/page.tsx`, `?? packages/api/src/lib/{creditReporting.ts,__tests__/creditReporting.test.ts,__tests__/creditLedger.integration.test.ts}`, `?? packages/database/migrations/20261012120000_credit_ledger_idempotency/migration.sql`.

---

## 2. Procedure & authorization tiers — VERIFIED

`packages/api/src/trpc.ts`:
- `isNotR16` middleware — **:98** (throws FORBIDDEN when `ctx.isR16`).
- `requireR16` middleware — **:108** (throws FORBIDDEN when `!ctx.isR16`).
- Tiers — **:117–122**: `publicProcedure` (:117), `protectedProcedure` (:118, +`isAuthed`), `creativeProcedure` (:119, +`isAuthed`+`isNotR16` ⇒ **still carries `isNotR16`** ✓), `r16Procedure` (:120, +`isAuthed`+`requireR16`), `adminProcedure` (:121), `moderatorProcedure` (:122).

---

## 3. Router map — VERIFIED

Root `appRouter` at **`packages/api/src/index.ts`**: `auth, video, feed, interaction, user, analytics, generation, runpod, providers, admin, notification, story, academy, creative, director` (registering `storyRouter`, `creativeRouter` (→ `creative/*`), `academyRouter`, `adminRouter`, `directorRouter`).

Router files (23): `academy, admin, analytics, auth, director, feed, generation, interaction, notification, providers, runpod, story, user, video`, `creative/{approval,audio,director,homer,index,intent,observability,output,production,project,review,series,studio}`.

**`story.ts` is the main story router.** Its procedures are almost all `protectedProcedure` (63 listed). The **`r16Procedure`** ones are exactly five:
`generateEducationalNarration` (:7491), `generateStoryNarration` (:7571), `generateStoryMusic` (:7671), `requestStoryVideoExport` (:8006), `getStoryVideoExport` (:8018). No `publicProcedure`/`adminProcedure`/`creativeProcedure` in `story.ts`.

---

## 4. Export pipeline + call graph + end-card insertion point

**Call graph (R16 story export → FFmpeg):**
`story.requestStoryVideoExport` (`story.ts:8006`, `r16Procedure`) → `storyVideoExportService.requestExport` (`storyVideoExportService.ts:115`) → `renderOutputDerivative` (`render.ts:47`; called at `storyVideoExportService.ts:292`) → `runFfmpeg` (`render.ts:24`) → `spawn('ffmpeg', ['-y', …])` (`render.ts:26`).

- **Canonical for R16 video export:** `storyVideoExportService` over **`renderOutputDerivative`**. VERIFIED.
- **Shared:** `renderOutputDerivative` also drives the 5.0 **creative OUTPUT** flow — callers `lib/creative/output/service.ts:98` and `:202`. So a change here affects **both** the creative-output flow and R16 export.
- **`movieRenderWorker` is a SEPARATE path** (Movie Builder): its own `runCommand`/`spawn` (`movieRenderWorker.ts:42/44`) and direct `ffmpeg` calls (:199, :237, :267, :282 assemble, :343). Entry `queueMovieRenderJob` (`story.ts:50`); it does **not** use `renderOutputDerivative`.
- **There is no single shared FFmpeg layer** between the two flows. A **two-second end card** that must apply to *both* R16 and other eligible exports therefore requires an insertion in **each** pipeline — most naturally: (a) append an end-card segment in `renderOutputDerivative`'s concat stage (`render.ts`, post-`:112` concat / before `:157` read) for R16 + creative output, and (b) an equivalent final step in `movieRenderWorker.assembleMovie` (`:280`) for Movie Builder — **or** extract a shared post-process helper. **There is no existing hook.**

**ffmpeg/ffprobe:** **NOT on PATH** (`Get-Command ffmpeg/ffprobe` empty; `where.exe ffmpeg` empty) ⇒ session.md's "FFmpeg absent → real-media render BLOCKED locally" is **VERIFIED**.

---

## 5. Credit ledger + reconciliation-gate verdict

Models (verbatim, `packages/database/schema.prisma`):
- **`CreditBalance`** (:714) `{ id, userId @unique, balance Int @default(0), createdAt, updatedAt }`.
- **`CreditTransaction`** (:726) `{ id, userId, amount Int (+in/−out), type CreditTxType, featureKey?, description?, referenceId?, balanceBefore Int, balanceAfter Int, createdAt }`; indexes `[userId]`, `[userId,createdAt]`, `[type]`; **no `idempotencyKey`; no unique on `referenceId`**.
- **`CreditOperation`** (:763) outbox `{ idempotencyKey @unique, type REFUND, status PENDING|PROCESSING|COMPLETED|FAILED, userId, generationJobId?, featureKey?, amount, referenceId?, attempts, lastError?, completedAt? }`.
- **`CreditReservation`** (:798) `{ idempotencyKey @unique, status HELD|SETTLED|RELEASED, userId, generationJobId?, featureKey?, amount, settledAmount?, referenceId?, settledAt?, releasedAt? }`.
- **`GenerationJob`** (:840) includes `errorCode String?` (:866), `retryCount Int @default(0)` (:867).
- **`StoryVideoExport`** (:1373) with **`@@unique([projectId, sourceHash])`** (:1398).
- `CreditTxType` enum (:28): `PURCHASE, USAGE, BONUS, REFUND`.

Authoritative functions (`packages/api/src/lib/credits.ts`):
- **Deduct:** `deductCredits` (:117) — atomic `updateMany(balance >= cost)` + USAGE `creditTransaction.create` … **no idempotency key**.
- **Refund:** `refundCredits` (:188) — `creditBalance.upsert` + REFUND `creditTransaction.create` … **no idempotency key**.
- `releaseStuckReservations` (:426). Reserve path `reserveCredits` (:248) is idempotent **only via `CreditReservation.idempotencyKey`** and is **flag-guarded** (`CREDIT_RESERVE_SETTLE_ENABLED`, default OFF — :228).
- `generation.retry` (`generation.ts:426`, `protectedProcedure`) increments `retryCount` (:454).

**Reconciliation-gate verdict: NEEDS A NEW FIELD — SCHEMA CHANGE.**
The gate's *successful/failed/refunded/retried/concurrent* cases require an idempotency anchor on the ledger. Today that anchor exists only on `CreditOperation` (refunds, outbox) and `CreditReservation` (flag-OFF reserve path); the **authoritative `deductCredits`/`refundCredits` create `CreditTransaction` rows with no `idempotencyKey`** and no unique on `(referenceId,type)`, so a concurrent/retried charge or refund can be applied twice and is **not** reconcilable deterministically. The in-progress upgrade migration `20261012120000_credit_ledger_idempotency` (untracked, `-upgrade` worktree) **adds exactly that**: `credit_transactions.idempotencyKey` (nullable) + `UNIQUE (idempotencyKey)` + `(featureKey, createdAt)` index. Evidence: `credits.ts:117-182`, `credits.ts:188-219`, `schema.prisma:726-746`; required field: `schema.prisma` `CreditTransaction` — `+ idempotencyKey String? @unique`.

---

## 6. Moderation & publication

**Present (VERIFIED):** `enum ModerationStatus` (`schema.prisma:44`); `model ModerationLog` (`:511`, `@@map("moderation_logs")`, relation `User.moderationLogs` `:492`); `moderatorProcedure` (`trpc.ts:122`); `admin.moderationQueue` (`admin.ts:1160`), `admin.moderateVideo` (:1211), `admin.getModerationStats` (:1258).

**Absent (searched, NOT LOCATED):** `model Post`, `model Publication`, `model Timeline`, `model Share`, `model Attribution` — **zero matches** in `packages/database/schema.prisma` (`git grep "model Post\b|model Publication|model Timeline|model Share|model Attribution"`).

---

## 7. Phase 2 feature surfaces (Q7)

**R16-02 visual styles** — allowlist `STORY_VISUAL_STYLE_BLOCKS` (`packages/api/src/lib/storyVisualStyles.ts:1`) has **9 styles**: `STORYBOOK_ILLUSTRATION, THREE_D_ANIMATED, ANIME, COMIC_BOOK, PHOTOREALISTIC, WATERCOLOR, CLAYMATION, CINEMATIC_FANTASY, AFRICAN_FOLKTALE_ILLUSTRATION`. Server-side normalization: `normaliseStoryVisualStyle` (same file) / router import `story.ts:26`. Storage: **`StoryProject.visualStyle String?`** (`schema.prisma:908`) — **not an enum**. → Restricting to exactly *Cartoon, Anime, 3D Animation* is **CODE ONLY** (allowlist + normalizer); the *names don't exist today*; existing rows hold out-of-set strings → needs a **data-normalization pass** (no schema change unless converting `visualStyle` to an enum).

**R16-03 character continuity** — `packages/api/src/lib/visualBible.ts` **exists**; `applyMasterVisualBible` present; `model StoryCharacterMemory` (`schema.prisma:1233`); ProductionManifest `master_style: string` and `characters: Record<string,string>` (`productionStructurer.ts:50/54`, zod :81/:83). **No character-reference approval step** (`git grep "character.*approv|approveCharacter|characterReference.*approv|referenceApproval"` → only a literal string in `director/interpreter.ts:75`). → "approved canonical references" is **NOT present**; a review/approval step is greenfield.

**R16-04 batch generation** — `story.generateSceneShotClips` (`story.ts:5029`) and `story.completeUnfinishedStory` (`story.ts:5086`) exist; `lib/shotClipEngine.ts` exists. **No batch controller / durable job-state / bounded-concurrency / per-scene idempotency** found (`git grep "batch|BATCH_|bounded concurrency"` in routers/lib → none). → **largely greenfield** (per-scene sequential chains exist; a batched durable controller does not).

**R16-05 story edit versioning** — `regenerateStoryText` (`story.ts:4188`), `updateChapter` (:4587), `rewriteParagraph` (:4635) exist. `model SequenceVersion` (`schema.prisma:1465`) and `model CreativeVersion` (:2351) exist but cover **sequences / creative projects**, not story chapters. **No `StoryChapterVersion`** (searched `chapter.*version|StoryChapterVersion`). → chapter-level version history is **absent → SCHEMA CHANGE** (new `StoryChapterVersion` model) or CODE-ONLY if reusing an existing snapshot table is acceptable (it is not, today).

**PL-01 admin usage dashboard** — `admin.storyAnalytics` (`admin.ts:307`) exists; `admin.listGenerationJobs` (:1091), `admin.listCreditRates` (:1047). In-progress (untracked, `-upgrade`): `packages/api/src/lib/creditReporting.ts`, `apps/web/src/app/admin/usage/page.tsx`. → **partial**; a credit/generation usage dashboard is **CODE ONLY** on top of existing `CreditTransaction` (`featureKey` present) — but per-feature aggregation is currently unindexed (**`(featureKey, createdAt)` index missing** → SCHEMA CHANGE, added by the upgrade migration).

---

## 8. Reusable surfaces

| Feature area | Exists? | Location | Reusable for |
|---|---|---|---|
| Procedure tiers (`isNotR16`/`requireR16`) | Yes | `trpc.ts:98/108/117-122` | All phases |
| R16 export service | Yes | `storyVideoExportService.ts` (⇢ `renderOutputDerivative`) | R16 export + end card |
| Creative output renderer | Yes | `creative/output/{service,render}.ts` | R16 + 5.0 output (shared FFmpeg) |
| Movie Builder worker | Yes | `movieRenderWorker.ts` (separate FFmpeg) | Non-R16 movies + end card (2nd site) |
| Story video export idempotency | Yes | `StoryVideoExport @@unique([projectId,sourceHash])` (`schema:1398`) | Export dedup |
| Credit outbox (refund idempotency) | Yes | `CreditOperation` (`schema:763`) | Phase 1 refund reconciliation |
| Reserve/settle (flag OFF) | Yes | `credits.ts:248` + `CreditReservation` (`schema:798`) | Phase 1 (if enabled) |
| Ledger idempotency on charges/refunds | **No** | — | Phase 1 (**new field required**) |
| Visual-style allowlist | Yes | `storyVisualStyles.ts:1` | R16-02 (restrict) |
| Visual bible / character anchors | Yes | `visualBible.ts`, `StoryCharacterMemory` (`:1233`), manifest `characters` | R16-03 |
| Character-reference approval | **No** | — | R16-03 (greenfield) |
| Shot-clip chain | Yes | `shotClipEngine.ts`, `story.generateSceneShotClips` | R16-04 (basis) |
| Durable batch controller | **No** | — | R16-04 (greenfield) |
| Chapter edit procs | Yes | `story.{updateChapter,rewriteParagraph,regenerateStoryText}` | R16-05 |
| Chapter version history | **No** | — (only `SequenceVersion`/`CreativeVersion`) | R16-05 (new model) |
| Moderation stack | Yes | `ModerationStatus`/`ModerationLog`/`moderatorProcedure`/`moderationQueue` | Moderation phases |
| Admin analytics | Partial | `admin.storyAnalytics` (`:307`) + `-upgrade` `creditReporting.ts`/`admin/usage` | PL-01 |

---

## 9. Gap list (tagged)

**SCHEMA CHANGE**
- Phase 1: `CreditTransaction.idempotencyKey String? @unique` (+ `(featureKey, createdAt)` index) — **required** for the reconciliation gate. *(Migration `20261012120000_credit_ledger_idempotency` already drafted, untracked.)*
- R16-05: chapter version history model (e.g. `StoryChapterVersion`) — absent.
- R16-02 (optional): convert `StoryProject.visualStyle` `String?` → enum — only if you want DB-level enforcement (otherwise CODE ONLY).

**CODE ONLY**
- R16-02: restrict allowlist to Cartoon/Anime/3D Animation + rename/alias + normalizer + backfill of existing `visualStyle` values (data pass, not schema).
- R16-03: character-reference approval step + "approved canonical references".
- R16-04: durable batch controller (states, bounded concurrency, per-scene idempotency).
- PL-01: admin usage dashboard over `CreditTransaction` (needs the `(featureKey,createdAt)` index).
- End card: append in `renderOutputDerivative` (+ `movieRenderWorker.assembleMovie`) or extract a shared helper.

---

## 10. Conflicts with the written plan

1. **Style restriction (flagged).** The plan wants *exactly Cartoon, Anime, 3D Animation*. The tree has **9** themed styles with **none of those three literal names** (`storyVisualStyles.ts:1`), and `visualStyle` is a free `String?`, not an enum. → Plan assumption **CONTRADICTED**.
2. **Worktree base (flagged).** session.md describes `main` @ `9d8ca17` as the candidate; the working worktree is **`ci/r16-test-gates` @ `0a7c865`** (CI branch), and a separate **`feat/raivstream-upgrade`** worktree already holds Phase 1 WIP. The "test-harness fix" session.md calls uncommitted is **committed** on the CI branch. → Plan/base **CONTRADICTED**.

---

## 11. Blockers before Phase 1

1. **Ledger idempotency field missing** on the current schema (`CreditTransaction`) — the reconciliation gate cannot pass without it (or without enabling reserve/settle). 
2. **Working-tree not a clean baseline** — the audit worktree carries R16 uncommitted changes + untracked noise; a Phase 1 start should be from a clean checkout/branch.
3. **Two FFmpeg pipelines, no shared layer** — any cross-export feature (e.g. end card) must touch both sites.
4. **ffmpeg/ffprobe absent locally** — real-media validation is BLOCKED without an approved host.
5. **Ambiguous Phase-1 base** — `feat/raivstream-upgrade` (already modified) vs `origin/main` (`a9cb10f`).

---

## 12. Audit limitations

- Read-only: no DB query, so **existing `visualStyle` value counts** and **actual credit-ledger rows** were not enumerated (no `psql`/Prisma read); only schema/code inspected.
- VPS claim (`7324c47` deployed) verified only as a commit, not against the live host.
- Procedure lists are by regex on `story.ts` (63 `protectedProcedure` + 5 `r16Procedure`); multiline/aliased declarations, if any, could be missed.
- `movieRenderWorker` FFmpeg sites listed by grep; a full call-graph of every branch was not exhaustively traced.
- Static analysis only — no runtime/behavioral verification.

---

## Three most consequential findings

1. **The reconciliation gate needs a schema change.** `deductCredits`/`refundCredits` write `CreditTransaction` rows with **no idempotency key** (`credits.ts:117/188`; `schema.prisma:726`), so concurrent/retried charges or refunds are not deterministically reconcilable — the current schema **cannot** pass the gate without adding `CreditTransaction.idempotencyKey` (the untracked `20261012120000_credit_ledger_idempotency` migration).
2. **The plan's R16-02 style assumption is wrong.** There is no Cartoon/Anime/3D-Animation enum; the tree ships **9** differently-named styles on a free `String?` field (`storyVisualStyles.ts:1`, `schema.prisma:908`).
3. **The export/end-card surface is split.** R16 export uses `renderOutputDerivative` (shared with creative output), while Movie Builder uses `movieRenderWorker` — **two independent FFmpeg paths with no shared hook** (`render.ts:24/26` vs `movieRenderWorker.ts:42/282/343`).

---

## git status (definition-of-done check)

**FAILS in this worktree.** `git status --porcelain=v1` shows **4 tracked changes** (` M .claude/settings.local.json`, ` D SESSION.md`, ` M phase6d.integration.test.ts`, ` M story.ts`) and **many pre-existing untracked files**, so after adding this report the tree is **not** "exactly one new untracked file, zero modified tracked". The only clean worktree is `C:\Raiv\raivstream-ci6d` (0 porcelain, branch `ci/phase6d-gates`). No tracked file was modified by this audit; this report is the only file created.

---

## Appendix — `feat/raivstream-upgrade` inventory

**Method:** read-only (`git -C C:\Raiv\raivstream-upgrade …`). No commit/checkout/stash/reset; no DB/provider command.

### A1. `git worktree list` (full)
| Path | HEAD | Branch |
|---|---|---|
| `C:/Raiv/raivstream` | `0a7c865` | `ci/r16-test-gates` |
| `C:/Raiv/raivstream/.claude/worktrees/elegant-leakey-eb2d39` | `69fefed` | `claude/elegant-leakey-eb2d39` |
| `C:/Raiv/raivstream/.claude/worktrees/zen-bhabha-2857d5` | `69fefed` | `claude/zen-bhabha-2857d5` |
| `C:/Raiv/raivstream-ci6d` | `0217f39` | `ci/phase6d-gates` |
| `C:/Raiv/raivstream-library-commit` | `2517bce` | (detached) |
| `C:/Raiv/raivstream-phase9a` | `f2ed6b4` | `codex/phase-9a-sequence-workspace` |
| `C:/Raiv/raivstream-phase9a-current` | `3dadd70` | `codex/phase-9a-sequence-workspace-current` |
| `C:/Raiv/raivstream-phase9b1-current` | `3dadd70` | `codex/phase-9b1-movie-builder` |
| `C:/Raiv/raivstream-phase9b2-audio` | `f2dd60a` | `phase-d-anti-commercial-guard` |
| `C:/Raiv/raivstream-prompt-quality` | `f2ed6b4` | `codex/phase-8b-creative-critic-release` |
| `C:/Raiv/raivstream-ui-redesign` | `4cf01ed` | `feat/ui-redesign` |
| **`C:/Raiv/raivstream-upgrade`** | **`0217f39`** | **`feat/raivstream-upgrade`** |

### A2. Upgrade specifics
- `rev-parse HEAD` = `0217f39ab6ad77ca0bd11c7873d93a6aea72414c`; branch `feat/raivstream-upgrade`.
- `merge-base HEAD main` = `a9cb10ff1d83c92d82e5223b559a3100c2b736a7` (= `origin/main`).
- `log --oneline -20`: `0217f39` fix → `1d0a755` ci-fix → `eab6355` ci-gates → `7e92b6a` 6D-verify → `611a458` 6D → `a9cb10f` 6C → `40d19be` 6B → `35752eb` 6A → `b510201` 5 → … (i.e. committed history = origin/main + Phase 6D + CI; **no R16 A/B/C**).
- `stash list`: **empty**.
- `status --porcelain=v1`: **10 M + 5 ??** (listed in A4).

### A3. Migration `20261012120000_credit_ledger_idempotency`
**Lives in the `feat/raivstream-upgrade` worktree, UNTRACKED** (`?? packages/database/migrations/20261012120000_credit_ledger_idempotency/`); not in the audited worktree or any committed branch. Full `migration.sql` verbatim:
```sql
-- Credit ledger idempotency + usage-reporting index.
--
-- Additive only. No existing column is dropped or rewritten.
--
-- `idempotencyKey` is a nullable unique anchor for a single logical credit
-- operation (one charge or one refund). PostgreSQL permits many NULLs in a
-- UNIQUE index, so every legacy transaction (and every non-idempotent caller)
-- remains valid with a NULL key. The unique index makes a replayed operation a
-- no-op (P2002 on the duplicate) instead of a double charge/refund.
--
-- The (featureKey, createdAt) index supports admin usage-by-feature reporting.

ALTER TABLE "credit_transactions" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "credit_transactions_idempotencyKey_key"
  ON "credit_transactions"("idempotencyKey");

CREATE INDEX IF NOT EXISTS "credit_transactions_featureKey_createdAt_idx"
  ON "credit_transactions"("featureKey", "createdAt");
```

### A4. Files changed
**Committed `a9cb10f..HEAD`** — 13 files, **+1731 / −14** = exactly the CI+6D candidate (`.github/workflows/{ci,deploy}.yml`, `docs/phase-6/PHASE-6D-ACCEPTANCE.md`, `packages/api/package.json`, `packages/api/src/lib/creative/audio/service.ts`, `packages/api/src/routers/creative/{audio,index}.ts`, `packages/api/src/lib/creative/__tests__/{phase6c,phase6d.integration,phase6d}.test.ts`, `packages/api/vitest{,.integration}.config.ts`, `packages/database/migrations/20261009110000_phase6d_music_cue_lock/migration.sql`). **Identical to `ci/phase6d-gates`.**

**Uncommitted (tracked) — 10 files, +618 / −155:**
```
 .github/workflows/ci.yml               |   4 +-
 .github/workflows/deploy.yml           |   4 +-
 apps/mobile/app/(tabs)/generate.tsx    |  32 ++++-
 apps/web/src/app/admin/layout.tsx      |   1 +
 apps/web/src/app/generate/page.tsx     |  39 +++--
 packages/api/src/lib/credits.ts        | 238 +++++++++++++++++++++++--------
 packages/api/src/routers/admin.ts      | 188 ++++++++++++++++++++++--
 packages/api/src/routers/generation.ts | 253 ++++++++++++++++++++++++--------
 packages/api/src/trpc.ts               |   9 ++
 packages/database/schema.prisma        |   5 +
```
**Untracked (5):** `apps/web/src/app/admin/usage/page.tsx`, `packages/api/src/lib/creditReporting.ts`, `packages/api/src/lib/__tests__/creditReporting.test.ts`, `packages/api/src/lib/__tests__/creditLedger.integration.test.ts`, `packages/database/migrations/20261012120000_credit_ledger_idempotency/migration.sql`.

### A5. Targeted files (line ranges)
- **`packages/api/src/lib/credits.ts`** — heavily rewritten around `deductCredits`/`refundCredits`. Hunk headers (`@@`): `108→+109..166` (new helper region), `111→168`, `114→172`, `121→186`, `122→188..201` (inside `deductCredits`), `138→216..232`, `145→233`, `151→238`, `157→241..255`, `178→256..272`, `185→279`, `193→291`, `195→293`, `200→298..314`, `202→315..328`, `217→329..344` (inside/after `refundCredits`).
- **`packages/database/schema.prisma`** — `@@ -735,0 +736,4` and `@@ -744,0 +749` (inside `model CreditTransaction`): adds `idempotencyKey String?   @unique` and `@@index([featureKey, createdAt])`.
- **`packages/api/src/trpc.ts`** — `@@ -32,0 +33,8` and `@@ -43,0 +52` (inside the `errorFormatter`): adds a structured **insufficient-credit** projection (R16-01) — reads `error.cause.credit` (`{required,balance,shortfall,featureKey}`) and spreads it to `data.credit`.
- **`packages/api/src/routers/admin.ts`** — `@@ -990,4 +991,40`, `@@ -995,7 +1032`, `@@ -1004 +1035`, `@@ -1011 → 1042`, `@@ -1014 → 1044`, `@@ -1308,0 +1342,125` (+125): admin credit procedures including `reconcileBalances` and usage aggregation (backing `admin/usage`).
- **Admin credit UI:** `apps/web/src/app/admin/layout.tsx` (+1 nav entry) and **new** `apps/web/src/app/admin/usage/page.tsx` (`admin.reconcileBalances` query + Purchases/Grants/Consumption stat cards).
- **User-visible balance component:** YES — `apps/web/src/app/generate/page.tsx` uses `LowBalanceWarning` (`:8`) + `trpc.user.creditBalance` (`:52`); `apps/mobile/app/(tabs)/generate.tsx` uses `trpc.user.creditBalance` (`:62`) with comment "Authoritative post-charge balance (R16-01)" (`:68`).

### A6. Phase scope
**Phase-1-only (credit ledger/idempotency) + PL-01 (admin usage dashboard).** No Phase-2/3/4 surfaces (no R16-02 styles, R16-03 character-reference approval, R16-04 batch controller, R16-05 chapter versioning, no `Post`/`Publication`/`Timeline`/`Share`/`Attribution`). Themes: `credits.ts`, `schema.prisma` (ledger idempotency), `trpc.ts` (R16-01 insufficient-credit payload), `admin.ts` (`reconcileBalances`), `admin/usage`, `creditReporting.ts`.

### A7. `ci/r16-test-gates @ 0a7c865` relationship
`git log --oneline --graph --all` shows **two branches diverging from `a9cb10f` (origin/main)**:
- `feat/raivstream-upgrade` → `611a458 → 7e92b6a → eab6355 → 1d0a755 → 0217f39` (6D + CI only).
- `ci/r16-test-gates` → `6b3989f → 8ace7a0 → c188f76 → 4330faa → 9d8ca17 → 81c5d0f → 0a7c865` (6D + **R16 A/B/C** + CI).
- `0a7c865` is the **PR #2** head (temporary review branch): `9d8ca17` = Phase B in its history; `7324c47` ("fix: close authenticated readiness bypass on Create page") is an **ancestor of both `origin/main` and `9d8ca17`** (an older commit already in main's history — the session.md-reported last VPS deploy; not a tip). `ci/phase6d-gates` and `feat/raivstream-upgrade` both point at the **same** commit `0217f39`.

### Three most consequential facts
1. **The upgrade branch's committed history contains NO Phase-1 work.** `a9cb10f..HEAD` is exactly the CI+6D candidate (13 files); every Phase-1 change is **uncommitted** (10 M + 5 ??) and would be lost on a reset/checkout.
2. **Phase 1's required schema change already exists locally** — `CreditTransaction.idempotencyKey @unique` + `@@index([featureKey,createdAt])` (`schema.prisma`, in-progress) and the untracked `20261012120000_credit_ledger_idempotency` migration — plus `deductCredits`/`refundCredits` idempotency, the R16-01 insufficient-credit payload (`trpc.ts`), `admin.reconcileBalances`, and an admin usage dashboard.
3. **`feat/raivstream-upgrade` and `ci/phase6d-gates` share the same tip `0217f39`**; only `ci/r16-test-gates @ 0a7c865` (PR #2) additionally carries the R16 A/B/C commits. `7324c47` is an old main ancestor, not a branch tip.
