-- Phase 6A: Character Director and internal Story DNA.
-- All fields are nullable so existing story projects and characters keep current behavior.

ALTER TABLE "story_projects"
  ADD COLUMN "storyDna" JSONB;

ALTER TABLE "story_character_memory"
  ADD COLUMN "personalityTraits" JSONB,
  ADD COLUMN "motivation" TEXT,
  ADD COLUMN "fear" TEXT,
  ADD COLUMN "goal" TEXT,
  ADD COLUMN "favoriteExpression" TEXT,
  ADD COLUMN "walkingStyle" TEXT,
  ADD COLUMN "speakingStyle" TEXT,
  ADD COLUMN "relationships" JSONB,
  ADD COLUMN "evolutionStage" TEXT,
  ADD COLUMN "evolutionNotes" TEXT,
  ADD COLUMN "evolutionSceneOrder" INTEGER,
  ADD COLUMN "directorChangedAt" TIMESTAMP(3);

