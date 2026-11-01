-- Fix: take numbers are per (scene, ASSET TYPE), not per scene.
--
-- The first version of this index was UNIQUE (sceneId, takeNumber), but the
-- historical backfill numbered every asset of a scene in one sequence - images and
-- videos together. Video numbering therefore started above the image takes and the
-- insert collided on P2002 for a take number that no video held. A scene's image
-- takes and video takes are separate revision lineages, and the constraint has to
-- say so.
DROP INDEX IF EXISTS "story_scene_assets_sceneId_takeNumber_key";
CREATE UNIQUE INDEX IF NOT EXISTS "story_scene_assets_sceneId_assetType_takeNumber_key"
  ON "story_scene_assets"("sceneId", "assetType", "takeNumber");