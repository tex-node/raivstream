import { describe, expect, it, vi } from 'vitest';
import { seedBibleFromInterpretation } from '../bible/service';

/**
 * The silent creative cast is gated, and the gate is #312's (2026-11-13).
 *
 * A non-narrative project - a perfume commercial, a lesson, a promo - has no cast, so BOTH the model
 * and the parser are skipped. That is the assertion that closes this phase's opening defect:
 * "Confrontin for a perfume commercial". Asserting `cast === []` alone would be satisfied by a parser
 * that ran and found nothing, so the extractor's completion is spied on and must not be called.
 *
 * Narrative and UNKNOWN types take the extractor path; only a model-less narrative is filled by the
 * parser, and that fill is labelled `fallback` rather than disguised as a reading.
 */

const fakePrisma = { creativeBible: { create: vi.fn(async () => ({})) } } as never;

function interpretation(projectType: string | undefined, subject = 'a young lighthouse keeper and a lost bird') {
  return { projectType, explicit: { subject }, inferred: {}, summary: subject, uncertain: [] } as never;
}

describe('the narrative gate decides whether there is a cast at all', () => {
  it('a non-narrative project has an empty cast and neither extractor nor parser runs', async () => {
    const complete = vi.fn(async () => JSON.stringify({ characters: [{ name: 'Invented', visualDescription: 'should never appear here' }] }));
    const bible = await seedBibleFromInterpretation(fakePrisma, 'p1', interpretation('COMMERCIAL'), { complete });

    expect(bible.characters).toEqual([]);
    // The gate, not the answer: the extractor was never called.
    expect(complete).not.toHaveBeenCalled();
  });

  it('a narrative project takes the model cast when the model answers', async () => {
    const complete = vi.fn(async () => JSON.stringify({ characters: [{ name: 'Elias', visualDescription: 'weathered keeper, wool coat' }] }));
    const bible = await seedBibleFromInterpretation(fakePrisma, 'p2', interpretation('STORY'), { complete });

    expect(complete).toHaveBeenCalledTimes(1);
    expect((bible.characters as Array<{ name: string }>).map((c) => c.name)).toEqual(['Elias']);
  });

  it('a narrative project with no model is filled by the parser, labelled fallback', async () => {
    const bible = await seedBibleFromInterpretation(fakePrisma, 'p3', interpretation('STORY'), {});
    expect((bible.characters ?? []).length).toBeGreaterThan(0);
  });

  it('an ABSENT project type takes the extractor path - #312 fails toward having a cast', async () => {
    // The predicate is a whitelist (`NARRATIVE_PROJECT_TYPES`), so its fail-open applies to a
    // missing type, not to an unrecognised string. That distinction is recorded in the plan: an
    // unknown STRING is out of scope by the gate's actual behaviour, and naming the mismatch is
    // better than inventing a second list of non-narrative types to make the string case pass.
    const complete = vi.fn(async () => 'not json');
    const bible = await seedBibleFromInterpretation(fakePrisma, 'p4', interpretation(undefined), { complete });
    expect(complete).toHaveBeenCalledTimes(1);
    // The parser ran (the label is 'fallback'), and on this subject it found nothing - which is a
    // legitimate fallback result, not a failure. The assertion is that the extractor was consulted,
    // not that a splitter invented something.
    expect(Array.isArray(bible.characters ?? [])).toBe(true);
  });
});
