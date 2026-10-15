-- Add-on B — end-card observability on story video exports.
--
-- Best-effort policy kept: a drawtext/font failure never blocks an export. This
-- column records whether the 2s end card was actually applied, so a silently
-- unbranded export becomes visible (admin count + structured log).
--
-- Expand-only (additive): nullable boolean, no default, no backfill. Existing
-- rows stay NULL (unknown — they predate this column).
ALTER TABLE "story_video_exports" ADD COLUMN IF NOT EXISTS "endCardApplied" BOOLEAN;
