import type { PrismaClient } from '@raivstream/database';

/**
 * Reconcile critic runs orphaned by a worker restart.
 *
 * A run that was mid-flight when the worker died stays RUNNING forever, because
 * nothing else ever writes to it. That is not just an untidy row: the critic's
 * `characterIdentityScore` is the number a phase can be judged by, so an orphaned
 * run is a *phase blocker*, not a hung job. The export queue has had a startup
 * sweep since D-033; the queue that produces the measurement needed one too.
 *
 * CreativeCriticRun has no `updatedAt`, so staleness is measured from `createdAt`.
 * That makes the sweep eventually-consistent: a run that orphans after boot is
 * caught on the next boot, not immediately.
 */
export const CRITIC_STUCK_THRESHOLD_MS = 10 * 60_000;

export async function sweepStuckCriticRuns(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<{ scanned: number; failed: number }> {
  const cutoff = new Date(now.getTime() - CRITIC_STUCK_THRESHOLD_MS);

  const stuck = await (prisma as any).creativeCriticRun.findMany({
    where: { status: 'RUNNING', createdAt: { lt: cutoff } },
    select: { id: true, assetId: true },
  });

  let failed = 0;
  for (const run of stuck as Array<{ id: string; assetId: string }>) {
    await (prisma as any).creativeCriticRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        completedAt: now,
        errorMessage: 'Critic run orphaned (worker restarted mid-run); no score was produced.',
      },
    });

    // The asset must not claim a critique that never finished. Only demote
    // UNDER_REVIEW assets: an approved/rejected one was decided elsewhere and
    // must not be reopened by a sweep.
    await (prisma as any).storySceneAsset.updateMany({
      where: { id: run.assetId, creativeStatus: 'UNDER_REVIEW' },
      data: { creativeStatus: 'DRAFT' },
    });

    failed += 1;
  }

  return { scanned: (stuck as unknown[]).length, failed };
}
