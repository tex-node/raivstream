-- Raivstream 5.0 — Slice 4 (JUDGE): review runs + resolutions.
-- Additive only.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CreativeReviewRunStatus') THEN
    CREATE TYPE "CreativeReviewRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CreativeReviewResolutionKind') THEN
    CREATE TYPE "CreativeReviewResolutionKind" AS ENUM ('KEEP', 'FIX', 'REVIEW');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "creative_review_runs" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "sceneId" TEXT,
  "assetId" TEXT,
  "status" "CreativeReviewRunStatus" NOT NULL DEFAULT 'PENDING',
  "findings" JSONB NOT NULL,
  "provider" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "creative_review_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "creative_review_runs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "creative_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "creative_review_runs_projectId_idx" ON "creative_review_runs"("projectId");

CREATE TABLE IF NOT EXISTS "creative_review_resolutions" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "findingId" TEXT NOT NULL,
  "resolution" "CreativeReviewResolutionKind" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creative_review_resolutions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "creative_review_resolutions_runId_findingId_key" UNIQUE ("runId", "findingId"),
  CONSTRAINT "creative_review_resolutions_runId_fkey" FOREIGN KEY ("runId") REFERENCES "creative_review_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);