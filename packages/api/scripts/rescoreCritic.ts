/**
 * 802 re-score batch — the number, not a cleanup.
 *
 * 802 assets were approved under the constant-90 critic and are only provisionally
 * approved. This runner re-scores them with the current critic and the current
 * per-dimension gate, and — per the live-content policy — writes one audit row per
 * live asset below floor. It never unpublishes anything: the policy is flag, not
 * withdraw.
 *
 * Design constraints, each because of a way the batch could lie:
 *  - RESUMABLE: assets already carrying a run for CRITIC_VERSION are skipped, so a
 *    crash and restart continues rather than restarting or double-counting.
 *  - RATE-LIMITED: the critic provider has limits; a burst of 802 calls would turn
 *    into provider errors that look like "no findings".
 *  - IDEMPOTENT: `@@unique([assetId, runId])` on the flag table makes a resumed or
 *    repeated batch unable to double-flag the same asset for the same run.
 *  - READ-ONLY toward publication: no Video.status, no moderationStatus, no feed.
 */
import { prisma } from '@raivstream/database';
import { buildCriticInput, evaluateWithCritic } from '../src/lib/creative/review/criticAdapter';
import type { CreativeBibleState } from '../src/lib/creative/shared/types';
import type { CreativeProductionPlanState } from '../src/lib/creative/production/plan';
import {
  dimensionFloorBreaches,
  dimensionFloors,
  recommendationForResult,
} from '../src/lib/creativeCritic/qualityScorer';

export const CRITIC_VERSION = 'phase3-dimension-floors-v1';

const RATE_LIMIT_MS = 300;
const CHUNK = 25;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface RescoreSummary {
  processed: number;
  flagged: number;
  skipped: number;
  unavailable: number;
  failed: number;
}

export async function runRescoreBatch(
  limit = Number.POSITIVE_INFINITY,
  log: (line: string) => void = (line) => console.info(line),
): Promise<RescoreSummary> {
  const summary: RescoreSummary = { processed: 0, flagged: 0, skipped: 0, unavailable: 0, failed: 0 };
  let cursorCreatedAt: Date | null = null;

  for (;;) {
    const assets = await (prisma as any).creativeProducedAsset.findMany({
      where: {
        status: 'READY',
        ...(cursorCreatedAt ? { createdAt: { gt: cursorCreatedAt } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: CHUNK,
      select: { id: true, sceneId: true, projectId: true, assetUrl: true, kind: true, createdAt: true },
    });
    if (assets.length === 0) break;
    cursorCreatedAt = assets[assets.length - 1].createdAt as Date;

    for (const asset of assets) {
      if (summary.processed + summary.skipped + summary.unavailable + summary.failed >= limit) return summary;

      const already = await (prisma as any).creativeCriticRun.findFirst({
        where: { assetId: asset.id, criticVersion: CRITIC_VERSION },
        select: { id: true },
      });
      if (already) { summary.skipped += 1; continue; }

      const project = await (prisma as any).creativeProject.findFirst({
        where: { id: asset.projectId },
        select: { id: true, bible: true, productionPlan: true, status: true },
      });
      if (!project) { summary.skipped += 1; continue; }

      const plan = project.productionPlan as unknown as CreativeProductionPlanState | null;
      const scene = plan?.scenes?.find((s: { sceneId: string }) => s.sceneId === asset.sceneId);

      let evaluated: Awaited<ReturnType<typeof evaluateWithCritic>> = null;
      try {
        const criticInput = buildCriticInput({
          producedAsset: asset as never,
          sceneId: asset.sceneId,
          projectId: asset.projectId,
          scene,
          bible: project.bible as unknown as CreativeBibleState | null,
        });
        evaluated = await evaluateWithCritic({
          criticInput,
          refs: [
            { type: 'SCENE', id: asset.sceneId, name: scene?.title },
            { type: 'ASSET', id: asset.id },
          ],
        });
      } catch (error) {
        summary.failed += 1;
        log(`[rescore] failed asset=${asset.id} ${(error as Error).message.slice(0, 80)}`);
        await sleep(RATE_LIMIT_MS);
        continue;
      }

      if (!evaluated) { summary.unavailable += 1; await sleep(RATE_LIMIT_MS); continue; }

      const overall = evaluated.scores.overall;
      const dims = evaluated.scores.dimensions;
      const recommendation = recommendationForResult({ overallScore: overall, scores: dims });

      const run = await (prisma as any).creativeCriticRun.create({
        data: {
          projectId: asset.projectId,
          sceneId: asset.sceneId,
          assetId: asset.id,
          status: 'COMPLETED',
          criticVersion: CRITIC_VERSION,
          criticProvider: evaluated.provider,
          overallScore: overall,
          characterIdentityScore: dims.characterIdentity ?? null,
          continuityScore: dims.continuity ?? null,
          compositionScore: dims.composition ?? null,
          lightingScore: dims.lighting ?? null,
          emotionScore: dims.emotion ?? null,
          visualStyleScore: dims.visualStyle ?? null,
          environmentScore: dims.environment ?? null,
          storyAlignmentScore: dims.storyAlignment ?? null,
          sceneClarityScore: dims.sceneClarity ?? null,
          technicalQualityScore: dims.technicalQuality ?? null,
          recommendation,
        },
      });

      summary.processed += 1;

      if (recommendation !== 'APPROVE') {
        const floors = dimensionFloors();
        const breaches = dimensionFloorBreaches(dims, floors);
        // A rejection can come from the aggregate alone; then the flag names that.
        const rows = breaches.length
          ? breaches.map((dimension) => ({ dimension, score: Number(dims[dimension] ?? 0), floor: floors[dimension] }))
          : [{ dimension: 'overall', score: overall, floor: 80 }];

        for (const row of rows) {
          await (prisma as any).creativeReviewFlag.upsert({
            where: { assetId_runId: { assetId: asset.id, runId: run.id } },
            update: {},
            create: {
              assetId: asset.id,
              sceneId: asset.sceneId,
              projectId: asset.projectId,
              runId: run.id,
              dimension: row.dimension,
              score: row.score,
              floor: row.floor,
              criticVersion: CRITIC_VERSION,
              source: 'RESCORE_BATCH',
            },
          });
        }
        summary.flagged += 1;
      }

      await sleep(RATE_LIMIT_MS);
    }

    log(`[rescore] processed=${summary.processed} flagged=${summary.flagged} skipped=${summary.skipped} unavailable=${summary.unavailable} failed=${summary.failed}`);
  }

  return summary;
}

if (require.main === module) {
  runRescoreBatch(Number(process.env.RESCORE_LIMIT ?? Number.POSITIVE_INFINITY))
    .then((summary) => {
      console.info(
        `[rescore] DONE processed=${summary.processed} flagged=${summary.flagged} skipped=${summary.skipped} unavailable=${summary.unavailable} failed=${summary.failed}`,
      );
      process.exit(0);
    })
    .catch((error) => {
      console.error('[rescore] FATAL', error);
      process.exit(1);
    });
}
