-- Phase 3 — Homer First-Frame Animatic.
-- Adds ephemeral animatic state for the story creation flow.
-- Animatics are generated before project creation — they are NOT tied to a
-- CreativeProject FK. A new animatic is upserted per (userId, storyHash) so
-- identical stories reuse existing frames.
-- Additive only.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AnimaticFrameStatus') THEN
    CREATE TYPE "AnimaticFrameStatus" AS ENUM ('PENDING', 'GENERATING', 'READY', 'FAILED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "homer_animatics" (
  "id"        TEXT                    NOT NULL,
  "userId"    TEXT                    NOT NULL,
  "storyHash" TEXT                    NOT NULL,
  "scenes"    JSONB                   NOT NULL DEFAULT '[]',
  "status"    "AnimaticFrameStatus"   NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3)            NOT NULL,
  CONSTRAINT "homer_animatics_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "homer_animatics_userId_storyHash_key" UNIQUE ("userId", "storyHash")
);

CREATE INDEX IF NOT EXISTS "homer_animatics_userId_idx" ON "homer_animatics"("userId");

CREATE TABLE IF NOT EXISTS "homer_animatic_frames" (
  "id"           TEXT                    NOT NULL,
  "animaticId"   TEXT                    NOT NULL,
  "sceneIndex"   INTEGER                 NOT NULL,
  "sceneId"      TEXT                    NOT NULL,
  "sceneLabel"   TEXT                    NOT NULL,
  "beatId"       TEXT,
  "visualPrompt" TEXT                    NOT NULL,
  "status"       "AnimaticFrameStatus"   NOT NULL DEFAULT 'PENDING',
  "falJobId"     TEXT,
  "imageUrl"     TEXT,
  "directorNote" TEXT,
  "createdAt"    TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3)            NOT NULL,
  CONSTRAINT "homer_animatic_frames_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "homer_animatic_frames_animaticId_fkey"
    FOREIGN KEY ("animaticId") REFERENCES "homer_animatics"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "homer_animatic_frames_animaticId_idx"
  ON "homer_animatic_frames"("animaticId");
CREATE INDEX IF NOT EXISTS "homer_animatic_frames_animaticId_sceneIndex_idx"
  ON "homer_animatic_frames"("animaticId", "sceneIndex");
