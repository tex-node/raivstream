-- Phase 1, piece (2): ownership split. Additive columns plus one deterministic
-- backfill. No behaviour change and no consumer yet.

ALTER TABLE "character_reference_assets" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "character_reference_assets" ADD COLUMN IF NOT EXISTS "performerId" TEXT;

-- Every existing reference has a project, and every project has an owner, so the
-- backfill is deterministic rather than a guess.
UPDATE "character_reference_assets" a
SET "userId" = p."userId"
FROM "story_projects" p
WHERE a."projectId" = p."id" AND a."userId" IS NULL;

CREATE INDEX IF NOT EXISTS "character_reference_assets_userId_idx" ON "character_reference_assets"("userId");