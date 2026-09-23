-- Raivstream 5.0 — Slice 6 (SERIES): series + episodes + project link.
-- Additive only. CamelCase columns; snake_case tables via @@map.
-- Season is represented by seasonNumber on episodes (no CreativeSeason entity yet).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CreativeSeriesStatus') THEN
    CREATE TYPE "CreativeSeriesStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CreativeEpisodeStatus') THEN
    CREATE TYPE "CreativeEpisodeStatus" AS ENUM ('DRAFT', 'PLANNING', 'IN_PRODUCTION', 'REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "creative_series" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" "CreativeSeriesStatus" NOT NULL DEFAULT 'DRAFT',
  "visualLanguage" JSONB,
  "audioLanguage" JSONB,
  "canon" JSONB,
  "memory" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "creative_series_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "creative_series_userId_idx" ON "creative_series"("userId");
CREATE INDEX IF NOT EXISTS "creative_series_userId_updatedAt_idx" ON "creative_series"("userId", "updatedAt");

ALTER TABLE "creative_projects" ADD COLUMN IF NOT EXISTS "seriesId" TEXT;

CREATE TABLE IF NOT EXISTS "creative_episodes" (
  "id" TEXT NOT NULL,
  "seriesId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "seasonNumber" INTEGER NOT NULL DEFAULT 1,
  "episodeNumber" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "synopsis" TEXT,
  "status" "CreativeEpisodeStatus" NOT NULL DEFAULT 'DRAFT',
  "state" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "creative_episodes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "creative_episodes_projectId_key" UNIQUE ("projectId"),
  CONSTRAINT "creative_episodes_seriesId_seasonNumber_episodeNumber_key" UNIQUE ("seriesId", "seasonNumber", "episodeNumber"),
  CONSTRAINT "creative_episodes_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "creative_series"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "creative_episodes_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "creative_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "creative_episodes_seriesId_idx" ON "creative_episodes"("seriesId");