# Upgrade plan — closing status

Branch `feat/raivstream-upgrade` · candidate base `a9cb10f` (`origin/main`). This is the hand-off document for merge approval.

## 1. Scope

The upgrade plan (delivered as the Phase 1–4 session briefs; not committed as an in-repo file — the closest in-repo record is `docs/operations/phase-0-baseline-report.md`) covers **four phases** and **nine features**:

1. Phase 1 — credit-ledger idempotency; 2. Phase 1 — PL-01 admin usage dashboard; 3. Phase 2 — R16-02 styles; 4. Phase 2 — R16-03 character continuity; 5. Phase 2 — R16-04 batch generation; 6. Phase 2 — R16-05 chapter version history; 7. Phase 3 — Raivstream end card; 8. Phase 4a — R16 publication lifecycle; 9. Phase 4b — share links + per-click attribution.

Candidate base: **`a9cb10f`** (`origin/main`), developed on **`feat/raivstream-upgrade`**.

## 2. Phase-by-phase status

| Phase | Status | Key commits | Gate criteria met |
|---|---|---|---|
| Phase 1 — credit-ledger idempotency + PL-01 | feature-complete · test-verified · production-pending | `3911c14`, `4814748`, `656261c`, `74b05d5`, `b9081e9`, `f25ebde`, `c4bc985` | Every credit write keyed (static coverage gate); reconciliation invariant covered by an integration test |
| Phase 2 — R16-02/03/04/05 | feature-complete · test-verified · production-pending | `682202c`, `e42dcf8`, `ba445e3`, `38b3964`, `6f9447c`, `33ff9fc`, `232143b`, `5ef5933` | 3 R16 styles enforced; approved-character anchor injected; batch partial-failure/retry; chapter history on every edit |
| Phase 3 — end card | feature-complete · test-verified · production-pending | `ef6f8d8`, `a91881b` | `renderOutputDerivative` appends exactly 2 s; preflight guards drawtext/font |
| Phase 4a — publication | feature-complete · test-verified · production-pending | `009b739` | Owner-only submit; feed + by-ID APPROVED-only; withdrawn excluded |
| Phase 4b — sharing | feature-complete · test-verified · production-pending | `5c672a1`, `fb15410`, `befc3c5` | APPROVED-only resolve; attribution to the owner; anonymous vs signed-in distinct; no IP |

## 3. Complete commit inventory (`a9cb10f` → HEAD, oldest first)

1. `611a458` — feat(creative): Phase 6D secure router wiring + TOCTOU-safe music idempotency
2. `7e92b6a` — verify(phase6d): orphan detection, integration test, acceptance record
3. `eab6355` — ci: enforce mandatory API unit + real-PostgreSQL integration gates before deploy
4. `1d0a755` — ci: fix pnpm arg passthrough so the integration JSON report is written
5. `0217f39` — test: fix Phase 6D integration type-check
6. `3911c14` — WIP: Phase 1 credit ledger idempotency + PL-01 admin usage
7. `0e29fb4` — docs: phase-0 baseline report (candidate & architecture)
8. `4814748` — feat(credits): idempotency keys for all credit call sites
9. `656261c` — feat(credits): director idempotency via client-supplied id
10. `74b05d5` — fix(ci): restore exact integration test count assertion
11. `b9081e9` — feat(credits): key the remaining direct CreditTransaction writers
12. `f25ebde` — fix(director): regenerate idempotency id after compose failure
13. `c4bc985` — chore(migrations): credit ledger backfill + not-null
14. `ef6f8d8` — feat(export): two-second Raivstream end card in renderOutputDerivative
15. `682202c` — feat(r16): restrict scene styles to Cartoon, Anime, 3D Animation
16. `ede6c45` — fix(admin): fresh idempotency id per adjustCredits submit
17. `7c7d890` — docs(phase-4): publication & sharing design (R16-only, approved-only, per-click)
18. `a91881b` — feat(export): preflight end-card drawtext/font + verification script
19. `009b739` — feat(publication): R16 submit/withdraw/resubmit lifecycle + feed filter
20. `5ef5933` — feat(story): chapter version history with snapshot restore
21. `e42dcf8` — feat(story): character reference asset model + visualBible anchor seam
22. `ba445e3` — feat(story): character reference generation, approval, and scene continuity
23. `38b3964` — feat(story): draft-character warning banner on scene generation
24. `6f9447c` — feat(story): batch generation run + item models
25. `33ff9fc` — feat(story): batch generation controller + procedures
26. `232143b` — feat(story): batch generation UI + pause-resume procedure
27. `7c2b443` — docs(phase-2): release evidence
28. `5c672a1` — feat(share): share link, attribution, and daily count models
29. `fb15410` — feat(share): share links, per-click attribution, and 90-day retention
30. `befc3c5` — test(share): share target menu assertions
31. `bbab56e` — docs(phase-4): release evidence

(+ this document's commit.)

## 4. Complete migration inventory (in order)

| # | Migration | Introduced by | Additive? |
|---|---|---|---|
| 1 | `20261009110000_phase6d_music_cue_lock` | `611a458` | yes (partial unique index) |
| 2 | `20261012120000_credit_ledger_idempotency` | `3911c14` | yes (nullable column + index) |
| 3 | `20261012130000_credit_ledger_backfill` | `c4bc985` | yes (data `UPDATE` only) |
| 4 | `20261012140000_credit_ledger_idempotency_not_null` | `c4bc985` | **NOT additive** — `SET NOT NULL`; safe only after #3 |
| 5 | `20261012150000_phase4a_video_publication` | `009b739` | yes (3 nullable columns) |
| 6 | `20261012160000_story_chapter_versions` | `5ef5933` | yes (new table) |
| 7 | `20261012170000_character_reference_assets` | `e42dcf8` | yes (enum + table + 2 nullable columns) |
| 8 | `20261012180000_batch_generation` | `6f9447c` | yes (2 enums + 2 tables) |
| 9 | `20261012190000_share_links` | `5c672a1` | yes (3 new tables) |

Inventory **complete and ordered**; apply with `prisma migrate deploy` in the # order. All columns are camelCase. **Only #4 is non-additive**, and it is safe precisely because #3 backfills first.

## 5. Decisions log

| # | Decision | Made (turn) | Resolution |
|---|---|---|---|
| C1 | Is Movie Builder eligible for the end card? | Phase 3 task | **No** — `movieRenderWorker.ts` untouched; card only on `renderOutputDerivative` |
| B1 | Are the 3 styles R16-only? | Phase 2 / R16-02 | R16 restricts to 3; main app keeps all 10 |
| R16-02 | Style mapping | Phase 2 / R16-02 | Anime→`ANIME`; 3D Animation→`THREE_D_ANIMATED` (label); Cartoon→**new `CARTOON`**; dropped styles compat-read; code-only (no DB enum) |
| R16-03 | Approval model + reference storage | Phase 2 / R16-03 | Dedicated `CharacterReferenceAsset` (not `StorySceneAsset`); approve-before with a "use draft" escape; anchor via `applyMasterVisualBible.approvedReferences` |
| R16-04 | Concurrency + cap + queue | Phase 2 / R16-04 | DB-backed in-process queue; concurrency **2**, independent of `PROVIDER_MAX_CONCURRENCY`; cap default **10000**, fail-closed; recovery per-request, 30 s guard |
| R16-05 | Snapshot vs diff + retention | Phase 2 / R16-05 | **Snapshot** (full body); cap 50 per chapter, always keep newest 10 |
| PL-01 | Adjustment handling | Phase 1 | Reconciler **reports, never mutates**; admin adjustment id fresh per submit (not input-coupled) |
| Phase 4 | Scope / sharing / attribution / retention / compliance | Phase 4 design + 4a/4b | R16-only; APPROVED-only (else identical 404); **per-click** attribution; 90-day retention; **no IP**; viewer id only when signed in |
| Phase 4 | Upload-path end card | This task | **Option A** — uploads are not exports; direct uploads are intentionally not end-carded |

## 6. Outstanding operator actions

1. **Apply migrations #1–#9 (§4), in order** (`prisma migrate deploy`). #4 only after #3.
2. **Verify the end card on the VPS:** `pnpm verify:end-card` (ffmpeg/ffprobe host) — duration = source + 2 s, one h264 + one aac, handle visible; confirm `drawtext` + a resolvable font.
3. **Confirm VPS HEAD:** `git -C /root/raivstream rev-parse HEAD` (session.md's deployed-commit line is stale; `origin/main` = `a9cb10f`).
4. **PR hygiene:** merge `ci/phase6d-gates` (PR #3) first, then rebase `ci/r16-test-gates` (PR #2) onto the new `main`.
5. **Run the Phase 2 staging verification** (`docs/operations/phase-2-release-evidence.md` §5.5) — especially the real-DB reconciliation invariant.
6. **Run the Phase 4 staging verification** (`docs/operations/phase-4-release-evidence.md` §5.5) — especially anonymous vs signed-in attribution and the APPROVED-only 404.
7. **Optionally schedule share-attribution retention** (currently admin-triggered only).

## 7. Risks carried to production

- **drawtext / font dependency.** The end card needs an ffmpeg with `drawtext` and a resolvable font; the preflight disables the card (loud log) rather than failing the export — so a minimal VPS could ship uncarded videos silently. Verify on the VPS.
- **Integration test behind the reconciliation gate.** The credit-reconciliation invariant runs only under `test:integration` (real PostgreSQL), not the default suite; it has **not** been run against a live DB here.
- **Migrations unapplied.** Nine migrations are pending; the app will fail at runtime on new columns/tables until applied (in order, #4 after #3).
- **PR conflicts.** PR #2 and PR #3 touch 13 overlapping files with different SHAs; merge #3 then rebase #2 or conflicts are guaranteed.
- **session.md staleness.** The deployed-commit claim is stale; do not trust it for the VPS HEAD.

## 8. What is NOT in this upgrade

- **Movie Builder end card** — decision C1; `movieRenderWorker.ts` is untouched.
- **Upload-path end card** — decision Phase 4/Option A; direct uploads are not exports.
- **R16-03/04 cross-app (main-app) features** — both are R16-scoped.
- **Anything Phase 5+** — no Phase 5 work is included.
- **Scheduled retention** — manual/admin-triggered only.
