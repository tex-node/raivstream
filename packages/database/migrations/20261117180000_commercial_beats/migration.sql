-- The ad's three beats, entered by the creator (2026-11-17). Fields rather than one prose blob.
-- The table is the @@map name. The first version said "CreativeBrief", which is the MODEL name: 42P01, never applicable,
-- and the client's first include of the brief hit P2022 because the columns were not there.
ALTER TABLE "creative_briefs" ADD COLUMN IF NOT EXISTS "commercialHook" TEXT;
ALTER TABLE "creative_briefs" ADD COLUMN IF NOT EXISTS "commercialBenefit" TEXT;
ALTER TABLE "creative_briefs" ADD COLUMN IF NOT EXISTS "commercialCta" TEXT;
