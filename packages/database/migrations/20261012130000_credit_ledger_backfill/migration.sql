-- Phase 1 — backfill `credit_transactions.idempotencyKey` for legacy rows.
--
-- Every credit transaction predates the idempotency column, so its
-- `idempotencyKey` is NULL. Give each such row a unique, provenance-obvious key
-- so the column can later be made NOT NULL:
--
--     legacy:<row id>
--
-- The `legacy:` prefix marks a derived key (NOT a real deduplicable operation),
-- so it is never mistaken for an actual logical request in future queries.
--
-- Idempotent: only rows still NULL are touched, so re-running is a no-op.
--
-- PRE-DEPLOY (operator, read-only) — count the affected rows:
--     SELECT COUNT(*) FROM credit_transactions WHERE "idempotencyKey" IS NULL;

UPDATE "credit_transactions"
SET "idempotencyKey" = 'legacy:' || "id"
WHERE "idempotencyKey" IS NULL;
