import { describe, expect, it } from 'vitest';
import {
  CREDIT_REFUSAL,
  deriveBatchCursor,
  isCreditBlocked,
  preflightResume,
  quoteRemaining,
  submitRemaining,
  type EpisodePlanRow,
  type EpisodeRunRow,
} from '../batchPlan';

/**
 * The resumable batch (2026-11-17).
 *
 * A creator may break a 120-page script and export five episodes, then resume when they are ready - especially after running out of
 * credits. So the batch's state is which episodes have a terminal run, derived from rows, and the worker never owns it.
 */
const plan: EpisodePlanRow[] = [1, 2, 3, 4, 5].map((n) => ({ episodeId: `e${n}`, episodeNumber: n, projectId: `p${n}` }));
const run = (episodeId: string, status: EpisodeRunRow['status'], failureReason?: string): EpisodeRunRow => ({
  episodeId, runId: `r-${episodeId}`, status, failureReason,
});

describe('the cursor is a query, not a stored field', () => {
  it('nothing started means everything is unstarted', () => {
    const cursor = deriveBatchCursor(plan, []);
    expect(cursor.unstarted).toHaveLength(5);
    expect(cursor.toSubmit.map((e) => e.episodeId)).toEqual(['e1', 'e2', 'e3', 'e4', 'e5']);
    expect(cursor.remaining).toHaveLength(5);
  });

  it('paused after three completions leaves two to submit', () => {
    const cursor = deriveBatchCursor(plan, [run('e1', 'COMPLETED'), run('e2', 'COMPLETED'), run('e3', 'COMPLETED')]);
    expect(cursor.completed).toHaveLength(3);
    expect(cursor.toSubmit.map((e) => e.episodeId)).toEqual(['e4', 'e5']);
  });

  it('an in-flight episode is never re-submitted', () => {
    const cursor = deriveBatchCursor(plan, [run('e1', 'RUNNING')]);
    expect(cursor.inFlight.map((e) => e.episodeId)).toEqual(['e1']);
    expect(cursor.toSubmit.map((e) => e.episodeId)).toEqual(['e2', 'e3', 'e4', 'e5']);
  });

  it('a credit refusal stays in remaining and is distinguishable from unstarted', () => {
    const cursor = deriveBatchCursor(plan, [run('e1', 'COMPLETED'), run('e2', 'FAILED', `${CREDIT_REFUSAL}: not enough credits`)]);
    expect(cursor.failed.map((e) => e.episodeId)).toEqual(['e2']);
    expect(isCreditBlocked(cursor.failed[0]!)).toBe(true);
    // The quote separates "blocked on money" from "work to do".
    const quote = quoteRemaining(cursor, 100);
    expect(quote.remainingEpisodes).toBe(4);
    expect(quote.blockedOnCredits).toBe(1);
    expect(quote.submittable).toBe(3);
  });

  it('pause-by-choice and pause-by-credits produce the same observable shape', () => {
    // Choice: episodes 4 and 5 simply have no runs. Credits: episode 4 has a FAILED credit run, 5 has none.
    const byChoice = deriveBatchCursor(plan, [run('e1', 'COMPLETED'), run('e2', 'COMPLETED'), run('e3', 'COMPLETED')]);
    const byCredits = deriveBatchCursor(plan, [
      run('e1', 'COMPLETED'), run('e2', 'COMPLETED'), run('e3', 'COMPLETED'), run('e4', 'FAILED', `${CREDIT_REFUSAL}: no`),
    ]);
    // Same remaining count, same nothing-running state - the worker never needs to know why it paused.
    expect(byChoice.remaining).toHaveLength(2);
    expect(byCredits.remaining).toHaveLength(2);
    expect(byChoice.inFlight).toHaveLength(0);
    expect(byCredits.inFlight).toHaveLength(0);
  });
});

describe('resume is idempotent at the batch level', () => {
  it('submitting twice with nothing changed submits zero the second time', async () => {
    const cursor = deriveBatchCursor(plan, [run('e1', 'COMPLETED'), run('e2', 'COMPLETED'), run('e3', 'COMPLETED')]);
    const first = await submitRemaining(cursor, async () => undefined);
    expect(first.submitted).toEqual(['e4', 'e5']);
    expect(first.skipped).toEqual(['e1', 'e2', 'e3']);

    // After the first submission those episodes now have runs; a second pass with nothing changed submits nothing.
    const after = deriveBatchCursor(plan, [
      run('e1', 'COMPLETED'), run('e2', 'COMPLETED'), run('e3', 'COMPLETED'), run('e4', 'COMPLETED'), run('e5', 'COMPLETED'),
    ]);
    const second = await submitRemaining(after, async () => undefined);
    expect(second.submitted).toEqual([]);
    expect(after.remaining).toHaveLength(0);
  });

  it('a resumed run does not duplicate the completed ones', async () => {
    const cursor = deriveBatchCursor(plan, [run('e1', 'COMPLETED'), run('e2', 'FAILED', 'provider error')]);
    const calls: string[] = [];
    await submitRemaining(cursor, async (episode) => { calls.push(episode.episodeId); });
    expect(calls).not.toContain('e1');
    expect(calls).toEqual(expect.arrayContaining(['e2', 'e3', 'e4', 'e5']));
  });
});

describe('the remaining cost is quoted before anything is charged', () => {
  it('quotes remaining episodes times the measured per-episode cost', () => {
    const cursor = deriveBatchCursor(plan, [run('e1', 'COMPLETED'), run('e2', 'COMPLETED')]);
    expect(quoteRemaining(cursor, 1_500)).toEqual({ remainingEpisodes: 3, credits: 4_500, submittable: 3, blockedOnCredits: 0 });
  });

  it('refuses the whole resume when the balance would not cover it', () => {
    const cursor = deriveBatchCursor(plan, []);
    const decision = preflightResume({ cursor, perEpisodeCost: 1_000, balance: 2_500 });
    expect(decision.submit).toBe(false);
    expect(decision.reason).toBe('insufficient-credits');
    expect(decision.quotedCredits).toBe(5_000);
  });

  it('permits a resume that fits, with the quote attached', () => {
    const cursor = deriveBatchCursor(plan, [run('e1', 'COMPLETED')]);
    const decision = preflightResume({ cursor, perEpisodeCost: 1_000, balance: 4_000 });
    expect(decision.submit).toBe(true);
    expect(decision.reason).toBe('ok');
    expect(decision.quotedCredits).toBe(4_000);
  });

  it('a finished plan submits nothing rather than quoting zero work', () => {
    const cursor = deriveBatchCursor(plan, plan.map((episode) => run(episode.episodeId, 'COMPLETED')));
    const decision = preflightResume({ cursor, perEpisodeCost: 1_000, balance: 99_999 });
    expect(decision.submit).toBe(false);
    expect(decision.reason).toBe('nothing-to-do');
  });
});
