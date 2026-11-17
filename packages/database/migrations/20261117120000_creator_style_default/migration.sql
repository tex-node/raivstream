-- The creator's chosen style default (2026-11-17). Per creator, not per project.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "styleDefaultKey" TEXT;
