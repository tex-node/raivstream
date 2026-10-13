# Phase 2 — release evidence

Branch `feat/raivstream-upgrade` @ `232143b` · READ-ONLY evidence file (no code or schema changes). Nothing here is production-verified.

## 1. Status summary

**Feature-complete and test-verified. Production verification PENDING.**

All five Phase 2 features are implemented on the branch and covered by passing automated tests. **None of them has been exercised against a running/staging/production environment by this workstream** — every release-gate verification below is test-only. The branch's migrations have **not** been applied to any database. This document is not a GO and not a NO-GO; it is the evidence a reviewer needs to run the operator queue in §5 (see the CONDITIONAL GO in §6).

## 2. Feature inventory

| Plan requirement | Implementation commit(s) | Test coverage | How the gate criterion is met |
|---|---|---|---|
| **R16-02** — exactly Three R16 scene styles (Cartoon / Anime / 3D Animation) | `682202c` | `routers/__tests__/r16VisualStyle.test.ts` (17) + `lib/__tests__/storyVisualStyleOptions.test.ts` (3) | R16 write guard accepts the 3, rejects dropped styles; main app keeps all 10; UI exposes 3 |
| **R16-03** — character continuity + approved canonical references | `e42dcf8` (model/seam), `ba445e3` (gen/approve/continuity), `38b3964` (draft warning banner) | `routers/__tests__/characterReferences.test.ts` (13) + `lib/__tests__/draftReferenceWarning.test.ts` (4) | Approved reference's anchor is injected into the composed scene prompt; unapproved characters warn, never block |
| **R16-04** — batch generation, partial failure, selective retry | `6f9447c` (models), `33ff9fc` (controller/procedures), `232143b` (UI + resume) | `lib/story/__tests__/batchGeneration.test.ts` (10) + `routers/__tests__/batchRuns.test.ts` (4) + `lib/__tests__/batchGenerationUi.test.ts` (7) | Bounded worker continues past a failed item; READY items are never re-processed; cap pauses; failed-only retry; UI Start gated by the estimate |
| **R16-05** — chapter version history (snapshot restore) | `5ef5933` | `lib/story/__tests__/chapterVersioning.test.ts` (6) + `routers/__tests__/chapterVersions.test.ts` (8) | Every body-write snapshots the prior state; restore snapshots the current state first (undoable); cap 50 / keep newest 10 |
| **PL-01** — admin usage dashboard + credit reconciliation | `3911c14` (Phase 1) with the ledger keying in `4814748`/`656261c`/`74b05d5` | `lib/__tests__/creditReporting.test.ts` (5) + `lib/__tests__/creditLedger.integration.test.ts` (PL-01 case, `:196`) | Pure accounting math unit-tested; the mixed-operation reconciliation invariant is an **integration** test (real PostgreSQL, not in the default unit suite) |

## 3. Release gate evaluation

> Gate text from the upgrade plan:
> - "All three styles work end-to-end"
> - "Character identity remains distinguishable across scenes"
> - "Partial batch failure and selective regeneration work"
> - "Story edits preserve version history"
> - "Credit reconciliation remains correct"

| Gate criterion | Verification | Test-only or also live? |
|---|---|---|
| All three styles work end-to-end | `r16VisualStyle.test.ts:54` (R16 accepts CARTOON/ANIME/THREE_D_ANIMATED), `:61` (drops rejected); `storyVisualStyleOptions.test.ts` (R16 renders exactly 3) | **Test-only** — no live generation was run |
| Character identity remains distinguishable across scenes | `characterReferences.test.ts:205`/`:213` (composed prompt contains the exact `Approved reference for Ada: <url>` anchor); `resolveSceneApprovedReferences` approved/draft cases | **Test-only** — the anchor is asserted at prompt-construction; no rendered cross-scene comparison |
| Partial batch failure and selective regeneration work | `batchGeneration.test.ts:137` (a failing item does not stop the run), `:153` (READY item never re-processed), `:163` (cap pause); `batchRuns.test.ts` (resume) | **Test-only** — mocks; no live batch run |
| Story edits preserve version history | `chapterVersions.test.ts:56` (EDIT), `:63` (REWRITE_PARAGRAPH + index), `:95` (restore snapshots current); `chapterVersioning.test.ts` (monotonic numbering, 51→50 prune, latest-10) | **Test-only** |
| Credit reconciliation remains correct | `creditLedger.integration.test.ts:196` (mixed-operation reconciliation invariant) — requires disposable PostgreSQL; **not run by the default `api test` suite** (it is excluded and run via `test:integration`). `creditReporting.test.ts` covers the pure math | **Test-only**, and only under `test:integration` with a real DB — **not** exercised in a running environment |

**Explicitly test-only:** all five. No Phase 2 gate was exercised against a running environment by this workstream.

## 4. Known limitations (honest)

Each of the following is an **accepted limitation**:

1. **`affectedSceneIdsForChapterEdit` over-approximates — accepted limitation.** There is no reliable chapter-text → scene mapping today (`StorySceneSeed` links to a chapter only by `chapterId`, never a span of body text), so a changed body returns **all** scenes passed in — conservative, not precise. Informational only; it never triggers regeneration.
2. **Batch concurrency is fixed at 2 — accepted limitation.** It is a per-run field with no UI/user override. (Independent of `PROVIDER_MAX_CONCURRENCY`; see `providerRateLimit.ts:42`.)
3. **R16-03 "use draft" path allows generation without an approved reference — accepted limitation (by design).** Scene generation with unapproved characters warns (via `hasDraftReferences`) and proceeds with the draft reference; it never blocks and never auto-approves.
4. **R16-02 enforcement is code-only (no DB enum) — accepted limitation.** The shared `StoryProject.visualStyle` field cannot express audience-scoped enums (3 for R16, 10 for the main app), so the restriction is validated in code at the write paths; the read-through policy keeps existing out-of-set values working.

5. **Production carries 14 pre-existing user balance/ledger drift cases - accepted limitation.** Identified 2026-10-13: `credit_balances.balance <> SUM(credit_transactions.amount)` for 14 accounts. All 14 are **test/staging/acceptance** accounts (emails on `raivstream.com` / `raivstream.test` / `test.raivstream.com` - e.g. `integration-5@raivstream.com`, `ca25b-assembly@`, `ugc-480p-acceptance@`, `phase6a-prod@raivstream.test`) whose opening balances were **seeded outside the ledger** (the delta equals the seed; their ledger rows are only the negative USAGE spends). No real user is affected. The reconciliation gate verifies **new** transactions only; historical drift is tracked separately (see the operator queue in `docs/operations/upgrade-plan-closing-status.md`).
6. **No incident-detection stack in production - accepted limitation.** Sentry is **not configured** (only placeholders in `.env.example` / `docs/SETUP.md`; no `SENTRY_DSN` in the VPS `.env` or `apps/web/.env.local`), so incident detection relies on the health check and PM2 logs alone. Observability gap.

## 5. Pending operator actions

1. **Apply migrations, in timestamp order** (none applied by this workstream):
   1. `20261012120000_credit_ledger_idempotency` — commit `3911c14`
   2. `20261012130000_credit_ledger_backfill` — commit `c4bc985`
   3. `20261012140000_credit_ledger_idempotency_not_null` — commit `c4bc985`
   4. `20261012150000_phase4a_video_publication` — commit `009b739`
   5. `20261012160000_story_chapter_versions` — commit `5ef5933`
   6. `20261012170000_character_reference_assets` — commit `e42dcf8`
   7. `20261012180000_batch_generation` — commit `6f9447c`
   Run `prisma migrate deploy`; all are additive except `…140000` (NOT NULL — safe once the backfill `…130000` has run first, in the order above).
2. **Verify the end card on the VPS** — run `pnpm verify:end-card` on a host with ffmpeg/ffprobe (see the Phase 3 recipe); confirm duration = source + 2 s, one h264 + one aac stream, and the handle visible; confirm `drawtext` + a resolvable font (`RAIVSTREAM_END_CARD_FONT` or `fc-match sans-serif`).
3. **Confirm the VPS HEAD** — `git -C /root/raivstream rev-parse HEAD` (session.md's "current deployed" line is stale; `origin/main` is `a9cb10f`).
4. **PR hygiene** — merge `ci/phase6d-gates` (PR #3) first, then rebase `ci/r16-test-gates` (PR #2) onto the new `main` so its diff shrinks to R16 A/B/C only.
5. **Phase 2 staging verification (would consist of):** on a staging host with a reachable DB, ffmpeg, fal/R2 creds — (a) R16 story create with each of the 3 styles end-to-end (image + video); (b) generate a character reference → approve → generate two scenes and confirm the reference anchor reaches the provider prompt and the characters read as consistent; (c) run a batch with one scene forced to fail and confirm the run continues + selective retry; (d) edit a chapter, restore a version, confirm history; (e) run the reconciliation invariant against the real DB (`test:integration`).

## 6. Release decision

**CONDITIONAL GO** — feature-complete and test-verified; production verification is blocked on the operator queue in §5.

Conditions:
1. All migrations in §5.1 applied in order (NOT NULL only after the backfill).
2. End card verified on a host with ffmpeg/ffprobe.
3. VPS HEAD confirmed.
4. Phase 2 staging verification (§5.5) executed, in particular the credit-reconciliation invariant against a real database — the only gate currently covered by an integration test alone.

This is not a GO (no gate has been exercised in a running environment) and not a NO-GO (no gate has failed).
