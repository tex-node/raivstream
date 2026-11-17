/**
 * The batch plan and its derived cursor (2026-11-17).
 *
 * A BATCH IS A PLAN, NOT A SUBMISSION. A creator may break a 120-page script and export only the first five episodes, then
 * resume when they are ready — especially when the break was caused by insufficient tokens. So the batch's state cannot live in
 * a submission loop's local variables; it is **which episodes have a terminal run**, which is a query over rows that already
 * exist (`CreativeSeries` → `CreativeEpisode` → `CreativeProductionRun`).
 *
 * NO STORED CURSOR. A cursor field is a second source of truth that can drift from the runs it claims to describe — the same
 * shape as "store the measurement, derive the judgement", applied to progress.
 *
 * THE WORKER PROCESSES ONE RUN. It does not own a batch, a cursor, or a notion of "plan complete". The submitter is the loop;
 * the plan is the data. That is what makes a restart harmless: a restarted worker loses no batch state, because it never held any.
 */

export type RunStatus = 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface EpisodePlanRow {
  episodeId: string;
  /** Generation order, from the series' own episode numbering. */
  episodeNumber: number;
  projectId: string;
}

export interface EpisodeRunRow {
  episodeId: string;
  runId: string;
  status: RunStatus;
  /** Set for a credit refusal, so a run that could not charge is distinguishable from one that never started. */
  failureReason?: string | null;
}

export interface BatchCursor {
  /** Episodes with a COMPLETED run, in order. */
  completed: EpisodePlanRow[];
  /** Episodes whose latest run FAILED, with the reason — a credit refusal is a wait, not a retry-now. */
  failed: Array<EpisodePlanRow & { reason: string | null }>;
  /** Episodes with a run still RUNNING. Submitting these would duplicate work. */
  inFlight: EpisodePlanRow[];
  /** Episodes never started. */
  unstarted: EpisodePlanRow[];
  /** What a resume submits: unstarted + failed, in episode order, never inFlight. */
  toSubmit: EpisodePlanRow[];
  /** Everything the plan has not finished, which is what a cost quote is about. */
  remaining: EpisodePlanRow[];
}

export const CREDIT_REFUSAL = 'PAYMENT_REQUIRED';

/**
 * Derive the cursor. A run that is FAILED with a credit reason counts as **remaining but blocked**: it must not be re-submitted
 * until the balance is sufficient, and it must not be re-submitted blindly as if it were unstarted.
 */
export function deriveBatchCursor(plan: EpisodePlanRow[], runs: EpisodeRunRow[]): BatchCursor {
  const byEpisode = new Map<string, EpisodeRunRow>();
  for (const run of runs) {
    const existing = byEpisode.get(run.episodeId);
    // The newest terminal run wins; RUNNING outranks everything because work is in progress.
    if (!existing || run.status === 'RUNNING' || existing.status !== 'RUNNING') byEpisode.set(run.episodeId, run);
  }

  const ordered = [...plan].sort((a, b) => a.episodeNumber - b.episodeNumber);
  const completed: EpisodePlanRow[] = [];
  const failed: Array<EpisodePlanRow & { reason: string | null }> = [];
  const inFlight: EpisodePlanRow[] = [];
  const unstarted: EpisodePlanRow[] = [];

  for (const episode of ordered) {
    const run = byEpisode.get(episode.episodeId);
    if (!run) unstarted.push(episode);
    else if (run.status === 'COMPLETED') completed.push(episode);
    else if (run.status === 'RUNNING') inFlight.push(episode);
    else if (run.status === 'FAILED') failed.push({ ...episode, reason: run.failureReason ?? null });
    else unstarted.push(episode); // CANCELLED behaves as not-started for resume purposes.
  }

  const toSubmit = [...unstarted, ...failed.map(({ reason: _reason, ...episode }) => episode)];
  const remaining = [...inFlight, ...unstarted, ...failed];
  return { completed, failed, inFlight, unstarted, toSubmit, remaining };
}

/** Is this episode blocked on money rather than on work? */
export function isCreditBlocked(failed: { reason: string | null }): boolean {
  return String(failed.reason ?? '').includes(CREDIT_REFUSAL);
}

export interface ResumeQuote {
  remainingEpisodes: number;
  credits: number;
  /** Episodes that a resume can submit right now (credit-blocked ones excluded). */
  submittable: number;
  blockedOnCredits: number;
}

export function quoteRemaining(cursor: BatchCursor, perEpisodeCost: number): ResumeQuote {
  const blockedOnCredits = cursor.failed.filter(isCreditBlocked).length;
  return {
    remainingEpisodes: cursor.remaining.length,
    credits: cursor.remaining.length * perEpisodeCost,
    submittable: cursor.toSubmit.length - blockedOnCredits,
    blockedOnCredits,
  };
}

export interface ResumeDecision {
  submit: boolean;
  /** What the creator is told before anything is charged. */
  quotedCredits: number;
  submittable: number;
  reason: 'nothing-to-do' | 'insufficient-credits' | 'ok';
}

/**
 * REFUSE BEFORE THE FIRST CHARGE, not after the thirtieth. The `AUTO_DEFAULT_CEILING` lesson at batch scale: quote the remaining
 * cost, compare it against the balance, and decline the whole resume if it would not fit — a partial run the creator did not ask
 * for is worse than a refusal they can act on.
 */
export function preflightResume(input: { cursor: BatchCursor; perEpisodeCost: number; balance: number }): ResumeDecision {
  const quote = quoteRemaining(input.cursor, input.perEpisodeCost);
  if (quote.submittable <= 0) {
    return { submit: false, quotedCredits: 0, submittable: 0, reason: 'nothing-to-do' };
  }
  if (quote.credits > input.balance) {
    return { submit: false, quotedCredits: quote.credits, submittable: quote.submittable, reason: 'insufficient-credits' };
  }
  return { submit: true, quotedCredits: quote.credits, submittable: quote.submittable, reason: 'ok' };
}

/**
 * The submitter's loop: submit what the cursor says, **once per episode**, and let the caller own the run creation. Returns the
 * episodes it actually submitted, so a second call with nothing changed submits nothing — the idempotency property, at the level
 * of the batch rather than the run.
 */
export async function submitRemaining(
  cursor: BatchCursor,
  submit: (episode: EpisodePlanRow) => Promise<void>,
): Promise<{ submitted: string[]; skipped: string[] }> {
  const submitted: string[] = [];
  const skipped = cursor.completed.map((episode) => episode.episodeId);
  for (const episode of cursor.toSubmit) {
    await submit(episode);
    submitted.push(episode.episodeId);
  }
  return { submitted, skipped };
}
