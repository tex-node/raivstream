-- Phase 9B.2C.1: provider-neutral Voice Generation Core.
-- Purely additive: two new enums and one new table (voice_generation_jobs).
-- No existing column, table, or enum is altered or dropped. No FKs point
-- INTO this table from any existing table, so no existing table's shape
-- changes at all.

CREATE TYPE "VoiceGenerationType" AS ENUM (
  'SPEECH'
);

CREATE TYPE "VoiceGenerationStatus" AS ENUM (
  'QUEUED',
  'PROCESSING',
  'READY',
  'FAILED',
  'CANCELLED'
);

CREATE TABLE "voice_generation_jobs" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "audioCueId" TEXT NOT NULL,
  "voiceProfileId" TEXT,
  "userId" TEXT NOT NULL,
  "generationType" "VoiceGenerationType" NOT NULL DEFAULT 'SPEECH',
  "status" "VoiceGenerationStatus" NOT NULL DEFAULT 'QUEUED',
  "requestFingerprint" TEXT NOT NULL,
  "requestSnapshot" JSONB NOT NULL,
  "providerKey" TEXT NOT NULL,
  "providerModel" TEXT,
  "providerVoiceKey" TEXT,
  "providerRequestId" TEXT,
  "outputAudioAssetId" TEXT,
  "actualDurationSeconds" DOUBLE PRECISION,
  "sampleRateHz" INTEGER,
  "channels" INTEGER,
  "codec" TEXT,
  "mimeType" TEXT,
  "fileSizeBytes" INTEGER,
  "checksumSha256" TEXT,
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),

  CONSTRAINT "voice_generation_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "voice_generation_jobs_outputAudioAssetId_key" ON "voice_generation_jobs"("outputAudioAssetId");
CREATE UNIQUE INDEX "voice_generation_jobs_audioCueId_requestFingerprint_key" ON "voice_generation_jobs"("audioCueId", "requestFingerprint");

CREATE INDEX "voice_generation_jobs_projectId_idx" ON "voice_generation_jobs"("projectId");
CREATE INDEX "voice_generation_jobs_audioCueId_idx" ON "voice_generation_jobs"("audioCueId");
CREATE INDEX "voice_generation_jobs_status_idx" ON "voice_generation_jobs"("status");
CREATE INDEX "voice_generation_jobs_requestFingerprint_idx" ON "voice_generation_jobs"("requestFingerprint");

ALTER TABLE "voice_generation_jobs"
  ADD CONSTRAINT "voice_generation_jobs_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "story_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "voice_generation_jobs"
  ADD CONSTRAINT "voice_generation_jobs_audioCueId_fkey"
  FOREIGN KEY ("audioCueId") REFERENCES "audio_cues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "voice_generation_jobs"
  ADD CONSTRAINT "voice_generation_jobs_voiceProfileId_fkey"
  FOREIGN KEY ("voiceProfileId") REFERENCES "voice_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "voice_generation_jobs"
  ADD CONSTRAINT "voice_generation_jobs_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "voice_generation_jobs"
  ADD CONSTRAINT "voice_generation_jobs_outputAudioAssetId_fkey"
  FOREIGN KEY ("outputAudioAssetId") REFERENCES "audio_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
