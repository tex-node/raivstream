/**
 * R16-04 — pure helpers for the batch-generation UI (no DOM), so the dialog and
 * progress rules are unit-testable.
 */

export interface BatchItemLike {
  status: string;
}

/** Start is allowed only when the estimate fits under the cap (fail-closed). */
export function canStartBatch(estimated: number, cap: number): boolean {
  return Number.isFinite(cap) && cap > 0 && estimated <= cap;
}

/** Plain progress summary for the panel. */
export function summarizeBatch(items: BatchItemLike[]) {
  const total = items.length;
  const ready = items.filter((i) => i.status === 'READY').length;
  const failed = items.filter((i) => i.status === 'FAILED').length;
  const running = items.filter((i) => i.status === 'RUNNING').length;
  const queued = items.filter((i) => i.status === 'QUEUED').length;
  return { total, ready, failed, running, queued, done: ready + failed };
}

/** Whether the panel is shown for a run status. */
export function batchRunIsActive(status: string): boolean {
  return status === 'QUEUED' || status === 'RUNNING' || status === 'PAUSED';
}

/**
 * Default cap for the resume dialog: at least what has been used plus one more
 * item, so the first resume action can always make progress.
 */
export function defaultResumeCap(costUsedCredits: number, perItemCost: number): number {
  return Math.max(costUsedCredits + Math.max(perItemCost, 0), costUsedCredits + 1);
}
