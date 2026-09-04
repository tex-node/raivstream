-- Phase A: Story Intelligence — additive columns only
-- StoryChapter: blueprint (structured narrative plan) + enhancedBody (narrative-enhanced prose)
ALTER TABLE "story_chapters" ADD COLUMN IF NOT EXISTS "blueprint" JSONB;
ALTER TABLE "story_chapters" ADD COLUMN IF NOT EXISTS "enhancedBody" TEXT;

-- StorySceneSeed: directorMetadata (scene director output: storyBeat, dramaticPurpose, keyDialogue, continuityIn, continuityOut)
ALTER TABLE "story_scene_seeds" ADD COLUMN IF NOT EXISTS "directorMetadata" JSONB;
