import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { protectedProcedure, router } from '../../trpc';
import { studioService } from '../../lib/creative/studio/service';
import { CreativeError } from '../../lib/creative/shared/errors';

function toTrpcError(error: unknown, fallback: string): TRPCError {
  if (error instanceof CreativeError) {
    const code = error.code === 'PROJECT_NOT_FOUND' ? 'NOT_FOUND' : error.code === 'CREATIVE_DISABLED' ? 'FORBIDDEN' : 'BAD_REQUEST';
    return new TRPCError({ code, message: error.message });
  }
  return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: fallback });
}

const brandDNASchema = z.object({
  brandIdentity: z.record(z.unknown()).optional(),
  visualLanguage: z.record(z.unknown()).optional(),
  audioLanguage: z.record(z.unknown()).optional(),
  tone: z.record(z.unknown()).optional(),
  audience: z.record(z.unknown()).optional(),
  approvedMessaging: z.record(z.unknown()).optional(),
  constraints: z.record(z.unknown()).optional(),
});

export const creativeStudioRouter = router({
  create: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(160), brand: brandDNASchema.optional() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await studioService.create(ctx.prisma, { userId: ctx.user.id, name: input.name, brand: input.brand });
      } catch (error) {
        throw toTrpcError(error, 'Studio could not be created.');
      }
    }),

  list: protectedProcedure
    .query(async ({ ctx }) => {
      try {
        return await studioService.list(ctx.prisma, ctx.user.id);
      } catch (error) {
        throw toTrpcError(error, 'Studios unavailable.');
      }
    }),

  get: protectedProcedure
    .input(z.object({ studioId: z.string() }))
    .query(async ({ ctx, input }) => {
      try {
        return await studioService.get(ctx.prisma, { studioId: input.studioId, userId: ctx.user.id });
      } catch (error) {
        throw toTrpcError(error, 'Studio unavailable.');
      }
    }),

  update: protectedProcedure
    .input(z.object({ studioId: z.string(), name: z.string().max(160).optional(), brand: brandDNASchema.optional() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await studioService.update(ctx.prisma, { studioId: input.studioId, userId: ctx.user.id, name: input.name, brand: input.brand });
      } catch (error) {
        throw toTrpcError(error, 'Studio could not be updated.');
      }
    }),

  product: router({
    create: protectedProcedure
      .input(z.object({ studioId: z.string(), name: z.string().min(1).max(160), description: z.string().max(600).optional(), identity: z.record(z.unknown()).optional(), imagery: z.record(z.unknown()).optional(), claims: z.record(z.unknown()).optional(), variants: z.record(z.unknown()).optional() }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await studioService.createProduct(ctx.prisma, { studioId: input.studioId, userId: ctx.user.id, name: input.name, description: input.description, identity: input.identity, imagery: input.imagery, claims: input.claims, variants: input.variants });
        } catch (error) {
          throw toTrpcError(error, 'Product could not be created.');
        }
      }),
    list: protectedProcedure
      .input(z.object({ studioId: z.string() }))
      .query(async ({ ctx, input }) => {
        try {
          return await studioService.listProducts(ctx.prisma, { studioId: input.studioId, userId: ctx.user.id });
        } catch (error) {
          throw toTrpcError(error, 'Products unavailable.');
        }
      }),
  }),

  campaign: router({
    create: protectedProcedure
      .input(z.object({ studioId: z.string(), name: z.string().min(1).max(160), productId: z.string().optional(), objective: z.string().max(600).optional(), audience: z.string().max(400).optional(), context: z.record(z.unknown()).optional() }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await studioService.createCampaign(ctx.prisma, { studioId: input.studioId, userId: ctx.user.id, name: input.name, productId: input.productId, objective: input.objective, audience: input.audience, context: input.context });
        } catch (error) {
          throw toTrpcError(error, 'Campaign could not be created.');
        }
      }),
    list: protectedProcedure
      .input(z.object({ studioId: z.string() }))
      .query(async ({ ctx, input }) => {
        try {
          return await studioService.listCampaigns(ctx.prisma, { studioId: input.studioId, userId: ctx.user.id });
        } catch (error) {
          throw toTrpcError(error, 'Campaigns unavailable.');
        }
      }),
    createProject: protectedProcedure
      .input(z.object({ campaignId: z.string(), prompt: z.string().min(1).max(2000), title: z.string().max(160).optional() }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await studioService.createCampaignProject(ctx.prisma, { campaignId: input.campaignId, userId: ctx.user.id, prompt: input.prompt, title: input.title });
        } catch (error) {
          throw toTrpcError(error, 'Campaign project could not be created.');
        }
      }),
  }),

  asset: router({
    add: protectedProcedure
      .input(z.object({ studioId: z.string(), name: z.string().min(1).max(160), kind: z.enum(['IMAGE', 'VIDEO', 'LOGO', 'AUDIO']), assetUrl: z.string().optional(), provenance: z.record(z.unknown()).optional() }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await studioService.addAsset(ctx.prisma, { studioId: input.studioId, userId: ctx.user.id, name: input.name, kind: input.kind, assetUrl: input.assetUrl, provenance: input.provenance });
        } catch (error) {
          throw toTrpcError(error, 'Asset could not be added.');
        }
      }),
    list: protectedProcedure
      .input(z.object({ studioId: z.string() }))
      .query(async ({ ctx, input }) => {
        try {
          const context = await studioService.context(ctx.prisma, { studioId: input.studioId });
          return context.reusableAssets;
        } catch (error) {
          throw toTrpcError(error, 'Assets unavailable.');
        }
      }),
  }),

  context: router({
    get: protectedProcedure
      .input(z.object({ studioId: z.string(), campaignId: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        try {
          return await studioService.context(ctx.prisma, { studioId: input.studioId, campaignId: input.campaignId });
        } catch (error) {
          throw toTrpcError(error, 'Studio context unavailable.');
        }
      }),
  }),
});