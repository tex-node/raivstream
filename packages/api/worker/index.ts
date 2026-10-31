/**
 * D-033 — export worker entrypoint.
 *
 * Runs the `export.story` queue in its own PM2 process so a runaway render can
 * never block the web event loop (the ca25 failure mode). Shares Postgres and
 * the Redis cache with the web process.
 *
 * Boot order matters: register the handler *before* the sweep re-enqueues, or a
 * recovered row could be delivered with no consumer attached.
 */

import { prisma } from '@raivstream/database';
import { getBoss, stopBoss, enqueueStoryExport } from '../src/lib/jobs';
import { registerExportJob } from '../src/lib/jobs/exportJob';
import { sweepStuckExports } from '../src/lib/jobs/startupSweep';
import { sweepStuckCriticRuns } from '../src/lib/jobs/criticSweep';
import { sweepExpiredExportSegments } from '../src/lib/creative/output/exportSegments';
import { killAllChildren } from '../src/lib/childProcesses';

async function main(): Promise<void> {
  const boss = await getBoss();
  registerExportJob(boss, prisma);

  const { scanned, requeued } = await sweepStuckExports(prisma, enqueueStoryExport);
  // The critic queue needs the same reconciliation as the export queue: a run
  // orphaned by a restart stays RUNNING forever, and its score is the number a
  // phase can be judged by.
  const critic = await sweepStuckCriticRuns(prisma);
  // Segment retention: 30-day TTL (docs/operations/segment-cache-policy.md).
  const segments = await sweepExpiredExportSegments().catch(() => ({ scanned: 0, deleted: 0 }));
  console.info(
    `[worker] ready — queue=export.story stuck_sweep scanned=${scanned} requeued=${requeued} critic_sweep scanned=${critic.scanned} failed=${critic.failed}`,
  );

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.info(`[worker] ${signal} — reaping ffmpeg children and stopping the queue`);
    // Kill first: a render holding ffmpeg must not outlive the worker and starve
    // the shared VPS (D-031). pg-boss will re-deliver the abandoned job after
    // its expireInSeconds, and the startup sweep catches the GENERATING row.
    const killed = killAllChildren('SIGKILL');
    console.info(`[worker] killed ${killed} child process(es)`);

    try {
      await stopBoss({ graceful: false });
    } catch (error) {
      console.error('[worker] stopBoss failed:', error instanceof Error ? error.message : error);
    }
    await prisma.$disconnect().catch(() => undefined);
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  console.error('[worker] fatal:', error instanceof Error ? error.message : error);
  process.exit(1);
});
