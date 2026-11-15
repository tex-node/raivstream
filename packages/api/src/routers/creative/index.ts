import { router } from '../../trpc';
import { z } from 'zod';
import { creativeProcedure } from '../../trpc';
import { runRelight } from '../../lib/creative/transform/procedure';
import { creativeProjectRouter } from './project';
import { creativeIntentRouter } from './intent';
import { creativeHomerRouter } from './homer';
import { creativeProductionRouter } from './production';
import { creativeReviewRouter } from './review';
import { creativeDirectorRouter } from './director';
import { creativeApprovalRouter } from './approval';
import { creativeOutputRouter } from './output';
import { creativeSeriesRouter } from './series';
import { creativeStudioRouter } from './studio';
import { creativeObservabilityRouter } from './observability';
import { creativeAudioRouter } from './audio';

/**
 * Raivstream 5.0 — Creative API surface.
 * Registers as `creative` on the root router.
 */
export const creativeRouter = router({
  /**
   * Relight one existing scene asset (2026-11-15). The duration comes from the asset's own row, the charge is
   * rate x billed seconds, and the ceiling is asserted before the charge.
   */
  relight: creativeProcedure
    .input(z.object({ projectId: z.string(), assetId: z.string(), resolution: z.enum(['720p', '1080p']) }))
    .mutation(async ({ ctx, input }) => runRelight(ctx.prisma, {
      projectId: input.projectId,
      assetId: input.assetId,
      resolution: input.resolution,
      userId: ctx.user.id,
    })),
  project: creativeProjectRouter,
  intent: creativeIntentRouter,
  homer: creativeHomerRouter,
  production: creativeProductionRouter,
  review: creativeReviewRouter,
  director: creativeDirectorRouter,
  approval: creativeApprovalRouter,
  output: creativeOutputRouter,
  series: creativeSeriesRouter,
  studio: creativeStudioRouter,
  observability: creativeObservabilityRouter,
  audio: creativeAudioRouter,
});