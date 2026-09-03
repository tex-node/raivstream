-- Phase A: Story Intelligence — additive columns only
-- StoryChapter: blueprint (structured narrative plan) + enhancedBody (narrative-enhanced prose)
ALTER TABLE "story_chapters" ADD COLUMN IF NOT EXISTS "blueprint" JSONB;
ALTER TABLE "story_chapters" ADD COLUMN IF NOT EXISTS "enhanced_body" TEXT;

-- StorySceneSeed: directorMetadata (scene director output: storyBeat, dramaticPurpose, keyDialogue, continuityIn, continuityOut)
ALTER TABLE "story_scene_seeds" ADD COLUMN IF NOT EXISTS "director_metadata" JSONB;
