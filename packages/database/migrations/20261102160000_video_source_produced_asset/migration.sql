-- Prerequisite for wearing the quarantine predicate to the feed.
--
-- Nullable on purpose: NULL means "source unknown", and unknown is fail-open in
-- quarantine.ts - an unsourced video is not quarantined, exactly as an unscored asset
-- is not. No backfill is attempted because the measured URL-join yields zero matches
-- (see docs/operations/critic-threshold-policy.md, 2026-11-02), and a guessed link
-- would be the isKidsSafe class: a mechanism acting on content it cannot identify.
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "sourceProducedAssetId" TEXT;