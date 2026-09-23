-- Raivstream 5.0 — Phase 9 reliability hardening: durable, resumable production runs.
-- Additive only. CamelCase columns; snake_case table via @@map.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CreativeProductionRunStatus') THEN
    CREATE TYPE "CreativeProductionRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "creative_production_runs" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "status" "CreativeProductionRunStatus" NOT NULL DEFAULT 'RUNNING',
  "attempt" INTEGER NOT NULL DEFAULT 1,
  "stage" TEXT,
  "totalScenes" INTEGER NOT NULL DEFAULT 0,
  "readyScenes" INTEGER NOT NULL DEFAULT 0,
  "failedScenes" INTEGER NOT NULL DEFAULT 0,
  "idempotencyKey" TEXT,
  "contextSnapshot" JSONB,
  "lastError" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "creative_production_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "creative_production_runs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "creative_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "creative_production_runs_projectId_idempotencyKey_key" ON "creative_production_runs"("projectId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "creative_production_runs_projectId_status_idx" ON "creative_production_runs"("projectId", "status");
