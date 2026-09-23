import { describe, it, expect } from 'vitest';
import { assessIntentReadiness, extractBrandName, type IntentReadiness } from '../intent/readiness';
import { interpret } from '../intent/interpreter';
import { ProductionPlanService } from '../production/service';

function assess(text: string, signals: { hasSourceAsset?: boolean; hasStudioProduct?: boolean; hasProjectSource?: boolean; hasBrandIdentity?: boolean; brandName?: string } = {}): IntentReadiness {
  return assessIntentReadiness(text, interpret(text), signals);
}

function notReady(r: IntentReadiness) {
  if (r.ready) throw new Error('expected not ready');
  return r;
}

describe('intent readiness — creative freedom vs essential source', () => {
  it('story: ready without asking (Raivstream infers treatment)', () => {
    expect(assess('Create a cinematic short film about a woman returning home.').ready).toBe(true);
  });

  it('education: ready without asking', () => {
    expect(assess('Create a 3-minute lesson explaining photosynthesis to eight-year-olds.').ready).toBe(true);
  });

  it('commercial concept (no ownership): ready', () => {
    expect(assess('Create a 60-second cinematic commercial for a new premium skincare brand.').ready).toBe(true);
  });

  it('real product without asset: not ready, asks for PRODUCT (never invents it)', () => {
    const r = notReady(assess('Create an advertisement for my skincare product.'));
    expect(r.contextType).toBe('PRODUCT');
    expect(r.reason).toBe('MISSING_ESSENTIAL_CONTEXT');
    expect(r.question.length).toBeGreaterThan(0);
  });

  it('real product with asset supplied: ready', () => {
    expect(assess('Create an advertisement for my skincare product.', { hasSourceAsset: true }).ready).toBe(true);
  });

  it('existing Studio product: ready without asking again', () => {
    expect(assess('Create an advertisement for my product.', { hasStudioProduct: true }).ready).toBe(true);
  });

  it('explicit fictional product: ready (invention authorized)', () => {
    expect(assess('Invent a luxury whiskey brand and create a cinematic advertisement.').ready).toBe(true);
  });

  it('transform without a source: not ready', () => {
    const r = notReady(assess('Turn my product into a cinematic commercial.'));
    expect(['PRODUCT', 'SOURCE']).toContain(r.contextType);
  });

  it('transform with a source attached: ready', () => {
    expect(assess('Turn this image into a cinematic video.', { hasSourceAsset: true }).ready).toBe(true);
  });

  it('transform of an attached source with no attachment: asks for SOURCE', () => {
    const r = notReady(assess('Turn this image into a cinematic video.'));
    expect(r.contextType).toBe('SOURCE');
  });

  it('bare "Promote something": asks what the creator is promoting', () => {
    const r = notReady(assess('Promote something'));
    expect(r.contextType).toBe('PRODUCT');
  });

  it('owned brand without assets: asks for BRAND', () => {
    const r = notReady(assess('Create a campaign for my fashion brand.'));
    expect(r.contextType).toBe('BRAND');
  });

  it('owned logo without assets: asks for LOGO', () => {
    const r = notReady(assess('Make an ad featuring my logo.'));
    expect(r.contextType).toBe('LOGO');
  });

  it('real-person likeness without a reference: asks for PERSON', () => {
    const r = notReady(assess('Create a video using a photo of me.'));
    expect(r.contextType).toBe('PERSON');
  });

  it('transform starter with no source: not ready, asks for SOURCE', () => {
    const r = notReady(assess('Transform something'));
    expect(r.contextType).toBe('SOURCE');
  });

  it('"transform this into an ad" without a source: not ready (never reaches production)', () => {
    const r = notReady(assess('Transform this into a cinematic advertisement.'));
    expect(r.contextType).toBe('SOURCE');
  });

  it('transform with an attached image source: ready', () => {
    expect(assess('Transform this into a cinematic advertisement.', { hasSourceAsset: true }).ready).toBe(true);
  });

  it('transform with an existing project source: ready', () => {
    expect(assess('Transform this into a cinematic advertisement.', { hasProjectSource: true }).ready).toBe(true);
  });

  it('transform with explicit fictional authorization: ready', () => {
    expect(assess('Create a fictional futuristic car and transform it into a cinematic ad.').ready).toBe(true);
  });

  // ── Commercial real-entity language (human-tested failure) ────────────────
  it('"Create an advertisement for my skincare brand." → not ready, BRAND', () => {
    const r = notReady(assess('Create an advertisement for my skincare brand.'));
    expect(r.contextType).toBe('BRAND');
  });

  it('"Promote my skincare brand." → not ready, BRAND', () => {
    const r = notReady(assess('Promote my skincare brand.'));
    expect(r.contextType).toBe('BRAND');
  });

  it('"Create an advertisement for my clothing brand." → not ready, BRAND', () => {
    const r = notReady(assess('Create an advertisement for my clothing brand.'));
    expect(r.contextType).toBe('BRAND');
  });

  it('"Promote my restaurant." → not ready (real user-owned entity)', () => {
    expect(assess('Promote my restaurant.').ready).toBe(false);
  });

  it('"Advertise my company." → not ready (real user-owned entity)', () => {
    expect(assess('Advertise my company.').ready).toBe(false);
  });

  it('"Create a campaign for our new product." → not ready, PRODUCT', () => {
    const r = notReady(assess('Create a campaign for our new product.'));
    expect(r.contextType).toBe('PRODUCT');
  });

  it('commercial real-entity with a supplied source: ready', () => {
    expect(assess('Create an advertisement for my skincare brand.', { hasSourceAsset: true }).ready).toBe(true);
    expect(assess('Create an advertisement for my skincare product.', { hasSourceAsset: true }).ready).toBe(true);
  });

  it('commercial real-entity with an existing Studio product: ready', () => {
    expect(assess('Create an advertisement for my skincare product.', { hasStudioProduct: true }).ready).toBe(true);
  });

  it('explicit fictional commercial entity: ready', () => {
    expect(assess('Invent a luxury skincare brand and create an advertisement for it.').ready).toBe(true);
    expect(assess('Create a fictional skincare product and make an ad.').ready).toBe(true);
  });

  // ── Brand identity is consequential and asked only when missing ──────────
  it('"Promote my skincare brand." with no identity → asks for the brand NAME', () => {
    const r = notReady(assess('Promote my skincare brand.'));
    expect(r.contextType).toBe('BRAND');
    expect(r.need).toBe('NAME');
    expect(r.question.toLowerCase()).toContain('brand name');
  });

  it('does not ask for the name when it is already provided', () => {
    const r = notReady(assess('Create an advertisement for my skincare brand called GlowHaus.'));
    expect(r.need).toBe('ASSET'); // identity known → now needs the source
    expect(extractBrandName('Create an advertisement for my skincare brand called GlowHaus.')).toBe('GlowHaus');
    expect(extractBrandName('Promote my brand, named Voltaic.')).toBe('Voltaic');
  });

  it('does not ask for the name when context already provides it', () => {
    const r = notReady(assess('Promote my skincare brand.', { hasBrandIdentity: true }));
    expect(r.need).toBe('ASSET');
  });

  it('does not ask for the name for fictional or concept brands', () => {
    expect(assess('Invent a skincare brand and make an ad.').ready).toBe(true);
    expect(assess('Create a concept brand ad.').ready).toBe(true);
  });

  it('various owned commercial phrasings require appropriate context (semantic, not a blacklist)', () => {
    for (const text of ['Promote our skincare brand.', 'Create an ad for my skincare line.', 'Advertise our clothing line.', 'Promote my bakery.', 'Advertise our studio.', 'Market my company.', 'Create a campaign for our new product.']) {
      expect(assess(text).ready).toBe(false);
    }
  });
});

function withFlags<T>(fn: () => Promise<T>): Promise<T> {
  process.env.RAIVSTREAM_5_ENABLED = 'true';
  process.env.RAIVSTREAM_5_INTENT_ENABLED = 'true';
  process.env.RAIVSTREAM_5_PREVIEW_ENABLED = 'true';
  const done = () => {
    delete process.env.RAIVSTREAM_5_ENABLED;
    delete process.env.RAIVSTREAM_5_INTENT_ENABLED;
    delete process.env.RAIVSTREAM_5_PREVIEW_ENABLED;
  };
  return fn().finally(done);
}

function prismaForWithRefined(originalIntent: string, refinedIntent: string, attachments: unknown[]) {
  const brief = { originalIntent, refinedIntent, attachments };
  const project = { id: 'p1', userId: 'u1', title: 'x', projectType: 'COMMERCIAL', status: 'PLANNING', brief, bible: null, productionPlan: null };
  return {
    creativeProject: {
      findFirst: async () => ({ ...project, brief, bible: null, productionPlan: null }),
      update: async () => project,
    },
    creativeProduct: { findFirst: async () => null },
    creativeProductionPlan: { create: async () => ({ id: 'pl1' }), update: async () => ({ id: 'pl1' }) },
  } as never;
}

// ─── Direct → readiness lifecycle ────────────────────────────────────────────
describe('readiness — promotion lifecycle', () => {
  it('"Promote my skincare brand." → MISSING_BRAND_NAME (need=NAME, contextType=BRAND)', () => {
    const r = notReady(assess('Promote my skincare brand.'));
    expect(r.need).toBe('NAME');
    expect(r.contextType).toBe('BRAND');
    expect(r.reason).toBe('MISSING_ESSENTIAL_CONTEXT');
  });

  it('"Promote my skincare brand called GlowHaus." → MISSING_PRODUCT_SOURCE (need=ASSET)', () => {
    const r = notReady(assess('Promote my skincare brand called GlowHaus.'));
    expect(r.need).toBe('ASSET');
    expect(extractBrandName('Promote my skincare brand called GlowHaus.')).toBe('GlowHaus');
  });

  it('"Promote my skincare brand called GlowHaus." with usable source → READY', () => {
    expect(assess('Promote my skincare brand called GlowHaus.', { hasSourceAsset: true }).ready).toBe(true);
  });

  it('fictional brand/product → READY without any source', () => {
    expect(assess('Create a fictional skincare brand called GlowHaus and promote it.').ready).toBe(true);
    expect(assess('Invent a luxury perfume brand and make a commercial.').ready).toBe(true);
  });

  it('assertSourceReady uses refinedIntent to catch post-directive commercial context', () =>
    withFlags(async () => {
      // Original intent is a neutral story — passes by itself.
      // refinedIntent (set by the director pivot) contains the product ownership cue.
      const prisma = prismaForWithRefined(
        'Create a cinematic story.',
        'Make this an advert for my skincare product.',
        [],
      );
      await expect(new ProductionPlanService().plan(prisma, { projectId: 'p1', userId: 'u1' })).rejects.toMatchObject({ code: 'MISSING_SOURCE' });
    }));

  it('a ready-original + ready-refined (source supplied) → proceeds', () =>
    withFlags(async () => {
      const prisma = prismaForWithRefined(
        'Create a cinematic story.',
        'Make this an advert for my skincare product.',
        [{ label: 'Product', kind: 'image', url: 'r2://product.png' }],
      );
      const result = await new ProductionPlanService().plan(prisma, { projectId: 'p1', userId: 'u1' });
      expect(result.plan.scenes.length).toBeGreaterThan(0);
    }));
});

// ─── Production-boundary invariant (defensive) ───────────────────────────────
describe('production invariant — source is required before rendering', () => {
  function prismaFor(brief: { originalIntent: string; attachments: unknown[] }) {
    const project = { id: 'p1', userId: 'u1', title: 'x', projectType: 'COMMERCIAL', status: 'PLANNING', brief, bible: null, productionPlan: null };
    return {
      creativeProject: {
        findFirst: async () => ({ ...project, brief, bible: null, productionPlan: null }),
        update: async () => project,
      },
      creativeProduct: { findFirst: async () => null },
      creativeProductionPlan: { create: async () => ({ id: 'pl1' }), update: async () => ({ id: 'pl1' }) },
    } as never;
  }

  function withFlags<T>(fn: () => Promise<T>): Promise<T> {
    process.env.RAIVSTREAM_5_ENABLED = 'true';
    process.env.RAIVSTREAM_5_INTENT_ENABLED = 'true';
    process.env.RAIVSTREAM_5_PREVIEW_ENABLED = 'true';
    const done = () => {
      delete process.env.RAIVSTREAM_5_ENABLED;
      delete process.env.RAIVSTREAM_5_INTENT_ENABLED;
      delete process.env.RAIVSTREAM_5_PREVIEW_ENABLED;
    };
    return fn().finally(done);
  }

  it('blocks a source-dependent commercial request with no source (renderer never invoked)', () =>
    withFlags(async () => {
      const prisma = prismaFor({ originalIntent: 'Create an advertisement for my skincare brand.', attachments: [] });
      await expect(new ProductionPlanService().plan(prisma, { projectId: 'p1', userId: 'u1' })).rejects.toMatchObject({ code: 'MISSING_SOURCE' });
    }));

  it('blocks a transform with no source', () =>
    withFlags(async () => {
      const prisma = prismaFor({ originalIntent: 'Transform this into a cinematic advertisement.', attachments: [] });
      await expect(new ProductionPlanService().plan(prisma, { projectId: 'p1', userId: 'u1' })).rejects.toMatchObject({ code: 'MISSING_SOURCE' });
    }));

  it('proceeds once a utilizable source is recorded (and carries it onto the plan)', () =>
    withFlags(async () => {
      const prisma = prismaFor({ originalIntent: 'Create an advertisement for my skincare brand.', attachments: [{ label: 'Product', kind: 'image', url: 'r2://source.png' }] });
      const result = await new ProductionPlanService().plan(prisma, { projectId: 'p1', userId: 'u1' });
      expect(result.plan.scenes.length).toBeGreaterThan(0);
      expect(result.plan.sourceReferences?.[0]?.url).toBe('r2://source.png');
    }));

  it('blocks with UNSUPPORTED_SOURCE_OPERATION when the source exists but is not utilizable (before the renderer)', () =>
    withFlags(async () => {
      const prisma = prismaFor({ originalIntent: 'Transform this into a cinematic advertisement.', attachments: [{ label: 'Source' }] });
      await expect(new ProductionPlanService().plan(prisma, { projectId: 'p1', userId: 'u1' })).rejects.toMatchObject({ code: 'UNSUPPORTED_SOURCE_OPERATION' });
    }));

  it('does not block creative concepts (no ownership) or story/education', () =>
    withFlags(async () => {
      const concept = prismaFor({ originalIntent: 'Create a cinematic commercial for a new premium skincare brand.', attachments: [] });
      await expect(new ProductionPlanService().plan(concept, { projectId: 'p1', userId: 'u1' })).resolves.toBeTruthy();
      const story = prismaFor({ originalIntent: 'Create a cinematic short film about a woman returning home.', attachments: [] });
      await expect(new ProductionPlanService().plan(story, { projectId: 'p1', userId: 'u1' })).resolves.toBeTruthy();
    }));
});
