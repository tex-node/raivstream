/**
 * Flag resolution (2026-11-03).
 *
 * Scoring an asset never cleared its flag, and the first attempt at a resolution pass matched
 * nothing: it filtered assets by `isLatest: true` and looked for the ORIGINAL asset id that the
 * flag points at, so a scene whose take scored 90 kept its flag. The live count then overstated
 * the backlog.
 *
 * Matching is therefore by PROJECT + SCENE, across every take of that scene, and the pass fails
 * loudly if it was expected to clear something and cleared nothing — the silent-zero class, one
 * more time.
 */
import type { PrismaClient } from '@raivstream/database';

export const RESOLUTION_EXPECTED_BUT_CLEARED_ZERO = 'RESOLUTION_EXPECTED_BUT_CLEARED_ZERO';

export interface SceneScore {
  sceneId: string;
  identity: number;
}

export interface ResolutionResult {
  cleared: number;
  expected: number;
  scenes: Array<{ sceneId: string; identity: number; cleared: number }>;
}

export async function resolveClearedFlags(
  prisma: PrismaClient,
  input: { projectId: string; sceneScores: SceneScore[]; floor?: number },
): Promise<ResolutionResult> {
  const floor = input.floor ?? 75;
  const scenes: ResolutionResult['scenes'] = [];
  let cleared = 0;
  let expected = 0;

  for (const score of input.sceneScores) {
    if (!Number.isFinite(score.identity)) continue;
    // Every take of the scene, not just the latest: a flag points at the asset that earned it,
    // which is usually the demoted one.
    const assets = await prisma.creativeProducedAsset.findMany({
      where: { projectId: input.projectId, sceneId: score.sceneId },
      select: { id: true },
    });
    const ids = assets.map((asset) => asset.id);
    if (ids.length === 0) {
      scenes.push({ sceneId: score.sceneId, identity: score.identity, cleared: 0 });
      continue;
    }
    if (score.identity < floor) {
      scenes.push({ sceneId: score.sceneId, identity: score.identity, cleared: 0 });
      continue;
    }
    const live = await prisma.creativeReviewFlag.count({
      where: { assetId: { in: ids }, resolution: null } as never,
    });
    expected += live;
    if (live === 0) {
      scenes.push({ sceneId: score.sceneId, identity: score.identity, cleared: 0 });
      continue;
    }
    const result = await prisma.creativeReviewFlag.updateMany({
      where: { assetId: { in: ids }, resolution: null } as never,
      data: {
        resolution: 'cleared',
        reviewedAt: new Date(),
        note: `identity=${score.identity} >= floor ${floor}`,
      } as never,
    });
    cleared += result.count;
    scenes.push({ sceneId: score.sceneId, identity: score.identity, cleared: result.count });
  }

  if (expected > 0 && cleared === 0) {
    throw new Error(
      `${RESOLUTION_EXPECTED_BUT_CLEARED_ZERO}: expected ${expected} resolution(s) for project ${input.projectId}, cleared 0`,
    );
  }

  return { cleared, expected, scenes };
}