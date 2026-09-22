-- Movie render native-audio retention (Phase 16.5 tail) — additive.
-- Per-render flag: retain each scene clip's native audio (MiniMax SFX) in the
-- final mix. Default true. No existing column is altered.

-- AlterTable
ALTER TABLE "movie_render_jobs" ADD COLUMN "keepNativeAudio" BOOLEAN NOT NULL DEFAULT true;