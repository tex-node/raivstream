-- fal.ai generation models — additive enum extension only.
-- Adds FLUX2 (image), H3_MAX (image-to-video), and VEED_FABRIC (talking-video)
-- to the GenerationModel enum. No existing table/column is altered.

-- AlterEnum
ALTER TYPE "GenerationModel" ADD VALUE 'FLUX2';
ALTER TYPE "GenerationModel" ADD VALUE 'H3_MAX';
ALTER TYPE "GenerationModel" ADD VALUE 'VEED_FABRIC';
