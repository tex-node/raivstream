-- Phase 6D: Concurrency-safe music cue lock.
-- Prevents two concurrent Lyria submissions for the same MUSIC track.
--
-- A partial unique index on (trackId) WHERE kind = 'MUSIC_TRACK' ensures
-- only one active music-generation intent record can exist per track at a time.
-- Narration and dialogue cues are unaffected (they have no 'kind' metadata field
-- or have a different kind value).
--
-- The service (generateMusicForVersion) catches Prisma P2002 errors from a
-- conflicting create, refunds any deducted credits, and surfaces CONFLICT so the
-- caller knows to retry after the in-flight generation completes.
-- On any post-create failure the service deletes the unmaterialised cue so the
-- track is unlocked and subsequent retries succeed.

CREATE UNIQUE INDEX IF NOT EXISTS "audio_cues_music_track_unique"
    ON "audio_cues" ("trackId")
    WHERE (("metadata"->>'kind') = 'MUSIC_TRACK');
