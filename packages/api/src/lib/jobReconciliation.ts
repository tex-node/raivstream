/**
 * D-004 ops - reconcile generation jobs stranded in GENERATING.
 *
 * Why this exists: a job is submitted to the provider and the row is moved to
 * GENERATING. If the database or the polling worker is unavailable during the
 * poll window, the provider finishes the render and nobody records it - the user
 * is charged and sees nothing. That happened for 7+ hours to job
 * cmvr4pprc0005nziy4g9yrc3a while Postgres was down.
 *
 * The repair is deliberately the SAME path a healthy poll takes: fetch the
 * provider result, mirror it to R2, then mark the row COMPLETED. Writing the
 * provider URL straight into `outputUrl` would look like success and decay into
 * a broken player when the CDN URL expires.
 */

import { mirrorUrlToR2 } from './r2';

export interface ReconcileDeps {
  prisma: {
    generationJob: {
      findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
      update: (args: unknown) => Promise<unknown>;
    };
  };
  fetchImpl?: typeof fetch;
  mirror?: (sourceUrl: string, key: string, contentType: string) => Promise<string>;
  refund?: (job: Record<string, unknown>) => Promise<void>;
  now?: () => number;
}

export interface ReconcileOutcome {
  jobId: string;
  model: string;
  outcome: 'fixed' | 'failed' | 'still_pending' | 'skipped';
  outputUrl?: string;
  reason?: string;
}

export interface ReconcileSummary {
  fixed: number;
  failed: number;
  stillPending: number;
  skipped: number;
  outcomes: ReconcileOutcome[];
}

/** providerJobId is `fal:<uuid>`; the queue endpoint depends on the model. */
const FAL_ENDPOINTS: Record<string, string> = {
  VEED_FABRIC: 'fal-ai/veed-fabric',
};

const STUCK_AFTER_MS = 15 * 60 * 1000;

function stripFalPrefix(providerJobId: string): string {
  return providerJobId.replace(/^fal:/, '');
}

/** Pull the first video URL out of the shapes fal returns. */
function extractVideoUrl(payload: unknown): string | null {
  const body = payload as { video?: { url?: string }; videos?: Array<{ url?: string }> } | null;
  if (body?.video?.url) return body.video.url;
  if (Array.isArray(body?.videos) && body.videos[0]?.url) return body.videos[0].url;
  return null;
}

export async function reconcileStuckJobs(deps: ReconcileDeps): Promise<ReconcileSummary> {
  const { prisma } = deps;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const mirror = deps.mirror ?? mirrorUrlToR2;
  const now = deps.now ?? Date.now;

  const candidates = await prisma.generationJob.findMany({
    where: {
      status: 'GENERATING',
      createdAt: { lt: new Date(now() - STUCK_AFTER_MS) },
    },
    select: {
      id: true,
      model: true,
      providerJobId: true,
      userId: true,
      // GenerationJob has no featureKey column; the debit that paid for it does,
      // so the refund callback looks that up rather than guessing a feature key.
      creditsUsed: true,
    },
  });

  const summary: ReconcileSummary = { fixed: 0, failed: 0, stillPending: 0, skipped: 0, outcomes: [] };

  const credentials = process.env.FAL_KEY;

  for (const job of candidates) {
    const jobId = String(job.id);
    const model = String(job.model);
    const providerJobId = typeof job.providerJobId === 'string' ? job.providerJobId : null;
    const endpoint = FAL_ENDPOINTS[model];

    if (!providerJobId || !endpoint || !credentials) {
      summary.skipped += 1;
      summary.outcomes.push({
        jobId,
        model,
        outcome: 'skipped',
        reason: !providerJobId ? 'no providerJobId' : !endpoint ? 'no endpoint mapping' : 'FAL_KEY missing',
      });
      continue;
    }

    const requestId = stripFalPrefix(providerJobId);
    const headers = { Authorization: `Key ${credentials}` };

    try {
      const statusRes = await fetchImpl(`https://queue.fal.run/${endpoint}/requests/${requestId}/status`, { headers });
      if (!statusRes.ok) {
        summary.stillPending += 1;
        summary.outcomes.push({ jobId, model, outcome: 'still_pending', reason: `status HTTP ${statusRes.status}` });
        continue;
      }
      const status = (await statusRes.json()) as { status?: string };

      if (status.status === 'FAILED') {
        await prisma.generationJob.update({
          where: { id: jobId },
          data: { status: 'FAILED', errorMessage: 'Reconciled: provider reported FAILED' },
        });
        if (deps.refund) await deps.refund(job);
        summary.failed += 1;
        summary.outcomes.push({ jobId, model, outcome: 'failed', reason: 'provider FAILED' });
        continue;
      }

      if (status.status !== 'COMPLETED') {
        summary.stillPending += 1;
        summary.outcomes.push({ jobId, model, outcome: 'still_pending', reason: status.status ?? 'unknown' });
        continue;
      }

      const resultRes = await fetchImpl(`https://queue.fal.run/${endpoint}/requests/${requestId}`, { headers });
      if (!resultRes.ok) {
        summary.stillPending += 1;
        summary.outcomes.push({ jobId, model, outcome: 'still_pending', reason: `result HTTP ${resultRes.status}` });
        continue;
      }

      const sourceUrl = extractVideoUrl(await resultRes.json());
      if (!sourceUrl) {
        summary.stillPending += 1;
        summary.outcomes.push({ jobId, model, outcome: 'still_pending', reason: 'no video in result' });
        continue;
      }

      // Mirror first: a COMPLETED row pointing at an expiring CDN URL is a lie.
      const key = `generated/veed-fabric/${jobId}.mp4`;
      const outputUrl = await mirror(sourceUrl, key, 'video/mp4');

      await prisma.generationJob.update({
        where: { id: jobId },
        data: { status: 'COMPLETED', outputUrl },
      });

      summary.fixed += 1;
      summary.outcomes.push({ jobId, model, outcome: 'fixed', outputUrl });
    } catch (error) {
      summary.stillPending += 1;
      summary.outcomes.push({
        jobId,
        model,
        outcome: 'still_pending',
        reason: error instanceof Error ? error.message : 'unknown error',
      });
    }
  }

  return summary;
}
