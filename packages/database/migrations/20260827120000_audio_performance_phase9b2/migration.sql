-- Phase 9B.2: Audio & Performance layer.
-- Purely additive: new enums, new tables, and two nullable columns on the
-- existing movie_render_jobs table. No existing column, table, or enum is
-- altered or dropped.

CREATE TYPE "AudioPlanStatus" AS ENUM (
  'DRAFT',
  'LOCKED',
  'ARCHIVED'
);

CREATE TYPE "AudioTrackType" AS ENUM (
  'NARRATION',
  'DIALOGUE',
  'AMBIENCE',
  'SFX',
  'MUSIC'
);

CREATE TABLE "audio_performance_plans" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "sequenceId" TEXT NOT NULL,
  "status" "AudioPlanStatus" NOT NULL DEFAULT 'DRAFT',
  "currentVersionNumber" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "audio_performance_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audio_tracks" (
  "id" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "type" "AudioTrackType" NOT NULL,
  "name" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "volume" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "audio_tracks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "voice_profiles" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "characterMemoryId" TEXT,
  "name" TEXT NOT NULL,
  "voiceType" TEXT,
  "voiceRef" TEXT,
  "language" TEXT DEFAULT 'en',
  "accentStyle" TEXT,
  "pitch" DOUBLE PRECISION,
  "rate" DOUBLE PRECISION,
  "styleNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "voice_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audio_assets" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "storageProvider" TEXT NOT NULL DEFAULT 'R2',
  "storageKey" TEXT NOT NULL,
  "publicUrl" TEXT,
  "mimeType" TEXT NOT NULL DEFAULT 'audio/mpeg',
  "durationSeconds" DOUBLE PRECISION,
  "fileSizeBytes" INTEGER,
  "checksum" TEXT,
  "sampleRateHz" INTEGER,
  "channels" INTEGER,
  "sourceKind" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "audio_assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audio_cues" (
  "id" TEXT NOT NULL,
  "trackId" TEXT NOT NULL,
  "sequenceSceneId" TEXT,
  "characterMemoryId" TEXT,
  "voiceProfileId" TEXT,
  "audioAssetId" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "order" INTEGER NOT NULL DEFAULT 0,
  "startTimeSeconds" DOUBLE PRECISION NOT NULL,
  "durationSeconds" DOUBLE PRECISION,
  "trimStartSeconds" DOUBLE PRECISION,
  "trimEndSeconds" DOUBLE PRECISION,
  "volume" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "fadeInSeconds" DOUBLE PRECISION,
  "fadeOutSeconds" DOUBLE PRECISION,
  "text" TEXT,
  "performancePreset" TEXT,
  "performanceDirection" TEXT,
  "duckingEnabled" BOOLEAN NOT NULL DEFAULT false,
  "duckingAmountDb" DOUBLE PRECISION,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "audio_cues_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audio_plan_versions" (
  "id" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "audioBlueprint" JSONB,
  "runtimeSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdById" TEXT NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "audio_plan_versions_pkey" PRIMARY KEY ("id")
);

-- Additive columns on the existing movie_render_jobs table. Both nullable:
-- a silent-film render job never sets them.
ALTER TABLE "movie_render_jobs" ADD COLUMN "audioBlueprintSnapshot" JSONB;
ALTER TABLE "movie_render_jobs" ADD COLUMN "audioPlanVersionId" TEXT;

CREATE INDEX "audio_performance_plans_projectId_idx" ON "audio_performance_plans"("projectId");
CREATE INDEX "audio_performance_plans_sequenceId_idx" ON "audio_performance_plans"("sequenceId");
CREATE INDEX "audio_performance_plans_sequenceId_status_idx" ON "audio_performance_plans"("sequenceId", "status");

CREATE INDEX "audio_tracks_planId_idx" ON "audio_tracks"("planId");
CREATE INDEX "audio_tracks_planId_order_idx" ON "audio_tracks"("planId", "order");
CREATE INDEX "audio_tracks_planId_type_idx" ON "audio_tracks"("planId", "type");

CREATE INDEX "voice_profiles_projectId_idx" ON "voice_profiles"("projectId");
CREATE INDEX "voice_profiles_characterMemoryId_idx" ON "voice_profiles"("characterMemoryId");

CREATE INDEX "audio_assets_projectId_idx" ON "audio_assets"("projectId");
CREATE INDEX "audio_assets_userId_idx" ON "audio_assets"("userId");

CREATE INDEX "audio_cues_trackId_idx" ON "audio_cues"("trackId");
CREATE INDEX "audio_cues_trackId_startTimeSeconds_idx" ON "audio_cues"("trackId", "startTimeSeconds");
CREATE INDEX "audio_cues_sequenceSceneId_idx" ON "audio_cues"("sequenceSceneId");
CREATE INDEX "audio_cues_characterMemoryId_idx" ON "audio_cues"("characterMemoryId");
CREATE INDEX "audio_cues_voiceProfileId_idx" ON "audio_cues"("voiceProfileId");
CREATE INDEX "audio_cues_audioAssetId_idx" ON "audio_cues"("audioAssetId");

CREATE UNIQUE INDEX "audio_plan_versions_planId_versionNumber_key" ON "audio_plan_versions"("planId", "versionNumber");
CREATE INDEX "audio_plan_versions_planId_idx" ON "audio_plan_versions"("planId");
CREATE INDEX "audio_plan_versions_createdById_idx" ON "audio_plan_versions"("createdById");

ALTER TABLE "audio_performance_plans"
  ADD CONSTRAINT "audio_performance_plans_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "story_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "audio_performance_plans"
  ADD CONSTRAINT "audio_performance_plans_sequenceId_fkey"
  FOREIGN KEY ("sequenceId") REFERENCES "story_sequences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "audio_tracks"
  ADD CONSTRAINT "audio_tracks_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "audio_performance_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "voice_profiles"
  ADD CONSTRAINT "voice_profiles_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "story_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "voice_profiles"
  ADD CONSTRAINT "voice_profiles_characterMemoryId_fkey"
  FOREIGN KEY ("characterMemoryId") REFERENCES "story_character_memory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audio_assets"
  ADD CONSTRAINT "audio_assets_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "story_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "audio_assets"
  ADD CONSTRAINT "audio_assets_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "audio_cues"
  ADD CONSTRAINT "audio_cues_trackId_fkey"
  FOREIGN KEY ("trackId") REFERENCES "audio_tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "audio_cues"
  ADD CONSTRAINT "audio_cues_sequenceSceneId_fkey"
  FOREIGN KEY ("sequenceSceneId") REFERENCES "story_sequence_scenes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audio_cues"
  ADD CONSTRAINT "audio_cues_characterMemoryId_fkey"
  FOREIGN KEY ("characterMemoryId") REFERENCES "story_character_memory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audio_cues"
  ADD CONSTRAINT "audio_cues_voiceProfileId_fkey"
  FOREIGN KEY ("voiceProfileId") REFERENCES "voice_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audio_cues"
  ADD CONSTRAINT "audio_cues_audioAssetId_fkey"
  FOREIGN KEY ("audioAssetId") REFERENCES "audio_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audio_plan_versions"
  ADD CONSTRAINT "audio_plan_versions_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "audio_performance_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
