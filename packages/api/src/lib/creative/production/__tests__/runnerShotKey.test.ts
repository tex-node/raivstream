import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The runner's resume key includes the shot (2026-11-04).
 *
 * A per-shot run through the runner generated 0 assets and reported COMPLETED: the key was
 * `${sceneId}:${kind}`, so the scene-level composite made every shot spec look already done.
 * The video seed lookup was the mirror-image bug — VIDEO is scene-level, so its still lookup must
 * use the scene key even when stills are shot-keyed.
 */

const RUNNER = join(__dirname, '..', 'runner.ts');

describe('resume keys address the shot', () => {
  const source = readFileSync(RUNNER, 'utf8');

  it('the per-spec key includes shotId', () => {
    expect(source).toMatch(/const key = `\$\{spec\.sceneId\}:\$\{\(spec as StillSpec\)\.shotId \?\? '-'\}:\$\{spec\.kind\}`/);
  });

  it('the byKey map is built with the same shape', () => {
    expect(source).toContain("(asset as { shotId?: string | null }).shotId ?? '-'");
  });

  it('the video seed still uses the scene-level image key', () => {
    expect(source).toContain('byKey.get(`${spec.sceneId}:-:IMAGE`)');
  });
});
