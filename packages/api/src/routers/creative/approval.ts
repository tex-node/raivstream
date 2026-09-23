import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { protectedProcedure, router } from '../../trpc';
import { approvalService } from '../../lib/creative/approval/service';
import { CreativeError } from '../../lib/creative/shared/errors';

function toTrpcError(error: unknown, fallback: string): TRPCError {
  if (error instanceof CreativeError) {
    const code = error.code === 'PROJECT_NOT_FOUND' ? 'NOT_FOUND' : error.code === 'CREATIVE_DISABLED' ? 'FORBIDDEN' : 'BAD_REQUEST';
    return new TRPCError({ code, message: error.message });
  }
  return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: fallback });
}

export const creativeApprovalRouter = router({
  /** Version-specific approve / reject / request changes (CREATIVE, PRODUCTION, OUTPUT). */
  decide: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      versionId: z.string(),
      kind: z.enum(['CREATIVE', 'PRODUCTION', 'OUTPUT']),
      decision: z.enum(['approve', 'reject', 'request_changes']),
      note: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await approvalService.decide(ctx.prisma, { projectId: input.projectId, versionId: input.versionId, kind: input.kind, decision: input.decision, note: input.note, userId: ctx.user.id });
      } catch (error) {
        throw toTrpcError(error, 'Approval could not be saved.');
      }
    }),

  list: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      try {
        return await approvalService.list(ctx.prisma, { projectId: input.projectId });
      } catch (error) {
        throw toTrpcError(error, 'Approvals unavailable.');
      }
    }),
});