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
import { hostname } from 'node:os';
import { prisma } from '../packages/database/index';
import { killAllChildren } from '../packages/api/src/lib/childProcesses';
import { reapOrphanedRenders } from '../packages/api/src/lib/creative/jobs/orphanReaper';
import {
  CREATIVE_ASSEMBLY_QUEUE,
  CREATIVE_PRODUCTION_QUEUE,
  CREATIVE_WORKER_NAME,
  PRODUCTION_WORKER_CONCURRENCY,
  WORKER_HEARTBEAT_INTERVAL_MS,
  WORKER_LOST_REASON,
  queueHealth,
  sweepableRuns,
  type ProductionRunRow,
} from '../packages/api/src/lib/creative/jobs/productionWorker';

const WORKER_NAME = 'creative-worker';

async function main() {
  const { getBoss } = await import('../packages/api/src/lib/jobs/index.ts');
  const boss = await getBoss();

  // Clean up after a worker that was killed (SIGKILL/OOM): its FFmpeg children survive the parent and keep rendering into
  // /tmp/raivstream-output-*. This process is the one that comes back, so it owns the cleanup (2026-11-18).
  await reapOrphanedRenders().catch((error: unknown) => {
    console.error(`[${WORKER_NAME}] orphan reap failed: ${String((error as Error)?.message ?? error).slice(0, 200)}`);
  });

  // The bound the unbounded default was missing. Recorded rather than implied: this is what a batch respects.
  process.env.PROVIDER_MAX_CONCURRENCY = process.env.CREATIVE_WORKER_PROVIDER_CONCURRENCY ?? '2';
  console.log(`[${WORKER_NAME}] started: concurrency=${PRODUCTION_WORKER_CONCURRENCY} providerConcurrency=${process.env.PROVIDER_MAX_CONCURRENCY} queues=${CREATIVE_PRODUCTION_QUEUE},${CREATIVE_ASSEMBLY_QUEUE}`);

  // The worker's OWN liveness stamp (2026-11-18). Not a run's heartbeat: this is written whether or not
  // the worker holds work, which is the only way an idle-but-alive worker can look alive. A run's
  // heartbeat is stale by definition when nothing is running, which is exactly how the first live run
  // reported `missing-worker ... probably down` while the worker was up.
  let livenessFailures = 0;
  const stampLiveness = async () => {
    try {
      await prisma.workerHeartbeat.upsert({
        where: { worker: CREATIVE_WORKER_NAME },
        create: { worker: CREATIVE_WORKER_NAME, lastSeenAt: new Date(), pid: process.pid, host: hostname() },
        update: { lastSeenAt: new Date(), pid: process.pid, host: hostname() },
      });
      livenessFailures = 0;
    } catch (error) {
      // A missing table (migration not applied yet) must not kill the worker - and must not be silent either.
      livenessFailures += 1;
      if (livenessFailures === 1) {
        console.error(`[${WORKER_NAME}] liveness stamp failed: ${String((error as Error)?.message ?? error).slice(0, 200)}`);
      }
    }
  };
  await stampLiveness();
  setInterval(() => void stampLiveness(), WORKER_HEARTBEAT_INTERVAL_MS);

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

  // The reaper runs on the same cadence: a render orphaned by a kill is cleaned up within a minute, not when someone notices
  // the CPU. It is safe while renders are live - it only targets processes whose parent is gone (2026-11-18).
  setInterval(() => {
    void reapOrphanedRenders().catch((error: unknown) => {
      console.error(`[${WORKER_NAME}] orphan reap failed: ${String((error as Error)?.message ?? error).slice(0, 200)}`);
    });
  }, 60_000);

  // THE QUEUE HAS TO EXIST. pg-boss does not create it on `work`, and the surfaced error said so plainly:
  // PGBOSS_QUEUE_NOT_FOUND - which is also why the story-export queue has never claimed a job in production
  // (2026-11-17). Creating it here is idempotent.
  await boss.createQueue(CREATIVE_PRODUCTION_QUEUE).catch((error: unknown) => {
    console.error(`[${WORKER_NAME}] createQueue failed: ${String((error as Error)?.message ?? error).slice(0, 200)}`);
  });
  // Assembly has its own queue and its own handler (2026-11-18). Two `work` registrations mean the next episode can start
  // while the previous one renders: the production slot is released when the run row is terminal, not when FFmpeg exits.
  await boss.createQueue(CREATIVE_ASSEMBLY_QUEUE).catch((error: unknown) => {
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

  // Assembly handler (2026-11-18). The plan is re-read from the project rather than carried in the payload, so the job
  // stays identity-only. `retryLimit: 0` lives on the sender: autoAssemble creates a NEW output row per call, so a retry
  // would duplicate the deliverable rather than repair it.
  await boss.work<{ projectId: string; runId: string | null }>(
    CREATIVE_ASSEMBLY_QUEUE,
    { batchSize: 1 },
    async ([job]) => {
      const { projectId, runId } = job.data;
      console.info(`[${WORKER_NAME}] ASSEMBLE projectId=${projectId} runId=${runId ?? 'null'} jobId=${job.id ?? 'undefined'}`);
      const { outputService } = await import('../packages/api/src/lib/creative/output/service.ts');
      const result = await outputService.assembleProject(prisma as never, projectId);
      console.info(
        `[${WORKER_NAME}] assemble done: projectId=${projectId} assembled=${result.assembled} blocked=${result.blocked} output=${result.outputId ?? 'none'}`,
      );
    },
  );

  // A health line a human reads before believing a batch is merely slow.
  setInterval(async () => {
    const queued = await prisma.creativeProductionRun.count({ where: { status: 'RUNNING' } });
    // Ordering is not cosmetic: an unordered `findFirst` read an arbitrary row, which is how a run
    // that was live and progressing got reported as "probably down".
    const newestRunning = await prisma.creativeProductionRun.findFirst({
      where: { status: 'RUNNING' },
      orderBy: { heartbeatAt: 'desc' },
      select: { heartbeatAt: true },
    });
    const workerRow = await prisma.workerHeartbeat
      .findUnique({ where: { worker: CREATIVE_WORKER_NAME }, select: { lastSeenAt: true } })
      .catch(() => null);
    const health = queueHealth({
      queued,
      workerLastSeenAt: workerRow?.lastSeenAt?.getTime() ?? null,
      lastRunProgressAt: newestRunning?.heartbeatAt?.getTime() ?? null,
      now: Date.now(),
    });
    console.log(`[${WORKER_NAME}] health=${health.state} ${health.detail}`);
  }, 30_000);

  // Graceful stop (2026-11-18). `pm2 stop`/`restart` and the deploy send a signal first; catching it means the encoders die
  // with the worker instead of outliving it. SIGKILL cannot be caught, which is why the reaper above exists as well.
  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.info(`[${WORKER_NAME}] ${signal} — reaping ffmpeg children and stopping the queues`);
    const killed = killAllChildren('SIGKILL');
    console.info(`[${WORKER_NAME}] killed ${killed} child process(es)`);
    try {
      const { stopBoss } = await import('../packages/api/src/lib/jobs/index.ts');
      await stopBoss({ graceful: false });
    } catch (error) {
      console.error(`[${WORKER_NAME}] stopBoss failed: ${String((error as Error)?.message ?? error).slice(0, 200)}`);
    }
    await prisma.$disconnect().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}


main().catch((error) => {
  console.error(`[${WORKER_NAME}] failed to start`, error);
  process.exit(1);
});
