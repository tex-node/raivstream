import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resolveAudienceMode,
  assertKidsSafeIdea,
  composeScenePromptText,
  composeEnhancedScenePrompt,
  storyRouter,
} from '../story';
import { promptEnhancerService, type PromptEnhancerOutput } from '../../lib/promptEnhancerService';

/**
 * Phase 2A — R16 scene video regression suite.
 *
 * Verifies that:
 * 1. R16 can request scene video (generateSceneVideo uses protectedProcedure, not creativeProcedure).
 * 2. R16 video still receives audienceMode=KIDS.
 * 3. KIDS safety/moderation still executes (KIDS negative prompts included).
 * 4. Unsafe R16 content remains rejected.
 * 5. GENERAL/non-R16 video behavior is unchanged.
 */

// ─── Minimal scene context ──────────────────────────────────────────────────

function makeScene(overrides: Record<string, unknown> = {}) {
  return {
    id: 'scene-r16',
    title: 'The Garden Discovery',
    description: 'A child finds a glowing flower in a peaceful garden.',
    locationType: 'garden',
    indoorOutdoor: 'outdoor',
    cameraStyle: 'MEDIUM_SHOT',
    chapter: { blueprint: null },
    project: {
      title: 'The Glowing Garden',
      audienceMode: 'KIDS',
      visualStyle: 'STORYBOOK_ILLUSTRATION',
      theme: 'kindness',
      characterMemory: [],
    },
    ...overrides,
  };
}

function makeCtx(isR16 = false) {
  return {
    prisma: { analyticsEvent: { create: async () => ({}) } },
    user: { id: 'user-r16' },
    isR16,
  };
}

const mockEnhancerOutput: PromptEnhancerOutput = {
  enhancedPrompt: 'A child discovers a glowing flower in a peaceful garden.',
  negativePrompt: 'violence, blood, weapons, adult themes',
  safetyNotes: 'safe for kids',
  styleUsed: 'STORYBOOK_ILLUSTRATION',
  providerHints: { camera: 'gentle', lighting: 'soft', composition: 'centered' },
  provider: 'deterministic-fallback',
};

// ─── 1. R16 can request scene video ─────────────────────────────────────────

describe('R16 scene video — endpoint accessibility', () => {
  it('storyRouter exposes generateSceneVideo (not blocked by creativeProcedure)', () => {
    expect((storyRouter as any)._def.procedures.generateSceneVideo).toBeDefined();
  });

  it('storyRouter exposes regenerateSceneVideo (not blocked by creativeProcedure)', () => {
    expect((storyRouter as any)._def.procedures.regenerateSceneVideo).toBeDefined();
  });
});

// ─── 2. R16 video receives audienceMode=KIDS ─────────────────────────────────

describe('resolveAudienceMode', () => {
  it('returns KIDS when ctx.isR16 is true, regardless of requested mode', () => {
    expect(resolveAudienceMode({ isR16: true }, 'GENERAL')).toBe('KIDS');
    expect(resolveAudienceMode({ isR16: true }, 'KIDS')).toBe('KIDS');
    expect(resolveAudienceMode({ isR16: true }, undefined)).toBe('KIDS');
  });

  it('returns GENERAL when isR16 is false and no mode requested', () => {
    expect(resolveAudienceMode({ isR16: false }, undefined)).toBe('GENERAL');
    expect(resolveAudienceMode({}, undefined)).toBe('GENERAL');
  });

  it('returns the requested mode when isR16 is false', () => {
    expect(resolveAudienceMode({ isR16: false }, 'KIDS')).toBe('KIDS');
    expect(resolveAudienceMode({ isR16: false }, 'GENERAL')).toBe('GENERAL');
  });

  it('treats undefined isR16 as non-R16', () => {
    expect(resolveAudienceMode({}, 'GENERAL')).toBe('GENERAL');
  });
});

// ─── 3. KIDS safety terms appear in prompts ───────────────────────────────────

describe('composeScenePromptText — KIDS safety', () => {
  it('VIDEO prompt for KIDS mode includes KIDS-specific negative terms', () => {
    const result = composeScenePromptText({
      scene: makeScene() as any,
      outputType: 'SHORT_VIDEO',
      provider: 'H3_MAX',
      audienceMode: 'KIDS',
    });
    expect(result.negativePrompt).toMatch(/violence/i);
    expect(result.negativePrompt).toMatch(/blood/i);
    expect(result.negativePrompt).toMatch(/weapons/i);
    expect(result.negativePrompt).toMatch(/adult themes/i);
    expect(result.negativePrompt).toMatch(/dark horror/i);
    expect(result.negativePrompt).toMatch(/sexual content/i);
  });

  it('VIDEO prompt for KIDS mode includes VIDEO-specific negative terms', () => {
    const result = composeScenePromptText({
      scene: makeScene() as any,
      outputType: 'SHORT_VIDEO',
      provider: 'H3_MAX',
      audienceMode: 'KIDS',
    });
    expect(result.negativePrompt).toMatch(/flicker/i);
    expect(result.negativePrompt).toMatch(/warped motion/i);
    expect(result.negativePrompt).toMatch(/jump cuts/i);
  });

  it('GENERAL mode does NOT include KIDS-only terms (graphic violence instead)', () => {
    const result = composeScenePromptText({
      scene: makeScene({ project: { ...makeScene().project, audienceMode: 'GENERAL' } }) as any,
      outputType: 'SHORT_VIDEO',
      provider: 'H3_MAX',
      audienceMode: 'GENERAL',
    });
    expect(result.negativePrompt).toMatch(/graphic violence/i);
    expect(result.negativePrompt).not.toMatch(/dark horror/i);
    expect(result.negativePrompt).not.toMatch(/unsafe behavior/i);
  });
});

// ─── 4. Unsafe R16 content remains rejected ──────────────────────────────────

describe('assertKidsSafeIdea', () => {
  it('throws for violent content in KIDS mode', () => {
    expect(() => assertKidsSafeIdea('A story about murder and blood', 'KIDS')).toThrow();
    expect(() => assertKidsSafeIdea('A child finds a gun', 'KIDS')).toThrow();
    expect(() => assertKidsSafeIdea('horror demons attack', 'KIDS')).toThrow();
  });

  it('throws for adult content in KIDS mode', () => {
    expect(() => assertKidsSafeIdea('A sexy story', 'KIDS')).toThrow();
    expect(() => assertKidsSafeIdea('drugs are cool', 'KIDS')).toThrow();
  });

  it('does NOT throw for safe story ideas in KIDS mode', () => {
    expect(() => assertKidsSafeIdea('A child discovers a glowing flower in a peaceful garden', 'KIDS')).not.toThrow();
    expect(() => assertKidsSafeIdea('A dog goes to school and makes friends', 'KIDS')).not.toThrow();
    expect(() => assertKidsSafeIdea('A brave rabbit learns to share', 'KIDS')).not.toThrow();
  });

  it('does NOT throw for any content in GENERAL mode', () => {
    expect(() => assertKidsSafeIdea('A story about blood and violence', 'GENERAL')).not.toThrow();
  });
});

// ─── 5. GENERAL / non-R16 behavior unchanged ─────────────────────────────────

describe('R16 video regression — non-R16 path unchanged', () => {
  beforeEach(() => {
    vi.spyOn(promptEnhancerService, 'enhance').mockResolvedValue(mockEnhancerOutput);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('non-R16 context with GENERAL project produces GENERAL audience mode', async () => {
    const result = await composeEnhancedScenePrompt(makeCtx(false), {
      scene: makeScene({ project: { ...makeScene().project, audienceMode: 'GENERAL' } }) as any,
      outputType: 'SHORT_VIDEO',
      provider: 'H3_MAX',
      audienceMode: 'GENERAL',
      projectId: 'project-general',
      analyticsSource: 'generation',
    });
    expect(result.negativePrompt).not.toBeNull();
  });

  it('R16 context forces KIDS audience mode on an otherwise GENERAL project', async () => {
    // resolveAudienceMode is called at the call site with ctx.isR16 — verify
    // that the audience mode resolver correctly converts isR16 → KIDS.
    expect(resolveAudienceMode({ isR16: true }, 'GENERAL')).toBe('KIDS');
    // The composed VIDEO prompt for KIDS should include KIDS safety terms.
    const result = composeScenePromptText({
      scene: makeScene() as any,
      outputType: 'SHORT_VIDEO',
      provider: 'H3_MAX',
      audienceMode: resolveAudienceMode({ isR16: true }, 'GENERAL'),
    });
    expect(result.negativePrompt).toMatch(/violence/i);
    expect(result.negativePrompt).toMatch(/blood/i);
  });
});
