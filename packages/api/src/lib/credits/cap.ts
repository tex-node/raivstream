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

/**
 * How a capped run should REPORT itself (2026-11-05).
 *
 * The cap refused a charge correctly and the run still said COMPLETED: the guard changed what the
 * run DID and not what the run SAID. A guard that stops work must change the report, or every
 * capped run misreports as a success.
 *
 * `PARTIAL` is the honest status - some assets were produced and the run stopped short - and the
 * reason is machine-readable rather than prose, so a caller can branch on it without parsing.
 */
export type ProductionRunStatus = 'COMPLETED' | 'PARTIAL' | 'FAILED';

export function capStopReason(input: {
  ceiling: number;
  spent: number;
  assetIndex: number;
  totalAssets: number;
}): string {
  return `CREDIT_CAP_EXCEEDED ceiling=${input.ceiling} spent=${input.spent} stoppedAt=${input.assetIndex}/${input.totalAssets}`;
}

/**
 * A capped run is PARTIAL. A run that finished under its ceiling is COMPLETED - the fix must not
 * make every run look partial, or the status stops carrying information.
 */
export function finalRunStatus(input: {
  capHit: boolean;
  generated: number;
  failed: number;
  /** Scenes dropped by the moderation fallback: a documented gap, so the run is PARTIAL, never COMPLETED. */
  droppedScenes?: number;
}): ProductionRunStatus {
  if (input.capHit) return 'PARTIAL';
  if ((input.droppedScenes ?? 0) > 0) return 'PARTIAL';
  // Some assets were produced and some failed: the run is short, not finished. This is the
  // original semantics and it must survive the cap and drop cases above.
  if (input.failed > 0 && input.generated > 0) return 'PARTIAL';
  if (input.generated === 0 && input.failed > 0) return 'FAILED';
  return 'COMPLETED';
}
