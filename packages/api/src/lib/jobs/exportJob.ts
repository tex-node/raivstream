/**
 * D-033 — the `export.story` job handler.
 *
 * Thin by design: the queue owns delivery/retries, the service owns rendering.
 * Duplicate delivery is safe because `runExportJob` is a no-op for a READY row
 * and re-renders deterministically from the scene ids stored on the row.
 */

import type { PgBoss } from 'pg-boss';
import type { PrismaClient } from '@raivstream/database';
import { STORY_EXPORT_QUEUE } from './index';
import { storyVideoExportService } from '../story/storyVideoExportService';

export interface StoryExportJobData {
  exportId: string;
}

/** Runs one job. Exported so the worker and tests share exactly one path. */
export async function handleStoryExportJob(
  prisma: PrismaClient,
  data: StoryExportJobData,
): Promise<void> {
  const exportId = data?.exportId;
  if (!exportId) {
    console.warn('[worker] export job without exportId — skipping');
    return;
  }

  console.info(`[worker] processing export ${exportId}`);
  const state = await storyVideoExportService.runExportJob(prisma, { exportId });
  console.info(`[worker] export ${exportId} → ${state.status}`);
}

export function registerExportJob(boss: PgBoss, prisma: PrismaClient): void {
  // Bound to 1 export at a time to prevent concurrent FFmpeg renders from
  // exhausting memory on the shared VPS. Explicit rather than inherited: the
  // library default is not a promise about this deployment.
  void boss.work<StoryExportJobData>(
    STORY_EXPORT_QUEUE,
    { batchSize: 1, localConcurrency: 1 },
    async (jobs: Array<{ data: StoryExportJobData }>) => {
      for (const job of jobs) {
        await handleStoryExportJob(prisma, job.data);
      }
    },
  );
}
