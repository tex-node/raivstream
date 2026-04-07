/**
 * RunPod management tRPC router
 *
 * Exposes pod lifecycle control, endpoint health checks, and billing info
 * directly from your app's backend — so you can:
 *   - Stop idle dev pods programmatically (no manual dashboard visits)
 *   - Monitor endpoint health before sending generation requests
 *   - Show real-time account balance to admins
 *
 * All procedures are protected (require auth). Pod mutation procedures
 * additionally require the ADMIN role check (role === 'CREATOR' or admin flag).
 */

import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
  listPods,
  getPod,
  startPod,
  stopPod,
  getEndpointHealth,
  getUserInfo,
  cancelJob,
} from '../lib/generators/runpod';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Only CREATOR-role users (or future ADMIN role) can manage pods */
function assertCanManagePods(user: { role: string }) {
  if (user.role !== 'CREATOR') {
    throw new TRPCError({
      code:    'FORBIDDEN',
      message: 'Only Creator accounts can manage RunPod resources',
    });
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const runpodRouter = router({

  // ── Endpoint health ────────────────────────────────────────────────────────

  /**
   * Check whether the LTX2 serverless endpoint is healthy.
   * Useful for the UI to show "Model Ready" vs "Cold starting…" states.
   */
  ltx2Health: protectedProcedure.query(async () => {
    const endpointId = process.env.RUNPOD_LTX2_ENDPOINT_ID;
    if (!endpointId) return { configured: false, workers: null };
    try {
      const health = await getEndpointHealth(endpointId);
      return {
        configured: true,
        endpointId,
        workers:  { idle: health.workers.idle, running: health.workers.running },
        jobs:     { inQueue: health.jobs.inQueue, inProgress: health.jobs.inProgress },
        isReady:  health.workers.idle > 0 || health.workers.running > 0,
      };
    } catch {
      return { configured: true, endpointId, workers: null, isReady: false };
    }
  }),

  /**
   * Check whether the Wan 2.5 serverless endpoint is healthy.
   */
  wan25Health: protectedProcedure.query(async () => {
    const endpointId = process.env.RUNPOD_WAN25_ENDPOINT_ID;
    if (!endpointId) return { configured: false, workers: null };
    try {
      const health = await getEndpointHealth(endpointId);
      return {
        configured: true,
        endpointId,
        workers:  { idle: health.workers.idle, running: health.workers.running },
        jobs:     { inQueue: health.jobs.inQueue, inProgress: health.jobs.inProgress },
        isReady:  health.workers.idle > 0 || health.workers.running > 0,
      };
    } catch {
      return { configured: true, endpointId, workers: null, isReady: false };
    }
  }),

  // ── Pod management (dev pods only) ─────────────────────────────────────────

  /**
   * List all RunPod pods in the account.
   * Useful for seeing which dev/test pods are still running and billing.
   */
  listPods: protectedProcedure.query(async ({ ctx }) => {
    assertCanManagePods(ctx.user);
    const pods = await listPods();
    return pods.map((p) => ({
      id:            p.id,
      name:          p.name,
      status:        p.desiredStatus,
      gpuCount:      p.gpuCount,
      costPerHrUsd:  p.costPerHr,
      uptimeSeconds: p.runtime?.uptimeInSeconds ?? 0,
      estimatedCost: p.costPerHr * ((p.runtime?.uptimeInSeconds ?? 0) / 3600),
    }));
  }),

  /**
   * Get a single pod's details.
   */
  getPod: protectedProcedure
    .input(z.object({ podId: z.string() }))
    .query(async ({ ctx, input }) => {
      assertCanManagePods(ctx.user);
      const pod = await getPod(input.podId);
      if (!pod) throw new TRPCError({ code: 'NOT_FOUND', message: 'Pod not found' });
      return pod;
    }),

  /**
   * Start a stopped pod.
   * ⚠ GPU billing resumes immediately — only use for dev/test pods.
   * Production inference should use Serverless endpoints (zero idle cost).
   */
  startPod: protectedProcedure
    .input(z.object({
      podId:    z.string(),
      gpuCount: z.number().min(1).max(8).default(1),
    }))
    .mutation(async ({ ctx, input }) => {
      assertCanManagePods(ctx.user);
      await startPod(input.podId, input.gpuCount);
      return { success: true, podId: input.podId, message: 'Pod starting — GPU billing resumed' };
    }),

  /**
   * Stop a running pod — GPU billing stops immediately.
   * Network Volume data is preserved; only ephemeral pod storage is cleared.
   *
   * Best practice: call this after every dev/test session, or after a batch job completes.
   */
  stopPod: protectedProcedure
    .input(z.object({ podId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertCanManagePods(ctx.user);
      await stopPod(input.podId);
      return {
        success: true,
        podId:   input.podId,
        message: 'Pod stopped — GPU billing halted. Network Volume data preserved.',
      };
    }),

  /**
   * Stop all currently running pods at once.
   * Useful as a "kill switch" if you forget to stop them individually.
   */
  stopAllPods: protectedProcedure.mutation(async ({ ctx }) => {
    assertCanManagePods(ctx.user);
    const pods = await listPods();
    const running = pods.filter((p) => p.desiredStatus === 'RUNNING');
    await Promise.allSettled(running.map((p) => stopPod(p.id)));
    return {
      stopped: running.length,
      podIds:  running.map((p) => p.id),
      message: `${running.length} pod(s) stopped`,
    };
  }),

  // ── Serverless job cancellation ────────────────────────────────────────────

  /**
   * Cancel a queued or in-progress serverless job by model + job ID.
   * Useful when a user cancels a long-running generation.
   */
  cancelServerlessJob: protectedProcedure
    .input(z.object({
      model: z.enum(['LTX2', 'WAN_25']),
      jobId: z.string(),
    }))
    .mutation(async ({ input }) => {
      const endpointId = input.model === 'LTX2'
        ? process.env.RUNPOD_LTX2_ENDPOINT_ID
        : process.env.RUNPOD_WAN25_ENDPOINT_ID;

      if (!endpointId) {
        throw new TRPCError({
          code:    'PRECONDITION_FAILED',
          message: `${input.model} endpoint is not configured`,
        });
      }

      await cancelJob(endpointId, input.jobId);
      return { success: true, jobId: input.jobId };
    }),

  // ── Billing ────────────────────────────────────────────────────────────────

  /**
   * Fetch the RunPod account balance and user info.
   * Useful for an admin "cost monitor" panel in the app.
   */
  accountBalance: protectedProcedure.query(async ({ ctx }) => {
    assertCanManagePods(ctx.user);
    const info = await getUserInfo();
    return {
      creditBalanceUsd: info.creditBalance,
      email:            info.email,
    };
  }),

  /**
   * Summarise real-time running costs across all pods.
   */
  runningCostSummary: protectedProcedure.query(async ({ ctx }) => {
    assertCanManagePods(ctx.user);
    const pods = await listPods();
    const running = pods.filter((p) => p.desiredStatus === 'RUNNING');

    const totalHourlyRate = running.reduce((sum, p) => sum + p.costPerHr, 0);
    const items = running.map((p) => ({
      podId:         p.id,
      name:          p.name,
      costPerHrUsd:  p.costPerHr,
      uptimeMinutes: Math.round((p.runtime?.uptimeInSeconds ?? 0) / 60),
      runningCost:   p.costPerHr * ((p.runtime?.uptimeInSeconds ?? 0) / 3600),
    }));

    return {
      runningPods:        running.length,
      totalHourlyRateUsd: totalHourlyRate,
      items,
      warning: totalHourlyRate > 1
        ? `⚠ ${running.length} pod(s) running at $${totalHourlyRate.toFixed(2)}/hr. Stop idle pods to save cost.`
        : null,
    };
  }),

  /**
   * Overview of all RunPod configuration for the current deployment.
   * Helps debug missing env vars quickly.
   */
  configStatus: protectedProcedure.query(() => {
    return {
      apiKey:          !!process.env.RUNPOD_API_KEY,
      ltx2: {
        endpointId:    process.env.RUNPOD_LTX2_ENDPOINT_ID ?? null,
        configured:    !!process.env.RUNPOD_LTX2_ENDPOINT_ID,
        mode:          process.env.RUNPOD_LTX2_MODE ?? 'comfyui',
        checkpoint:    process.env.RUNPOD_LTX2_CHECKPOINT ?? 'ltx-video-2b-0.9.6.safetensors',
      },
      wan25: {
        endpointId:    process.env.RUNPOD_WAN25_ENDPOINT_ID ?? null,
        configured:    !!process.env.RUNPOD_WAN25_ENDPOINT_ID,
        mode:          process.env.RUNPOD_WAN25_MODE ?? 'comfyui',
        unet:          process.env.RUNPOD_WAN25_UNET ?? 'wan2.1-t2v-14b-q4_k_m.gguf',
      },
      networkVolumeId: process.env.RUNPOD_NETWORK_VOLUME_ID ?? null,
    };
  }),
});
