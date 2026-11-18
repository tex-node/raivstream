/**
 * The assembly queue's sender (2026-11-18).
 *
 * Assembly is a separate job because the production job used to hold its queue slot for the whole FFmpeg export. The
 * run row is already terminal when the runner finishes, so nothing about the episode's status depends on the render:
 * the output row is the deliverable's record, and `creativeOutput` is what the UI reads.
 *
 * `retryLimit: 0` is not laziness. `outputService.autoAssemble` creates a new `CreativeOutput` row on every call, so an
 * automatic retry would produce a second deliverable row for the same assembly. A failed assembly is visible as a
 * FAILED output row, and re-running it is a decision (the take model, applied to outputs).
 *
 * `singletonKey` is the project: two assemblies of the same project at once would render the same bytes twice and race
 * to write the active output.
 */

import { CREATIVE_ASSEMBLY_QUEUE } from './productionWorker';

export interface CreativeAssemblyJob {
  projectId: string;
  /** The production run that triggered assembly; recorded for correlation, not used to find the plan. */
  runId: string | null;
}

export async function enqueueCreativeAssembly(job: CreativeAssemblyJob): Promise<string | null> {
  // Dynamic import so importing the runner (and its tests) does not open pg-boss.
  const { getBoss } = await import('../../jobs');
  const boss = await getBoss();
  // Idempotent; pg-boss does not create a queue on send reliably.
  await boss.createQueue(CREATIVE_ASSEMBLY_QUEUE);
  return boss.send(CREATIVE_ASSEMBLY_QUEUE, job, {
    retryLimit: 0,
    singletonKey: job.projectId,
  });
}
