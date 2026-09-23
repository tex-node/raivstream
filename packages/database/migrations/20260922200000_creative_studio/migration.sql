-- Raivstream 5.0 — Slice 7 (STUDIO): commercial creative operating layer.
-- Additive only. CamelCase columns; snake_case tables via @@map.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CreativeCampaignStatus') THEN
    CREATE TYPE "CreativeCampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CreativeStudioAssetKind') THEN
    CREATE TYPE "CreativeStudioAssetKind" AS ENUM ('IMAGE', 'VIDEO', 'LOGO', 'AUDIO');
  END IF;
END $$;

ALTER TABLE "creative_projects" ADD COLUMN IF NOT EXISTS "campaignId" TEXT;

CREATE TABLE IF NOT EXISTS "creative_studios" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "brandIdentity" JSONB,
  "visualLanguage" JSONB,
  "audioLanguage" JSONB,
  "tone" JSONB,
  "audience" JSONB,
  "approvedMessaging" JSONB,
  "constraints" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "creative_studios_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "creative_studios_userId_idx" ON "creative_studios"("userId");

CREATE TABLE IF NOT EXISTS "creative_products" (
  "id" TEXT NOT NULL,
  "studioId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "identity" JSONB,
  "imagery" JSONB,
  "claims" JSONB,
  "variants" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "creative_products_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "creative_products_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "creative_studios"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "creative_products_studioId_idx" ON "creative_products"("studioId");

CREATE TABLE IF NOT EXISTS "creative_campaigns" (
  "id" TEXT NOT NULL,
  "studioId" TEXT NOT NULL,
  "productId" TEXT,
  "name" TEXT NOT NULL,
  "objective" TEXT,
  "audience" TEXT,
  "context" JSONB,
  "status" "CreativeCampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "creative_campaigns_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "creative_campaigns_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "creative_studios"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "creative_campaigns_productId_fkey" FOREIGN KEY ("productId") REFERENCES "creative_products"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "creative_campaigns_studioId_idx" ON "creative_campaigns"("studioId");

CREATE TABLE IF NOT EXISTS "creative_studio_assets" (
  "id" TEXT NOT NULL,
  "studioId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" "CreativeStudioAssetKind" NOT NULL,
  "assetUrl" TEXT,
  "provenance" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creative_studio_assets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "creative_studio_assets_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "creative_studios"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "creative_studio_assets_studioId_idx" ON "creative_studio_assets"("studioId");