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
  runBatch,
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

  await boss.work<{ runIds: string[] }>(CREATIVE_PRODUCTION_QUEUE, async (job) => {
    const runIds = job.data?.runIds ?? [];
    console.log(`[${WORKER_NAME}] claimed ${runIds.length} run(s) as ${WORKER_NAME}`);
    const outcome = await runBatch(runIds.map((id) => ({ id })), async (id) => {
      // The production call itself is the web tier's existing runner; only the PROCESS changed. A run that throws is recorded
      // and the batch continues - one episode failing must not stop episode four.
      const { runCreativeProduction } = await import('../packages/api/src/lib/creative/production/runner.ts');
      await runCreativeProduction(prisma as never, { projectId: (await projectIdFor(id)) ?? '', runId: id } as never);
    });
    console.log(`[${WORKER_NAME}] batch done: completed=${outcome.completed.length} failed=${outcome.failed.length}`);
  });

  // A health line a human reads before believing a batch is merely slow.
  setInterval(async () => {
    const queued = await prisma.creativeProductionRun.count({ where: { status: 'RUNNING' } });
    const newest = await prisma.creativeProductionRun.findFirst({ select: { heartbeatAt: true } });
    const health = queueHealth({ queued, lastProcessedAt: newest?.heartbeatAt?.getTime() ?? null, now: Date.now() });
    console.log(`[${WORKER_NAME}] health=${health.state} ${health.detail}`);
  }, 30_000);
}

async function projectIdFor(runId: string): Promise<string | null> {
  const row = await prisma.creativeProductionRun.findUnique({ where: { id: runId }, select: { projectId: true } });
  return row?.projectId ?? null;
}

main().catch((error) => {
  console.error(`[${WORKER_NAME}] failed to start`, error);
  process.exit(1);
});
