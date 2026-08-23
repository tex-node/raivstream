-- Phase 9A: Sequence Workspace and canonical edit decision list.
-- Additive only. This migration does not modify existing story, asset, critic, or storybook records.

CREATE TYPE "StorySequenceStatus" AS ENUM ('DRAFT', 'LOCKED', 'ARCHIVED');
CREATE TYPE "SequenceShotType" AS ENUM ('EXTREME_WIDE', 'WIDE', 'MEDIUM_WIDE', 'MEDIUM', 'MEDIUM_CLOSE_UP', 'CLOSE_UP', 'EXTREME_CLOSE_UP', 'POV', 'OVER_THE_SHOULDER', 'HIGH_ANGLE', 'LOW_ANGLE', 'TRACKING');
CREATE TYPE "SequenceCameraMovement" AS ENUM ('NONE', 'STATIC', 'PAN_LEFT', 'PAN_RIGHT', 'TILT_UP', 'TILT_DOWN', 'PUSH_IN', 'PULL_OUT', 'TRACK_LEFT', 'TRACK_RIGHT', 'ORBIT', 'DOLLY', 'CRANE', 'HANDHELD');
CREATE TYPE "SequenceCameraSpeed" AS ENUM ('SLOW', 'NORMAL', 'FAST', 'CUSTOM');
CREATE TYPE "SequenceTransitionType" AS ENUM ('CUT', 'CROSS_DISSOLVE', 'FADE', 'DIP_TO_BLACK', 'DIP_TO_WHITE', 'MATCH_CUT', 'WIPE', 'NONE');

ALTER TABLE "story_projects" ADD COLUMN "lastWorkspaceTab" TEXT;

CREATE TABLE "story_sequences" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" "StorySequenceStatus" NOT NULL DEFAULT 'DRAFT',
  "runtimeSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "currentVersionNumber" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "story_sequences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "story_sequence_scenes" (
  "id" TEXT NOT NULL,
  "sequenceId" TEXT NOT NULL,
  "storySceneId" TEXT NOT NULL,
  "sourceSequenceSceneId" TEXT,
  "orderIndex" INTEGER NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "durationSeconds" DOUBLE PRECISION NOT NULL DEFAULT 4,
  "selectedAssetId" TEXT,
  "futureVideoAssetId" TEXT,
  "shotType" "SequenceShotType",
  "cameraMovement" "SequenceCameraMovement",
  "cameraSpeed" "SequenceCameraSpeed",
  "cameraSpeedMultiplier" DOUBLE PRECISION,
  "transition" "SequenceTransitionType",
  "transitionDurationSeconds" DOUBLE PRECISION,
  "holdDurationSeconds" DOUBLE PRECISION,
  "zoom" DOUBLE PRECISION,
  "creativeNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "story_sequence_scenes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sequence_versions" (
  "id" TEXT NOT NULL,
  "sequenceId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "filmBlueprint" JSONB,
  "runtimeSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdById" TEXT NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "sequence_versions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "story_sequences_projectId_idx" ON "story_sequences"("projectId");
CREATE INDEX "story_sequences_projectId_status_idx" ON "story_sequences"("projectId", "status");
CREATE INDEX "story_sequences_projectId_updatedAt_idx" ON "story_sequences"("projectId", "updatedAt");

CREATE INDEX "story_sequence_scenes_sequenceId_idx" ON "story_sequence_scenes"("sequenceId");
CREATE INDEX "story_sequence_scenes_storySceneId_idx" ON "story_sequence_scenes"("storySceneId");
CREATE INDEX "story_sequence_scenes_sequenceId_orderIndex_idx" ON "story_sequence_scenes"("sequenceId", "orderIndex");
CREATE INDEX "story_sequence_scenes_selectedAssetId_idx" ON "story_sequence_scenes"("selectedAssetId");

CREATE UNIQUE INDEX "sequence_versions_sequenceId_versionNumber_key" ON "sequence_versions"("sequenceId", "versionNumber");
CREATE INDEX "sequence_versions_sequenceId_idx" ON "sequence_versions"("sequenceId");
CREATE INDEX "sequence_versions_createdById_idx" ON "sequence_versions"("createdById");

ALTER TABLE "story_sequences"
  ADD CONSTRAINT "story_sequences_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "story_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "story_sequence_scenes"
  ADD CONSTRAINT "story_sequence_scenes_sequenceId_fkey"
  FOREIGN KEY ("sequenceId") REFERENCES "story_sequences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "story_sequence_scenes"
  ADD CONSTRAINT "story_sequence_scenes_storySceneId_fkey"
  FOREIGN KEY ("storySceneId") REFERENCES "story_scene_seeds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "story_sequence_scenes"
  ADD CONSTRAINT "story_sequence_scenes_selectedAssetId_fkey"
  FOREIGN KEY ("selectedAssetId") REFERENCES "story_scene_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "story_sequence_scenes"
  ADD CONSTRAINT "story_sequence_scenes_futureVideoAssetId_fkey"
  FOREIGN KEY ("futureVideoAssetId") REFERENCES "story_scene_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sequence_versions"
  ADD CONSTRAINT "sequence_versions_sequenceId_fkey"
  FOREIGN KEY ("sequenceId") REFERENCES "story_sequences"("id") ON DELETE CASCADE ON UPDATE CASCADE;
