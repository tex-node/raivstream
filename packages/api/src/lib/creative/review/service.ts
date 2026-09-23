/**
 * Raivstream 5.0 — ReviewService (Slice 4A).
 *
 * Production Output → ReviewService → CreativeCritic → human-readable findings
 * → KEEP / FIX / REVIEW. The existing critic is the analytical engine; this
 * service owns the 5.0 experience and the KEEP/FIX/REVIEW resolutions (FIX
 * feeds the Director). Findings are actionable objects, not text reports.
 */

import type { PrismaClient } from '@raivstream/database';
import { isCreativeReviewEnabled } from '../featureFlags';
import { CreativeError } from '../shared/errors';
import type { CreativeBibleState } from '../shared/types';
import type { CreativeProductionPlanState } from '../production/plan';
import { buildCriticInput, evaluateWithCritic } from './criticAdapter';
import type { EntityReference, ReviewFinding, ReviewRunState } from './types';

export class ReviewService {
  async runReview(
    prisma: PrismaClient,
    input: { projectId: string; userId: string },
    evaluator?: Parameters<typeof evaluateWithCritic>[1],
  ): Promise<ReviewRunState[]> {
    if (!isCreativeReviewEnabled()) throw new CreativeError('CREATIVE_DISABLED', 'Raivstream 5.0 review is not enabled.');
    const project = await prisma.creativeProject.findFirst({
      where: { id: input.projectId, userId: input.userId },
      include: { productionPlan: true, bible: true },
    });
    if (!project) throw new CreativeError('PROJECT_NOT_FOUND', 'Creative project not found.');
    const plan = project.productionPlan?.plan as unknown as CreativeProductionPlanState | undefined;
    const bible = project.bible as unknown as CreativeBibleState | null;
    const assets = await prisma.creativeProducedAsset.findMany({
      where: { projectId: project.id, status: 'READY', kind: 'IMAGE' },
      orderBy: { createdAt: 'asc' },
      take: 12,
    });

    const runs: ReviewRunState[] = [];
    for (const asset of assets) {
      const scene = plan?.scenes.find((s) => s.sceneId === asset.sceneId);
      const refs: EntityReference[] = [
        { type: 'SCENE', id: asset.sceneId, name: scene?.title },
        { type: 'ASSET', id: asset.id },
      ];
      const criticInput = buildCriticInput({ producedAsset: asset, sceneId: asset.sceneId, projectId: project.id, scene, bible });

      const run = await prisma.creativeReviewRun.create({
        data: { projectId: project.id, sceneId: asset.sceneId, assetId: asset.id, status: 'RUNNING', findings: [] },
      });

      try {
        const evaluated = await evaluateWithCritic({ criticInput, refs }, evaluator);
        const findings: ReviewFinding[] = evaluated?.findings ?? [];
        const status = evaluated === null ? 'FAILED' : 'COMPLETED';
        await prisma.creativeReviewRun.update({
          where: { id: run.id },
          data: { status: status as never, findings: findings as never, provider: evaluated?.provider ?? null },
        });
        runs.push({ id: run.id, projectId: project.id, sceneId: asset.sceneId, assetId: asset.id, status, findings, provider: evaluated?.provider ?? null, createdAt: run.createdAt });
      } catch (error) {
        await prisma.creativeReviewRun.update({
          where: { id: run.id },
          data: {
            status: 'FAILED',
            findings: [{ id: 'error', category: 'TECHNICAL', description: `Review could not run for this scene: ${(error as Error).message}`, affectedEntities: refs, severity: 'HIGH' }] as never,
          },
        });
        runs.push({ id: run.id, projectId: project.id, sceneId: asset.sceneId, assetId: asset.id, status: 'FAILED', findings: [], provider: null, createdAt: run.createdAt });
      }
    }

    return runs;
  }

  async getReview(prisma: PrismaClient, input: { projectId: string; userId: string }): Promise<{ runs: ReviewRunState[]; resolutions: Record<string, string> }> {
    const project = await prisma.creativeProject.findFirst({ where: { id: input.projectId, userId: input.userId } });
    if (!project) throw new CreativeError('PROJECT_NOT_FOUND', 'Creative project not found.');
    const runsRaw = await prisma.creativeReviewRun.findMany({ where: { projectId: project.id }, orderBy: { createdAt: 'desc' }, take: 10 });
    const runIds = runsRaw.map((run) => run.id);
    const resolutionsRaw = runIds.length
      ? await prisma.creativeReviewResolution.findMany({ where: { runId: { in: runIds } } })
      : [];
    const resolutions: Record<string, string> = {};
    for (const resolution of resolutionsRaw) resolutions[`${resolution.runId}:${resolution.findingId}`] = resolution.resolution;
    const runs: ReviewRunState[] = runsRaw.map((run) => ({
      id: run.id,
      projectId: run.projectId,
      sceneId: run.sceneId,
      assetId: run.assetId,
      status: run.status,
      findings: (run.findings as unknown as ReviewFinding[]) ?? [],
      provider: run.provider,
      createdAt: run.createdAt,
    }));
    return { runs, resolutions };
  }

  async resolve(
    prisma: PrismaClient,
    input: { projectId: string; runId: string; findingId: string; resolution: 'KEEP' | 'FIX' | 'REVIEW' },
  ): Promise<void> {
    const run = await prisma.creativeReviewRun.findFirst({ where: { id: input.runId, projectId: input.projectId } });
    if (!run) throw new CreativeError('PROJECT_NOT_FOUND', 'Review run not found.');
    await prisma.creativeReviewResolution.upsert({
      where: { runId_findingId: { runId: input.runId, findingId: input.findingId } },
      update: { resolution: input.resolution as never },
      create: { runId: input.runId, findingId: input.findingId, resolution: input.resolution as never },
    });
  }
}

export const reviewService = new ReviewService();