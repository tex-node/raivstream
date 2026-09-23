import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { protectedProcedure, router } from '../../trpc';
import { seriesService } from '../../lib/creative/series/service';
import { CreativeError } from '../../lib/creative/shared/errors';

function toTrpcError(error: unknown, fallback: string): TRPCError {
  if (error instanceof CreativeError) {
    const code = error.code === 'PROJECT_NOT_FOUND' ? 'NOT_FOUND' : error.code === 'CREATIVE_DISABLED' ? 'FORBIDDEN' : 'BAD_REQUEST';
    return new TRPCError({ code, message: error.message });
  }
  return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: fallback });
}

const episodeStateSchema = z.object({
  location: z.string().optional(),
  wardrobe: z.record(z.unknown()).optional(),
  emotionalState: z.string().optional(),
  relationshipState: z.record(z.unknown()).optional(),
  storyObjective: z.string().optional(),
});

export const creativeSeriesRouter = router({
  create: protectedProcedure
    .input(z.object({ title: z.string().min(1).max(160), description: z.string().max(600).optional() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await seriesService.create(ctx.prisma, { userId: ctx.user.id, title: input.title, description: input.description });
      } catch (error) {
        throw toTrpcError(error, 'Series could not be created.');
      }
    }),

  list: protectedProcedure
    .query(async ({ ctx }) => {
      try {
        return await seriesService.list(ctx.prisma, ctx.user.id);
      } catch (error) {
        throw toTrpcError(error, 'Series unavailable.');
      }
    }),

  get: protectedProcedure
    .input(z.object({ seriesId: z.string() }))
    .query(async ({ ctx, input }) => {
      try {
        return await seriesService.get(ctx.prisma, { seriesId: input.seriesId, userId: ctx.user.id });
      } catch (error) {
        throw toTrpcError(error, 'Series unavailable.');
      }
    }),

  update: protectedProcedure
    .input(z.object({ seriesId: z.string(), title: z.string().max(160).optional(), description: z.string().max(600).optional(), status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED']).optional() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await seriesService.update(ctx.prisma, { seriesId: input.seriesId, userId: ctx.user.id, title: input.title, description: input.description, status: input.status });
      } catch (error) {
        throw toTrpcError(error, 'Series could not be updated.');
      }
    }),

  canon: router({
    get: protectedProcedure
      .input(z.object({ seriesId: z.string() }))
      .query(async ({ ctx, input }) => {
        try {
          return await seriesService.canon.get(ctx.prisma, input.seriesId);
        } catch (error) {
          throw toTrpcError(error, 'Canon unavailable.');
        }
      }),
    update: protectedProcedure
      .input(z.object({ seriesId: z.string(), canon: z.record(z.unknown()) }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await seriesService.canon.update(ctx.prisma, { seriesId: input.seriesId, canon: input.canon as never });
        } catch (error) {
          throw toTrpcError(error, 'Canon could not be updated.');
        }
      }),
  }),

  memory: router({
    get: protectedProcedure
      .input(z.object({ seriesId: z.string() }))
      .query(async ({ ctx, input }) => {
        try {
          return await seriesService.memory.get(ctx.prisma, input.seriesId);
        } catch (error) {
          throw toTrpcError(error, 'Memory unavailable.');
        }
      }),
    update: protectedProcedure
      .input(z.object({ seriesId: z.string(), memory: z.record(z.unknown()) }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await seriesService.memory.update(ctx.prisma, { seriesId: input.seriesId, memory: input.memory as never });
        } catch (error) {
          throw toTrpcError(error, 'Memory could not be updated.');
        }
      }),
  }),

  episode: router({
    create: protectedProcedure
      .input(z.object({ seriesId: z.string(), prompt: z.string().max(2000).optional(), seasonNumber: z.number().int().min(1).optional(), episodeNumber: z.number().int().min(1).optional(), title: z.string().max(160).optional(), synopsis: z.string().max(1200).optional() }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await seriesService.createEpisode(ctx.prisma, { seriesId: input.seriesId, userId: ctx.user.id, prompt: input.prompt, seasonNumber: input.seasonNumber, episodeNumber: input.episodeNumber, title: input.title, synopsis: input.synopsis });
        } catch (error) {
          throw toTrpcError(error, 'Episode could not be created.');
        }
      }),
    list: protectedProcedure
      .input(z.object({ seriesId: z.string() }))
      .query(async ({ ctx, input }) => {
        try {
          return await seriesService.listEpisodes(ctx.prisma, { seriesId: input.seriesId, userId: ctx.user.id });
        } catch (error) {
          throw toTrpcError(error, 'Episodes unavailable.');
        }
      }),
    get: protectedProcedure
      .input(z.object({ episodeId: z.string() }))
      .query(async ({ ctx, input }) => {
        try {
          return await seriesService.getEpisode(ctx.prisma, { episodeId: input.episodeId, userId: ctx.user.id });
        } catch (error) {
          throw toTrpcError(error, 'Episode unavailable.');
        }
      }),
    update: protectedProcedure
      .input(z.object({ episodeId: z.string(), title: z.string().max(160).optional(), synopsis: z.string().max(1200).optional(), status: z.enum(['DRAFT', 'PLANNING', 'IN_PRODUCTION', 'REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED']).optional(), state: episodeStateSchema.optional() }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await seriesService.updateEpisode(ctx.prisma, { episodeId: input.episodeId, userId: ctx.user.id, title: input.title, synopsis: input.synopsis, status: input.status, state: input.state });
        } catch (error) {
          throw toTrpcError(error, 'Episode could not be updated.');
        }
      }),
  }),

  context: router({
    get: protectedProcedure
      .input(z.object({ seriesId: z.string(), episodeId: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        try {
          return await seriesService.context.get(ctx.prisma, { seriesId: input.seriesId, episodeId: input.episodeId });
        } catch (error) {
          throw toTrpcError(error, 'Series context unavailable.');
        }
      }),
    spinoff: protectedProcedure
      .input(z.object({ seriesId: z.string(), characterName: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        try {
          return await seriesService.context.spinoffContext(ctx.prisma, { seriesId: input.seriesId, characterName: input.characterName });
        } catch (error) {
          throw toTrpcError(error, 'Spinoff context unavailable.');
        }
      }),
  }),
});