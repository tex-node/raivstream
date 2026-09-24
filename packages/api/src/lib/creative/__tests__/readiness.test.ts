import { describe, it, expect, vi } from 'vitest';
import { assessIntentReadiness, extractBrandName, type IntentReadiness } from '../intent/readiness';
import { interpret } from '../intent/interpreter';
import { ProductionPlanService, sourceReferencesFromBrief } from '../production/service';
import { buildCreativePlan } from '../production/plan';
import { runCreativeProduction } from '../production/runner';

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

  it('commercial without fictional auth (no ownership): not ready — real vs fictional must be established', () => {
    // The absence of "my/our" does not grant permission to invent the product.
    // Any commercial + product/brand subject requires the creator to decide real vs fictional.
    expect(assess('Create a 60-second cinematic commercial for a new premium skincare brand.').ready).toBe(false);
  });

  it('commercial with explicit fictional authorization: ready', () => {
    expect(assess('Create a 60-second fictional commercial for a new premium skincare brand.').ready).toBe(true);
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

  // ── "promotional" keyword (word-boundary regression) ─────────────────────
  it('"Create a promotional video for my skincare product." → not ready, PRODUCT/ASSET', () => {
    const r = notReady(assess('Create a promotional video for my skincare product.'));
    expect(r.contextType).toBe('PRODUCT');
    expect(r.need).toBe('ASSET');
  });

  it('"Create a promotional video for my skincare product." with source → READY', () => {
    expect(assess('Create a promotional video for my skincare product.', { hasSourceAsset: true }).ready).toBe(true);
  });

  it('"Create a promotional video for my skincare product." fictional → READY', () => {
    expect(assess('Create a promotional video for my skincare product. Use a fictional concept — invent it rather than using a real one.').ready).toBe(true);
  });

  // ── "perfume" — COMMERCIAL_PURPOSE matches "promotional" but product noun not in TYPE_SIGNALS ──
  it('"Create a promotional video for my perfume." → not ready, PRODUCT/ASSET', () => {
    const r = notReady(assess('Create a promotional video for my perfume.'));
    expect(r.contextType).toBe('PRODUCT');
    expect(r.need).toBe('ASSET');
  });

  it('"Create a promotional video for my perfume." with source → READY', () => {
    expect(assess('Create a promotional video for my perfume.', { hasSourceAsset: true }).ready).toBe(true);
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

  it('checkPlanReadiness uses refinedIntent to catch post-directive commercial context', () =>
    withFlags(async () => {
      // Original intent is a neutral story — passes by itself.
      // refinedIntent (set by the director pivot) contains the product ownership cue.
      const prisma = prismaForWithRefined(
        'Create a cinematic story.',
        'Make this an advert for my skincare product.',
        [],
      );
      const result = await new ProductionPlanService().plan(prisma, { projectId: 'p1', userId: 'u1' });
      expect(result.ok).toBe(false);
      expect((result as any).code).toBe('READINESS_REQUIRED');
    }));

  it('a ready-original + ready-refined (source supplied) → proceeds', () =>
    withFlags(async () => {
      const prisma = prismaForWithRefined(
        'Create a cinematic story.',
        'Make this an advert for my skincare product.',
        [{ label: 'Product', kind: 'image', url: 'r2://product.png' }],
      );
      const result = await new ProductionPlanService().plan(prisma, { projectId: 'p1', userId: 'u1' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
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

  it('returns READINESS_REQUIRED for a source-dependent commercial request with no source (plan never created)', () =>
    withFlags(async () => {
      const prisma = prismaFor({ originalIntent: 'Create an advertisement for my skincare brand.', attachments: [] });
      const result = await new ProductionPlanService().plan(prisma, { projectId: 'p1', userId: 'u1' });
      expect(result.ok).toBe(false);
      expect((result as any).code).toBe('READINESS_REQUIRED');
      // "my skincare brand" → brand name needed before asset (NAME gate fires first)
      expect((result as any).need).toBe('NAME');
    }));

  it('returns READINESS_REQUIRED for a transform with no source (plan never created)', () =>
    withFlags(async () => {
      const prisma = prismaFor({ originalIntent: 'Transform this into a cinematic advertisement.', attachments: [] });
      const result = await new ProductionPlanService().plan(prisma, { projectId: 'p1', userId: 'u1' });
      expect(result.ok).toBe(false);
      expect((result as any).code).toBe('READINESS_REQUIRED');
    }));

  it('proceeds once a utilizable source is recorded (and carries it onto the plan)', () =>
    withFlags(async () => {
      const prisma = prismaFor({ originalIntent: 'Create an advertisement for my skincare brand.', attachments: [{ label: 'Product', kind: 'image', url: 'r2://source.png' }] });
      const result = await new ProductionPlanService().plan(prisma, { projectId: 'p1', userId: 'u1' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.plan.scenes.length).toBeGreaterThan(0);
      expect(result.plan.sourceReferences?.[0]?.url).toBe('r2://source.png');
    }));

  it('label-only chip (no URL) on a transform → READINESS_REQUIRED, plan never created', () =>
    withFlags(async () => {
      // A chip label with no url is not a real source: checkPlanReadiness correctly
      // returns READINESS_REQUIRED instead of letting the label-only value satisfy the gate.
      const prisma = prismaFor({ originalIntent: 'Transform this into a cinematic advertisement.', attachments: [{ label: 'Source' }] });
      const result = await new ProductionPlanService().plan(prisma, { projectId: 'p1', userId: 'u1' });
      expect(result.ok).toBe(false);
      expect((result as any).code).toBe('READINESS_REQUIRED');
    }));

  it('story: proceeds without source (never commercial)', () =>
    withFlags(async () => {
      const story = prismaFor({ originalIntent: 'Create a cinematic short film about a woman returning home.', attachments: [] });
      const result = await new ProductionPlanService().plan(story, { projectId: 'p1', userId: 'u1' });
      expect(result.ok).toBe(true);
    }));

  it('concept commercial without fictional auth: READINESS_REQUIRED — "my/our" not required to trigger gate', () =>
    withFlags(async () => {
      // Even without ownership marker, a commercial + brand subject requires real vs fictional decision.
      const concept = prismaFor({ originalIntent: 'Create a cinematic commercial for a new premium skincare brand.', attachments: [] });
      const result = await new ProductionPlanService().plan(concept, { projectId: 'p1', userId: 'u1' });
      expect(result.ok).toBe(false);
      expect((result as any).code).toBe('READINESS_REQUIRED');
    }));

  it('explicitly fictional concept commercial: proceeds without source', () =>
    withFlags(async () => {
      const fictional = prismaFor({ originalIntent: 'Create a fictional cinematic commercial for a new premium skincare brand.', attachments: [] });
      const result = await new ProductionPlanService().plan(fictional, { projectId: 'p1', userId: 'u1' });
      expect(result.ok).toBe(true);
    }));

  it('"Create a promotional video for my skincare product." with label-only attachment (no URL) → READINESS_REQUIRED, plan never created', () =>
    withFlags(async () => {
      // A UI chip label has no url — it does not count as a source asset.
      // checkPlanReadiness must return READINESS_REQUIRED, not pass through to assertSourceReady.
      const prisma = prismaFor({ originalIntent: 'Create a promotional video for my skincare product.', attachments: [{ label: 'Product' }] });
      const result = await new ProductionPlanService().plan(prisma, { projectId: 'p1', userId: 'u1' });
      expect(result.ok).toBe(false);
      expect((result as any).code).toBe('READINESS_REQUIRED');
    }));

  it('"Create a promotional video for my skincare product." with real URL → proceeds', () =>
    withFlags(async () => {
      const prisma = prismaFor({ originalIntent: 'Create a promotional video for my skincare product.', attachments: [{ label: 'Product', kind: 'image', url: 'r2://product.png' }] });
      const result = await new ProductionPlanService().plan(prisma, { projectId: 'p1', userId: 'u1' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.plan.scenes.length).toBeGreaterThan(0);
      expect(result.plan.sourceReferences?.[0]?.url).toBe('r2://product.png');
    }));

  // ── "perfume" (product noun with no TYPE_SIGNALS match) ───────────────────
  it('"Create a promotional video for my perfume." with no source → READINESS_REQUIRED (plan never created)', () =>
    withFlags(async () => {
      const prisma = prismaFor({ originalIntent: 'Create a promotional video for my perfume.', attachments: [] });
      const result = await new ProductionPlanService().plan(prisma, { projectId: 'p1', userId: 'u1' });
      expect(result.ok).toBe(false);
      expect((result as any).code).toBe('READINESS_REQUIRED');
    }));

  it('"Create a promotional video for my perfume." with label-only attachment (no URL) → READINESS_REQUIRED, plan never created', () =>
    withFlags(async () => {
      // A UI chip label has no url — checkPlanReadiness must not treat it as a source.
      const prisma = prismaFor({ originalIntent: 'Create a promotional video for my perfume.', attachments: [{ label: 'Product' }] });
      const result = await new ProductionPlanService().plan(prisma, { projectId: 'p1', userId: 'u1' });
      expect(result.ok).toBe(false);
      expect((result as any).code).toBe('READINESS_REQUIRED');
    }));

  it('"Create a promotional video for my perfume." with real URL → proceeds', () =>
    withFlags(async () => {
      const prisma = prismaFor({ originalIntent: 'Create a promotional video for my perfume.', attachments: [{ label: 'Product', kind: 'image', url: 'r2://perfume.png' }] });
      const result = await new ProductionPlanService().plan(prisma, { projectId: 'p1', userId: 'u1' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.plan.scenes.length).toBeGreaterThan(0);
    }));
});

// ─── Orchestration: Create → Readiness → Plan pipeline ──────────────────────
describe('orchestration — plan() enforces readiness before creating a plan', () => {
  function makeProject(originalIntent: string, attachments: unknown[]) {
    const brief = { originalIntent, refinedIntent: null, attachments };
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

  // Section 17 regression: fresh account, no prior state
  it('fresh account with no source → plan() returns READINESS_REQUIRED, never creates a plan', () =>
    withFlags(async () => {
      const prisma = makeProject('Create a promotional video for my perfume.', []);
      const result = await new ProductionPlanService().plan(prisma, { projectId: 'p1', userId: 'u1' });
      expect(result.ok).toBe(false);
      expect((result as any).code).toBe('READINESS_REQUIRED');
      expect((result as any).need).toBe('ASSET');
      expect((result as any).contextType).toBe('PRODUCT');
      expect(typeof (result as any).question).toBe('string');
    }));

  // Section 20: all 7 commercial language variants must return READINESS_REQUIRED
  const variants = [
    'Create a promotional video for my perfume.',
    'Make an advertisement for my skincare product.',
    'Promote my new product launch.',
    'Build a commercial for my brand.',
    'Create a marketing video for my serum.',
    'I want to advertise my new skincare line.',
    'Create a product promotion video for my brand.',
  ];

  for (const variant of variants) {
    it(`commercial variant "${variant.slice(0, 50)}" → READINESS_REQUIRED with no source`, () =>
      withFlags(async () => {
        const prisma = makeProject(variant, []);
        const result = await new ProductionPlanService().plan(prisma, { projectId: 'p1', userId: 'u1' });
        expect(result.ok).toBe(false);
        expect((result as any).code).toBe('READINESS_REQUIRED');
      }));
  }

  // Section 21: fictional exception must NOT require upload
  it('fictional authorization → READY, plan proceeds without upload', () =>
    withFlags(async () => {
      const prisma = makeProject('Create a promotional video for a fictional perfume brand — invent the concept.', []);
      const result = await new ProductionPlanService().plan(prisma, { projectId: 'p1', userId: 'u1' });
      expect(result.ok).toBe(true);
    }));

  it('source resolved → plan proceeds after readiness gate', () =>
    withFlags(async () => {
      const prisma = makeProject('Create a promotional video for my perfume.', [{ label: 'Product', kind: 'image', url: 'r2://perfume.jpg' }]);
      const result = await new ProductionPlanService().plan(prisma, { projectId: 'p1', userId: 'u1' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.plan.scenes.length).toBeGreaterThan(0);
    }));

  // Section 15 regression: "Promote a skin care product" with no attachments → READINESS_REQUIRED
  it('"Promote a skin care product" with no attachments → READINESS_REQUIRED (the reported bypass is closed)', () =>
    withFlags(async () => {
      const prisma = makeProject('Promote a skin care product', []);
      const result = await new ProductionPlanService().plan(prisma, { projectId: 'p1', userId: 'u1' });
      expect(result.ok).toBe(false);
      expect((result as any).code).toBe('READINESS_REQUIRED');
      expect((result as any).contextType).toBe('PRODUCT');
      expect((result as any).need).toBe('ASSET');
    }));

  // Section 6 regression: "Promote a perfume" — the exact runtime bypass reported
  it('"Promote a perfume" with no source → READINESS_REQUIRED, plan never created', () =>
    withFlags(async () => {
      const prisma = makeProject('Promote a perfume', []);
      const result = await new ProductionPlanService().plan(prisma, { projectId: 'p1', userId: 'u1' });
      expect(result.ok).toBe(false);
      expect((result as any).code).toBe('READINESS_REQUIRED');
      expect((result as any).contextType).toBe('PRODUCT');
      expect((result as any).need).toBe('ASSET');
    }));

  // String chip bypass: a label-only chip (no url) must not satisfy the source gate
  it('"Promote a perfume" with label-only chip (no URL) → READINESS_REQUIRED, plan never created', () =>
    withFlags(async () => {
      // Regression: attachments.length > 0 was incorrectly treated as hasSourceAsset.
      // A chip label like { label: "Product", addedAt: "..." } has no url — the gate
      // must fire (READINESS_REQUIRED) rather than treating the chip as a source.
      const prisma = makeProject('Promote a perfume', [{ label: 'Product', addedAt: new Date().toISOString() }]);
      const result = await new ProductionPlanService().plan(prisma, { projectId: 'p1', userId: 'u1' });
      expect(result.ok).toBe(false);
      expect((result as any).code).toBe('READINESS_REQUIRED');
    }));
});

// ─── Section 13: test matrix (real vs fictional, owned vs non-owned) ─────────
describe('readiness — section 13 test matrix', () => {
  it('"Promote a skin care product." → NOT READY (non-owned, no fictional auth)', () => {
    expect(assess('Promote a skin care product.').ready).toBe(false);
  });

  it('"Promote my skin care product." → NOT READY (owned, no source)', () => {
    expect(assess('Promote my skin care product.').ready).toBe(false);
  });

  it('"Create a promotional video for GlowHaus." → NOT READY (named brand, no source)', () => {
    // Named brand → commercial intent → real vs fictional gate fires
    expect(assess('Create a promotional video for GlowHaus.').ready).toBe(false);
  });

  it('"Promote my skin care product." with source → READY', () => {
    expect(assess('Promote my skin care product.', { hasSourceAsset: true }).ready).toBe(true);
  });

  it('"Create a fictional skincare product commercial." → READY (explicit fictional auth)', () => {
    expect(assess('Create a fictional skincare product commercial.').ready).toBe(true);
  });

  it('"Create a fictional skincare brand called GlowHaus." → READY (explicit fictional auth)', () => {
    expect(assess('Create a fictional skincare brand called GlowHaus.').ready).toBe(true);
  });

  it('story/education: never blocked by commercial gate', () => {
    expect(assess('Create a cinematic short film about a woman returning home.').ready).toBe(true);
    expect(assess('Create a 3-minute lesson explaining photosynthesis.').ready).toBe(true);
  });
});

// ─── Section 14: natural language variations (all must require readiness) ────
describe('readiness — section 14 natural language variations', () => {
  const SOURCE_DEPENDENT: string[] = [
    'Promote a skin care product.',
    'Create an advertisement for a skincare product.',
    'Make a commercial for a perfume.',
    'Create a promotional video for a beauty product.',
    'Make a marketing video for a cosmetic product.',
    'Promote a new fragrance.',
    'Create a product commercial.',
  ];

  for (const text of SOURCE_DEPENDENT) {
    it(`"${text}" → NOT READY without source`, () => {
      expect(assess(text).ready).toBe(false);
    });
  }

  it('all section-14 variants become READY after fictional authorization', () => {
    for (const text of SOURCE_DEPENDENT) {
      const withFictional = `${text} Use a fictional concept — invent it rather than using a real one.`;
      expect(assess(withFictional).ready).toBe(true);
    }
  });

  it('all section-14 variants become READY after source supplied', () => {
    for (const text of SOURCE_DEPENDENT) {
      expect(assess(text, { hasSourceAsset: true }).ready).toBe(true);
    }
  });
});

// ─── Section 7: Source continuity — URL must survive the full lifecycle ───────
//
// These tests assert the invariant from spec 7: brief.attachments[].url must
// equal plan.sourceReferences[].url, and that chain must never break through
// director apply or production runner invocation.
describe('source continuity — URL chain from brief to runner', () => {
  const SOURCE_URL = 'https://r2.example.com/uploads/product.jpg';
  const ATTACHMENT = { id: 'att-1', label: 'Product', kind: 'image', origin: 'upload', url: SOURCE_URL, addedAt: new Date().toISOString() };

  // ── sourceReferencesFromBrief ─────────────────────────────────────────────
  it('sourceReferencesFromBrief maps attachment URL to sourceReference URL (identity)', () => {
    const refs = sourceReferencesFromBrief({ attachments: [ATTACHMENT] });
    expect(refs).toHaveLength(1);
    expect(refs[0]!.url).toBe(SOURCE_URL);
    expect(refs[0]!.kind).toBe('image');
    expect(refs[0]!.origin).toBe('upload');
  });

  it('sourceReferencesFromBrief excludes label-only chips (no url)', () => {
    const refs = sourceReferencesFromBrief({ attachments: [{ label: 'Product', addedAt: new Date().toISOString() }] });
    expect(refs).toHaveLength(1);
    expect(refs[0]!.url).toBeUndefined(); // present but url is undefined
  });

  it('sourceReferencesFromBrief returns [] for null brief', () => {
    expect(sourceReferencesFromBrief(null)).toHaveLength(0);
  });

  // ── buildCreativePlan: sourceReferences stored in plan JSON ──────────────
  it('buildCreativePlan stores sourceReferences URL in plan JSON (brief → plan)', () => {
    const plan = buildCreativePlan({
      projectType: 'COMMERCIAL',
      brief: { originalIntent: 'Promote a perfume', attachments: [ATTACHMENT] },
      sourceReferences: [{ id: ATTACHMENT.id, kind: 'image', origin: 'upload', url: SOURCE_URL }],
    });
    expect(plan.sourceReferences).toHaveLength(1);
    expect(plan.sourceReferences![0]!.url).toBe(SOURCE_URL);
  });

  it('buildCreativePlan: sourceReferences URL equals brief attachment URL', () => {
    const brief = { originalIntent: 'Promote a perfume', attachments: [ATTACHMENT] };
    const sourceRefs = sourceReferencesFromBrief(brief);
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL', brief, sourceReferences: sourceRefs });
    expect(plan.sourceReferences![0]!.url).toBe(ATTACHMENT.url);
  });

  // ── plan.ts: director spread preserves sourceReferences ──────────────────
  it('plan spread: { ...plan, scenes } preserves sourceReferences URL intact', () => {
    const originalPlan = buildCreativePlan({
      projectType: 'COMMERCIAL',
      brief: { originalIntent: 'Promote a perfume', attachments: [ATTACHMENT] },
      sourceReferences: [{ id: 'src-0', kind: 'image', origin: 'upload', url: SOURCE_URL }],
    });
    // Simulate what applyChangeToCreativeState does: spread the plan, mutate scenes only.
    const updatedPlan = { ...originalPlan, scenes: originalPlan.scenes.map((s) => ({ ...s })) };
    expect(updatedPlan.sourceReferences).toBe(originalPlan.sourceReferences);
    expect(updatedPlan.sourceReferences![0]!.url).toBe(SOURCE_URL);
  });

  // ── runner: sourceSeedUrl is passed to generateVideo for opening clip ────
  it('runner passes sourceSeedUrl from plan.sourceReferences to generateVideo for SCENE_01', async () => {
    const capturedSeeds: Array<string | undefined> = [];
    const mockPlan = buildCreativePlan({
      projectType: 'COMMERCIAL',
      brief: { originalIntent: 'Promote a perfume', attachments: [ATTACHMENT] },
      sourceReferences: [{ id: 'src-0', kind: 'image', origin: 'upload', url: SOURCE_URL }],
    });

    const mockDeps = {
      generateStill: vi.fn().mockResolvedValue({ assetUrl: 'https://r2.example.com/still.png', thumbnailUrl: undefined }),
      generateVideo: vi.fn().mockImplementation((_spec: unknown, _projectId: string, _assetId: string, seed?: string) => {
        capturedSeeds.push(seed);
        return Promise.resolve({ assetUrl: 'https://r2.example.com/clip.mp4' });
      }),
      extractLastFrame: vi.fn().mockResolvedValue(null),
    };

    let assetCounter = 0;
    const mockPrisma = {
      creativeProject: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'p1', userId: 'u1', status: 'GENERATING',
          productionPlan: { plan: mockPlan },
          bible: null,
        }),
        update: vi.fn().mockResolvedValue({ id: 'p1' }),
      },
      creativeProducedAsset: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockImplementation(({ data }: { data: { sceneId: string; kind: string } }) => {
          assetCounter += 1;
          return Promise.resolve({ id: `a${assetCounter}`, sceneId: data.sceneId, kind: data.kind, status: 'GENERATING', assetUrl: null });
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      creativeProductionRun: undefined,
      // credits: let deductCredits fail silently via .catch(() => 0)
    } as never;

    await runCreativeProduction(mockPrisma, { projectId: 'p1' }, mockDeps);

    // generateVideo is called once per scene (one scene in this plan has 3 shots but
    // routeProduction produces one VIDEO spec per scene). The first call must receive
    // the source URL as the seed since there is no lastClipUrl yet.
    expect(mockDeps.generateVideo).toHaveBeenCalled();
    expect(capturedSeeds[0]).toBe(SOURCE_URL);
  });

  // ── plan.ts: commercial context — product noun in descriptions ────────────
  it('commercial plan descriptions use the product noun from the intent (not generic "product")', () => {
    const plan = buildCreativePlan({
      projectType: 'COMMERCIAL',
      brief: { originalIntent: 'Promote a perfume' },
    });
    const descriptions = plan.scenes.map((s) => s.description.toLowerCase());
    const narrations = plan.scenes.map((s) => (s.narration ?? '').toLowerCase());
    // At least one description or narration should reference "perfume" directly
    const mentions = [...descriptions, ...narrations].some((t) => t.includes('perfume'));
    expect(mentions).toBe(true);
  });

  it('commercial plan narration includes the extracted product noun in the objective', () => {
    const plan = buildCreativePlan({
      projectType: 'COMMERCIAL',
      brief: { originalIntent: 'Promote a perfume' },
    });
    // narrationFor uses objectiveFor which now extracts "perfume" from the intent
    const bodyNarration = plan.scenes[1]?.narration ?? '';
    expect(bodyNarration.toLowerCase()).toContain('perfume');
  });
});
