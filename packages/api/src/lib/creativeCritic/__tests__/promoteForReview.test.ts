import { describe, it, expect, vi } from 'vitest';
import { promoteForReview } from '../promoteForReview';

function fakePrisma(state: { creativeStatus: string }) {
  const calls: Array<{ where: unknown; data: unknown }> = [];
  return {
    calls,
    storySceneAsset: {
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        calls.push({ where, data });
        // Mimic the SQL predicate: only matches when the row is DRAFT.
        if (where.creativeStatus === 'DRAFT' && state.creativeStatus === 'DRAFT') {
          state.creativeStatus = String(data.creativeStatus);
          return { count: 1 };
        }
        return { count: 0 };
      }),
      findUnique: vi.fn(async () => ({ creativeStatus: state.creativeStatus })),
    },
  };
}

describe('promoteForReview', () => {
  it('promotes a DRAFT asset to UNDER_REVIEW', async () => {
    const prisma = fakePrisma({ creativeStatus: 'DRAFT' });
    const res = await promoteForReview(prisma as never, 'asset-1', () => {});
    expect(res).toEqual({ promoted: true, status: 'UNDER_REVIEW' });
    expect(prisma.calls[0]).toMatchObject({
      where: { id: 'asset-1', creativeStatus: 'DRAFT' },
      data: { creativeStatus: 'UNDER_REVIEW' },
    });
  });

  it('leaves an APPROVED asset alone and logs why', async () => {
    const prisma = fakePrisma({ creativeStatus: 'APPROVED' });
    const log = vi.fn();
    const res = await promoteForReview(prisma as never, 'asset-1', log);
    expect(res).toEqual({ promoted: false, status: 'APPROVED' });
    // The condition is load-bearing: without it a re-review would demote a human
    // decision back to pending.
    expect(log).toHaveBeenCalledWith(expect.stringContaining('creativeStatus=APPROVED unchanged'));
  });

  it('leaves a REJECTED asset alone', async () => {
    const prisma = fakePrisma({ creativeStatus: 'REJECTED' });
    const res = await promoteForReview(prisma as never, 'asset-1', () => {});
    expect(res).toEqual({ promoted: false, status: 'REJECTED' });
  });
});
