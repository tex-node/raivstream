-- Worker liveness, separate from a run's heartbeat (2026-11-18).
-- Additive: one table, no relations, no backfill. The worker upserts one row per process name on
-- a timer; `queueHealth` reads it instead of borrowing a run's `heartbeatAt`, which is stale by
-- definition when the worker is alive and idle.
CREATE TABLE IF NOT EXISTS "worker_heartbeats" (
    "worker" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "pid" INTEGER,
    "host" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "worker_heartbeats_pkey" PRIMARY KEY ("worker")
);
