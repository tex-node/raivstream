import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { protectedProcedure, router } from '../../trpc';
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
  /** DIRECT — resolve intent → change/preserve → impact → new version. Never generates. */
  direct: protectedProcedure
    .input(z.object({ projectId: z.string(), instruction: z.string().min(2).max(300) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await directorService.direct(ctx.prisma, { projectId: input.projectId, userId: ctx.user.id, instruction: input.instruction });
      } catch (error) {
        throw toTrpcError(error, 'Could not interpret the direction.');
      }
    }),

  /** EXPLORE — N variations as separate versions; original preserved. */
  explore: protectedProcedure
    .input(z.object({ projectId: z.string(), instruction: z.string().min(2).max(300) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await directorService.explore(ctx.prisma, { projectId: input.projectId, userId: ctx.user.id, instruction: input.instruction });
      } catch (error) {
        throw toTrpcError(error, 'Could not explore variations.');
      }
    }),

  /** Apply a directive: mutate the semantic state + mark affected scenes for targeted regeneration. */
  apply: protectedProcedure
    .input(z.object({ projectId: z.string(), directiveId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await directorService.apply(ctx.prisma, { projectId: input.projectId, userId: ctx.user.id, directiveId: input.directiveId });
      } catch (error) {
        throw toTrpcError(error, 'Could not apply the direction.');
      }
    }),

  /** Minimal version list (Direct/Explore safety). */
  versions: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      try {
        return await directorService.versions(ctx.prisma, { projectId: input.projectId, userId: ctx.user.id });
      } catch (error) {
        throw toTrpcError(error, 'Versions unavailable.');
      }
    }),
});