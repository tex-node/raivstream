import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@raivstream/database';
import { sweepStuckExports } from '../startupSweep';
import { EXPORT_STUCK_THRESHOLD_MS } from '../../ffmpegSafety';

/**
 * D-033 startup sweep — the recovery half of the wedged-GENERATING fix.
 * A worker killed mid-render leaves rows in GENERATING; only the sweep can
 * bring them back.
 */

const MINUTE = 60_000;

function makePrisma(rows: Array<{ id: string }>) {
  const updates: Array<{ id: string; data: Record<string, unknown> }> = [];
  const prisma = {
    updates,
    storyVideoExport: {
      findMany: async () => rows,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        updates.push({ id: where.id, data });
        return { id: where.id, ...data };
      },
    },
  };
  return prisma as unknown as PrismaClient & { updates: typeof updates };
}

describe('sweepStuckExports', () => {
  it('1. resets an orphaned GENERATING row to PENDING and re-enqueues it', async () => {
    const prisma = makePrisma([{ id: 'exp-old' }]);
    const enqueue = vi.fn(async () => 'job-1');

    const now = Date.now();
    const result = await sweepStuckExports(prisma, enqueue, now);

    expect(result).toEqual({ scanned: 1, requeued: 1 });
    expect(prisma.updates[0]!.data.status).toBe('PENDING');
    expect(String(prisma.updates[0]!.data.errorMessage)).toContain('EXPORT_STUCK');
    expect(enqueue).toHaveBeenCalledWith('exp-old');
  });

  it('2. queries only rows older than the stuck threshold', async () => {
    const prisma = makePrisma([]);
    const findMany = vi.fn(async () => []);
    (prisma as unknown as { storyVideoExport: { findMany: unknown } }).storyVideoExport.findMany = findMany;

    const now = Date.now();
    await sweepStuckExports(prisma, async () => 'job', now);

    const args = (findMany.mock.calls[0] as unknown as [{ where: { updatedAt: { lt: Date } } }])[0];
    expect(args.where.updatedAt.lt.getTime()).toBe(now - EXPORT_STUCK_THRESHOLD_MS);
  });

  it('3. a fresh GENERATING row is not returned by the query, so nothing is touched', async () => {
    // The fake returns only what the query would return; an empty result means
    // the fresh row was filtered out by `updatedAt < cutoff`.
    const prisma = makePrisma([]);
    const enqueue = vi.fn(async () => 'job');

    const result = await sweepStuckExports(prisma, enqueue, Date.now());

    expect(result).toEqual({ scanned: 0, requeued: 0 });
    expect(enqueue).not.toHaveBeenCalled();
    expect(prisma.updates).toHaveLength(0);
  });

  it('4. is idempotent: a second sweep over an empty result re-enqueues nothing', async () => {
    const prisma = makePrisma([{ id: 'exp-old' }]);
    const enqueue = vi.fn(async () => 'job');

    await sweepStuckExports(prisma, enqueue, Date.now());
    const firstCount = enqueue.mock.calls.length;

    // After the first sweep the row is PENDING, so the query no longer matches.
    (prisma as unknown as { storyVideoExport: { findMany: unknown } }).storyVideoExport.findMany = async () => [];
    await sweepStuckExports(prisma, enqueue, Date.now());

    expect(firstCount).toBe(1);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(prisma.updates).toHaveLength(1);
  });
});
