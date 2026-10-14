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

/** Whether the run has reached a terminal state (no longer changing). */
export function batchRunIsTerminal(status: string): boolean {
  return status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED';
}

/**
 * R16-04 fix — the panel must stay mounted through terminal states, otherwise a
 * completed run unmounts the moment it leaves RUNNING and looks like a failure.
 */
export function batchRunShowsPanel(status: string): boolean {
  return batchRunIsActive(status) || batchRunIsTerminal(status);
}

export interface BatchPanelDescriptor {
  show: boolean;
  headline: string;
  showItems: boolean;
  showCancel: boolean;
  showResume: boolean;
  showRetry: boolean;
  showStartAnother: boolean;
}

/**
 * Plain-language panel state for a run status. R16 copy only — no credit-formula
 * language, no jargon.
 */
export function describeBatchPanel(
  status: string,
  summary: { total: number; ready: number; failed: number; done: number },
): BatchPanelDescriptor {
  const show = batchRunShowsPanel(status);
  const doneLabel = `${summary.done} of ${summary.total} done`;

  let headline: string;
  if (status === 'PAUSED') headline = `Paused — ${doneLabel}.`;
  else if (status === 'COMPLETED') headline = `Made ${summary.ready} of ${summary.total} — view them.`;
  else if (status === 'FAILED') headline = `${doneLabel}. Some pictures didn't work.`;
  else if (status === 'CANCELLED') headline = `Stopped — ${doneLabel}.`;
  else headline = 'Making your pictures…';

  return {
    show,
    headline,
    showItems: show,
    showCancel: status === 'RUNNING' || status === 'PAUSED',
    showResume: status === 'PAUSED',
    showRetry: (status === 'FAILED' || status === 'CANCELLED') && summary.failed > 0,
    showStartAnother: batchRunIsTerminal(status),
  };
}

/**
 * Default cap for the resume dialog: at least what has been used plus one more
 * item, so the first resume action can always make progress.
 */
export function defaultResumeCap(costUsedCredits: number, perItemCost: number): number {
  return Math.max(costUsedCredits + Math.max(perItemCost, 0), costUsedCredits + 1);
}
