/**
 * Phase 6B acceptance tests — TTS/ElevenLabs narration bridge.
 *
 * Covers:
 *   A  buildNarrationPlan  — pure mapping function
 *   B  seedNarrationCues   — idempotency, track selection, disabled flag
 *   C  generateNarrationForCue — credit gate (fail-closed), disabled paths,
 *                                success flow, failure + refund
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TRPCError } from '@trpc/server';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  synthesizeSpeech: vi.fn<() => Promise<Buffer>>(),
  isElevenLabsTtsEnabled: vi.fn<() => boolean>(() => true),
  elevenLabsDefaultVoiceId: vi.fn<() => string>(() => '21m00Tcm4TlvDq8ikWAM'),
  uploadBufferToR2: vi.fn<() => Promise<string | null>>(),
  moderatePrompt: vi.fn<() => Promise<{ allowed: boolean; reason?: string }>>(),
  resolveFeatureCreditRate: vi.fn<() => Promise<{ configured: boolean; cost: number; errorCode: string | null }>>(),
  deductCredits: vi.fn<() => Promise<number>>(),
  refundCredits: vi.fn<() => Promise<void>>(),
}));

vi.mock('../../generators/elevenLabsTts', () => ({
  synthesizeSpeech: mocks.synthesizeSpeech,
  isElevenLabsTtsEnabled: mocks.isElevenLabsTtsEnabled,
  elevenLabsDefaultVoiceId: mocks.elevenLabsDefaultVoiceId,
}));
vi.mock('../../r2', () => ({
  uploadBufferToR2: mocks.uploadBufferToR2,
}));
vi.mock('../../promptModeration', () => ({
  moderatePrompt: mocks.moderatePrompt,
}));
vi.mock('../../credits', () => ({
  resolveFeatureCreditRate: mocks.resolveFeatureCreditRate,
  deductCredits: mocks.deductCredits,
  refundCredits: mocks.refundCredits,
  STORY_SPEECH_GENERATION_FEATURE_KEY: 'story:speech_generation',
}));

import {
  buildNarrationPlan,
  seedNarrationCues,
  generateNarrationForCue,
} from '../audio/service';
import type { CreativeProductionPlanState } from '../production/plan';
import type { CreativeBibleState } from '../shared/types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const PLAN: CreativeProductionPlanState = {
  version: 1,
  structure: 'Hook → Product → Benefit → CTA',
  scenes: [
    {
      sceneId: 'SCENE_01',
      order: 1,
      title: 'The Hook',
      beat: 'Grab attention',
      description: 'Opens on a striking image.',
      characters: [],
      narration: 'Every detail is designed for you.',
      shots: [{ shotId: 'S1', title: 'Push-in', description: 'Push', durationSeconds: 5 }],
      estimatedDurationSeconds: 5,
    },
    {
      sceneId: 'SCENE_02',
      order: 2,
      title: 'Product Reveal',
      beat: 'Introduce the product',
      description: 'The product glides into focus.',
      characters: [],
      narration: 'Crafted for the ones who notice.',
      shots: [{ shotId: 'S2', title: 'Close-up', description: 'Close', durationSeconds: 6 }],
      estimatedDurationSeconds: 6,
    },
    {
      sceneId: 'SCENE_03',
      order: 3,
      title: 'The Benefit',
      beat: 'Show the value',
      description: 'The result revealed.',
      characters: [],
      narration: '',  // intentionally empty — should be skipped
      shots: [{ shotId: 'S3', title: 'Wide', description: 'Wide', durationSeconds: 5 }],
      estimatedDurationSeconds: 5,
    },
  ],
  totalRuntimeSeconds: 16,
  timeline: [
    { sceneId: 'SCENE_01', startSeconds: 0,  endSeconds: 5  },
    { sceneId: 'SCENE_02', startSeconds: 5,  endSeconds: 11 },
    { sceneId: 'SCENE_03', startSeconds: 11, endSeconds: 16 },
  ],
  notes: [],
};

const BIBLE: CreativeBibleState = {
  version: 1,
  audioLanguage: {
    style: 'intimate, natural',
    voiceStyle: 'warm authority',
    primaryLanguage: 'en',
  },
};

// ─── A — buildNarrationPlan ───────────────────────────────────────────────────

describe('buildNarrationPlan', () => {
  it('maps scenes with narration text to cues, skips empty narration', () => {
    const result = buildNarrationPlan(PLAN, BIBLE);
    expect(result.cues).toHaveLength(2);
    expect(result.cues[0]).toMatchObject({
      sceneId: 'SCENE_01',
      sceneIndex: 0,
      text: 'Every detail is designed for you.',
      startTimeSeconds: 0,
      durationSeconds: 5,
    });
    expect(result.cues[1]).toMatchObject({
      sceneId: 'SCENE_02',
      sceneIndex: 1,
      text: 'Crafted for the ones who notice.',
      startTimeSeconds: 5,
      durationSeconds: 6,
    });
  });

  it('resolves primaryLanguage and voiceStyle from bible', () => {
    const result = buildNarrationPlan(PLAN, BIBLE);
    expect(result.primaryLanguage).toBe('en');
    expect(result.voiceStyle).toBe('warm authority');
  });

  it('defaults primaryLanguage to "en" when bible has no audioLanguage', () => {
    const result = buildNarrationPlan(PLAN, null);
    expect(result.primaryLanguage).toBe('en');
    expect(result.voiceStyle).toBeUndefined();
  });

  it('produces performance direction from voiceStyle + style', () => {
    const result = buildNarrationPlan(PLAN, BIBLE);
    expect(result.cues[0]?.performanceDirection).toContain('warm authority');
    expect(result.cues[0]?.performanceDirection).toContain('intimate, natural');
  });

  it('falls back to "clear, measured delivery" when no audio direction', () => {
    const result = buildNarrationPlan(PLAN, { version: 1 });
    expect(result.cues[0]?.performanceDirection).toBe('clear, measured delivery');
  });

  it('returns empty cues array when no scene has narration', () => {
    const emptyPlan: CreativeProductionPlanState = { ...PLAN, scenes: PLAN.scenes.map((s) => ({ ...s, narration: '' })) };
    const result = buildNarrationPlan(emptyPlan, BIBLE);
    expect(result.cues).toHaveLength(0);
  });
});

// ─── B — seedNarrationCues ────────────────────────────────────────────────────

describe('seedNarrationCues', () => {
  const TRACK_ID = 'track-narr-1';
  const PLAN_ID  = 'plan-1';

  function makePrisma(existingCueMetadata: Array<{ metadata: unknown }> = []) {
    return {
      audioTrack: {
        findFirst: vi.fn().mockResolvedValue({ id: TRACK_ID }),
      },
      audioCue: {
        findMany: vi.fn().mockResolvedValue(existingCueMetadata),
        create: vi.fn().mockResolvedValue({ id: 'cue-new' }),
      },
    } as unknown as Parameters<typeof seedNarrationCues>[0];
  }

  beforeEach(() => {
    process.env.RAIVSTREAM_5_ENABLED       = 'true';
    process.env.RAIVSTREAM_5_AUDIO_ENABLED = 'true';
  });
  afterEach(() => {
    delete process.env.RAIVSTREAM_5_ENABLED;
    delete process.env.RAIVSTREAM_5_AUDIO_ENABLED;
  });

  it('creates cues for scenes with narration', async () => {
    const prisma = makePrisma();
    const result = await seedNarrationCues(prisma, { planId: PLAN_ID, plan: PLAN, bible: BIBLE });
    expect(result).toMatchObject({ cuesCreated: 2, cuesSkipped: 0 });
    expect((prisma as unknown as { audioCue: { create: ReturnType<typeof vi.fn> } }).audioCue.create).toHaveBeenCalledTimes(2);
  });

  it('idempotent: skips existing cues by sceneId metadata', async () => {
    const prisma = makePrisma([{ metadata: { sceneId: 'SCENE_01' } }]);
    const result = await seedNarrationCues(prisma, { planId: PLAN_ID, plan: PLAN, bible: BIBLE });
    expect(result).toMatchObject({ cuesCreated: 1, cuesSkipped: 1 });
  });

  it('skips all cues when both already exist', async () => {
    const prisma = makePrisma([
      { metadata: { sceneId: 'SCENE_01' } },
      { metadata: { sceneId: 'SCENE_02' } },
    ]);
    const result = await seedNarrationCues(prisma, { planId: PLAN_ID, plan: PLAN, bible: BIBLE });
    expect(result).toMatchObject({ cuesCreated: 0, cuesSkipped: 2 });
  });

  it('returns null when audio flag is off', async () => {
    delete process.env.RAIVSTREAM_5_AUDIO_ENABLED;
    const prisma = makePrisma();
    const result = await seedNarrationCues(prisma, { planId: PLAN_ID, plan: PLAN, bible: BIBLE });
    expect(result).toBeNull();
  });

  it('returns null when creative flag is off', async () => {
    delete process.env.RAIVSTREAM_5_ENABLED;
    const prisma = makePrisma();
    const result = await seedNarrationCues(prisma, { planId: PLAN_ID, plan: PLAN, bible: BIBLE });
    expect(result).toBeNull();
  });

  it('returns early with zero counts when NARRATION track not found', async () => {
    const prisma = {
      audioTrack: { findFirst: vi.fn().mockResolvedValue(null) },
      audioCue:   { findMany: vi.fn(), create: vi.fn() },
    } as unknown as Parameters<typeof seedNarrationCues>[0];
    const result = await seedNarrationCues(prisma, { planId: PLAN_ID, plan: PLAN, bible: BIBLE });
    expect(result).toMatchObject({ cuesCreated: 0, cuesSkipped: 0 });
    expect((prisma as unknown as { audioCue: { create: ReturnType<typeof vi.fn> } }).audioCue.create).not.toHaveBeenCalled();
  });

  it('stores sceneId and language in cue metadata', async () => {
    const prisma = makePrisma();
    await seedNarrationCues(prisma, { planId: PLAN_ID, plan: PLAN, bible: BIBLE });
    const createCall = (prisma as unknown as { audioCue: { create: ReturnType<typeof vi.fn> } }).audioCue.create.mock.calls[0];
    expect(createCall[0].data.metadata).toMatchObject({ sceneId: 'SCENE_01', language: 'en' });
  });
});

// ─── C — generateNarrationForCue ─────────────────────────────────────────────

describe('generateNarrationForCue', () => {
  const CUE_ID    = 'cue-abc';
  const USER_ID   = 'user-1';
  const CV_ID     = 'cv-1';
  const CP_ID     = 'cp-1';

  const BASE_INPUT = { cueId: CUE_ID, userId: USER_ID, creativeVersionId: CV_ID, creativeProjectId: CP_ID };

  function makePrisma(overrides: {
    cue?: Partial<{ text: string | null; voiceProfile: { voiceRef: string } | null }> | null;
  } = {}) {
    const cue = overrides.cue !== undefined
      ? overrides.cue === null
        ? null
        : { id: CUE_ID, text: 'Default narration.', voiceProfileId: null, voiceProfile: null, ...overrides.cue }
      : { id: CUE_ID, text: 'Default narration.', voiceProfileId: null, voiceProfile: null };

    return {
      audioCue: {
        findUnique: vi.fn().mockResolvedValue(cue),
        update: vi.fn().mockResolvedValue({ id: CUE_ID }),
      },
      audioAsset: {
        create: vi.fn().mockResolvedValue({ id: 'asset-1' }),
      },
      featureCreditRate: {
        findUnique: vi.fn(),
      },
      creditBalance: {
        updateMany: vi.fn(),
        findUnique: vi.fn(),
        upsert: vi.fn(),
      },
      creditTransaction: { create: vi.fn() },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({
        creditBalance: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), findUnique: vi.fn().mockResolvedValue({ balance: 90 }), upsert: vi.fn() },
        creditTransaction: { create: vi.fn() },
      })),
    } as unknown as Parameters<typeof generateNarrationForCue>[0];
  }

  beforeEach(() => {
    process.env.RAIVSTREAM_5_ENABLED       = 'true';
    process.env.RAIVSTREAM_5_AUDIO_ENABLED = 'true';

    mocks.isElevenLabsTtsEnabled.mockReturnValue(true);
    mocks.moderatePrompt.mockResolvedValue({ allowed: true });
    mocks.resolveFeatureCreditRate.mockResolvedValue({ configured: true, cost: 10, errorCode: null });
    mocks.deductCredits.mockResolvedValue(10);
    mocks.refundCredits.mockResolvedValue(undefined);
    mocks.synthesizeSpeech.mockResolvedValue(Buffer.from('mp3bytes'));
    mocks.uploadBufferToR2.mockResolvedValue('https://cdn.example.com/audio.mp3');
    mocks.elevenLabsDefaultVoiceId.mockReturnValue('21m00Tcm4TlvDq8ikWAM');
  });

  afterEach(() => {
    delete process.env.RAIVSTREAM_5_ENABLED;
    delete process.env.RAIVSTREAM_5_AUDIO_ENABLED;
    vi.clearAllMocks();
  });

  it('returns null when audio flag is off', async () => {
    delete process.env.RAIVSTREAM_5_AUDIO_ENABLED;
    const prisma = makePrisma();
    const result = await generateNarrationForCue(prisma, BASE_INPUT);
    expect(result).toBeNull();
    expect(mocks.synthesizeSpeech).not.toHaveBeenCalled();
  });

  it('returns null when creative flag is off', async () => {
    delete process.env.RAIVSTREAM_5_ENABLED;
    const prisma = makePrisma();
    const result = await generateNarrationForCue(prisma, BASE_INPUT);
    expect(result).toBeNull();
  });

  it('throws NOT_FOUND when cue does not exist', async () => {
    const prisma = makePrisma({ cue: null });
    await expect(generateNarrationForCue(prisma, BASE_INPUT)).rejects.toThrow(TRPCError);
    await expect(generateNarrationForCue(prisma, BASE_INPUT)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws BAD_REQUEST when cue has no text', async () => {
    const prisma = makePrisma({ cue: { text: '' } });
    await expect(generateNarrationForCue(prisma, BASE_INPUT)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('throws PRECONDITION_FAILED when credit rate is not configured — fail-closed', async () => {
    mocks.resolveFeatureCreditRate.mockResolvedValue({ configured: false, cost: 0, errorCode: 'RATE_MISSING' });
    const prisma = makePrisma();
    await expect(generateNarrationForCue(prisma, BASE_INPUT)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    expect(mocks.synthesizeSpeech).not.toHaveBeenCalled();
    expect(mocks.deductCredits).not.toHaveBeenCalled();
  });

  it('throws PRECONDITION_FAILED when ElevenLabs is disabled', async () => {
    mocks.isElevenLabsTtsEnabled.mockReturnValue(false);
    const prisma = makePrisma();
    await expect(generateNarrationForCue(prisma, BASE_INPUT)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    expect(mocks.synthesizeSpeech).not.toHaveBeenCalled();
  });

  it('throws BAD_REQUEST when moderation blocks the text', async () => {
    mocks.moderatePrompt.mockResolvedValue({ allowed: false, reason: 'Blocked content.' });
    const prisma = makePrisma();
    await expect(generateNarrationForCue(prisma, BASE_INPUT)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(mocks.deductCredits).not.toHaveBeenCalled();
    expect(mocks.synthesizeSpeech).not.toHaveBeenCalled();
  });

  it('succeeds: deducts credits, calls TTS, uploads, creates asset, materialises cue', async () => {
    const prisma = makePrisma();
    const result = await generateNarrationForCue(prisma, BASE_INPUT);

    expect(result).toMatchObject({ assetId: 'asset-1', creditsUsed: 10 });
    expect(result?.storageKey).toContain(CUE_ID);

    expect(mocks.deductCredits).toHaveBeenCalledWith(
      prisma, USER_ID, 'story:speech_generation', CUE_ID, expect.any(String),
    );
    expect(mocks.synthesizeSpeech).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Default narration.' }),
      undefined,
    );
    expect(mocks.uploadBufferToR2).toHaveBeenCalledWith(expect.any(Buffer), expect.stringContaining(CUE_ID), 'audio/mpeg');

    const assetCreate = (prisma as unknown as { audioAsset: { create: ReturnType<typeof vi.fn> } }).audioAsset.create;
    expect(assetCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: USER_ID,
        creativeVersionId: CV_ID,
        sourceKind: 'SYNTHETIC_TTS',
      }),
    }));

    const cueUpdate = (prisma as unknown as { audioCue: { update: ReturnType<typeof vi.fn> } }).audioCue.update;
    expect(cueUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ audioAssetId: 'asset-1' }),
    }));
  });

  it('uses VoiceProfile.voiceRef when present', async () => {
    const prisma = makePrisma({ cue: { voiceProfile: { voiceRef: 'custom-voice-id' } } });
    await generateNarrationForCue(prisma, BASE_INPUT);
    expect(mocks.synthesizeSpeech).toHaveBeenCalledWith(
      expect.objectContaining({ voiceId: 'custom-voice-id' }),
      undefined,
    );
  });

  it('falls back to default voice when no VoiceProfile', async () => {
    const prisma = makePrisma({ cue: { voiceProfile: null } });
    await generateNarrationForCue(prisma, BASE_INPUT);
    expect(mocks.synthesizeSpeech).toHaveBeenCalledWith(
      expect.objectContaining({ voiceId: '21m00Tcm4TlvDq8ikWAM' }),
      undefined,
    );
  });

  it('refunds credits when TTS synthesis throws', async () => {
    mocks.synthesizeSpeech.mockRejectedValue(new Error('ElevenLabs 500'));
    const prisma = makePrisma();
    await expect(generateNarrationForCue(prisma, BASE_INPUT)).rejects.toThrow('ElevenLabs 500');
    expect(mocks.refundCredits).toHaveBeenCalledWith(
      prisma, USER_ID, 10, 'story:speech_generation', CUE_ID, expect.any(String),
    );
  });

  it('refunds credits when R2 upload returns null', async () => {
    mocks.uploadBufferToR2.mockResolvedValue(null);
    const prisma = makePrisma();
    await expect(generateNarrationForCue(prisma, BASE_INPUT)).rejects.toThrow(/R2 storage/);
    expect(mocks.refundCredits).toHaveBeenCalled();
  });

  it('does not create AudioAsset on failure', async () => {
    mocks.synthesizeSpeech.mockRejectedValue(new Error('provider error'));
    const prisma = makePrisma();
    await expect(generateNarrationForCue(prisma, BASE_INPUT)).rejects.toThrow();
    const assetCreate = (prisma as unknown as { audioAsset: { create: ReturnType<typeof vi.fn> } }).audioAsset.create;
    expect(assetCreate).not.toHaveBeenCalled();
  });
});
