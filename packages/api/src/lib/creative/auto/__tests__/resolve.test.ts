import { describe, expect, it } from 'vitest';
import { autoResolveIntent } from '../resolve';

/**
 * Auto mode's server half (Phase 7).
 *
 * Before this, `canAutoDecide` existed only as a UI affordance: the panel offered "Let Raivstream
 * decide" and no server code ever decided. These tests pin the policy AND its refusal, because a
 * "no questions" mode that invents answers is worse than one that asks.
 */

const base = {
  projectType: 'STORY',
  explicit: { genre: 'thriller', tone: 'quiet', format: 'vertical', audience: 'adults', durationSeconds: 30 },
  inferred: {},
  summary: 'A lighthouse keeper finds a lost bird',
  uncertain: [],
} as never;

function question(id: string, canAutoDecide: boolean, options = ['Option A', 'Option B']) {
  return { id, prompt: `Question ${id}`, options, canAutoDecide };
}

function withQuestions(questions: unknown[]) {
  return { ...(base as Record<string, unknown>), questions } as never;
}

describe('auto mode decides every deferrable question', () => {
  it('an interpretation with no questions needs no decisions and is not blocked', () => {
    const result = autoResolveIntent(withQuestions([]));
    expect(result.ok).toBe(true);
    expect(result.decisions).toEqual([]);
    expect(result.blockedBy).toEqual([]);
  });

  it('every auto-decidable question gets exactly one decision', () => {
    const result = autoResolveIntent(withQuestions([question('q1', true), question('q2', true)]));
    expect(result.ok).toBe(true);
    expect(result.decisions.map((d) => d.id)).toEqual(['q1', 'q2']);
    expect(result.decisions.every((d) => d.choice.length > 0)).toBe(true);
  });

  it('uses the creator\'s own words when an option matches them', () => {
    const result = autoResolveIntent(withQuestions([question('tone', true, ['quiet', 'loud'])]));
    expect(result.decisions[0].choice).toBe('quiet');
    expect(result.decisions[0].decidedBy).toBe('explicit');
  });

  it('falls back to the first option, never to an empty answer', () => {
    const result = autoResolveIntent(withQuestions([question('pacing', true, ['steady', 'frenetic'])]));
    expect(result.decisions[0].choice).toBe('steady');
    expect(result.decisions[0].decidedBy).toBe('default');
  });
});

describe('auto mode refuses rather than inventing', () => {
  it('a question that cannot be auto-decided blocks the run and is named', () => {
    const result = autoResolveIntent(withQuestions([question('q1', true), question('budget', false)]));
    expect(result.ok).toBe(false);
    expect(result.blockedBy).toEqual(['budget']);
  });

  it('the blocked question never receives a decision', () => {
    const result = autoResolveIntent(withQuestions([question('q1', true), question('budget', false)]));
    expect(result.decisions.map((d) => d.id)).toEqual(['q1']);
  });

  it('several blockers are all reported, not just the first', () => {
    const result = autoResolveIntent(withQuestions([question('a', false), question('b', false)]));
    expect(result.blockedBy).toEqual(['a', 'b']);
  });
});
