/**
 * The creative production worker's transport and recovery (2026-11-17).
 *
 * TRANSPORT: **pg-boss, because it is already live.** `creative/jobs/index.ts` opens a PgBoss in the `pgboss` schema and
 * `exportJob.ts` registers a real worker for story exports — the queue is doing work, not sitting dormant, so this reuses it
 * rather than adding a second job table. The eleventh-instance rule, applied.
 *
 * THE CONTRACT IS THE RUN ROW. A job is a `CreativeProductionRun`; its status is the only thing web and worker share. Web
 * enqueues and reads; the worker processes and writes. No session state crosses the boundary — the row carries `projectId`,
 * and the creator's identity is already implied by project ownership.
 *
 * WHAT THIS EXISTS TO FIX: `service.ts` calls `void runCreativeProduction(...)` in the web tier, so a batch of 45 episodes
 * runs inside the request process. `PROVIDER_MAX_CONCURRENCY` bounds a single PROCESS (the limiter is in-memory), which means
 * the unbounded default bounds nothing across a batch, and a restart kills in-flight work — the recorded failure mode.
 *
 * RECOVERY: a run is leased. The worker stamps `stage` and a heartbeat; the sweep marks a run whose lease has expired as
 * FAILED with `WORKER_LOST`, and the batch continues — one episode failing must not stop episode four.
 */

/** The queue name, beside the story-export queue rather than replacing it. */
export const CREATIVE_PRODUCTION_QUEUE = 'creative-production';

/**
 * How many runs a single worker process may hold at once. This is the bound the unbounded default was missing: it is set on
 * the WORKER, not in the web tier, so an interactive relight never queues behind a 45-episode batch's box.
 */
export const PRODUCTION_WORKER_CONCURRENCY = 4;

/** A run whose heartbeat is older than this is presumed lost and swept. Generous: a single shot can legitimately take minutes. */
export const PRODUCTION_LEASE_MS = 10 * 60 * 1000;

/** The reason a swept run carries, so a creator sees "the worker was lost", not a timeout. */
export const WORKER_LOST_REASON = 'WORKER_LOST: the worker stopped while this episode was running, so it was released for a retry.';

export type ProductionRunStatus = 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface ProductionRunRow {
  id: string;
  status: ProductionRunStatus;
  attempt: number;
  /** The worker stamps its heartbeat here; `null` means nobody has claimed it. */
  heartbeatAt: number | null;
}

/** Only a claimable run is dispatched: RUNNING rows are either being worked or lost, never both. */
export function isClaimable(run: ProductionRunRow, now: number): boolean {
  if (run.status !== 'RUNNING') return false;
  if (run.heartbeatAt === null) return true;
  return now - run.heartbeatAt > PRODUCTION_LEASE_MS;
}

/**
 * The sweep. Returns the runs that should be marked FAILED with `WORKER_LOST` — and deliberately returns them rather than
 * mutating, so the caller owns the write and this stays testable against a clock.
 */
export function sweepableRuns(runs: ProductionRunRow[], now: number): ProductionRunRow[] {
  return runs.filter((run) => run.status === 'RUNNING' && run.heartbeatAt !== null && now - run.heartbeatAt > PRODUCTION_LEASE_MS);
}

export interface QueueHealth {
  state: 'healthy' | 'missing-worker' | 'idle';
  /** Why, in words a human reads before believing a batch is slow. */
  detail: string;
}

/**
 * A worker that dies silently looks exactly like a slow batch. This distinguishes them.
 *
 * `queued` is the count of runs waiting; `lastProcessedAt` is the newest run a worker finished or heartbeat. If work is
 * waiting and nothing has been processed for longer than the lease, the worker is missing — not slow.
 */
export function queueHealth(input: { queued: number; lastProcessedAt: number | null; now: number }): QueueHealth {
  if (input.queued === 0) return { state: 'idle', detail: 'No episodes are waiting.' };
  if (input.lastProcessedAt === null) {
    return { state: 'missing-worker', detail: 'Episodes are queued and no worker has ever processed one. Start the worker.' };
  }
  if (input.now - input.lastProcessedAt > PRODUCTION_LEASE_MS) {
    return { state: 'missing-worker', detail: 'Episodes are queued and nothing has been processed for longer than the lease. The worker is probably down.' };
  }
  return { state: 'healthy', detail: 'Episodes are queued and a worker is progressing.' };
}

export interface BatchOutcome {
  completed: string[];
  failed: Array<{ id: string; reason: string }>;
}

/**
 * Run a batch where ONE failure does not stop the rest — the property a 45-episode submission needs and a single-scene
 * runner never had to have. Sequential by design at this layer: the worker's concurrency is the process's, not this loop's.
 */
export async function runBatch(
  runs: Array<{ id: string }>,
  execute: (id: string) => Promise<void>,
): Promise<BatchOutcome> {
  const outcome: BatchOutcome = { completed: [], failed: [] };
  for (const run of runs) {
    try {
      await execute(run.id);
      outcome.completed.push(run.id);
    } catch (error) {
      outcome.failed.push({ id: run.id, reason: String((error as Error)?.message ?? error).slice(0, 300) });
    }
  }
  return outcome;
}
