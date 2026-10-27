-- D-004 Phase 1: organizations for R16 training cohorts (additive only).
--
-- NAMESPACED DELIBERATELY: this Postgres instance is shared with other tenants
-- (UltraLeague / Powervend), and `public.organizations` + `public.organization_members`
-- already exist with a different shape (uuid ids, snake_case timestamps).
-- An unprefixed migration failed with 42P07 "relation organizations already exists".
-- Prefixing both the tables and the enum types keeps the two schemas independent.

CREATE TYPE "RaivOrganizationType" AS ENUM ('SCHOOL', 'INSTITUTION', 'PROGRAM');
CREATE TYPE "RaivOrgMemberRole" AS ENUM ('ORG_ADMIN', 'ORG_MODERATOR', 'STUDENT');
CREATE TYPE "RaivOrgMemberStatus" AS ENUM ('ACTIVE', 'INVITED', 'REMOVED');

CREATE TABLE "raivstream_organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "RaivOrganizationType" NOT NULL DEFAULT 'SCHOOL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "raivstream_organizations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "raivstream_organizations_slug_key" ON "raivstream_organizations"("slug");

CREATE TABLE "raivstream_organization_members" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "RaivOrgMemberRole" NOT NULL,
    "status" "RaivOrgMemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "invitedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "raivstream_organization_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "raivstream_organization_members_organizationId_userId_key"
  ON "raivstream_organization_members"("organizationId", "userId");
CREATE INDEX "raivstream_organization_members_userId_status_idx"
  ON "raivstream_organization_members"("userId", "status");

ALTER TABLE "raivstream_organization_members"
  ADD CONSTRAINT "raivstream_organization_members_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "raivstream_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "raivstream_organization_members"
  ADD CONSTRAINT "raivstream_organization_members_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;