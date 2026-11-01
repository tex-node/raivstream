-- Phase 3 measurement: persist the critic's score vector with the review run.
--
-- The nine dimension scores were computed and then discarded in translation, so the
-- review payload could not show that scores vary between assets - the number that
-- proves the critic is not returning a constant. Additive: one nullable column.
ALTER TABLE "creative_review_runs" ADD COLUMN IF NOT EXISTS "scores" JSONB;