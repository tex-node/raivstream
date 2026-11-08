import { describe, expect, it, vi } from 'vitest';
import { interpretDirective } from '../interpreter';
import {
  UnknownShotError,
  applyShotDirective,
  interpretShotDirective,
  resolveShotReference,
} from '../shotDirective';

/**
 * The director interface (2026-11-08).
 *
 * Phase 4 proved the capability - `createNewTake({ shotId })` scopes its predecessor lookup and
 * demotion to one slot, and the two partial unique indexes carry the scope. `DIRECTIVE_SCOPES` even
 * carried `'SHOT'` before anything resolved it. What was missing was the resolution and the routing,
 * which is all this module adds: no model call, no provider path, no parallel take machinery.
 *
 * The sibling-shot proof is split across two suites on purpose. THIS one proves the routing passes
 * exactly the named shot id, in one call. The storage-level proof that the sibling row is untouched
 * lives in `shotTakeRegeneration.test.ts` and `takeShotScope.test.ts`, which run the real
 * `createNewTake` against the two-shot fixture. Neither alone is the exit criterion.
 */

const PLAN = {
  scenes: [
    {
      sceneId: 'SCENE_01',
      shots: [
        { shotId: 'SCENE_01_SHOT_01' },
        { shotId: 'SCENE_01_SHOT_02' },
        { shotId: 'SCENE_01_SHOT_03' },
      ],
    },
    {
      sceneId: 'SCENE_02',
      shots: [{ shotId: 'SCENE_02_SHOT_01' }, { shotId: 'SCENE_02_SHOT_02' }],
    },
  ],
} as never;

describe('a sentence names a shot', () => {
  it('accepts a full shot id', () => {
    expect(resolveShotReference(PLAN, 'regenerate shot SCENE_01_SHOT_02')).toEqual({
      sceneId: 'SCENE_01',
      shotId: 'SCENE_01_SHOT_02',
    });
  });

  it('accepts scene + letter, the form a creator types', () => {
    expect(resolveShotReference(PLAN, 'redo shot 1B')).toEqual({
      sceneId: 'SCENE_01',
      shotId: 'SCENE_01_SHOT_02',
    });
  });

  it('accepts scene + number', () => {
    expect(resolveShotReference(PLAN, 'shot 2.2')).toEqual({
      sceneId: 'SCENE_02',
      shotId: 'SCENE_02_SHOT_02',
    });
  });

  it('accepts a bare scene number as that scene first shot', () => {
    expect(resolveShotReference(PLAN, 'shot 2')).toEqual({ sceneId: 'SCENE_02', shotId: 'SCENE_02_SHOT_01' });
  });

  it('returns null when the sentence names no shot', () => {
    expect(resolveShotReference(PLAN, 'make the ending happier')).toBeNull();
  });
});

describe('interpretShotDirective', () => {
  it('carries scope SHOT and the resolved id', () => {
    const result = interpretShotDirective(PLAN, 'regenerate shot 1B');
    expect(result.directive.scope).toBe('SHOT');
    expect(result.shot).toEqual({ sceneId: 'SCENE_01', shotId: 'SCENE_01_SHOT_02' });
    expect(result.directive.changes[0]).toMatchObject({
      scope: 'SHOT',
      field: 'shotId',
      to: 'SCENE_01_SHOT_02',
    });
  });

  it('points affectedSceneIndices at the named scene, not the last one', () => {
    expect(interpretShotDirective(PLAN, 'redo shot 1B').directive.affectedSceneIndices).toEqual([0]);
    expect(interpretShotDirective(PLAN, 'redo shot 2.1').directive.affectedSceneIndices).toEqual([1]);
  });

  it('refuses an unknown shot with a typed error', () => {
    expect(() => interpretShotDirective(PLAN, 'regenerate shot 9Z')).toThrow(UnknownShotError);
    try {
      interpretShotDirective(PLAN, 'regenerate shot 9Z');
    } catch (error) {
      expect((error as UnknownShotError).code).toBe('UNKNOWN_SHOT');
      expect((error as UnknownShotError).instruction).toContain('9Z');
    }
  });
});

describe('applyShotDirective routes to the existing take capability', () => {
  it('calls createNewTake once, with the named shot and its scene', async () => {
    const createNewTake = vi.fn(async () => ({ takeNumber: 2 }));
    const result = await applyShotDirective({ createNewTake }, PLAN, 'regenerate shot 1B');

    expect(createNewTake).toHaveBeenCalledTimes(1);
    expect(createNewTake).toHaveBeenCalledWith({ shotId: 'SCENE_01_SHOT_02', sceneId: 'SCENE_01' });
    expect(result.result).toEqual({ takeNumber: 2 });
  });

  it('never routes to an unnamed sibling', async () => {
    const seen: string[] = [];
    const createNewTake = vi.fn(async (input: { shotId: string }) => {
      seen.push(input.shotId);
      return {};
    });
    await applyShotDirective({ createNewTake }, PLAN, 'regenerate shot 2.2');
    expect(seen).toEqual(['SCENE_02_SHOT_02']);
    expect(seen).not.toContain('SCENE_02_SHOT_01');
  });

  it('does not call the capability at all when the shot is unknown', async () => {
    const createNewTake = vi.fn(async () => ({}));
    await expect(applyShotDirective({ createNewTake }, PLAN, 'regenerate shot 9Z')).rejects.toBeInstanceOf(
      UnknownShotError,
    );
    expect(createNewTake).not.toHaveBeenCalled();
  });
});

describe('the other scopes are unchanged', () => {
  // The regression this change could cause is a non-shot directive acquiring scope SHOT. The
  // interpreter's existing scopes are asserted by their own suites; here the contract is narrower
  // and honest: SHOT is only ever produced by the shot path.
  it("story directives keep their scope", () => {
    expect(interpretDirective('give me three endings', PLAN).scope).toBe('STORY');
  });

  it('no non-shot directive is given scope SHOT', () => {
    for (const instruction of ['give me three endings', 'change her wardrobe', 'make the lighting warmer']) {
      expect(interpretDirective(instruction, PLAN).scope).not.toBe('SHOT');
    }
  });

  it('a sentence with no shot reference refuses rather than defaulting to a shot', () => {
    expect(() => interpretShotDirective(PLAN, 'make the ending happier')).toThrow(UnknownShotError);
  });
});
