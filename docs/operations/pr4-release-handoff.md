# PR #4 — Release Handoff & Conditions

Status: **DOCUMENTATION COMPLETE. MERGE NOT AUTHORIZED. RECONCILIATION NOT AUTHORIZED.**

This document freezes the evidence for PR #4 and states the exact conditions for the two
remaining actions (the merge window and the follow-up `enforce_not_null` PR). It authorizes
neither. Both run only on separate, explicit go.

## The three states — do not conflate

| State | Value | Basis |
|---|---|---|
| **Tests passing** | YES | CI run `38412188638`: `API unit tests` + `API integration tests (real PostgreSQL)` pass. Local API suite 1665 passed / 5 skipped / 0 failed; `api` + `web` type-check exit 0. |
| **PR mergeable** | YES | PR #4 OPEN, `isDraft: true`, `MERGEABLE`, `mergeStateStatus: CLEAN`, head `1e2c533`. |
| **Release authorized** | **NO** | Awaiting explicit authorization. Merge window is separate. |

---

## 1. Frozen evidence

- **PR #4 head:** `1e2c533` (`docs: add feature tracker …`) on `feat/raivstream-upgrade` — 36 commits over `main`.
- **Tracker:** `docs/feature-tracker.md` @ `1e2c533`. SHA map verified: 36 cited post-rebase SHAs
  exist and are ancestors of HEAD; 6 patch-id-verified exactly (`656261c→d5e2125`,
  `f25ebde→d9e56b6`, `0e29fb4→f64a412`, `50fdca8→0f20f76`, `682202c→a3e004a`, `fb15410→ee8a4ca`);
  3 amended during conflict resolution (`4814748→dce4352`, `ef6f8d8→14ee523`, `a91881b→e4937ce`);
  remaining rows subject-matched.
- **CI:** run `38412188638` (github.com/tex-node/raivstream/actions/runs/38412188638) — both gates pass.
- **Local:** API `1665 passed | 5 skipped | 0 failed`; type-check api + web green.
- **Prod (unchanged since the PR #2 deploy):** `main @ a4f46a3`, health `healthy` (`database ok`), **0 pending migrations**.

## 2. Database condition (reviewed)

- **Exact future migration name:** `20261013120000_credit_ledger_idempotency_enforce_not_null`
  → `ALTER TABLE "credit_transactions" ALTER COLUMN "idempotencyKey" SET NOT NULL;`
  Confirmed: **no `20261013120000*` migration exists on any branch yet**.
- **Current drift:** `20261012140000_credit_ledger_idempotency_not_null` is recorded **applied**
  (`finished_at` set) on prod, but its effect was manually reverted during the 2026-10-13 incident —
  `credit_transactions.idempotencyKey` is **`is_nullable = YES`**. That is the state the future
  migration reconciles. (`20261012170000_character_reference_assets` also carries one applied row
  and one `rolled_back_at` row — the incident `resolve --rolled-back`; not pending.)
- **Deployment dependency:** the future PR must deploy **after PR #4's code is live AND observed**.
  Reason: PR #4's code writes `idempotencyKey` on every credit path. Enforcing NOT NULL while any
  code that can write NULL is running is exactly the 2026-10-13 incident (64 min of `23502` broken
  credit writes when `20261012140000` was applied ahead of the code).
- **Timing (~1 h):** observe PR #4's deploy for ≈1 hour (health + logs + DB) to confirm no
  NULL-writing code remains before enforcing NOT NULL.

## 3. Merge window — conditions (NOT authorized)

Before merging PR #4, recheck:

- [ ] PR #4 head is the frozen `1e2c533` (or a later, explicitly-reviewed head); still `MERGEABLE` / `CLEAN`.
- [ ] Required CI green on that head (`ci.yml` unit + real-Postgres integration).
- [ ] Prod: 0 pending migrations (currently 0) and schema compatible with PR #4's code.
- [ ] Deploy readiness: `deploy.yml` (push to `main`) runs SSH + `prisma migrate deploy` — a **no-op**
      (all PR #4 migrations, incl. the R16 pair, already applied on prod).
- [ ] Rollback plan: backup `pre_upgrade_migrations_20261013-075155.dump` (2.0M, sha256
      `dce8c2fb4b762f2b2d7c13d2bb5d987fccd7cbaa9ab78b8e0e6fa35d8008b956`); revert the merge on `main`
      and redeploy the prior build if needed.

Merge command (only when authorized): `gh pr merge 4 --merge` — **not** squash; no force-push.

## 4. Post-deploy observation, then reconciliation (NOT authorized)

After the merge deploy, observe **≥ 1 hour**:

- [ ] `main` HEAD = the new merge commit; `raivstream-web` online.
- [ ] Health `healthy`; PM2 logs show only known noise (`Failed to find Server Action`, Stripe warning).
- [ ] DB: 0 pending migrations; spot-check `credit_transactions` writes in the window carry
      `idempotencyKey` (no `23502`) — i.e. no code path writes NULL.

Only then evaluate the standalone `20261013120000_…_enforce_not_null` PR (its own branch/PR). Verify
`SELECT COUNT(*) FROM credit_transactions WHERE "idempotencyKey" IS NULL = 0` before applying; never
edit the already-applied `…140000`.

## Note on this document

Docs-only. Producing it changed no application code, history, tests, or production. It lives on
`feat/raivstream-upgrade` alongside `docs/feature-tracker.md`.
