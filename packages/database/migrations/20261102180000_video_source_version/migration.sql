-- A creative output is a film derived from a VERSION, not from one produced asset.
--
-- sourceProducedAssetId alone cannot describe it: a version spans many scenes. These two
-- nullable columns carry the version-level provenance, so quarantine can ask "is any asset
-- in this film below the identity floor" instead of guessing a representative asset.
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "sourceProjectId" TEXT;
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "sourceVersionId" TEXT;
CREATE INDEX IF NOT EXISTS "videos_sourceProjectId_idx" ON "videos"("sourceProjectId");