-- Raivstream 5.0 — Slice 2 (PLAN): creative production plan persistence.
-- Additive only. CamelCase columns; snake_case table via @@map.

CREATE TABLE IF NOT EXISTS "creative_production_plans" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "plan" JSONB NOT NULL,
  "preview" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "creative_production_plans_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "creative_production_plans_projectId_key" UNIQUE ("projectId"),
  CONSTRAINT "creative_production_plans_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "creative_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);