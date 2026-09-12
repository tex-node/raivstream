import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { composeEnhancedScenePrompt } from '../story';
import { promptEnhancerService, type PromptEnhancerOutput } from '../../lib/promptEnhancerService';
import type { StoryBlueprint } from '../../lib/storyIntelligence';

/**
 * VPC-2 blueprint continuity threading regression suite.
 *
 * Story Intelligence Phase A persists a `StoryBlueprint` on `StoryChapter.blueprint`.
 * VPC-2 previously hardcoded `blueprint = null` at the composition call site, so
 * blueprint continuity rules never reached the deterministic composer. These tests
 * pin the narrow adapter: the persisted blueprint is parsed with the existing Phase A
 * Zod schema and threaded through `scene.chapter.blueprint`, while null/malformed
 * legacy JSON degrades safely and the flag-off V1 path is untouched.
 */

const FLAG = 'VISUAL_PROMPT_COMPOSER_V2_ENABLED';

type PromptInput = Parameters<typeof composeEnhancedScenePrompt>[1];
type CanonicalView = {
  continuity: string[];
  renderedPrompt: string;
  renderedNegativePrompt: string;
  audienceMode: string;
};

function validBlueprint(): StoryBlueprint {
  return {
    version: 'story_blueprint_v1',
    premise: 'Amadi overcomes first-day nerves and makes a friend.',
    genre: 'children',
    tone: 'warm',
    theme: 'courage',
    audience: 'kids',
    protagonist: { name: 'Amadi', goal: 'make a friend', motivation: 'belong', flaw: 'shy' },
    supportingCharacters: [{ name: 'Tobi', role: 'best friend' }],
    setting: 'a village school',
    conflict: 'Amadi is nervous about his first day.',
    stakes: 'He may spend the day alone.',
    emotionalArc: 'fear to confidence',
    beats: [
      { label: 'Home', description: 'Amadi leaves home.' },
      { label: 'School', description: 'Amadi reaches the school gate.' },
      { label: 'Friend', description: 'Amadi makes a friend.' },
    ],
    continuityRules: ['Amadi always wears his red school uniform', 'Amadi carries a blue backpack'],
  };
}

function makeInput(
  chapter: PromptInput['scene']['chapter'],
  audienceMode: PromptInput['audienceMode'] = 'GENERAL',
): PromptInput {
  return {
    scene: {
      id: 'scene-1',
      title: 'The First Day of School',
      description: 'Amadi walks through the school gate clutching his blue backpack.',
      locationType: 'school gate',
      indoorOutdoor: 'outdoor',
      cameraStyle: 'MEDIUM_SHOT',
      chapter,
      project: {
        title: 'Amadi Goes to School',
        audienceMode,
        visualStyle: 'STORYBOOK_ILLUSTRATION',
        theme: 'courage',
        characterMemory: [
          {
            id: 'char-1',
            name: 'Amadi',
            role: 'main character',
            species: 'Human',
            ageDescription: '8 years old',
            gender: 'male',
            visualDescription: 'Amadi is a boy wearing a red school uniform and a blue backpack.',
          },
        ],
      },
    },
    outputType: 'IMAGE',
    provider: 'FLUX',
    audienceMode,
    projectId: 'project-1',
    analyticsSource: 'preview',
  };
}

function makeCtx() {
  return {
    prisma: { analyticsEvent: { create: async () => ({}) } },
    user: { id: 'user-1' },
    isR16: false,
  };
}

const enhancerOutput: PromptEnhancerOutput = {
  enhancedPrompt: 'ENHANCED_PROMPT',
  negativePrompt: 'ENHANCED_NEGATIVE',
  safetyNotes: 'safe',
  styleUsed: 'STORYBOOK_ILLUSTRATION',
  providerHints: { camera: 'camera', lighting: 'lighting', composition: 'composition' },
  provider: 'deterministic-fallback',
};

describe('VPC-2 blueprint continuity threading', () => {
  beforeEach(() => {
    vi.spyOn(promptEnhancerService, 'enhance').mockResolvedValue(enhancerOutput);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env[FLAG];
  });

  it('threads a valid persisted StoryChapter blueprint into V2 composition', async () => {
    process.env[FLAG] = 'true';
    const out = await composeEnhancedScenePrompt(makeCtx(), makeInput({ blueprint: validBlueprint() }));

    expect(out.isV2).toBe(true);
    const canonical = out.v2Canonical as CanonicalView;
    expect(canonical.continuity.join(' ')).toMatch(/red school uniform/i);
    expect(canonical.continuity.join(' ')).toMatch(/blue backpack/i);
  });

  it('includes blueprint continuity rules in the rendered V2 prompt when present', async () => {
    process.env[FLAG] = 'true';
    const out = await composeEnhancedScenePrompt(makeCtx(), makeInput({ blueprint: validBlueprint() }));

    const canonical = out.v2Canonical as CanonicalView;
    expect(canonical.renderedPrompt).toMatch(/red school uniform/i);
    expect(out.deterministicPrompt).toMatch(/red school uniform/i);
  });

  it('supports a null blueprint', async () => {
    process.env[FLAG] = 'true';
    const out = await composeEnhancedScenePrompt(makeCtx(), makeInput({ blueprint: null }));

    expect(out.isV2).toBe(true);
    const canonical = out.v2Canonical as CanonicalView;
    expect(canonical.continuity.join(' ')).not.toMatch(/red school uniform/i);
    expect(canonical.continuity.join(' ')).toMatch(/preserve exact visual identity/i);
  });

  it('composes for an old project with no chapter or blueprint', async () => {
    process.env[FLAG] = 'true';
    const out = await composeEnhancedScenePrompt(makeCtx(), makeInput(undefined));

    expect(out.isV2).toBe(true);
    const canonical = out.v2Canonical as CanonicalView;
    expect(canonical.continuity.join(' ')).not.toMatch(/red school uniform/i);
    expect(canonical.renderedPrompt.length).toBeGreaterThan(0);
  });

  it('fails safe to null when persisted blueprint JSON is malformed', async () => {
    process.env[FLAG] = 'true';

    const wrongShape = await composeEnhancedScenePrompt(
      makeCtx(),
      makeInput({ blueprint: { version: 'unknown_version', nope: true } }),
    );
    expect(wrongShape.isV2).toBe(true);
    expect((wrongShape.v2Canonical as CanonicalView).continuity.join(' ')).not.toMatch(/red school uniform/i);

    const nonObject = await composeEnhancedScenePrompt(
      makeCtx(),
      makeInput({ blueprint: 'not-a-valid-blueprint' }),
    );
    expect(nonObject.isV2).toBe(true);
    expect((nonObject.v2Canonical as CanonicalView).continuity.join(' ')).not.toMatch(/red school uniform/i);
  });

  it('preserves V1 behavior when the VPC-2 flag is off', async () => {
    delete process.env[FLAG];
    const out = await composeEnhancedScenePrompt(makeCtx(), makeInput({ blueprint: validBlueprint() }));

    expect(out.isV2).toBeUndefined();
    expect(out.v2Canonical).toBeUndefined();
  });

  it('keeps KIDS/R16 composition unchanged when a blueprint is present', async () => {
    process.env[FLAG] = 'true';
    const out = await composeEnhancedScenePrompt(
      makeCtx(),
      makeInput({ blueprint: validBlueprint() }, 'KIDS'),
    );

    expect(out.isV2).toBe(true);
    const canonical = out.v2Canonical as CanonicalView;
    expect(canonical.audienceMode).toBe('KIDS');
    expect(canonical.renderedNegativePrompt).toMatch(/violence/i);
    expect(canonical.renderedNegativePrompt).toMatch(/subtitle bar/i);
  });

  it('does not touch any credit or billing path', async () => {
    process.env[FLAG] = 'true';
    const creditBalance = { updateMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() };
    const creditTransaction = { create: vi.fn() };
    const ctx = {
      prisma: {
        analyticsEvent: { create: async () => ({}) },
        creditBalance,
        creditTransaction,
      },
      user: { id: 'user-1' },
      isR16: false,
    };

    await composeEnhancedScenePrompt(ctx, makeInput({ blueprint: validBlueprint() }));

    expect(creditBalance.updateMany).not.toHaveBeenCalled();
    expect(creditBalance.findUnique).not.toHaveBeenCalled();
    expect(creditTransaction.create).not.toHaveBeenCalled();
  });
});
