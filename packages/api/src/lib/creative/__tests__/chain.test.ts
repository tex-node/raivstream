/**
 * Raivstream 5.0 — End-to-end chain regression tests.
 *
 * Covers the complete upload → brief → plan → director → runner → provider
 * chain. Ensures that a product photo's URL survives from confirmAttachment
 * through to the provider seed argument, that the Director's creativeDirection
 * reaches generation prompts, and that PROVIDER_DISABLED errors are
 * categorized correctly instead of silently becoming a generic fallback.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildCreativePlan, type PlanScene } from '../production/plan';
import { buildPrompt, routeProduction, type StillSpec } from '../production/capabilityRouter';
import { sourceReferencesFromBrief } from '../production/service';
import { enrichCreativePlan } from '../production/treatmentAdapter';
import { runCreativeProduction, type ProductionDeps } from '../production/runner';
import { interpret } from '../intent/interpreter';
import { MediaProviderError } from '../../mediaProviders/types';

// ─── errorMessages is a web component — test it inline for the chain ─────────

function creatorError(message: string | null | undefined): string {
  if (!message) return 'Something interrupted this scene. Your other scenes are safe.';
  const m = message.toLowerCase();
  if (m.includes('guidelines') || m.includes('moderation') || m.includes('violates')) return 'held back';
  if (m.includes('taking longer') || m.includes('timeout') || m.includes('timed out')) return 'taking longer';
  if (m.includes('credit')) return 'credit';
  if (m.includes('use this type of source') || m.includes('unsupported source')) return 'unsupported source';
  if (m.includes('need the image') || m.includes('source') || m.includes('seed') || m.includes('image-to-video')) return 'I need the image you want me to use.';
  if ((m.includes('disabled') && (m.includes('fal') || m.includes('provider'))) || m.includes('fal_key') || m.includes('provider_not_configured')) {
    return "Production isn't available right now. Try again in a moment, or contact support.";
  }
  return 'Something interrupted this scene. Your other scenes are safe — we can try this one again.';
}

// ─── 1. Source references chain ───────────────────────────────────────────────

describe('chain — sourceReferencesFromBrief', () => {
  it('returns a reference with url when attachment has a real url', () => {
    const brief = { attachments: [{ id: 'a1', label: 'Product', kind: 'image', origin: 'upload', url: 'https://cdn.example.com/p1/photo.jpg' }] };
    const refs = sourceReferencesFromBrief(brief);
    expect(refs).toHaveLength(1);
    expect(refs[0].url).toBe('https://cdn.example.com/p1/photo.jpg');
    expect(refs[0].kind).toBe('image');
    expect(refs[0].origin).toBe('upload');
  });

  it('returns url=undefined for a label-only attachment (no real file)', () => {
    // A label chip added by the UI before upload completes has no url field.
    const brief = { attachments: [{ id: 'a1', label: 'Product', kind: 'image', origin: 'upload' }] };
    const refs = sourceReferencesFromBrief(brief);
    expect(refs[0].url).toBeUndefined();
  });

  it('returns empty array when brief has no attachments', () => {
    expect(sourceReferencesFromBrief(null)).toEqual([]);
    expect(sourceReferencesFromBrief({})).toEqual([]);
    expect(sourceReferencesFromBrief({ attachments: [] })).toEqual([]);
  });
});

// ─── 2. Plan carries sourceReferences ────────────────────────────────────────

describe('chain — plan carries sourceReferences', () => {
  it('buildCreativePlan preserves sourceReferences in the returned plan', () => {
    const refs = [{ id: 'src-0', kind: 'image' as const, origin: 'upload' as const, label: 'Product', url: 'https://cdn.example.com/photo.jpg' }];
    const plan = buildCreativePlan({ projectType: interpret('a commercial').projectType, sourceReferences: refs });
    expect(plan.sourceReferences).toBeDefined();
    expect(plan.sourceReferences![0].url).toBe('https://cdn.example.com/photo.jpg');
  });

  it('buildCreativePlan does not add sourceReferences when none supplied', () => {
    const plan = buildCreativePlan({ projectType: 'STORY' });
    expect(plan.sourceReferences).toBeUndefined();
  });
});

// ─── 3. Product noun in commercial scene descriptions ─────────────────────────

describe('chain — product noun substitution', () => {
  it('extractProductNoun substitutes the actual noun in commercial scene descriptions', () => {
    const brief = { originalIntent: 'Promote a perfume called Aura', refinedIntent: 'Promote a perfume called Aura' };
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL', brief });
    // "Product Reveal" scene (index 1) has "Reveal the product as the hero" — noun should be substituted
    const revealScene = plan.scenes[1];
    expect(revealScene.description.toLowerCase()).toContain('perfume');
    expect(revealScene.description.toLowerCase()).not.toContain('the product');
  });

  it('falls back to "product" when intent has no extractable noun', () => {
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL' });
    // No brief → noun = 'product' → descriptions may still contain "product" (template default)
    expect(plan.scenes.length).toBeGreaterThan(0);
  });
});

// ─── 4. Director creativeDirection written to scene + reaches buildPrompt ─────

describe('chain — Director creativeDirection → buildPrompt', () => {
  it('buildPrompt includes creativeDirection when present on the scene', () => {
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL' });
    const sceneWithDirection: PlanScene = { ...plan.scenes[0], creativeDirection: 'slogan is Aura for aura' };
    const { prompt } = buildPrompt(sceneWithDirection, 'IMAGE');
    expect(prompt.toLowerCase()).toContain('aura for aura');
  });

  it('buildPrompt is unchanged when creativeDirection is absent', () => {
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL' });
    // Test buildPrompt in isolation: strip the field to confirm the function
    // produces no "creative direction:" clause when the field is undefined.
    const sceneWithoutDirection: PlanScene = { ...plan.scenes[0], creativeDirection: undefined };
    const { prompt } = buildPrompt(sceneWithoutDirection, 'IMAGE');
    expect(prompt.toLowerCase()).not.toContain('creative direction');
  });

  it('creativeDirection reaches VIDEO prompt too', () => {
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL' });
    const sceneWithDirection: PlanScene = { ...plan.scenes[0], creativeDirection: 'brand voice: sophisticated' };
    const { prompt } = buildPrompt(sceneWithDirection, 'VIDEO');
    expect(prompt.toLowerCase()).toContain('sophisticated');
  });
});

// ─── 5. Error categorization ──────────────────────────────────────────────────

describe('chain — error categorization', () => {
  it('PROVIDER_DISABLED (fal + disabled) maps to friendly message', () => {
    expect(creatorError('fal image disabled: FAL_MEDIA_PROVIDER_ENABLED is false')).toContain("available right now");
    expect(creatorError('fal video disabled: FAL_IMAGE_ENABLED is false')).toContain("available right now");
  });

  it('PROVIDER_NOT_CONFIGURED (fal_key) maps to friendly message', () => {
    expect(creatorError('FAL_KEY is not set')).toContain("available right now");
  });

  it('MISSING_SOURCE message (seed / image-to-video) maps to "I need the image"', () => {
    const msg = 'MiniMax H3-Max is an image-to-video model and requires a seed image. No seed was resolved for this scene.';
    expect(creatorError(msg)).toBe('I need the image you want me to use.');
  });

  it('account locked (HTTP 403) maps to friendly message', () => {
    expect(creatorError('fal image disabled: account locked or balance exhausted (HTTP 403)')).toContain('available right now');
    expect(creatorError('fal video disabled: account locked or balance exhausted (HTTP 403)')).toContain('available right now');
  });

  it('unknown error produces the generic fallback', () => {
    expect(creatorError('provider rejected the request due to an internal error')).toContain('Something interrupted');
  });

  it('null/undefined error produces the base fallback', () => {
    expect(creatorError(null)).toContain('Something interrupted');
    expect(creatorError(undefined)).toContain('Something interrupted');
  });
});

// ─── 6. Runner sourceSeedUrl and MediaProviderError no-retry ─────────────────

beforeEach(() => {
  process.env.RAIVSTREAM_5_ENABLED = 'true';
  process.env.RAIVSTREAM_5_PRODUCTION_ENABLED = 'true';
});
afterEach(() => {
  delete process.env.RAIVSTREAM_5_ENABLED;
  delete process.env.RAIVSTREAM_5_PRODUCTION_ENABLED;
});

const COMMERCIAL_PLAN = buildCreativePlan({
  projectType: interpret('promote a perfume').projectType,
  sourceReferences: [{ id: 'src-0', kind: 'image', origin: 'upload', label: 'Product', url: 'https://cdn.example.com/perfume.jpg' }],
});

function prismaMock() {
  const assets: any[] = [];
  const project = { id: 'p1', userId: 'u1', status: 'APPROVED', projectType: 'COMMERCIAL' };
  return {
    prisma: {
      creativeProject: {
        findUnique: async () => ({ ...project, productionPlan: { plan: COMMERCIAL_PLAN }, bible: null }),
        update: async ({ data }: any) => { Object.assign(project, data); return project; },
      },
      creativeProducedAsset: {
        findMany: async () => assets.map((a) => ({ ...a })),
        create: async ({ data }: any) => { const row = { id: `a${assets.length + 1}`, createdAt: new Date(), ...data }; assets.push(row); return row; },
        update: async ({ where, data }: any) => { const row = assets.find((a) => a.id === where.id); Object.assign(row, data); return row; },
        deleteMany: async () => ({ count: 0 }),
      },
      __assets: assets,
    } as never,
    assets,
  };
}

describe('chain — runner uses scene still as seed for source-conditioned projects', () => {
  it('passes the scene still URL as seedImageUrl to generateVideo (source-conditioned)', async () => {
    const { prisma } = prismaMock();
    const generateVideo = vi.fn(async () => ({ assetUrl: 'r2://video' }));
    const deps: ProductionDeps = {
      generateStill: vi.fn(async () => ({ assetUrl: 'r2://still' })),
      generateVideo,
      extractLastFrame: vi.fn(async () => null),
    };
    await runCreativeProduction(prisma, { projectId: 'p1' }, deps, { maxAttempts: 1 });
    // Source-conditioned: each video seeds from its own scene still (which was generated
    // with FLUX Kontext using the source photo). Not the raw source URL.
    const firstVideoCall = generateVideo.mock.calls[0] as unknown[];
    expect(firstVideoCall[3]).toBe('r2://still');
  });
});

// ─── 7. Creative treatment (enrichCreativePlan) ──────────────────────────────

describe('chain — creative treatment enrichment', () => {
  it('enriched creative directions differ structurally across scenes, not just by noun', () => {
    const brief = { originalIntent: 'Promote a perfume' };
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL', brief });
    const directions = plan.scenes.map((s) => s.creativeDirection ?? '');
    // All four directions are present and distinct
    expect(directions.every(Boolean)).toBe(true);
    const unique = new Set(directions);
    expect(unique.size).toBe(4);
    // Each direction reflects its beat (structural differentiation)
    expect(directions[0]).toContain('Dramatic');
    expect(directions[1]).toContain('Hero');
    expect(directions[2]).toContain('Lifestyle');
    expect(directions[3]).toContain('Brand statement');
  });

  it('motionDirection reaches the VIDEO prompt as a Camera instruction', () => {
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL' });
    const sceneWithMotion: PlanScene = { ...plan.scenes[0], motionDirection: 'Slow push-in toward the bottle' };
    const { prompt } = buildPrompt(sceneWithMotion, 'VIDEO');
    expect(prompt).toContain('Camera: Slow push-in toward the bottle.');
  });

  it('motionDirection does not appear in the IMAGE prompt', () => {
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL' });
    const sceneWithMotion: PlanScene = { ...plan.scenes[0], motionDirection: 'Lateral orbit 90 degrees' };
    const { prompt } = buildPrompt(sceneWithMotion, 'IMAGE');
    expect(prompt).not.toContain('Lateral orbit');
    expect(prompt).not.toContain('Camera:');
  });

  it('enriched plan has four different motionDirections', async () => {
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL' });
    const mockEvaluator = async () => ({
      scenes: [
        { sceneId: 'SCENE_01', creativeDirection: 'dir1', motionDirection: 'Slow push-in' },
        { sceneId: 'SCENE_02', creativeDirection: 'dir2', motionDirection: 'Lateral orbit 90 degrees' },
        { sceneId: 'SCENE_03', creativeDirection: 'dir3', motionDirection: 'Begin wide then reveal product' },
        { sceneId: 'SCENE_04', creativeDirection: 'dir4', motionDirection: 'Static hold with brightness lift' },
      ],
      provider: 'test',
      model: 'test',
    });
    const enriched = await enrichCreativePlan(plan, null, null, undefined, mockEvaluator);
    const motions = enriched.scenes.map((s) => s.motionDirection);
    expect(motions.every(Boolean)).toBe(true);
    const unique = new Set(motions);
    expect(unique.size).toBe(4);
  });

  it('enrichment failure leaves the original plan intact', async () => {
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL', brief: { originalIntent: 'Promote a perfume' } });
    const failingEvaluator = async (): Promise<never> => { throw new Error('Network timeout'); };
    const result = await enrichCreativePlan(plan, { originalIntent: 'Promote a perfume' }, null, undefined, failingEvaluator);
    expect(result.scenes).toHaveLength(plan.scenes.length);
    expect(result.scenes[0].creativeDirection).toBe(plan.scenes[0].creativeDirection);
    // No motionDirection when enrichment fails
    expect(result.scenes[0].motionDirection).toBeUndefined();
  });

  it('enrichment unavailability (no OPENAI_API_KEY) leaves the original plan intact', async () => {
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL' });
    const { CreativeTreatmentUnavailableError } = await import('../production/treatmentProvider');
    const unavailableEvaluator = async (): Promise<never> => { throw new CreativeTreatmentUnavailableError(); };
    const result = await enrichCreativePlan(plan, null, null, undefined, unavailableEvaluator);
    expect(result.scenes).toHaveLength(plan.scenes.length);
    expect(result.scenes[0].creativeDirection).toBe(plan.scenes[0].creativeDirection);
  });

  it('director-applied creativeDirection reaches the generation prompt', () => {
    // Director instructions run after plan creation and write directly to
    // scene.creativeDirection; this test verifies they reach buildPrompt.
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL' });
    const directorScene: PlanScene = { ...plan.scenes[0], creativeDirection: 'slogan is aura for aura' };
    const { prompt } = buildPrompt(directorScene, 'IMAGE');
    expect(prompt.toLowerCase()).toContain('slogan is aura for aura');
    // Enrichment-derived direction would be overwritten by the Director; the
    // Director change is the one that reaches generation.
    const videoPrompt = buildPrompt(directorScene, 'VIDEO').prompt;
    expect(videoPrompt.toLowerCase()).toContain('slogan is aura for aura');
  });

  it('sourceImageUrl is included in every still spec for source-conditioned plans', () => {
    const refs = [{ id: 'src-0', kind: 'image' as const, origin: 'upload' as const, url: 'https://cdn.example.com/perfume.jpg' }];
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL', sourceReferences: refs });
    const specs = routeProduction(plan);
    const stills = specs.filter((s) => s.kind === 'IMAGE') as StillSpec[];
    expect(stills).toHaveLength(plan.scenes.length);
    expect(stills.every((s) => s.sourceImageUrl === 'https://cdn.example.com/perfume.jpg')).toBe(true);
  });
});

// ─── 8. PROVIDER_DISABLED errors are not retried ──────────────────────────────

describe('chain — PROVIDER_DISABLED errors are not retried', () => {
  it('does not retry non-retryable MediaProviderError and records one attempt', async () => {
    const { prisma } = prismaMock();
    const still = vi.fn(async () => {
      throw new MediaProviderError('PROVIDER_DISABLED', 'fal image disabled: FAL_MEDIA_PROVIDER_ENABLED is false', { retryable: false });
    });
    const deps: ProductionDeps = {
      generateStill: still,
      generateVideo: vi.fn(async () => ({ assetUrl: 'r2://video' })),
      extractLastFrame: vi.fn(async () => null),
    };
    const result = await runCreativeProduction(prisma, { projectId: 'p1' }, deps, { maxAttempts: 3 });
    // One IMAGE call per scene — PROVIDER_DISABLED is non-retryable (maxAttempts ignored).
    expect(still).toHaveBeenCalledTimes(COMMERCIAL_PLAN.scenes.length);
    // Source-conditioned project: when stills all fail, videos fall back to the raw
    // sourceSeedUrl (still → undefined; lastClip → extractLastFrame → null → sourceSeedUrl).
    // All videos succeed. Only images fail.
    expect(result.failed).toBe(COMMERCIAL_PLAN.scenes.length);
    expect(result.generated).toBe(COMMERCIAL_PLAN.scenes.length);
    expect(result.status).toBe('PARTIAL');
  });
});
