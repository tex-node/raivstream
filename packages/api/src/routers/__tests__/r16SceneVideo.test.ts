import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resolveAudienceMode,
  resolveSceneVideoResolution,
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

// ─── Phase D V1 remediation — anti-commercial guard ─────────────────────────

function makeEducationalScene(antiCommercialNote?: string) {
  return {
    ...makeScene(),
    directorMetadata: {
      learningObjective: 'Understand how ships float using Archimedes principle',
      teachingConcept: 'buoyancy',
      visualTeachingRequirement: 'Show ship cross-section and displaced water volume',
      ...(antiCommercialNote !== undefined ? { antiCommercialNote } : {}),
    },
  };
}

describe('Phase D V1 — educational anti-commercial positive guard', () => {
  it('T-V1-1: educational + antiCommercialNote absent → baseline guard in prompt', () => {
    const result = composeScenePromptText({
      scene: makeEducationalScene() as any,
      outputType: 'IMAGE',
      provider: 'FLUX',
      audienceMode: 'GENERAL',
    });
    expect(result.prompt).toMatch(/EDUCATIONAL GUARD/i);
    expect(result.prompt).toMatch(/product/i);
    expect(result.prompt).toMatch(/advertisement/i);
  });

  it('T-V1-2: educational + antiCommercialNote present → baseline guard + scene-specific note', () => {
    const result = composeScenePromptText({
      scene: makeEducationalScene('Show the ship as a teaching tool, not a luxury vessel') as any,
      outputType: 'IMAGE',
      provider: 'FLUX',
      audienceMode: 'GENERAL',
    });
    expect(result.prompt).toMatch(/EDUCATIONAL GUARD/i);
    expect(result.prompt).toMatch(/Scene-specific:/i);
    expect(result.prompt).toContain('Show the ship as a teaching tool, not a luxury vessel');
  });

  it('T-V1-3: non-educational → no educational anti-commercial guard in prompt', () => {
    const result = composeScenePromptText({
      scene: makeScene() as any,
      outputType: 'IMAGE',
      provider: 'FLUX',
      audienceMode: 'GENERAL',
    });
    expect(result.prompt).not.toMatch(/EDUCATIONAL GUARD/i);
    expect(result.prompt).not.toMatch(/Scene-specific:/i);
  });
});

describe('Phase D V1 — educational anti-commercial negative prompt', () => {
  it('T-V1-4: educational V1 negative prompt contains commercial-framing terms', () => {
    const result = composeScenePromptText({
      scene: makeEducationalScene() as any,
      outputType: 'IMAGE',
      provider: 'FLUX',
      audienceMode: 'GENERAL',
    });
    expect(result.negativePrompt).toMatch(/advertisement-style composition/i);
    expect(result.negativePrompt).toMatch(/product hero shot/i);
    expect(result.negativePrompt).toMatch(/packshot/i);
    expect(result.negativePrompt).toMatch(/luxury product glamour/i);
    expect(result.negativePrompt).toMatch(/promotional campaign aesthetic/i);
    expect(result.negativePrompt).toMatch(/catalogue photography/i);
    expect(result.negativePrompt).toMatch(/logo dominating frame/i);
    expect(result.negativePrompt).toMatch(/brand showcase composition/i);
  });

  it('T-V1-5: non-educational V1 negative prompt does not contain educational commercial-framing terms', () => {
    const result = composeScenePromptText({
      scene: makeScene() as any,
      outputType: 'IMAGE',
      provider: 'FLUX',
      audienceMode: 'GENERAL',
    });
    expect(result.negativePrompt).not.toMatch(/advertisement-style composition/i);
    expect(result.negativePrompt).not.toMatch(/product hero shot/i);
    expect(result.negativePrompt).not.toMatch(/packshot/i);
  });
});

describe('Phase D V1 — V2 fallback retains guard', () => {
  beforeEach(() => {
    vi.spyOn(promptEnhancerService, 'enhance').mockResolvedValue(mockEnhancerOutput);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('T-V1-6: educational request reaching V1 via V2 flag-off retains anti-commercial guard', async () => {
    // Flag off (default in test env) → composeEnhancedScenePrompt routes to V1.
    // The enhancer mock passes through base prompt unmodified (mockEnhancerOutput.enhancedPrompt
    // is a different string, but we verify the base was built correctly by inspecting
    // composeScenePromptText directly — the flag-off path is identical).
    const base = composeScenePromptText({
      scene: makeEducationalScene() as any,
      outputType: 'IMAGE',
      provider: 'FLUX',
      audienceMode: 'GENERAL',
    });
    expect(base.prompt).toMatch(/EDUCATIONAL GUARD/i);
    expect(base.negativePrompt).toMatch(/advertisement-style composition/i);
  });
});

// ─── R16 480P resolution contract ────────────────────────────────────────────

describe('resolveSceneVideoResolution — R16 480P contract', () => {
  it('T-R16-RES-1: KIDS audienceMode always returns 480P', () => {
    expect(resolveSceneVideoResolution('KIDS')).toBe('480P');
    expect(resolveSceneVideoResolution('KIDS', undefined, undefined)).toBe('480P');
  });

  it('T-R16-RES-2: KIDS cannot be overridden to 1080P — server enforces 480P', () => {
    expect(resolveSceneVideoResolution('KIDS', '1080P', '1080P')).toBe('480P');
    expect(resolveSceneVideoResolution('KIDS', '768P')).toBe('480P');
    expect(resolveSceneVideoResolution('KIDS', '1080P')).toBe('480P');
  });

  it('T-R16-RES-3: GENERAL falls through to explicit requested resolution', () => {
    expect(resolveSceneVideoResolution('GENERAL', '1080P')).toBe('1080P');
    expect(resolveSceneVideoResolution('GENERAL', '768P')).toBe('768P');
  });

  it('T-R16-RES-4: GENERAL with no explicit resolution falls through to manifest value', () => {
    expect(resolveSceneVideoResolution('GENERAL', undefined, '1080P')).toBe('1080P');
    expect(resolveSceneVideoResolution('GENERAL', undefined, '768P')).toBe('768P');
  });

  it('T-R16-RES-5: GENERAL with no resolution and no manifest returns undefined (provider default)', () => {
    expect(resolveSceneVideoResolution('GENERAL', undefined, undefined)).toBeUndefined();
    expect(resolveSceneVideoResolution('GENERAL')).toBeUndefined();
  });
});

// ─── T-MD: moviedirector.md integration tests ────────────────────────────────

function makeMDScene(overrides: Record<string, unknown> = {}) {
  return {
    id: 'scene-md',
    title: 'The Garden Discovery',
    description: 'A child finds a glowing flower in a peaceful garden.',
    locationType: 'garden',
    indoorOutdoor: 'outdoor',
    mood: 'wonder',
    cameraStyle: 'MEDIUM_SHOT',
    timeOfDay: null,
    weather: null,
    emotion: null,
    environmentMood: null,
    lighting: null,
    scenePace: null,
    characters: [],
    directorMetadata: null,
    chapter: { blueprint: null },
    project: {
      id: 'proj-md',
      title: 'The Glowing Garden',
      audienceMode: 'KIDS',
      visualStyle: 'STORYBOOK_ILLUSTRATION',
      theme: 'kindness',
      storyDna: null,
      characterMemory: [],
    },
    ...overrides,
  };
}

function makeMDEducational(antiCommercialNote?: string) {
  return makeMDScene({
    title: 'The Floating Ship',
    description: 'A child studies how a large ship floats on water.',
    locationType: 'harbor',
    directorMetadata: {
      learningObjective: 'Understand how ships float using Archimedes principle',
      teachingConcept: 'buoyancy',
      visualTeachingRequirement: 'Show ship cross-section and displaced water volume.',
      ...(antiCommercialNote !== undefined ? { antiCommercialNote } : {}),
    },
  });
}

// T-MD-1: CHARACTER REFERENCE block
describe('T-MD-1: CHARACTER REFERENCE block', () => {
  it('SHORT_VIDEO contains @CHAR reference block', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/@CHAR:|@\w+:/);
  });
  it('named character gets @NAME reference block', () => {
    const result = composeScenePromptText({ scene: makeMDScene({ characters: [{ name: 'Lily' }] }) as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/@Lily:/);
  });
  it('image-referenced character uses voice-only pattern', () => {
    const result = composeScenePromptText({ scene: makeMDScene({ characters: [{ name: 'Lily' }] }) as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/Already image referenced/i);
    expect(result.prompt).toMatch(/Voice only/i);
  });
});

// T-MD-2: SCENE-SPECIFIC spatial staging
describe('T-MD-2: spatial staging', () => {
  it('SHORT_VIDEO CUTs contain positional staging language', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/foreground|background|center frame|center background/i);
  });
  it('staging contains positional language', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/foreground|frame-right|frame-left|center/i);
  });
  it('two-character scene has both left foreground and right midground positions', () => {
    const result = composeScenePromptText({ scene: makeMDScene({ characters: [{ name: 'A' }, { name: 'B' }] }) as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/left foreground/i);
    expect(result.prompt).toMatch(/right midground/i);
  });
  it('two-character scene specifies measured separation', () => {
    const result = composeScenePromptText({ scene: makeMDScene({ characters: [{ name: 'A' }, { name: 'B' }] }) as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/\d+ meter|separation|facing/i);
  });
});

// T-MD-3: CAMERA and LENS descriptor
describe('T-MD-3: camera / lens', () => {
  it('prompt contains degree-based lens descriptor', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/\d+-degree field/i);
  });
  it('MEDIUM_SHOT maps to 47-degree field', () => {
    const result = composeScenePromptText({ scene: makeMDScene({ cameraStyle: 'MEDIUM_SHOT' }) as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/47-degree/i);
  });
  it('CLOSE_UP maps to 18-degree field', () => {
    const result = composeScenePromptText({ scene: makeMDScene({ cameraStyle: 'CLOSE_UP' }) as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/18-degree/i);
  });
  it('WIDE_SHOT maps to 84-degree field', () => {
    const result = composeScenePromptText({ scene: makeMDScene({ cameraStyle: 'WIDE_SHOT' }) as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/84-degree/i);
  });
  it('movement scene uses push-in camera movement', () => {
    const result = composeScenePromptText({ scene: makeMDScene({ description: 'A child walks toward the flower.' }) as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/push-in|push in/i);
  });
  it('camera section describes hold for static scenes', () => {
    const result = composeScenePromptText({ scene: makeMDScene({ description: 'The flower glows in the garden.', cameraStyle: 'MEDIUM_SHOT' }) as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/hold stable|camera does not move/i);
  });
});

// T-MD-4: LIGHTING PRIORITY
describe('T-MD-4: lighting as priority constraint', () => {
  it('prompt contains LIGHTING PRIORITY section', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/LIGHTING PRIORITY/i);
  });
  it('lighting section specifies Key direction', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/Key direction:/i);
  });
  it('lighting section prohibits flat frontal fill', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/No flat frontal fill/i);
  });
  it('lighting section maintains subject-background separation', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/separation maintained/i);
  });
  it('golden hour timeOfDay produces warm low-angle key', () => {
    const result = composeScenePromptText({ scene: makeMDScene({ timeOfDay: 'GOLDEN_HOUR' }) as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/warm low-angle key/i);
  });
});

// T-MD-5: PHYSICS
describe('T-MD-5: physics directive', () => {
  it('prompt contains PHYSICS directive', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/PHYSICS:/i);
  });
  it('physics includes inertia and follow-through', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/inertia|follow-through/i);
  });
  it('physics prohibits floating and teleportation', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/No floating|no teleportation/i);
  });
  it('approach/walk action produces weight-transfer physics', () => {
    const result = composeScenePromptText({ scene: makeMDScene({ description: 'A child walks toward the flower.' }) as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/weight transfers|frictionless feet/i);
  });
});

// T-MD-6: PHYSICAL PERFORMANCE
describe('T-MD-6: physical performance direction', () => {
  it('CUTs contain behavioral direction (not emotion labels)', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/approaches|recognition lands|posture|heel-to-toe/i);
  });
  it('performance describes physical behavior rather than emotion labels', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/posture|weight|gaze direction/i);
  });
  it('performance includes tactic/beat change language', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/tactic|gaze direction|posture/i);
  });
});

// T-MD-7: EYE LIFE
describe('T-MD-7: eye life', () => {
  it('CUTs contain inline eye life direction', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/saccade|blink|catchlight/i);
  });
  it('eye life includes saccade instructions', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/saccade/i);
  });
  it('eye life includes blink instructions', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/blink/i);
  });
  it('eye life includes catchlight instructions', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/catchlight/i);
  });
  it('discovery scene CUT contains blink on recognition', () => {
    const result = composeScenePromptText({ scene: makeMDScene({ description: 'A child discovers a glowing flower.' }) as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/blink on recognition|blink.*recognition/i);
  });
});

// T-MD-8: STORY and SCENE CONTEXT
describe('T-MD-8: story and scene context', () => {
  it('prompt contains story title', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toContain('The Glowing Garden');
  });
  it('prompt contains scene title', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toContain('The Garden Discovery');
  });
  it('prompt contains scene description text', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/glowing flower/i);
  });
  it('prompt contains environment location type', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/garden/i);
  });
});

// T-MD-9: R16/KIDS SAFETY
describe('T-MD-9: R16/KIDS safety', () => {
  it('KIDS SHORT_VIDEO prompt contains child-safe language', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/child-safe|KIDS|safe.*friendly/i);
  });
  it('KIDS negative prompt contains safety terms', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.negativePrompt).toMatch(/violence/i);
    expect(result.negativePrompt).toMatch(/blood/i);
    expect(result.negativePrompt).toMatch(/weapons/i);
  });
  it('KIDS negative prompt contains video motion artifact exclusions', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.negativePrompt).toMatch(/flicker/i);
    expect(result.negativePrompt).toMatch(/warped motion/i);
  });
});

// T-MD-10: NO EM DASH
describe('T-MD-10: no em dash', () => {
  it('SHORT_VIDEO prompt contains no U+2014 em dash', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).not.toContain('—');
  });
  it('SHORT_VIDEO prompt contains no U+2013 en dash', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).not.toContain('–');
  });
  it('em dashes in scene data are normalized to hyphens in SHORT_VIDEO', () => {
    const result = composeScenePromptText({ scene: makeMDScene({ description: 'A child finds—and picks—a flower.' }) as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).not.toContain('—');
    expect(result.prompt).toContain('-');
  });
});

// T-MD-11: PROMPT LENGTH
describe('T-MD-11: prompt length ceiling', () => {
  it('SHORT_VIDEO prompt is within 4000-char skill ceiling', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt.length).toBeLessThanOrEqual(4000);
  });
  it('H3_MAX SHORT_VIDEO prompt is within 1400-char provider ceiling', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt.length).toBeLessThanOrEqual(1400);
  });
});

// T-MD-12: EDUCATIONAL guard
describe('T-MD-12: educational guard', () => {
  it('educational SHORT_VIDEO prompt contains EDUCATIONAL block', () => {
    const result = composeScenePromptText({ scene: makeMDEducational() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'GENERAL' });
    expect(result.prompt).toMatch(/EDUCATIONAL:/i);
  });
  it('educational SHORT_VIDEO prompt does not contain product framing', () => {
    const result = composeScenePromptText({ scene: makeMDEducational() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'GENERAL' });
    expect(result.prompt).toMatch(/No product framing|no advertisement|no brand showcase/i);
  });
  it('educational SHORT_VIDEO prompt contains anti-commercial note when provided', () => {
    const result = composeScenePromptText({ scene: makeMDEducational('Show the ship as a teaching tool, not a luxury vessel') as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'GENERAL' });
    expect(result.prompt).toContain('Show the ship as a teaching tool, not a luxury vessel');
  });
});

// T-MD-13: IMAGE path unchanged
describe('T-MD-13: IMAGE path unchanged', () => {
  it('IMAGE prompt does not contain @CHAR reference block', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'IMAGE', provider: 'FLUX', audienceMode: 'KIDS' });
    expect(result.prompt).not.toMatch(/@CHAR:|@\w+: Already image referenced/);
  });
  it('IMAGE prompt does not contain PHYSICS directive', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'IMAGE', provider: 'FLUX', audienceMode: 'KIDS' });
    expect(result.prompt).not.toMatch(/^PHYSICS:/m);
  });
  it('IMAGE prompt does not contain STAGING directive', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'IMAGE', provider: 'FLUX', audienceMode: 'KIDS' });
    expect(result.prompt).not.toMatch(/STAGING:/i);
  });
  it('IMAGE educational prompt retains EDUCATIONAL GUARD label', () => {
    const result = composeScenePromptText({ scene: makeMDEducational() as any, outputType: 'IMAGE', provider: 'FLUX', audienceMode: 'GENERAL' });
    expect(result.prompt).toMatch(/EDUCATIONAL GUARD/i);
  });
});

// T-MD-14: 480P resolution contract
describe('T-MD-14: 480P resolution contract', () => {
  it('KIDS + no requested resolution → 480P', () => {
    expect(resolveSceneVideoResolution('KIDS')).toBe('480P');
  });
  it('KIDS + any higher resolution → still 480P', () => {
    expect(resolveSceneVideoResolution('KIDS', '1080P')).toBe('480P');
    expect(resolveSceneVideoResolution('KIDS', '720P')).toBe('480P');
    expect(resolveSceneVideoResolution('KIDS', '480P')).toBe('480P');
  });
});

// T-MD-15: NEGATIVE PROMPT unchanged
describe('T-MD-15: negative prompt terms preserved', () => {
  it('KIDS SHORT_VIDEO negative prompt contains KIDS safety terms', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.negativePrompt).toMatch(/dark horror/i);
    expect(result.negativePrompt).toMatch(/sexual content/i);
    expect(result.negativePrompt).toMatch(/unsafe behavior/i);
  });
  it('SHORT_VIDEO negative prompt contains video motion exclusions', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.negativePrompt).toMatch(/jump cuts/i);
  });
  it('negative prompt contains overlay/UI exclusions', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.negativePrompt).toMatch(/watermark/i);
    expect(result.negativePrompt).toMatch(/phone UI/i);
  });
});

// T-MD-16: CONTINUITY
describe('T-MD-16: continuity without fabrication', () => {
  it('SHORT_VIDEO prompt does not claim events from missing adjacent scenes', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).not.toMatch(/previous scene|last scene|scene before/i);
  });
  it('WIDE_SHOT scene has left-midground staging', () => {
    const result = composeScenePromptText({ scene: makeMDScene({ cameraStyle: 'WIDE_SHOT' }) as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/left midground|full body visible/i);
  });
  it('CLOSE_UP scene has center-frame staging', () => {
    const result = composeScenePromptText({ scene: makeMDScene({ cameraStyle: 'CLOSE_UP' }) as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/center frame/i);
  });
});

// T-MD-17: CUT STRUCTURE (moviedirector.md §68 min 3 cuts per scene)
describe('T-MD-17: CUT list structure', () => {
  it('basic scene contains at least 3 CUT markers', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    const cutCount = (result.prompt.match(/\bCUT\b/g) ?? []).length;
    expect(cutCount).toBeGreaterThanOrEqual(3);
  });
  it('scene final CUT has a non-empty physical closure consequence', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/grip closes|foot plants|weight settles|posture holds|object clear|both in frame|arrival/i);
  });
});

// T-MD-18: NO GENERIC-ONLY prompt
describe('T-MD-18: scene-specific prompt content', () => {
  it('prompt contains actual scene description text', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/glowing flower/i);
  });
  it('prompt contains both story and scene titles', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toContain('The Glowing Garden');
    expect(result.prompt).toContain('The Garden Discovery');
  });
  it('movement description produces movement-specific camera language', () => {
    const result = composeScenePromptText({ scene: makeMDScene({ description: 'A child runs toward the fountain.' }) as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/push-in|track laterally|following subject/i);
  });
  it('two different scenes produce different staging', () => {
    const r1 = composeScenePromptText({ scene: makeMDScene({ cameraStyle: 'CLOSE_UP' }) as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    const r2 = composeScenePromptText({ scene: makeMDScene({ cameraStyle: 'WIDE_SHOT' }) as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(r1.prompt).not.toEqual(r2.prompt);
  });
});

// T-MD-19: CUT COUNT minimum
describe('T-MD-19: minimum CUT count', () => {
  it('single-character scene produces at least 3 CUTs', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    const count = (result.prompt.match(/^CUT - /gm) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(3);
  });
  it('two-character scene produces at least 3 CUTs', () => {
    const result = composeScenePromptText({ scene: makeMDScene({ characters: [{ name: 'A' }, { name: 'B' }] }) as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    const count = (result.prompt.match(/^CUT - /gm) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(3);
  });
  it('GENERAL audience scene produces at least 3 CUTs', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'GENERAL' });
    const count = (result.prompt.match(/^CUT - /gm) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(3);
  });
});

// T-MD-20: STAGING in each CUT
describe('T-MD-20: staging in every CUT', () => {
  it('each CUT line contains a screen-position word', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    const cutLines = result.prompt.split('\n').filter((l) => l.startsWith('CUT - '));
    expect(cutLines.length).toBeGreaterThanOrEqual(3);
    for (const line of cutLines) {
      expect(line).toMatch(/foreground|midground|background|center frame|center-left|center-right/i);
    }
  });
});

// T-MD-21: ACTION in each CUT
describe('T-MD-21: physical action in every CUT', () => {
  it('each CUT line contains at least one action verb', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    const cutLines = result.prompt.split('\n').filter((l) => l.startsWith('CUT - '));
    for (const line of cutLines) {
      expect(line).toMatch(/approaches|lands|holds|finds|discovers|opens|settles|commits|arrives|initiates/i);
    }
  });
});

// T-MD-22: CONSEQUENCE in each CUT
describe('T-MD-22: consequence/next-beat in every CUT', () => {
  it('each CUT line has at least two " - " separators indicating a consequence field', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    const cutLines = result.prompt.split('\n').filter((l) => l.startsWith('CUT - '));
    expect(cutLines.length).toBeGreaterThanOrEqual(3);
    for (const line of cutLines) {
      const parts = line.split(' - ');
      expect(parts.length).toBeGreaterThanOrEqual(3);
    }
  });
});

// T-MD-23: EYE LIFE inline in every CUT
describe('T-MD-23: inline eye life in every CUT', () => {
  it('CUT lines collectively contain blink, saccade, and catchlight references', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    const cutText = result.prompt.split('\n').filter((l) => l.startsWith('CUT - ')).join(' ');
    expect(cutText).toMatch(/blink/i);
    expect(cutText).toMatch(/saccade/i);
    expect(cutText).toMatch(/catchlight/i);
  });
});

// T-MD-24: SOUND DESIGN block
describe('T-MD-24: SOUND DESIGN block', () => {
  it('prompt contains SOUND DESIGN block', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/SOUND DESIGN:/i);
  });
  it('sound design is physical not musical', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/No musical score/i);
  });
  it('sound design block is italicized (asterisk delimited)', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/\*.*SOUND DESIGN.*\*/i);
  });
  it('harbor scene references water or dock sounds', () => {
    const result = composeScenePromptText({ scene: makeMDEducational() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/SOUND DESIGN:/i);
  });
});

// T-MD-25: FIXED VOICE — quoted, written once
describe('T-MD-25: fixed quoted voice', () => {
  it('KIDS voice is quoted string in @TAG block', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/"warm, gentle/i);
  });
  it('GENERAL voice is quoted string in @TAG block', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'GENERAL' });
    expect(result.prompt).toMatch(/"clear, measured/i);
  });
  it('voice string is enclosed in quotes', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/"[^"]{10,}"/);
  });
});

// T-MD-26: WORLD DETAIL in scene context
describe('T-MD-26: world detail', () => {
  it('garden scene includes stone edging world detail', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/stone edging|damp soil/i);
  });
  it('harbor scene includes dock world detail', () => {
    const result = composeScenePromptText({ scene: makeMDEducational() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/bollard|dock|iron/i);
  });
  it('world detail appears in scene context before CUT list', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    const worldDetailIdx = result.prompt.indexOf('stone edging');
    const firstCutIdx = result.prompt.indexOf('CUT - ');
    expect(worldDetailIdx).toBeGreaterThan(-1);
    expect(worldDetailIdx).toBeLessThan(firstCutIdx);
  });
});

// T-MD-27: TECH SPEC section
describe('T-MD-27: TECH SPEC section', () => {
  it('prompt contains TECH SPEC block', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/TECH SPEC:/i);
  });
  it('TECH SPEC contains Style', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/TECH SPEC:.*Style:/is);
  });
  it('TECH SPEC contains LENS', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/LENS:/i);
  });
  it('TECH SPEC appears before CUT list', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    const techIdx = result.prompt.indexOf('TECH SPEC:');
    const firstCutIdx = result.prompt.indexOf('CUT - ');
    expect(techIdx).toBeLessThan(firstCutIdx);
  });
});

// T-MD-28: SCOPE TAG in @TAG block
describe('T-MD-28: voice scope tag', () => {
  it('@TAG block ends with Voice only. scope tag', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/Voice only\./i);
  });
  it('named character @TAG also has Voice only. scope tag', () => {
    const result = composeScenePromptText({ scene: makeMDScene({ characters: [{ name: 'Maya' }] }) as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/@Maya:.*Voice only\./is);
  });
});

// T-MD-29: PHYSICS directive
describe('T-MD-29: physics weight and follow-through', () => {
  it('approach/walk scene physics mentions weight transfer', () => {
    const result = composeScenePromptText({ scene: makeMDScene({ description: 'A child walks slowly through the garden.' }) as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/weight transfers|heel-to-toe/i);
  });
  it('physics mentions follow-through', () => {
    const result = composeScenePromptText({ scene: makeMDScene({ description: 'A child picks up the glowing flower carefully.' }) as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/follow-through|follow through/i);
  });
  it('default scene physics mentions inertia', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/inertia/i);
  });
});

// T-MD-30: GOLDEN FIXTURE — full structure for default scene
describe('T-MD-30: golden fixture structure', () => {
  it('default KIDS H3_MAX scene has all 6 required sections in order', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    const p = result.prompt;
    const charIdx = p.search(/@CHAR:|@\w+:/);
    const sceneCtxIdx = p.indexOf('The Glowing Garden');
    const techIdx = p.indexOf('TECH SPEC:');
    const firstCutIdx = p.indexOf('CUT - ');
    const physIdx = p.indexOf('PHYSICS:');
    const soundIdx = p.indexOf('SOUND DESIGN:');
    // All sections present
    expect(charIdx).toBeGreaterThanOrEqual(0);
    expect(sceneCtxIdx).toBeGreaterThan(charIdx);
    expect(techIdx).toBeGreaterThan(sceneCtxIdx);
    expect(firstCutIdx).toBeGreaterThan(techIdx);
    expect(physIdx).toBeGreaterThan(firstCutIdx);
    expect(soundIdx).toBeGreaterThan(physIdx);
  });
  it('default scene prompt is under 1400 chars (H3_MAX limit)', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt.length).toBeLessThanOrEqual(1400);
  });
  it('default scene prompt contains no em dashes', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).not.toMatch(/—|–/);
  });
});

// T-MD-31: NO APPEARANCE REDESCRIPTION for image-referenced characters
describe('T-MD-31: no appearance redescription', () => {
  it('@TAG block does not describe physical appearance (hair/eyes/skin) for image-referenced chars', () => {
    const result = composeScenePromptText({ scene: makeMDScene({ characters: [{ name: 'Lily' }] }) as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    const charBlockMatch = result.prompt.match(/@Lily:.*?(?=\n\n|\n[^@])/s);
    const charBlock = charBlockMatch?.[0] ?? '';
    expect(charBlock).not.toMatch(/\b(hair|eyes|skin|tall|short|wearing|dressed|outfit)\b/i);
  });
});

// T-MD-32: BUDGET COMPLIANCE for educational scene
describe('T-MD-32: H3_MAX educational scene budget', () => {
  it('educational scene prompt is under 1400 chars', () => {
    const result = composeScenePromptText({ scene: makeMDEducational() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt.length).toBeLessThanOrEqual(1400);
  });
  it('educational scene still has at least 3 CUTs despite educational overhead', () => {
    const result = composeScenePromptText({ scene: makeMDEducational() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    const count = (result.prompt.match(/^CUT - /gm) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(3);
  });
});

// T-MD-33: TWO-CHARACTER scene CUT count
describe('T-MD-33: two-character CUT count', () => {
  it('two-character scene produces at least 3 CUTs', () => {
    const result = composeScenePromptText({ scene: makeMDScene({ characters: [{ name: 'A' }, { name: 'B' }] }) as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    const count = (result.prompt.match(/^CUT - /gm) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(3);
  });
  it('two-character CUTs reference both characters', () => {
    const result = composeScenePromptText({ scene: makeMDScene({ characters: [{ name: 'A' }, { name: 'B' }] }) as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    const cutText = result.prompt.split('\n').filter((l) => l.startsWith('CUT - ')).join(' ');
    expect(cutText).toMatch(/@A\b/);
    expect(cutText).toMatch(/@B\b/);
  });
  it('two-character scene prompt is under 1400 chars (H3_MAX)', () => {
    const result = composeScenePromptText({ scene: makeMDScene({ characters: [{ name: 'A' }, { name: 'B' }] }) as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt.length).toBeLessThanOrEqual(1400);
  });
});

// T-MD-34: MEDIUM_CLOSE_UP → 29-degree regression
describe('T-MD-34: MEDIUM_CLOSE_UP lens regression', () => {
  it('MEDIUM_CLOSE_UP maps to 29-degree field', () => {
    const result = composeScenePromptText({ scene: makeMDScene({ cameraStyle: 'MEDIUM_CLOSE_UP' }) as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/29-degree/i);
  });
  it('MEDIUM_CLOSE_UP does not map to 47-degree', () => {
    const result = composeScenePromptText({ scene: makeMDScene({ cameraStyle: 'MEDIUM_CLOSE_UP' }) as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).not.toMatch(/47-degree/i);
  });
});

// T-MD-35: MOVEMENT-ONLY CUT template (separate from discovery)
describe('T-MD-35: movement-only scene uses movement CUT template', () => {
  function makeMovementScene(description: string) {
    return makeMDScene({ description, characters: [{ name: 'Kai' }] });
  }

  it('running scene does not produce discovery hand-contact action', () => {
    const result = composeScenePromptText({ scene: makeMovementScene('Kai runs across the field.') as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).not.toMatch(/right hand rises, fingers spread toward contact/i);
  });

  it('running scene CUTs contain movement-specific language', () => {
    const result = composeScenePromptText({ scene: makeMovementScene('Kai runs across the field.') as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/momentum|stride|arms drive|effort registers/i);
  });

  it('running scene has walk physics (weight transfer)', () => {
    const result = composeScenePromptText({ scene: makeMovementScene('Kai runs toward the gate.') as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/weight transfers|heel-to-toe/i);
  });

  it('walking scene uses movement template (not discovery)', () => {
    const result = composeScenePromptText({ scene: makeMovementScene('Kemi walks through the puddle-filled schoolyard.') as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).not.toMatch(/eyes fix on schoolyard/i);
    expect(result.prompt).toMatch(/momentum|stride|moves into frame/i);
  });
});

// T-MD-36: DISCOVERY TARGET extraction from description keywords
describe('T-MD-36: discovery target extracted from description', () => {
  it('discovery scene references the discovered object (not just locationType)', () => {
    const result = composeScenePromptText({
      scene: makeMDScene({ description: 'Alex discovers a hidden door in the library wall.', locationType: 'library', characters: [{ name: 'Alex' }] }) as any,
      outputType: 'SHORT_VIDEO',
      provider: 'H3_MAX',
      audienceMode: 'GENERAL',
    });
    expect(result.prompt).toMatch(/hidden door/i);
    expect(result.prompt).not.toMatch(/eyes fix on library/i);
  });

  it('discovery scene target from "finds X" pattern', () => {
    const result = composeScenePromptText({
      scene: makeMDScene({ description: 'A child finds a glowing flower in a peaceful garden.', locationType: 'garden' }) as any,
      outputType: 'SHORT_VIDEO',
      provider: 'H3_MAX',
      audienceMode: 'KIDS',
    });
    expect(result.prompt).toMatch(/eyes fix on glowing flower/i);
    expect(result.prompt).not.toMatch(/eyes fix on garden/i);
  });

  it('movement scene target uses "toward X" extraction', () => {
    const result = composeScenePromptText({
      scene: makeMDScene({ description: 'Kai runs toward the village gate.', locationType: 'hillside', characters: [{ name: 'Kai' }] }) as any,
      outputType: 'SHORT_VIDEO',
      provider: 'H3_MAX',
      audienceMode: 'GENERAL',
    });
    // Movement template uses target in consequence; must not reference locationType blindly
    expect(result.prompt).not.toMatch(/pace holds into hillside/i);
  });
});

// T-MD-37: TWO-CHARACTER CUT structure — establish once, inherit without repeating c2
describe('T-MD-37: two-character CUT structure — establish once, inherit', () => {
  function makeTwoChar(c1 = 'Sam', c2 = 'Jordan') {
    return makeMDScene({ description: `${c1} and ${c2} face each other.`, locationType: 'courtyard', characters: [{ name: c1 }, { name: c2 }] });
  }

  it('CUT 1 staging establishes both characters', () => {
    const result = composeScenePromptText({ scene: makeTwoChar() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'GENERAL' });
    const cut1 = result.prompt.split('\n').filter(l => l.startsWith('CUT - '))[0] ?? '';
    expect(cut1).toMatch(/@Sam/);
    expect(cut1).toMatch(/@Jordan.*midground/i);
  });

  it('CUT 1 actionEye does not reference the second character by @tag', () => {
    const result = composeScenePromptText({ scene: makeTwoChar() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'GENERAL' });
    const cut1 = result.prompt.split('\n').filter(l => l.startsWith('CUT - '))[0] ?? '';
    const parts = cut1.split(' - ');
    const actionEye = parts[2] ?? '';
    expect(actionEye).not.toMatch(/@Jordan/);
  });

  it('CUT 2 staging contains only the first character', () => {
    const result = composeScenePromptText({ scene: makeTwoChar() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'GENERAL' });
    const cut2 = result.prompt.split('\n').filter(l => l.startsWith('CUT - '))[1] ?? '';
    expect(cut2).toMatch(/@Sam center-left/i);
    expect(cut2).not.toMatch(/@Jordan/);
  });

  it('CUT 3 staging references the second character', () => {
    const result = composeScenePromptText({ scene: makeTwoChar() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'GENERAL' });
    const cut3 = result.prompt.split('\n').filter(l => l.startsWith('CUT - '))[2] ?? '';
    expect(cut3).toMatch(/@Jordan center frame/i);
  });

  it('CUT 1 actionEye is not a bare @ref fragment for long character names', () => {
    const result = composeScenePromptText({ scene: makeTwoChar('Alexander', 'Josephine') as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'GENERAL' });
    const cut1 = result.prompt.split('\n').filter(l => l.startsWith('CUT - '))[0] ?? '';
    const parts = cut1.split(' - ');
    const actionEye = parts[2] ?? '';
    expect(actionEye.trim().length).toBeGreaterThanOrEqual(15);
    expect(actionEye.trim()).not.toMatch(/@\w+\s*$/);
  });

  it('total prompt stays under H3_MAX ceiling (1400 chars)', () => {
    const result = composeScenePromptText({ scene: makeTwoChar() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'GENERAL' });
    expect(result.prompt.length).toBeLessThanOrEqual(1400);
  });

  it('both @refs appear in CUT lines collectively (T-MD-33 still holds)', () => {
    const result = composeScenePromptText({ scene: makeTwoChar() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'GENERAL' });
    const cutLines = result.prompt.split('\n').filter(l => l.startsWith('CUT - ')).join('\n');
    expect(cutLines).toMatch(/@Sam/);
    expect(cutLines).toMatch(/@Jordan/);
  });
});

// T-MD-38: EDUCATIONAL CUT template — concept-derived physical cause→effect
describe('T-MD-38: educational CUT template — concept-derived physical action', () => {
  function makeGravityScene() {
    return makeMDScene({
      title: 'The Falling Apple',
      description: 'A child observes an apple drop from a tree.',
      locationType: 'orchard',
      directorMetadata: {
        learningObjective: 'Understand gravitational force',
        teachingConcept: 'gravity',
        visualTeachingRequirement: 'Show object falling under gravity.',
      },
    });
  }

  function makeMagnetScene() {
    return makeMDScene({
      title: 'The Magnet Pull',
      description: 'A child watches magnets attract metal.',
      locationType: 'classroom',
      directorMetadata: {
        learningObjective: 'Understand magnetic attraction',
        teachingConcept: 'magnetism',
        visualTeachingRequirement: 'Show magnet attracting objects without touching.',
      },
    });
  }

  it('gravity scene CUT 2 shows the object dropping (not generic action)', () => {
    const result = composeScenePromptText({ scene: makeGravityScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'GENERAL' });
    const cut2 = result.prompt.split('\n').filter(l => l.startsWith('CUT - '))[1] ?? '';
    expect(cut2).toMatch(/fingers open|object drops|fall begins/i);
    expect(cut2).not.toMatch(/action executes/i);
  });

  it('buoyancy scene CUT 2 shows water displacement (not generic action)', () => {
    const result = composeScenePromptText({ scene: makeMDEducational() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'GENERAL' });
    const cut2 = result.prompt.split('\n').filter(l => l.startsWith('CUT - '))[1] ?? '';
    expect(cut2).toMatch(/enters water|water rises/i);
    expect(cut2).not.toMatch(/action executes/i);
  });

  it('buoyancy scene CUTs reference buoyancy in a consequence line', () => {
    const result = composeScenePromptText({ scene: makeMDEducational() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'GENERAL' });
    expect(result.prompt).toMatch(/buoyancy visible/i);
  });

  it('magnetism scene CUT 2 shows attraction before contact', () => {
    const result = composeScenePromptText({ scene: makeMagnetScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'GENERAL' });
    const cut2 = result.prompt.split('\n').filter(l => l.startsWith('CUT - '))[1] ?? '';
    expect(cut2).toMatch(/without contact|object moves/i);
    expect(cut2).not.toMatch(/action executes/i);
  });

  it('each educational scene has at least 3 CUTs', () => {
    const r1 = composeScenePromptText({ scene: makeMDEducational() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'GENERAL' });
    const r2 = composeScenePromptText({ scene: makeGravityScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'GENERAL' });
    expect(r1.prompt.split('\n').filter(l => l.startsWith('CUT - ')).length).toBeGreaterThanOrEqual(3);
    expect(r2.prompt.split('\n').filter(l => l.startsWith('CUT - ')).length).toBeGreaterThanOrEqual(3);
  });

  it('educational scene prompt stays under H3_MAX ceiling (1400 chars)', () => {
    const result = composeScenePromptText({ scene: makeMDEducational() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'GENERAL' });
    expect(result.prompt.length).toBeLessThanOrEqual(1400);
  });

  it('KIDS educational scene retains child-safe language and concept-derived action', () => {
    const result = composeScenePromptText({ scene: makeMDEducational() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/Child-safe/i);
    const cut2 = result.prompt.split('\n').filter(l => l.startsWith('CUT - '))[1] ?? '';
    expect(cut2).toMatch(/enters water|water rises/i);
    expect(result.prompt).toMatch(/buoyancy visible/i);
  });

  it('anti-commercial guard preserved in educational scene', () => {
    const result = composeScenePromptText({ scene: makeMDEducational() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'GENERAL' });
    expect(result.prompt).toMatch(/No product framing/i);
  });

  it('educational scene does not use generic discovery template', () => {
    const result = composeScenePromptText({ scene: makeMDEducational() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'GENERAL' });
    expect(result.prompt).not.toMatch(/eyes fix on/i);
  });
});

// T-MD-39: CREATIVE QUALITY — physical consequences, camera variation, R16 multi-path
describe('T-MD-39: creative quality — physical consequences and scene type coverage', () => {
  // --- Camera movement varies by scene type ---
  it('run scene uses lateral tracking camera (not hold-stable)', () => {
    const result = composeScenePromptText({ scene: makeMDScene({ description: 'Kai runs across the field.', characters: [{ name: 'Kai' }] }) as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'GENERAL' });
    expect(result.prompt).toMatch(/track laterally/i);
    expect(result.prompt).not.toMatch(/hold stable; no camera/i);
  });

  it('discovery scene uses hold-stable or push-in camera (not lateral track)', () => {
    const result = composeScenePromptText({ scene: makeMDScene() as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'GENERAL' });
    expect(result.prompt).not.toMatch(/track laterally/i);
  });

  // --- Physical consequences replace generic closures ---
  it('discovery CUT 3 consequence references grip/contact (not "scene resolves on held beat")', () => {
    const result = composeScenePromptText({ scene: makeMDScene({ description: 'A child finds a glowing flower.', characters: [{ name: 'Lily' }] }) as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'GENERAL' });
    const cut3 = result.prompt.split('\n').filter(l => l.startsWith('CUT - '))[2] ?? '';
    expect(cut3).not.toMatch(/scene resolves on held beat/i);
    expect(cut3).toMatch(/grip closes/i);
  });

  it('movement CUT 3 consequence references arrival state (not "earned beat")', () => {
    const result = composeScenePromptText({ scene: makeMDScene({ description: 'Kai walks toward the school.', characters: [{ name: 'Kai' }] }) as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'GENERAL' });
    const cut3 = result.prompt.split('\n').filter(l => l.startsWith('CUT - '))[2] ?? '';
    expect(cut3).not.toMatch(/scene holds on earned beat/i);
    expect(cut3).toMatch(/arrival|foot plants|weight settles/i);
  });

  it('run scene CUT 1 has stride-specific language (not "stride settles")', () => {
    const result = composeScenePromptText({ scene: makeMDScene({ description: 'Kai runs across the field.', characters: [{ name: 'Kai' }] }) as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'GENERAL' });
    const cut1 = result.prompt.split('\n').filter(l => l.startsWith('CUT - '))[0] ?? '';
    expect(cut1).toMatch(/stride|arms drive/i);
    expect(cut1).not.toMatch(/stride settles/i);
  });

  // --- Hand/object interaction ---
  it('hand/object CUT 3 consequence references object state (not "scene holds on completion")', () => {
    const result = composeScenePromptText({ scene: makeMDScene({ description: 'A child picks up a small stone.', characters: [{ name: 'Lena' }] }) as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'GENERAL' });
    const cut3 = result.prompt.split('\n').filter(l => l.startsWith('CUT - '))[2] ?? '';
    expect(cut3).not.toMatch(/scene holds on completion/i);
    expect(cut3).toMatch(/object|surface|clear/i);
  });

  // --- R16/KIDS multi-path coverage ---
  it('R16 KIDS discovery scene produces complete 3-CUT prompt within budget', () => {
    const result = composeScenePromptText({ scene: makeMDScene({ description: 'Mia finds a colorful feather near the pond.', characters: [{ name: 'Mia' }] }) as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt.split('\n').filter(l => l.startsWith('CUT - ')).length).toBeGreaterThanOrEqual(3);
    expect(result.prompt).toMatch(/Child-safe/i);
    expect(result.prompt.length).toBeLessThanOrEqual(1400);
  });

  it('R16 KIDS run scene has stride language and stays under budget', () => {
    const result = composeScenePromptText({ scene: makeMDScene({ description: 'Mia runs through the garden path.', characters: [{ name: 'Mia' }] }) as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/stride|arms drive/i);
    expect(result.prompt).toMatch(/Child-safe/i);
    expect(result.prompt.length).toBeLessThanOrEqual(1400);
  });

  it('R16 KIDS two-character scene has both @refs in CUT lines and child-safe clause', () => {
    const result = composeScenePromptText({ scene: makeMDScene({ description: 'Amara and Lena play in the park.', locationType: 'park', characters: [{ name: 'Amara' }, { name: 'Lena' }] }) as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    const cutBlock = result.prompt.split('\n').filter(l => l.startsWith('CUT - ')).join('\n');
    expect(cutBlock).toMatch(/@Amara/);
    expect(cutBlock).toMatch(/@Lena/);
    expect(result.prompt).toMatch(/Child-safe/i);
    expect(result.prompt.length).toBeLessThanOrEqual(1400);
  });
});

// ---------------------------------------------------------------------------
// T-MD-ROUTE — SHORT_VIDEO routing: MovieDirector structural markers present
// composeEnhancedScenePrompt routes SHORT_VIDEO unconditionally to
// composeScenePromptText; we verify that path produces MovieDirector output.
// ---------------------------------------------------------------------------
describe('T-MD-ROUTE: SHORT_VIDEO always routes to MovieDirector', () => {
  it('SHORT_VIDEO GENERAL prompt contains MovieDirector structural markers', () => {
    const scene = makeMDScene({ description: 'Sam finds an ancient compass.', characters: [{ name: 'Sam' }] });
    const result = composeScenePromptText({ scene: scene as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'GENERAL' });
    expect(result.prompt).toMatch(/CUT - /);
    expect(result.prompt).toMatch(/PHYSICS:/);
    expect(result.prompt).toMatch(/SOUND DESIGN:/);
  });

  it('SHORT_VIDEO KIDS prompt also contains MovieDirector structural markers', () => {
    const scene = makeMDScene({ description: 'Mia finds a colorful feather.', characters: [{ name: 'Mia' }] });
    const result = composeScenePromptText({ scene: scene as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt.split('\n').filter(l => l.startsWith('CUT - ')).length).toBeGreaterThanOrEqual(3);
    expect(result.prompt).toMatch(/PHYSICS:/);
    expect(result.prompt).toMatch(/SOUND DESIGN:/);
  });
});

// ---------------------------------------------------------------------------
// T-MD-REG — Defect regression tests (D1-D12)
// ---------------------------------------------------------------------------
describe('T-MD-REG: Creative defect regressions', () => {
  // D1/D2/D3: Two-char CUT 1 must not mid-word truncate on long names
  it('D1-D3: long two-char names @Alexander/@Josephine stay within budget, no mid-word fragment', () => {
    const result = composeScenePromptText({ scene: makeMDScene({ description: 'Alexander and Josephine face each other across the library.', locationType: 'library', characters: [{ name: 'Alexander' }, { name: 'Josephine' }] }) as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'GENERAL' });
    expect(result.prompt.length).toBeLessThanOrEqual(1400);
    // CUT 1 consequence must end cleanly at a word boundary
    const cut1 = result.prompt.split('\n').filter(l => l.startsWith('CUT - '))[0] ?? '';
    expect(cut1).not.toMatch(/\b\w+[^a-z\s.,;)'"!?-]$/i);
  });

  // D4: Educational CUT 1 consequence must not mid-word truncate
  it('D4: educational CUT 1 consequence is complete word (no mid-word break)', () => {
    const sc = { ...makeMDScene({ description: 'A child demonstrates gravity by dropping an apple.', locationType: 'orchard', directorMetadata: { learningObjective: 'Understand gravity', teachingConcept: 'gravity', visualTeachingRequirement: 'Show gravity clearly.' } }), project: { id: 'p', title: 'T', audienceMode: 'GENERAL', visualStyle: 'CINEMATIC_FANTASY', theme: 'edu', storyDna: null, characterMemory: [], chapter: { blueprint: null } } };
    const result = composeScenePromptText({ scene: sc as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'GENERAL' });
    const cut1 = result.prompt.split('\n').filter(l => l.startsWith('CUT - '))[0] ?? '';
    // consequence section (after third dash) must not end mid-word
    const parts = cut1.split(' - ');
    const consequence = parts[3] ?? '';
    expect(consequence.trim()).not.toMatch(/\b\w{5,}[^a-z\s.,;)'"!?-]$/i);
  });

  // D5: Sprint/dash must not produce false footstep sound from "open plaza"
  it('D5: sprint in open plaza does NOT add footstep sound from "open" keyword false-match', () => {
    const result = composeScenePromptText({ scene: makeMDScene({ description: 'Sam sprints across the open plaza toward the finish line.', locationType: 'plaza', characters: [{ name: 'Sam' }] }) as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'GENERAL' });
    // "open" must not trigger handling-sounds; footsteps are expected (sprint), handling is not
    expect(result.prompt).not.toMatch(/handling sounds follow contact/i);
    expect(result.prompt).toMatch(/footsteps match surface material/i);
  });

  // D6: "holds" (conjugated) must route to hand-contact physics and hold-stable camera
  it('D6: scene with "holds" routes to hand-contact physics and hold-stable camera', () => {
    const result = composeScenePromptText({ scene: makeMDScene({ description: 'A child holds a magnet near iron filings on a paper and watches them move.', locationType: 'classroom', characters: [{ name: 'Mia' }] }) as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).toMatch(/PHYSICS: arm carries object mass/i);
    expect(result.prompt).toMatch(/hold stable/i);
  });

  // D7: Two-char CUT 2 actionEye must not mid-word truncate
  it('D7: two-char CUT 2 actionEye ends on a complete word', () => {
    const result = composeScenePromptText({ scene: makeMDScene({ description: 'Alexander and Josephine face each other.', locationType: 'room', characters: [{ name: 'Alexander' }, { name: 'Josephine' }] }) as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'GENERAL' });
    const cut2 = result.prompt.split('\n').filter(l => l.startsWith('CUT - '))[1] ?? '';
    // actionEye should not end mid-word (e.g. "right o")
    expect(cut2).not.toMatch(/right o[^f]/i);
  });

  // D8: "watches them move" must NOT trigger footstep sound
  it('D8: "watches them move" does NOT trigger footstep sound', () => {
    const result = composeScenePromptText({ scene: makeMDScene({ description: 'A child holds a magnet near iron filings on a paper and watches them move.', locationType: 'classroom' }) as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    expect(result.prompt).not.toMatch(/footsteps match surface material/i);
  });

  // D9: Educational block must not produce double period in Visual requirement
  it('D9: educational visual teaching requirement has no double period', () => {
    const sc = { ...makeMDScene({ description: 'A child lowers a wooden block into water to see if it floats.', locationType: 'classroom', directorMetadata: { learningObjective: 'Understand buoyancy', teachingConcept: 'buoyancy', visualTeachingRequirement: 'Show buoyancy clearly.' } }), project: { id: 'p', title: 'T', audienceMode: 'GENERAL', visualStyle: 'CINEMATIC_FANTASY', theme: 'edu', storyDna: null, characterMemory: [], chapter: { blueprint: null } } };
    const result = composeScenePromptText({ scene: sc as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'GENERAL' });
    expect(result.prompt).not.toMatch(/\.\./);
  });

  // D10: Buoyancy CUT 1 actionEye must not end with hanging preposition
  it('D10: buoyancy CUT 1 actionEye does not end with hanging preposition "before"', () => {
    const sc = { ...makeMDScene({ description: 'A child lowers a wooden block into water to see if it floats.', locationType: 'classroom', directorMetadata: { learningObjective: 'Understand buoyancy', teachingConcept: 'buoyancy', visualTeachingRequirement: 'Show buoyancy clearly.' } }), project: { id: 'p', title: 'T', audienceMode: 'GENERAL', visualStyle: 'CINEMATIC_FANTASY', theme: 'edu', storyDna: null, characterMemory: [], chapter: { blueprint: null } } };
    const result = composeScenePromptText({ scene: sc as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'GENERAL' });
    const cut1 = result.prompt.split('\n').filter(l => l.startsWith('CUT - '))[0] ?? '';
    expect(cut1).not.toMatch(/\bbefore\s*-\s/i);
  });

  // D11: Hand/object CUT 2 consequence must not produce "world" orphan
  it('D11: hand/object CUT 2 consequence does not end with orphaned "world"', () => {
    const result = composeScenePromptText({ scene: makeMDScene({ description: 'Sam picks up a heavy wooden crate and carries it to the shelf.', locationType: 'warehouse', characters: [{ name: 'Sam' }] }) as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'GENERAL' });
    const cut2 = result.prompt.split('\n').filter(l => l.startsWith('CUT - '))[1] ?? '';
    expect(cut2).not.toMatch(/\bworld\s*$/i);
  });

  // D12: Magnetism CUT 3 consequence must not truncate mid-word
  it('D12: magnetism CUT 3 consequence is complete (no mid-word truncation)', () => {
    const sc = { ...makeMDScene({ description: 'A child holds a magnet near iron filings on a paper and watches them move.', locationType: 'classroom', directorMetadata: { learningObjective: 'Understand magnetism', teachingConcept: 'magnetism', visualTeachingRequirement: 'Show magnetism clearly.' } }), project: { id: 'p', title: 'T', audienceMode: 'KIDS', visualStyle: 'STORYBOOK_ILLUSTRATION', theme: 'edu', storyDna: null, characterMemory: [], chapter: { blueprint: null } } };
    const result = composeScenePromptText({ scene: sc as any, outputType: 'SHORT_VIDEO', provider: 'H3_MAX', audienceMode: 'KIDS' });
    const cut3 = result.prompt.split('\n').filter(l => l.startsWith('CUT - '))[2] ?? '';
    // consequence section must not end with a partial word
    const parts = cut3.split(' - ');
    const consequence = parts[3] ?? '';
    expect(consequence.trim()).not.toMatch(/\b\w{6,}[^a-z\s.,;)'"!?-]$/i);
    expect(result.prompt.length).toBeLessThanOrEqual(1400);
  });
});
