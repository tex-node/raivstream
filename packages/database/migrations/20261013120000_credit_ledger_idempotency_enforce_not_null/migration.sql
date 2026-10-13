-- Reconciliation migration: re-enforces NOT NULL on credit_transactions.idempotencyKey.
-- The constraint was originally applied via 20261012140000_..._not_null during the
-- 2026-10-13 migration incident, then manually dropped to restore production credit
-- writes while the old code was still running. The new code (PR #4, merged 6057bdf)
-- writes keys on every insert; this migration restores the constraint in a controlled
-- step per docs/operations/migration-runbook.md.
--
-- Preconditions to verify BEFORE applying:
--   1. Running code is 6057bdf or later (writes keys)
--   2. SELECT COUNT(*) FROM credit_transactions WHERE "idempotencyKey" IS NULL = 0
--   3. Fresh backup taken
--   4. Scratch-restore validation passed (separately authorized)

ALTER TABLE "credit_transactions"
  ALTER COLUMN "idempotencyKey" SET NOT NULL;
