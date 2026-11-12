import { describe, expect, it } from 'vitest';
import { normaliseCharacterMemory } from '../../../routers/story';

/**
 * The parser is the abstain path, not a seed (2026-11-12).
 *
 * The mechanism behind "Confrontin": `normaliseCharacterMemory` seeded `inferCharacterFromIdea(idea)`
 * unconditionally and merged the model's cast on top, so a fragment inferred from the sentence could
 * appear in a project whose generation had supplied real characters. The parser now contributes only
 * when the model supplies nothing - which is the abstain discipline the story contract uses, applied
 * to cast derivation.
 */

describe('the cast parser is only the abstain path', () => {
  it('does not contribute a parsed fragment when the model named the cast', () => {
    const cast = normaliseCharacterMemory('a lighthouse keeper and a lost bird', [
      { name: 'Elias', visualDescription: 'a weathered keeper in a wool coat' },
    ]);
    const names = cast.map((character) => character.name);
    expect(names).toContain('Elias');
    // Nothing inferred from the sentence joins the cast.
    expect(names).not.toContain('Lighthouse keeper');
    expect(names).not.toContain('Lost bird');
    expect(names).toHaveLength(1);
  });

  it('falls back to the parser only when the model supplied nothing', () => {
    const cast = normaliseCharacterMemory('a lighthouse keeper and a lost bird', []);
    expect(cast.length).toBeGreaterThan(0);
    expect(cast[0]!.name.length).toBeGreaterThan(0);
  });
});
