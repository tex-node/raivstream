-- Phase A (R16 narration): narrationScript field on StorySceneSeed.
--
-- Stores the AI-generated or creator-supplied narration script for a story
-- scene (non-educational R16 path). The narrationScript is the text that will
-- be synthesised into speech by the generateStoryNarration procedure.
-- It is distinct from directorMetadata.narrationText (educational path).
--
-- Table: story_scene_seeds
ALTER TABLE "story_scene_seeds" ADD COLUMN IF NOT EXISTS "narrationScript" TEXT;
