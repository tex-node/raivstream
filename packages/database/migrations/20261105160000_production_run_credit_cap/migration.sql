-- Per-run credit ceiling (Phase 7 auto mode)
--
-- A money ceiling must survive a resume: a run that restarts with its budget in memory starts its
-- spend again from zero. Persisted here, and counted per RUN, not per asset - the per-asset charge
-- (80 for generate:flux2) is a rate, this is "this run may spend at most N".
--
-- Additive and nullable: null means uncapped, which is what every existing run is.

ALTER TABLE "creative_production_runs"
  ADD COLUMN IF NOT EXISTS "creditCeiling" INTEGER,
  ADD COLUMN IF NOT EXISTS "creditsSpent" INTEGER NOT NULL DEFAULT 0;