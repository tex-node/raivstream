-- Phase 1, piece (3), step 1: the experiment flag for identity conditioning.
-- Additive and inert: default false leaves every project on the existing
-- lockedIdentityBlock text path, so this migration changes no behaviour.
--
-- Per-project rather than a global env flag: the A/B must be scored by the same
-- deploy, worker and critic, otherwise it compares two deploys instead of two
-- conditioning mechanisms.

ALTER TABLE "story_projects" ADD COLUMN IF NOT EXISTS "identityRefsEnabled" BOOLEAN NOT NULL DEFAULT false;
