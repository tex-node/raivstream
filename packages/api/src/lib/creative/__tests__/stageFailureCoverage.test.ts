import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A stage that only logs success cannot be gated.
 *
 * The previous lighthouse run produced no `stage=output` line because the output
 * FAILED branch logged nothing — so "output never ran" and "output failed" looked
 * identical from the log. This test enumerates every stage and requires a failure
 * disposition for each: either a `'fail'` call in the source, or an entry in the
 * acknowledged-gap list below.
 *
 * The gap list is the point: it is asserted to be EXACTLY these stages, so a new
 * stage added without a failure path fails the test, and fixing one requires
 * removing it here. Same shape as the enforcement test that kept
 * RENDER_SEGMENTS_ENABLED deleted.
 */

const STAGES = [
  'intent',
  'bible',
  'plan',
  'preview',
  'produce',
  'review',
  'director',
  'approval',
  'output',
] as const;

/**
 * Stages that currently log success but not failure. This list may only SHRINK.
 * Each entry names why it has no failure path yet.
 */
const ACKNOWLEDGED_WITHOUT_FAIL_PATH = new Set<string>([
  'intent', // service throws before any project-scoped log; the router maps to a tRPC error
  'bible', // seeding failure aborts project creation, so there is no project to name
  'plan', // builder throws out of the procedure; no catch at the service boundary
  'preview', // status update rejects invalid transitions with an exception
  'produce', // run failure is reported by [creative.production] run_finished, not a stage line
  'review', // per-asset failures are written into the run row, not a stage line
  'director', // failure throws before a directive exists
  'approval', // invalid decisions throw; no persisted row to annotate
]);

const SRC = resolve(__dirname, '../../../../../..');
const STAGE_LOG_CALLERS = [
  'packages/api/src/lib/creative/output/service.ts',
  'packages/api/src/lib/creative/production/service.ts',
  'packages/api/src/lib/creative/review/service.ts',
  'packages/api/src/lib/creative/director/service.ts',
  'packages/api/src/lib/creative/approval/service.ts',
  'packages/api/src/lib/creative/project/service.ts',
  'packages/api/src/routers/creative/intent.ts',
  'packages/api/src/routers/creative/project.ts',
];

function source(): string {
  return STAGE_LOG_CALLERS.map((p) => readFileSync(resolve(SRC, p), 'utf8')).join('\n');
}

describe('every stage has a success and a failure disposition', () => {
  const text = source();

  it('every stage logs its success path', () => {
    const missing = STAGES.filter((stage) => !new RegExp(`['"]${stage}['"]`).test(text));
    expect(missing).toEqual([]);
  });

  it('every stage either logs a failure or is an acknowledged gap', () => {
    const noFail = STAGES.filter((stage) => {
      const failed = new RegExp(`['"]${stage}['"]\\s*,\\s*'fail'`).test(text);
      return !failed && !ACKNOWLEDGED_WITHOUT_FAIL_PATH.has(stage);
    });
    expect(noFail).toEqual([]);
  });

  it('the acknowledged gap is exactly the known set — it may shrink, not grow', () => {
    expect([...ACKNOWLEDGED_WITHOUT_FAIL_PATH].sort()).toEqual(
      ['approval', 'bible', 'director', 'intent', 'plan', 'preview', 'produce', 'review'].sort(),
    );
  });

  it('output is NOT in the gap — it has a real failure line', () => {
    expect(ACKNOWLEDGED_WITHOUT_FAIL_PATH.has('output')).toBe(false);
    expect(/['"]output['"]\s*,\s*'fail'/.test(text)).toBe(true);
  });
});
