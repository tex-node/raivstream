-- STORY-PACE Phase B: add StoryLength enum and storyLength column on StoryProject.
-- storyLength is nullable; NULL means legacy behaviour (6 scenes, 5s/scene, unchanged).

CREATE TYPE "StoryLength" AS ENUM ('SHORT', 'MEDIUM');

ALTER TABLE "story_projects" ADD COLUMN "storyLength" "StoryLength";
