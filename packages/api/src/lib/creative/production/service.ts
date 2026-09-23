/**
 * Raivstream 5.0 — ProductionPlanService.
 *
 * BRIEF + BIBLE → ProductionPlan → Preview. Persists the plan per project
 * (CreativeProductionPlan) so preview survives reload and production consumes a
 * stable plan. Gated by `RAIVSTREAM_5_PREVIEW_ENABLED` for the preview surface;
 * planning itself is deterministic and safe.
 */

import type { PrismaClient } from '@raivstream/database';
import { isCreativePreviewEnabled } from '../featureFlags';
import { CreativeError } from '../shared/errors';
import type { CreativeBibleState, CreativeProjectType } from '../shared/types';
import { buildCreativePlan, type CreativeProductionPlanState } from './plan';
import { buildPreview, type PreviewState } from './preview';
import { adaptPlanToManifest, type AdapterManifest } from './adapter';

type PlanRow = {
  version: number;
  plan: unknown;
  preview: unknown | null;
};

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
}

export const productionPlanService = new ProductionPlanService();