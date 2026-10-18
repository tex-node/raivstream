/**
 * D-033 test seam: run the export job inline instead of enqueueing it.
 *
 * Production always goes through pg-boss. Existing service tests call
 * `requestExport` and assert on the rendered result, so the runner executes
 * `runExportJob` synchronously here — the split is still exercised end to end,
 * without a live queue.
 */
import { beforeEach } from 'vitest';
import { __setExportRunnerForTests, storyVideoExportService } from '../lib/story/storyVideoExportService';

beforeEach(() => {
  __setExportRunnerForTests(async (prisma, row, deps) => {
    // Pass the row through: test doubles do not necessarily support re-reading
    // by id, and production re-reads from the job payload anyway.
    return storyVideoExportService.runExportJob(prisma, { exportId: row.id }, deps, row as never);
  });
});
