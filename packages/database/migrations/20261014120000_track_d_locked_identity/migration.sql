-- Track D Layer 2 — locked identity block (verbatim, injected post-enhancement).
-- Three additive nullable columns on story_character_memory. No backfill; existing
-- characters keep today's behavior (lockedIdentityBlock NULL -> deterministic composer).
ALTER TABLE "story_character_memory" ADD COLUMN IF NOT EXISTS "lockedIdentityBlock" TEXT;
ALTER TABLE "story_character_memory" ADD COLUMN IF NOT EXISTS "identityFrozenAt" TIMESTAMP(3);
ALTER TABLE "story_character_memory" ADD COLUMN IF NOT EXISTS "immutableDetails" JSONB;
