-- The output row must be able to hold what the renderer measured.
--
-- `creative_outputs.durationSeconds` was INTEGER, so writing the probed value
-- 47.333333 stored 47 - a match against the probe could never be exact, and the
-- Phase 3 duration gate could not pass no matter how correct the write was.
-- The column, the Prisma field and the renderer's value are all float from here.
ALTER TABLE "creative_outputs"
  ALTER COLUMN "durationSeconds" TYPE double precision
  USING "durationSeconds"::double precision;