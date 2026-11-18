/**
 * External queue-health reader (2026-11-18).
 *
 * A worker cannot report its own absence. The health line inside `scripts/creative-worker.ts` prints from the process that would have to
 * die for the state to be interesting, and restarting it stamps a fresh liveness row that masks exactly the state being tested. This is the
 * outside view: it reads the liveness row, counts non-terminal runs, and prints ONE line. A later admin endpoint can reuse the same shape.
 *
 * Usage: ./node_modules/.bin/tsx scripts/creative-queue-health.ts
 */
import { prisma } from '../packages/database/index';
import { CREATIVE_WORKER_NAME, queueHealth } from '../packages/api/src/lib/creative/jobs/productionWorker.ts';

(async () => {
  const stamp = await prisma.workerHeartbeat.findUnique({ where: { workerName: CREATIVE_WORKER_NAME } });
  const queued = await prisma.creativeProductionRun.count({ where: { status: 'RUNNING' } });
  const health = queueHealth({
    queued,
    workerLastSeenAt: stamp?.lastSeenAt ? stamp.lastSeenAt.getTime() : null,
    now: Date.now(),
  });
  const age = stamp?.lastSeenAt ? Math.round((Date.now() - stamp.lastSeenAt.getTime()) / 1000) : null;
  console.log(
    `[queue-health] state=${health.state} queued=${queued} worker=${CREATIVE_WORKER_NAME} lastCheckIn=${age === null ? 'never' : age + 's ago'} — ${health.detail}`,
  );
  process.exit(0);
})().catch((error) => {
  console.log('HEALTH_FAIL=' + String((error as Error)?.message ?? error).slice(0, 200));
  process.exit(0);
});
