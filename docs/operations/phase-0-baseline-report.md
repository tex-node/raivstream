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

---

## Appendix B — Phase 1 idempotency completion audit

**Method:** read-only, in `C:\Raiv\raivstream-upgrade` at HEAD `0e29fb4` (Phase-1 work committed in `3911c14`). No commit/DB/provider call. Gate under audit: reconciliation passes for **successful / failed / refunded / retried / concurrent** generation requests.

### B-A. Call-site coverage of `deductCredits` / `refundCredits`

Signatures (now key-aware): `deductCredits(prisma, userId, featureKey, referenceId, description, idempotencyKey?)` (`credits.ts:180`, key param `:186`); `refundCredits(…, idempotencyKey?)` (`:284`, key param `:291`).

**WIRED (passes a key) — `packages/api/src/routers/generation.ts` only:**
| Site | Call | Key | Derivation | Deterministic? |
|---|---|---|---|---|
| `generation.ts:270` | deduct | `chargeKey(job.id, 0)` | `generation.ts:37` `(jobId,attempt)=>`gen:charge:${jobId}:${attempt}`` | Yes — `jobId` stable; `attempt` = retry index |
| `generation.ts:543` | deduct | `chargeKey(job.id, attempt)` | same | Yes |
| `generation.ts:325` | refund | `refundKey(job.id, 0)` | `generation.ts:38` `gen:refund:${jobId}:${attempt}` | Yes |
| `generation.ts:473/480` | refund | `refundKey(job.id, attempt)` | same | Yes |
| `generation.ts:597/604` | refund | `refundKey(job.id, attempt)` | same | Yes |

**UN-WIRED — passes NOTHING (`idempotencyKey` omitted ⇒ `NULL`):**
| File:line | Op | Notes |
|---|---|---|
| `packages/api/src/lib/creative/audio/service.ts:326` | deduct | keyless (multiline tail `…, description)` ) |
| `packages/api/src/lib/creative/audio/service.ts:365` | refund | keyless |
| `packages/api/src/lib/creative/audio/service.ts:569` | refund | keyless |
| `packages/api/src/lib/creative/audio/service.ts:618` | refund | keyless |
| `packages/api/src/lib/creative/production/runner.ts:193` | deduct | keyless (`…).catch(()=>0)`) |
| `packages/api/src/lib/creative/production/runner.ts:218` | refund | keyless |
| `packages/api/src/routers/director.ts:77` | deduct | keyless |
| `packages/api/src/routers/director.ts:85` | refund | keyless |
| `packages/api/src/lib/movieRenderWorker.ts:459` | refund | keyless |
| `packages/api/src/routers/story.ts:393` | deduct (shot clip) | keyless |
| `packages/api/src/routers/story.ts:2741` | deduct (scene image) | keyless |
| `packages/api/src/routers/story.ts:3128` | deduct (scene video) | keyless |
| `packages/api/src/routers/story.ts:3572` | deduct (narration) | keyless |
| `packages/api/src/routers/story.ts:6112` | deduct (movie render) | keyless |
| `packages/api/src/routers/story.ts:7525` | deduct (educational narration) | keyless |
| `packages/api/src/routers/story.ts:7602` | deduct (music) | keyless |
| `packages/api/src/routers/story.ts:468` | refund (shot clip) | keyless |
| `packages/api/src/routers/story.ts:2974` | refund (scene image) | keyless |
| `packages/api/src/routers/story.ts:3269` | refund (scene video) | keyless |
| `packages/api/src/routers/story.ts:3605` | refund (narration) | keyless |
| `packages/api/src/routers/story.ts:6222` | refund (movie cancel) | keyless |
| `packages/api/src/routers/story.ts:7555` | refund (educational narration) | keyless |
| `packages/api/src/routers/story.ts:7635` | refund (music) | keyless |

(Test-only sites in `lib/__tests__/creditLedger.integration.test.ts` pass keys.)

**Finding (flagged):** the idempotency key is wired into **exactly one module** (`generation.ts`). Every other production path — story scene image/video/shot-clips, R16 + educational narration, music, movie render + cancel, Director, 5.0 creative production, and creative-audio TTS/music — passes **nothing**, writing `idempotencyKey = NULL`. The reconciliation gate **cannot pass** on those paths.

### B-B. NULL-permitting unique — verbatim

**Model (`packages/database/schema.prisma`, upgrade):**
```prisma
model CreditTransaction {
  id     String       @id @default(cuid())
  userId String
  user   User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  amount      Int          // positive = credit in, negative = credit out
  type        CreditTxType
  featureKey  String?      // which feature was used (populated on USAGE)
  description String?
  referenceId String?      // payment ref, generation job ID, etc.
  // Optional idempotency anchor. When set, a logical operation (a single charge
  // or refund) can be replayed safely: the unique key prevents a duplicate
  // balance mutation + ledger row. Null for legacy rows and non-idempotent ops.
  idempotencyKey String?   @unique

  balanceBefore Int
  balanceAfter  Int

  createdAt DateTime @default(now())

  @@index([userId])
  @@index([userId, createdAt])
  @@index([type])
  @@index([featureKey, createdAt])
```
**Migration (`20261012120000_credit_ledger_idempotency/migration.sql`) — verbatim:**
```sql
ALTER TABLE "credit_transactions" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "credit_transactions_idempotencyKey_key"
  ON "credit_transactions"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "credit_transactions_featureKey_createdAt_idx"
  ON "credit_transactions"("featureKey", "createdAt");
```
**Assessment:**
- Postgres `UNIQUE` treats `NULL`s as **distinct**, so multiple `idempotencyKey = NULL` rows are permitted → legacy/non-idempotent rows stay valid (confirmed by the integration test "legacy rows with a NULL key remain valid").
- **No other uniqueness** on `(referenceId, type)` or similar — only `idempotencyKey @unique` plus the four plain indexes.
- **Future caller passing `null`:** the insert always succeeds → **no protection**; duplicate charges/refunds remain possible on any keyless path.
- **Recommendation (finding, not a change):** (1) a **partial** index (`… WHERE "idempotencyKey" IS NOT NULL`) is functionally equivalent to the current plain unique (NULLs are already distinct) — it is only a size optimization; the substantive fix is **backfill + `NOT NULL`** once every caller supplies a key. (2) `@@unique([referenceId, type])` as defense-in-depth is **unsafe as stated**: `referenceId` is nullable **and reused across features** (e.g. a cue id is used for both `story:speech_generation` narration and `story:audio_generation` music), so a `(referenceId, type)` unique would reject legitimate rows; if added it must be `(referenceId, type, featureKey)` and only after nullable-`referenceId` rows are handled.

### B-C. Existing-row backfill
- **Count of rows that would be `NULL` after migration:** **NOT DETERMINED** — requires a DB read (no `psql`/Prisma query permitted in this read-only audit); all pre-existing `credit_transactions` rows are `NULL` by construction.
- **Backfill script:** **NONE.** `git grep -i "backfill|back-fill"` across `packages/api`, `scripts`, `packages/database` → **zero** matches; no `scripts/*backfill*`, `*ledger*`, or `*reconcil*` file exists.
- **Derivable key from `(referenceId, type)`?** Only partially. `referenceId` is **nullable** and **not unique across featureKeys** (narration and music share a cue id), so a `(referenceId,type)` key would collide for legitimate historical pairs → **lossy/unsafe**. A collision-free derivation is `legacy:${row.id}` (always unique) — but that provides **no cross-row dedup**; it only satisfies a future `NOT NULL` constraint.

### B-D. Reconciliation test coverage
Present test files:
- `packages/api/src/lib/__tests__/creditLedger.integration.test.ts` (real DB) — cases: concurrent deduct same key → once (`:98`); concurrent refund same key → once (`:114`); conflicting key reuse fails safely (`:129`); legacy NULL key valid (`:145`); insufficient-credit race never negative (`:156`); parallel admin adjustments no lost updates (`:172`); overdraft rejected (`:185`); **PL-01 mixed-op reconciliation invariant** (`:196`); retry parity reserve/settle/release per attempt key (`:215`); cancel-vs-failure shared refund key refunds once (`:232`).
- `packages/api/src/lib/__tests__/creditReporting.test.ts` (unit).
- Pre-existing: `creditReserveSettle.test.ts`, `audioCreditGate.test.ts`, `movieRenderCreditGate.test.ts`.

**Finding:** these tests exercise `deductCredits`/`refundCredits` **directly with keys** — proving the *function* is replay-safe — but **no test asserts that the app's call sites pass keys**. The un-wired paths in B-A are therefore **untested**; the reconciliation gate's coverage exists at the function layer, not at the integration/call-site layer.

### Three most consequential gaps
1. **Call-site wiring is 1-of-N.** Only `generation.ts` supplies keys; ~14 `story.ts` sites + `creative/audio/service.ts` + `creative/production/runner.ts` + `director.ts` + `movieRenderWorker.ts` pass **nothing** ⇒ `idempotencyKey = NULL` ⇒ no dedup ⇒ the reconciliation gate fails for story images/videos/shot-clips/narration/music, movie render, Director, creative production, and creative audio.
2. **Nullable key + no backfill.** `UNIQUE(idempotencyKey)` permits unlimited `NULL`s, every existing row is `NULL`, and **no backfill script exists**, so even the wired path leaves the historical ledger un-reconcilable and keyless callers stay non-idempotent until `NOT NULL` is enforced.
3. **Tests prove the function, not the wiring.** `creditLedger.integration.test.ts` covers concurrent/refund/retry idempotency at the function layer only; nothing verifies call-site key coverage, so the gate can appear green while most production charge/refund paths remain un-protected.

---

## Appendix C — Phase 2 decision-support audit

**Question.** For each Phase 2 surface (the five listed in §7), what already exists, what is the *smallest* change to ship it, what does it depend on, and what must the owner decide?

**Method.** READ-ONLY at `feat/raivstream-upgrade @ 74b05d5`. No DB query, no provider call, no commit. Every claim cites code or schema. Effort/risk labels are qualitative (no runtime profiling).

### C1. R16-02 — restrict visual styles
- **Today:** allowlist `STORY_VISUAL_STYLE_BLOCKS` has 9 styles (`storyVisualStyles.ts:1`) with a `label` + `prompt` each; server normalizer `normaliseStoryVisualStyle` in the same file. Storage is `StoryProject.visualStyle String?` (`schema.prisma:908`) — **not an enum**. Of the three target names, **`ANIME`** and **`THREE_D_ANIMATED`** exist verbatim; **there is no `Cartoon`** (`STORYBOOK_ILLUSTRATION` / `COMIC_BOOK` are the closest, differently named).
- **Verdict:** **CODE ONLY** (allowlist + normalizer). DB enforcement is optional.
- **Smallest change:** trim the allowlist to the 3 target styles, add alias/normalizer entries (e.g. map the desired `Cartoon` → a chosen implementation), reject or alias unknown values on write. **A data pass is mandatory first** — existing rows hold out-of-set strings (no DB read permitted here, so the count is unknown).
- **Dependencies:** none. **Risk:** restricting before backfilling breaks existing projects. **Decision:** enforce in DB (String→enum migration + backfill) or keep `String?` + code validation; and which implementation `Cartoon` maps to.

### C2. R16-03 — character continuity / approved canonical references
- **Today:** continuity layer **exists** — `visualBible.ts` (`applyMasterVisualBible`, `VisualBibleSource`, side-effect free, unit-tested), `model StoryCharacterMemory` (`schema.prisma:1233`), manifest `master_style` + `characters: Record<string,string>` (`productionStructurer.ts:50/54`, zod `:81/:83`). **No approval step** (`git grep "character.*approv|approveCharacter|referenceApproval"` → only a literal string at `director/interpreter.ts:75`).
- **Verdict:** continuity = REUSE; an approval/review workflow = **GREENFIELD**.
- **Smallest change:** persist per-character canonical reference images + a status (`pending|approved|rejected`), an approval proc + UI, and gate generation on "approved" (or fall back to the text anchors). Almost certainly a new model → **SCHEMA CHANGE**.
- **Dependencies:** image storage/host. **Risk:** approving *after* generation spends credits on rejected art; blocking generation on approval changes UX. **Decision:** approve-before-generate vs generate-then-approve; who approves; reference storage schema.

### C3. R16-04 — batch generation
- **Today:** per-scene pieces exist — `story.generateSceneShotClips` (`story.ts:5029`), `story.completeUnfinishedStory` (`:5086`), pure clip planner `shotClipEngine.ts` (H3 I2V chain; pure helpers, loop in router). **No batch controller / durable job-state / bounded concurrency / per-scene idempotency** (`git grep "batch|BoundedConcurrency|runInBatches|pLimit|concurrency"` across `story.ts` + `shotClipEngine.ts` → **zero**).
- **Verdict:** **GREENFIELD** (sequential chains exist; a durable batched driver does not).
- **Smallest change:** a durable job table + a runner (the app already has `movieRenderWorker.ts` as a worker precedent) + bounded concurrency + per-scene idempotency, reusing the Phase 1 `idempotencyKey` pattern and `StoryVideoExport @@unique([projectId, sourceHash])` (`schema:1398`) for resume.
- **Dependencies:** **Phase 1 idempotency (done)** + the refund path for partial failures. **Risk:** partial-failure cost blow-ups — needs per-scene idempotency + refund keys. **Decision:** in-process worker vs external queue; max concurrency; per-run cost cap.

### C4. R16-05 — story edit versioning
- **Today:** edit procs exist — `story.regenerateStoryText` (`:4188`), `story.updateChapter` (`:4587`), `story.rewriteParagraph` (`:4635`). `model SequenceVersion` (`schema:1465`) and `model CreativeVersion` (`:2351`) exist but cover **sequences / creative projects**, not chapters. **No `StoryChapterVersion`** (`git grep "chapter.*version|StoryChapterVersion"` → none).
- **Verdict:** procs = REUSE; chapter history = **GREENFIELD** (**SCHEMA CHANGE**).
- **Smallest change:** a `StoryChapterVersion` model (`chapterId, version, content, createdAt, authorId, reason`) + write-on-edit + a restore proc + a diff UI. Reusing `CreativeVersion` is **not** acceptable (different aggregate).
- **Dependencies:** none hard; storage grows with edits. **Risk:** history on every keystroke/edit bloats the table. **Decision:** full snapshot vs diff; retention/pruning policy.

### C5. PL-01 — admin usage dashboard
- **Today (more complete than §7 recorded):** `admin.usageReport` (`admin.ts:1350`), `admin.reconcileBalances` (`:1419`), the pure DB-free accounting helper `creditReporting.ts` (`reconcileRows` `:44`; reports discrepancies, never mutates), and UI `apps/web/src/app/admin/usage/page.tsx` (177 lines; 7/28/90-day ranges, discrepancy filter, "Usage & Ledger"). Supporting: `admin.storyAnalytics` (`:308`), `admin.listGenerationJobs` (`:1091`).
- **Verdict:** already **IMPLEMENTED** on `feat/raivstream-upgrade`; the only prerequisite is the `(featureKey, createdAt)` index for per-feature aggregation (shipped in `20261012120000_credit_ledger_idempotency`).
- **Smallest change:** ship as-is once the migration is applied; add a per-feature breakdown if not already rendered. **Dependencies:** Phase 1 migration. **Risk:** low. **Decision:** whether to surface out-of-band adjustments in the discrepancy list (the helper reports, never mutates).

### C6. Recommended order (lowest risk / highest reuse first)
1. **PL-01** — already built; ships with the Phase 1 index migration.
2. **R16-02** — code-only, no schema; **data backfill first**, then restrict.
3. **R16-05** — self-contained schema addition, low coupling.
4. **R16-03** — needs a storage + approval decision; medium scope.
5. **R16-04** — largest; depends on Phase 1 idempotency (done) + a worker; highest cost risk.

### C7. Decisions required (owner)
- **R16-02:** DB enum vs code-only; the `Cartoon` mapping; backfill strategy for out-of-set rows.
- **R16-03:** approval model + reference storage; approve-before vs generate-then-approve.
- **R16-04:** worker/queue choice; concurrency; per-run cost cap.
- **R16-05:** snapshot vs diff; retention.
- **PL-01:** adjustment handling in the reconciler display.

### C8. Audit limitations
- Read-only, no DB: existing `visualStyle` value distribution and `StoryCharacterMemory` row counts were not enumerated.
- Effort/risk are qualitative; no profiling.
- Scoped to `74b05d5`; the separate R16 uncommitted work in `C:\Raiv\raivstream` is not included.

### Three most consequential
1. **Only one of five Phase 2 surfaces is already implemented (PL-01).** The other four are either code-only on existing layers (R16-02) or greenfield (R16-03/04/05).
2. **Two need SCHEMA CHANGE** — R16-03 (character references) and R16-05 (`StoryChapterVersion`); R16-02 and R16-04 are code-only, but **R16-04 is the largest** (durable batch controller + refunds).
3. **Ordering is forced by data, not preference:** R16-02 needs a **data backfill before** restriction (or live projects break), and R16-04 depends on the **Phase 1 idempotency** already shipped to avoid partial-failure cost blow-ups.
