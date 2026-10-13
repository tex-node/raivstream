/**
 * Phase 2 (R16-04) — DB-backed batch scene-generation queue.
 *
 * A polled, in-process worker: `runBatch` drives QUEUED items at bounded
 * concurrency, enforces a per-run credit cap (fail-closed), and never stops on a
 * single item failure. No Redis, no separate process.
 *
 * Batch concurrency is its own field (default 2) and is INDEPENDENT of
 * `PROVIDER_MAX_CONCURRENCY` (the provider rate limiter's env pattern, see
 * `lib/generators/providerRateLimit.ts:42`) — that bounds provider calls, not a run.
 *
 * Idempotency: the scene-image path creates the asset row PENDING first and charges
 * with `creditKeys.sceneImage.charge(assetId)`, so a retried item cannot double-charge.
 */
import { TRPCError } from '@trpc/server';

export const BATCH_DEFAULT_CONCURRENCY = 2;
export const BATCH_DEFAULT_COST_CAP = 10000;
/** A RUNNING run with no heartbeat for this long is considered stuck. */
export const BATCH_STALE_MS = 5 * 60 * 1000;
/** Recovery runs at most once per this interval per process (the guard). */
export const BATCH_RECOVERY_GUARD_MS = 30 * 1000;

export interface BatchDeps {
  /** The existing scene-image generation path, provided by the router. */
  generateScene: (run: { projectId: string }, sceneId: string) => Promise<{ assetId: string }>;
  /** Per-scene credit cost for the model in use (FLUX2). */
  perItemCost: number;
}

let lastRecoveryAt = 0;
/** Test hook — clears the recovery guard. */
export function resetBatchRecoveryGuardForTests(): void {
  lastRecoveryAt = 0;
}

export async function createBatchRun(
  prisma: any,
  input: { projectId: string; userId: string; sceneIds: string[]; costCapCredits?: number },
  deps: BatchDeps,
) {
  const project = await prisma.storyProject.findFirst({
    where: { id: input.projectId, userId: input.userId },
    select: { id: true },
  });
  if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Story project not found.' });

  const sceneIds = [...new Set(input.sceneIds)];
  if (sceneIds.length === 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Pick at least one scene.' });

  const scenes = await prisma.storySceneSeed.findMany({
    where: { id: { in: sceneIds }, projectId: input.projectId },
    select: { id: true },
  });
  if (scenes.length !== sceneIds.length) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Some scenes do not belong to this story.' });
  }

  const active = await prisma.batchGenerationRun.findFirst({
    where: { projectId: input.projectId, status: { in: ['QUEUED', 'RUNNING'] } },
    select: { id: true },
  });
  if (active) throw new TRPCError({ code: 'CONFLICT', message: 'A batch is already running for this story.' });

  const costCapCredits = input.costCapCredits ?? BATCH_DEFAULT_COST_CAP;
  const estimated = sceneIds.length * deps.perItemCost;
  if (estimated > costCapCredits) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `This would use about ${estimated} credits, over your limit of ${costCapCredits}. Raise the limit or pick fewer scenes.`,
    });
  }

  return prisma.batchGenerationRun.create({
    data: {
      projectId: input.projectId,
      status: 'QUEUED',
      concurrency: BATCH_DEFAULT_CONCURRENCY,
      costCapCredits,
      costUsedCredits: 0,
      sceneIds: sceneIds as never,
      createdByUserId: input.userId,
      items: { create: sceneIds.map((sceneId) => ({ sceneId })) },
    },
  });
}

/** The worker. Processes QUEUED items in bounded batches; idempotent per item. */
export async function runBatch(prisma: any, runId: string, deps: BatchDeps): Promise<void> {
  const initial = await prisma.batchGenerationRun.findUnique({ where: { id: runId } });
  if (!initial || initial.status !== 'RUNNING') return;

  await prisma.batchGenerationRun.update({
    where: { id: runId },
    data: { startedAt: initial.startedAt ?? new Date(), lastHeartbeatAt: new Date() },
  });

  for (;;) {
    const current = await prisma.batchGenerationRun.findUnique({
      where: { id: runId },
      select: { status: true, concurrency: true, costUsedCredits: true, costCapCredits: true },
    });
    if (!current || current.status !== 'RUNNING') return;

    let queued = await prisma.batchGenerationItem.findMany({
      where: { runId, status: 'QUEUED' },
      orderBy: { createdAt: 'asc' },
      take: current.concurrency,
    });
    if (queued.length === 0) break;

    // Cost-cap check BEFORE claiming the next items (fail-closed).
    const affordable = Math.floor((current.costCapCredits - current.costUsedCredits) / deps.perItemCost);
    if (affordable <= 0) {
      await prisma.batchGenerationRun.update({
        where: { id: runId },
        data: { status: 'PAUSED', pauseReason: `Reached your credit limit (${current.costCapCredits}).`, finishedAt: new Date() },
      });
      return;
    }
    if (affordable < queued.length) queued = queued.slice(0, affordable);

    await Promise.all(
      queued.map(async (item: { id: string; sceneId: string }) => {
        const claimed = await prisma.batchGenerationItem.updateMany({
          where: { id: item.id, status: 'QUEUED' },
          data: { status: 'RUNNING', attemptCount: { increment: 1 } },
        });
        if (claimed.count === 0) return; // already claimed/complete — never double-process
        try {
          const res = await deps.generateScene(initial, item.sceneId);
          await prisma.batchGenerationItem.update({
            where: { id: item.id },
            data: { status: 'READY', assetId: res.assetId, creditsUsed: deps.perItemCost, errorMessage: null },
          });
          await prisma.batchGenerationRun.update({
            where: { id: runId },
            data: { costUsedCredits: { increment: deps.perItemCost }, lastHeartbeatAt: new Date() },
          });
        } catch (error) {
          // A failed item never stops the run.
          await prisma.batchGenerationItem.update({
            where: { id: item.id },
            data: { status: 'FAILED', errorMessage: (error as Error).message.slice(0, 500) },
          });
          await prisma.batchGenerationRun.update({ where: { id: runId }, data: { lastHeartbeatAt: new Date() } });
        }
      }),
    );
  }

  const after = await prisma.batchGenerationRun.findUnique({
    where: { id: runId },
    select: { status: true, costCapCredits: true, costUsedCredits: true },
  });
  if (!after || after.status !== 'RUNNING') return;

  const remaining = await prisma.batchGenerationItem.count({ where: { runId, status: 'QUEUED' } });
  await prisma.batchGenerationRun.update({
    where: { id: runId },
    data: remaining > 0
      ? { status: 'PAUSED', pauseReason: `Reached your credit limit (${after.costCapCredits}).`, finishedAt: new Date() }
      : { status: 'COMPLETED', finishedAt: new Date() },
  });
}

/**
 * Re-kick RUNNING runs whose heartbeat is stale. Mirrors the shape of
 * `recoverStuckProductions` (lib/creative/production/runner.ts:278) — the same
 * "scan stale + restart" idea, and deliberately invoked opportunistically
 * (per-request) rather than from a process-startup bootstrap. A guard prevents
 * running more than once per `guardMs` per process.
 */
export async function recoverStuckBatchRuns(
  prisma: any,
  deps: BatchDeps,
  opts: { staleMs?: number; guardMs?: number; now?: number } = {},
): Promise<{ recovered: number; skipped: boolean }> {
  const now = opts.now ?? Date.now();
  const guardMs = opts.guardMs ?? BATCH_RECOVERY_GUARD_MS;
  if (now - lastRecoveryAt < guardMs) return { recovered: 0, skipped: true };
  lastRecoveryAt = now;

  const staleBefore = new Date(now - (opts.staleMs ?? BATCH_STALE_MS));
  const stuck = await prisma.batchGenerationRun.findMany({
    where: { status: 'RUNNING', OR: [{ lastHeartbeatAt: null }, { lastHeartbeatAt: { lt: staleBefore } }] },
    select: { id: true },
  });
  for (const run of stuck) void runBatch(prisma, run.id, deps);
  return { recovered: stuck.length, skipped: false };
}
