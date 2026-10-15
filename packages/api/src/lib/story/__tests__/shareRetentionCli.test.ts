/**
 * Phase 4b — the share-retention CLI core must invoke the SAME function the
 * admin procedure uses, so the scheduled cron and the manual admin trigger
 * cannot drift apart.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../shareAttributionRetention', () => ({
  recoverShareAttributionRetention: vi.fn(async () => ({ aggregated: 0, deleted: 0 })),
}));

import { runShareRetention } from '../shareRetentionCli';
import { recoverShareAttributionRetention } from '../shareAttributionRetention';

beforeEach(() => vi.clearAllMocks());

describe('runShareRetention', () => {
  it('invokes the shared recoverShareAttributionRetention with the prisma client', async () => {
    const prisma = { shareAttribution: {}, shareLinkDailyCount: {} };
    const result = await runShareRetention(prisma as never);
    expect(recoverShareAttributionRetention).toHaveBeenCalledTimes(1);
    expect(recoverShareAttributionRetention).toHaveBeenCalledWith(prisma);
    expect(result).toEqual({ aggregated: 0, deleted: 0 });
  });
});
