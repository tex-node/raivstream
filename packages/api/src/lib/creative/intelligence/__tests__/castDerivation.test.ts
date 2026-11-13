import { describe, expect, it } from 'vitest';
import { deriveCast, MAX_CAST } from '../service';
import { extractSubject, extractExplicitSignals } from '../../intent/interpreter';

/**
 * The lighthouse case, as a free test.
 *
 * `STORY` used to return `characters: []` unconditionally, so no creative project could
 * have a cast, no identity block composed, no reference resolved, and every still fell
 * through to text-to-image. Three sessions traced 0-50 identity scores to that array.
 * This test costs nothing and would have caught it before the first production.
 */

const LIGHTHOUSE = 'A 30-second animated short about a lighthouse keeper and a lost bird.';

function interpretation(text: string) {
  return {
    projectType: 'STORY' as const,
    explicit: extractExplicitSignals(text),
    inferred: { style: 'cinematic' },
    uncertain: [],
    questions: [],
    summary: `I understand this as a story targeting 30s.`,
  };
}

describe('explicit.subject is lifted from the idea', () => {
  it('captures the "about …" clause verbatim', () => {
    expect(extractSubject(LIGHTHOUSE)).toBe('a lighthouse keeper and a lost bird');
  });

  it('falls back to the whole idea when there is no "about" clause', () => {
    expect(extractSubject('A lonely robot waits for rain')).toBe('A lonely robot waits for rain');
  });

  it('reaches the interpretation', () => {
    expect(interpretation(LIGHTHOUSE).explicit.subject).toBe('a lighthouse keeper and a lost bird');
    // duration was already captured; this asserts the new field sits beside it
    expect(interpretation(LIGHTHOUSE).explicit.durationSeconds).toBe(30);
  });

  it('returns undefined for empty input rather than inventing a subject', () => {
    expect(extractSubject('   ')).toBeUndefined();
  });
});

describe('deriveCast produces the lighthouse cast', () => {
  const cast = deriveCast(interpretation(LIGHTHOUSE) as never);

  it('finds both characters', () => {
    expect(cast.map((c) => c.name)).toContain('Lighthouse Keeper');
    expect(cast.map((c) => c.name)).toContain('Lost Bird');
  });

  it('every character carries a non-empty visual description', () => {
    expect(cast.length).toBeGreaterThan(0);
    for (const character of cast) {
      expect(character.visualDescription.length).toBeGreaterThan(10);
      // Honest about being a proposal, matching the bible's stated rule that AI
      // assumptions are proposed, not canon.
      expect(character.visualDescription).toMatch(/pending creator approval/i);
    }
  });

  it('is bounded — an unbounded extraction would invent people', () => {
    const many = deriveCast(
      interpretation('a story about a keeper and a bird and a captain and a dog and a ghost and a child') as never,
    );
    expect(many.length).toBeLessThanOrEqual(MAX_CAST);
  });

  it('returns nothing for an idea with no subject at all', () => {
    expect(deriveCast({ projectType: 'STORY', explicit: {}, inferred: {}, uncertain: [], questions: [], summary: '' } as never)).toEqual([]);
  });

  it('de-duplicates repeated names', () => {
    const dupes = deriveCast(interpretation('a story about a keeper and a keeper and a bird') as never);
    const names = dupes.map((c) => c.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('domainKnowledgeFor gives STORY a cast at all', () => {
  it('no longer hardcodes an empty array', async () => {
    const { domainKnowledgeFor } = await import('../service');
      // MOVED (2026-11-13): domainKnowledgeFor is a CONSUMER now - it no longer derives a cast. The
  // caller that can await the extractor supplies it (seedBibleFromInterpretation). The extraction
  // path is proven in castGate.test.ts; this asserts the consumer passes the cast through.
  const supplied = [{ name: 'Elias', visualDescription: 'weathered keeper, wool coat', source: 'explicit-subject' as const }];
  const knowledge = domainKnowledgeFor(interpretation(LIGHTHOUSE) as never, { cast: supplied, source: 'llm' }) as { characters?: unknown[] };
    expect(Array.isArray(knowledge.characters)).toBe(true);
    expect(knowledge.characters!.length).toBeGreaterThan(0);
  });
});