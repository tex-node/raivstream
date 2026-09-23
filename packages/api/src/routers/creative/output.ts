import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { creativeProcedure, router } from '../../trpc';
import { outputService } from '../../lib/creative/output/service';
import { CreativeError } from '../../lib/creative/shared/errors';
import { timedCreative } from '../../lib/creative/observability/metrics';

function toTrpcError(error: unknown, fallback: string): TRPCError {
  if (error instanceof CreativeError) {
    const code = error.code === 'PROJECT_NOT_FOUND' ? 'NOT_FOUND' : error.code === 'CREATIVE_DISABLED' || error.code === 'PLAN_NOT_APPROVED' ? 'FORBIDDEN' : 'BAD_REQUEST';
    return new TRPCError({ code, message: error.message });
  }
  return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: fallback });
}

export const creativeOutputRouter = router({
  /** Create an output derivative from an APPROVED version (PENDING row + derivation plan). */
  derive: creativeProcedure
    .input(z.object({ projectId: z.string(), versionId: z.string(), format: z.enum(['MASTER', 'LANDSCAPE', 'PORTRAIT', 'SQUARE']), durationSeconds: z.number().int().min(5).max(600).optional() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await timedCreative('output.derive', () => outputService.derive(ctx.prisma, { projectId: input.projectId, versionId: input.versionId, format: input.format, durationSeconds: input.durationSeconds }));
      } catch (error) {
        throw toTrpcError(error, 'Output could not be derived.');
      }
    }),

  /** Render a pending output (sync re-encode; mechanics are ours). */
  render: creativeProcedure
    .input(z.object({ projectId: z.string(), outputId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await timedCreative('output.render', () => outputService.render(ctx.prisma, { projectId: input.projectId, outputId: input.outputId }));
      } catch (error) {
        throw toTrpcError(error, 'Output could not be rendered.');
      }
    }),

  /** Output gallery (provenance back to the source version). */
  list: creativeProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      try {
        return await outputService.list(ctx.prisma, { projectId: input.projectId, userId: ctx.user.id });
      } catch (error) {
        throw toTrpcError(error, 'Outputs unavailable.');
      }
    }),
});