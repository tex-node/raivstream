-- Phase 2, piece (2): revision / take semantics. Additive only.
--
-- A scene's video becomes a take with a revision. The export path keys segments by
-- sourceAssetId, so a new take already invalidates exactly that segment; these
-- columns make the take itself legible: its number, the take it replaced, and the
-- idempotency key that makes a duplicate regenerate request return the existing
-- take instead of creating a second.

ALTER TABLE "story_scene_assets" ADD COLUMN IF NOT EXISTS "takeNumber" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "story_scene_assets" ADD COLUMN IF NOT EXISTS "parentTakeId" TEXT;
ALTER TABLE "story_scene_assets" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

-- Backfill: number takes per scene in creation order (the SequenceVersion max+1
-- pattern applied retrospectively), and link each take to the previous one.
WITH ordered AS (
  SELECT id,
         row_number() OVER (PARTITION BY "sceneId" ORDER BY "createdAt", id) AS rn,
         lag(id) OVER (PARTITION BY "sceneId" ORDER BY "createdAt", id) AS prev
  FROM "story_scene_assets"
)
UPDATE "story_scene_assets" a
SET "takeNumber" = ordered.rn,
    "parentTakeId" = ordered.prev
FROM ordered
WHERE a.id = ordered.id;

CREATE INDEX IF NOT EXISTS "story_scene_assets_sceneId_takeNumber_idx"
  ON "story_scene_assets"("sceneId", "takeNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "story_scene_assets_sceneId_idempotencyKey_key"
  ON "story_scene_assets"("sceneId", "idempotencyKey");