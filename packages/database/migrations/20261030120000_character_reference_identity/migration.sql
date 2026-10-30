-- Phase 1, piece (1): promote CharacterReferenceAsset to a first-class identity
-- reference. Additive only - no column is dropped, no data is rewritten, and
-- the prompt path is untouched.

ALTER TABLE "character_reference_assets" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'CHARACTER';
ALTER TABLE "character_reference_assets" ADD COLUMN IF NOT EXISTS "properties" JSONB;
ALTER TABLE "character_reference_assets" ADD COLUMN IF NOT EXISTS "ipDetected" BOOLEAN;
ALTER TABLE "character_reference_assets" ADD COLUMN IF NOT EXISTS "reviewStatus" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "character_reference_assets" ADD COLUMN IF NOT EXISTS "lastUsedAt" TIMESTAMP;
ALTER TABLE "character_reference_assets" ADD COLUMN IF NOT EXISTS "lastJobId" TEXT;
-- Environments and props are not attached to a character; the service layer
-- enforces "only CHARACTER references may attach" because SQL cannot.
ALTER TABLE "character_reference_assets" ALTER COLUMN "characterId" DROP NOT NULL;

CREATE TABLE IF NOT EXISTS "character_reference_media" (
  "id" TEXT PRIMARY KEY,
  "referenceId" TEXT NOT NULL REFERENCES "character_reference_assets"("id") ON DELETE CASCADE,
  "kind" TEXT NOT NULL,
  "assetUrl" TEXT NOT NULL,
  "width" INTEGER,
  "height" INTEGER,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "character_reference_media_referenceId_idx" ON "character_reference_media"("referenceId");
CREATE INDEX IF NOT EXISTS "character_reference_assets_projectId_category_idx" ON "character_reference_assets"("projectId", "category");