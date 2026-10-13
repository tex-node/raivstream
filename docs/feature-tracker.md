# Raivstream — Feature Tracker

The single source of truth for what's implemented, tested, qualified, and deployed.
Update one row per feature per status change. Never conflate the four states.

## Status legend

| Status | Meaning |
|---|---|
| **IDEA** | Proposed, no design work started |
| **DESIGNED** | Design doc or ADR exists; no code |
| **IMPLEMENTED** | Code committed on a branch |
| **TESTED** | Unit + integration tests green in CI |
| **STAGING-QUALIFIED** | Exercised end-to-end against a real staging environment |
| **DEPLOYED** | Live in production, verified healthy |

**Rule:** a feature is never "done" until its row reads DEPLOYED with a commit SHA in the Notes column.

> **Statuses are not interchangeable.** TESTS PASSING ≠ PR MERGEABLE ≠ RELEASE AUTHORIZED.
> Track A and Track B are both **DEPLOYED** to production. The upgrade plan is fully deployed
> and the 2026-10-13 incident is reconciled (Open decisions #1 and #2, both resolved).

## Current release tracks

| Track | Contents | Status |
|---|---|---|
| **A — Upgrade (Phase 0–4)** | `feat/raivstream-upgrade`, PR #4 | **DEPLOYED** (`6057bdf`; incident reconciliation `542939e`) |
| **B — R16 A/B/C** | R16 video audio pipeline | **DEPLOYED** (`a4f46a3`) |
| **C — Admin observability** | Per-user drill-down (extends PL-01) | **PROPOSED** — not started |

---

## Track B — R16 video audio (DEPLOYED)

Merged 2026-10-13 as PR #2. Production HEAD `a4f46a3`, healthy.

> Note: Track B was merged via a rebased/cherry-picked branch, so its commits on `main`
> are `fb332b8`, `24db068`, `b0e5c91`, `1f3a810` (merged at `a4f46a3`). Any reference to the
> pre-rebuild SHAs (`c188f76`, `433f0aa`, `9d8ca17`, `25d7ee9`) should be read as those.

| Feature | Status | Commit(s) | Evidence | Deployed |
|---|---|---|---|---|
| Narration script generation + moderation | DEPLOYED | `fb332b8` | `narrationScript.test.ts` | `a4f46a3` |
| Background music (Lyria, fail-closed) | DEPLOYED | `b0e5c91` | integration tests | `a4f46a3` |
| FFmpeg audio mux + export threading | DEPLOYED | `24db068` | integration tests | `a4f46a3` |
| Narration recovery fix | DEPLOYED | `1f3a810` | `narrationScript.test.ts` | `a4f46a3` |
| Migrations `20261009120000` + `20261009130000` | DEPLOYED | 2026-10-13 | `_prisma_migrations` rows | prod |

---

## Track A — Upgrade (Phase 0–4)

Branch `feat/raivstream-upgrade`, PR #4 — **DEPLOYED** (`6057bdf`). Migrations applied on prod;
the `idempotencyKey` constraint was reconciled on 2026-10-13 (`542939e`).

### Phase 0 — Baseline audit

| Feature | Status | Commit(s) | Evidence | Deployed |
|---|---|---|---|---|
| Candidate + architecture verification report | DEPLOYED (docs) | `f64a412`, `0f20f76` | `docs/operations/phase-0-baseline-report.md` | committed |

### Phase 1 — Credits and usage accountability

| Feature | Status | Commit(s) | Evidence | Deployed |
|---|---|---|---|---|
| Idempotency keys on all credit call sites | DEPLOYED | `dce4352` | `creditIdempotencyCoverage.test.ts` | `6057bdf` |
| Director idempotency (client-supplied id) | DEPLOYED | `d5e2125`, `d9e56b6` | `directorIdempotency.test.ts` | `6057bdf` |
| Remaining direct writers keyed (webhook, admin, paystack) | DEPLOYED | `7c83c0c` | coverage gate | `6057bdf` |
| Music charge per-cue fix (under-charge bug) | DEPLOYED | `a56597b` | `musicChargeRace.test.ts` | `6057bdf` |
| R16 narration + background-music charge keying (rebase integration) | DEPLOYED | `67b743b` | `phase_r16_music.test.ts` §D + coverage gate | `6057bdf` |
| Admin usage dashboard (PL-01) | DEPLOYED | `98c22c7` | `creditReporting.test.ts` | `6057bdf` |
| Ledger backfill + NOT NULL migrations | DEPLOYED | `6feb6df` | `migration-runbook.md` | reconciled 2026-10-13 |
| NOT NULL enforce (reconcile) | DEPLOYED | `9f90438` | `542939e` | constraint enforced; `is_nullable = NO` |

**Accepted limitations:**
- 14 test/staging accounts carry pre-existing balance/ledger drift (documented, no remediation)
- Sentry not configured in production → incident detection via health + PM2 logs only
- Automated stuck-reservation recovery: deferred
- Browser/mobile runtime acceptance: pending

### Phase 2 — R16 creation reliability

| Feature | Status | Commit(s) | Evidence | Deployed |
|---|---|---|---|---|
| R16-02 — Style restriction (Cartoon, Anime, 3D Animation) | DEPLOYED | `a3e004a` | `r16VisualStyle.test.ts` | `6057bdf` |
| R16-03 — Character reference approval | DEPLOYED | `e9d47ec`, `8fe7df7` | `characterReferences.test.ts` | `6057bdf` |
| R16-03 — Draft-reference warning banner | DEPLOYED | `5e3dfb5` | `draftReferenceWarning.test.ts` | `6057bdf` |
| R16-04 — Batch generation (server) | DEPLOYED | `324abc0`, `915c7be` | `batchGeneration.test.ts` | `6057bdf` |
| R16-04 — Batch UI + pause-resume | DEPLOYED | `2145173` | `batchGenerationUi.test.ts` | `6057bdf` |
| R16-05 — Chapter version history | DEPLOYED | `354f882` | `chapterVersioning.test.ts` | `6057bdf` |
| Phase 2 release evidence | DEPLOYED (docs) | `5b18aff` | `docs/operations/phase-2-release-evidence.md` | committed |

**Accepted limitations:**
- `affectedSceneIdsForChapterEdit` returns all scenes when mapping unavailable (conservative)
- Batch concurrency fixed at 2, no user override
- R16-03 allows "use draft" without approval (by design)

### Phase 3 — Branded video output

| Feature | Status | Commit(s) | Evidence | Deployed |
|---|---|---|---|---|
| Two-second end card in `renderOutputDerivative` | DEPLOYED | `14ee523` | `endCard.test.ts` + `pnpm verify:end-card` PASS on VPS | `6057bdf` |
| Preflight (drawtext/font) + verification script | DEPLOYED | `e4937ce` | verify script | `6057bdf` |

**Verified:** `ffmpeg 6.1.1-3ubuntu5`; 8.02s output, h264 1080×1920 + aac.
**Scope:** end card rides the render pipeline only. Direct uploads do not carry it (Option A — accepted).

### Phase 4 — Publishing and sharing

| Feature | Status | Commit(s) | Evidence | Deployed |
|---|---|---|---|---|
| Publication lifecycle (submit/withdraw/resubmit) | DEPLOYED | `ca2d84f` | `publication.test.ts` | `6057bdf` |
| Feed `withdrawnAt` filter + `getById` tightening | DEPLOYED | `ca2d84f` | `publication.test.ts` | `6057bdf` |
| Share link model + attribution | DEPLOYED | `1d2bb4e`, `ee8a4ca` | `shareLinks.test.ts` | `6057bdf` |
| Retention (90-day aggregate) | DEPLOYED | `ee8a4ca` | `shareAttributionRetention.test.ts` | `6057bdf` |
| Share menu (WhatsApp, Instagram, copy, native) | DEPLOYED | `4027580` | `shareTargets.test.ts` | `6057bdf` |
| Phase 4 design doc | DEPLOYED (docs) | `ed5343c` | `docs/architecture/phase-4-publication-sharing.md` | committed |
| Phase 4 release evidence | DEPLOYED (docs) | `6cea587` | `docs/operations/phase-4-release-evidence.md` | committed |

**Scope:** R16-only; APPROVED-only sharing; per-click attribution; retention 90d rolling.
**Accepted limitations:** end card absent on direct uploads; retention aggregation manual; native share best-effort.

### Infrastructure / process

| Feature | Status | Commit(s) | Evidence | Deployed |
|---|---|---|---|---|
| Migration pre-flight runbook (Checks A–G + C-1) | DEPLOYED (docs) | `d85a6f6`, `a0039c5` | `docs/operations/migration-runbook.md` | committed |
| Integration count guard (`>=14`) | DEPLOYED | `24f798f` | CI green (`38412188638`) | main |
| Upgrade closing status | DEPLOYED (docs) | `096b5d0` | `docs/operations/upgrade-plan-closing-status.md` | committed |

---

## Track C — Admin per-user observability (PROPOSED)

Extends PL-01 from aggregate usage reporting to per-user drill-down. Depends on Phase 1 credit
idempotency (ledger trustworthiness) — which is in PR #4. Does not depend on PR #4 shipping first,
but the ledger view will show the 14 test-account drift cases until those are resolved.

Today's PL-01 admin view is aggregate: totals across all users, one row per user in a list, no
click-through. This track adds the drill-down.

### C1 — Admin per-user summary panel

| Feature | Status | Notes |
|---|---|---|
| Per-user summary view | IDEA | Click a user in `/admin/users` → `/admin/users/[userId]`. Shows: current balance, lifetime credits consumed, media generation count (images / videos / audio broken out), total assets in library, account age, role, tier. |
| Data sources | — | `credit_balances`, `credit_transactions` (aggregated), `generation_jobs` (count by type), `story_scene_assets`, `audio_assets`, `videos` |
| API | — | New `admin.getUserSummary({ userId })`, `adminProcedure`-gated |

### C2 — Admin per-user token history + media library

| Feature | Status | Notes |
|---|---|---|
| Token (credit) history tab | IDEA | Paginated `credit_transactions` for the selected user. Columns: timestamp, type (PURCHASE/USAGE/BONUS/REFUND/ADMIN_ADJUST), amount, featureKey, referenceId, balanceBefore, balanceAfter. Filters: date range, type, featureKey. Export CSV. |
| Media library tab | IDEA | Browsable list of every generated or uploaded asset for the user, with thumbnails. Union across: `StorySceneAsset` (IMAGE + VIDEO), `Video` (creator uploads), `AudioAsset` (narration + music). Columns: created, type, project, status, asset URL, generation job link. Filters: asset type, project, status, date range. |
| Drill-down linkage | IDEA | Each asset row links to the source `GenerationJob` (cost provenance) and the source project/scene. |
| API | — | `admin.getUserTokenHistory({ userId, cursor, filters })` and `admin.getUserMediaLibrary({ userId, cursor, filters })`, `adminProcedure`-gated, cursor-paginated |

### Track C — open questions

1. **Scope of "token usage."** Credits consumed (USAGE only), or total activity (purchases + grants + consumption)? Summary should show both, clearly separated.
2. **Media library asset ownership.** Uploads are `Video.creatorId`; generated assets live under `StorySceneAsset` (project → user); audio under `AudioAsset`. Confirm: does a project shared with a collaborator expose its assets in the collaborator's admin view, or only the project owner's?
3. **Retention vs. browsing.** Cap at N most recent, or paginate fully? Recommend paginate with a "showing latest 500" default.
4. **CSV export.** Needed for support workflows, or is on-screen enough? Cheaper now than after UI is built.

### Track C — effort estimate

- C1 (summary panel): ~1 day
- C2 (history + library tabs, API + UI): ~2–3 days
- Test coverage: ~0.5 day
- **Total: ~1 week**

### Track C — dependencies

- Phase 1 ledger must be complete (PR #4)
- 14-account drift cases will appear in the history tab; summary should exclude or clearly flag them (see Open decisions #5)

---

## Product backlog (not started)

Ordered by leverage. Do not start more than one of these at a time.

| Feature | Status | Notes |
|---|---|---|
| World Builder (Phase 7A) | IDEA | Proposal only. Persistent locations, props, world rules, World→Story→Character→Scene DNA. Highest product differentiator. |
| Timeline Editor integration | IDEA | Sequence Workspace exists on `-phase9a` worktree. Reconcile before scoping new work. |
| Movie Builder production | IDEA | Exists on `-phase9b1-current` at `phase-9b1a-v2`. Not merged to main. |
| Scene transition generator (7D) | IDEA | Not started. Depends on Movie Builder. |
| Voice/narration for non-R16 | IDEA | R16 has narration; non-R16 story flow does not. |
| Phase 8 universe features | IDEA | Shared worlds, storybook collections. Depends on World Builder. |

---

## Branch hygiene (check monthly)

12 worktrees exist. Not all are active. Stale worktrees are where work silently diverges.

| Worktree | Branch | Last known state | Disposition |
|---|---|---|---|
| `raivstream` | `main` | `a4f46a3` | Active |
| `raivstream-upgrade` | `feat/raivstream-upgrade` | PR #4 (`67b743b`) | Active |
| `raivstream-ci6d` | (merged) | — | Archive/remove |
| `-phase9a` | Phase 9A sequence | `f2ed6b4` | Reconcile before Timeline work |
| `-phase9a-current` | Phase 9A | `3dadd70` | Superseded? Verify |
| `-phase9b1-current` | Movie Builder | `3dadd70` | Reconcile before Movie work |
| `-phase9b2-audio` | Audio layer | `f2dd60a` | Separate release; staging-qualified |
| `-ui-redesign` | UI | `4cf01ed` | Status unknown |
| `-prompt-quality` | Prompt quality | `f2ed6b4` | Status unknown |
| `-library-commit` | (detached) | `2517bce` | Investigate or remove |
| 2× `.claude/worktrees/*` | various | — | Ephemeral |

**Action:** classify each as ACTIVE / HOLD / ARCHIVE monthly. Delete ARCHIVE worktrees.

---

## Open decisions

| # | Decision | Blocks |
|---|---|---|
| 1 | Merge PR #4 in its window? | **RESOLVED** — merged (`6057bdf`) |
| 2 | When to add `20261013120000_..._enforce_not_null`? | **RESOLVED** — applied (`542939e`); constraint enforced |
| 3 | Is "skip end card on preflight failure" acceptable? | Phase 3 policy |
| 4 | Which product thread starts first — World Builder vs. Timeline/Movie Builder? | Product roadmap |
| 5 | Do the 14 drifted accounts need a seed-script fix? | Reconciliation integrity for future test accounts |
| 6 | Track C scope — build both C1 and C2, or C1 first? | Admin observability work |
| 7 | Token history retention — show all-time or rolling window? | Track C ledger view |

---

## Release acceptance checklist

For each release track, all must be true before declaring DEPLOYED:

- [ ] All feature rows read IMPLEMENTED or better
- [ ] CI green (unit + integration, real Postgres)
- [ ] Migrations classified additive vs. breaking; breaking ones applied post-code-deploy only
- [ ] Staging qualified (real media, real providers where applicable)
- [ ] Pre-flight runbook Checks A–G completed
- [ ] Production health observed ≥ 1 hour post-deploy
- [ ] Rollback plan documented

### Track A — checklist state (DEPLOYED)

- [x] All feature rows DEPLOYED
- [x] CI green — runs `38415105321` (PR #4) and `38429242486` (PR #5)
- [x] Type-check green (api + web); API suite 1665 passed / 5 skipped / 0 failed locally
- [x] Migrations applied on prod; `migrate status` up to date
- [x] Merge window authorized and executed — PR #4 (`6057bdf`)
- [x] Post-deploy health ≥ 1h observation — 4/4 samples healthy, 0 × `23502`
- [x] `20261013120000_..._enforce_not_null` applied — PR #5 (`542939e`); constraint enforced

---

## Last updated

2026-10-13 — Upgrade plan **fully deployed**. PR #4 merged (`6057bdf`); PR #5 reconciliation merged
(`542939e`) re-enforcing `credit_transactions.idempotencyKey` NOT NULL. Live verification: 16 keyed
charges pre-constraint + keyed charges post-constraint; 0 × `23502`. The 2026-10-13 incident is
**reconciled**. Track C (admin per-user observability) remains proposed, not started.

### SHA map (pre-rebase → post-rebase) and verification basis

Patch-id-verified (exact content match): `656261c→d5e2125`, `f25ebde→d9e56b6`, `0e29fb4→f64a412`,
`50fdca8→0f20f76`, `682202c→a3e004a`, `fb15410→ee8a4ca`.

Amended during conflict resolution (map by subject + position; patch-id differs as expected):
`4814748→dce4352` (story.ts import union), `ef6f8d8→14ee523` (render.ts/storyVideoExport union),
`a91881b→e4937ce` (render.ts union).

Subject-matched (distinctive subjects): `b9081e9→7c83c0c`, `c8f4adb→a56597b`, `3911c14→98c22c7`,
`c4bc985→6feb6df`, `e42dcf8→e9d47ec`, `ba445e3→8fe7df7`, `38b3964→5e3dfb5`, `6f9447c→324abc0`,
`33ff9fc→915c7be`, `232143b→2145173`, `5ef5933→354f882`, `7c2b443→5b18aff`, `009b739→ca2d84f`,
`5c672a1→1d2bb4e`, `befc3c5→4027580`, `7c7d890→ed5343c`, `bbab56e→6cea587`, `dde0e00→096b5d0`,
`c4b3592→d85a6f6`, `3a827d9→a0039c5`, `dc8f083→24f798f`.

**Unresolved:** none outstanding. Track B's pre-rebuild SHAs (`c188f76`, `433f0aa`, `9d8ca17`,
`25d7ee9`) are superseded by `fb332b8`/`24db068`/`b0e5c91`/`1f3a810` on `main`.

Next review: none outstanding — upgrade plan deployed and incident reconciled. Product backlog
(World Builder / Timeline / Movie Builder) is the next thread, when chosen.
