-- D-004 Phase 1: organizations for R16 training cohorts (additive only).
-- New enums + two new tables with FKs to users. No existing table is altered
-- except the implicit FK target (no column changes on users).

CREATE TYPE "OrganizationType" AS ENUM ('SCHOOL', 'INSTITUTION', 'PROGRAM');
CREATE TYPE "OrgMemberRole" AS ENUM ('ORG_ADMIN', 'ORG_MODERATOR', 'STUDENT');
CREATE TYPE "OrgMemberStatus" AS ENUM ('ACTIVE', 'INVITED', 'REMOVED');

CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "OrganizationType" NOT NULL DEFAULT 'SCHOOL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

CREATE TABLE "organization_members" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "OrgMemberRole" NOT NULL,
    "status" "OrgMemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "invitedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_members_organizationId_userId_key"
  ON "organization_members"("organizationId", "userId");
CREATE INDEX "organization_members_userId_status_idx"
  ON "organization_members"("userId", "status");

ALTER TABLE "organization_members"
  ADD CONSTRAINT "organization_members_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_members"
  ADD CONSTRAINT "organization_members_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;