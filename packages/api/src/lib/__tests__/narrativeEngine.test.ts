import { describe, it, expect, vi } from 'vitest';
import {
  ClaudeNarrativeEngineProvider,
  isNarrativeEngineEnabled,
  buildNarrativeSystem,
  CLAUDE_DEFAULT_MODEL,
} from '../narrativeEngine';
import type { StoryAnswer, StoryAudienceMode, StoryTextProvider, GeneratedStory } from '../storyTextService';

const fallbackStory: GeneratedStory = {
  title: 'Fallback',
  summary: 'fallback summary',
  body: 'fallback body that is long enough to pass the schema minimum of twenty characters',
  ageRange: 'All ages',
  mainCharacterName: 'Hero',
  supportingCharacters: ['Friend'],
  theme: 'friendship',
  sceneHints: [{ title: 'Scene One', description: 'Hero begins the adventure.' }],
  characterMemory: [{ name: 'Hero', role: 'main character' }],
  providerMetadata: { provider: 'local-fallback' },
};

function makeFallback(): StoryTextProvider & { generateStory: ReturnType<typeof vi.fn>; continueStory: ReturnType<typeof vi.fn>; generateGuidedQuestions: ReturnType<typeof vi.fn> } {
  return {
    generateGuidedQuestions: vi.fn(async () => []),
    generateStory: vi.fn(async () => fallbackStory),
    continueStory: vi.fn(async () => fallbackStory),
  } as unknown as ReturnType<typeof makeFallback>;
}

function claudeJsonResponse(body: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ content: [{ type: 'text', text: body }] }),
  } as unknown as Response;
}

const SAMPLE_STORY_JSON = JSON.stringify({
  title: 'The Ember’s Edge',
  summary: 'A weary knight discovers a relic pulsing with dark magic in a frozen wasteland.',
  body: 'SCENE 1\nThe knight knelt before the frozen anvil, breath blooming into pale mist in the biting cold. Wind howled across the tundra.',
  ageRange: 'All ages',
  mainCharacterName: 'Sir Eldon',
  supportingCharacters: ['Mira'],
  theme: 'courage and sacrifice',
  sceneHints: [
    {
      title: 'The Frozen Wastes',
      description: 'Howling arctic wind, soft blue volumetric light, knight trudging through deep snow.',
      locationType: 'frozen wasteland',
      indoorOutdoor: 'outdoor',
      mood: 'somber',
      characters: ['Sir Eldon'],
    },
  ],
  characterMemory: [
    {
      name: 'Sir Eldon',
      role: 'main character',
      visualDescription: 'Worn steel armor with frost texture, tired but determined eyes.',
    },
  ],
});

const ANSWERS: StoryAnswer[] = [{ questionText: 'How should it feel?', selectedAnswer: 'Adventurous' }];

describe('narrativeEngine', () => {
  describe('isNarrativeEngineEnabled', () => {
    it('is off unless the flag is true', () => {
      expect(isNarrativeEngineEnabled({ CLAUDE_API: 'key' })).toBe(false);
      expect(isNarrativeEngineEnabled({})).toBe(false);
    });

    it('is on only when the flag is true AND a key is present', () => {
      expect(isNarrativeEngineEnabled({ STORY_NARRATIVE_ENGINE_ENABLED: 'true', CLAUDE_API: 'key' })).toBe(true);
      expect(isNarrativeEngineEnabled({ STORY_NARRATIVE_ENGINE_ENABLED: 'true' })).toBe(false);
    });

    it('accepts the ANTHROPIC_API_KEY alias', () => {
      expect(isNarrativeEngineEnabled({ STORY_NARRATIVE_ENGINE_ENABLED: 'true', ANTHROPIC_API_KEY: 'key' })).toBe(true);
    });
  });

  describe('buildNarrativeSystem', () => {
    it('includes sensory anchors and the audience safety rules', () => {
      const kids = buildNarrativeSystem('KIDS');
      expect(kids).toContain('sensory anchors');
      expect(kids).toContain('SAFETY (KIDS)');
      const general = buildNarrativeSystem('GENERAL');
      expect(general).toContain('SAFETY (GENERAL)');
    });
  });

  describe('ClaudeNarrativeEngineProvider', () => {
    it('delegates guided questions to the fallback provider', async () => {
      const fallback = makeFallback();
      const provider = new ClaudeNarrativeEngineProvider(fallback, {
        env: { STORY_NARRATIVE_ENGINE_ENABLED: 'true', CLAUDE_API: 'key' },
        fetchImpl: vi.fn(),
      });
      await provider.generateGuidedQuestions('idea', 'KIDS');
      expect(fallback.generateGuidedQuestions).toHaveBeenCalledTimes(1);
    });

    it('delegates to fallback when disabled', async () => {
      const fallback = makeFallback();
      const provider = new ClaudeNarrativeEngineProvider(fallback, { env: {} });
      const story = await provider.generateStory('idea', ANSWERS, 'GENERAL');
      expect(fallback.generateStory).toHaveBeenCalledTimes(1);
      expect(story.providerMetadata?.provider).toBe('local-fallback');
    });

    it('generates a story through Claude and parses the manifest shape', async () => {
      const fetchMock = vi.fn<typeof fetch>(async (_url, _init) => claudeJsonResponse(SAMPLE_STORY_JSON));
      const fallback = makeFallback();
      const provider = new ClaudeNarrativeEngineProvider(fallback, {
        env: { STORY_NARRATIVE_ENGINE_ENABLED: 'true', CLAUDE_API: 'key' },
        fetchImpl: fetchMock,
      });

      const story = await provider.generateStory('A frozen wasteland knight', ANSWERS, 'GENERAL');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(String(url)).toBe('https://api.anthropic.com/v1/messages');
      const headers = init!.headers as Record<string, string>;
      expect(headers['x-api-key']).toBe('key');
      expect(headers['anthropic-version']).toBe('2023-06-01');
      const body = JSON.parse(String(init!.body));
      expect(body.model).toBe(CLAUDE_DEFAULT_MODEL);
      expect(body.system).toContain('award-winning screenwriter');
      expect(body.system).toContain('SAFETY (GENERAL)');
      expect(body.messages[0].content).toContain('A frozen wasteland knight');

      expect(story.title).toBe('The Ember’s Edge');
      expect(story.mainCharacterName).toBe('Sir Eldon');
      expect(story.sceneHints[0].mood).toBe('somber');
      expect(story.providerMetadata?.provider).toBe('claude-narrative');
      expect(story.providerMetadata?.model).toBe(CLAUDE_DEFAULT_MODEL);
      expect(fallback.generateStory).not.toHaveBeenCalled();
    });

    it('falls back when Claude returns a non-2xx response', async () => {
      const fetchMock = vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) } as unknown as Response));
      const fallback = makeFallback();
      const provider = new ClaudeNarrativeEngineProvider(fallback, {
        env: { STORY_NARRATIVE_ENGINE_ENABLED: 'true', CLAUDE_API: 'key' },
        fetchImpl: fetchMock,
      });

      const story = await provider.generateStory('idea', ANSWERS, 'KIDS');
      expect(fallback.generateStory).toHaveBeenCalledTimes(1);
      expect(story.providerMetadata?.provider).toBe('local-fallback');
    });

    it('retries once on non-JSON output, then parses fenced JSON', async () => {
      let call = 0;
      const fetchMock = vi.fn<typeof fetch>(async () => {
        call += 1;
        if (call === 1) {
          // prose with no braces — Claude sometimes ignores the JSON instruction
          return claudeJsonResponse('Sure! Here is a lovely story about a lantern keeper and a storm.');
        }
        return claudeJsonResponse('```json\n' + SAMPLE_STORY_JSON + '\n```');
      });
      const fallback = makeFallback();
      const provider = new ClaudeNarrativeEngineProvider(fallback, {
        env: { STORY_NARRATIVE_ENGINE_ENABLED: 'true', CLAUDE_API: 'key' },
        fetchImpl: fetchMock,
      });

      const story = await provider.generateStory('idea', ANSWERS, 'GENERAL');

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(story.providerMetadata?.provider).toBe('claude-narrative');
      expect(story.title).toBe('The Ember’s Edge');
      expect(fallback.generateStory).not.toHaveBeenCalled();
    });

    it('continues a story through Claude', async () => {
      const fetchMock = vi.fn(async () => claudeJsonResponse(SAMPLE_STORY_JSON));
      const fallback = makeFallback();
      const provider = new ClaudeNarrativeEngineProvider(fallback, {
        env: { STORY_NARRATIVE_ENGINE_ENABLED: 'true', ANTHROPIC_API_KEY: 'key' },
        fetchImpl: fetchMock,
      });

      const story = await provider.continueStory({
        projectTitle: 'The Ember’s Edge',
        originalIdea: 'a relic in the frozen wasteland',
        previousChapters: [{ chapterNumber: 1, title: 'Ch 1', summary: 's', body: 'chapter one body text that is reasonably long' }],
        audienceMode: 'GENERAL' as StoryAudienceMode,
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(story.providerMetadata?.provider).toBe('claude-narrative');
      expect(fallback.continueStory).not.toHaveBeenCalled();
    });
  });
});