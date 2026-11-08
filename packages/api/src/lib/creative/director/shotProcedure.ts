import { UnknownShotError, interpretShotDirective, type ShotReference } from './shotDirective';
import type { CreativeProductionPlanState } from '../production/plan';

/**
 * Exposing the shot director beyond the module (2026-11-08).
 *
 * `applyShotDirective` proved the routing; this is the seam that makes it reachable from a
 * procedure without giving the director a way around the credit ceiling. The ordering is the whole
 * point: the ceiling is asserted BEFORE the capability is called, so a director instruction is
 * never an unbudgeted spend. If the assert throws, `createNewTake` is not reached - the same rule
 * the production runner applies before every charge.
 *
 * Kept dependency-injected so the ordering can be asserted directly rather than inferred from a
 * database state that takes a run to set up.
 */

export interface RegenerateShotDeps {
  /** Resolve the budget for the run this instruction belongs to (null when there is no run). */
  loadBudget: (projectId: string) => Promise<{ runId: string | null; ceiling: number | null; spent: number }>;
  /** The cost the take will charge, resolved the same way the charge resolves it. */
  nextTakeCost: () => Promise<number>;
  /** `assertWithinCeiling` from lib/credits/cap - injected so the refusal is provable. */
  assertCeiling: (input: { runId: string | null; ceiling: number | null; spent: number; nextCost: number }) => void;
  /** The existing capability. Unchanged. */
  createNewTake: (input: { projectId: string; sceneId: string; shotId: string; instruction: string }) => Promise<unknown>;
}

export interface RegenerateShotInput {
  projectId: string;
  plan: CreativeProductionPlanState;
  instruction: string;
}

export interface RegenerateShotResult {
  shot: ShotReference;
  directive: ReturnType<typeof interpretShotDirective>['directive'];
  budget: { runId: string | null; ceiling: number | null; spent: number };
  result: unknown;
}

export async function regenerateShotFromDirective(
  deps: RegenerateShotDeps,
  input: RegenerateShotInput,
): Promise<RegenerateShotResult> {
  // 1. Resolve the shot first: an unknown reference refuses before anything is loaded or charged.
  const interpreted = interpretShotDirective(input.plan, input.instruction);

  // 2. Ceiling before the charge - the director must not be a path that spends outside the cap.
  const budget = await deps.loadBudget(input.projectId);
  const nextCost = await deps.nextTakeCost();
  deps.assertCeiling({ runId: budget.runId, ceiling: budget.ceiling, spent: budget.spent, nextCost });

  // 3. The existing capability, unchanged.
  const result = await deps.createNewTake({
    projectId: input.projectId,
    sceneId: interpreted.shot.sceneId,
    shotId: interpreted.shot.shotId,
    instruction: input.instruction,
  });

  return { shot: interpreted.shot, directive: interpreted.directive, budget, result };
}

export { UnknownShotError };
