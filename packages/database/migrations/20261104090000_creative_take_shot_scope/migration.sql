-- Creative take constraint: add shot addressing (2026-11-04)
--
-- Phase 4 needs "direct shot 12C regenerates only that shot's take". Takes were keyed
-- (projectId, sceneId, kind, takeNumber) with no shotId, so two shots in one scene collided.
--
-- THE NULLABLE CASE, decided rather than discovered: every existing row has shotId = NULL, and
-- Postgres treats NULL as distinct in a unique index. A plain five-column unique would therefore
-- ALLOW two scene-level takes to share a takeNumber - silently removing the guarantee the old
-- index provided. So the constraint is split into two PARTIAL indexes:
--
--   scene-level takes  (shotId IS NULL)     -> unique per (projectId, sceneId, kind, takeNumber)
--   shot-level takes   (shotId IS NOT NULL) -> unique per (projectId, sceneId, shotId, kind, takeNumber)
--
-- Prisma cannot express partial indexes; the schema keeps the scene-level @@unique as its
-- declaration and this file is the authority for reality.
--
-- DROP CONSTRAINT, not DROP INDEX: this particular index is backed by a table constraint
-- (added in 20261103190000), so DROP INDEX fails with "constraint ... requires it". The
-- previous migration hit the opposite case - an index with no constraint - where DROP
-- CONSTRAINT was a silent no-op. Neither statement is universally right; the object decides.

ALTER TABLE "creative_produced_assets"
  DROP CONSTRAINT IF EXISTS "creative_produced_assets_projectId_sceneId_kind_takeNumber_key";

CREATE UNIQUE INDEX IF NOT EXISTS "creative_produced_assets_scene_take_key"
  ON "creative_produced_assets" ("projectId", "sceneId", kind, "takeNumber")
  WHERE "shotId" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "creative_produced_assets_shot_take_key"
  ON "creative_produced_assets" ("projectId", "sceneId", "shotId", kind, "takeNumber")
  WHERE "shotId" IS NOT NULL;