import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { creativeProcedure, router } from '../../trpc';
import { directorService } from '../../lib/creative/director/service';
import { CreativeError } from '../../lib/creative/shared/errors';

function toTrpcError(error: unknown, fallback: string): TRPCError {
  if (error instanceof CreativeError) {
    const code = error.code === 'PROJECT_NOT_FOUND' ? 'NOT_FOUND' : error.code === 'CREATIVE_DISABLED' ? 'FORBIDDEN' : 'BAD_REQUEST';
    return new TRPCError({ code, message: error.message });
  }
  return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: fallback });
}

export const creativeDirectorRouter = router({
  /** DIRECT â€” resolve intent â†’ change/preserve â†’ impact â†’ new version. Never generates. */
  direct: creativeProcedure
    .input(z.object({ projectId: z.string(), instruction: z.string().min(2).max(300) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await directorService.direct(ctx.prisma, { projectId: input.projectId, userId: ctx.user.id, instruction: input.instruction });
      } catch (error) {
        throw toTrpcError(error, 'Could not interpret the direction.');
      }
    }),

  /** PROPOSE â€” interpret a directive (change/preserve/impact) without persisting. */
  propose: creativeProcedure
    .input(z.object({ projectId: z.string(), instruction: z.string().min(2).max(300) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await directorService.propose(ctx.prisma, { projectId: input.projectId, userId: ctx.user.id, instruction: input.instruction });
      } catch (error) {
        throw toTrpcError(error, 'Could not understand the direction.');
      }
    }),

  /** APPLY INSTRUCTION â€” propose + snapshot + apply + mark affected scenes. */
  applyInstruction: creativeProcedure
    .input(z.object({ projectId: z.string(), instruction: z.string().min(2).max(300) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await directorService.applyInstruction(ctx.prisma, { projectId: input.projectId, userId: ctx.user.id, instruction: input.instruction });
      } catch (error) {
        throw toTrpcError(error, 'Could not apply the direction.');
      }
    }),

  /** EXPLORE â€” N variations as separate versions; original preserved. */
  explore: creativeProcedure
    .input(z.object({ projectId: z.string(), instruction: z.string().min(2).max(300) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await directorService.explore(ctx.prisma, { projectId: input.projectId, userId: ctx.user.id, instruction: input.instruction });
      } catch (error) {
        throw toTrpcError(error, 'Could not explore variations.');
      }
    }),

  /** Apply a directive: mutate the semantic state + mark affected scenes for targeted regeneration. */
  applyDirective: creativeProcedure
    .input(z.object({ projectId: z.string(), directiveId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await directorService.apply(ctx.prisma, { projectId: input.projectId, userId: ctx.user.id, directiveId: input.directiveId });
      } catch (error) {
        throw toTrpcError(error, 'Could not apply the direction.');
      }
    }),

  /** Minimal version list (Direct/Explore safety). */
  versions: creativeProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      try {
        return await directorService.versions(ctx.prisma, { projectId: input.projectId, userId: ctx.user.id });
      } catch (error) {
        throw toTrpcError(error, 'Versions unavailable.');
      }
    }),
});