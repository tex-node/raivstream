/**
 * Raivstream 5.0 — Production runner.
 *
 * Executes an APPROVED plan through the GenerationAdapter (CapabilityRouter
 * decides what/how; the adapter talks to existing generation infra). Detached
 * from the request; resumable (skips READY assets); partial failures are
 * recorded per asset and never stop the remaining scenes; credits are charged
 * per generation and refunded on failure (existing convention).
 *
 * Phase 9 reliability hardening:
 *  - a durable `CreativeProductionRun` row (heartbeat, attempt, stage, counts),
 *  - idempotent operations (an in-flight run is never started twice),
 *  - bounded per-asset retry (transient provider failures recover in-run),
 *  - stale-run recovery after a process restart (heartbeat based),
 *  - structured, safe production observability.
 *
 * Dependencies are injectable so the control flow is unit-testable without
 * providers.
 */

import type { PrismaClient } from '@raivstream/database';
import { deductCredits, refundCredits, MODEL_FEATURE_KEY } from '../../credits';
import type { CreativeBibleState } from '../shared/types';
import { CreativeError } from '../shared/errors';
import { routeProduction, type GenerationSpec, type StillSpec, type VideoSpec } from './capabilityRouter';
import { generateStill, generateVideo, extractLastFrame, type GeneratedMedia } from './generationAdapter';
import type { CreativeProductionPlanState } from './plan';
import { logProductionEvent } from '../observability/metrics';

export interface ProductionDeps {
  generateStill: (spec: StillSpec, projectId: string, assetId: string) => Promise<GeneratedMedia>;
  generateVideo: (spec: VideoSpec, projectId: string, assetId: string, seedImageUrl?: string) => Promise<GeneratedMedia>;
  extractLastFrame: (videoUrl: string, keyPrefix: string) => Promise<string | null>;
}

const defaultDeps: ProductionDeps = { generateStill, generateVideo, extractLastFrame };

/** A run with no heartbeat for this long is considered abandoned (process restart). */
export const STALE_RUN_MS = 5 * 60 * 1000;
/** Bounded retry per asset — transient provider failures recover without user action. */
export const DEFAULT_MAX_ATTEMPTS = 2;

export type ProductionRunStatus = 'COMPLETED' | 'PARTIAL' | 'FAILED';

export interface ProductionRunResult {
  generated: number;
  failed: number;
  runId: string | null;
  status: ProductionRunStatus;
}

export interface ProductionRunOptions {
  maxAttempts?: number;
  now?: () => Date;
}

type ExistingAsset = { id: string; sceneId: string; kind: string; status: string; assetUrl: string | null };

type RunModel = {
  create?: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
  update?: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
  findFirst?: (args: Record<string, unknown>) => Promise<{ id: string; status: string; heartbeatAt: Date } | null>;
  findMany?: (args: Record<string, unknown>) => Promise<Array<{ id: string; projectId: string; status: string; heartbeatAt: Date }>>;
};

function runModel(prisma: PrismaClient): RunModel | null {
  const model = (prisma as unknown as { creativeProductionRun?: RunModel }).creativeProductionRun;
  return model && typeof model.create === 'function' ? model : null;
}

async function startRun(prisma: PrismaClient, projectId: string, input: { totalScenes: number; attempt: number; contextSnapshot?: unknown }): Promise<string | null> {
  const model = runModel(prisma);
  if (!model?.create) return null;
  try {
    const run = await model.create({
      data: {
        projectId,
        status: 'RUNNING',
        attempt: input.attempt,
        totalScenes: input.totalScenes,
        stage: 'creating_scenes',
        contextSnapshot: input.contextSnapshot ?? undefined,
      },
    });
    return run.id;
  } catch {
    return null;
  }
}

async function heartbeat(prisma: PrismaClient, runId: string | null, data: Record<string, unknown>, now: () => Date): Promise<void> {
  if (!runId) return;
  const model = runModel(prisma);
  if (!model?.update) return;
  await model.update({ where: { id: runId }, data: { ...data, heartbeatAt: now() } }).catch(() => undefined);
}

export async function runCreativeProduction(
  prisma: PrismaClient,
  input: { projectId: string; runId?: string; attempt?: number },
  deps: ProductionDeps = defaultDeps,
  options: ProductionRunOptions = {},
): Promise<ProductionRunResult> {
  const now = options.now ?? (() => new Date());
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);

  const project = await prisma.creativeProject.findUnique({
    where: { id: input.projectId },
    include: { productionPlan: true, bible: true },
  });
  if (!project || !project.productionPlan) return { generated: 0, failed: 0, runId: input.runId ?? null, status: 'FAILED' };

  const plan = project.productionPlan.plan as unknown as CreativeProductionPlanState;
  const bible = project.bible as unknown as CreativeBibleState | null;
  const specs: GenerationSpec[] = routeProduction(plan, bible);
  const existing = (await prisma.creativeProducedAsset.findMany({ where: { projectId: project.id } })) as unknown as ExistingAsset[];
  const byKey = new Map(existing.map((asset) => [`${asset.sceneId}:${asset.kind}`, asset]));

  const runId = input.runId ?? (await startRun(prisma, project.id, { totalScenes: plan.scenes.length, attempt: input.attempt ?? 1, contextSnapshot: plan.contextSnapshot }));
  const startedAt = now().getTime();
  logProductionEvent({ type: 'run_started', projectId: project.id, runId, totalScenes: plan.scenes.length, attempt: input.attempt ?? 1 });

  let lastClipUrl: string | null = null;
  let generated = 0;
  let failed = 0;
  let firstVisualLogged = false;
  // The same source readiness approved: a resolvable reference the generation
  // capability (H3 I2V) can actually use as the opening seed.
  const sourceSeedUrl = plan.sourceReferences?.find((ref) => Boolean(ref.url))?.url;

  try {
    for (const spec of specs) {
      const key = `${spec.sceneId}:${spec.kind}`;
      const prior = byKey.get(key);
      if (prior && prior.status === 'READY') {
        if (spec.kind === 'VIDEO' && prior.assetUrl) lastClipUrl = prior.assetUrl;
        continue;
      }

      // Reuse a prior non-READY asset row (resumability + retry-only-affected):
      // never create a duplicate for the same scene+kind.
      const asset = prior
        ? await prisma.creativeProducedAsset.update({ where: { id: prior.id }, data: { status: 'GENERATING' as never } })
        : await prisma.creativeProducedAsset.create({ data: { projectId: project.id, sceneId: spec.sceneId, kind: spec.kind, status: 'GENERATING' } });

      let seedImageUrl: string | undefined;
      if (spec.kind === 'VIDEO') {
        const still = byKey.get(`${spec.sceneId}:IMAGE`);
        if (lastClipUrl) {
          const chained = await deps.extractLastFrame(lastClipUrl, `creative/${project.id}/scenes/${spec.sceneId}/seeds`).catch(() => null);
          seedImageUrl = chained ?? still?.assetUrl ?? undefined;
        } else if (sourceSeedUrl) {
          // Opening clip is conditioned on the creator's source (Transform/promo).
          seedImageUrl = sourceSeedUrl;
        } else {
          seedImageUrl = still?.assetUrl ?? undefined;
        }
        // Production integrity invariant: H3_MAX is an image-to-video model and
        // always requires a seed image. A missing seed means neither the source
        // reference URL, chained last frame, nor the generated still was available.
        // Fail the asset deterministically — never retry, never let the provider
        // emit a cryptic error that masks the root cause.
        if (seedImageUrl === undefined) {
          const msg = 'MiniMax H3-Max is an image-to-video model and requires a seed image. No seed was resolved for this scene.';
          await prisma.creativeProducedAsset.update({ where: { id: asset.id }, data: { status: 'FAILED' as never, errorMessage: msg } });
          failed += 1;
          logProductionEvent({ type: 'asset_failed', projectId: project.id, sceneId: spec.sceneId, kind: spec.kind, attempt: 1, final: true, message: 'MISSING_SOURCE: no seed resolved' });
          await heartbeat(prisma, runId, { readyScenes: byKey.size, failedScenes: failed }, now);
          continue;
        }
      }

      const featureKey = spec.kind === 'IMAGE' ? MODEL_FEATURE_KEY.FLUX2 : MODEL_FEATURE_KEY.H3_MAX;
      let lastError: Error | null = null;
      let ready = false;

      for (let attempt = 1; attempt <= maxAttempts && !ready; attempt += 1) {
        logProductionEvent({ type: 'asset_started', projectId: project.id, sceneId: spec.sceneId, kind: spec.kind, attempt });
        const ref = `creative-produce-${asset.id}-a${attempt}`;
        const creditsUsed = featureKey ? await deductCredits(prisma, project.userId, featureKey, ref, `Creative production: ${spec.sceneId} ${spec.kind.toLowerCase()}`).catch(() => 0) : 0;
        try {
          const media = spec.kind === 'IMAGE'
            ? await deps.generateStill(spec as StillSpec, project.id, asset.id)
            : await deps.generateVideo(spec as VideoSpec, project.id, asset.id, seedImageUrl);
          await prisma.creativeProducedAsset.update({
            where: { id: asset.id },
            data: { status: 'READY', assetUrl: media.assetUrl, thumbnailUrl: media.thumbnailUrl ?? null, provider: 'internal' },
          });
          byKey.set(key, { id: asset.id, sceneId: spec.sceneId, kind: spec.kind, status: 'READY', assetUrl: media.assetUrl });
          if (spec.kind === 'VIDEO') lastClipUrl = media.assetUrl;
          generated += 1;
          ready = true;
          logProductionEvent({ type: 'asset_ready', projectId: project.id, sceneId: spec.sceneId, kind: spec.kind, durationMs: now().getTime() - startedAt });
          if (spec.kind === 'IMAGE' && !firstVisualLogged) {
            firstVisualLogged = true;
            logProductionEvent({ type: 'asset_ready', projectId: project.id, sceneId: spec.sceneId, kind: 'FIRST_VISUAL', durationMs: now().getTime() - startedAt });
          }
        } catch (error) {
          lastError = error as Error;
          // A content rejection is deterministic — never retry it. It fails only
          // this asset (smallest scope) and the credits are refunded.
          const rejected = error instanceof CreativeError && error.code === 'CONTENT_REJECTED';
          if (creditsUsed > 0 && featureKey) {
            await refundCredits(prisma, project.userId, creditsUsed, featureKey, ref, 'Creative production failed').catch(() => undefined);
          }
          logProductionEvent({ type: 'asset_failed', projectId: project.id, sceneId: spec.sceneId, kind: spec.kind, attempt, final: rejected || attempt >= maxAttempts, message: lastError.message.slice(0, 200) });
          if (rejected) break;
        }
      }

      if (!ready) {
        await prisma.creativeProducedAsset.update({
          where: { id: asset.id },
          data: { status: 'FAILED', errorMessage: (lastError?.message ?? 'Generation failed').slice(0, 500) },
        });
        failed += 1;
      }

      await heartbeat(prisma, runId, { readyScenes: byKey.size, failedScenes: failed }, now);
    }
  } finally {
    const status: ProductionRunStatus = failed === 0 ? 'COMPLETED' : generated > 0 ? 'PARTIAL' : 'FAILED';
    const model = runModel(prisma);
    if (runId && model?.update) {
      await model.update({
        where: { id: runId },
        data: { status, readyScenes: generated, failedScenes: failed, stage: 'ready', finishedAt: now(), heartbeatAt: now(), lastError: failed > 0 ? 'Some scenes could not be generated.' : null },
      }).catch(() => undefined);
    }
    logProductionEvent({ type: 'run_finished', projectId: project.id, runId, status, generated, failed });
    // Production completed (fully or partially) — hand off to REVIEW.
    await prisma.creativeProject.update({ where: { id: project.id }, data: { status: 'REVIEW' as never } }).catch(() => undefined);
  }

  return { generated, failed, runId, status: failed === 0 ? 'COMPLETED' : generated > 0 ? 'PARTIAL' : 'FAILED' };
}

export interface RecoveryResult {
  recovered: string[];
  alreadyActive: string[];
  stale: string[];
}

/**
 * Reliability hardening (Phase 9): safe recovery after a process restart.
 *
 * The runner is detached and resumable (skips READY assets). If the process
 * dies mid-run the project stays GENERATING with some assets READY. This finds
 * every GENERATING project and re-kicks the runner unless a run is genuinely
 * active (heartbeat fresh AND in-flight assets). It skips READY scenes and
 * produces only what's missing, then lands the project in REVIEW. Idempotent.
 */
export async function recoverStuckProductions(
  prisma: PrismaClient,
  deps: ProductionDeps = defaultDeps,
  options: { now?: () => Date; staleMs?: number; userId?: string } = {},
): Promise<RecoveryResult> {
  const now = options.now ?? (() => new Date());
  const staleMs = options.staleMs ?? STALE_RUN_MS;
  const stuck = await prisma.creativeProject.findMany({
    where: { status: 'GENERATING' as never, ...(options.userId ? { userId: options.userId } : {}) },
  });
  const recovered: string[] = [];
  const alreadyActive: string[] = [];
  const stale: string[] = [];
  const model = runModel(prisma);

  for (const project of stuck) {
    const inFlight = await prisma.creativeProducedAsset.count({
      where: { projectId: project.id, status: { in: ['GENERATING' as never, 'QUEUED' as never] } },
    });
    const latestRun = model?.findFirst
      ? await model.findFirst({ where: { projectId: project.id }, orderBy: { startedAt: 'desc' } }).catch(() => null)
      : null;
    const heartbeatFresh = Boolean(latestRun && latestRun.status === 'RUNNING' && now().getTime() - new Date(latestRun.heartbeatAt).getTime() < staleMs);
    if (inFlight > 0 && heartbeatFresh) {
      alreadyActive.push(project.id);
      continue;
    }
    if (latestRun && latestRun.status === 'RUNNING') {
      stale.push(project.id);
      if (model?.update) {
        await model.update({ where: { id: latestRun.id }, data: { attempt: { increment: 1 }, stage: 'recovering', lastError: 'Recovered after a process restart.' } }).catch(() => undefined);
      }
    }
    await runCreativeProduction(
      prisma,
      { projectId: project.id, runId: latestRun?.status === 'RUNNING' ? latestRun.id : undefined, attempt: latestRun ? 2 : 1 },
      deps,
      { now },
    );
    recovered.push(project.id);
  }
  return { recovered, alreadyActive, stale };
}
