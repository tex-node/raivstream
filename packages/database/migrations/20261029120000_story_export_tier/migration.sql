-- Additive expand: record which policy tier produced an export.
--
-- Nullable so every historical row keeps NULL (they predate the tier policy).
-- endCardApplied already gives a partial signal; this is the direct one, and it is
-- what lets moderation logs and the export table agree about which surface a
-- render belongs to.

ALTER TABLE "story_video_exports" ADD COLUMN IF NOT EXISTS "tier" TEXT;