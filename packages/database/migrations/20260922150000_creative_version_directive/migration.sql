-- Raivstream 5.0 — Slice 4 (JUDGE): minimal versioning + directives (make Direct/Explore safe).
-- Additive only. CamelCase columns; snake_case tables via @@map.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CreativeDirectiveMode') THEN
    CREATE TYPE "CreativeDirectiveMode" AS ENUM ('DIRECT', 'EXPLORE', 'REVIEW');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CreativeImpactLevel') THEN
    CREATE TYPE "CreativeImpactLevel" AS ENUM ('NONE', 'LOCAL', 'MULTI_SCENE', 'PROJECT', 'OUTPUT');
  END IF;
END $$;

ALTER TABLE "creative_projects" ADD COLUMN IF NOT EXISTS "currentVersionId" TEXT;

CREATE TABLE IF NOT EXISTS "creative_versions" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "label" TEXT,
  "description" TEXT,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creative_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "creative_versions_projectId_versionNumber_key" UNIQUE ("projectId", "versionNumber"),
  CONSTRAINT "creative_versions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "creative_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "creative_versions_projectId_idx" ON "creative_versions"("projectId");

CREATE TABLE IF NOT EXISTS "creative_directives" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "versionId" TEXT,
  "mode" "CreativeDirectiveMode" NOT NULL,
  "instruction" TEXT NOT NULL,
  "interpretation" TEXT NOT NULL,
  "change" JSONB NOT NULL,
  "preserve" JSONB NOT NULL,
  "impact" "CreativeImpactLevel" NOT NULL,
  "scopes" JSONB NOT NULL,
  "approvalRequired" BOOLEAN NOT NULL DEFAULT true,
  "executionPlan" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creative_directives_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "creative_directives_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "creative_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "creative_directives_projectId_idx" ON "creative_directives"("projectId");