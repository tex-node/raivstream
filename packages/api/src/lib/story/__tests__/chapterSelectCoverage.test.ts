import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A field added to a schema is not a field added to a query (2026-11-12).
 *
 * Twice in the same file, a consumer read a chapter field that `chapterSelect()` never returned:
 * `providerMetadata` (fixed in #394) and `storyContract` (fixed in #399). Both times the review read
 * the code correctly and the code read the query wrongly, and both times the output was *plausible* —
 * "no engine recorded", "unscored" — which is what let it survive review.
 *
 * **This is the narrow form, and it is a stopgap, not the fix.** It greps the evaluator's chapter
 * reads against the select's returned keys. It will not survive a rename, and it says nothing about
 * consumers it was not taught about. The general form — one shared field list that both the select and
 * its consumers read from — is the actual fix and is deferred as a refactor. Named as a stopgap so it
 * is not mistaken for the fix.
 *
 * It has been proven to fail: adding `chapter.title` to the evaluator without adding `title` to the
 * select turns this test red.
 */

const ROUTER = readFileSync(
  join(__dirname, '..', '..', '..', 'routers', 'story.ts'),
  'utf8',
);

function chapterSelectKeys(): Set<string> {
  const start = ROUTER.indexOf('function chapterSelect()');
  const block = ROUTER.slice(start, ROUTER.indexOf('} as const;', start));
  const keys = new Set<string>();
  for (const match of block.matchAll(/^\s{4}(\w+): true,/gm)) keys.add(match[1]!);
  return keys;
}

function evaluatorChapterReads(): Set<string> {
  const start = ROUTER.indexOf('evaluateStoryContract') >= 0 ? 0 : 0; // evaluator lives in lib, see below
  void start;
  const lib = readFileSync(join(__dirname, '..', 'storyContract.ts'), 'utf8');
  const fn = lib.slice(lib.indexOf('export function evaluateStoryContract'));
  const reads = new Set<string>();
  for (const match of fn.matchAll(/\bchapter\.(\w+)/g)) reads.add(match[1]!);
  return reads;
}

describe('every chapter field the evaluator reads is selected by chapterSelect', () => {
  it('the select covers the evaluator', () => {
    const selected = chapterSelectKeys();
    const read = evaluatorChapterReads();
    expect(selected.size).toBeGreaterThan(0);
    expect(read.size).toBeGreaterThan(0);
    const missing = [...read].filter((field) => !selected.has(field));
    expect(missing).toEqual([]);
  });

  it('the two fields that were actually missed are selected', () => {
    const selected = chapterSelectKeys();
    // Both arrived by separate sessions and were both missed; this is the regression pair.
    expect(selected.has('providerMetadata')).toBe(true);
    expect(selected.has('storyContract')).toBe(true);
  });
});
