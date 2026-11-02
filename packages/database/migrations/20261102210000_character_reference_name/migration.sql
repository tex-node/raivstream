-- The bridge: let a reference carry its character's name without the StoryCharacterMemory
-- relation, which a creative project can never have (that model points at StoryProject).
-- Additive and nullable; both the story path and the creative cast stage write it.
ALTER TABLE "character_reference_assets" ADD COLUMN IF NOT EXISTS "characterName" TEXT;
CREATE INDEX IF NOT EXISTS "character_reference_assets_characterName_idx"
  ON "character_reference_assets"("characterName");