-- Phase 2, piece (2): the guard for insert-time take numbering.
--
-- This index ships WITH the mutation, never before it: the historical backfill
-- numbered takes by creation order, and adding the constraint first could have
-- failed on a scene whose rows tied on createdAt. Now that the writer computes
-- max+1 inside one insert, this index is what turns a lost race into a P2002 the
-- router can recover from (re-read, retry once with the next number) instead of
-- two rows silently sharing take #N.
CREATE UNIQUE INDEX IF NOT EXISTS "story_scene_assets_sceneId_takeNumber_key"
  ON "story_scene_assets"("sceneId", "takeNumber");