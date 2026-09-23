/**
 * Raivstream 5.0 — StudioService (Slice 7).
 *
 * Commercial creative operating layer. Brand DNA / products / campaigns /
 * reusable assets persist commercial context; a campaign project inherits that
 * context into the EXISTING CreativeBrief + CreativeBible and then flows
 * through the existing Director/Production/Approval/Outputs engine. No second
 * Brief/Bible/Director/Production architecture is created.
 */

import type { PrismaClient } from '@raivstream/database';
import { isCreativeStudioEnabled } from '../featureFlags';
import { CreativeError } from '../shared/errors';
import { emptyBrandDNA, studioContextService } from './context';
import type { BrandDNA, CampaignState, ProductState, StudioAssetKind, StudioContext, StudioState } from './types';

function toStudioState(studio: any): StudioState {
  return {
    id: studio.id,
    userId: studio.userId,
    name: studio.name,
    brand: {
      brandIdentity: (studio.brandIdentity as Record<string, unknown> | null) ?? {},
      visualLanguage: (studio.visualLanguage as Record<string, unknown> | null) ?? {},
      audioLanguage: (studio.audioLanguage as Record<string, unknown> | null) ?? {},
      tone: (studio.tone as Record<string, unknown> | null) ?? {},
      audience: (studio.audience as Record<string, unknown> | null) ?? {},
      approvedMessaging: (studio.approvedMessaging as Record<string, unknown> | null) ?? {},
      constraints: (studio.constraints as Record<string, unknown> | null) ?? {},
    },
    createdAt: studio.createdAt,
    updatedAt: studio.updatedAt,
  };
}

function toProductState(product: any): ProductState {
  return {
    id: product.id,
    studioId: product.studioId,
    name: product.name,
    description: product.description,
    identity: (product.identity as Record<string, unknown> | null) ?? null,
    imagery: (product.imagery as Record<string, unknown> | null) ?? null,
    claims: (product.claims as Record<string, unknown> | null) ?? null,
    variants: (product.variants as Record<string, unknown> | null) ?? null,
  };
}

export class StudioService {
  async create(prisma: PrismaClient, input: { userId: string; name: string; brand?: Partial<BrandDNA> }): Promise<StudioState> {
    if (!isCreativeStudioEnabled()) throw new CreativeError('CREATIVE_DISABLED', 'Raivstream 5.0 studio is not enabled.');
    const dna = { ...emptyBrandDNA(input.name), ...(input.brand ?? {}) };
    const studio = await prisma.creativeStudio.create({
      data: {
        userId: input.userId,
        name: input.name,
        brandIdentity: dna.brandIdentity as never,
        visualLanguage: dna.visualLanguage as never,
        audioLanguage: dna.audioLanguage as never,
        tone: dna.tone as never,
        audience: dna.audience as never,
        approvedMessaging: dna.approvedMessaging as never,
        constraints: dna.constraints as never,
      },
    });
    return toStudioState(studio);
  }

  async list(prisma: PrismaClient, userId: string): Promise<StudioState[]> {
    const rows = await prisma.creativeStudio.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' }, take: 50 });
    return rows.map(toStudioState);
  }

  async get(prisma: PrismaClient, input: { studioId: string; userId: string }): Promise<StudioState> {
    const studio = await prisma.creativeStudio.findFirst({ where: { id: input.studioId, userId: input.userId } });
    if (!studio) throw new CreativeError('PROJECT_NOT_FOUND', 'Studio not found.');
    return toStudioState(studio);
  }

  async update(prisma: PrismaClient, input: { studioId: string; userId: string; name?: string; brand?: Partial<BrandDNA> }): Promise<StudioState> {
    const studio = await this.get(prisma, input);
    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.brand) {
      if (input.brand.brandIdentity !== undefined) data.brandIdentity = input.brand.brandIdentity;
      if (input.brand.visualLanguage !== undefined) data.visualLanguage = input.brand.visualLanguage;
      if (input.brand.audioLanguage !== undefined) data.audioLanguage = input.brand.audioLanguage;
      if (input.brand.tone !== undefined) data.tone = input.brand.tone;
      if (input.brand.audience !== undefined) data.audience = input.brand.audience;
      if (input.brand.approvedMessaging !== undefined) data.approvedMessaging = input.brand.approvedMessaging;
      if (input.brand.constraints !== undefined) data.constraints = input.brand.constraints;
    }
    const updated = await prisma.creativeStudio.update({ where: { id: studio.id }, data: data as never });
    return toStudioState(updated);
  }

  async createProduct(prisma: PrismaClient, input: { studioId: string; userId: string; name: string; description?: string; identity?: Record<string, unknown>; imagery?: Record<string, unknown>; claims?: Record<string, unknown>; variants?: Record<string, unknown> }): Promise<ProductState> {
    await this.get(prisma, input);
    const product = await prisma.creativeProduct.create({
      data: {
        studioId: input.studioId,
        name: input.name,
        description: input.description ?? null,
        identity: (input.identity ?? {}) as never,
        imagery: (input.imagery ?? {}) as never,
        claims: (input.claims ?? {}) as never,
        variants: (input.variants ?? {}) as never,
      },
    });
    return toProductState(product);
  }

  async listProducts(prisma: PrismaClient, input: { studioId: string; userId: string }): Promise<ProductState[]> {
    await this.get(prisma, input);
    const rows = await prisma.creativeProduct.findMany({ where: { studioId: input.studioId }, orderBy: { createdAt: 'asc' } });
    return rows.map(toProductState);
  }

  async createCampaign(prisma: PrismaClient, input: { studioId: string; userId: string; name: string; productId?: string; objective?: string; audience?: string; context?: Record<string, unknown> }): Promise<CampaignState> {
    await this.get(prisma, input);
    const campaign = await prisma.creativeCampaign.create({
      data: {
        studioId: input.studioId,
        productId: input.productId ?? null,
        name: input.name,
        objective: input.objective ?? null,
        audience: input.audience ?? null,
        context: (input.context ?? {}) as never,
        status: 'ACTIVE',
      },
    });
    return this.campaignState(prisma, campaign.id);
  }

  async listCampaigns(prisma: PrismaClient, input: { studioId: string; userId: string }): Promise<CampaignState[]> {
    await this.get(prisma, input);
    const rows = await prisma.creativeCampaign.findMany({ where: { studioId: input.studioId }, orderBy: { createdAt: 'asc' } });
    return Promise.all(rows.map((row) => this.campaignState(prisma, row.id)));
  }

  async createCampaignProject(prisma: PrismaClient, input: { campaignId: string; userId: string; prompt: string; title?: string }): Promise<{ projectId: string; campaignId: string }> {
    if (!isCreativeStudioEnabled()) throw new CreativeError('CREATIVE_DISABLED', 'Raivstream 5.0 studio is not enabled.');
    const campaign = await prisma.creativeCampaign.findFirst({ where: { id: input.campaignId, studio: { userId: input.userId } } });
    if (!campaign) throw new CreativeError('PROJECT_NOT_FOUND', 'Campaign not found.');
    const context = await studioContextService.get(prisma, { studioId: campaign.studioId, campaignId: campaign.id });

    // Inherit brand + product + campaign context into the EXISTING brief/bible.
    const project = await prisma.creativeProject.create({
      data: { userId: input.userId, title: input.title ?? `${campaign.name} — ${input.prompt.slice(0, 60)}`, projectType: 'COMMERCIAL', status: 'PLANNING', campaignId: campaign.id },
    });
    const tone = context.brand.tone ?? {};
    await prisma.creativeBrief.create({
      data: {
        projectId: project.id,
        originalIntent: input.prompt,
        refinedIntent: campaign.objective ?? input.prompt,
        objective: campaign.objective ?? 'deliver the campaign',
        audience: campaign.audience ?? (typeof context.brand.audience === 'object' ? JSON.stringify(context.brand.audience) : null),
        tone: Object.keys(tone).length ? JSON.stringify(tone) : null,
      },
    });
    await prisma.creativeBible.create({
      data: {
        projectId: project.id,
        characters: [],
        worlds: [],
        visualLanguage: context.brand.visualLanguage as never,
        audioLanguage: context.brand.audioLanguage as never,
        brand: { brandIdentity: context.brand.brandIdentity, approvedMessaging: context.brand.approvedMessaging, constraints: context.brand.constraints, product: context.product?.name ?? null } as never,
      },
    });
    return { projectId: project.id, campaignId: campaign.id };
  }

  async addAsset(prisma: PrismaClient, input: { studioId: string; userId: string; name: string; kind: StudioAssetKind; assetUrl?: string; provenance?: Record<string, unknown> }): Promise<{ id: string }> {
    await this.get(prisma, input);
    const asset = await prisma.creativeStudioAsset.create({
      data: { studioId: input.studioId, name: input.name, kind: input.kind as never, assetUrl: input.assetUrl ?? null, provenance: (input.provenance ?? {}) as never },
    });
    return { id: asset.id };
  }

  async context(prisma: PrismaClient, input: { studioId: string; campaignId?: string }): Promise<StudioContext> {
    return studioContextService.get(prisma, input);
  }

  private async campaignState(prisma: PrismaClient, campaignId: string): Promise<CampaignState> {
    const campaign = await prisma.creativeCampaign.findUnique({
      where: { id: campaignId },
      include: { projects: { select: { id: true } } },
    });
    if (!campaign) throw new CreativeError('PROJECT_NOT_FOUND', 'Campaign not found.');
    return {
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
    };
  }
}

export const studioService = new StudioService();