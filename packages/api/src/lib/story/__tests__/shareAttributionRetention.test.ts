import { describe, expect, it, vi } from 'vitest';
import { recoverShareAttributionRetention, utcDay, SHARE_ATTRIBUTION_RETENTION_DAYS } from '../shareAttributionRetention';

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

function makePrisma(rows: Array<{ shareLinkId: string; createdAt: Date }>) {
  const daily: any[] = [];
  return {
    shareAttribution: {
      findMany: vi.fn(async ({ where }: any) => rows.filter((r) => r.createdAt < where.createdAt.lt)),
      deleteMany: vi.fn(async ({ where }: any) => {
        const before = rows.length;
        for (let i = rows.length - 1; i >= 0; i -= 1) if (rows[i]!.createdAt < where.createdAt.lt) rows.splice(i, 1);
        return { count: before - rows.length };
      }),
    },
    shareLinkDailyCount: {
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const key = where.shareLinkId_day;
        const ex = daily.find((d) => d.shareLinkId === key.shareLinkId && d.day.getTime() === key.day.getTime());
        if (ex) { ex.count += update.count.increment; return ex; }
        const row = { id: `d${daily.length + 1}`, ...create };
        daily.push(row);
        return row;
      }),
    },
    __daily: daily,
  };
}

describe('recoverShareAttributionRetention', () => {
  it('aggregates old rows into per-link daily counts and deletes them, leaving recent rows', async () => {
    const rows = [
      { shareLinkId: 'l1', createdAt: daysAgo(100) },
      { shareLinkId: 'l1', createdAt: daysAgo(100) },
      { shareLinkId: 'l1', createdAt: daysAgo(10) },
    ];
    const prisma = makePrisma(rows);
    const res = await recoverShareAttributionRetention(prisma, { now: new Date(), days: SHARE_ATTRIBUTION_RETENTION_DAYS });
    expect(res.aggregated).toBe(2);
    expect(res.deleted).toBe(2);
    expect(rows).toHaveLength(1); // the 10-day row survives
    expect(prisma.__daily).toHaveLength(1);
    expect(prisma.__daily[0].count).toBe(2);
  });

  it('is idempotent — a second run does nothing', async () => {
    const rows = [{ shareLinkId: 'l1', createdAt: daysAgo(100) }];
    const prisma = makePrisma(rows);
    await recoverShareAttributionRetention(prisma, { now: new Date() });
    const second = await recoverShareAttributionRetention(prisma, { now: new Date() });
    expect(second).toEqual({ aggregated: 0, deleted: 0 });
  });

  it('buckets by UTC day', () => {
    const a = new Date('2026-01-02T23:59:00Z');
    const b = new Date('2026-01-03T00:01:00Z');
    expect(utcDay(a).toISOString()).toBe('2026-01-02T00:00:00.000Z');
    expect(utcDay(b).toISOString()).toBe('2026-01-03T00:00:00.000Z');
  });
});
