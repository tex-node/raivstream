-- Phase 3 follow-through: the live-content policy's audit rows, plus the critic
-- version marker the re-score batch uses to skip already-processed assets.
--
-- Additive only. The flag table is what makes "flagged for review" distinct from
-- "silently ignored"; without a row, the policy cannot be audited.

ALTER TABLE "creative_critic_runs" ADD COLUMN IF NOT EXISTS "criticVersion" TEXT;

CREATE TABLE IF NOT EXISTS "creative_review_flags" (
  "id"            TEXT PRIMARY KEY,
  "assetId"       TEXT NOT NULL,
  "sceneId"       TEXT NOT NULL,
  "projectId"     TEXT NOT NULL,
  "runId"         TEXT NOT NULL,
  "dimension"     TEXT NOT NULL,
  "score"         DOUBLE PRECISION NOT NULL,
  "floor"         DOUBLE PRECISION NOT NULL,
  "criticVersion" TEXT NOT NULL,
  "source"        TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt"    TIMESTAMP(3),
  "reviewedById"  TEXT,
  "resolution"    TEXT,
  "note"          TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS "creative_review_flags_assetId_runId_key"
  ON "creative_review_flags"("assetId", "runId");
CREATE INDEX IF NOT EXISTS "creative_review_flags_projectId_createdAt_idx"
  ON "creative_review_flags"("projectId", "createdAt");
CREATE INDEX IF NOT EXISTS "creative_review_flags_reviewedAt_idx"
  ON "creative_review_flags"("reviewedAt");