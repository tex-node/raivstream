/**
 * Raivstream 5.0 — Production runner (Slice 3).
 *
 * Executes an APPROVED plan through the GenerationAdapter (CapabilityRouter
 * decides what/how; the adapter talks to existing generation infra). Detached
 * from the request; resumable (skips READY assets); partial failures are
 * recorded per asset and never stop the remaining scenes; credits are charged
 * per generation and refunded on failure (existing convention). Dependencies
 * are injectable so the control flow is unit-testable without providers.
 */

import type { PrismaClient } from '@raivstream/database';
import { deductCredits, refundCredits, MODEL_FEATURE_KEY } from '../../credits';
import type { CreativeBibleState } from '../shared/types';
import { routeProduction, type GenerationSpec, type StillSpec, type VideoSpec } from './capabilityRouter';
import { generateStill, generateVideo, extractLastFrame, type GeneratedMedia } from './generationAdapter';
import type { CreativeProductionPlanState } from './plan';

export interface ProductionDeps {
  generateStill: (spec: StillSpec, projectId: string, assetId: string) => Promise<GeneratedMedia>;
  generateVideo: (spec: VideoSpec, projectId: string, assetId: string, seedImageUrl?: string) => Promise<GeneratedMedia>;
  extractLastFrame: (videoUrl: string, keyPrefix: string) => Promise<string | null>;
}

const defaultDeps: ProductionDeps = { generateStill, generateVideo, extractLastFrame };

export interface ProductionRunResult {
  generated: number;
  failed: number;
}

type ExistingAsset = { id: string; sceneId: string; kind: string; status: string; assetUrl: string | null };

export async function runCreativeProduction(
  prisma: PrismaClient,
  input: { projectId: string },
  deps: ProductionDeps = defaultDeps,
): Promise<ProductionRunResult> {
  const project = await prisma.creativeProject.findUnique({
    where: { id: input.projectId },
    include: { productionPlan: true, bible: true },
  });
  if (!project || !project.productionPlan) return { generated: 0, failed: 0 };

  const plan = project.productionPlan.plan as unknown as CreativeProductionPlanState;
  const bible = project.bible as unknown as CreativeBibleState | null;
  const specs: GenerationSpec[] = routeProduction(plan, bible);
  const existing = (await prisma.creativeProducedAsset.findMany({ where: { projectId: project.id } })) as unknown as ExistingAsset[];
  const byKey = new Map(existing.map((asset) => [`${asset.sceneId}:${asset.kind}`, asset]));

  let lastClipUrl: string | null = null;
  let generated = 0;
  let failed = 0;

  try {
    for (const spec of specs) {
      const key = `${spec.sceneId}:${spec.kind}`;
      const prior = byKey.get(key);
      if (prior && prior.status === 'READY') {
        if (spec.kind === 'VIDEO' && prior.assetUrl) lastClipUrl = prior.assetUrl;
        continue;
      }

      const asset = await prisma.creativeProducedAsset.create({
        data: { projectId: project.id, sceneId: spec.sceneId, kind: spec.kind, status: 'GENERATING' },
      });

      let seedImageUrl: string | undefined;
      if (spec.kind === 'VIDEO') {
        const still = byKey.get(`${spec.sceneId}:IMAGE`);
        if (lastClipUrl) {
          const chained = await deps.extractLastFrame(lastClipUrl, `creative/${project.id}/scenes/${spec.sceneId}/seeds`).catch(() => null);
          seedImageUrl = chained ?? still?.assetUrl ?? undefined;
        } else {
          seedImageUrl = still?.assetUrl ?? undefined;
        }
      }

      const featureKey = spec.kind === 'IMAGE' ? MODEL_FEATURE_KEY.FLUX2 : MODEL_FEATURE_KEY.H3_MAX;
      const ref = `creative-produce-${asset.id}`;
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
      } catch (error) {
        await prisma.creativeProducedAsset.update({
          where: { id: asset.id },
          data: { status: 'FAILED', errorMessage: (error as Error).message.slice(0, 500) },
        });
        if (creditsUsed > 0 && featureKey) {
          await refundCredits(prisma, project.userId, creditsUsed, featureKey, ref, 'Creative production failed').catch(() => undefined);
        }
        failed += 1;
      }
    }
  } finally {
    // Production completed (fully or partially) — hand off to REVIEW.
    await prisma.creativeProject.update({ where: { id: project.id }, data: { status: 'REVIEW' as never } }).catch(() => undefined);
  }

  return { generated, failed };
}