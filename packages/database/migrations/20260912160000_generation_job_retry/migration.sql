-- Generation job retry + normalized error code (Phase 15 / §7.2) — additive.
-- Adds retryCount (provider retries) and errorCode (normalized error) to
-- generation_jobs. No existing column is altered.

-- AlterTable
ALTER TABLE "generation_jobs" ADD COLUMN "errorCode" TEXT;
ALTER TABLE "generation_jobs" ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0;
