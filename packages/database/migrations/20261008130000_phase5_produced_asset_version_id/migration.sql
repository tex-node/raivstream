-- Phase 5: Link produced assets to the creative version they were generated under.
-- Additive only — no existing data is modified.

ALTER TABLE "creative_produced_assets"
  ADD COLUMN IF NOT EXISTS "versionId" TEXT;

-- FK to creative_versions; null-safe (SET NULL on version delete).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'creative_produced_assets_versionId_fkey'
      AND table_name = 'creative_produced_assets'
  ) THEN
    ALTER TABLE "creative_produced_assets"
      ADD CONSTRAINT "creative_produced_assets_versionId_fkey"
      FOREIGN KEY ("versionId")
      REFERENCES "creative_versions"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "creative_produced_assets_versionId_idx"
  ON "creative_produced_assets"("versionId");
