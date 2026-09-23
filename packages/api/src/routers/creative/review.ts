import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { protectedProcedure, router } from '../../trpc';
import { reviewService } from '../../lib/creative/review/service';
import { CreativeError } from '../../lib/creative/shared/errors';

function toTrpcError(error: unknown, fallback: string): TRPCError {
  if (error instanceof CreativeError) {
    const code = error.code === 'PROJECT_NOT_FOUND' ? 'NOT_FOUND' : error.code === 'CREATIVE_DISABLED' ? 'FORBIDDEN' : 'BAD_REQUEST';
    return new TRPCError({ code, message: error.message });
  }
  return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: fallback });
}

export const creativeReviewRouter = router({
  /** Run a review of the produced output (one run per scene image). */
  run: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await reviewService.runReview(ctx.prisma, { projectId: input.projectId, userId: ctx.user.id });
      } catch (error) {
        throw toTrpcError(error, 'Review could not run.');
      }
    }),

  /** Latest review runs + resolutions. */
  get: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      try {
        return await reviewService.getReview(ctx.prisma, { projectId: input.projectId, userId: ctx.user.id });
      } catch (error) {
        throw toTrpcError(error, 'Review unavailable.');
      }
    }),

  /** Record a KEEP / FIX / REVIEW decision on a finding. */
  resolve: protectedProcedure
    .input(z.object({ projectId: z.string(), runId: z.string(), findingId: z.string(), resolution: z.enum(['KEEP', 'FIX', 'REVIEW']) }))
    .mutation(async ({ ctx, input }) => {
      try {
        await reviewService.resolve(ctx.prisma, { projectId: input.projectId, runId: input.runId, findingId: input.findingId, resolution: input.resolution });
        return { ok: true };
      } catch (error) {
        throw toTrpcError(error, 'Resolution could not be saved.');
      }
    }),
});