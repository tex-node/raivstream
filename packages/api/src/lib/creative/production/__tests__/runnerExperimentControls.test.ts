import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The runner can reach per-shot specs (2026-11-04).
 *
 * It could not before: `runCreativeProduction` called `routeProduction(plan, bible)` with no
 * options, so per-shot specs were unreachable from the only path that resolves `characterRefs`
 * into `referenceImageUrls`. Every conditioning experiment therefore had to call `generateStill`
 * directly — and lost the conditioning the runner would have applied.
 *
 * Asserted at the source level because the runner needs a database, a queue and a provider to
 * execute; the contract worth pinning is "the option is threaded, and the filters are applied".
 */

const RUNNER = join(__dirname, '..', 'runner.ts');

describe('the runner exposes the experiment controls', () => {
  const source = readFileSync(RUNNER, 'utf8');

  it('threads perShot into routeProduction', () => {
    expect(source).toMatch(/routeProduction\(plan, bible, null, \{ perShot: options\.perShot \}\)/);
  });

  it('filters by scene so a run can cost one scene rather than the film', () => {
    expect(source).toContain('options.sceneIds');
    expect(source).toContain('options.sceneIds.includes(spec.sceneId)');
  });

  it('filters by kind so an image comparison does not also buy video', () => {
    expect(source).toContain('options.kinds');
    expect(source).toContain("options.kinds.includes(spec.kind as 'IMAGE' | 'VIDEO')");
  });

  it('still calls routeProduction with the bible, so references resolve', () => {
    expect(source).toMatch(/routeProduction\(plan, bible/);
  });
});
