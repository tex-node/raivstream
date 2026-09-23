/**
 * Raivstream 5.0 — ProductionPlanService.
 *
 * BRIEF + BIBLE → ProductionPlan → Preview. Persists the plan per project
 * (CreativeProductionPlan) so preview survives reload and production consumes a
 * stable plan. Gated by `RAIVSTREAM_5_PREVIEW_ENABLED` for the preview surface;
 * planning itself is deterministic and safe.
 */

import type { PrismaClient } from '@raivstream/database';
import { isCreativePreviewEnabled, isCreativeProductionEnabled } from '../featureFlags';
import { CreativeError } from '../shared/errors';
import type { CreativeBibleState, CreativeProjectType } from '../shared/types';
import { buildCreativePlan, type CreativeProductionPlanState } from './plan';
import { buildPreview, type PreviewState } from './preview';
import { adaptPlanToManifest, type AdapterManifest } from './adapter';
import { buildProductionContext } from './contextAdapter';
import { deriveProductionStages, type ProductionStage, type ProductionStageEntry } from './stages';
import { runCreativeProduction } from './runner';
import { intentService } from '../intent/service';
import { assessIntentReadiness } from '../intent/readiness';

type PlanRow = {
  version: number;
  plan: unknown;
  preview: unknown | null;
};

export interface ProductionSceneStatus {
  sceneId: string;
  title: string;
  status: 'PENDING' | 'GENERATING' | 'READY' | 'FAILED';
  assets: Array<{ id: string; shotId: string | null; kind: string; status: string; assetUrl: string | null; thumbnailUrl: string | null; errorMessage: string | null }>;
}

export interface ProductionStatus {
  status: string;
  expected: number;
  ready: number;
  failed: number;
  generating: number;
  progressPercent: number;
  /** Meaningful creative stage for the UI (never provider/job language). */
  stage: ProductionStage;
  /** Stage checklist the creator actually reads. */
  stages: ProductionStageEntry[];
  totalScenes: number;
  currentSceneIndex: number;
  /** Real progress dimensions — not a fake percentage. */
  images: { ready: number; expected: number };
  videos: { ready: number; expected: number };
  runId: string | null;
  runStatus: string | null;
  scenes: ProductionSceneStatus[];
}

function deriveSceneStatus(assets: Array<{ status: string }>): ProductionSceneStatus['status'] {
  if (assets.length === 0) return 'PENDING';
  if (assets.some((a) => a.status === 'GENERATING')) return 'GENERATING';
  if (assets.some((a) => a.status === 'FAILED')) return 'FAILED';
  if (assets.every((a) => a.status === 'READY')) return 'READY';
  return 'PENDING';
}

export class ProductionPlanService {
  /**
   * Defensive production-boundary invariant: a source-dependent request (real
   * product/brand/person, or a transform) must never reach production without
   * its required source. The renderer must never be the component that
   * discovers the missing source. Readiness normally blocks earlier; this is
   * the safety net. Failure is creator-actionable.
   */
  private async assertSourceReady(
    prisma: PrismaClient,
    project: { userId: string; brief: { originalIntent?: string | null; attachments?: unknown } | null },
  ): Promise<void> {
    const originalIntent = project.brief?.originalIntent ?? '';
    if (!originalIntent) return;
    let interpretation;
    try {
      interpretation = intentService.interpret(originalIntent);
    } catch {
      return; // cannot interpret → do not block (fail-open only on non-classification)
    }
    const attachments = Array.isArray(project.brief?.attachments) ? (project.brief?.attachments as unknown[]) : [];
    const studioProduct = await prisma.creativeProduct
      .findFirst({ where: { studio: { userId: project.userId } }, select: { id: true } })
      .catch(() => null);
    const readiness = assessIntentReadiness(originalIntent, interpretation, {
      hasSourceAsset: attachments.length > 0,
      hasStudioProduct: Boolean(studioProduct),
    });
    if (!readiness.ready) throw new CreativeError('MISSING_SOURCE', readiness.question);
  }

  async plan(prisma: PrismaClient, input: { projectId: string; userId: string }): Promise<{ plan: CreativeProductionPlanState; preview: PreviewState }> {
    const project = await prisma.creativeProject.findFirst({
      where: { id: input.projectId, userId: input.userId },
      include: { brief: true, bible: true, productionPlan: true },
    });
    if (!project) throw new CreativeError('PROJECT_NOT_FOUND', 'Creative project not found.');
    await this.assertSourceReady(prisma, project as never);

    const bible = project.bible as unknown as CreativeBibleState | null;
    const brief = {
      originalIntent: project.brief?.originalIntent ?? '',
      refinedIntent: project.brief?.refinedIntent ?? undefined,
      objective: project.brief?.objective ?? undefined,
      audience: project.brief?.audience ?? undefined,
      format: project.brief?.format ?? undefined,
      durationSeconds: project.brief?.durationSeconds ?? undefined,
      genre: project.brief?.genre ?? undefined,
      tone: project.brief?.tone ?? undefined,
      theme: project.brief?.theme ?? undefined,
      setting: project.brief?.setting ?? undefined,
    };

    const plan = buildCreativePlan({
      projectType: project.projectType as CreativeProjectType,
      brief,
      bible,
      version: (project.productionPlan?.version ?? 0) + 1,
      context: buildProductionContext({ brief, bible }),
    });
    const preview = buildPreview(plan, bible);

    if (project.productionPlan) {
      await prisma.creativeProductionPlan.update({
        where: { id: project.productionPlan.id },
        data: { version: plan.version, plan: plan as never, preview: preview as never },
      });
    } else {
      await prisma.creativeProductionPlan.create({
        data: { projectId: project.id, version: plan.version, plan: plan as never, preview: preview as never },
      });
    }

    // Planning owns the transition into PREVIEW so the creator can approve it.
    // (The router previously did this separately; centralizing it keeps the
    // state machine consistent for every caller, including tooling.)
    await prisma.creativeProject.update({ where: { id: project.id }, data: { status: 'PREVIEW' as never } });

    return { plan, preview };
  }

  async getPlan(prisma: PrismaClient, input: { projectId: string; userId: string }): Promise<{ plan: CreativeProductionPlanState; preview: PreviewState } | null> {
    const project = await prisma.creativeProject.findFirst({
      where: { id: input.projectId, userId: input.userId },
      include: { productionPlan: true },
    });
    if (!project) throw new CreativeError('PROJECT_NOT_FOUND', 'Creative project not found.');
    const row = project.productionPlan as unknown as PlanRow | null;
    if (!row) return null;
    const plan = row.plan as CreativeProductionPlanState;
    const preview = (row.preview as PreviewState | null) ?? buildPreview(plan, undefined);
    return { plan, preview };
  }

  /** Adapter output for Slice 3 — never exposes providers/prompts to the creator. */
  async adapt(prisma: PrismaClient, input: { projectId: string; userId: string }): Promise<AdapterManifest | null> {
    const project = await prisma.creativeProject.findFirst({
      where: { id: input.projectId, userId: input.userId },
      include: { productionPlan: true, brief: true },
    });
    if (!project) throw new CreativeError('PROJECT_NOT_FOUND', 'Creative project not found.');
    if (!project.productionPlan) return null;
    const plan = (project.productionPlan.plan as unknown) as CreativeProductionPlanState;
    return adaptPlanToManifest(plan, { title: project.title, logline: project.brief?.refinedIntent ?? project.brief?.originalIntent });
  }

  isPreviewEnabled(): boolean {
    return isCreativePreviewEnabled();
  }

  isProductionEnabled(): boolean {
    return isCreativeProductionEnabled();
  }

  /**
   * Slice 3 — start production of an APPROVED plan. The only production entry
   * point for the 5.0 semantic layer. Validates approval, moves the project to
   * GENERATING, and runs the (detached, resumable) production runner.
   */
  async produce(prisma: PrismaClient, input: { projectId: string; userId: string }): Promise<{ started: boolean; reason?: 'already_running'; runId?: string | null }> {
    if (!isCreativeProductionEnabled()) throw new CreativeError('CREATIVE_DISABLED', 'Raivstream 5.0 production is not enabled.');
    const project = await prisma.creativeProject.findFirst({
      where: { id: input.projectId, userId: input.userId },
      include: { productionPlan: true, brief: true },
    });
    if (!project) throw new CreativeError('PROJECT_NOT_FOUND', 'Creative project not found.');
    await this.assertSourceReady(prisma, project as never);
    if (!project.productionPlan) throw new CreativeError('PLAN_NOT_APPROVED', 'Build and approve a production plan before producing.');
    // The first production requires an approved preview; a refinement after a
    // directive (REVIEW / REFINING / DIRECTING) may regenerate affected scenes.
    const producible = project.status === 'APPROVED' || project.status === 'REVIEW' || project.status === 'REFINING' || project.status === 'DIRECTING';
    if (!producible) {
      if (project.status === 'GENERATING') return { started: false, reason: 'already_running' };
      throw new CreativeError('PLAN_NOT_APPROVED', 'Approve the preview before producing.');
    }

    // Idempotent production operations (Phase 9): never start a second run while
    // one is genuinely active. A stale RUNNING row (dead process) is recovered
    // by `recoverStuckProductions`, not started twice here.
    const runModel = (prisma as unknown as { creativeProductionRun?: { findFirst?: (args: unknown) => Promise<{ id: string; status: string; heartbeatAt: Date } | null>; create?: (args: unknown) => Promise<{ id: string }> } }).creativeProductionRun;
    const activeRun = runModel?.findFirst
      ? await runModel.findFirst({ where: { projectId: project.id, status: 'RUNNING' }, orderBy: { startedAt: 'desc' } }).catch(() => null)
      : null;
    if (activeRun) return { started: false, reason: 'already_running', runId: activeRun.id };

    const plan = project.productionPlan.plan as unknown as CreativeProductionPlanState;
    let runId: string | null = null;
    if (runModel?.create) {
      try {
        const run = await runModel.create({ data: { projectId: project.id, status: 'RUNNING', totalScenes: plan.scenes.length, stage: 'creating_scenes', contextSnapshot: plan.contextSnapshot ?? undefined } });
        runId = run.id;
      } catch {
        runId = null;
      }
    }

    await prisma.creativeProject.update({ where: { id: project.id }, data: { status: 'GENERATING' as never } });
    void runCreativeProduction(prisma, { projectId: project.id, runId: runId ?? undefined });
    return { started: true, runId };
  }

  /** Scene-level production progress suitable for the UI (no generation-job detail). */
  async productionStatus(prisma: PrismaClient, input: { projectId: string; userId: string }): Promise<ProductionStatus> {
    const project = await prisma.creativeProject.findFirst({
      where: { id: input.projectId, userId: input.userId },
      include: { productionPlan: true, bible: true },
    });
    if (!project) throw new CreativeError('PROJECT_NOT_FOUND', 'Creative project not found.');
    const plan = project.productionPlan?.plan as unknown as CreativeProductionPlanState | undefined;
    const bible = project.bible as unknown as CreativeBibleState | null;
    const assets = (await prisma.creativeProducedAsset.findMany({ where: { projectId: project.id }, orderBy: { createdAt: 'asc' } })) as unknown as Array<{ id: string; sceneId: string; shotId: string | null; kind: string; status: string; assetUrl: string | null; thumbnailUrl: string | null; errorMessage: string | null }>;
    const ready = assets.filter((a) => a.status === 'READY').length;
    const failed = assets.filter((a) => a.status === 'FAILED').length;
    const generating = assets.filter((a) => a.status === 'GENERATING' || a.status === 'QUEUED').length;
    const expected = plan ? plan.scenes.length * 2 : 0; // one still + one video per scene
    const scenes: ProductionSceneStatus[] = (plan?.scenes ?? []).map((scene) => {
      const sceneAssets = assets.filter((a) => a.sceneId === scene.sceneId);
      return { sceneId: scene.sceneId, title: scene.title, status: deriveSceneStatus(sceneAssets), assets: sceneAssets };
    });

    const totalScenes = scenes.length;
    const currentSceneIndexRaw = scenes.findIndex((scene) => scene.status !== 'READY');
    const currentSceneIndex = currentSceneIndexRaw < 0 ? Math.max(0, totalScenes - 1) : currentSceneIndexRaw;

    const imagesReady = assets.filter((a) => a.kind === 'IMAGE' && a.status === 'READY').length;
    const videosReady = assets.filter((a) => a.kind === 'VIDEO' && a.status === 'READY').length;
    const hasCharacters = ((bible?.characters ?? []) as unknown[]).length > 0;
    const { stage, stages } = deriveProductionStages({
      projectStatus: project.status,
      hasPlan: Boolean(plan),
      hasBible: Boolean(bible),
      hasCharacters,
      ready,
      failed,
      generating,
      expected,
      currentSceneIndex,
    });

    const runModel = (prisma as unknown as { creativeProductionRun?: { findFirst?: (args: unknown) => Promise<{ id: string; status: string } | null> } }).creativeProductionRun;
    const latestRun = runModel?.findFirst
      ? await runModel.findFirst({ where: { projectId: project.id }, orderBy: { startedAt: 'desc' } }).catch(() => null)
      : null;

    return {
      status: project.status,
      expected,
      ready,
      failed,
      generating,
      progressPercent: expected > 0 ? Math.min(100, Math.round(((ready + failed) / expected) * 100)) : 0,
      stage,
      stages,
      totalScenes,
      currentSceneIndex,
      images: { ready: imagesReady, expected: totalScenes },
      videos: { ready: videosReady, expected: totalScenes },
      runId: latestRun?.id ?? null,
      runStatus: latestRun?.status ?? null,
      scenes,
    };
  }

  async getAssets(prisma: PrismaClient, input: { projectId: string; userId: string }) {
    const project = await prisma.creativeProject.findFirst({ where: { id: input.projectId, userId: input.userId } });
    if (!project) throw new CreativeError('PROJECT_NOT_FOUND', 'Creative project not found.');
    return prisma.creativeProducedAsset.findMany({ where: { projectId: input.projectId }, orderBy: { createdAt: 'asc' } });
  }
}

export const productionPlanService = new ProductionPlanService();