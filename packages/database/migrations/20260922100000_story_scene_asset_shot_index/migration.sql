-- Phase 17 — multi-clip shot engine.
-- `shot_index` marks a StorySceneAsset as one clip of a scene's 5-6s shot grid
-- (0-based). `shot_grid_seed_image_url` records the R2 seed used as that clip's
-- opening frame (the last frame of the previous shot, for I2V chain continuity).
ALTER TABLE "story_scene_assets" ADD COLUMN "shot_index" INTEGER;
ALTER TABLE "story_scene_assets" ADD COLUMN "shot_grid_seed_image_url" TEXT;
CREATE INDEX "story_scene_assets_scene_shot_index_idx" ON "story_scene_assets" ("sceneId", "shot_index");