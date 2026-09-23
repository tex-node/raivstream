-- Raivstream 5.0 — Slice 3 (PRODUCE): produced-asset rows for the semantic layer.
-- Additive only. CamelCase columns; snake_case table via @@map.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CreativeProducedAssetKind') THEN
    CREATE TYPE "CreativeProducedAssetKind" AS ENUM ('IMAGE', 'VIDEO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CreativeProducedAssetStatus') THEN
    CREATE TYPE "CreativeProducedAssetStatus" AS ENUM ('QUEUED', 'GENERATING', 'READY', 'FAILED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "creative_produced_assets" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "sceneId" TEXT NOT NULL,
  "shotId" TEXT,
  "kind" "CreativeProducedAssetKind" NOT NULL,
  "status" "CreativeProducedAssetStatus" NOT NULL DEFAULT 'QUEUED',
  "assetUrl" TEXT,
  "thumbnailUrl" TEXT,
  "errorMessage" TEXT,
  "provider" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "creative_produced_assets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "creative_produced_assets_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "creative_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "creative_produced_assets_projectId_sceneId_idx" ON "creative_produced_assets"("projectId", "sceneId");
CREATE INDEX IF NOT EXISTS "creative_produced_assets_projectId_status_idx" ON "creative_produced_assets"("projectId", "status");