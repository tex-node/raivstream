-- Raivstream 5.0 — Slice 5 (5B OUTPUTS): output derivatives of a version.
-- Additive only.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CreativeOutputFormat') THEN
    CREATE TYPE "CreativeOutputFormat" AS ENUM ('MASTER', 'LANDSCAPE', 'PORTRAIT', 'SQUARE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CreativeOutputStatus') THEN
    CREATE TYPE "CreativeOutputStatus" AS ENUM ('PENDING', 'GENERATING', 'READY', 'FAILED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "creative_outputs" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "format" "CreativeOutputFormat" NOT NULL,
  "durationSeconds" INTEGER,
  "status" "CreativeOutputStatus" NOT NULL DEFAULT 'PENDING',
  "assetUrl" TEXT,
  "thumbnailUrl" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "creative_outputs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "creative_outputs_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "creative_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "creative_outputs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "creative_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "creative_outputs_projectId_idx" ON "creative_outputs"("projectId");
CREATE INDEX IF NOT EXISTS "creative_outputs_versionId_idx" ON "creative_outputs"("versionId");