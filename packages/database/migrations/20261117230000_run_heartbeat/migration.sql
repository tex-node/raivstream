-- Lease heartbeat (2026-11-17). The worker stamps it while working a run; the sweep compares it to the lease.
-- The table is the @@map name, not the model name: "CreativeProductionRun" does not exist.
ALTER TABLE "creative_production_runs" ADD COLUMN IF NOT EXISTS "heartbeatAt" TIMESTAMP(3);
