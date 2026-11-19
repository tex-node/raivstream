/**
 * External queue-health reader (2026-11-18).
 *
 * A worker cannot report its own absence. The health line inside `scripts/creative-worker.ts` prints from the process that would have to
 * die for the state to be interesting, and restarting it stamps a fresh liveness row that masks exactly the state being tested. This is the
 * outside view: it reads the liveness row, counts non-terminal runs, and prints ONE line. A later admin endpoint can reuse the same shape.
 *
 * The verdict comes from `queueHealth` itself, not a second copy of the rules: a reader that reimplements the check is a check that can
 * disagree with the worker's own line.
 *
 * Usage: ./node_modules/.bin/tsx scripts/creative-queue-health.ts
 */
import { prisma } from '../packages/database/index';
import { CREATIVE_WORKER_NAME, queueHealth, sweepExpiredRuns } from '../packages/api/src/lib/creative/jobs/productionWorker.ts';

(async () => {
  // `--sweep` turns the reader into the recovery path: it runs outside the worker, so it can fire on lease expiry even when the
  // worker is dead. A cron entry passes it; a human reading health does not.
  const doSweep = process.argv.includes('--sweep');
  const swept = doSweep ? await sweepExpiredRuns(prisma as never, Date.now()) : [];
  // `worker` is the primary key: the model field is `worker`, not `workerName`. The first version asked for `workerName`, which Prisma
  // rejects before it reaches the database - a reader that never printed a verdict, which is why it could not be claimed as working.
  const stamp = await prisma.workerHeartbeat.findUnique({ where: { worker: CREATIVE_WORKER_NAME } });
  const queued = await prisma.creativeProductionRun.count({ where: { status: 'RUNNING' } });
  const newestRunning = await prisma.creativeProductionRun.findFirst({
    where: { status: 'RUNNING' },
    orderBy: { heartbeatAt: 'desc' },
    select: { heartbeatAt: true },
  });

  const now = Date.now();
  const health = queueHealth({
    queued,
    workerLastSeenAt: stamp?.lastSeenAt ? stamp.lastSeenAt.getTime() : null,
    lastRunProgressAt: newestRunning?.heartbeatAt ? newestRunning.heartbeatAt.getTime() : null,
    now,
  });
  const age = stamp?.lastSeenAt ? Math.round((now - stamp.lastSeenAt.getTime()) / 1000) : null;
  if (doSweep) console.log(`[queue-health] swept=${swept.length}${swept.length ? ' ids=' + swept.join(',') : ''}`);
  console.log(
    `[queue-health] state=${health.state} queued=${queued} worker=${CREATIVE_WORKER_NAME} lastCheckIn=${
      age === null ? 'never' : `${age}s ago`
    } — ${health.detail}`,
  );
  await prisma.$disconnect();
})().catch(async (error) => {
  // Exit non-zero: a health reader that exits 0 when it cannot read is a lying status, and cron or CI would record it as a pass.
  console.error(`HEALTH_FAIL=${String((error as Error)?.message ?? error).slice(0, 300)}`);
  await prisma.$disconnect().catch(() => undefined);
  process.exitCode = 1;
});
