-- Creative take model (2026-11-03)
-- A scene is produced again as a NEW row; the previous take is demoted, never deleted.
ALTER TABLE "creative_produced_assets" ADD COLUMN IF NOT EXISTS "takeNumber" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "creative_produced_assets" ADD COLUMN IF NOT EXISTS "parentTakeId" TEXT;
ALTER TABLE "creative_produced_assets" ADD COLUMN IF NOT EXISTS "isLatest" BOOLEAN NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'creative_produced_assets_sceneId_kind_takeNumber_key'
  ) THEN
    ALTER TABLE "creative_produced_assets"
      ADD CONSTRAINT "creative_produced_assets_sceneId_kind_takeNumber_key"
      UNIQUE ("sceneId", "kind", "takeNumber");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "creative_produced_assets_parentTakeId_idx"
  ON "creative_produced_assets" ("parentTakeId");