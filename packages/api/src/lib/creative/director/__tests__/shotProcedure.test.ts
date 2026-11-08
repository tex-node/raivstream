import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CreditCapExceededError } from '../../../credits/cap';
import { UnknownShotError } from '../shotDirective';
import { regenerateShotFromDirective } from '../shotProcedure';

/**
 * Exposing the director without giving it a way around the cap (2026-11-08).
 *
 * The module was proven last session; what this suite guards is the ORDER of the procedure: resolve
 * the shot, assert the ceiling, then charge. A director instruction spends, so if the assert runs
 * after the capability - or not at all - the director becomes an unbudgeted path, which is the
 * reuse-path defect in a new location.
 */

const PLAN = {
  scenes: [
    { sceneId: 'SCENE_01', shots: [{ shotId: 'SCENE_01_SHOT_01' }, { shotId: 'SCENE_01_SHOT_02' }] },
  ],
} as never;

function deps(overrides: Partial<Parameters<typeof regenerateShotFromDirective>[0]> = {}) {
  const order: string[] = [];
  const createNewTake = vi.fn(async () => {
    order.push('charge');
    return { takeNumber: 2 };
  });
  const base = {
    loadBudget: vi.fn(async () => {
      order.push('budget');
      return { runId: 'run_1', ceiling: 1680, spent: 840 };
    }),
    nextTakeCost: vi.fn(async () => 80),
    assertCeiling: vi.fn(() => {
      order.push('assert');
    }) as never,
    createNewTake,
  };
  return { deps: { ...base, ...overrides }, order, createNewTake };
}

describe('the procedure reaches the module', () => {
  it('calls createNewTake with the resolved shot id', async () => {
    const { deps: d, createNewTake } = deps();
    await regenerateShotFromDirective(d, { projectId: 'p1', plan: PLAN, instruction: 'redo shot 1B' });

    expect(createNewTake).toHaveBeenCalledTimes(1);
    expect(createNewTake).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'p1', sceneId: 'SCENE_01', shotId: 'SCENE_01_SHOT_02' }),
    );
  });
});

describe('the ceiling is asserted before the charge', () => {
  it('assert happens after the budget is read and before the capability is called', async () => {
    const { deps: d, order } = deps();
    await regenerateShotFromDirective(d, { projectId: 'p1', plan: PLAN, instruction: 'redo shot 1B' });
    expect(order).toEqual(['budget', 'assert', 'charge']);
  });

  it('a run at its ceiling refuses and the capability is never called', async () => {
    const { deps: d, createNewTake } = deps({
      loadBudget: vi.fn(async () => ({ runId: 'run_1', ceiling: 880, spent: 840 })) as never,
      assertCeiling: ((input: { ceiling: number | null; spent: number; nextCost: number }) => {
        if (input.spent + input.nextCost > (input.ceiling ?? Infinity)) {
          throw new CreditCapExceededError('run_1', input.ceiling ?? 0, input.spent, input.nextCost);
        }
      }) as never,
    });

    await expect(
      regenerateShotFromDirective(d, { projectId: 'p1', plan: PLAN, instruction: 'redo shot 1B' }),
    ).rejects.toBeInstanceOf(CreditCapExceededError);
    expect(createNewTake).not.toHaveBeenCalled();
  });

  it('no ceiling on the run means no refusal', async () => {
    const { deps: d, createNewTake } = deps({
      loadBudget: vi.fn(async () => ({ runId: null, ceiling: null, spent: 0 })) as never,
    });
    await regenerateShotFromDirective(d, { projectId: 'p1', plan: PLAN, instruction: 'redo shot 1B' });
    expect(createNewTake).toHaveBeenCalledTimes(1);
  });
});

describe('an unknown shot refuses typed, before anything is loaded', () => {
  it('throws UnknownShotError and never reads a budget or charges', async () => {
    const { deps: d, createNewTake } = deps();
    await expect(
      regenerateShotFromDirective(d, { projectId: 'p1', plan: PLAN, instruction: 'redo shot 9Z' }),
    ).rejects.toBeInstanceOf(UnknownShotError);
    expect(d.loadBudget).not.toHaveBeenCalled();
    expect(createNewTake).not.toHaveBeenCalled();
  });
});

describe('the router wiring matches the convention', () => {
  const router = readFileSync(join(__dirname, '..', '..', '..', '..', 'routers', 'creative', 'director.ts'), 'utf8');

  it('scopes the project lookup to the caller', () => {
    expect(router).toContain('where: { id: input.projectId, userId: ctx.user.id }');
  });

  it('maps UnknownShotError to NOT_FOUND, not a 500', () => {
    expect(router).toContain("if (error instanceof UnknownShotError)");
    expect(router).toMatch(/instanceof UnknownShotError[\s\S]{0,120}NOT_FOUND/);
  });

  it('passes the real ceiling assert rather than re-implementing it', () => {
    expect(router).toContain('assertCeiling: assertWithinCeiling');
  });

  it('keeps the existing procedures', () => {
    for (const procedure of ['direct:', 'propose:', 'applyInstruction:', 'explore:', 'applyDirective:', 'versions:']) {
      expect(router).toContain(procedure);
    }
  });
});
