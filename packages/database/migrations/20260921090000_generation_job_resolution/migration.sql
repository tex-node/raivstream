-- Generation job output resolution (Phase 16.3) — additive.
-- Adds resolution (MiniMax H3 preset: 480p/720p/768p/1080p) to generation_jobs
-- so retry resubmits with the same resolution. No existing column is altered.

-- AlterTable
ALTER TABLE "generation_jobs" ADD COLUMN "resolution" TEXT;