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
import { runCreativeProduction } from './runner';

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
  async plan(prisma: PrismaClient, input: { projectId: string; userId: string }): Promise<{ plan: CreativeProductionPlanState; preview: PreviewState }> {
    const project = await prisma.creativeProject.findFirst({
      where: { id: input.projectId, userId: input.userId },
      include: { brief: true, bible: true, productionPlan: true },
    });
    if (!project) throw new CreativeError('PROJECT_NOT_FOUND', 'Creative project not found.');

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
  async produce(prisma: PrismaClient, input: { projectId: string; userId: string }): Promise<{ started: boolean; reason?: 'already_running' }> {
    if (!isCreativeProductionEnabled()) throw new CreativeError('CREATIVE_DISABLED', 'Raivstream 5.0 production is not enabled.');
    const project = await prisma.creativeProject.findFirst({
      where: { id: input.projectId, userId: input.userId },
      include: { productionPlan: true },
    });
    if (!project) throw new CreativeError('PROJECT_NOT_FOUND', 'Creative project not found.');
    if (!project.productionPlan) throw new CreativeError('PLAN_NOT_APPROVED', 'Build and approve a production plan before producing.');
    if (project.status !== 'APPROVED') {
      if (project.status === 'GENERATING') return { started: false, reason: 'already_running' };
      throw new CreativeError('PLAN_NOT_APPROVED', 'Approve the preview before producing.');
    }
    await prisma.creativeProject.update({ where: { id: project.id }, data: { status: 'GENERATING' as never } });
    void runCreativeProduction(prisma, { projectId: project.id });
    return { started: true };
  }

  /** Scene-level production progress suitable for the UI (no generation-job detail). */
  async productionStatus(prisma: PrismaClient, input: { projectId: string; userId: string }): Promise<ProductionStatus> {
    const project = await prisma.creativeProject.findFirst({
      where: { id: input.projectId, userId: input.userId },
      include: { productionPlan: true },
    });
    if (!project) throw new CreativeError('PROJECT_NOT_FOUND', 'Creative project not found.');
    const plan = project.productionPlan?.plan as unknown as CreativeProductionPlanState | undefined;
    const assets = (await prisma.creativeProducedAsset.findMany({ where: { projectId: project.id }, orderBy: { createdAt: 'asc' } })) as unknown as Array<{ id: string; sceneId: string; shotId: string | null; kind: string; status: string; assetUrl: string | null; thumbnailUrl: string | null; errorMessage: string | null }>;
    const ready = assets.filter((a) => a.status === 'READY').length;
    const failed = assets.filter((a) => a.status === 'FAILED').length;
    const generating = assets.filter((a) => a.status === 'GENERATING' || a.status === 'QUEUED').length;
    const expected = plan ? plan.scenes.length * 2 : 0; // one still + one video per scene
    const scenes: ProductionSceneStatus[] = (plan?.scenes ?? []).map((scene) => {
      const sceneAssets = assets.filter((a) => a.sceneId === scene.sceneId);
      return { sceneId: scene.sceneId, title: scene.title, status: deriveSceneStatus(sceneAssets), assets: sceneAssets };
    });
    return {
      status: project.status,
      expected,
      ready,
      failed,
      generating,
      progressPercent: expected > 0 ? Math.min(100, Math.round(((ready + failed) / expected) * 100)) : 0,
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