import { describe, expect, it, vi } from 'vitest';
import {
  EMPTY_STORY_CONTRACT,
  extractStoryContract,
  parseStoryContract,
  scoreStoryContract,
  storyContractPrompt,
  type StoryContract,
} from '../storyContract';

/**
 * The story contract (2026-11-12), and the one behaviour everything rests on: **the abstain.**
 *
 * The provenance probe (PR #395) proved `storyDna` cannot support this - it takes no chapter body,
 * derives conflict and resolution from scene-title regexes, and falls back to constants, so its
 * resolution is structurally incapable of being empty. A contract scored there would pass a story
 * that stops mid-sentence. These tests are written against that failure mode, not around it.
 */

const COMPLETE_BODY = `Mira kept the lighthouse alone. She wanted the lamp lit before the storm reached the bay.
The storm came early and the oil ran low. She carried the last can up the stairs and the wind took the door.
She lit the lamp with the last of the oil, and the boat found the channel in the dark.`;

const TRUNCATED_BODY = `Mira kept the lighthouse alone. She wanted the lamp lit before the storm reached the bay.
The storm came early and the oil ran low. She carried the last can up the stairs and the wind took the`;

const COMPLETE_CONTRACT_JSON = JSON.stringify({
  protagonist: 'Mira',
  want: 'to light the lamp before the storm',
  obstacle: 'the storm arrived early and the oil ran low',
  turn: 'the wind took the door as she carried the last can',
  resolution: { outcome: 'ANSWERED', text: 'She lit the lamp and the boat found the channel.' },
  sensoryAnchors: ['storm wind', 'lamp oil'],
});

describe('the prompt demands the abstain', () => {
  it('states that absent fields must be null, and forbids inferring them', () => {
    const prompt = storyContractPrompt();
    expect(prompt).toContain('return null');
    expect(prompt).toContain('Do not infer');
    expect(prompt).toContain('stops mid-sentence has resolution null');
  });

  it('tells the model not to use the idea or a plan', () => {
    expect(storyContractPrompt().toLowerCase()).toContain('do not use any idea');
  });
});

describe('a story that stops before its ending extracts null resolution', () => {
  it('the model abstains, and the contract records the absence', async () => {
    // The model is asked to abstain on a body that has no ending; this stub answers as the prompt
    // requires. The assertion is on our handling of the abstention.
    const callModel = vi.fn(async () =>
      JSON.stringify({ protagonist: 'Mira', want: 'to light the lamp', obstacle: 'the oil ran low', turn: null, resolution: null, sensoryAnchors: [] }),
    );
    const contract = await extractStoryContract({ body: TRUNCATED_BODY, callModel });

    expect(contract.resolution).toBeNull();
    expect(contract.turn).toBeNull();
    expect(contract.protagonist).toBe('Mira');
  });

  it('and the scorer fails it, with the reason named first', async () => {
    const contract = await extractStoryContract({
      body: TRUNCATED_BODY,
      callModel: async () => JSON.stringify({ protagonist: 'Mira', want: 'to light the lamp', obstacle: 'the oil ran low', turn: null, resolution: null }),
    });
    const score = scoreStoryContract(contract);

    expect(score.pass).toBe(false);
    expect(score.reasons[0]).toContain('RESOLUTION_MISSING');
    expect(score.present.resolution).toBe(false);
  });
});

describe('a complete story extracts all five fields', () => {
  it('and passes', async () => {
    const contract = await extractStoryContract({ body: COMPLETE_BODY, callModel: async () => COMPLETE_CONTRACT_JSON });
    expect(contract.protagonist).toBe('Mira');
    expect(contract.want).toBeTruthy();
    expect(contract.obstacle).toBeTruthy();
    expect(contract.turn).toBeTruthy();
    expect(contract.resolution).toEqual({ outcome: 'ANSWERED', text: 'She lit the lamp and the boat found the channel.' });

    const score = scoreStoryContract(contract);
    expect(score.pass).toBe(true);
    expect(score.reasons).toEqual([]);
  });
});

describe('the deterministic tier abstains instead of fabricating', () => {
  it('with no model, every field is null', async () => {
    const contract = await extractStoryContract({ body: COMPLETE_BODY, callModel: null });
    expect(contract).toMatchObject({ ...EMPTY_STORY_CONTRACT });
    expect(scoreStoryContract(contract).pass).toBe(false);
  });

  it('a malformed model response yields all null, never a partial contract', async () => {
    const contract = await extractStoryContract({ body: COMPLETE_BODY, callModel: async () => 'I could not find a turn, but here is a summary: ...' });
    expect(contract.protagonist).toBeNull();
    expect(contract.resolution).toBeNull();
    expect(contract.extractedBy).toBe('model');
  });

  it('a throwing model yields all null and is marked as an error', async () => {
    const contract = await extractStoryContract({
      body: COMPLETE_BODY,
      callModel: async () => {
        throw new Error('provider down');
      },
    });
    expect(contract.resolution).toBeNull();
    expect(contract.extractedBy).toBe('error');
  });

  it('a resolution object without a valid outcome is treated as absent', () => {
    const parsed = parseStoryContract(
      JSON.stringify({ protagonist: 'Mira', want: 'light', obstacle: 'oil', turn: 'door', resolution: { outcome: 'SOMETHING', text: 'x' } }),
      'model',
    );
    expect(parsed.resolution).toBeNull();
  });
});

describe('the scorer measures content, never shape', () => {
  const complete: StoryContract = {
    protagonist: 'Mira',
    want: 'to light the lamp',
    obstacle: 'the oil ran low',
    turn: 'the wind took the door',
    resolution: { outcome: 'ANSWERED', text: 'She lit the lamp.' },
    sensoryAnchors: ['wind'],
    extractedBy: 'model',
  };

  it('two stories of different length with the same content score equally', () => {
    const short = scoreStoryContract(complete);
    const long = scoreStoryContract({ ...complete, sensoryAnchors: ['wind', 'salt', 'oil', 'dark'] });
    expect(short).toEqual(long);
  });

  it('does not read the body, sections, beats or word counts at all', () => {
    // `reasons.length === 0` is an array check, not a shape signal, so the assertion is on the
    // inputs a shape contract would reach for: the body itself, paragraphs, sections, beats, words.
    const source = scoreStoryContract.toString();
    for (const forbidden of ['body', 'paragraph', 'section', 'beat', 'word', 'contract.length']) {
      expect(source).not.toContain(forbidden);
    }
  });

  it('a long story with no resolution still fails', () => {
    const padded = scoreStoryContract({ ...complete, resolution: null });
    expect(padded.pass).toBe(false);
  });

  it('states each missing content field as its own reason', () => {
    const score = scoreStoryContract({ ...EMPTY_STORY_CONTRACT });
    expect(score.reasons.join(' ')).toMatch(/PROTAGONIST_MISSING/);
    expect(score.reasons.join(' ')).toMatch(/WANT_MISSING/);
    expect(score.reasons.join(' ')).toMatch(/OBSTACLE_MISSING/);
    expect(score.reasons.join(' ')).toMatch(/TURN_MISSING/);
    expect(score.reasons.join(' ')).toMatch(/RESOLUTION_MISSING/);
  });
});

describe('storyDna is untouched by this work', () => {
  it('still falls back to its constants - it is the plan summary, not the contract', async () => {
    const { buildStoryDna } = await import('../../../routers/story');
    const dna = buildStoryDna({ title: 'x', originalIdea: 'a keeper and a bird' }, [], []);
    expect(dna.resolution).toBe('a positive ending with learning');
    expect(dna.conflict).toBe('a gentle obstacle to overcome');
  });
});
