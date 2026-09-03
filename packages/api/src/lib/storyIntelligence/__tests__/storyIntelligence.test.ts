import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  storyBlueprintSchema,
  directedSceneSchema,
  StoryIntelligenceError,
  isStoryIntelligenceEnabled,
  type StoryBlueprint,
  type DirectedScene,
} from '../types';
import { LocalStoryIntelligenceProvider } from '../localStoryIntelligenceProvider';
import { OpenAIStoryIntelligenceProvider } from '../openAIStoryIntelligenceProvider';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const kidsIdea = 'A puppy named Biscuit wants to find his missing ball';
const generalIdea = 'Amara, a young girl from Lagos, learns to read';

const minimalBlueprint: StoryBlueprint = {
  version: 'story_blueprint_v1',
  premise: 'A puppy goes on an adventure to find his ball.',
  conflict: 'The ball rolled into a strange garden.',
  protagonist: { name: 'Biscuit', goal: 'find the ball', motivation: 'loves playing fetch' },
  supportingCharacters: [],
  continuityRules: ['Biscuit is small with floppy ears.'],
  beats: [
    { label: 'Beginning', description: 'Biscuit notices the ball is gone.' },
    { label: 'Search', description: 'Biscuit sniffs around the neighbourhood.' },
    { label: 'Discovery', description: 'Biscuit finds the strange garden.' },
    { label: 'Challenge', description: 'A grumpy cat blocks the way.' },
    { label: 'Resolution', description: 'Biscuit makes friends with the cat.' },
    { label: 'Ending', description: 'Biscuit returns home with the ball.' },
  ],
};

// ─── Blueprint schema ─────────────────────────────────────────────────────────

describe('storyBlueprintSchema', () => {
  it('accepts a valid minimal blueprint', () => {
    const result = storyBlueprintSchema.safeParse(minimalBlueprint);
    expect(result.success).toBe(true);
  });

  it('rejects wrong version literal', () => {
    const bad = { ...minimalBlueprint, version: 'blueprint_v2' };
    const result = storyBlueprintSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects too few beats (minimum 3)', () => {
    const bad = { ...minimalBlueprint, beats: minimalBlueprint.beats.slice(0, 2) };
    const result = storyBlueprintSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects more than 8 beats', () => {
    const tooMany = Array.from({ length: 9 }, (_, i) => ({ label: `Beat ${i}`, description: 'desc' }));
    const bad = { ...minimalBlueprint, beats: tooMany };
    const result = storyBlueprintSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects missing conflict', () => {
    const { conflict: _, ...noConflict } = minimalBlueprint;
    const result = storyBlueprintSchema.safeParse(noConflict);
    expect(result.success).toBe(false);
  });

  it('defaults supportingCharacters to [] when omitted', () => {
    const { supportingCharacters: _, ...withoutChars } = minimalBlueprint;
    const result = storyBlueprintSchema.safeParse(withoutChars);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.supportingCharacters).toEqual([]);
  });
});

// ─── directedSceneSchema ──────────────────────────────────────────────────────

describe('directedSceneSchema', () => {
  const validScene: DirectedScene = {
    version: 'scene_director_v1',
    ordinal: 1,
    title: 'The Missing Ball',
    storyBeat: 'Beginning',
    dramaticPurpose: 'Establish the problem',
    characters: ['Biscuit'],
    action: 'Biscuit sniffs the empty spot where the ball used to be.',
  };

  it('accepts a valid minimal scene', () => {
    expect(directedSceneSchema.safeParse(validScene).success).toBe(true);
  });

  it('rejects wrong version literal', () => {
    const bad = { ...validScene, version: 'scene_v2' };
    expect(directedSceneSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects ordinal below 1', () => {
    const bad = { ...validScene, ordinal: 0 };
    expect(directedSceneSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects title over 120 chars', () => {
    const bad = { ...validScene, title: 'x'.repeat(121) };
    expect(directedSceneSchema.safeParse(bad).success).toBe(false);
  });

  it('accepts all optional fields when present', () => {
    const full: DirectedScene = {
      ...validScene,
      location: 'Garden gate',
      timeOfDay: 'Morning',
      emotion: 'Curious',
      keyDialogue: '"Where are you, ball?"',
      visualFocus: 'Biscuit nose to ground',
      cameraIntent: 'low angle tracking',
      lightingIntent: 'warm morning light',
      continuityIn: 'Biscuit is alone in the yard',
      continuityOut: 'Biscuit has found the garden gate',
      mood: 'hopeful',
    };
    expect(directedSceneSchema.safeParse(full).success).toBe(true);
  });
});

// ─── StoryIntelligenceError ───────────────────────────────────────────────────

describe('StoryIntelligenceError', () => {
  it('carries the error code', () => {
    const err = new StoryIntelligenceError('STORY_BLUEPRINT_INVALID', 'schema mismatch');
    expect(err.code).toBe('STORY_BLUEPRINT_INVALID');
    expect(err.name).toBe('StoryIntelligenceError');
    expect(err.message).toBe('schema mismatch');
  });

  it('is an instance of Error', () => {
    expect(new StoryIntelligenceError('STORY_INTELLIGENCE_TIMEOUT', 'timeout')).toBeInstanceOf(Error);
  });

  it('accepts a cause', () => {
    const root = new Error('root cause');
    const err = new StoryIntelligenceError('STORY_BLUEPRINT_PROVIDER_FAILED', 'wrapped', root);
    expect(err).toBeInstanceOf(Error);
  });
});

// ─── isStoryIntelligenceEnabled ──────────────────────────────────────────────

describe('isStoryIntelligenceEnabled', () => {
  const orig = process.env.STORY_INTELLIGENCE_V1_ENABLED;

  afterEach(() => {
    if (orig === undefined) delete process.env.STORY_INTELLIGENCE_V1_ENABLED;
    else process.env.STORY_INTELLIGENCE_V1_ENABLED = orig;
  });

  it('returns true only when env var is exactly "true"', () => {
    process.env.STORY_INTELLIGENCE_V1_ENABLED = 'true';
    expect(isStoryIntelligenceEnabled()).toBe(true);
  });

  it('returns false when unset', () => {
    delete process.env.STORY_INTELLIGENCE_V1_ENABLED;
    expect(isStoryIntelligenceEnabled()).toBe(false);
  });

  it('returns false for partial matches like "1" or "yes"', () => {
    process.env.STORY_INTELLIGENCE_V1_ENABLED = '1';
    expect(isStoryIntelligenceEnabled()).toBe(false);
    process.env.STORY_INTELLIGENCE_V1_ENABLED = 'yes';
    expect(isStoryIntelligenceEnabled()).toBe(false);
  });
});

// ─── LocalStoryIntelligenceProvider ─────────────────────────────────────────

describe('LocalStoryIntelligenceProvider', () => {
  const local = new LocalStoryIntelligenceProvider();
  const baseAnswers = [{ questionText: 'How should it feel?', selectedAnswer: 'warm' }];

  describe('planStory', () => {
    it('returns a valid blueprint for a KIDS idea', async () => {
      const result = await local.planStory({ idea: kidsIdea, answers: baseAnswers, audienceMode: 'KIDS' });
      const parsed = storyBlueprintSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });

    it('returns a valid blueprint for a GENERAL idea', async () => {
      const result = await local.planStory({ idea: generalIdea, answers: baseAnswers, audienceMode: 'GENERAL' });
      const parsed = storyBlueprintSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });

    it('infers protagonist name from a named character in the idea', async () => {
      const result = await local.planStory({
        idea: 'Kofi is a young fisherman who finds a mysterious map',
        answers: [],
        audienceMode: 'GENERAL',
      });
      expect(result.protagonist.name).toBe('Kofi');
    });

    it('always has at least 3 beats (minimum schema requirement)', async () => {
      const result = await local.planStory({ idea: 'x', answers: [], audienceMode: 'KIDS' });
      expect(result.beats.length).toBeGreaterThanOrEqual(3);
    });

    it('includes a continuity rule naming the protagonist', async () => {
      const result = await local.planStory({ idea: kidsIdea, answers: [], audienceMode: 'KIDS' });
      const hasProtagonistRule = result.continuityRules.some((r) =>
        r.toLowerCase().includes(result.protagonist.name.toLowerCase()),
      );
      expect(hasProtagonistRule).toBe(true);
    });
  });

  describe('enhanceNarrative', () => {
    it('returns the original story body unchanged', async () => {
      const body = 'Biscuit ran across the yard. He was very happy.';
      const result = await local.enhanceNarrative({
        blueprint: minimalBlueprint,
        storyTitle: 'Biscuit Finds His Ball',
        storyBody: body,
        audienceMode: 'KIDS',
        characterContext: '',
      });
      expect(result).toBe(body);
    });
  });

  describe('directScenes', () => {
    const baseInput = {
      blueprint: minimalBlueprint,
      storyTitle: 'Biscuit Finds His Ball',
      storyBody: 'Biscuit ran across the yard looking for his ball.',
      audienceMode: 'KIDS' as const,
      sceneCount: 6,
      characterContext: 'Biscuit — a small golden puppy with floppy ears.',
    };

    it('returns scenes with valid schema for each', async () => {
      const scenes = await local.directScenes(baseInput);
      expect(scenes.length).toBeGreaterThan(0);
      for (const scene of scenes) {
        expect(directedSceneSchema.safeParse(scene).success).toBe(true);
      }
    });

    it('does not exceed requested scene count', async () => {
      const scenes = await local.directScenes({ ...baseInput, sceneCount: 3 });
      expect(scenes.length).toBeLessThanOrEqual(3);
    });

    it('uses existing hints when count is satisfied', async () => {
      const hints = Array.from({ length: 6 }, (_, i) => ({
        title: `Hint Scene ${i + 1}`,
        description: `Something happens in scene ${i + 1}`,
        locationType: 'garden',
        mood: 'playful',
      }));
      const scenes = await local.directScenes({ ...baseInput, existingSceneHints: hints });
      expect(scenes[0].title).toBe('Hint Scene 1');
    });

    it('ordinal values start at 1', async () => {
      const scenes = await local.directScenes(baseInput);
      expect(scenes[0].ordinal).toBe(1);
    });

    it('all scene characters contain the protagonist name', async () => {
      const scenes = await local.directScenes(baseInput);
      for (const scene of scenes) {
        expect(scene.characters.length).toBeGreaterThan(0);
        const hasProtagonist = scene.characters.some((c) =>
          c.toLowerCase().includes(minimalBlueprint.protagonist.name.toLowerCase()),
        );
        expect(hasProtagonist).toBe(true);
      }
    });

    it('is deterministic — same input produces identical output', async () => {
      const a = await local.directScenes(baseInput);
      const b = await local.directScenes(baseInput);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
  });
});

// ─── OpenAIStoryIntelligenceProvider ─────────────────────────────────────────

describe('OpenAIStoryIntelligenceProvider', () => {
  describe('when API key is not configured', () => {
    let provider: OpenAIStoryIntelligenceProvider;
    const origKey = process.env.OPENAI_API_KEY;

    beforeEach(() => {
      delete process.env.OPENAI_API_KEY;
      provider = new OpenAIStoryIntelligenceProvider();
    });
    afterEach(() => {
      if (origKey !== undefined) process.env.OPENAI_API_KEY = origKey;
      else delete process.env.OPENAI_API_KEY;
    });

    it('isConfigured returns false', () => {
      expect(provider.isConfigured).toBe(false);
    });

    it('planStory throws STORY_INTELLIGENCE_UNAVAILABLE', async () => {
      await expect(provider.planStory({ idea: kidsIdea, answers: [], audienceMode: 'KIDS' })).rejects.toMatchObject({
        code: 'STORY_INTELLIGENCE_UNAVAILABLE',
      });
    });
  });

  describe('provider adapter normalization — happy path', () => {
    let provider: OpenAIStoryIntelligenceProvider;
    const origKey = process.env.OPENAI_API_KEY;

    beforeEach(() => {
      process.env.OPENAI_API_KEY = 'test-key';
      provider = new OpenAIStoryIntelligenceProvider();
    });
    afterEach(() => {
      if (origKey !== undefined) process.env.OPENAI_API_KEY = origKey;
      else delete process.env.OPENAI_API_KEY;
      vi.restoreAllMocks();
    });

    it('planStory: returns valid blueprint on good provider response', async () => {
      const mockBlueprint = {
        premise: 'A puppy finds his ball.',
        conflict: 'A cat guards the ball.',
        protagonist: { name: 'Biscuit', goal: 'get the ball' },
        beats: [
          { label: 'Beginning', description: 'Biscuit looks for the ball.' },
          { label: 'Middle', description: 'Biscuit meets the cat.' },
          { label: 'End', description: 'Biscuit gets the ball.' },
        ],
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: JSON.stringify(mockBlueprint) } }] }),
      }));
      const result = await provider.planStory({ idea: kidsIdea, answers: [], audienceMode: 'KIDS' });
      expect(result.version).toBe('story_blueprint_v1');
      expect(result.protagonist.name).toBe('Biscuit');
    });

    it('planStory: throws STORY_BLUEPRINT_INVALID when schema validation fails after repair', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"invalid":true}' } }] }),
      }));
      await expect(provider.planStory({ idea: kidsIdea, answers: [], audienceMode: 'KIDS' })).rejects.toMatchObject({
        code: 'STORY_BLUEPRINT_INVALID',
      });
    });

    it('planStory: throws STORY_BLUEPRINT_PROVIDER_FAILED when provider returns non-OK status', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => 'Service Unavailable',
      }));
      await expect(provider.planStory({ idea: kidsIdea, answers: [], audienceMode: 'KIDS' })).rejects.toMatchObject({
        code: 'STORY_BLUEPRINT_PROVIDER_FAILED',
      });
    });

    it('planStory: throws STORY_INTELLIGENCE_TIMEOUT when fetch aborts', async () => {
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        return Promise.reject(err);
      }));
      await expect(provider.planStory({ idea: kidsIdea, answers: [], audienceMode: 'KIDS' })).rejects.toMatchObject({
        code: 'STORY_INTELLIGENCE_TIMEOUT',
      });
    });

    it('directScenes: throws SCENE_DIRECTION_INVALID when zero scenes validate', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: JSON.stringify({ scenes: [{ version: 'bad', ordinal: 0 }] }) } }] }),
      }));
      await expect(provider.directScenes({
        blueprint: minimalBlueprint,
        storyTitle: 'Test',
        storyBody: 'body',
        audienceMode: 'KIDS',
        sceneCount: 3,
        characterContext: '',
      })).rejects.toMatchObject({ code: 'SCENE_DIRECTION_INVALID' });
    });

    it('enhanceNarrative: throws NARRATIVE_ENHANCEMENT_FAILED when provider returns empty content', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '  ' } }] }),
      }));
      await expect(provider.enhanceNarrative({
        blueprint: minimalBlueprint,
        storyTitle: 'Test',
        storyBody: 'A story.',
        audienceMode: 'KIDS',
        characterContext: '',
      })).rejects.toMatchObject({ code: 'NARRATIVE_ENHANCEMENT_FAILED' });
    });
  });
});

// ─── R16 safety (audienceMode = KIDS) ────────────────────────────────────────

describe('R16 audience safety — KIDS mode', () => {
  const local = new LocalStoryIntelligenceProvider();
  const kidsAnswers = [{ questionText: 'How should it feel?', selectedAnswer: 'fun and gentle' }];

  it('planStory for KIDS sets audience field containing child-appropriate context', async () => {
    const bp = await local.planStory({ idea: kidsIdea, answers: kidsAnswers, audienceMode: 'KIDS' });
    expect(bp.audience).toBeTruthy();
    // Must not reference adult audiences
    expect(bp.audience?.toLowerCase()).not.toContain('adult');
  });

  it('directScenes for KIDS does not include adult or violent language in actions', async () => {
    const scenes = await local.directScenes({
      blueprint: minimalBlueprint,
      storyTitle: 'Biscuit',
      storyBody: 'A gentle adventure.',
      audienceMode: 'KIDS',
      sceneCount: 6,
      characterContext: '',
    });
    for (const scene of scenes) {
      const text = (scene.action + ' ' + (scene.mood ?? '')).toLowerCase();
      // Local provider content should be clean — check no violent terms leaked in
      expect(text).not.toMatch(/murder|kill|blood|weapon/);
    }
  });
});

// ─── Old-project fallback ─────────────────────────────────────────────────────

describe('old project fallback (no blueprint)', () => {
  const local = new LocalStoryIntelligenceProvider();

  it('directScenes with hints falls back gracefully when no blueprint beats match hints', async () => {
    const tinyBlueprint: StoryBlueprint = {
      ...minimalBlueprint,
      beats: [
        { label: 'Start', description: 'It begins.' },
        { label: 'Middle', description: 'Things happen.' },
        { label: 'End', description: 'It ends.' },
      ],
    };
    const scenes = await local.directScenes({
      blueprint: tinyBlueprint,
      storyTitle: 'Old Story',
      storyBody: 'Once upon a time...',
      audienceMode: 'GENERAL',
      sceneCount: 3,
      characterContext: '',
    });
    expect(scenes.length).toBeGreaterThan(0);
    for (const s of scenes) {
      expect(directedSceneSchema.safeParse(s).success).toBe(true);
    }
  });
});
