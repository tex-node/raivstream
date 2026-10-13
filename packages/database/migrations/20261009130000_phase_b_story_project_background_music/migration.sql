-- Phase B (R16 background music): backgroundMusicUrl field on StoryProject.
--
-- Stores the R2-hosted URL for the generated background music track for an
-- R16 StoryProject. Written by the generateStoryMusic procedure (fail-closed;
-- requires LYRIA_MUSIC_ENABLED=true and a configured story:background_music
-- credit rate before any live generation runs).
--
-- Table: story_projects
ALTER TABLE "story_projects" ADD COLUMN IF NOT EXISTS "backgroundMusicUrl" TEXT;
