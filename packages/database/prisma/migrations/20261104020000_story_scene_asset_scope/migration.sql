-- StorySceneAsset: scope the two unique keys to their project (2026-11-04)
--
-- `sceneId` is only unique WITHIN a project. The creative take table proved this by failing its
-- migration with `Key ("sceneId", kind, "takeNumber")=(SCENE_04, IMAGE, 1) is duplicated`;
-- schemaScope.test.ts then found the same shape here.
--
-- NOTE: Prisma creates UNIQUE INDEXES, not table constraints, so these must be dropped with
-- DROP INDEX - `ALTER TABLE ... DROP CONSTRAINT` silently skips them.
DROP INDEX IF EXISTS "story_scene_assets_sceneId_assetType_takeNumber_key";
DROP INDEX IF EXISTS "story_scene_assets_sceneId_idempotencyKey_key";

CREATE UNIQUE INDEX IF NOT EXISTS "story_scene_assets_projectId_sceneId_assetType_takeNumber_key"
  ON "story_scene_assets" ("projectId", "sceneId", "assetType", "takeNumber");

CREATE UNIQUE INDEX IF NOT EXISTS "story_scene_assets_projectId_sceneId_idempotencyKey_key"
  ON "story_scene_assets" ("projectId", "sceneId", "idempotencyKey");