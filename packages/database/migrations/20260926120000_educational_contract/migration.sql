-- Phase B: Educational Content Engine
-- Adds contentType to StoryProject and educationalContract to StoryChapter.
-- Additive-only; all new columns are nullable with no default.

ALTER TABLE "story_projects" ADD COLUMN IF NOT EXISTS "contentType" TEXT;

ALTER TABLE "story_chapters" ADD COLUMN IF NOT EXISTS "educationalContract" JSONB;
