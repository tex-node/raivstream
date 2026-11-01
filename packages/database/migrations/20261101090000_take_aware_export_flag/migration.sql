-- Phase 2, piece (2): per-project take-aware export flag. Default false = current
-- behaviour (any new take is a new composition and a new export). The flag is a
-- column on the project, not an env var: it changes what the film's identity means,
-- so it must be visible in the data and testable per project.
ALTER TABLE "story_projects" ADD COLUMN IF NOT EXISTS "takeAwareExportEnabled" BOOLEAN NOT NULL DEFAULT false;