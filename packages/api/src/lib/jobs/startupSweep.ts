/**
 * D-033 — startup sweep for crash-orphaned exports.
 *
 * A worker killed mid-render leaves its row in `GENERATING`. Nothing else will
 * ever move it, and the `(projectId, sourceHash)` unique constraint means every
 * future request for that source returns the same dead row — the "wedged
 * GENERATING" bug. On boot the worker resets those rows to PENDING and
 * re-enqueues them.
 *
 * `EXPORT_STUCK_THRESHOLD_MS` (30 min) is deliberately longer than the D-031
 * ffmpeg wall clock (25 min), so a live render is never reaped.
 */

import type { PrismaClient } from '@raivstream/database';
import { EXPORT_STUCK_THRESHOLD_MS } from '../ffmpegSafety';

export interface SweepResult {
  scanned: number;
  requeued: number;
}

export async function sweepStuckExports(
  prisma: PrismaClient,
  enqueue: (exportId: string) => Promise<unknown>,
  now: number = Date.now(),
): Promise<SweepResult> {
  const cutoff = new Date(now - EXPORT_STUCK_THRESHOLD_MS);

  const stuck = await prisma.storyVideoExport.findMany({
    where: { status: 'GENERATING', updatedAt: { lt: cutoff } },
    select: { id: true },
  });

  let requeued = 0;
  for (const row of stuck) {
    // errorMessage records why; runExportJob clears it when the retry starts.
    await prisma.storyVideoExport.update({
      where: { id: row.id },
      data: { status: 'PENDING', errorMessage: 'EXPORT_STUCK: reset by worker startup sweep' },
    });
    await enqueue(row.id);
    requeued += 1;
  }

  return { scanned: stuck.length, requeued };
}
