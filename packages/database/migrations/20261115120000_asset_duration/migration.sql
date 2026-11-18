-- How long a produced asset runs (2026-11-15). Transformations bill per second and must read the source
-- asset's duration rather than trust a caller-supplied number.
ALTER TABLE "creative_produced_assets" ADD COLUMN IF NOT EXISTS "durationSeconds" DOUBLE PRECISION;
