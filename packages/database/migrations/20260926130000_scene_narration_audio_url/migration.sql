-- Phase C: Educational narration audio URL stored directly on scene (R16-safe path)
-- Bypasses the Sequence/AudioCue/AudioTrack Film-tab machinery for R16 educational content.
ALTER TABLE "story_scene_seeds" ADD COLUMN IF NOT EXISTS "narrationAudioUrl" TEXT;
