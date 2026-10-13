-- Phase 2 (R16-04) — batch scene generation queue.
--
-- Additive: two new enums + two new tables. No backfill, no changes to existing
-- tables. camelCase columns (repo convention).
--
-- Prerequisite: apply AFTER 20261012170000_character_reference_assets.

CREATE TYPE "BatchGenerationRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "BatchGenerationItemStatus" AS ENUM ('QUEUED', 'RUNNING', 'READY', 'FAILED', 'SKIPPED');

CREATE TABLE "batch_generation_runs" (
  "id"              TEXT NOT NULL,
  "projectId"       TEXT NOT NULL,
  "status"          "BatchGenerationRunStatus" NOT NULL DEFAULT 'QUEUED',
  "concurrency"     INTEGER NOT NULL DEFAULT 2,
  "costCapCredits"  INTEGER NOT NULL DEFAULT 10000,
  "costUsedCredits" INTEGER NOT NULL DEFAULT 0,
  "sceneIds"        JSONB NOT NULL,
  "startedAt"       TIMESTAMP(3),
  "finishedAt"      TIMESTAMP(3),
  "lastHeartbeatAt" TIMESTAMP(3),
  "pauseReason"     TEXT,
  "createdByUserId" TEXT NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "batch_generation_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "batch_generation_runs_projectId_status_idx"
  ON "batch_generation_runs" ("projectId", "status");

CREATE TABLE "batch_generation_items" (
  "id"           TEXT NOT NULL,
  "runId"        TEXT NOT NULL,
  "sceneId"      TEXT NOT NULL,
  "status"       "BatchGenerationItemStatus" NOT NULL DEFAULT 'QUEUED',
  "assetId"      TEXT,
  "errorMessage" TEXT,
  "creditsUsed"  INTEGER NOT NULL DEFAULT 0,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "batch_generation_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "batch_generation_items_runId_sceneId_key"
  ON "batch_generation_items" ("runId", "sceneId");
CREATE INDEX "batch_generation_items_runId_status_idx"
  ON "batch_generation_items" ("runId", "status");

ALTER TABLE "batch_generation_items"
  ADD CONSTRAINT "batch_generation_items_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "batch_generation_runs" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
