-- Creative approval lives on the asset: a creative project cannot own a StoryCharacterMemory,
-- so there is nowhere else for it. Story-owned rows keep using
-- StoryCharacterMemory.approvedReferenceAssetId; the gate accepts either.
ALTER TABLE "character_reference_assets" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);