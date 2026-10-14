# Migration runbook

Operational procedure for applying Prisma migrations to **production** Raivstream. This runbook is mandatory for any batch that includes a **breaking** migration. It exists because of the **2026-10-13 credit-ledger incident** (see §3).

## 1. Mandatory pre-flight (before every `prisma migrate deploy` against production)

Run these checks in order. **Any check that fails blocks the deploy.**

### Check A — Record running code version
```bash
git -C /root/raivstream rev-parse HEAD
```
Also record `origin/main` SHA at the moment of migration. If the running app precedes the migrations by more than one merge, **investigate before proceeding**.

### Check B — Classify every pending migration
```bash
pnpm --filter @raivstream/database exec prisma migrate status
```
For each pending migration, classify it and record it in a table:

- **Additive** — new nullable column, new table, new index, `ALTER TYPE … ADD VALUE`.
- **Breaking** — `SET NOT NULL`, `DROP COLUMN`, `DROP TABLE`, type change, rename, a unique constraint on an existing column that has NULLs, an FK with default-NOT-NULL.

Also **verify each referenced table name against the model's `@@map`** (the 2026-10-13 batch also carried an FK written against `story_character_memories` when the table is `story_character_memory`).

### Check C — Expand/contract gate (mandatory)
If **any** pending migration is **breaking**, the running code must satisfy the new constraint **before** the migration applies. Two correct sequences:

**Option 1 — deferred constraint (preferred):**
1. Ship the schema-add migration (nullable column or new table) **with** the code that writes it.
2. Deploy the code.
3. Add a **new** migration enforcing the constraint (`SET NOT NULL`, etc.).
4. Merge, deploy.

**Option 2 — separate migration deployment:**
1. Apply only the additive migrations; for the breaking ones, mark them applied **without running** via `prisma migrate resolve --applied <name>`.
2. Deploy the code.
3. Run the breaking change as a **new** migration file.

> **Do NOT rename migration directories to defer them.** Prisma treats **any** directory under `prisma/migrations/` as a migration, including suffixed names (`.hold`). This is exactly what caused the 2026-10-13 incident — the renamed `…_not_null.hold` folder was applied as a real migration.

### Check C-1 — Branch vs. target-branch migration state
Before applying any migration from branch X, verify that X's `prisma/migrations/` directory is a **superset of all migrations already applied to the target database**. If not, apply via a **scratch union branch**, not directly from X. Cause: parallel branches can fork migration history (see the 2026-10-13 R16-union case). A branch missing migrations that are applied on the target will report **DIVERGED** in `migrate status` and block clean verification.

### Check C-2 — TS union ↔ DB enum parity
If a PR adds an identifier to a TypeScript union that mirrors a Prisma/Postgres enum, verify the DB enum was extended in the same PR. A TS-only addition passes CI and fails at first production write. (Learned 2026-10-14: `SupportedModel.FLUX2_EDIT` was added without a matching `GenerationModel` value; the failure surfaced only when the routing first fired against production.)

### Check D — Backup (non-negotiable)
```bash
pg_dump -Fc -f /root/raivstream/backups/pre_migration_$(date +%Y%m%d-%H%M%S).dump "$DATABASE_URL"
sha256sum /root/raivstream/backups/pre_migration_*.dump | tail -1
```
Record the path + SHA256.

> Note: in a non-interactive `ssh` session `$DATABASE_URL` is **not** exported — source it from `/root/raivstream/.env` first.

### Check E — Record pre-migration invariants
For every migration that writes data (backfills/aggregations), record the **before** value, e.g.
```bash
psql "$DATABASE_URL" -c 'SELECT COUNT(*) FROM credit_transactions WHERE "idempotencyKey" IS NULL;'
```
Not applicable to purely structural migrations (new table). Remember: a count on a column a *pending* migration introduces cannot be taken before the migration — use the row count of the whole table as the "before" figure.

### Check F — Post-migration write smoke
After `migrate deploy` succeeds, verify the running code can still **write** to every table whose schema changed. A health check alone is insufficient — it only proves the DB is reachable. Run a read-only sanity insert + rollback against each changed table:
```bash
psql "$DATABASE_URL" -c 'BEGIN; INSERT INTO credit_transactions (id,"userId",amount,type,"balanceBefore","balanceAfter","createdAt") VALUES (gen_random_uuid(),(SELECT id FROM users LIMIT 1),0,'"'"'USAGE'"'"',0,0,now()) RETURNING id; ROLLBACK;'
```

### Check G — Health check
```bash
curl -s https://app.raivstream.com/api/health
```
Expected `{"status":"healthy",…}`. If not healthy, **roll back the migrations or roll forward the code — do not leave the DB and code mismatched.**

## 1b. Environment-file precedence (empirical)
The running app's PM2 exec cwd is `/root/raivstream/apps/web`. **`apps/web/.env.local` wins over the root `/root/raivstream/.env` on conflicts; both load.** Flag changes go in `apps/web/.env.local`. No symlink exists.

**Follow-up:** `FAL_MAX_REQUESTS` diverges (10 in root `.env` vs 200 in `.env.local`; the running process uses 200). Reconcile to a single value (keep 200, remove the root line).

## 2. Rollback guidance

- **Additive** migrations: no rollback needed; leave the columns/tables in place.
- **`SET NOT NULL`**: rollback is `ALTER COLUMN … DROP NOT NULL` — always safe.
- **`DROP COLUMN` / `DROP TABLE`**: rollback requires the pre-migration backup (§1 Check D). Do not run without one.
- **Failure mid-batch**: Prisma leaves the partial state; run `prisma migrate resolve --rolled-back <name>` for the failed entry, then re-apply. Prisma records a rolled-back audit row alongside the successful one — that is expected. **Do NOT hand-edit `_prisma_migrations` unless Prisma's own resolve fails.**

## 3. Post-incident reference — 2026-10-13 credit-ledger incident

- **Cause:** a batch applied `SET NOT NULL` on `credit_transactions.idempotencyKey` (migration `20261012140000_credit_ledger_idempotency_not_null`) while the running code (`a9cb10f`) did **not** set that column. Compounded by a **`.hold`-suffix directory rename** intended to defer the migration — Prisma treated it as a real migration and applied it.
- **Impact:** ~64 minutes (**05:53:02 → 06:56:45 UTC**) during which every `credit_transactions` insert by the live app failed with `23502`.
- **Remediation:** `ALTER TABLE credit_transactions ALTER COLUMN "idempotencyKey" DROP NOT NULL;` (service restored); a **new** migration will re-enforce NOT NULL **after** the code that sets keys is deployed.
- **Lesson:** **Check C is mandatory**, and the **`.hold` trick is prohibited**.
- **Resolution:** the constraint was re-enforced via `20261013120000_..._enforce_not_null` on 2026-10-13, after the new code (PR #4) was deployed and a live keyed write was observed. Full reconciliation record: docs/feature-tracker.md.

## 4. Applied-migration checksum discipline

**Never edit a migration file that has been applied.** Prisma records its checksum; editing makes `migrate deploy` refuse (and `prisma migrate status` report a mismatch). If a change is needed, **add a new migration file** (e.g. `20261013120000_…`), never modify an applied one.
