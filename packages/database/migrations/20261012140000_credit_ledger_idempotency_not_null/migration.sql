-- Phase 1 — make `credit_transactions.idempotencyKey` mandatory (NOT NULL).
--
-- Separate from 20261012130000_credit_ledger_backfill on purpose: an operator can
-- pause between the backfill and this step if the backfill surprises them.
--
-- Apply AFTER 20261012130000_credit_ledger_backfill. Every direct
-- `creditTransaction.create` writer now sets an `idempotencyKey`:
--   - packages/api/src/lib/credits.ts helpers (deductCredits / refundCredits) —
--     keyed by every caller, enforced by creditIdempotencyCoverage.test.ts
--   - packages/api/src/lib/mediaProviders/webhookProcessing.ts (fal refund outbox)
--   - packages/api/src/routers/admin.ts (admin.adjustCredits)
--   - apps/web/src/app/api/paystack/verify/route.ts (purchase grant)
-- If the 20261012130000 count query still returns NULL rows, either the backfill
-- has not run or a writer outside the scanned roots (packages/api/src +
-- apps/web/src) exists — check before applying.

ALTER TABLE "credit_transactions"
  ALTER COLUMN "idempotencyKey" SET NOT NULL;
