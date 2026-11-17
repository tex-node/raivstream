import { describe, expect, it } from 'vitest';
import {
  CREATIVE_PRODUCTION_QUEUE,
  PRODUCTION_LEASE_MS,
  PRODUCTION_WORKER_CONCURRENCY,
  WORKER_LOST_REASON,
  isClaimable,
  queueHealth,
  runBatch,
  sweepableRuns,
  type ProductionRunRow,
} from '../productionWorker';

/**
 * The worker's contract (2026-11-17).
 *
 * The web tier enqueues and reads; the worker processes and writes; the run row is the only contract. These tests pin the
 * properties that make a 45-episode batch survivable: a bounded worker, a lease, a sweep that names the cause, a health
 * check that tells a dead worker from a slow one, and a batch that continues past a failure.
 */
const T0 = 1_700_000_000_000;

function run(overrides: Partial<ProductionRunRow> = {}): ProductionRunRow {
  return { id: 'run-1', status: 'RUNNING', attempt: 1, heartbeatAt: T0, ...overrides };
}

describe('the worker is bounded, and the bound lives on the worker', () => {
  it('names its own queue rather than reusing the story-export one', () => {
    expect(CREATIVE_PRODUCTION_QUEUE).toBe('creative-production');
  });

  it('fixes the unbounded default with a real concurrency', () => {
    // PROVIDER_MAX_CONCURRENCY defaults to 0 (unbounded) and bounds a PROCESS; the worker's own bound is what a batch respects.
    expect(PRODUCTION_WORKER_CONCURRENCY).toBeGreaterThan(0);
    expect(PRODUCTION_WORKER_CONCURRENCY).toBeLessThanOrEqual(8);
  });
});

describe('the lease and the sweep', () => {
  it('a live run is not claimable and not swept', () => {
    expect(isClaimable(run(), T0 + 1000)).toBe(false);
    expect(sweepableRuns([run()], T0 + 1000)).toEqual([]);
  });

  it('a run whose heartbeat expired is swept, and the reason names the worker', () => {
    const stale = run({ heartbeatAt: T0 });
    const late = T0 + PRODUCTION_LEASE_MS + 1;
    expect(sweepableRuns([stale], late)).toHaveLength(1);
    expect(WORKER_LOST_REASON).toMatch(/worker stopped/i);
    // A swept run is released for a retry rather than silently completed.
    expect(WORKER_LOST_REASON).toMatch(/retry/i);
  });

  it('an unclaimed row is claimable, a terminal one never is', () => {
    expect(isClaimable(run({ heartbeatAt: null }), T0)).toBe(true);
    expect(isClaimable(run({ status: 'COMPLETED' }), T0)).toBe(false);
  });
});

describe('a dead worker is distinguishable from a slow batch', () => {
  it('idle when nothing is waiting', () => {
    expect(queueHealth({ queued: 0, lastProcessedAt: null, now: T0 }).state).toBe('idle');
  });

  it('missing worker when work waits and nothing was ever processed', () => {
    const health = queueHealth({ queued: 5, lastProcessedAt: null, now: T0 });
    expect(health.state).toBe('missing-worker');
    expect(health.detail).toMatch(/Start the worker/i);
  });

  it('missing worker when work waits and the last progress is older than the lease', () => {
    const health = queueHealth({ queued: 5, lastProcessedAt: T0, now: T0 + PRODUCTION_LEASE_MS + 1 });
    expect(health.state).toBe('missing-worker');
    expect(health.detail).toMatch(/probably down/i);
  });

  it('healthy while a worker is progressing', () => {
    expect(queueHealth({ queued: 5, lastProcessedAt: T0, now: T0 + 30_000 }).state).toBe('healthy');
  });
});

describe('one failed episode does not stop the batch', () => {
  it('continues past a failure and reports both', async () => {
    const outcome = await runBatch([{ id: 'a' }, { id: 'b' }, { id: 'c' }], async (id) => {
      if (id === 'b') throw new Error('provider rejected shot 2');
    });
    expect(outcome.completed).toEqual(['a', 'c']);
    expect(outcome.failed).toEqual([{ id: 'b', reason: 'provider rejected shot 2' }]);
  });

  it('reports a whole batch as completed when nothing throws', async () => {
    const outcome = await runBatch([{ id: 'a' }, { id: 'b' }], async () => undefined);
    expect(outcome.completed).toHaveLength(2);
    expect(outcome.failed).toEqual([]);
  });
});
