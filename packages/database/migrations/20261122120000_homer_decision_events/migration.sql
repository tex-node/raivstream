-- The decision timeline (2026-11-22). Additive: one table, no backfill, no relations.
-- `migrate deploy` cannot run in this environment (P3009: 20261112120000_story_contract never finished), so this SQL is applied by hand and the
-- table is the authority either way.
CREATE TABLE IF NOT EXISTS "homer_decision_events" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "provenance" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "supersedes" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "homer_decision_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "homer_decision_events_projectId_at_idx" ON "homer_decision_events"("projectId", "at");
