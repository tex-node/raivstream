import { describe, expect, it, vi } from 'vitest';
import {
  MovieDirector,
  buildDirectorUserMessage,
  cleanPromptText,
  findProblems,
  normaliseTag,
  splitScenePrompts,
  stripEmDashes,
  toScenePrompts,
  type DirectorInput,
} from '../index';
import { MOVIE_DIRECTOR_SYSTEM_PROMPT } from '../systemPrompt';

const baseInput: DirectorInput = {
  scene: 'A girl hands her grandfather the first mango of the season under the market awning.',
  cast: [
    { tag: 'Ada', description: '9-year-old girl, braided hair, yellow school dress' },
    { tag: '@Baba', imageReferenced: true, voice: 'A 70-year-old Yoruba man. Slow, warm.' },
  ],
  sceneCount: 2,
  format: 'CONTINUOUS',
  charCeiling: 2000,
};

function claudeReply(text: string) {
  return new Response(JSON.stringify({ content: [{ type: 'text', text }] }), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('movieDirector helpers', () => {
  it('strips em dashes but keeps meaning', () => {
    expect(stripEmDashes('She turns — slowly')).toBe('She turns, slowly');
    expect(stripEmDashes('left—right')).toBe('left-right');
    expect(stripEmDashes('one – two')).toBe('one - two');
  });

  it('cleans markdown the model may add', () => {
    expect(cleanPromptText('## Title\n**CUT** - wide\n\n\n\nnext')).toBe('Title\nCUT - wide\n\nnext');
  });

  it('normalises tags', () => {
    expect(normaliseTag('Ada')).toBe('@Ada');
    expect(normaliseTag('@@Old Man')).toBe('@Old_Man');
  });

  it('splits on scene markers and ignores preamble', () => {
    const raw = 'Sure!\n=== SCENE 1 ===\nfirst prompt\n=== SCENE 2 ===\nsecond prompt\n';
    expect(splitScenePrompts(raw)).toEqual(['first prompt', 'second prompt']);
  });

  it('treats unmarked output as one scene', () => {
    expect(splitScenePrompts('just one prompt')).toEqual(['just one prompt']);
  });

  it('flags wrong count and over-ceiling scenes', () => {
    const scenes = toScenePrompts(['a'.repeat(50), 'b'.repeat(120)], 100);
    expect(findProblems(scenes, 2, 100)).toHaveLength(1);
    expect(findProblems(scenes, 3, 100)).toHaveLength(2);
  });

  it('builds a brief with count, ceiling, cast and image-referenced handling', () => {
    const msg = buildDirectorUserMessage(baseInput);
    expect(msg).toContain('Number of scene prompts to deliver: 2');
    expect(msg).toContain('2,000 characters');
    expect(msg).toContain('@Ada: 9-year-old girl');
    expect(msg).toContain('@Baba: already image referenced');
    expect(msg).toContain('one continuous take');
  });

  it('system prompt has no em dashes and defines the delimiter', () => {
    expect(MOVIE_DIRECTOR_SYSTEM_PROMPT).not.toMatch(/—/);
    expect(MOVIE_DIRECTOR_SYSTEM_PROMPT).toContain('=== SCENE <n> ===');
  });
});

describe('MovieDirector.compose', () => {
  it('reports not configured without a key', async () => {
    const director = new MovieDirector({}, vi.fn());
    expect(director.isConfigured).toBe(false);
    await expect(director.compose(baseInput)).rejects.toThrow(/not configured/);
  });

  it('returns scenes without a repair when the first answer is right', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(claudeReply('=== SCENE 1 ===\nprompt one\n=== SCENE 2 ===\nprompt two — end'));
    const director = new MovieDirector({ CLAUDE_API: 'k' }, fetchImpl as unknown as typeof fetch);
    const out = await director.compose(baseInput);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(out.scenes.map((s) => s.prompt)).toEqual(['prompt one', 'prompt two, end']);
    expect(out.repaired).toBe(false);
    expect(out.warnings).toEqual([]);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.system).toBe(MOVIE_DIRECTOR_SYSTEM_PROMPT);
  });

  it('runs one repair pass when a scene is missing', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(claudeReply('=== SCENE 1 ===\nonly one'))
      .mockResolvedValueOnce(claudeReply('=== SCENE 1 ===\none\n=== SCENE 2 ===\ntwo'));
    const director = new MovieDirector({ ANTHROPIC_API_KEY: 'k' }, fetchImpl as unknown as typeof fetch);
    const out = await director.compose(baseInput);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(out.scenes).toHaveLength(2);
    expect(out.repaired).toBe(true);
    const repairBody = JSON.parse(fetchImpl.mock.calls[1][1].body);
    expect(repairBody.messages.at(-1).content).toContain('Deliver exactly 2');
  });

  it('keeps the first answer and warns when the repair is no better', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(claudeReply(`=== SCENE 1 ===\n${'x'.repeat(2100)}\n=== SCENE 2 ===\nok`))
      .mockResolvedValueOnce(claudeReply(`=== SCENE 1 ===\n${'y'.repeat(2200)}\n=== SCENE 2 ===\nok`));
    const director = new MovieDirector({ CLAUDE_API: 'k' }, fetchImpl as unknown as typeof fetch);
    const out = await director.compose(baseInput);
    expect(out.repaired).toBe(false);
    expect(out.scenes[0].withinCeiling).toBe(false);
    expect(out.warnings[0]).toMatch(/over the 2,000 limit/);
  });

  it('sends the previous result and note for revisions', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(claudeReply('=== SCENE 1 ===\na\n=== SCENE 2 ===\nb'));
    const director = new MovieDirector({ CLAUDE_API: 'k' }, fetchImpl as unknown as typeof fetch);
    await director.compose({ ...baseInput, revisionNote: 'too floaty', previousScenes: ['old a', 'old b'] });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.messages).toHaveLength(3);
    expect(body.messages[1].content).toContain('=== SCENE 2 ===\nold b');
    expect(body.messages[2].content).toContain('too floaty');
  });

  it('surfaces API errors', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('overloaded', { status: 529 }));
    const director = new MovieDirector({ CLAUDE_API: 'k' }, fetchImpl as unknown as typeof fetch);
    await expect(director.compose(baseInput)).rejects.toThrow(/529/);
  });
});
