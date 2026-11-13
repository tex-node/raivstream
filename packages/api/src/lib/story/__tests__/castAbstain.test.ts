import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normaliseCharacterMemory } from '../../../routers/story';
import { extractCastWithLLM } from '../../creative/intelligence/castExtractor';

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

describe('an empty cast means two different things, and now they are distinguishable', () => {
  const idea = 'a lighthouse keeper and a lost bird';
  const emptyModelReply = JSON.stringify({ characters: [] });

  it('a model that answered "no characters" is honoured - the parser does not overrule it', () => {
    // source: 'model' + [] is an ANSWER (a perfume commercial has no cast). Confrontin was worse.
    const cast = normaliseCharacterMemory(idea, [], { source: 'model' });
    expect(cast).toEqual([]);
  });

  it('no model is a different state, and the parser may fill it', () => {
    const cast = normaliseCharacterMemory(idea, [], { source: 'fallback' });
    expect(cast.length).toBeGreaterThan(0);
  });

  it('the two states do not produce the same cast', () => {
    expect(normaliseCharacterMemory(idea, [], { source: 'model' }))
      .not.toEqual(normaliseCharacterMemory(idea, [], { source: 'fallback' }));
  });

  it('the LLM extractor already honours [] and reports how it ran', async () => {
    const honoured = await extractCastWithLLM('a 15-second perfume commercial', { complete: async () => emptyModelReply });
    expect(honoured.cast).toEqual([]);
    expect(honoured.via).toBe('llm');

    const fallback = await extractCastWithLLM('a 15-second perfume commercial', { complete: async () => 'not json' });
    expect(fallback.via).toBe('fallback');
    expect(fallback.cast.length).toBeGreaterThan(0);
  });

  it('the story path derives the source from the engine that wrote the payload', () => {
    const router = readFileSync(join(__dirname, '..', '..', '..', 'routers', 'story.ts'), 'utf8');
    expect(router).toContain(".provider === 'local-fallback'");
    expect(router).toContain("? 'fallback'");
    expect(router).toContain('normaliseCharacterMemory(idea, story.characterMemory, { source: castSource })');
  });
});
