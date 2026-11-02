import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { creativeProcedure, router } from '../../trpc';
import { intentService } from '../../lib/creative/intent/service';
import { intentReadinessService } from '../../lib/creative/intent/readiness';
import { CreativeError } from '../../lib/creative/shared/errors';
import { CREATIVE_PROJECT_TYPES } from '../../lib/creative/shared/types';
import { logPreProjectStage } from '../../lib/creative/stageLog';
import { timedCreative } from '../../lib/creative/observability/metrics';

function toTrpcError(error: unknown): TRPCError {
  if (error instanceof CreativeError) {
    const code = error.code === 'CREATIVE_DISABLED' ? 'FORBIDDEN' : 'BAD_REQUEST';
    return new TRPCError({ code, message: error.message });
  }
  return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Intent interpretation failed.' });
}

export const creativeIntentRouter = router({
  interpret: creativeProcedure
    .input(z.object({
      text: z.string().min(1).max(4000),
      projectType: z.enum(CREATIVE_PROJECT_TYPES).optional(),
      /** Correlates this pre-project stage with the project it becomes. */
      requestId: z.string().min(8).max(120).optional(),
    }))
    .query(async ({ input }) => {
      // Intent runs before a project exists, so it is identified by a request id that
      // is threaded to project.create - never by a fabricated project id.
      const requestId = input.requestId ?? crypto.randomUUID();
      logPreProjectStage(requestId, 'intent', 'start', { chars: input.text.length });
      try {
        const result = await timedCreative('intent.interpret', async () => intentService.interpret(input.text, input.projectType));
        logPreProjectStage(requestId, 'intent', 'ok', {
          projectType: (result as { projectType?: string })?.projectType ?? 'unknown',
          requestId,
        });
        return { ...(result as object), requestId };
      } catch (error) {
        throw toTrpcError(error);
      }
    }),

  /**
   * Intent Readiness Gate — does Raivstream have enough to build WITHOUT
   * inventing an essential user-owned source entity? Returns the interpretation
   * plus readiness (and one consequential question when not ready).
   */
  readiness: creativeProcedure
    .input(z.object({
      text: z.string().min(1).max(4000),
      projectType: z.enum(CREATIVE_PROJECT_TYPES).optional(),
      hasSourceAsset: z.boolean().optional(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        return await timedCreative('intent.readiness', () =>
          intentReadinessService.assess(ctx.prisma, {
            userId: ctx.user.id,
            text: input.text,
            projectType: input.projectType,
            hasSourceAsset: input.hasSourceAsset,
          }),
        );
      } catch (error) {
        throw toTrpcError(error);
      }
    }),
});