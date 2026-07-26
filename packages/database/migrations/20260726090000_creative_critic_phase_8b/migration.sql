CREATE TYPE "CreativeCriticRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED');
CREATE TYPE "CreativeCriticRecommendation" AS ENUM ('APPROVE', 'SUGGEST_REFINEMENT', 'REGENERATE');
CREATE TYPE "CreativeCriticMode" AS ENUM ('OFF', 'SUGGEST', 'AUTO_ONCE', 'AUTO_UNTIL_THRESHOLD');
CREATE TYPE "CreativeAssetStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED');

ALTER TABLE "story_projects"
  ADD COLUMN "creativeCriticMode" "CreativeCriticMode" NOT NULL DEFAULT 'SUGGEST',
  ADD COLUMN "creativeCriticThreshold" INTEGER,
  ADD COLUMN "creativeCriticMaxRetries" INTEGER;

ALTER TABLE "story_scene_assets"
  ADD COLUMN "creativeStatus" "CreativeAssetStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "criticScore" DOUBLE PRECISION,
  ADD COLUMN "criticRecommendation" "CreativeCriticRecommendation",
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "approvedById" TEXT;

CREATE TABLE "creative_critic_runs" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "sceneId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "reasoningRunId" TEXT,
  "status" "CreativeCriticRunStatus" NOT NULL DEFAULT 'PENDING',
  "overallScore" DOUBLE PRECISION,
  "characterIdentityScore" DOUBLE PRECISION,
  "continuityScore" DOUBLE PRECISION,
  "compositionScore" DOUBLE PRECISION,
  "lightingScore" DOUBLE PRECISION,
  "emotionScore" DOUBLE PRECISION,
  "visualStyleScore" DOUBLE PRECISION,
  "environmentScore" DOUBLE PRECISION,
  "storyAlignmentScore" DOUBLE PRECISION,
  "sceneClarityScore" DOUBLE PRECISION,
  "technicalQualityScore" DOUBLE PRECISION,
  "strengths" JSONB,
  "issues" JSONB,
  "improvementPlan" JSONB,
  "recommendation" "CreativeCriticRecommendation",
  "confidence" DOUBLE PRECISION,
  "criticProvider" TEXT,
  "criticModel" TEXT,
  "criticVersion" TEXT NOT NULL DEFAULT 'phase-8b-v1',
  "specificationVersion" INTEGER,
  "promptVersion" INTEGER,
  "generationVersion" INTEGER,
  "retryAttempt" INTEGER NOT NULL DEFAULT 0,
  "parentCriticRunId" TEXT,
  "resultingAssetId" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "creative_critic_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "creative_critic_runs_assetId_retryAttempt_key" ON "creative_critic_runs"("assetId", "retryAttempt");
CREATE INDEX "creative_critic_runs_projectId_idx" ON "creative_critic_runs"("projectId");
CREATE INDEX "creative_critic_runs_sceneId_idx" ON "creative_critic_runs"("sceneId");
CREATE INDEX "creative_critic_runs_assetId_idx" ON "creative_critic_runs"("assetId");
CREATE INDEX "creative_critic_runs_status_idx" ON "creative_critic_runs"("status");
CREATE INDEX "creative_critic_runs_recommendation_idx" ON "creative_critic_runs"("recommendation");
CREATE INDEX "creative_critic_runs_createdAt_idx" ON "creative_critic_runs"("createdAt");
CREATE INDEX "story_scene_assets_creativeStatus_idx" ON "story_scene_assets"("creativeStatus");
CREATE INDEX "story_scene_assets_criticScore_idx" ON "story_scene_assets"("criticScore");

CREATE TABLE "creative_critic_feedback" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "sceneId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "criticRunId" TEXT,
  "userId" TEXT,
  "rating" TEXT NOT NULL,
  "categories" JSONB,
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creative_critic_feedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "creative_critic_feedback_projectId_idx" ON "creative_critic_feedback"("projectId");
CREATE INDEX "creative_critic_feedback_sceneId_idx" ON "creative_critic_feedback"("sceneId");
CREATE INDEX "creative_critic_feedback_assetId_idx" ON "creative_critic_feedback"("assetId");
CREATE INDEX "creative_critic_feedback_criticRunId_idx" ON "creative_critic_feedback"("criticRunId");
CREATE INDEX "creative_critic_feedback_userId_idx" ON "creative_critic_feedback"("userId");
CREATE INDEX "creative_critic_feedback_rating_idx" ON "creative_critic_feedback"("rating");
CREATE INDEX "creative_critic_feedback_createdAt_idx" ON "creative_critic_feedback"("createdAt");
