import { createHash } from 'crypto';
import { HARD_MAX_CREATIVE_CRITIC_RETRIES, clampScore } from './qualityScorer';

export type CreativeCriticRuntimeMode = 'OFF' | 'SUGGEST' | 'AUTO_ONCE' | 'AUTO_UNTIL_THRESHOLD';

export type RetryDecisionInput = {
  mode: CreativeCriticRuntimeMode;
  score: number | null | undefined;
  threshold: number;
  retryAttempt: number;
  projectMaxRetries?: number | null;
  providerHealthy?: boolean;
  hasCredits?: boolean;
  moderationRejected?: boolean;
};

export function effectiveRetryLimit(projectMaxRetries?: number | null) {
  if (projectMaxRetries === null || projectMaxRetries === undefined) return 1;
  return Math.min(HARD_MAX_CREATIVE_CRITIC_RETRIES, Math.max(0, Math.floor(projectMaxRetries)));
}

export function shouldAttemptCreativeRetry(input: RetryDecisionInput) {
  const maxRetries = effectiveRetryLimit(input.projectMaxRetries);
  if (input.mode === 'OFF' || input.mode === 'SUGGEST') return { allowed: false, reason: 'mode_disabled' as const, maxRetries };
  if (input.providerHealthy === false) return { allowed: false, reason: 'provider_unhealthy' as const, maxRetries };
  if (input.hasCredits === false) return { allowed: false, reason: 'insufficient_credits' as const, maxRetries };
  if (input.moderationRejected) return { allowed: false, reason: 'moderation_rejected' as const, maxRetries };
  if (input.retryAttempt >= maxRetries) return { allowed: false, reason: 'retry_limit_reached' as const, maxRetries };
  if (clampScore(input.score ?? 0) >= input.threshold) return { allowed: false, reason: 'threshold_reached' as const, maxRetries };
  if (input.mode === 'AUTO_ONCE' && input.retryAttempt > 0) return { allowed: false, reason: 'auto_once_used' as const, maxRetries };
  return { allowed: true, reason: 'retry_allowed' as const, maxRetries };
}

export function creativeCriticRunIdempotencyKey(input: {
  assetId: string;
  retryAttempt: number;
  criticVersion: string;
}) {
  return createHash('sha256')
    .update(['creative-critic-run', input.assetId, input.retryAttempt, input.criticVersion].join(':'))
    .digest('hex');
}

export function creativeRetryIdempotencyKey(input: {
  projectId: string;
  sceneId: string;
  criticRunId: string;
  model: string;
  attempt: number;
}) {
  return createHash('sha256')
    .update(['creative-retry', input.projectId, input.sceneId, input.criticRunId, input.model, input.attempt].join(':'))
    .digest('hex');
}

export function creditPolicyForCreativeRetry(input: {
  generationAlreadyCharged?: boolean;
  criticReviewOnly?: boolean;
  providerSubmitted?: boolean;
  providerFailed?: boolean;
  lowCriticScore?: boolean;
}) {
  if (input.criticReviewOnly) return { deduct: false, refund: false, reason: 'critic_review_is_free' as const };
  if (input.generationAlreadyCharged) return { deduct: false, refund: false, reason: 'idempotent_replay' as const };
  if (input.providerFailed && input.providerSubmitted) return { deduct: true, refund: true, reason: 'provider_submission_failed' as const };
  if (input.lowCriticScore) return { deduct: true, refund: false, reason: 'low_score_no_refund' as const };
  return { deduct: true, refund: false, reason: 'generation_charge' as const };
}

export function creativeModerationSeparation(input: {
  creativeStatus?: string | null;
  moderationStatus?: string | null;
}) {
  return {
    creativelyApproved: input.creativeStatus === 'APPROVED',
    creativelyRejected: input.creativeStatus === 'REJECTED',
    moderationApproved: input.moderationStatus === 'APPROVED',
    moderationRejected: input.moderationStatus === 'REJECTED',
    storybookEligible: input.moderationStatus !== 'REJECTED' && input.creativeStatus !== 'REJECTED',
  };
}

export function sanitizeR16AssetPayload(asset: Record<string, any>) {
  return {
    id: asset.id,
    sceneId: asset.sceneId,
    assetType: asset.assetType,
    assetUrl: asset.assetUrl,
    thumbnailUrl: asset.thumbnailUrl,
    status: asset.status,
    imageStatus: asset.imageStatus,
    isLatest: asset.isLatest,
    isFavorite: asset.isFavorite,
    selectedForStorybookAt: asset.selectedForStorybookAt,
    createdAt: asset.createdAt,
    criticRuns: Array.isArray(asset.criticRuns)
      ? asset.criticRuns.map((run: Record<string, any>) => ({
        id: run.id,
        assetId: run.assetId,
        sceneId: run.sceneId,
        status: run.status,
        completedAt: run.completedAt,
      }))
      : [],
  };
}
