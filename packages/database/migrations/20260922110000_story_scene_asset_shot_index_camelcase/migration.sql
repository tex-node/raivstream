-- Phase 17 corrective migration.
--
-- The original 20260922100000 migration created snake_case columns
-- (shot_index, shot_grid_seed_image_url), but this table's Prisma
-- field->column convention is camelCase (sceneId, projectId, assetType, ...).
-- Prisma maps the model field `shotIndex` to the column `shotIndex`, so the
-- snake_case columns were invisible to the client and EVERY query that touched
-- story_scene_assets threw "column story_scene_assets.shotIndex does not
-- exist" — which broke loading and generation of all stories.
--
-- Idempotent: safe on a fresh database (drops the snake columns the original
-- migration created) and on prod (where the columns were already corrected
-- manually during the incident).

DROP INDEX IF EXISTS story_scene_assets_scene_shot_index_idx;
ALTER TABLE "story_scene_assets" DROP COLUMN IF EXISTS "shot_index";
ALTER TABLE "story_scene_assets" DROP COLUMN IF EXISTS "shot_grid_seed_image_url";
ALTER TABLE "story_scene_assets" ADD COLUMN IF NOT EXISTS "shotIndex" INTEGER;
ALTER TABLE "story_scene_assets" ADD COLUMN IF NOT EXISTS "shotGridSeedImageUrl" TEXT;
CREATE INDEX IF NOT EXISTS story_scene_assets_scene_shot_index_idx ON "story_scene_assets" ("sceneId", "shotIndex");