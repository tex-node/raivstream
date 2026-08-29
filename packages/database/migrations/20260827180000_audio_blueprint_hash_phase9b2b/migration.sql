-- Phase 9B.2B: add a standalone, nullable audio-only blueprint hash for
-- render provenance/debugging (see schema.prisma comment on
-- MovieRenderJob.audioBlueprintHash). Purely additive; does not touch
-- renderPlanHash or any other existing column.
ALTER TABLE "movie_render_jobs" ADD COLUMN "audioBlueprintHash" TEXT;
