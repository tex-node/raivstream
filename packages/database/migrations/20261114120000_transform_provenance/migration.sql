-- How an asset came to exist, and what it was derived from (2026-11-14).
-- Additive and nullable: every existing row reads as "generated", which is what it is.
ALTER TABLE "creative_produced_assets" ADD COLUMN IF NOT EXISTS "producedBy" TEXT;
ALTER TABLE "creative_produced_assets" ADD COLUMN IF NOT EXISTS "sourceAssetId" TEXT;
