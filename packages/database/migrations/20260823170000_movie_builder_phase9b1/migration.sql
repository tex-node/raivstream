CREATE TYPE "MovieRenderStatus" AS ENUM (
  'QUEUED',
  'PREPARING',
  'RENDERING_SHOTS',
  'ASSEMBLING',
  'ENCODING',
  'VERIFYING',
  'UPLOADING',
  'READY',
  'FAILED',
  'CANCELLED'
);

CREATE TYPE "MovieAssetStatus" AS ENUM (
  'READY',
  'ARCHIVED',
  'FAILED'
);

CREATE TABLE "movie_render_jobs" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "sequenceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "MovieRenderStatus" NOT NULL DEFAULT 'QUEUED',
  "filmBlueprintSnapshot" JSONB NOT NULL,
  "renderPlan" JSONB NOT NULL,
  "renderPlanHash" TEXT NOT NULL,
  "rendererVersion" TEXT NOT NULL DEFAULT 'phase-9b1-v1',
  "progressPercent" INTEGER NOT NULL DEFAULT 0,
  "currentStage" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "creditsReserved" INTEGER NOT NULL DEFAULT 0,
  "creditsCharged" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "movie_render_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "movie_assets" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "sequenceId" TEXT NOT NULL,
  "renderJobId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "status" "MovieAssetStatus" NOT NULL DEFAULT 'READY',
  "storageProvider" TEXT NOT NULL DEFAULT 'R2',
  "storageKey" TEXT NOT NULL,
  "publicUrl" TEXT,
  "mimeType" TEXT NOT NULL DEFAULT 'video/mp4',
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "durationSeconds" DOUBLE PRECISION NOT NULL,
  "fps" INTEGER NOT NULL,
  "fileSizeBytes" INTEGER,
  "checksum" TEXT,
  "isCurrent" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "movie_assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "movie_render_events" (
  "id" TEXT NOT NULL,
  "renderJobId" TEXT NOT NULL,
  "eventName" TEXT NOT NULL,
  "stage" TEXT,
  "progressPercent" INTEGER,
  "message" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "movie_render_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "movie_assets_renderJobId_key" ON "movie_assets"("renderJobId");
CREATE UNIQUE INDEX "movie_assets_projectId_versionNumber_key" ON "movie_assets"("projectId", "versionNumber");

CREATE INDEX "movie_render_jobs_projectId_idx" ON "movie_render_jobs"("projectId");
CREATE INDEX "movie_render_jobs_sequenceId_idx" ON "movie_render_jobs"("sequenceId");
CREATE INDEX "movie_render_jobs_userId_idx" ON "movie_render_jobs"("userId");
CREATE INDEX "movie_render_jobs_status_idx" ON "movie_render_jobs"("status");
CREATE INDEX "movie_render_jobs_renderPlanHash_idx" ON "movie_render_jobs"("renderPlanHash");
CREATE INDEX "movie_render_jobs_createdAt_idx" ON "movie_render_jobs"("createdAt");

CREATE INDEX "movie_assets_projectId_idx" ON "movie_assets"("projectId");
CREATE INDEX "movie_assets_sequenceId_idx" ON "movie_assets"("sequenceId");
CREATE INDEX "movie_assets_status_idx" ON "movie_assets"("status");
CREATE INDEX "movie_assets_isCurrent_idx" ON "movie_assets"("isCurrent");

CREATE INDEX "movie_render_events_renderJobId_idx" ON "movie_render_events"("renderJobId");
CREATE INDEX "movie_render_events_eventName_idx" ON "movie_render_events"("eventName");
CREATE INDEX "movie_render_events_createdAt_idx" ON "movie_render_events"("createdAt");

ALTER TABLE "movie_render_jobs"
  ADD CONSTRAINT "movie_render_jobs_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "story_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "movie_render_jobs"
  ADD CONSTRAINT "movie_render_jobs_sequenceId_fkey"
  FOREIGN KEY ("sequenceId") REFERENCES "story_sequences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "movie_render_jobs"
  ADD CONSTRAINT "movie_render_jobs_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "movie_assets"
  ADD CONSTRAINT "movie_assets_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "story_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "movie_assets"
  ADD CONSTRAINT "movie_assets_sequenceId_fkey"
  FOREIGN KEY ("sequenceId") REFERENCES "story_sequences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "movie_assets"
  ADD CONSTRAINT "movie_assets_renderJobId_fkey"
  FOREIGN KEY ("renderJobId") REFERENCES "movie_render_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "movie_render_events"
  ADD CONSTRAINT "movie_render_events_renderJobId_fkey"
  FOREIGN KEY ("renderJobId") REFERENCES "movie_render_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
