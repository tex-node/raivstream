-- The creator's chosen style default (2026-11-17). Per creator, not per project.
-- The table is the @@map name. The first version said "User", which is the MODEL name: the statement failed with
-- 42P01 (relation "User" does not exist), the migration was never applicable, and the column silently stayed missing.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "styleDefaultKey" TEXT;
