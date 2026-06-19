-- Story Playground Phase 4: versioned hidden prompt composer output.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StoryPromptOutputType') THEN
    CREATE TYPE "StoryPromptOutputType" AS ENUM ('IMAGE', 'SHORT_VIDEO', 'COMIC_PANEL');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "story_scene_prompts" (
  "id" TEXT NOT NULL,
  "sceneId" TEXT NOT NULL,
  "outputType" "StoryPromptOutputType" NOT NULL,
  "provider" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "negativePrompt" TEXT,
  "aspectRatio" TEXT NOT NULL DEFAULT '9:16',
  "duration" DOUBLE PRECISION,
  "version" INTEGER NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "story_scene_prompts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "story_scene_prompts_sceneId_idx" ON "story_scene_prompts"("sceneId");
CREATE INDEX IF NOT EXISTS "story_scene_prompts_sceneId_outputType_provider_idx" ON "story_scene_prompts"("sceneId", "outputType", "provider");
CREATE UNIQUE INDEX IF NOT EXISTS "story_scene_prompts_sceneId_outputType_provider_version_key" ON "story_scene_prompts"("sceneId", "outputType", "provider", "version");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'story_scene_prompts_sceneId_fkey'
  ) THEN
    ALTER TABLE "story_scene_prompts"
      ADD CONSTRAINT "story_scene_prompts_sceneId_fkey"
      FOREIGN KEY ("sceneId") REFERENCES "story_scene_seeds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
