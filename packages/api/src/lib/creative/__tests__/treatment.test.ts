/**
 * Raivstream 5.0 — Creative Treatment Acceptance Tests (ca25).
 *
 * Verifies cross-intent treatment correctness, Director priority over treatment,
 * re-plan persistence, source format handling, feature flag behavior, and
 * treatment quality invariants for all four creation intents.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildCreativePlan, type PlanScene } from '../production/plan';
import { buildPrompt, routeProduction, type StillSpec, type VideoSpec } from '../production/capabilityRouter';
import { enrichCreativePlan } from '../production/treatmentAdapter';
import { CreativeTreatmentUnavailableError } from '../production/treatmentProvider';
import { assessIntentReadiness } from '../intent/readiness';
import { interpret } from '../intent/interpreter';

// ─── Shared mock evaluator builder ───────────────────────────────────────────

function makeEvaluator(scenes: Array<{ sceneId: string; creativeDirection: string; motionDirection: string }>) {
  return async () => ({ scenes, provider: 'test', model: 'test' });
}

function makeFailingEvaluator(error: Error) {
  return async (): Promise<never> => { throw error; };
}

// ─── Part 2 / 3 — Story & Education intent-specific treatment ────────────────

describe('treatment — story intent', () => {
  it('story plan has 4 scenes with narrative structure beats', () => {
    const plan = buildCreativePlan({ projectType: 'STORY' });
    expect(plan.scenes).toHaveLength(4);
    const beats = plan.scenes.map((s) => s.beat);
    expect(beats[0]).toMatch(/meet|protagonist|character|setup/i);
    expect(beats[1]).toMatch(/conflict|obstacle|build|rising/i);
    expect(beats[2]).toMatch(/turn|change|pivot|peak|point/i);
    expect(beats[3]).toMatch(/resol|close|end|finish/i);
  });

  it('story scenes have distinct titles reflecting narrative progression', () => {
    const plan = buildCreativePlan({ projectType: 'STORY' });
    const titles = plan.scenes.map((s) => s.title);
    const unique = new Set(titles);
    expect(unique.size).toBe(4);
  });

  it('story enrichment sets distinct creativeDirection per scene', async () => {
    const plan = buildCreativePlan({ projectType: 'STORY' });
    const evaluator = makeEvaluator([
      { sceneId: 'SCENE_01', creativeDirection: 'Forest clearing at dusk — girl crouches near glowing object', motionDirection: 'Slow push-in toward her face' },
      { sceneId: 'SCENE_02', creativeDirection: 'Close-up of glowing orb — ethereal light on leaves around it', motionDirection: 'Controlled orbit around the object' },
      { sceneId: 'SCENE_03', creativeDirection: 'Wide shot — girl lifts the orb, forest reacts with motion and light', motionDirection: 'Begin wide then rapidly close on her expression' },
      { sceneId: 'SCENE_04', creativeDirection: 'Garden restored — girl stands, orb gone, peaceful resolution', motionDirection: 'Static hold with gentle light fade' },
    ]);
    const enriched = await enrichCreativePlan(plan, { originalIntent: 'Tell a story about a girl who finds a glowing object' }, null, undefined, evaluator);
    const directions = enriched.scenes.map((s) => s.creativeDirection);
    expect(directions.every(Boolean)).toBe(true);
    expect(new Set(directions).size).toBe(4);
  });

  it('story enrichment motionDirections are all distinct', async () => {
    const plan = buildCreativePlan({ projectType: 'STORY' });
    const evaluator = makeEvaluator([
      { sceneId: 'SCENE_01', creativeDirection: 'dir1', motionDirection: 'Slow push-in toward her face' },
      { sceneId: 'SCENE_02', creativeDirection: 'dir2', motionDirection: 'Controlled orbit around the object' },
      { sceneId: 'SCENE_03', creativeDirection: 'dir3', motionDirection: 'Begin wide then close on her expression' },
      { sceneId: 'SCENE_04', creativeDirection: 'dir4', motionDirection: 'Static hold with gentle light fade' },
    ]);
    const enriched = await enrichCreativePlan(plan, null, null, undefined, evaluator);
    const motions = enriched.scenes.map((s) => s.motionDirection);
    expect(motions.every(Boolean)).toBe(true);
    expect(new Set(motions).size).toBe(4);
  });

  it('story motionDirection reaches VIDEO prompts, not IMAGE', () => {
    const plan = buildCreativePlan({ projectType: 'STORY' });
    const scene: PlanScene = { ...plan.scenes[0], motionDirection: 'Slow push-in toward the protagonist' };
    expect(buildPrompt(scene, 'VIDEO').prompt).toContain('Camera: Slow push-in toward the protagonist.');
    expect(buildPrompt(scene, 'IMAGE').prompt).not.toContain('Camera:');
  });
});

// ─── Part 3 — Education intent ───────────────────────────────────────────────

describe('treatment — education intent', () => {
  it('education plan has pedagogical scene beats', () => {
    const plan = buildCreativePlan({ projectType: 'EDUCATION' });
    expect(plan.scenes).toHaveLength(4);
    const beats = plan.scenes.map((s) => s.beat);
    expect(beats[0]).toMatch(/hook|curious|wonder|intro/i);
    expect(beats[1]).toMatch(/explain|teach|concept/i);
    expect(beats[2]).toMatch(/example|show|demonstrate/i);
    expect(beats[3]).toMatch(/recap|lock|summar/i);
  });

  it('education enrichment sets conceptually distinct directions per scene', async () => {
    const plan = buildCreativePlan({ projectType: 'EDUCATION' });
    const evaluator = makeEvaluator([
      { sceneId: 'SCENE_01', creativeDirection: 'Aerial shot of ocean with water vapour visible — question on screen', motionDirection: 'Begin wide on ocean then pull back to sky' },
      { sceneId: 'SCENE_02', creativeDirection: 'Animated diagram — water molecules rise as warm air carries them upward', motionDirection: 'Slow upward camera reveal following rising vapour' },
      { sceneId: 'SCENE_03', creativeDirection: 'Cloud formation — ice crystals collect in a cumulus cloud against blue sky', motionDirection: 'Time-lapse push-in on cloud formation' },
      { sceneId: 'SCENE_04', creativeDirection: 'Rain falls on a child\'s face — she smiles and looks up, understanding', motionDirection: 'Static hold on her face as rain begins' },
    ]);
    const enriched = await enrichCreativePlan(plan, { originalIntent: 'Teach children how rain forms' }, null, undefined, evaluator);
    const directions = enriched.scenes.map((s) => s.creativeDirection);
    expect(directions.every(Boolean)).toBe(true);
    expect(new Set(directions).size).toBe(4);
  });

  it('education narration uses learner language, not commercial language', () => {
    const plan = buildCreativePlan({ projectType: 'EDUCATION' });
    const narrations = plan.scenes.map((s) => s.narration ?? '');
    expect(narrations.some((n) => n.toLowerCase().includes('wonder') || n.toLowerCase().includes('you'))).toBe(true);
    // Education plans must not use commercial CTA language
    expect(narrations.some((n) => /\bbuy\b|\border\b|\bshop\b/i.test(n))).toBe(false);
  });
});

// ─── Part 4 — Commercial product identity ────────────────────────────────────

describe('treatment — commercial intent / product identity', () => {
  it('commercial plan names the actual product in scene descriptions', () => {
    const brief = { originalIntent: 'Promote a premium wristwatch' };
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL', brief });
    const allText = plan.scenes.map((s) => s.description).join(' ').toLowerCase();
    expect(allText).toContain('wristwatch');
    expect(allText).not.toContain(' the product ');
  });

  it('commercial plan for a perfume names perfume, not generic product', () => {
    const brief = { originalIntent: 'Promote a new perfume called Aura' };
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL', brief });
    const allText = plan.scenes.map((s) => s.description).join(' ').toLowerCase();
    expect(allText).toContain('perfume');
  });

  it('commercial plan for a coffee machine names coffee machine', () => {
    const brief = { originalIntent: 'Advertise a premium coffee machine' };
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL', brief });
    const allText = plan.scenes.map((s) => s.description).join(' ').toLowerCase();
    expect(allText).toContain('coffee machine');
  });

  it('commercial plan for a skincare product names skincare', () => {
    const brief = { originalIntent: 'Promote a skincare product called GlowSkin' };
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL', brief });
    const allText = plan.scenes.map((s) => s.description).join(' ').toLowerCase();
    // extractProductNoun stops at the " product" terminator, yielding "skincare"
    expect(allText).toContain('skincare');
    expect(allText).not.toContain('the product');
  });

  it('does not extract format words (video/film/ad) as the product noun', () => {
    const brief = { originalIntent: 'Make a promotional video for a new sneaker' };
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL', brief });
    const allText = plan.scenes.map((s) => s.description).join(' ').toLowerCase();
    expect(allText).toContain('sneaker');
    expect(allText).not.toContain('the video');
  });

  it('commercial CTA scene (scene 4) has a brand/call-to-action beat', () => {
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL' });
    const lastScene = plan.scenes[plan.scenes.length - 1];
    expect(lastScene.beat).toMatch(/finish|cta|action|call|strong/i);
  });

  it('commercial scenes have 4 structurally distinct static creativeDirections', () => {
    const brief = { originalIntent: 'Promote a perfume' };
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL', brief });
    const directions = plan.scenes.map((s) => s.creativeDirection ?? '');
    expect(directions.every(Boolean)).toBe(true);
    expect(new Set(directions).size).toBe(4);
  });
});

// ─── Part 5 — Transform intent and source ownership ──────────────────────────

describe('treatment — transform intent', () => {
  it('transform plan has 3 scenes (before/during/after structure)', () => {
    const plan = buildCreativePlan({ projectType: 'TRANSFORMATION' });
    expect(plan.scenes).toHaveLength(3);
    const beats = plan.scenes.map((s) => s.beat.toLowerCase());
    expect(beats[0]).toMatch(/before|start|establish/i);
    expect(beats[1]).toMatch(/during|change|motion/i);
    expect(beats[2]).toMatch(/after|result|reveal/i);
  });

  it('transform readiness requires a source when no fictional authorization', () => {
    const intent = 'Transform this portrait into a cinematic magazine cover';
    const interpretation = interpret(intent);
    const readiness = assessIntentReadiness(intent, interpretation, { hasSourceAsset: false });
    expect(readiness.ready).toBe(false);
    if (!readiness.ready) expect(readiness.contextType).toBe('SOURCE');
  });

  it('transform is allowed when source asset is supplied', () => {
    const intent = 'Transform this portrait into a cinematic magazine cover';
    const interpretation = interpret(intent);
    const readiness = assessIntentReadiness(intent, interpretation, { hasSourceAsset: true });
    expect(readiness.ready).toBe(true);
  });

  it('fictional authorization allows transform without a source', () => {
    const intent = 'Turn this fictional character into a futuristic space explorer';
    const interpretation = interpret(intent);
    const readiness = assessIntentReadiness(intent, interpretation, { hasSourceAsset: false });
    expect(readiness.ready).toBe(true);
  });

  it('transform enrichment directions differ across scenes', async () => {
    const plan = buildCreativePlan({ projectType: 'TRANSFORMATION' });
    const evaluator = makeEvaluator([
      { sceneId: 'SCENE_01', creativeDirection: 'Subject in natural light, original portrait framing, soft background', motionDirection: 'Static hold on face with subtle breathing movement' },
      { sceneId: 'SCENE_02', creativeDirection: 'Mid-transformation — dramatic shadow play, wardrobe change in motion', motionDirection: 'Fast lateral reveal tracking the change' },
      { sceneId: 'SCENE_03', creativeDirection: 'Magazine cover composition — high contrast, editorial lighting, strong eye line', motionDirection: 'Slow push-in to confident close-up' },
    ]);
    const enriched = await enrichCreativePlan(plan, { originalIntent: 'Transform this portrait into a cinematic magazine cover' }, null, undefined, evaluator);
    expect(new Set(enriched.scenes.map((s) => s.creativeDirection)).size).toBe(3);
  });
});

// ─── Part 6 — Director priority ──────────────────────────────────────────────

describe('treatment — Director priority over AI treatment', () => {
  it('Director creativeDirection overwrites enrichment on that scene', async () => {
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL' });
    const evaluator = makeEvaluator([
      { sceneId: 'SCENE_01', creativeDirection: 'AI treatment for scene 1', motionDirection: 'AI motion 1' },
      { sceneId: 'SCENE_02', creativeDirection: 'AI treatment for scene 2', motionDirection: 'AI motion 2' },
      { sceneId: 'SCENE_03', creativeDirection: 'AI treatment for scene 3', motionDirection: 'AI motion 3' },
      { sceneId: 'SCENE_04', creativeDirection: 'AI treatment for scene 4', motionDirection: 'AI motion 4' },
    ]);
    // Director has locked SCENE_01 with an explicit instruction
    const lockedSceneIds = new Set(['SCENE_01']);
    // basePlan has the Director's direction already copied onto it
    const planWithDirectorDirection = {
      ...plan,
      scenes: plan.scenes.map((s) =>
        s.sceneId === 'SCENE_01' ? { ...s, creativeDirection: 'Director: warm and intimate, golden hour', motionDirection: 'Director motion: slow drift' } : s,
      ),
    };
    const enriched = await enrichCreativePlan(planWithDirectorDirection, null, null, undefined, evaluator, lockedSceneIds);
    // SCENE_01 must keep Director direction
    expect(enriched.scenes[0].creativeDirection).toBe('Director: warm and intimate, golden hour');
    expect(enriched.scenes[0].motionDirection).toBe('Director motion: slow drift');
    // Other scenes get AI treatment
    expect(enriched.scenes[1].creativeDirection).toBe('AI treatment for scene 2');
  });

  it('Director creativeDirection reaches generation prompt and overrides enrichment', () => {
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL' });
    const directorScene: PlanScene = {
      ...plan.scenes[0],
      creativeDirection: 'Keep the product centered, warmer palette, more intimate',
    };
    const { prompt } = buildPrompt(directorScene, 'IMAGE');
    expect(prompt.toLowerCase()).toContain('keep the product centered');
    expect(prompt.toLowerCase()).toContain('warmer palette');
  });

  it('Director motionDirection reaches VIDEO prompt as Camera instruction', () => {
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL' });
    const directorScene: PlanScene = {
      ...plan.scenes[0],
      motionDirection: 'Slower orbit, keep camera at product level',
    };
    const { prompt } = buildPrompt(directorScene, 'VIDEO');
    expect(prompt).toContain('Camera: Slower orbit, keep camera at product level.');
  });

  it('Director motionDirection does NOT appear in IMAGE prompts', () => {
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL' });
    const directorScene: PlanScene = { ...plan.scenes[0], motionDirection: 'Slow lateral orbit' };
    const { prompt } = buildPrompt(directorScene, 'IMAGE');
    expect(prompt).not.toContain('Slow lateral orbit');
    expect(prompt).not.toContain('Camera:');
  });
});

// ─── Part 7 — Re-plan persistence ────────────────────────────────────────────

describe('treatment — re-plan persistence (Director > Treatment priority)', () => {
  it('locked scenes retain their Director direction after enrichment', async () => {
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL' });
    const evaluator = makeEvaluator([
      { sceneId: 'SCENE_01', creativeDirection: 'AI says: moody dark studio', motionDirection: 'AI motion 1' },
      { sceneId: 'SCENE_02', creativeDirection: 'AI says: bright daylight', motionDirection: 'AI motion 2' },
      { sceneId: 'SCENE_03', creativeDirection: 'AI says: golden hour', motionDirection: 'AI motion 3' },
      { sceneId: 'SCENE_04', creativeDirection: 'AI says: white studio CTA', motionDirection: 'AI motion 4' },
    ]);

    const lockedSceneIds = new Set(['SCENE_02', 'SCENE_03']);
    const planWithDirectorDirections = {
      ...plan,
      scenes: plan.scenes.map((s) => {
        if (s.sceneId === 'SCENE_02') return { ...s, creativeDirection: 'Director: airy white linen, slow reveal', motionDirection: 'Director: lateral push' };
        if (s.sceneId === 'SCENE_03') return { ...s, creativeDirection: 'Director: intimate close-up with product in hand', motionDirection: 'Director: track subject walking' };
        return s;
      }),
    };

    const enriched = await enrichCreativePlan(planWithDirectorDirections, null, null, undefined, evaluator, lockedSceneIds);

    // Locked scenes must retain Director direction
    expect(enriched.scenes[1].creativeDirection).toBe('Director: airy white linen, slow reveal');
    expect(enriched.scenes[1].motionDirection).toBe('Director: lateral push');
    expect(enriched.scenes[2].creativeDirection).toBe('Director: intimate close-up with product in hand');

    // Unlocked scenes get AI treatment
    expect(enriched.scenes[0].creativeDirection).toBe('AI says: moody dark studio');
    expect(enriched.scenes[3].creativeDirection).toBe('AI says: white studio CTA');
  });

  it('empty lockedSceneIds → all scenes get AI enrichment', async () => {
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL' });
    const evaluator = makeEvaluator([
      { sceneId: 'SCENE_01', creativeDirection: 'AI dir 1', motionDirection: 'AI motion 1' },
      { sceneId: 'SCENE_02', creativeDirection: 'AI dir 2', motionDirection: 'AI motion 2' },
      { sceneId: 'SCENE_03', creativeDirection: 'AI dir 3', motionDirection: 'AI motion 3' },
      { sceneId: 'SCENE_04', creativeDirection: 'AI dir 4', motionDirection: 'AI motion 4' },
    ]);
    const enriched = await enrichCreativePlan(plan, null, null, undefined, evaluator, new Set());
    expect(enriched.scenes[0].creativeDirection).toBe('AI dir 1');
    expect(enriched.scenes[3].creativeDirection).toBe('AI dir 4');
  });

  it('undefined lockedSceneIds → all scenes get AI enrichment (backward compat)', async () => {
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL' });
    const evaluator = makeEvaluator([
      { sceneId: 'SCENE_01', creativeDirection: 'AI dir 1', motionDirection: 'AI motion 1' },
      { sceneId: 'SCENE_02', creativeDirection: 'AI dir 2', motionDirection: 'AI motion 2' },
      { sceneId: 'SCENE_03', creativeDirection: 'AI dir 3', motionDirection: 'AI motion 3' },
      { sceneId: 'SCENE_04', creativeDirection: 'AI dir 4', motionDirection: 'AI motion 4' },
    ]);
    const enriched = await enrichCreativePlan(plan, null, null, undefined, evaluator);
    expect(enriched.scenes[0].creativeDirection).toBe('AI dir 1');
  });
});

// ─── Part 8 — Treatment quality invariants ───────────────────────────────────

describe('treatment quality invariants — scene differentiation', () => {
  it('enrichment with 4 distinct treatments produces 4 distinct creativeDirections', async () => {
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL' });
    const evaluator = makeEvaluator([
      { sceneId: 'SCENE_01', creativeDirection: 'Dark velvet curtains, atmospheric spotlight', motionDirection: 'Slow push-in toward the bottle' },
      { sceneId: 'SCENE_02', creativeDirection: 'Airy daylit window, product on wooden table', motionDirection: 'Lateral orbit around the product' },
      { sceneId: 'SCENE_03', creativeDirection: 'Golden hour garden, woman holding bottle', motionDirection: 'Track subject walking through garden' },
      { sceneId: 'SCENE_04', creativeDirection: 'White minimalist plinth, rotating bottle', motionDirection: 'Slow controlled 360 degree orbit' },
    ]);
    const enriched = await enrichCreativePlan(plan, null, null, undefined, evaluator);
    const directions = enriched.scenes.map((s) => s.creativeDirection);
    expect(directions.every(Boolean)).toBe(true);
    expect(new Set(directions).size).toBe(4);
  });

  it('enrichment with 4 distinct motionDirections produces 4 distinct motions', async () => {
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL' });
    const evaluator = makeEvaluator([
      { sceneId: 'SCENE_01', creativeDirection: 'dir1', motionDirection: 'Slow push-in toward the bottle' },
      { sceneId: 'SCENE_02', creativeDirection: 'dir2', motionDirection: 'Controlled 90 degree lateral orbit' },
      { sceneId: 'SCENE_03', creativeDirection: 'dir3', motionDirection: 'Tracking movement with subject through garden' },
      { sceneId: 'SCENE_04', creativeDirection: 'dir4', motionDirection: 'Static hold with gradual brightness lift' },
    ]);
    const enriched = await enrichCreativePlan(plan, null, null, undefined, evaluator);
    const motions = enriched.scenes.map((s) => s.motionDirection);
    expect(motions.every(Boolean)).toBe(true);
    expect(new Set(motions).size).toBe(4);
  });

  it('static commercial creativeDirections differ across all 4 scenes (no duplicates)', () => {
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL', brief: { originalIntent: 'Promote a perfume' } });
    const directions = plan.scenes.map((s) => s.creativeDirection ?? '');
    expect(directions.every(Boolean)).toBe(true);
    expect(new Set(directions).size).toBe(4);
  });

  it('motionDirection is not added to IMAGE specs via routeProduction', () => {
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL' });
    const enrichedPlan = {
      ...plan,
      scenes: plan.scenes.map((s) => ({ ...s, motionDirection: 'Slow push-in' })),
    };
    const specs = routeProduction(enrichedPlan);
    const stills = specs.filter((s) => s.kind === 'IMAGE') as StillSpec[];
    // IMAGE prompts must not contain Camera instruction
    expect(stills.every((s) => !s.prompt.includes('Camera:'))).toBe(true);
  });

  it('motionDirection is propagated into every VIDEO spec via routeProduction', () => {
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL' });
    const enrichedPlan = {
      ...plan,
      scenes: plan.scenes.map((s, i) => ({ ...s, motionDirection: `Motion direction for scene ${i + 1}` })),
    };
    const specs = routeProduction(enrichedPlan);
    const videos = specs.filter((s) => s.kind === 'VIDEO') as VideoSpec[];
    expect(videos.every((s) => s.prompt.includes('Camera:'))).toBe(true);
    expect(videos[0].prompt).toContain('Camera: Motion direction for scene 1.');
    expect(videos[1].prompt).toContain('Camera: Motion direction for scene 2.');
  });
});

// ─── Part 10 — Source format matrix ─────────────────────────────────────────

describe('treatment — source format matrix', () => {
  it('PNG source URL is passed to the evaluator (supported vision format)', async () => {
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL' });
    let receivedSourceUrl: string | undefined;
    const evaluator = async (input: { sourceImageUrl?: string }) => {
      receivedSourceUrl = input.sourceImageUrl;
      return {
        scenes: plan.scenes.map((s) => ({ sceneId: s.sceneId, creativeDirection: 'test', motionDirection: 'test' })),
        provider: 'test', model: 'test',
      };
    };
    await enrichCreativePlan(plan, null, null, 'https://cdn.example.com/product.png', evaluator as never);
    expect(receivedSourceUrl).toBe('https://cdn.example.com/product.png');
  });

  it('JPEG source URL is passed to the evaluator', async () => {
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL' });
    let receivedSourceUrl: string | undefined;
    const evaluator = async (input: { sourceImageUrl?: string }) => {
      receivedSourceUrl = input.sourceImageUrl;
      return {
        scenes: plan.scenes.map((s) => ({ sceneId: s.sceneId, creativeDirection: 'test', motionDirection: 'test' })),
        provider: 'test', model: 'test',
      };
    };
    await enrichCreativePlan(plan, null, null, 'https://cdn.example.com/product.jpg', evaluator as never);
    expect(receivedSourceUrl).toBe('https://cdn.example.com/product.jpg');
  });

  it('WEBP source URL is passed to the evaluator', async () => {
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL' });
    let receivedSourceUrl: string | undefined;
    const evaluator = async (input: { sourceImageUrl?: string }) => {
      receivedSourceUrl = input.sourceImageUrl;
      return {
        scenes: plan.scenes.map((s) => ({ sceneId: s.sceneId, creativeDirection: 'test', motionDirection: 'test' })),
        provider: 'test', model: 'test',
      };
    };
    await enrichCreativePlan(plan, null, null, 'https://cdn.example.com/product.webp', evaluator as never);
    expect(receivedSourceUrl).toBe('https://cdn.example.com/product.webp');
  });

  it('AVIF source falls back gracefully — enrichment still completes', async () => {
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL' });
    const evaluator = makeEvaluator(
      plan.scenes.map((s) => ({ sceneId: s.sceneId, creativeDirection: `direction for ${s.sceneId}`, motionDirection: `motion for ${s.sceneId}` })),
    );
    // AVIF source is passed in — enrichment should still succeed (fallback to text-only)
    const result = await enrichCreativePlan(plan, { originalIntent: 'Promote a perfume' }, null, 'https://cdn.example.com/product.avif', evaluator);
    expect(result.scenes).toHaveLength(4);
    expect(result.scenes[0].creativeDirection).toBeTruthy();
  });

  it('no source URL — enrichment completes without vision input', async () => {
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL' });
    const evaluator = makeEvaluator(
      plan.scenes.map((s) => ({ sceneId: s.sceneId, creativeDirection: `direction for ${s.sceneId}`, motionDirection: `motion for ${s.sceneId}` })),
    );
    const result = await enrichCreativePlan(plan, { originalIntent: 'Promote a perfume' }, null, undefined, evaluator);
    expect(result.scenes).toHaveLength(4);
    expect(result.scenes[0].creativeDirection).toBeTruthy();
  });
});

// ─── Part 11 — Treatment provider failure modes ──────────────────────────────

describe('treatment — provider failure fallback', () => {
  it('network timeout → static plan preserved, production not blocked', async () => {
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL', brief: { originalIntent: 'Promote a perfume' } });
    const originalDirections = plan.scenes.map((s) => s.creativeDirection);
    const result = await enrichCreativePlan(plan, null, null, undefined, makeFailingEvaluator(new Error('Request timeout after 30000ms')));
    expect(result.scenes.map((s) => s.creativeDirection)).toEqual(originalDirections);
  });

  it('HTTP 400 → static plan preserved', async () => {
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL' });
    const result = await enrichCreativePlan(plan, null, null, undefined, makeFailingEvaluator(new Error('Creative treatment provider failed with 400')));
    expect(result.scenes).toHaveLength(plan.scenes.length);
  });

  it('HTTP 500 → static plan preserved', async () => {
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL' });
    const result = await enrichCreativePlan(plan, null, null, undefined, makeFailingEvaluator(new Error('Creative treatment provider failed with 500')));
    expect(result.scenes).toHaveLength(plan.scenes.length);
  });

  it('malformed JSON → static plan preserved', async () => {
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL' });
    const result = await enrichCreativePlan(plan, null, null, undefined, makeFailingEvaluator(new Error('Creative treatment provider returned invalid JSON')));
    expect(result.scenes).toHaveLength(plan.scenes.length);
  });

  it('missing scene in response → static plan preserved', async () => {
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL' });
    const result = await enrichCreativePlan(plan, null, null, undefined, makeFailingEvaluator(new Error('Scene SCENE_01 missing creativeDirection or motionDirection')));
    expect(result.scenes).toHaveLength(plan.scenes.length);
  });

  it('unavailable provider (CreativeTreatmentUnavailableError) → static plan preserved', async () => {
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL' });
    const result = await enrichCreativePlan(plan, null, null, undefined, makeFailingEvaluator(new CreativeTreatmentUnavailableError()));
    expect(result.scenes).toHaveLength(plan.scenes.length);
  });

  it('all failure modes: plan has same scene count as original after failure', async () => {
    const errors = [
      new Error('Network timeout'),
      new Error('failed with 503'),
      new Error('invalid JSON'),
      new CreativeTreatmentUnavailableError('No API key'),
    ];
    for (const error of errors) {
      const plan = buildCreativePlan({ projectType: 'STORY' });
      const result = await enrichCreativePlan(plan, null, null, undefined, makeFailingEvaluator(error));
      expect(result.scenes).toHaveLength(plan.scenes.length);
      expect(result.scenes[0].motionDirection).toBeUndefined();
    }
  });
});

// ─── Part 12 — Feature flag ──────────────────────────────────────────────────

describe('treatment — feature flag', () => {
  beforeEach(() => {
    delete process.env.CREATIVE_TREATMENT_ENABLED;
    delete process.env.OPENAI_API_KEY;
  });
  afterEach(() => {
    delete process.env.CREATIVE_TREATMENT_ENABLED;
    delete process.env.OPENAI_API_KEY;
  });

  it('provider is configured when OPENAI_API_KEY is set and flag is not false', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-key';
    const { creativeTreatmentProvider } = await import('../production/treatmentProvider');
    expect(creativeTreatmentProvider.isConfigured).toBe(true);
  });

  it('provider is NOT configured when OPENAI_API_KEY is absent', async () => {
    delete process.env.OPENAI_API_KEY;
    const { creativeTreatmentProvider } = await import('../production/treatmentProvider');
    expect(creativeTreatmentProvider.isConfigured).toBe(false);
  });

  it('provider is NOT configured when CREATIVE_TREATMENT_ENABLED=false', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-key';
    process.env.CREATIVE_TREATMENT_ENABLED = 'false';
    const { creativeTreatmentProvider } = await import('../production/treatmentProvider');
    expect(creativeTreatmentProvider.isConfigured).toBe(false);
  });

  it('CREATIVE_TREATMENT_ENABLED=false throws CreativeTreatmentUnavailableError on generate', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-key';
    process.env.CREATIVE_TREATMENT_ENABLED = 'false';
    const { creativeTreatmentProvider, CreativeTreatmentUnavailableError: CTUE } = await import('../production/treatmentProvider');
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL' });
    const input = {
      originalIntent: 'Promote a perfume',
      scenes: plan.scenes.map((s) => ({ sceneId: s.sceneId, title: s.title, beat: s.beat, description: s.description })),
    };
    await expect(creativeTreatmentProvider.generate(input)).rejects.toBeInstanceOf(CTUE);
  });

  it('CREATIVE_TREATMENT_ENABLED=false → enrichCreativePlan returns original plan unchanged', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-key';
    process.env.CREATIVE_TREATMENT_ENABLED = 'false';
    const { enrichCreativePlan: enrich } = await import('../production/treatmentAdapter');
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL', brief: { originalIntent: 'Promote a perfume' } });
    const result = await enrich(plan);
    expect(result.scenes[0].motionDirection).toBeUndefined();
    expect(result.scenes[0].creativeDirection).toBe(plan.scenes[0].creativeDirection);
  });
});

// ─── Part 14 — No invented user-owned entities (readiness invariant) ─────────

describe('treatment — readiness: no invented user-owned entities', () => {
  it('"Promote my product" without source → readiness question (not invented product)', () => {
    const intent = 'Promote my product';
    const interpretation = interpret(intent);
    const readiness = assessIntentReadiness(intent, interpretation, { hasSourceAsset: false });
    expect(readiness.ready).toBe(false);
    if (!readiness.ready) {
      expect(readiness.contextType).toMatch(/PRODUCT|BRAND/);
    }
  });

  it('"Transform this person" without source → source readiness question', () => {
    const intent = 'Transform this person into a cyberpunk warrior';
    const interpretation = interpret(intent);
    const readiness = assessIntentReadiness(intent, interpretation, { hasSourceAsset: false });
    expect(readiness.ready).toBe(false);
    if (!readiness.ready) expect(readiness.contextType).toBe('SOURCE');
  });

  it('"Promote a fictional product" → allowed (explicit fictional authorization)', () => {
    const intent = 'Promote a fictional product called NovaSkin';
    const interpretation = interpret(intent);
    const readiness = assessIntentReadiness(intent, interpretation, { hasSourceAsset: false });
    expect(readiness.ready).toBe(true);
  });

  it('"Promote a real perfume" + source → allowed', () => {
    const intent = 'Promote a perfume called Aura';
    const interpretation = interpret(intent);
    const readiness = assessIntentReadiness(intent, interpretation, { hasSourceAsset: true });
    expect(readiness.ready).toBe(true);
  });

  it('story intent without source → allowed (stories can invent)', () => {
    const intent = 'Tell a short story about a detective solving a mystery';
    const interpretation = interpret(intent);
    const readiness = assessIntentReadiness(intent, interpretation, { hasSourceAsset: false });
    expect(readiness.ready).toBe(true);
  });

  it('education intent without source → allowed (education invents examples)', () => {
    const intent = 'Teach children how photosynthesis works';
    const interpretation = interpret(intent);
    const readiness = assessIntentReadiness(intent, interpretation, { hasSourceAsset: false });
    expect(readiness.ready).toBe(true);
  });
});

// ─── Part 16 — Prompt propagation end-to-end ─────────────────────────────────

describe('treatment — full prompt propagation: PlanScene → routeProduction → prompt', () => {
  it('creativeDirection from AI treatment reaches IMAGE prompt via routeProduction', () => {
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL' });
    const enrichedPlan = {
      ...plan,
      scenes: plan.scenes.map((s, i) => ({ ...s, creativeDirection: `AI direction for scene ${i + 1}` })),
    };
    const specs = routeProduction(enrichedPlan);
    const imageSpecs = specs.filter((s) => s.kind === 'IMAGE');
    expect(imageSpecs[0].prompt).toContain('AI direction for scene 1');
    expect(imageSpecs[3].prompt).toContain('AI direction for scene 4');
  });

  it('motionDirection from AI treatment reaches VIDEO prompt via routeProduction', () => {
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL' });
    const enrichedPlan = {
      ...plan,
      scenes: plan.scenes.map((s, i) => ({ ...s, motionDirection: `Camera motion for scene ${i + 1}` })),
    };
    const specs = routeProduction(enrichedPlan);
    const videoSpecs = specs.filter((s) => s.kind === 'VIDEO');
    expect(videoSpecs[0].prompt).toContain('Camera: Camera motion for scene 1.');
    expect(videoSpecs[3].prompt).toContain('Camera: Camera motion for scene 4.');
  });

  it('motionDirection does NOT appear in IMAGE prompts (no pollution)', () => {
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL' });
    const enrichedPlan = {
      ...plan,
      scenes: plan.scenes.map((s) => ({ ...s, motionDirection: 'Should not appear in image prompts' })),
    };
    const specs = routeProduction(enrichedPlan);
    const imageSpecs = specs.filter((s) => s.kind === 'IMAGE');
    expect(imageSpecs.every((s) => !s.prompt.includes('Should not appear'))).toBe(true);
    expect(imageSpecs.every((s) => !s.prompt.includes('Camera:'))).toBe(true);
  });

  it('creativeDirection appears in VIDEO prompts too (not image-only)', () => {
    const plan = buildCreativePlan({ projectType: 'COMMERCIAL' });
    const enrichedPlan = {
      ...plan,
      scenes: plan.scenes.map((s) => ({ ...s, creativeDirection: 'brand voice: luxurious and confident' })),
    };
    const specs = routeProduction(enrichedPlan);
    const videoSpecs = specs.filter((s) => s.kind === 'VIDEO');
    expect(videoSpecs.every((s) => s.prompt.toLowerCase().includes('luxurious and confident'))).toBe(true);
  });
});
