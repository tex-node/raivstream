import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { studioService } from '../studio/service';
import { studioContextService } from '../studio/context';
import type { BrandDNA } from '../studio/types';

beforeEach(() => {
  process.env.RAIVSTREAM_5_ENABLED = 'true';
  process.env.RAIVSTREAM_5_STUDIO_ENABLED = 'true';
});
afterEach(() => {
  delete process.env.RAIVSTREAM_5_ENABLED;
  delete process.env.RAIVSTREAM_5_STUDIO_ENABLED;
});

const BRAND: Partial<BrandDNA> = {
  brandIdentity: { name: 'Lumière Skincare', tagline: 'luxurious, confident, modern' },
  visualLanguage: { style: 'premium cinematic', palette: 'soft gold and ivory' },
  audioLanguage: { score: 'understated luxury' },
  tone: { voice: 'confident, warm' },
  audience: { primary: 'Nigerian premium skincare buyers' },
  approvedMessaging: { hero: 'clinically backed radiance' },
  constraints: { avoid: ['medical claims', 'overclaims'] },
};

function prismaMock() {
  const studios: any[] = [];
  const products: any[] = [];
  const campaigns: any[] = [];
  const projects: any[] = [];
  const bibles: any[] = [];
  const briefs: any[] = [];
  const assets: any[] = [];

  const prisma: any = {
    creativeStudio: {
      create: async ({ data }: any) => { const s = { id: `s${studios.length + 1}`, createdAt: new Date(), updatedAt: new Date(), ...data }; studios.push(s); return s; },
      findFirst: async ({ where }: any) => studios.find((s) => s.id === where?.id) ?? null,
      findUnique: async ({ where }: any) => {
        const s = studios.find((x) => x.id === where.id);
        return s ? { ...s, products: products.filter((p) => p.studioId === s.id), campaigns: campaigns.filter((c) => c.studioId === s.id).map((c) => ({ ...c, projects: projects.filter((p) => p.campaignId === c.id).map((p) => ({ id: p.id })) })), assets: assets.filter((a) => a.studioId === s.id) } : null;
      },
      findMany: async () => studios.map((s) => ({ ...s })),
      update: async ({ where, data }: any) => { const s = studios.find((x) => x.id === where.id); Object.assign(s, data); return s; },
    },
    creativeProduct: {
      create: async ({ data }: any) => { const p = { id: `prod${products.length + 1}`, createdAt: new Date(), updatedAt: new Date(), ...data }; products.push(p); return p; },
      findMany: async () => products.map((p) => ({ ...p })),
    },
    creativeCampaign: {
      create: async ({ data }: any) => { const c = { id: `c${campaigns.length + 1}`, createdAt: new Date(), updatedAt: new Date(), ...data }; campaigns.push(c); return c; },
      findFirst: async ({ where }: any) => campaigns.find((c) => c.id === where?.id) ?? null,
      findUnique: async ({ where }: any) => { const c = campaigns.find((x) => x.id === where.id); return c ? { ...c, projects: projects.filter((p) => p.campaignId === c.id).map((p) => ({ id: p.id })) } : null; },
      findMany: async ({ where }: any) => campaigns.filter((c) => c.studioId === where?.studioId),
    },
    creativeProject: {
      create: async ({ data }: any) => { const p = { id: `pj${projects.length + 1}`, createdAt: new Date(), updatedAt: new Date(), ...data }; projects.push(p); return p; },
      findFirst: async ({ where }: any) => projects.find((p) => p.id === where?.id) ?? null,
    },
    creativeBrief: { create: async ({ data }: any) => { const b = { id: `br${briefs.length + 1}`, ...data }; briefs.push(b); return b; } },
    creativeBible: { create: async ({ data }: any) => { const b = { id: `b${bibles.length + 1}`, ...data }; bibles.push(b); return b; } },
    creativeStudioAsset: { create: async ({ data }: any) => { const a = { id: `a${assets.length + 1}`, createdAt: new Date(), ...data }; assets.push(a); return a; } },
    __studios: studios,
    __products: products,
    __campaigns: campaigns,
    __projects: projects,
    __bibles: bibles,
    __briefs: briefs,
    __assets: assets,
  };
  return prisma;
}

describe('creative studio', () => {
  it('creates a studio with brand DNA and no project', async () => {
    const prisma = prismaMock();
    const studio = await studioService.create(prisma as never, { userId: 'u1', name: 'Lumière Skincare', brand: BRAND });
    expect(studio.name).toBe('Lumière Skincare');
    expect(studio.brand.visualLanguage.style).toContain('premium');
    expect(prisma.__projects.length).toBe(0);
  });

  it('adds a product to a studio', async () => {
    const prisma = prismaMock();
    const studio = await studioService.create(prisma as never, { userId: 'u1', name: 'Lumière Skincare', brand: BRAND });
    const product = await studioService.createProduct(prisma as never, { studioId: studio.id, userId: 'u1', name: 'Radiance Serum', claims: { hero: 'clinically backed radiance' } });
    expect(product.name).toBe('Radiance Serum');
    expect((product.claims as Record<string, unknown>).hero).toContain('radiance');
  });

  it('creates a campaign related to a product', async () => {
    const prisma = prismaMock();
    const studio = await studioService.create(prisma as never, { userId: 'u1', name: 'Lumière Skincare', brand: BRAND });
    const product = await studioService.createProduct(prisma as never, { studioId: studio.id, userId: 'u1', name: 'Radiance Serum' });
    const campaign = await studioService.createCampaign(prisma as never, { studioId: studio.id, userId: 'u1', name: 'Radiance Launch', productId: product.id, objective: 'launch the serum', audience: 'premium buyers' });
    expect(campaign.productId).toBe(product.id);
    expect(campaign.objective).toBe('launch the serum');
  });

  it('a campaign project inherits brand/product context into the existing Brief + Bible', async () => {
    const prisma = prismaMock();
    const studio = await studioService.create(prisma as never, { userId: 'u1', name: 'Lumière Skincare', brand: BRAND });
    const product = await studioService.createProduct(prisma as never, { studioId: studio.id, userId: 'u1', name: 'Radiance Serum' });
    const campaign = await studioService.createCampaign(prisma as never, { studioId: studio.id, userId: 'u1', name: 'Radiance Launch', productId: product.id, objective: 'launch the serum', audience: 'premium buyers' });
    const { projectId } = await studioService.createCampaignProject(prisma as never, { campaignId: campaign.id, userId: 'u1', prompt: 'Create a 30-second launch campaign for our new skincare product.' });

    const project = prisma.__projects.find((p: any) => p.id === projectId);
    expect(project.projectType).toBe('COMMERCIAL');
    expect(project.campaignId).toBe(campaign.id);
    const bible = prisma.__bibles.find((b: any) => b.projectId === projectId);
    expect(bible.visualLanguage.style).toContain('premium');
    expect(bible.brand.brandIdentity.name).toBe('Lumière Skincare');
    const brief = prisma.__briefs.find((b: any) => b.projectId === projectId);
    expect(brief.audience).toContain('premium buyers');
    expect(brief.objective).toBe('launch the serum');
  });

  it('studio context assembles brand + product + campaign', async () => {
    const prisma = prismaMock();
    const studio = await studioService.create(prisma as never, { userId: 'u1', name: 'Lumière Skincare', brand: BRAND });
    const product = await studioService.createProduct(prisma as never, { studioId: studio.id, userId: 'u1', name: 'Radiance Serum' });
    const campaign = await studioService.createCampaign(prisma as never, { studioId: studio.id, userId: 'u1', name: 'Radiance Launch', productId: product.id, objective: 'launch' });
    const context = await studioContextService.get(prisma as never, { studioId: studio.id, campaignId: campaign.id });
    expect(context.brand.brandIdentity.name).toBe('Lumière Skincare');
    expect(context.product?.name).toBe('Radiance Serum');
    expect(context.campaign?.name).toBe('Radiance Launch');
  });

  it('reusable assets carry provenance', async () => {
    const prisma = prismaMock();
    const studio = await studioService.create(prisma as never, { userId: 'u1', name: 'Lumière Skincare', brand: BRAND });
    await studioService.addAsset(prisma as never, { studioId: studio.id, userId: 'u1', name: 'Hero shot', kind: 'IMAGE', assetUrl: 'r2://hero', provenance: { projectId: 'pj1', versionId: 'v1' } });
    const context = await studioContextService.get(prisma as never, { studioId: studio.id });
    expect(context.reusableAssets.length).toBe(1);
    expect(context.reusableAssets[0].provenance?.projectId).toBe('pj1');
  });
});