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
 * Assembly has its own queue (2026-11-18).
 *
 * The runner used to await `outputService.autoAssemble` inside its own `finally`, so the production job stayed claimed
 * for the whole FFmpeg export — minutes per episode, measured. The run row is written before assembly starts, so the
 * export belongs to a job of its own: a second `boss.work` on this queue lets the next episode start while the previous
 * one renders. No retry (`retryLimit: 0`) because `autoAssemble` creates a NEW output row per call: a retry would
 * duplicate the deliverable, so a failed assembly is a FAILED row plus a decision to re-run, not an automatic repeat.
 */
export const CREATIVE_ASSEMBLY_QUEUE = 'creative-assembly';

/**
 * An assembly still `GENERATING` after this long has outlived any render — the wall-clock cap is ten minutes — so its
 * worker is gone (2026-11-18). Measured, not guessed: eleven such rows were found in production, the oldest from the
 * first diagnosis and the rest from early November, each one a film the UI shows as forever rendering.
 *
 * The same constant answers "is an assembly in flight?" in `assembleProject`: a row past this age no longer blocks its
 * project, and the sweep marks it FAILED. One boundary, so a row can never be both blocking and swept.
 */
export const ASSEMBLY_STALE_MS = 60 * 60 * 1000;
export const OUTPUT_ORPHAN_REASON =
  'OUTPUT_ORPHANED: the worker stopped while this film was assembling, so it was released for a re-run.';

export interface OutputRow {
  id: string;
  status: string;
  createdAt: number;
}

/**
 * The assembly sweep. Returns the rows to mark FAILED — returned rather than mutated so the caller owns the write and
 * this stays testable against a clock, the same shape as `sweepableRuns`.
 */
export function sweepableOutputs(rows: OutputRow[], now: number): OutputRow[] {
  return rows.filter((row) => row.status === 'GENERATING' && now - row.createdAt > ASSEMBLY_STALE_MS);
}

/**
 * How many runs a single worker process may hold at once. This is the bound the unbounded default was missing: it is set on
 * the WORKER, not in the web tier, so an interactive relight never queues behind a 45-episode batch's box.
 */
export const PRODUCTION_WORKER_CONCURRENCY = 4;

/** A run whose heartbeat is older than this is presumed lost and swept. Generous: a single shot can legitimately take minutes. */
export const PRODUCTION_LEASE_MS = 10 * 60 * 1000;

/**
 * Worker liveness (2026-11-18) — a stamp the WORKER owns, not a run's heartbeat.
 *
 * `CreativeProductionRun.heartbeatAt` says "this run is progressing". A run that finished hours
 * ago keeps its last heartbeat forever, so judging the worker by it reports "probably down" while
 * the worker is alive and idle — the false positive the first live run captured, and the same
 * shape as judging a heartbeat that was never written at all. The worker now stamps
 * `WorkerHeartbeat.lastSeenAt` itself, on a timer, holding work or not.
 */
export const CREATIVE_WORKER_NAME = 'creative-worker';
export const WORKER_HEARTBEAT_INTERVAL_MS = 30 * 1000;
/** Two missed stamps. Deliberately shorter than the run lease: a dead worker is knowable sooner than a lost run. */
export const WORKER_LIVENESS_MS = 2 * 60 * 1000;

/** The reason a swept run carries, so a creator sees "the worker was lost", not a timeout. */
export const WORKER_LOST_REASON = 'WORKER_LOST: the worker stopped while this episode was running, so it was released for a retry.';

export type ProductionRunStatus = 'RUNNING' | 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'CANCELLED';

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
  /**
   * `healthy` — work is waiting and a worker is alive.
   * `idle` — nothing is waiting and a worker is alive.
   * `idle-no-worker` — nothing is waiting and no worker is alive. Not an alarm: nothing is lost.
   * `missing-worker` — work is waiting and no worker is alive. This is the alarm.
   */
  state: 'healthy' | 'idle' | 'idle-no-worker' | 'missing-worker';
  /** Why, in words a human reads before believing a batch is slow. */
  detail: string;
}

export interface QueueHealthInput {
  /** Runs that exist and are not terminal: waiting in pg-boss or in flight. */
  queued: number;
  /** `WorkerHeartbeat.lastSeenAt` for the creative worker; null = never checked in (or unreadable). */
  workerLastSeenAt: number | null;
  /** The newest RUNNING run's heartbeat. Detail only — a finished run's heartbeat would judge a live worker by work it is not doing. */
  lastRunProgressAt?: number | null;
  now: number;
  livenessMs?: number;
}

function secondsAgo(now: number, at: number): number {
  return Math.max(0, Math.round((now - at) / 1000));
}

/**
 * A worker that dies silently looks exactly like a slow batch. This distinguishes them — and it
 * distinguishes a worker that is merely IDLE from one that is GONE, which the run-heartbeat
 * version could not do: idle work leaves a stale (or absent) run heartbeat by definition.
 *
 * The verdict reads only the worker's own stamp. `queued` says whether anyone is waiting; the run
 * heartbeat is quoted, never trusted.
 */
export function queueHealth(input: QueueHealthInput): QueueHealth {
  const livenessMs = input.livenessMs ?? WORKER_LIVENESS_MS;
  const lastSeenAgo = input.workerLastSeenAt === null ? null : secondsAgo(input.now, input.workerLastSeenAt);
  // Compared on the raw timestamps, not the rounded display value: `secondsAgo` rounds, so a
  // boundary test against it is off by up to 500 ms.
  const alive = input.workerLastSeenAt !== null && input.now - input.workerLastSeenAt <= livenessMs;
  const seen = lastSeenAgo === null ? 'no worker has ever checked in' : `the worker's last check-in was ${lastSeenAgo}s ago`;
  const limit = Math.round(livenessMs / 1000);
  const progress =
    input.lastRunProgressAt != null ? ` Last run progress ${secondsAgo(input.now, input.lastRunProgressAt)}s ago.` : '';

  if (input.queued === 0) {
    if (alive) return { state: 'idle', detail: `No episodes are waiting, and ${seen}.` };
    return {
      state: 'idle-no-worker',
      detail: `No episodes are waiting, and ${seen}${lastSeenAgo === null ? '' : ` (limit ${limit}s)`}. Nothing is lost; a worker picks work up when it starts.`,
    };
  }

  if (!alive) {
    return {
      state: 'missing-worker',
      detail: `Episodes are queued and ${seen}${lastSeenAgo === null ? '' : `, past the ${limit}s limit`}. The worker is probably down.`,
    };
  }

  return { state: 'healthy', detail: `Episodes are queued and ${seen}.${progress}` };
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
