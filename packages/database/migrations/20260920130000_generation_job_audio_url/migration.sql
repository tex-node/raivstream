-- Generation job audio URL (staged fal generation flow) — additive.
-- Adds audioUrl (talking-video lip-sync track, VEED Fabric) to
-- generation_jobs so retry/poll can resubmit without caller state.
-- No existing column is altered.

-- AlterTable
ALTER TABLE "generation_jobs" ADD COLUMN "audioUrl" TEXT;
