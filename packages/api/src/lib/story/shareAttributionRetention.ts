/**
 * Phase 4b — share-attribution retention (design §4b).
 *
 * Keep raw per-click rows for a rolling window, then roll them into a per-link,
 * per-day count and delete the raw rows:
 *   1. aggregate ShareAttribution rows older than the window into ShareLinkDailyCount
 *      (upsert by the unique (shareLinkId, day)), then
 *   2. delete the raw rows older than the window.
 *
 * Idempotent: the upsert merges by the unique constraint, and the delete only
 * removes rows older than the window at run time, so a second run is a no-op.
 */
export const SHARE_ATTRIBUTION_RETENTION_DAYS = 90;

/** UTC midnight of a timestamp — the bucket key for ShareLinkDailyCount.day. */
export function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export interface ShareAttributionRetentionResult {
  aggregated: number;
  deleted: number;
}

export async function recoverShareAttributionRetention(
  prisma: any,
  opts: { now?: Date; days?: number } = {},
): Promise<ShareAttributionRetentionResult> {
  const now = opts.now ?? new Date();
  const days = opts.days ?? SHARE_ATTRIBUTION_RETENTION_DAYS;
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const old = await prisma.shareAttribution.findMany({
    where: { createdAt: { lt: cutoff } },
    select: { shareLinkId: true, createdAt: true },
  });

  const buckets = new Map<string, { shareLinkId: string; day: Date; count: number }>();
  for (const row of old as Array<{ shareLinkId: string; createdAt: Date }>) {
    const day = utcDay(row.createdAt);
    const key = `${row.shareLinkId}:${day.toISOString()}`;
    const bucket = buckets.get(key) ?? { shareLinkId: row.shareLinkId, day, count: 0 };
    bucket.count += 1;
    buckets.set(key, bucket);
  }

  for (const bucket of buckets.values()) {
    await prisma.shareLinkDailyCount.upsert({
      where: { shareLinkId_day: { shareLinkId: bucket.shareLinkId, day: bucket.day } },
      create: { shareLinkId: bucket.shareLinkId, day: bucket.day, count: bucket.count },
      update: { count: { increment: bucket.count } },
    });
  }

  const deleted = await prisma.shareAttribution.deleteMany({ where: { createdAt: { lt: cutoff } } });
  const result = { aggregated: old.length, deleted: deleted.count };
  console.log(`[share.retention] aggregated=${result.aggregated} deleted=${result.deleted}`);
  return result;
}
