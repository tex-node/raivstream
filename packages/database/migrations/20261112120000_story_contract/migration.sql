-- What the chapter CONTAINS, extracted from its body (2026-11-12).
-- Nullable by design: null means the body does not contain the field, and the extraction abstains
-- rather than inventing one. Separate from story_projects.story_dna, which is the plan summary.
ALTER TABLE "story_chapters" ADD COLUMN IF NOT EXISTS "storyContract" JSONB;
