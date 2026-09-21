-- Generation job query indexes (Phase 15) — additive.
-- Supports dead-letter/status listings and error-code analytics.

-- CreateIndex
CREATE INDEX "generation_jobs_status_createdAt_idx" ON "generation_jobs"("status", "createdAt");

-- CreateIndex
CREATE INDEX "generation_jobs_status_retryCount_idx" ON "generation_jobs"("status", "retryCount");

-- CreateIndex
CREATE INDEX "generation_jobs_errorCode_idx" ON "generation_jobs"("errorCode");
