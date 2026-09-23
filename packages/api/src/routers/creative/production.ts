import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { creativeProcedure, router } from '../../trpc';
import { productionPlanService } from '../../lib/creative/production/service';
import { recoverStuckProductions } from '../../lib/creative/production/runner';
import { buildRunDiagnostics } from '../../lib/creative/production/diagnostics';
import { isCreativePreviewEnabled, isCreativeProductionEnabled } from '../../lib/creative/featureFlags';
import { CreativeError } from '../../lib/creative/shared/errors';
import { timedCreative } from '../../lib/creative/observability/metrics';

function toTrpcError(error: unknown, fallback: string): TRPCError {
  if (error instanceof CreativeError) {
    const code = error.code === 'PROJECT_NOT_FOUND' ? 'NOT_FOUND' : error.code === 'CREATIVE_DISABLED' ? 'FORBIDDEN' : error.code === 'PLAN_NOT_APPROVED' ? 'BAD_REQUEST' : 'BAD_REQUEST';
    return new TRPCError({ code, message: error.message });
  }
  return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: fallback });
}

export const creativeProductionRouter = router({
  /** Build (and persist) the production plan + preview from Brief + Bible. */
  plan: creativeProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!isCreativePreviewEnabled()) throw new TRPCError({ code: 'FORBIDDEN', message: 'Raivstream 5.0 preview is not enabled.' });
      try {
        // ProductionPlanService.plan persists the plan AND moves the project to
        // PREVIEW (the state transition is owned by the service).
        return await timedCreative('plan.build', () => productionPlanService.plan(ctx.prisma, { projectId: input.projectId, userId: ctx.user.id }));
      } catch (error) {
        throw toTrpcError(error, 'Plan building failed.');
      }
    }),

  /** Read the stored plan + preview. */
  getPlan: creativeProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      if (!isCreativePreviewEnabled()) throw new TRPCError({ code: 'FORBIDDEN', message: 'Raivstream 5.0 preview is not enabled.' });
      try {
        return await productionPlanService.getPlan(ctx.prisma, { projectId: input.projectId, userId: ctx.user.id });
      } catch (error) {
        throw toTrpcError(error, 'Plan not found.');
      }
    }),

  /** Adapter output (internal seam for Slice 3 â€” not shown to creators). */
  adapt: creativeProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      if (!isCreativePreviewEnabled()) throw new TRPCError({ code: 'FORBIDDEN', message: 'Raivstream 5.0 preview is not enabled.' });
      try {
        return await productionPlanService.adapt(ctx.prisma, { projectId: input.projectId, userId: ctx.user.id });
      } catch (error) {
        throw toTrpcError(error, 'Plan adaptation failed.');
      }
    }),

  /** Slice 3 â€” start production of an approved plan ("Produce"). */
  produce: creativeProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await timedCreative('production.produce', () => productionPlanService.produce(ctx.prisma, { projectId: input.projectId, userId: ctx.user.id }));
      } catch (error) {
        throw toTrpcError(error, 'Production could not start.');
      }
    }),

  /** Scene-level production progress (polled by the UI). */
  productionStatus: creativeProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      if (!isCreativeProductionEnabled()) throw new TRPCError({ code: 'FORBIDDEN', message: 'Raivstream 5.0 production is not enabled.' });
      try {
        return await timedCreative('production.status', () => productionPlanService.productionStatus(ctx.prisma, { projectId: input.projectId, userId: ctx.user.id }));
      } catch (error) {
        throw toTrpcError(error, 'Production status unavailable.');
      }
    }),

  /** Produced assets for a project. */
  getAssets: creativeProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      if (!isCreativeProductionEnabled()) throw new TRPCError({ code: 'FORBIDDEN', message: 'Raivstream 5.0 production is not enabled.' });
      try {
        return await productionPlanService.getAssets(ctx.prisma, { projectId: input.projectId, userId: ctx.user.id });
      } catch (error) {
        throw toTrpcError(error, 'Assets unavailable.');
      }
    }),

  /** Reliability hardening: resume any stuck production run for this user's projects. */
  recover: creativeProcedure
    .mutation(async ({ ctx }) => {
      if (!isCreativeProductionEnabled()) throw new TRPCError({ code: 'FORBIDDEN', message: 'Raivstream 5.0 production is not enabled.' });
      try {
        const result = await recoverStuckProductions(ctx.prisma, undefined, { userId: ctx.user.id });
        return { recovered: result.recovered, alreadyActive: result.alreadyActive, stale: result.stale };
      } catch (error) {
        throw toTrpcError(error, 'Recovery failed.');
      }
    }),

  /** Diagnose a production run + provenance chain without raw provider internals. */
  diagnostics: creativeProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      try {
        return await buildRunDiagnostics(ctx.prisma, { projectId: input.projectId, userId: ctx.user.id });
      } catch (error) {
        throw toTrpcError(error, 'Diagnostics unavailable.');
      }
    }),
});