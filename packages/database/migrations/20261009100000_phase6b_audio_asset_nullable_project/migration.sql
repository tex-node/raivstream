-- Phase 6B: Creative 5.0 TTS bridge
-- Make AudioAsset.projectId nullable so Creative 5.0 assets (anchored to
-- creativeVersionId from Phase 6A) do not require a StoryProject row.
-- Story-domain assets keep their projectId populated — no data change.

DO $$ BEGIN
  -- Only alter if column is still NOT NULL (idempotent guard)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audio_assets'
      AND column_name = 'projectId'
      AND is_nullable  = 'NO'
  ) THEN
    ALTER TABLE "audio_assets" ALTER COLUMN "projectId" DROP NOT NULL;
  END IF;
END $$;
