import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { creativeProcedure, router } from '../../trpc';
import { projectService } from '../../lib/creative/project/service';
import { memoryService } from '../../lib/creative/memory/service';
import { isCreativeEnabled } from '../../lib/creative/featureFlags';
import { CreativeError } from '../../lib/creative/shared/errors';
import { CREATIVE_MEMORY_KINDS, CREATIVE_PROJECT_STATUSES, CREATIVE_PROJECT_TYPES } from '../../lib/creative/shared/types';

function toTrpcError(error: unknown, fallback: string): TRPCError {
  if (error instanceof CreativeError) {
    const code = error.code === 'CREATIVE_DISABLED' || error.code === 'PROJECT_NOT_FOUND' ? (error.code === 'PROJECT_NOT_FOUND' ? 'NOT_FOUND' : 'FORBIDDEN') : 'BAD_REQUEST';
    return new TRPCError({ code, message: error.message });
  }
  return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: fallback });
}

export const creativeProjectRouter = router({
  create: creativeProcedure
    .input(z.object({
      text: z.string().min(1).max(4000),
      projectType: z.enum(CREATIVE_PROJECT_TYPES).optional(),
      legacyStoryProjectId: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await projectService.createFromIntent(ctx.prisma, {
          userId: ctx.user.id,
          text: input.text,
          legacyStoryProjectId: input.legacyStoryProjectId,
          interpretation: input.projectType
            ? (await import('../../lib/creative/intent/service')).intentService.interpret(input.text, input.projectType)
            : undefined,
        });
      } catch (error) {
        throw toTrpcError(error, 'Project creation failed.');
      }
    }),

  list: creativeProcedure
    .query(async ({ ctx }) => {
      if (!isCreativeEnabled()) throw new TRPCError({ code: 'FORBIDDEN', message: 'Raivstream 5.0 is not enabled.' });
      return projectService.list(ctx.prisma, ctx.user.id);
    }),

  get: creativeProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      try {
        return await projectService.get(ctx.prisma, { projectId: input.projectId, userId: ctx.user.id });
      } catch (error) {
        throw toTrpcError(error, 'Project not found.');
      }
    }),

  updateStatus: creativeProcedure
    .input(z.object({ projectId: z.string(), status: z.enum(CREATIVE_PROJECT_STATUSES) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await projectService.updateStatus(ctx.prisma, { projectId: input.projectId, userId: ctx.user.id, status: input.status });
      } catch (error) {
        throw toTrpcError(error, 'Status update failed.');
      }
    }),

  recordMemory: creativeProcedure
    .input(z.object({ projectId: z.string(), kind: z.enum(CREATIVE_MEMORY_KINDS), content: z.record(z.unknown()) }))
    .mutation(async ({ ctx, input }) => {
      await memoryService.record(ctx.prisma, { projectId: input.projectId, kind: input.kind, content: input.content });
      return { ok: true };
    }),

  getMemories: creativeProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await projectService.get(ctx.prisma, { projectId: input.projectId, userId: ctx.user.id });
      return memoryService.list(ctx.prisma, input.projectId);
    }),
});