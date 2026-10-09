-- Phase 6D: Concurrency-safe music cue lock.
-- Prevents two concurrent Lyria submissions for the same MUSIC track.
--
-- Table:  audio_cues  (@@map in schema.prisma)
-- Column: "trackId"   (camelCase — Prisma preserves field names in column names;
--                      confirmed in migration 20260827120000_audio_performance_phase9b2)
-- Type:   metadata JSONB (->>' operator valid)
--
-- A partial unique index on (trackId) WHERE kind = 'MUSIC_TRACK' ensures
-- only one active music-generation intent record can exist per track at a time.
-- Narration and dialogue cues are unaffected (they have no 'kind' metadata field
-- or have a different kind value).
--
-- Pre-cleanup: remove any orphaned unmaterialised MUSIC_TRACK cues that may
-- exist in dev/test databases from Phase 6C runs (before Phase 6D's cue-cleanup
-- path was added). Safe in production — no music generation ran before Phase 6D
-- was deployed (router was never wired; credit rate was never seeded).
DELETE FROM "audio_cues"
WHERE (("metadata"->>'kind') = 'MUSIC_TRACK')
  AND "audioAssetId" IS NULL;

-- Partial unique index: at most one MUSIC_TRACK cue per track at a time.
-- The service catches Prisma P2002 errors from a conflicting create, refunds
-- any deducted credits, and surfaces CONFLICT so the caller knows to retry
-- after the in-flight generation completes or after admin cleanup.
CREATE UNIQUE INDEX IF NOT EXISTS "audio_cues_music_track_unique"
    ON "audio_cues" ("trackId")
    WHERE (("metadata"->>'kind') = 'MUSIC_TRACK');
