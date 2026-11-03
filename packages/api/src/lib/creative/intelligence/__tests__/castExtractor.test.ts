import { describe, expect, it, vi } from 'vitest';
import { buildCastPrompt, extractCastWithLLM, gateIncludesCharacterIdentity, parseCastResponse } from '../castExtractor';
import { MAX_CAST } from '../service';

/**
 * The extractor that replaces `deriveCast()` for real ideas (2026-11-03).
 *
 * deriveCast splits English and returns fragments (`Confrontin`); this reads the creator's
 * own words with a model and returns the SAME shape the cast stage already consumes.
 * Everything here is about failing safely: a bad reply must fall back, never block.
 */

const good = JSON.stringify({
  characters: [
    { name: 'Amara', visualDescription: 'A young Nigerian woman in her late twenties, braided hair, mustard raincoat, worn leather satchel' },
    { name: 'Chidi', visualDescription: 'Her older brother, tall, close-cropped hair, navy fisherman sweater' },
  ],
});

describe('parsing is defensive', () => {
  it('keeps characters that carry both a name and a usable description', () => {
    expect(parseCastResponse(good)).toEqual([
      { name: 'Amara', visualDescription: expect.stringContaining('mustard raincoat'), source: 'explicit-subject' },
      { name: 'Chidi', visualDescription: expect.stringContaining('navy fisherman sweater'), source: 'explicit-subject' },
    ]);
  });

  it('drops a name without a description — the exact failure that made deriveCast useless', () => {
    const raw = JSON.stringify({ characters: [{ name: 'Confrontin', visualDescription: '' }] });
    expect(parseCastResponse(raw)).toEqual([]);
  });

  it('bounds the cast at MAX_CAST even if the model over-produces', () => {
    const many = { characters: Array.from({ length: 9 }, (_, i) => ({ name: `C${i}`, visualDescription: 'a clear, drawable description here' })) };
    expect(parseCastResponse(JSON.stringify(many))!.length).toBe(MAX_CAST);
  });

  it('returns null for junk, prose, or missing fields', () => {
    for (const raw of ['', 'no json here', '{"characters": "nope"}', '{"characters":[{}]}']) {
      const parsed = parseCastResponse(raw);
      expect(parsed === null || parsed.length === 0).toBe(true);
    }
  });

  it('tolerates prose around the JSON', () => {
    expect(parseCastResponse(`Here you go:\n${good}\nHope that helps.`)!.length).toBe(2);
  });
});

describe('extractCastWithLLM fails open', () => {
  it('uses the model when it answers usefully', async () => {
    const complete = vi.fn(async () => good);
    const result = await extractCastWithLLM('a story about a young woman returning home', { complete });
    expect(result.via).toBe('llm');
    expect(result.cast.map((c) => c.name)).toEqual(['Amara', 'Chidi']);
  });

  it('falls back to deriveCast when no model is configured', async () => {
    const result = await extractCastWithLLM('a story about a lighthouse keeper and a lost bird', {});
    expect(result.via).toBe('fallback');
  });

  it('an empty array is a valid answer, not a fallback', async () => {
    const result = await extractCastWithLLM('Create a 30-second launch campaign for a perfume', {
      complete: async () => JSON.stringify({ characters: [] }),
    });
    expect(result.via).toBe('llm');
    expect(result.cast).toEqual([]);
  });

  it('falls back only when the reply is genuinely unparseable', async () => {
    for (const complete of [
      async () => { throw new Error('provider down'); },
      async () => 'no json',
      async () => JSON.stringify({ characters: 'nope' }),
    ]) {
      const result = await extractCastWithLLM('a story about a keeper and a bird', { complete });
      expect(result.via).toBe('fallback');
    }
  });

  it('the prompt states the bound and forbids invention', () => {
    const prompt = buildCastPrompt('an idea');
    expect(prompt).toContain(String(MAX_CAST));
    expect(prompt.toLowerCase()).toContain('never invent');
  });
});

describe('the gate is scoped to formats that can contain a character', () => {
  it('narrative types include characterIdentity', () => {
    for (const type of ['STORY', 'DRAMA', 'NARRATIVE']) expect(gateIncludesCharacterIdentity(type)).toBe(true);
  });

  it('commercial, education and promotion do not', () => {
    for (const type of ['COMMERCIAL', 'EDUCATION', 'PROMOTION', 'BRAND']) expect(gateIncludesCharacterIdentity(type)).toBe(false);
  });

  it('an unknown type stays in scope rather than silently skipping the gate', () => {
    expect(gateIncludesCharacterIdentity(null)).toBe(true);
    expect(gateIncludesCharacterIdentity('SOMETHING_NEW')).toBe(false);
  });
});
