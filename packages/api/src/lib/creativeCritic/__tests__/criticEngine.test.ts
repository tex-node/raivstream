import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analytics } from '../../analytics';
import { createCreativeCriticRun, runCreativeCritic } from '../criticEngine';
import { creativeCriticProvider, CreativeCriticUnavailableError } from '../creativeCriticProvider';
import type { CreativeCriticInput, CreativeCriticResult } from '../criticTypes';

const criticInput: CreativeCriticInput = {
  assetUrl: 'https://cdn.example.com/asset.png',
  assetId: 'asset1',
  projectId: 'project1',
  sceneId: 'scene1',
  creativeSpecification: { sceneTitle: 'Road to School' },
  storyDna: { hero: 'Max' },
  visualDna: { visualStyle: 'THREE_D_ANIMATED' },
  characterDirector: [{ name: 'Max' }],
  sceneDirector: { emotion: 'CURIOUS' },
  selectedVisualStyle: 'THREE_D_ANIMATED',
  providerMetadata: { provider: 'RunPod', model: 'z-image-turbo' },
  generationMetadata: { requestedModel: 'FLUX' },
};

function result(overallScore: number, recommendation: CreativeCriticResult['recommendation']): CreativeCriticResult {
  return {
    overallScore,
    scores: {
      characterIdentity: overallScore,
      continuity: overallScore,
      composition: overallScore,
      lighting: overallScore,
      emotion: overallScore,
      visualStyle: overallScore,
      environment: overallScore,
      storyAlignment: overallScore,
      sceneClarity: overallScore,
      technicalQuality: overallScore,
    },
    strengths: ['Clear story beat'],
    issues: recommendation === 'APPROVE' ? [] : [{ category: 'COMPOSITION', severity: 'MEDIUM', description: 'Subject needs clearer framing' }],
    improvementPlan: recommendation === 'APPROVE' ? {} : { composition: ['Use a wider frame'] },
    recommendation,
    confidence: 90,
  };
}

function prismaMock() {
  const runUpdate = vi.fn(async ({ data }) => ({ id: 'run1', ...data }));
  const assetUpdate = vi.fn(async ({ data }) => ({ id: 'asset1', ...data }));
  return {
    creativeCriticRun: {
      upsert: vi.fn(async (args) => ({ id: 'run1', ...args.create, ...args.update })),
      update: runUpdate,
    },
    storySceneAsset: {
      update: assetUpdate,
    },
    $transaction: vi.fn(async (items: Array<Promise<unknown>>) => Promise.all(items)),
  } as any;
}

describe('creative critic engine integration behavior', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates critic runs idempotently by asset and retry attempt', async () => {
    const prisma = prismaMock();
    const run = await createCreativeCriticRun(prisma, {
      projectId: 'project1',
      sceneId: 'scene1',
      assetId: 'asset1',
      retryAttempt: 1,
      parentCriticRunId: 'parent1',
      promptVersion: 2,
      generationVersion: 3,
    });
    expect(prisma.creativeCriticRun.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { assetId_retryAttempt: { assetId: 'asset1', retryAttempt: 1 } },
    }));
    expect(run).toMatchObject({ assetId: 'asset1', retryAttempt: 1, parentCriticRunId: 'parent1' });
  });

  it('completes a high-score run and creatively approves the asset', async () => {
    const prisma = prismaMock();
    vi.spyOn(analytics, 'track').mockResolvedValue(null);
    vi.spyOn(creativeCriticProvider, 'evaluate').mockResolvedValue({
      provider: 'openai-compatible',
      model: 'gpt-4o-mini',
      result: result(94, 'APPROVE'),
    });
    const run = await runCreativeCritic(prisma, {
      runId: 'run1',
      userId: 'user1',
      audienceMode: 'GENERAL',
      criticInput,
      threshold: 90,
    });
    expect(run).toMatchObject({ status: 'COMPLETED', overallScore: 94, recommendation: 'APPROVE' });
    expect(prisma.storySceneAsset.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'asset1' },
      data: expect.objectContaining({ creativeStatus: 'APPROVED', criticScore: 94, criticRecommendation: 'APPROVE' }),
    }));
    expect(analytics.track).toHaveBeenCalledWith(prisma, expect.objectContaining({ event: 'creative_critic_completed' }));
    expect(analytics.track).toHaveBeenCalledWith(prisma, expect.objectContaining({ event: 'creative_score_generated' }));
  });

  it('stores improvement plans and keeps medium-score assets under review', async () => {
    const prisma = prismaMock();
    vi.spyOn(analytics, 'track').mockResolvedValue(null);
    vi.spyOn(creativeCriticProvider, 'evaluate').mockResolvedValue({
      provider: 'openai-compatible',
      model: 'gpt-4o-mini',
      result: result(78, 'SUGGEST_REFINEMENT'),
    });
    await runCreativeCritic(prisma, {
      runId: 'run1',
      userId: 'user1',
      criticInput,
      threshold: 90,
    });
    expect(prisma.storySceneAsset.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ creativeStatus: 'UNDER_REVIEW', criticRecommendation: 'SUGGEST_REFINEMENT' }),
    }));
    expect(analytics.track).toHaveBeenCalledWith(prisma, expect.objectContaining({ event: 'creative_improvement_plan_created' }));
  });

  it('marks unavailable providers as skipped without fabricating scores', async () => {
    const prisma = prismaMock();
    vi.spyOn(analytics, 'track').mockResolvedValue(null);
    vi.spyOn(creativeCriticProvider, 'evaluate').mockRejectedValue(new CreativeCriticUnavailableError());
    const run = await runCreativeCritic(prisma, {
      runId: 'run1',
      userId: 'user1',
      criticInput,
      threshold: 90,
    });
    expect(run).toMatchObject({ status: 'SKIPPED', errorMessage: 'Creative critic provider is not configured' });
    expect(run.overallScore).toBeUndefined();
    expect(prisma.storySceneAsset.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { creativeStatus: 'DRAFT' },
    }));
    expect(analytics.track).toHaveBeenCalledWith(prisma, expect.objectContaining({ event: 'creative_critic_skipped' }));
  });

  it('marks provider/schema failures as failed while preserving the asset', async () => {
    const prisma = prismaMock();
    vi.spyOn(analytics, 'track').mockResolvedValue(null);
    vi.spyOn(creativeCriticProvider, 'evaluate').mockRejectedValue(new Error('Malformed critic response'));
    const run = await runCreativeCritic(prisma, {
      runId: 'run1',
      userId: 'user1',
      criticInput,
      threshold: 90,
    });
    expect(run).toMatchObject({ status: 'FAILED', errorMessage: 'Malformed critic response' });
    expect(prisma.storySceneAsset.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { creativeStatus: 'UNDER_REVIEW' },
    }));
    expect(analytics.track).toHaveBeenCalledWith(prisma, expect.objectContaining({ event: 'creative_critic_failed' }));
  });
});
