import { z } from 'zod';

export type StoryAudienceMode = 'KIDS' | 'GENERAL';

export type GuidedQuestion = {
  questionText: string;
  answerOptions: string[];
};

export type StoryAnswer = {
  questionText: string;
  selectedAnswer: string;
};

export type GeneratedStory = {
  title: string;
  summary: string;
  body: string;
  ageRange: string;
  mainCharacterName: string;
  supportingCharacters: string[];
  theme: string;
  sceneHints: Array<{
    title: string;
    description: string;
    locationType?: string;
    indoorOutdoor?: string;
    mood?: string;
    characters?: string[];
  }>;
  characterMemory: Array<{
    name: string;
    role?: string;
    species?: string;
    ageDescription?: string;
    gender?: string;
    visualDescription?: string;
    personality?: Record<string, unknown>;
  }>;
  providerMetadata?: Record<string, unknown>;
};

export interface StoryTextProvider {
  generateGuidedQuestions(input: string, audienceMode: StoryAudienceMode): Promise<GuidedQuestion[]>;
  generateStory(input: string, answers: StoryAnswer[], audienceMode: StoryAudienceMode): Promise<GeneratedStory>;
  continueStory(params: {
    projectTitle: string;
    originalIdea: string;
    previousChapters: Array<{ chapterNumber: number; title: string; summary: string; body: string }>;
    audienceMode: StoryAudienceMode;
  }): Promise<GeneratedStory>;
}

const guidedQuestionSchema = z.object({
  questionText: z.string().min(4).max(160),
  answerOptions: z.array(z.string().min(1).max(80)).min(3).max(5),
});

export const generatedStorySchema = z.object({
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(500),
  body: z.string().min(20).max(6000),
  ageRange: z.string().min(1).max(80),
  mainCharacterName: z.string().min(1).max(80),
  supportingCharacters: z.array(z.string().min(1).max(80)).default([]),
  theme: z.string().min(1).max(120),
  sceneHints: z.array(z.object({
    title: z.string().min(1).max(120),
    description: z.string().min(1).max(500),
    locationType: z.string().max(80).optional(),
    indoorOutdoor: z.string().max(40).optional(),
    mood: z.string().max(80).optional(),
    characters: z.array(z.string()).optional(),
  })).min(1).max(8),
  characterMemory: z.array(z.object({
    name: z.string().min(1).max(80),
    role: z.string().max(80).optional(),
    species: z.string().max(80).optional(),
    ageDescription: z.string().max(120).optional(),
    gender: z.string().max(80).optional(),
    visualDescription: z.string().max(500).optional(),
    personality: z.record(z.unknown()).optional(),
  })).default([]),
});

function titleFromIdea(idea: string) {
  const cleaned = idea.trim().replace(/[^\w\s'-]/g, '').replace(/\s+/g, ' ');
  if (!cleaned) return 'A New Adventure';
  return cleaned
    .split(' ')
    .slice(0, 8)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function inferHero(idea: string) {
  const named = idea.match(/\b([A-Z][a-zA-Z'-]{1,40})\s+is\s+(?:a|an|the)\b/);
  if (named) return named[1];
  const match = idea.match(/\b(a|an|the)\s+([a-zA-Z'-]+)/i);
  const subject = match?.[2] ?? idea.split(/\s+/)[0] ?? 'friend';
  return subject.charAt(0).toUpperCase() + subject.slice(1).toLowerCase();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, fallback = '') {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function clampText(value: string, maxLength: number) {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return trimmed.slice(0, maxLength).replace(/\s+\S*$/, '').trim() || trimmed.slice(0, maxLength);
}

function stringArrayValue(value: unknown): string[] {
  if (!Array.isArray(value)) {
    const single = stringValue(value);
    return single ? [clampText(single, 80)] : [];
  }

  return value
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      const record = asRecord(item);
      if (!record) return '';
      return stringValue(record.name ?? record.title ?? record.character ?? record.role);
    })
    .map((item) => clampText(item, 80))
    .filter(Boolean)
    .slice(0, 8);
}

function coerceTextBlock(value: unknown, fallback = '') {
  if (Array.isArray(value)) {
    return value.map((item) => stringValue(item)).filter(Boolean).join('\n\n') || fallback;
  }
  return stringValue(value, fallback);
}

function firstValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function normaliseSceneHints(value: unknown): GeneratedStory['sceneHints'] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index): GeneratedStory['sceneHints'][number] | null => {
      if (typeof item === 'string') {
        return {
          title: titleFromIdea(item || `Scene ${index + 1}`),
          description: item,
        };
      }

      const record = asRecord(item);
      if (!record) return null;

      const title = clampText(stringValue(
        firstValue(record, ['title', 'name', 'sceneTitle', 'heading']),
        `Scene ${index + 1}`,
      ), 120);
      const description = clampText(stringValue(
        firstValue(record, ['description', 'summary', 'action', 'text', 'body']),
        title,
      ), 500);

      return {
        title,
        description,
        locationType: clampText(stringValue(firstValue(record, ['locationType', 'location', 'setting'])), 80) || undefined,
        indoorOutdoor: clampText(stringValue(firstValue(record, ['indoorOutdoor', 'indoor_outdoor', 'environment'])), 40) || undefined,
        mood: clampText(stringValue(firstValue(record, ['mood', 'tone', 'emotion'])), 80) || undefined,
        characters: stringArrayValue(firstValue(record, ['characters', 'characterNames', 'cast'])),
      };
    })
    .filter((scene): scene is GeneratedStory['sceneHints'][number] => !!scene)
    .slice(0, 8);
}

function characterRecordFromValue(value: unknown, fallbackName: string): GeneratedStory['characterMemory'][number] | null {
  if (typeof value === 'string') {
    const name = clampText(value, 80);
    return name ? { name, role: 'character' } : null;
  }

  const record = asRecord(value);
  if (!record) return null;

  const name = clampText(stringValue(firstValue(record, ['name', 'characterName', 'character', 'title']), fallbackName), 80);
  if (!name) return null;

  const personality = asRecord(record.personality ?? record.traits) ?? undefined;
  return {
    name,
    role: clampText(stringValue(record.role), 80) || undefined,
    species: clampText(stringValue(record.species ?? record.type), 80) || undefined,
    ageDescription: clampText(stringValue(record.ageDescription ?? record.age ?? record.ageRange), 120) || undefined,
    gender: clampText(stringValue(record.gender), 80) || undefined,
    visualDescription: clampText(stringValue(
      record.visualDescription ?? record.description ?? record.appearance ?? record.looks,
    ), 500) || undefined,
    personality,
  };
}

function normaliseCharacterMemory(value: unknown, mainCharacterName: string): GeneratedStory['characterMemory'] {
  if (Array.isArray(value)) {
    return value
      .map((item) => characterRecordFromValue(item, mainCharacterName))
      .filter((character): character is GeneratedStory['characterMemory'][number] => !!character)
      .slice(0, 12);
  }

  const record = asRecord(value);
  if (!record) {
    const single = characterRecordFromValue(value, mainCharacterName);
    return single ? [single] : [];
  }

  const objectEntries = Object.entries(record)
    .map(([key, item]) => {
      const character = characterRecordFromValue(item, key);
      if (!character) return null;
      return { ...character, name: character.name || key };
    })
    .filter((character): character is GeneratedStory['characterMemory'][number] => !!character);

  if (objectEntries.length > 0 && !('name' in record || 'characterName' in record)) {
    return objectEntries.slice(0, 12);
  }

  const single = characterRecordFromValue(record, mainCharacterName);
  return single ? [single] : [];
}

export function normaliseGeneratedStoryPayload(raw: unknown, sourceIdea: string): z.input<typeof generatedStorySchema> {
  const record = asRecord(raw);
  if (!record) throw new Error('Story provider response was not a JSON object');

  const body = clampText(coerceTextBlock(firstValue(record, ['body', 'story', 'text', 'content', 'narrative'])), 6000);
  const title = clampText(stringValue(firstValue(record, ['title', 'name', 'storyTitle']), titleFromIdea(sourceIdea)), 120);
  const summary = clampText(stringValue(firstValue(record, ['summary', 'logline', 'synopsis']), body.slice(0, 400) || title), 500);
  const mainCharacterName = clampText(stringValue(
    firstValue(record, ['mainCharacterName', 'main_character', 'mainCharacter', 'hero']),
    inferHero(`${sourceIdea} ${title} ${body}`),
  ), 80);
  const sceneHints = normaliseSceneHints(
    firstValue(record, ['sceneHints', 'scene_hints', 'scenes', 'storyScenes', 'pages']),
  );
  const characterMemory = normaliseCharacterMemory(
    firstValue(record, ['characterMemory', 'character_memory', 'characters', 'characterBible', 'character_bible']),
    mainCharacterName,
  );

  return {
    title,
    summary,
    body,
    ageRange: clampText(stringValue(firstValue(record, ['ageRange', 'age_range', 'audienceAge']), 'All ages'), 80),
    mainCharacterName,
    supportingCharacters: stringArrayValue(firstValue(record, ['supportingCharacters', 'supporting_characters', 'friends'])),
    theme: clampText(stringValue(firstValue(record, ['theme', 'moral', 'message']), 'friendship, courage, kindness'), 120),
    sceneHints: sceneHints.length > 0
      ? sceneHints
      : [{ title: 'Story Moment', description: summary || body.slice(0, 300) || title }],
    characterMemory: characterMemory.length > 0
      ? characterMemory
      : [{ name: mainCharacterName, role: 'main character' }],
  };
}

function fallbackQuestions(idea: string, audienceMode: StoryAudienceMode): GuidedQuestion[] {
  const hero = inferHero(idea).toLowerCase();
  const kidsOptions = audienceMode === 'KIDS'
    ? ['Let the story choose', 'Happy', 'Funny', 'Magical']
    : ['Let the story choose', 'Warm', 'Funny', 'Adventurous'];

  return [
    {
      questionText: `What kind of ${hero} is in the story?`,
      answerOptions: ['Young and curious', 'Brave and kind', 'Shy but clever', 'Let the story choose'],
    },
    {
      questionText: `Does the ${hero} have a friend?`,
      answerOptions: ['Many friends', 'One best friend', 'Not yet', 'Let the story choose'],
    },
    {
      questionText: 'What little problem should happen?',
      answerOptions: ['Gets lost', 'Misses something important', 'Needs to help someone', 'No big problem'],
    },
    {
      questionText: 'How should the story feel?',
      answerOptions: kidsOptions,
    },
    {
      questionText: 'How should it end?',
      answerOptions: ['Happy ending', 'Funny ending', 'Surprise ending', 'Let the story choose'],
    },
  ];
}

function fallbackStory(idea: string, answers: StoryAnswer[], audienceMode: StoryAudienceMode, chapterNumber = 1): GeneratedStory {
  const baseTitle = titleFromIdea(idea);
  const hero = inferHero(idea);
  const toneAnswer = answers.find((answer) => /feel/i.test(answer.questionText))?.selectedAnswer ?? 'happy';
  const friendAnswer = answers.find((answer) => /friend/i.test(answer.questionText))?.selectedAnswer ?? 'one kind friend';
  const problemAnswer = answers.find((answer) => /problem/i.test(answer.questionText))?.selectedAnswer ?? 'needs to help someone';
  const ageRange = audienceMode === 'KIDS' ? '6-10' : 'All ages';
  const title = chapterNumber === 1 ? `${baseTitle}` : `${baseTitle}: Chapter ${chapterNumber}`;
  const friendName = chapterNumber === 1 ? 'Mimi' : 'Tomi';

  const body = chapterNumber === 1
    ? [
        `${hero} woke up with a bright idea: today could be different.`,
        `On the way, ${hero} met ${friendName}, who wanted to come along because every good adventure is easier with ${friendAnswer.toLowerCase()}.`,
        `Soon they discovered a problem: ${problemAnswer.toLowerCase()}. ${hero} took a deep breath and tried one kind step first.`,
        `The plan did not work perfectly, but it made everyone laugh. Then ${friendName} noticed a smaller path, and together they solved the problem.`,
        `By the end of the day, ${hero} learned that courage can be gentle, and a good friend can make even a strange day feel ${toneAnswer.toLowerCase()}.`,
      ].join('\n\n')
    : [
        `The next morning, ${hero} found a tiny note that said, "Your adventure is not finished yet."`,
        `${friendName} joined in, and together they followed a trail of bright clues to a place they had never seen before.`,
        `This time, ${hero} remembered the lesson from before: ask for help, stay kind, and keep trying.`,
        `When the mystery was solved, everyone had a new story to tell, and ${hero} felt ready for the next chapter.`,
      ].join('\n\n');

  return {
    title,
    summary: `${hero} has a ${toneAnswer.toLowerCase()} adventure, solves a small problem, and learns about kindness and courage.`,
    body,
    ageRange,
    mainCharacterName: hero,
    supportingCharacters: [friendName],
    theme: 'friendship, courage, kindness',
    sceneHints: [
      {
        title: 'The Big Start',
        description: `${hero} begins the adventure with a hopeful feeling.`,
        locationType: 'home or neighborhood',
        indoorOutdoor: 'outdoor',
        mood: 'bright',
        characters: [hero],
      },
      {
        title: 'A Helpful Friend',
        description: `${hero} meets ${friendName}, and they decide to work together.`,
        locationType: 'pathway',
        indoorOutdoor: 'outdoor',
        mood: 'friendly',
        characters: [hero, friendName],
      },
      {
        title: 'The Kind Solution',
        description: `${hero} and ${friendName} solve the problem with patience and teamwork.`,
        locationType: 'story setting',
        indoorOutdoor: 'indoor or outdoor',
        mood: 'happy',
        characters: [hero, friendName],
      },
    ],
    characterMemory: [
      {
        name: hero,
        role: 'main character',
        visualDescription: `${hero} looks friendly, expressive, and easy for children to recognize.`,
        personality: { traits: ['kind', 'curious', 'brave'] },
      },
      {
        name: friendName,
        role: 'supporting friend',
        visualDescription: `${friendName} has a warm smile and a helpful presence.`,
        personality: { traits: ['helpful', 'cheerful'] },
      },
    ],
    providerMetadata: { provider: 'local-fallback' },
  };
}

export function parseJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON object found in provider response');
    return JSON.parse(match[0]);
  }
}

class LocalStoryTextProvider implements StoryTextProvider {
  async generateGuidedQuestions(input: string, audienceMode: StoryAudienceMode) {
    return fallbackQuestions(input, audienceMode);
  }

  async generateStory(input: string, answers: StoryAnswer[], audienceMode: StoryAudienceMode) {
    return fallbackStory(input, answers, audienceMode, 1);
  }

  async continueStory(params: {
    projectTitle: string;
    originalIdea: string;
    previousChapters: Array<{ chapterNumber: number; title: string; summary: string; body: string }>;
    audienceMode: StoryAudienceMode;
  }) {
    return fallbackStory(params.originalIdea || params.projectTitle, [], params.audienceMode, params.previousChapters.length + 1);
  }
}

class OpenAICompatibleStoryTextProvider implements StoryTextProvider {
  private readonly fallback = new LocalStoryTextProvider();
  private readonly apiKey = process.env.OPENAI_API_KEY;
  private readonly baseUrl = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
  private readonly model = process.env.OPENAI_TEXT_MODEL ?? process.env.STORY_TEXT_MODEL ?? 'gpt-4o-mini';

  private get enabled() {
    return !!this.apiKey;
  }

  private async complete(system: string, user: string) {
    if (!this.enabled) throw new Error('Story text provider is not configured');

    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.7,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Story text provider failed with ${response.status}`);
    }

    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error('Story text provider returned no content');
    return content;
  }

  async generateGuidedQuestions(input: string, audienceMode: StoryAudienceMode) {
    if (!this.enabled) return this.fallback.generateGuidedQuestions(input, audienceMode);
    try {
      const content = await this.complete(
        'You create simple story questions for children and families. Return only JSON.',
        [
          `Idea: ${input}`,
          `Audience mode: ${audienceMode}`,
          'Create 3 to 6 short, friendly questions. Each question needs 3 to 5 button answers. Always include a "Let the story choose" style option when useful.',
          'Return JSON: {"questions":[{"questionText":"...","answerOptions":["..."]}]}',
        ].join('\n'),
      );
      const parsed = z.object({ questions: z.array(guidedQuestionSchema).min(3).max(6) }).parse(parseJsonObject(content));
      return parsed.questions;
    } catch (error) {
      console.warn('[storyTextService] guided questions fallback:', error);
      return this.fallback.generateGuidedQuestions(input, audienceMode);
    }
  }

  async generateStory(input: string, answers: StoryAnswer[], audienceMode: StoryAudienceMode) {
    if (!this.enabled) return this.fallback.generateStory(input, answers, audienceMode);
    try {
      const content = await this.complete(
        [
          'You write short, safe stories for Raivstream Story Playground.',
          'Use simple language, positive emotional arcs, and no adult themes.',
          'For KIDS mode: no graphic violence, sexual content, dark horror, or unsafe instructions.',
          'Return only JSON that matches the requested shape.',
        ].join('\n'),
        [
          `Idea: ${input}`,
          `Audience mode: ${audienceMode}`,
          `Answers: ${JSON.stringify(answers)}`,
          'Return JSON with title, summary, body, ageRange, mainCharacterName, supportingCharacters, theme, sceneHints, and characterMemory.',
        ].join('\n'),
      );
      const parsed = generatedStorySchema.parse(normaliseGeneratedStoryPayload(parseJsonObject(content), input));
      return { ...parsed, providerMetadata: { provider: 'openai-compatible', model: this.model } };
    } catch (error) {
      console.warn('[storyTextService] story fallback:', error);
      return this.fallback.generateStory(input, answers, audienceMode);
    }
  }

  async continueStory(params: {
    projectTitle: string;
    originalIdea: string;
    previousChapters: Array<{ chapterNumber: number; title: string; summary: string; body: string }>;
    audienceMode: StoryAudienceMode;
  }) {
    if (!this.enabled) return this.fallback.continueStory(params);
    try {
      const content = await this.complete(
        [
          'You continue short, safe stories for Raivstream Story Playground.',
          'Preserve character names, tone, setting, unresolved events, and child-safe style.',
          'Return only JSON that matches the requested shape.',
        ].join('\n'),
        [
          `Project title: ${params.projectTitle}`,
          `Original idea: ${params.originalIdea}`,
          `Audience mode: ${params.audienceMode}`,
          `Previous chapters: ${JSON.stringify(params.previousChapters)}`,
          `Write chapter ${params.previousChapters.length + 1}. Return JSON with title, summary, body, ageRange, mainCharacterName, supportingCharacters, theme, sceneHints, and characterMemory.`,
        ].join('\n'),
      );
      const parsed = generatedStorySchema.parse(
        normaliseGeneratedStoryPayload(parseJsonObject(content), params.originalIdea || params.projectTitle),
      );
      return { ...parsed, providerMetadata: { provider: 'openai-compatible', model: this.model } };
    } catch (error) {
      console.warn('[storyTextService] continuation fallback:', error);
      return this.fallback.continueStory(params);
    }
  }
}

/**
 * Story text entry point. Phase 16.1 wires the Claude Narrative Engine in front
 * of the OpenAI-compatible provider: when `STORY_NARRATIVE_ENGINE_ENABLED` is set
 * and a `CLAUDE_API`/`ANTHROPIC_API_KEY` is present, `generateStory`/`continueStory`
 * run through Claude 3.5 Sonnet and fall back to the OpenAI-compatible + local chain
 * on any failure or when disabled.
 *
 * Built lazily through a Proxy so the require of `narrativeEngine` (which imports
 * parsers from THIS module) is deferred until first use — this keeps the CJS module
 * cycle load-order safe regardless of which module is imported first.
 */
let cachedStoryTextService: StoryTextProvider | undefined;

function buildStoryTextService(): StoryTextProvider {
  // Lazy require breaks the load-time cycle with narrativeEngine.
  const { ClaudeNarrativeEngineProvider } = require('./narrativeEngine') as typeof import('./narrativeEngine');
  return new ClaudeNarrativeEngineProvider(new OpenAICompatibleStoryTextProvider());
}

export const storyTextService: StoryTextProvider = new Proxy({} as StoryTextProvider, {
  get(_target, prop, receiver) {
    if (!cachedStoryTextService) cachedStoryTextService = buildStoryTextService();
    const value = Reflect.get(cachedStoryTextService, prop, cachedStoryTextService);
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(cachedStoryTextService) : value;
  },
});
