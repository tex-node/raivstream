import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { protectedProcedure, router } from '../../trpc';
import { productionPlanService } from '../../lib/creative/production/service';
import { isCreativePreviewEnabled } from '../../lib/creative/featureFlags';
import { CreativeError } from '../../lib/creative/shared/errors';

function toTrpcError(error: unknown, fallback: string): TRPCError {
  if (error instanceof CreativeError) {
    const code = error.code === 'PROJECT_NOT_FOUND' ? 'NOT_FOUND' : error.code === 'CREATIVE_DISABLED' ? 'FORBIDDEN' : 'BAD_REQUEST';
    return new TRPCError({ code, message: error.message });
  }
  return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: fallback });
}

export const creativeProductionRouter = router({
  /** Build (and persist) the production plan + preview from Brief + Bible. */
  plan: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!isCreativePreviewEnabled()) throw new TRPCError({ code: 'FORBIDDEN', message: 'Raivstream 5.0 preview is not enabled.' });
      try {
        const result = await productionPlanService.plan(ctx.prisma, { projectId: input.projectId, userId: ctx.user.id });
        // Building the plan moves the project into preview so the creator can approve it.
        await ctx.prisma.creativeProject.update({
          where: { id: input.projectId },
          data: { status: 'PREVIEW' as never },
        });
        return result;
      } catch (error) {
        throw toTrpcError(error, 'Plan building failed.');
      }
    }),

  /** Read the stored plan + preview. */
  getPlan: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      if (!isCreativePreviewEnabled()) throw new TRPCError({ code: 'FORBIDDEN', message: 'Raivstream 5.0 preview is not enabled.' });
      try {
        return await productionPlanService.getPlan(ctx.prisma, { projectId: input.projectId, userId: ctx.user.id });
      } catch (error) {
        throw toTrpcError(error, 'Plan not found.');
      }
    }),

  /** Adapter output (internal seam for Slice 3 — not shown to creators). */
  adapt: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      if (!isCreativePreviewEnabled()) throw new TRPCError({ code: 'FORBIDDEN', message: 'Raivstream 5.0 preview is not enabled.' });
      try {
        return await productionPlanService.adapt(ctx.prisma, { projectId: input.projectId, userId: ctx.user.id });
      } catch (error) {
        throw toTrpcError(error, 'Plan adaptation failed.');
      }
    }),
});