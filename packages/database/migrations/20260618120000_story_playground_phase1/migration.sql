-- Story Playground Phase 1
-- Adds child-friendly story planning data without removing the existing advanced Story Studio tables.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StoryAudienceMode') THEN
    CREATE TYPE "StoryAudienceMode" AS ENUM ('KIDS', 'GENERAL');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StoryType') THEN
    CREATE TYPE "StoryType" AS ENUM ('SHORT_STORY', 'PICTURE_BOOK', 'COMIC', 'VIDEO_STORY');
  END IF;
END $$;

ALTER TYPE "StoryProjectStatus" ADD VALUE IF NOT EXISTS 'GENERATED';
ALTER TYPE "StoryProjectStatus" ADD VALUE IF NOT EXISTS 'EXTENDED';

ALTER TABLE "story_projects"
  ADD COLUMN IF NOT EXISTS "originalIdea" TEXT,
  ADD COLUMN IF NOT EXISTS "audienceMode" "StoryAudienceMode" NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN IF NOT EXISTS "storyType" "StoryType" NOT NULL DEFAULT 'SHORT_STORY',
  ADD COLUMN IF NOT EXISTS "ageRange" TEXT,
  ADD COLUMN IF NOT EXISTS "theme" TEXT;

CREATE TABLE IF NOT EXISTS "story_questions" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "questionText" TEXT NOT NULL,
  "answerOptions" JSONB NOT NULL,
  "selectedAnswer" TEXT,
  "orderIndex" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "story_questions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "story_chapters" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "chapterNumber" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "generationPrompt" TEXT,
  "providerMetadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "story_chapters_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "story_character_memory" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role" TEXT,
  "species" TEXT,
  "ageDescription" TEXT,
  "gender" TEXT,
  "visualDescription" TEXT,
  "personality" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "story_character_memory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "story_scene_seeds" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "chapterId" TEXT,
  "orderIndex" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "locationType" TEXT,
  "indoorOutdoor" TEXT,
  "mood" TEXT,
  "characters" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "story_scene_seeds_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "story_projects_audienceMode_idx" ON "story_projects"("audienceMode");
CREATE INDEX IF NOT EXISTS "story_questions_projectId_idx" ON "story_questions"("projectId");
CREATE INDEX IF NOT EXISTS "story_questions_projectId_orderIndex_idx" ON "story_questions"("projectId", "orderIndex");
CREATE UNIQUE INDEX IF NOT EXISTS "story_chapters_projectId_chapterNumber_key" ON "story_chapters"("projectId", "chapterNumber");
CREATE INDEX IF NOT EXISTS "story_chapters_projectId_idx" ON "story_chapters"("projectId");
CREATE INDEX IF NOT EXISTS "story_chapters_projectId_chapterNumber_idx" ON "story_chapters"("projectId", "chapterNumber");
CREATE INDEX IF NOT EXISTS "story_character_memory_projectId_idx" ON "story_character_memory"("projectId");
CREATE INDEX IF NOT EXISTS "story_character_memory_projectId_name_idx" ON "story_character_memory"("projectId", "name");
CREATE INDEX IF NOT EXISTS "story_scene_seeds_projectId_idx" ON "story_scene_seeds"("projectId");
CREATE INDEX IF NOT EXISTS "story_scene_seeds_chapterId_idx" ON "story_scene_seeds"("chapterId");
CREATE INDEX IF NOT EXISTS "story_scene_seeds_projectId_orderIndex_idx" ON "story_scene_seeds"("projectId", "orderIndex");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'story_questions_projectId_fkey'
  ) THEN
    ALTER TABLE "story_questions"
      ADD CONSTRAINT "story_questions_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "story_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'story_chapters_projectId_fkey'
  ) THEN
    ALTER TABLE "story_chapters"
      ADD CONSTRAINT "story_chapters_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "story_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'story_character_memory_projectId_fkey'
  ) THEN
    ALTER TABLE "story_character_memory"
      ADD CONSTRAINT "story_character_memory_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "story_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'story_scene_seeds_projectId_fkey'
  ) THEN
    ALTER TABLE "story_scene_seeds"
      ADD CONSTRAINT "story_scene_seeds_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "story_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'story_scene_seeds_chapterId_fkey'
  ) THEN
    ALTER TABLE "story_scene_seeds"
      ADD CONSTRAINT "story_scene_seeds_chapterId_fkey"
      FOREIGN KEY ("chapterId") REFERENCES "story_chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
