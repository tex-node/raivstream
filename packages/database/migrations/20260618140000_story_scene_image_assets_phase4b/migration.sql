-- Story Playground Phase 4B: scene image generation asset history.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StorySceneAssetType') THEN
    CREATE TYPE "StorySceneAssetType" AS ENUM ('IMAGE', 'VIDEO');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StorySceneAssetStatus') THEN
    CREATE TYPE "StorySceneAssetStatus" AS ENUM ('PENDING', 'GENERATING', 'READY', 'FAILED');
  END IF;
END $$;

ALTER TABLE "story_scene_seeds"
  ADD COLUMN IF NOT EXISTS "latestImageAssetId" TEXT,
  ADD COLUMN IF NOT EXISTS "imageStatus" "StorySceneAssetStatus",
  ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;

CREATE TABLE IF NOT EXISTS "story_scene_assets" (
  "id" TEXT NOT NULL,
  "sceneId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "assetType" "StorySceneAssetType" NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "promptVersionId" TEXT,
  "composedPrompt" TEXT,
  "negativePrompt" TEXT,
  "r2Key" TEXT,
  "assetUrl" TEXT,
  "thumbnailUrl" TEXT,
  "width" INTEGER,
  "height" INTEGER,
  "durationSeconds" DOUBLE PRECISION,
  "status" "StorySceneAssetStatus" NOT NULL DEFAULT 'PENDING',
  "errorMessage" TEXT,
  "generationJobId" TEXT,
  "isLatest" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "story_scene_assets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "story_scene_assets_sceneId_idx" ON "story_scene_assets"("sceneId");
CREATE INDEX IF NOT EXISTS "story_scene_assets_projectId_idx" ON "story_scene_assets"("projectId");
CREATE INDEX IF NOT EXISTS "story_scene_assets_userId_idx" ON "story_scene_assets"("userId");
CREATE INDEX IF NOT EXISTS "story_scene_assets_sceneId_isLatest_idx" ON "story_scene_assets"("sceneId", "isLatest");
CREATE INDEX IF NOT EXISTS "story_scene_assets_status_idx" ON "story_scene_assets"("status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'story_scene_assets_sceneId_fkey'
  ) THEN
    ALTER TABLE "story_scene_assets"
      ADD CONSTRAINT "story_scene_assets_sceneId_fkey"
      FOREIGN KEY ("sceneId") REFERENCES "story_scene_seeds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
