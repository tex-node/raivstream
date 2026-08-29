import { describe, expect, it } from 'vitest';
import { resolveFeatureCreditRate, STORY_SPEECH_GENERATION_FEATURE_KEY, STORY_AUDIO_GENERATION_FEATURE_KEY } from '../credits';

function prismaMockWithRate(rate: { creditsPerUnit: number; isActive: boolean } | null) {
  return {
    featureCreditRate: {
      findUnique: async () => rate,
    },
  } as any;
}

describe('generic feature credit rate gate (Phase 9B.2 speech/audio generation boundary)', () => {
  // Required test P — any paid audio-generation path fails closed when rate missing/zero.
  it('fails closed for story:speech_generation when no rate row exists (rate never configured this phase)', async () => {
    const result = await resolveFeatureCreditRate(prismaMockWithRate(null), STORY_SPEECH_GENERATION_FEATURE_KEY);
    expect(result.configured).toBe(false);
    expect(result.cost).toBe(0);
    expect(result.errorCode).toBe('RATE_MISSING');
  });

  it('fails closed for story:audio_generation when no rate row exists', async () => {
    const result = await resolveFeatureCreditRate(prismaMockWithRate(null), STORY_AUDIO_GENERATION_FEATURE_KEY);
    expect(result.configured).toBe(false);
    expect(result.cost).toBe(0);
    expect(result.errorCode).toBe('RATE_MISSING');
  });

  it('fails closed when a rate row exists but is zero', async () => {
    const result = await resolveFeatureCreditRate(prismaMockWithRate({ creditsPerUnit: 0, isActive: true }), STORY_SPEECH_GENERATION_FEATURE_KEY);
    expect(result.configured).toBe(false);
    expect(result.errorCode).toBe('RATE_INVALID');
  });

  it('fails closed when a rate row exists but is inactive', async () => {
    const result = await resolveFeatureCreditRate(prismaMockWithRate({ creditsPerUnit: 50, isActive: false }), STORY_AUDIO_GENERATION_FEATURE_KEY);
    expect(result.configured).toBe(false);
    expect(result.errorCode).toBe('RATE_INVALID');
  });

  it('resolves normally once a valid active rate is configured (staging/local test config only)', async () => {
    const result = await resolveFeatureCreditRate(prismaMockWithRate({ creditsPerUnit: 40, isActive: true }), STORY_SPEECH_GENERATION_FEATURE_KEY);
    expect(result.configured).toBe(true);
    expect(result.cost).toBe(40);
    expect(result.errorCode).toBeNull();
  });

  it('is read-only — zero mutation calls on any resolution path, including the fail-closed paths', async () => {
    const mutations: string[] = [];
    const prisma = {
      featureCreditRate: {
        findUnique: async () => null,
        upsert: async () => { mutations.push('upsert'); },
        create: async () => { mutations.push('create'); },
        update: async () => { mutations.push('update'); },
      },
    } as any;
    await resolveFeatureCreditRate(prisma, STORY_SPEECH_GENERATION_FEATURE_KEY);
    expect(mutations).toHaveLength(0);
  });
});
