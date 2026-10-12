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
