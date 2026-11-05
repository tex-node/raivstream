import type { PrismaClient } from '@raivstream/database';

/**
 * Per-run credit ceiling (Phase 7).
 *
 * The distinction that matters: the per-asset charge (80 for `generate:flux2`) is a RATE, not a
 * limit. A cap is "this run may spend at most N credits", counted per RUN and checked BEFORE the
 * charge - aborting ahead of the spend rather than reading the overrun off the ledger afterwards.
 *
 * The ceiling lives on the run row, not in memory, because a resumed run must remember its budget:
 * a money ceiling held in a variable starts again from zero on every restart.
 */

export class CreditCapExceededError extends Error {
  readonly code = 'CREDIT_CAP_EXCEEDED';
  constructor(
    readonly runId: string | null,
    readonly ceiling: number,
    readonly spent: number,
    readonly nextCost: number,
  ) {
    super(
      `Run ${runId ?? '(unpersisted)'} would spend ${spent + nextCost} credits, over its ceiling of ${ceiling} ` +
        `(spent ${spent}, next asset ${nextCost}).`,
    );
    this.name = 'CreditCapExceededError';
  }
}

/**
 * Throws when the NEXT asset would cross the ceiling. A null ceiling is uncapped, and a run that has
 * already spent something is not aborted for having spent it - only the next charge is refused.
 */
export function assertWithinCeiling(input: {
  runId: string | null;
  ceiling: number | null | undefined;
  spent: number;
  nextCost: number;
}): void {
  if (input.ceiling === null || input.ceiling === undefined) return;
  if (input.spent + input.nextCost <= input.ceiling) return;
  throw new CreditCapExceededError(input.runId, input.ceiling, input.spent, input.nextCost);
}

export interface RunBudget {
  ceiling: number | null;
  spent: number;
}

/**
 * Read the budget from the run row. This is what makes a resumed run respect the cap: the spend
 * comes from `creditsSpent`, which the previous attempt persisted, not from a fresh counter.
 */
export async function loadRunBudget(prisma: PrismaClient, runId: string | null): Promise<RunBudget> {
  if (!runId) return { ceiling: null, spent: 0 };
  const row = (await prisma.creativeProductionRun.findUnique({
    where: { id: runId },
    select: { creditCeiling: true, creditsSpent: true },
  })) as { creditCeiling: number | null; creditsSpent: number } | null;
  return { ceiling: row?.creditCeiling ?? null, spent: row?.creditsSpent ?? 0 };
}
