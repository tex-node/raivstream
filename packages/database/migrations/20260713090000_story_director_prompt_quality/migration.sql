-- Phase 5C: Story Director settings and prompt quality feedback.
-- Director fields are nullable so existing scenes preserve current behavior until a user directs them.

ALTER TABLE "story_scene_seeds"
  ADD COLUMN "emotion" TEXT,
  ADD COLUMN "cameraStyle" TEXT,
  ADD COLUMN "timeOfDay" TEXT,
  ADD COLUMN "weather" TEXT,
  ADD COLUMN "environmentMood" TEXT,
  ADD COLUMN "lighting" TEXT,
  ADD COLUMN "scenePace" TEXT,
  ADD COLUMN "directorChangedAt" TIMESTAMP(3);

CREATE TABLE "prompt_quality_feedback" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "sceneId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "userId" TEXT,
  "rating" INTEGER NOT NULL,
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "prompt_quality_feedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "prompt_quality_feedback_assetId_userId_key" ON "prompt_quality_feedback"("assetId", "userId");
CREATE INDEX "prompt_quality_feedback_projectId_idx" ON "prompt_quality_feedback"("projectId");
CREATE INDEX "prompt_quality_feedback_sceneId_idx" ON "prompt_quality_feedback"("sceneId");
CREATE INDEX "prompt_quality_feedback_assetId_idx" ON "prompt_quality_feedback"("assetId");
CREATE INDEX "prompt_quality_feedback_rating_idx" ON "prompt_quality_feedback"("rating");
CREATE INDEX "prompt_quality_feedback_createdAt_idx" ON "prompt_quality_feedback"("createdAt");

ALTER TABLE "prompt_quality_feedback"
  ADD CONSTRAINT "prompt_quality_feedback_sceneId_fkey"
  FOREIGN KEY ("sceneId") REFERENCES "story_scene_seeds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
