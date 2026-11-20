import { describe, expect, it } from 'vitest';
import { WORKER_LOST_REASON, sweepExpiredRuns } from '../productionWorker';

/**
 * The sweep, callable from outside the worker (2026-11-19).
 *
 * It used to live only in the worker, so a run killed mid-flight stayed RUNNING because the only process that would notice was the one
 * that had died. These tests hold the function to its contract: only expired leases are swept, each becomes FAILED with the reason, and a
 * live run is untouched.
 */
function fakePrisma(rows: Array<{ id: string; status: string; heartbeatAt: Date | null; projectId?: string }>) {
  const updates: Array<{ where: { id: string }; data: Record<string, unknown> }> = [];
  const projectUpdates: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }> = [];
  return {
    updates,
    projectUpdates,
    creativeProductionRun: {
      findMany: async () => rows,
      update: async (args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown> => { updates.push(args); return args as unknown; },
    },
    creativeProject: {
      updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        projectUpdates.push(args);
        return { count: 1 };
      },
    },
  };
}

const NOW = 1_700_000_000_000;
const stale = new Date(NOW - 11 * 60 * 1000);
const live = new Date(NOW - 60 * 1000);

describe('sweepExpiredRuns', () => {
  it('sweeps only the expired lease, with the WORKER_LOST reason', async () => {
    const prisma = fakePrisma([
      { id: 'stale', status: 'RUNNING', heartbeatAt: stale, projectId: 'proj-1' },
      { id: 'live', status: 'RUNNING', heartbeatAt: live, projectId: 'proj-2' },
    ]);
    const swept = await sweepExpiredRuns(prisma as never, NOW);
    expect(swept).toEqual(['stale']);
    expect(prisma.updates).toHaveLength(1);
    expect(prisma.updates[0]!.data).toMatchObject({ status: 'FAILED', lastError: WORKER_LOST_REASON, stage: 'worker-lost' });
  });

  it('does nothing when every lease is live', async () => {
    const prisma = fakePrisma([{ id: 'live', status: 'RUNNING', heartbeatAt: live }]);
    expect(await sweepExpiredRuns(prisma as never, NOW)).toEqual([]);
    expect(prisma.updates).toHaveLength(0);
  });

  it('is idempotent: a swept run is no longer RUNNING, so a second pass finds nothing', async () => {
    const prisma = fakePrisma([]);
    expect(await sweepExpiredRuns(prisma as never, NOW)).toEqual([]);
    expect(prisma.updates).toHaveLength(0);
  });
});

describe('sweepExpiredRuns also frees the project', () => {
  it('resets GENERATING to REVIEW for the swept run\'s project, and only that project', async () => {
    const prisma = fakePrisma([
      { id: 'stale', status: 'RUNNING', heartbeatAt: stale, projectId: 'proj-1' },
      { id: 'live', status: 'RUNNING', heartbeatAt: live, projectId: 'proj-2' },
    ]);
    await sweepExpiredRuns(prisma as never, NOW);
    expect(prisma.projectUpdates).toEqual([{ where: { id: 'proj-1', status: 'GENERATING' }, data: { status: 'REVIEW' } }]);
  });
});
