-- Run instrumentation: structured drops and a retry counter (2026-11-06)
--
-- The fourth auto run could not be interpreted: `dropped=0` proved nothing because the outer
-- failure handler overwrites `errorMessage` with the last error message, erasing any
-- SCENE_DROPPED marker written earlier. A message string is a channel that later code can clobber;
-- a structured field is not.
--
-- Additive and nullable.

ALTER TABLE "creative_production_runs"
  ADD COLUMN IF NOT EXISTS "droppedAssets" JSONB,
  ADD COLUMN IF NOT EXISTS "moderationRetries" INTEGER NOT NULL DEFAULT 0;