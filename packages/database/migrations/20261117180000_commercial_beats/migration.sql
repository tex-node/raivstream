-- The ad's three beats, entered by the creator (2026-11-17). Fields rather than one prose blob.
ALTER TABLE "CreativeBrief" ADD COLUMN IF NOT EXISTS "commercialHook" TEXT;
ALTER TABLE "CreativeBrief" ADD COLUMN IF NOT EXISTS "commercialBenefit" TEXT;
ALTER TABLE "CreativeBrief" ADD COLUMN IF NOT EXISTS "commercialCta" TEXT;
