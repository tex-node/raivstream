/**
 * The creative production worker (2026-11-17).
 *
 * Its own process, its own `FAL_MAX_REQUESTS` budget, and its own provider concurrency. The web tier enqueues a
 * `CreativeProductionRun` and reads it; this process claims the row, runs the production, stamps the heartbeat and writes the
 * status. The row is the only contract between them, and no session state crosses.
 *
 * WHY IT EXISTS: `service.ts` fired `runCreativeProduction` with `void` inside the request process, so a batch shared the web
 * tier's process, its request budget and its restart. This is the separation, and `productionWorker.ts` holds the rules it obeys.
 *
 * Run it beside the app: `./node_modules/.bin/tsx scripts/creative-worker.ts` (or under PM2 as `raivstream-worker`).
 */
import { prisma } from '../packages/database/index';
import {
  CREATIVE_PRODUCTION_QUEUE,
  PRODUCTION_WORKER_CONCURRENCY,
  WORKER_LOST_REASON,
  queueHealth,
  sweepableRuns,
  type ProductionRunRow,
} from '../packages/api/src/lib/creative/jobs/productionWorker';

const WORKER_NAME = 'creative-worker';

async function main() {
  const { getBoss } = await import('../packages/api/src/lib/jobs/index.ts');
  const boss = await getBoss();

  // The bound the unbounded default was missing. Recorded rather than implied: this is what a batch respects.
  process.env.PROVIDER_MAX_CONCURRENCY = process.env.CREATIVE_WORKER_PROVIDER_CONCURRENCY ?? '2';
  console.log(`[${WORKER_NAME}] started: concurrency=${PRODUCTION_WORKER_CONCURRENCY} providerConcurrency=${process.env.PROVIDER_MAX_CONCURRENCY} queue=${CREATIVE_PRODUCTION_QUEUE}`);

  // The sweep runs at boot and on a timer: a run whose lease expired is released rather than silently stuck.
  const sweep = async () => {
    // A sweep failure must not kill the worker: logging it beats a process that cannot boot because a query is wrong.
    try {
    const rows = (await prisma.creativeProductionRun.findMany({
      where: { status: 'RUNNING' },
      select: { id: true, status: true, attempt: true, heartbeatAt: true },
    })) as Array<{ id: string; status: ProductionRunRow['status']; attempt: number; heartbeatAt: Date | null }>;
    const candidates: ProductionRunRow[] = rows.map((row) => ({
      id: row.id,
      status: row.status,
      attempt: row.attempt,
      heartbeatAt: row.heartbeatAt ? row.heartbeatAt.getTime() : null,
    }));
    const lost = sweepableRuns(candidates, Date.now());
    for (const row of lost) {
      await prisma.creativeProductionRun.update({
        where: { id: row.id },
        data: { status: 'FAILED', lastError: WORKER_LOST_REASON, stage: 'worker-lost' },
      });
      console.log(`[${WORKER_NAME}] swept run ${row.id}: ${WORKER_LOST_REASON}`);
    }
    } catch (error) {
      console.error(`[${WORKER_NAME}] sweep failed: ${String((error as Error)?.message ?? error).slice(0, 200)}`);
    }
  };
  await sweep();
  setInterval(() => void sweep(), 60_000);

  // THE QUEUE HAS TO EXIST. pg-boss does not create it on `work`, and the surfaced error said so plainly:
  // PGBOSS_QUEUE_NOT_FOUND - which is also why the story-export queue has never claimed a job in production
  // (2026-11-17). Creating it here is idempotent.
  await boss.createQueue(CREATIVE_PRODUCTION_QUEUE).catch((error: unknown) => {
    console.error(`[${WORKER_NAME}] createQueue failed: ${String((error as Error)?.message ?? error).slice(0, 200)}`);
  });

  // pg-boss v12 hands the handler an ARRAY of jobs. batchSize 1 keeps it one job, but the array is still the contract. `job.id` is NOT
  // populated by v12 (it printed `undefined` when the claim was proven), so CLAIMED carries the run id from job.data and `batch done`
  // stays the evidence that the handler completed. The claim line alone is never the proof.
  await boss.work<{ projectId: string; runId: string }>(
    CREATIVE_PRODUCTION_QUEUE,
    { batchSize: 1 },
    async ([job]) => {
      const { projectId, runId } = job.data;
      console.info(`[${WORKER_NAME}] CLAIMED runId=${runId} jobId=${job.id ?? 'undefined'} process=${WORKER_NAME}`);
      // The tail must print on EVERY exit, including a throw: the kill test reads `batch done` as the completion proof, and a handler
      // that dies after the runner finishes leaves a COMPLETED run with no completion line - which is exactly what step 1 captured
      // (2026-11-17). A throw is logged with its message rather than swallowed by pg-boss's retryLimit of 0.
      try {
        const { runCreativeProduction } = await import('../packages/api/src/lib/creative/production/runner.ts');
        await runCreativeProduction(prisma as never, { projectId, runId });
        console.info(`[${WORKER_NAME}] batch done: runId=${runId}`);
      } catch (error) {
        console.error(`[${WORKER_NAME}] job failed: ${String((error as Error)?.message ?? error).slice(0, 300)}`);
        console.info(`[${WORKER_NAME}] batch done: runId=${runId} outcome=error`);
        throw error;
      }
    },
  );

  // A health line a human reads before believing a batch is merely slow.
  setInterval(async () => {
    const queued = await prisma.creativeProductionRun.count({ where: { status: 'RUNNING' } });
    const newest = await prisma.creativeProductionRun.findFirst({ select: { heartbeatAt: true } });
    const health = queueHealth({ queued, lastProcessedAt: newest?.heartbeatAt?.getTime() ?? null, now: Date.now() });
    console.log(`[${WORKER_NAME}] health=${health.state} ${health.detail}`);
  }, 30_000);
}


main().catch((error) => {
  console.error(`[${WORKER_NAME}] failed to start`, error);
  process.exit(1);
});
