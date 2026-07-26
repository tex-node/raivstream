import type { PrismaClient } from '@raivstream/database';
import { analytics } from '../analytics';
import { creativeCriticProvider, CreativeCriticUnavailableError } from './creativeCriticProvider';
import { CREATIVE_CRITIC_VERSION, type CreativeCriticInput } from './criticTypes';
import { creativeCriticThreshold } from './qualityScorer';

function scorePatch(result: Awaited<ReturnType<typeof creativeCriticProvider.evaluate>>['result']) {
  return {
    overallScore: result.overallScore,
    characterIdentityScore: result.scores.characterIdentity,
    continuityScore: result.scores.continuity,
    compositionScore: result.scores.composition,
    lightingScore: result.scores.lighting,
    emotionScore: result.scores.emotion,
    visualStyleScore: result.scores.visualStyle,
    environmentScore: result.scores.environment,
    storyAlignmentScore: result.scores.storyAlignment,
    sceneClarityScore: result.scores.sceneClarity,
    technicalQualityScore: result.scores.technicalQuality,
    strengths: result.strengths,
    issues: result.issues,
    improvementPlan: result.improvementPlan,
    recommendation: result.recommendation,
    confidence: result.confidence,
  };
}

export async function createCreativeCriticRun(prisma: PrismaClient, input: {
  projectId: string;
  sceneId: string;
  assetId: string;
  retryAttempt?: number;
  parentCriticRunId?: string | null;
  promptVersion?: number | null;
  generationVersion?: number | null;
}) {
  return (prisma as any).creativeCriticRun.upsert({
    where: {
      assetId_retryAttempt: {
        assetId: input.assetId,
        retryAttempt: input.retryAttempt ?? 0,
      },
    },
    update: {
      status: 'PENDING',
      errorMessage: null,
      parentCriticRunId: input.parentCriticRunId ?? undefined,
    },
    create: {
      projectId: input.projectId,
      sceneId: input.sceneId,
      assetId: input.assetId,
      retryAttempt: input.retryAttempt ?? 0,
      parentCriticRunId: input.parentCriticRunId ?? null,
      promptVersion: input.promptVersion ?? null,
      generationVersion: input.generationVersion ?? null,
      criticVersion: CREATIVE_CRITIC_VERSION,
    },
  });
}

export async function runCreativeCritic(prisma: PrismaClient, input: {
  runId: string;
  userId?: string | null;
  audienceMode?: string | null;
  criticInput: CreativeCriticInput;
  threshold?: number | null;
}) {
  const threshold = input.threshold ?? creativeCriticThreshold();
  const started = Date.now();
  console.info('[creativeCritic] run_started', {
    runId: input.runId,
    projectId: input.criticInput.projectId,
    sceneId: input.criticInput.sceneId,
    assetId: input.criticInput.assetId,
    threshold,
  });
  await (prisma as any).creativeCriticRun.update({
    where: { id: input.runId },
    data: { status: 'RUNNING', errorMessage: null },
  });
  await analytics.track(prisma, {
    event: 'creative_critic_started',
    userId: input.userId,
    projectId: input.criticInput.projectId,
    properties: {
      sceneId: input.criticInput.sceneId,
      assetId: input.criticInput.assetId,
      audienceMode: input.audienceMode,
      threshold,
    },
  });

  try {
    const evaluated = await creativeCriticProvider.evaluate(input.criticInput);
    const patch = scorePatch(evaluated.result);
    const creativeStatus = evaluated.result.recommendation === 'APPROVE' ? 'APPROVED' : 'UNDER_REVIEW';
    const completedAt = new Date();
    const [run] = await (prisma as any).$transaction([
      (prisma as any).creativeCriticRun.update({
        where: { id: input.runId },
        data: {
          status: 'COMPLETED',
          ...patch,
          criticProvider: evaluated.provider,
          criticModel: evaluated.model,
          completedAt,
        },
      }),
      (prisma as any).storySceneAsset.update({
        where: { id: input.criticInput.assetId },
        data: {
          creativeStatus,
          criticScore: evaluated.result.overallScore,
          criticRecommendation: evaluated.result.recommendation,
          approvedAt: evaluated.result.recommendation === 'APPROVE' ? completedAt : null,
        },
      }),
    ]);
    await analytics.track(prisma, {
      event: 'creative_critic_completed',
      userId: input.userId,
      projectId: input.criticInput.projectId,
      properties: {
        sceneId: input.criticInput.sceneId,
        assetId: input.criticInput.assetId,
        audienceMode: input.audienceMode,
        score: evaluated.result.overallScore,
        recommendation: evaluated.result.recommendation,
        durationMs: Date.now() - started,
      },
    });
    await analytics.track(prisma, {
      event: 'creative_score_generated',
      userId: input.userId,
      projectId: input.criticInput.projectId,
      properties: {
        sceneId: input.criticInput.sceneId,
        assetId: input.criticInput.assetId,
        audienceMode: input.audienceMode,
        score: evaluated.result.overallScore,
        recommendation: evaluated.result.recommendation,
      },
    });
    if (Object.keys(evaluated.result.improvementPlan).length > 0) {
      await analytics.track(prisma, {
        event: 'creative_improvement_plan_created',
        userId: input.userId,
        projectId: input.criticInput.projectId,
        properties: {
          sceneId: input.criticInput.sceneId,
          assetId: input.criticInput.assetId,
          audienceMode: input.audienceMode,
          recommendation: evaluated.result.recommendation,
        },
      });
    }
    console.info('[creativeCritic] run_completed', {
      runId: input.runId,
      projectId: input.criticInput.projectId,
      sceneId: input.criticInput.sceneId,
      assetId: input.criticInput.assetId,
      score: evaluated.result.overallScore,
      recommendation: evaluated.result.recommendation,
      durationMs: Date.now() - started,
    });
    return run;
  } catch (error) {
    const unavailable = error instanceof CreativeCriticUnavailableError;
    const message = error instanceof Error ? error.message : 'Creative critic failed';
    const status = unavailable ? 'SKIPPED' : 'FAILED';
    const event = unavailable ? 'creative_critic_skipped' : 'creative_critic_failed';
    const run = await (prisma as any).creativeCriticRun.update({
      where: { id: input.runId },
      data: {
        status,
        errorMessage: message,
        criticProvider: unavailable ? null : 'openai-compatible',
        criticModel: unavailable ? null : process.env.CREATIVE_CRITIC_MODEL ?? process.env.OPENAI_VISION_MODEL ?? null,
        completedAt: new Date(),
      },
    });
    await (prisma as any).storySceneAsset.update({
      where: { id: input.criticInput.assetId },
      data: { creativeStatus: unavailable ? 'DRAFT' : 'UNDER_REVIEW' },
    }).catch(() => {});
    await analytics.track(prisma, {
      event,
      userId: input.userId,
      projectId: input.criticInput.projectId,
      properties: {
        sceneId: input.criticInput.sceneId,
        assetId: input.criticInput.assetId,
        audienceMode: input.audienceMode,
        message,
      },
    });
    console.warn(unavailable ? '[creativeCritic] run_skipped' : '[creativeCritic] run_failed', {
      runId: input.runId,
      projectId: input.criticInput.projectId,
      sceneId: input.criticInput.sceneId,
      assetId: input.criticInput.assetId,
      status,
      message,
    });
    return run;
  }
}
