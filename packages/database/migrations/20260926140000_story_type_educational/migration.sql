-- Phase F2: Add EDUCATIONAL to StoryType enum
-- Required for createSpark(storyType:'EDUCATIONAL') to persist the explicit
-- educational intent without a Prisma P2009 validation error.
-- Additive-only; existing rows are unaffected.
ALTER TYPE "StoryType" ADD VALUE IF NOT EXISTS 'EDUCATIONAL';
