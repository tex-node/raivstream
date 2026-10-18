/**
 * D-033 — pg-boss queue for story video exports.
 *
 * The web process only ever *enqueues* (fast, PENDING); the export worker
 * consumes and renders. Queue state lives in Postgres (`pgboss` schema), so it
 * survives restarts and is shared across processes — no new infrastructure.
 *
 * pg-boss v12 takes per-queue policy at `createQueue`, not constructor globals.
 */

import { PgBoss } from 'pg-boss';

export const STORY_EXPORT_QUEUE = 'export.story';

/**
 * `expireInSeconds` is the recovery guarantee: if the worker dies mid-render,
 * the job expires after 1800 s and pg-boss re-delivers it. That is deliberately
 * the same ceiling as the D-031 ffmpeg wall-clock timeout.
 */
const QUEUE_POLICY = {
  retryLimit: 3,
  retryDelay: 60,
  retryBackoff: true,
  expireInSeconds: 1800,
  retentionDays: 14,
} as const;

let bossPromise: Promise<PgBoss> | null = null;

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required for the job queue (worker and web must both reach Postgres).');
  }
  return url;
}

/** Lazy singleton — no connection at import time. */
export async function getBoss(): Promise<PgBoss> {
  if (bossPromise) return bossPromise;

  bossPromise = (async () => {
    const boss = new PgBoss({
      connectionString: connectionString(),
      schema: 'pgboss',
    });
    boss.on('error', (error: unknown) => {
      console.error('[jobs] pg-boss error:', error instanceof Error ? error.message : error);
    });
    await boss.start();

    // Idempotent in practice; creating an existing queue is a no-op/update.
    try {
      await boss.createQueue(STORY_EXPORT_QUEUE, QUEUE_POLICY);
    } catch (error) {
      console.warn('[jobs] createQueue:', error instanceof Error ? error.message : error);
    }
    return boss;
  })();

  return bossPromise;
}

export async function stopBoss(options: { graceful?: boolean } = {}): Promise<void> {
  if (!bossPromise) return;
  const boss = await bossPromise.catch(() => null);
  bossPromise = null;
  if (boss) await boss.stop({ graceful: options.graceful ?? false });
}

/** Enqueue one export. Returns the pg-boss job id (null when de-duplicated). */
export async function enqueueStoryExport(exportId: string): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(STORY_EXPORT_QUEUE, { exportId });
}
