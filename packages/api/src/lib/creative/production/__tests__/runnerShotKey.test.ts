import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resumeKey } from '../resumeIndex';

/**
 * The runner's resume key includes the shot (2026-11-04).
 *
 * A per-shot run through the runner generated 0 assets and reported COMPLETED: the key was
 * `${sceneId}:${kind}`, so the scene-level composite made every shot spec look already done.
 * The video seed lookup was the mirror-image bug — VIDEO is scene-level, so its still lookup must
 * use the scene key even when stills are shot-keyed.
 *
 * The key shape now lives in `resumeIndex.ts` (2026-11-18) so the runner and the index cannot
 * drift, and so the winner among duplicates is decided by a rule rather than by row order.
 */

const RUNNER = join(__dirname, '..', 'runner.ts');

describe('the resume key addresses the shot', () => {
  it('a per-shot spec and the scene composite are different keys', () => {
    expect(resumeKey({ sceneId: 'SCENE_01', shotId: 'shot-a', kind: 'IMAGE' })).not.toBe(
      resumeKey({ sceneId: 'SCENE_01', shotId: null, kind: 'IMAGE' }),
    );
  });

  it('the video seed lookup uses the scene-level image key', () => {
    expect(resumeKey({ sceneId: 'SCENE_01', shotId: null, kind: 'IMAGE' })).toBe('SCENE_01:-:IMAGE');
  });
});

describe('the runner builds its index with the shared rule', () => {
  const source = readFileSync(RUNNER, 'utf8');

  it('imports the deterministic index instead of building a map inline', () => {
    expect(source).toContain("from './resumeIndex'");
    expect(source).toContain('buildResumeIndex(existing)');
    expect(source).not.toMatch(/new Map\(\s*existing\.map/);
  });

  it('reports shadowed duplicates instead of leaving them invisible', () => {
    expect(source).toContain('shadowed');
  });
});
