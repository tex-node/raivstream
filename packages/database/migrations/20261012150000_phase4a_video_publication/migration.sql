-- Phase 4a — publication lifecycle columns on `videos`.
--
-- Additive and NULLABLE: existing rows get NULL (not yet submitted / no reason /
-- not withdrawn) — no backfill required. Column names are camelCase to match the
-- repo convention (see the prior snake_case production incident in session.md).
--
-- Prerequisite: apply AFTER 20261012140000_credit_ledger_idempotency_not_null.

ALTER TABLE "videos"
  ADD COLUMN "submittedForPublicationAt" TIMESTAMP(3),
  ADD COLUMN "moderationReason"          TEXT,
  ADD COLUMN "withdrawnAt"               TIMESTAMP(3);
