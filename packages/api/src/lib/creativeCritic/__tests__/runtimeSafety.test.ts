import { describe, expect, it } from 'vitest';
import {
  creativeCriticRunIdempotencyKey,
  creativeModerationSeparation,
  creativeRetryIdempotencyKey,
  creditPolicyForCreativeRetry,
  effectiveRetryLimit,
  sanitizeR16AssetPayload,
  shouldAttemptCreativeRetry,
} from '../runtimeSafety';

describe('creative critic runtime safety', () => {
  it('enforces retry modes and limits', () => {
    expect(shouldAttemptCreativeRetry({ mode: 'OFF', score: 40, threshold: 90, retryAttempt: 0 }).allowed).toBe(false);
    expect(shouldAttemptCreativeRetry({ mode: 'SUGGEST', score: 40, threshold: 90, retryAttempt: 0 }).allowed).toBe(false);
    expect(shouldAttemptCreativeRetry({ mode: 'AUTO_ONCE', score: 40, threshold: 90, retryAttempt: 0, hasCredits: true }).allowed).toBe(true);
    expect(shouldAttemptCreativeRetry({ mode: 'AUTO_ONCE', score: 40, threshold: 90, retryAttempt: 1, hasCredits: true }).reason).toBe('retry_limit_reached');
    expect(shouldAttemptCreativeRetry({ mode: 'AUTO_UNTIL_THRESHOLD', score: 92, threshold: 90, retryAttempt: 0, hasCredits: true }).reason).toBe('threshold_reached');
    expect(shouldAttemptCreativeRetry({ mode: 'AUTO_UNTIL_THRESHOLD', score: 40, threshold: 90, retryAttempt: 3, projectMaxRetries: 8, hasCredits: true }).reason).toBe('retry_limit_reached');
  });

  it('caps project retry maximum at hard maximum 3', () => {
    expect(effectiveRetryLimit(10)).toBe(3);
    expect(effectiveRetryLimit(2)).toBe(2);
    expect(effectiveRetryLimit(-1)).toBe(0);
  });

  it('constructs deterministic idempotency keys', () => {
    const key = creativeCriticRunIdempotencyKey({ assetId: 'asset1', retryAttempt: 0, criticVersion: 'v1' });
    expect(creativeCriticRunIdempotencyKey({ assetId: 'asset1', retryAttempt: 0, criticVersion: 'v1' })).toBe(key);
    expect(creativeCriticRunIdempotencyKey({ assetId: 'asset1', retryAttempt: 1, criticVersion: 'v1' })).not.toBe(key);

    const retryKey = creativeRetryIdempotencyKey({ projectId: 'p1', sceneId: 's1', criticRunId: 'r1', model: 'FLUX', attempt: 1 });
    expect(creativeRetryIdempotencyKey({ projectId: 'p1', sceneId: 's1', criticRunId: 'r1', model: 'FLUX', attempt: 1 })).toBe(retryKey);
    expect(creativeRetryIdempotencyKey({ projectId: 'p1', sceneId: 's1', criticRunId: 'r1', model: 'FLUX', attempt: 2 })).not.toBe(retryKey);
  });

  it('protects credits across critic review, retry, replay, failure, and low score', () => {
    expect(creditPolicyForCreativeRetry({ criticReviewOnly: true })).toEqual({ deduct: false, refund: false, reason: 'critic_review_is_free' });
    expect(creditPolicyForCreativeRetry({ generationAlreadyCharged: true })).toEqual({ deduct: false, refund: false, reason: 'idempotent_replay' });
    expect(creditPolicyForCreativeRetry({ providerSubmitted: true, providerFailed: true })).toEqual({ deduct: true, refund: true, reason: 'provider_submission_failed' });
    expect(creditPolicyForCreativeRetry({ lowCriticScore: true })).toEqual({ deduct: true, refund: false, reason: 'low_score_no_refund' });
    expect(creditPolicyForCreativeRetry({})).toEqual({ deduct: true, refund: false, reason: 'generation_charge' });
  });

  it('keeps creative status separate from moderation status', () => {
    expect(creativeModerationSeparation({ creativeStatus: 'REJECTED', moderationStatus: 'APPROVED' })).toMatchObject({
      creativelyRejected: true,
      moderationApproved: true,
      storybookEligible: false,
    });
    expect(creativeModerationSeparation({ creativeStatus: 'APPROVED', moderationStatus: 'REJECTED' })).toMatchObject({
      creativelyApproved: true,
      moderationRejected: true,
      storybookEligible: false,
    });
  });

  it('removes critic internals from R16 asset payloads', () => {
    const safe = sanitizeR16AssetPayload({
      id: 'asset1',
      sceneId: 'scene1',
      assetType: 'IMAGE',
      assetUrl: 'https://cdn/image.png',
      thumbnailUrl: 'https://cdn/thumb.png',
      status: 'READY',
      provider: 'RunPod',
      model: 'z-image-turbo',
      composedPrompt: 'hidden',
      negativePrompt: 'hidden',
      criticScore: 95,
      criticRuns: [{ id: 'run1', assetId: 'asset1', sceneId: 'scene1', status: 'COMPLETED', overallScore: 95, strengths: ['hidden'], improvementPlan: { style: ['hidden'] } }],
    });
    expect(safe).toEqual({
      id: 'asset1',
      sceneId: 'scene1',
      assetType: 'IMAGE',
      assetUrl: 'https://cdn/image.png',
      thumbnailUrl: 'https://cdn/thumb.png',
      status: 'READY',
      imageStatus: undefined,
      createdAt: undefined,
      criticRuns: [{ id: 'run1', assetId: 'asset1', sceneId: 'scene1', status: 'COMPLETED', completedAt: undefined }],
    });
    expect(JSON.stringify(safe)).not.toContain('RunPod');
    expect(JSON.stringify(safe)).not.toContain('hidden');
    expect(JSON.stringify(safe)).not.toContain('95');
  });
});
