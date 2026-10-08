-- Phase 6A: Creative audio domain bridge (Approach A).
--
-- Adds a nullable creativeVersionId FK on AudioPerformancePlan so Creative 5.0
-- projects can own audio plans without a StorySequence or StoryProject.
-- Makes sequenceId and projectId nullable — Story domain rows keep both populated;
-- Creative 5.0 rows set only creativeVersionId.
--
-- Also adds creativeVersionId, promptText, providerJobId to AudioAsset for
-- Phase 6C (TTS) traceability — additive only, Story domain rows unaffected.
--
-- All changes are additive. No existing data is modified.

-- ── AudioPerformancePlan: make Story-domain FKs nullable ─────────────────────

ALTER TABLE "audio_performance_plans" ALTER COLUMN "projectId"  DROP NOT NULL;
ALTER TABLE "audio_performance_plans" ALTER COLUMN "sequenceId" DROP NOT NULL;

-- ── AudioPerformancePlan: add creativeVersionId FK ───────────────────────────

ALTER TABLE "audio_performance_plans"
  ADD COLUMN IF NOT EXISTS "creativeVersionId" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'audio_performance_plans_creativeVersionId_fkey'
      AND table_name = 'audio_performance_plans'
  ) THEN
    ALTER TABLE "audio_performance_plans"
      ADD CONSTRAINT "audio_performance_plans_creativeVersionId_fkey"
      FOREIGN KEY ("creativeVersionId")
      REFERENCES "creative_versions"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "audio_performance_plans_creativeVersionId_idx"
  ON "audio_performance_plans"("creativeVersionId");

-- ── AudioAsset: add creativeVersionId FK + generation traceability fields ────

ALTER TABLE "audio_assets"
  ADD COLUMN IF NOT EXISTS "creativeVersionId" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'audio_assets_creativeVersionId_fkey'
      AND table_name = 'audio_assets'
  ) THEN
    ALTER TABLE "audio_assets"
      ADD CONSTRAINT "audio_assets_creativeVersionId_fkey"
      FOREIGN KEY ("creativeVersionId")
      REFERENCES "creative_versions"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "audio_assets_creativeVersionId_idx"
  ON "audio_assets"("creativeVersionId");

ALTER TABLE "audio_assets" ADD COLUMN IF NOT EXISTS "promptText"    TEXT;
ALTER TABLE "audio_assets" ADD COLUMN IF NOT EXISTS "providerJobId" TEXT;
