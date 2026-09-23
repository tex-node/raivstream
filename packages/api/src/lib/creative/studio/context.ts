/**
 * Raivstream 5.0 — StudioContextService (Slice 7).
 *
 * Assembles the persistent commercial context (brand DNA + product + campaign
 * + reusable assets) that the EXISTING Brief/Bible/Director/Production consume.
 * Downstream services never reconstruct studio context themselves.
 */

import type { PrismaClient } from '@raivstream/database';
import { CreativeError } from '../shared/errors';
import type { BrandDNA, ProductState, StudioContext } from './types';

export function emptyBrandDNA(name: string): BrandDNA {
  return {
    brandIdentity: { name },
    visualLanguage: { style: 'premium, cinematic' },
    audioLanguage: {},
    tone: {},
    audience: {},
    approvedMessaging: {},
    constraints: {},
  };
}

export class StudioContextService {
  async get(prisma: PrismaClient, input: { studioId: string; campaignId?: string }): Promise<StudioContext> {
    const studio = await prisma.creativeStudio.findUnique({
      where: { id: input.studioId },
      include: { products: true, campaigns: { include: { projects: { select: { id: true } } } }, assets: true },
    });
    if (!studio) throw new CreativeError('PROJECT_NOT_FOUND', 'Studio not found.');

    const brand: BrandDNA = {
      brandIdentity: (studio.brandIdentity as Record<string, unknown> | null) ?? {},
      visualLanguage: (studio.visualLanguage as Record<string, unknown> | null) ?? {},
      audioLanguage: (studio.audioLanguage as Record<string, unknown> | null) ?? {},
      tone: (studio.tone as Record<string, unknown> | null) ?? {},
      audience: (studio.audience as Record<string, unknown> | null) ?? {},
      approvedMessaging: (studio.approvedMessaging as Record<string, unknown> | null) ?? {},
      constraints: (studio.constraints as Record<string, unknown> | null) ?? {},
    };

    const campaign = input.campaignId
      ? studio.campaigns.find((c) => c.id === input.campaignId) ?? null
      : studio.campaigns[studio.campaigns.length - 1] ?? null;
    const product = campaign?.productId
      ? studio.products.find((p) => p.id === campaign.productId) ?? null
      : null;

    return {
      studioId: studio.id,
      studioName: studio.name,
      brand,
      product: product
        ? {
            id: product.id,
            studioId: product.studioId,
            name: product.name,
            description: product.description,
            identity: (product.identity as Record<string, unknown> | null) ?? null,
            imagery: (product.imagery as Record<string, unknown> | null) ?? null,
            claims: (product.claims as Record<string, unknown> | null) ?? null,
            variants: (product.variants as Record<string, unknown> | null) ?? null,
          }
        : null,
      campaign: campaign
        ? {
            id: campaign.id,
            studioId: campaign.studioId,
            productId: campaign.productId,
            name: campaign.name,
            objective: campaign.objective,
            audience: campaign.audience,
            context: (campaign.context as Record<string, unknown> | null) ?? null,
            status: campaign.status,
            projectIds: campaign.projects.map((project) => project.id),
            createdAt: campaign.createdAt,
            updatedAt: campaign.updatedAt,
          }
        : null,
      reusableAssets: (studio.assets as Array<Record<string, unknown>>).map((asset: any) => ({
        id: asset.id,
        name: asset.name,
        kind: asset.kind,
        assetUrl: asset.assetUrl,
        provenance: (asset.provenance as Record<string, unknown> | null) ?? null,
      })),
    };
  }
}

export const studioContextService = new StudioContextService();