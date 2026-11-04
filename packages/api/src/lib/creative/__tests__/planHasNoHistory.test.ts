import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The plan is edited; the history is appended (2026-11-04).
 *
 * The split at PR #335 put the dated narrative in `roadmap-history.md`. Six sessions later the
 * plan had grown from 480 to 566 lines and carried **16 dated lines** across five sections —
 * written by the same agent that had established the rule. Discipline did not hold; this test
 * does. It is the same shape as `schemaScope.test.ts`: a class that was fixed once and would
 * otherwise re-inherit.
 */

const PLAN_CANDIDATES = [
  join(__dirname, '../../../../../../docs/rushfeature.md'),
  join(process.cwd(), '../../docs/rushfeature.md'),
  join(process.cwd(), 'docs/rushfeature.md'),
];

const HISTORY_CANDIDATES = [
  join(__dirname, '../../../../../../docs/operations/roadmap-history.md'),
  join(process.cwd(), '../../docs/operations/roadmap-history.md'),
  join(process.cwd(), 'docs/operations/roadmap-history.md'),
];

function read(candidates: string[], label: string): string {
  const found = candidates.find((path) => existsSync(path));
  if (!found) throw new Error(`${label} not found; tried:\n${candidates.join('\n')}`);
  return readFileSync(found, 'utf8');
}

describe('the plan carries intent, not history', () => {
  const plan = read(PLAN_CANDIDATES, 'rushfeature.md');

  it('has no dated narrative — dated entries belong in the history', () => {
    const dated = plan
      .split('\n')
      .map((line, index) => ({ line, number: index + 1 }))
      .filter((entry) => /20[0-9]{2}-[01][0-9]-[0-3][0-9]/.test(entry.line));
    expect(dated.map((entry) => `${entry.number}: ${entry.line.slice(0, 80)}`)).toEqual([]);
  });

  it('points at the history for each phase that has status notes', () => {
    const pointers = plan.split('\n').filter((line) => line.startsWith('**Status.**'));
    expect(pointers.length).toBeGreaterThanOrEqual(5);
    for (const pointer of pointers) {
      expect(pointer).toMatch(/\(roadmap-history\.md#[a-z0-9-]+\)/);
    }
  });
});

describe('every pointer resolves to a real history heading', () => {
  const plan = read(PLAN_CANDIDATES, 'rushfeature.md');
  const history = read(HISTORY_CANDIDATES, 'roadmap-history.md');

  const anchor = (title: string): string =>
    title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/ /g, '-');

  const anchors = new Set(
    history
      .split('\n')
      .filter((line) => line.startsWith('## '))
      .map((line) => anchor(line.slice(3).trim())),
  );

  it('no dangling anchors', () => {
    const dangling = plan
      .split('\n')
      .filter((line) => line.startsWith('**Status.**'))
      .map((line) => (line.match(/#([a-z0-9-]+)\)/) ?? [])[1])
      .filter((fragment): fragment is string => Boolean(fragment) && !anchors.has(fragment));
    expect(dangling).toEqual([]);
  });
});
