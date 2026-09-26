-- Phase 2C — R16 story video export.
-- Stores the lifecycle of a derived story video assembled from R16/KIDS scene
-- video assets. Export records are owned by the StoryProject; they are
-- separate from the Raivstream 5.0 CreativeOutput table which requires a
-- CreativeProject + CreativeVersion foreign key.
-- Additive only.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StoryVideoExportStatus') THEN
    CREATE TYPE "StoryVideoExportStatus" AS ENUM ('PENDING', 'GENERATING', 'READY', 'FAILED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "story_video_exports" (
  "id"              TEXT NOT NULL,
  "projectId"       TEXT NOT NULL,
  "userId"          TEXT NOT NULL,
  "status"          "StoryVideoExportStatus" NOT NULL DEFAULT 'PENDING',
  -- SHA-256 fingerprint of sorted (sceneId:videoAssetId) pairs.
  -- Enforces DB-level idempotency: duplicate concurrent requests collide here.
  "sourceHash"      TEXT NOT NULL,
  -- Ordered JSON array of scene IDs included in this export.
  "sceneIds"        JSONB NOT NULL DEFAULT '[]',
  "assetUrl"        TEXT,
  "r2Key"           TEXT,
  "durationSeconds" DOUBLE PRECISION,
  "widthPx"         INTEGER,
  "heightPx"        INTEGER,
  "errorMessage"    TEXT,
  "completedAt"     TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "story_video_exports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "story_video_exports_projectId_sourceHash_key" UNIQUE ("projectId", "sourceHash"),
  CONSTRAINT "story_video_exports_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "story_projects"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "story_video_exports_projectId_idx"        ON "story_video_exports"("projectId");
CREATE INDEX IF NOT EXISTS "story_video_exports_projectId_status_idx" ON "story_video_exports"("projectId", "status");
