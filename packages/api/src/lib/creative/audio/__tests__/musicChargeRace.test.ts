/**
 * Phase 1 regression — music charge identity.
 *
 * Two concurrent `generateMusicForVersion` calls for the SAME version must yield
 * exactly ONE net charge and ZERO refunds. Before the fix the music key was the
 * creativeVersionId, so the loser's charge deduped to a no-op but the loser still
 * refunded → net 0. Now the cue is created first and the charge is keyed per-cue,
 * so the loser (P2002 on cue create) never charges and never refunds.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../featureFlags', () => ({ isCreativeAudioEnabled: () => true }));
vi.mock('../../../promptModeration', () => ({ moderatePrompt: vi.fn(async () => ({ allowed: true })) }));
vi.mock('../../../r2', () => ({ uploadBufferToR2: vi.fn(async () => 'https://cdn.test/music.mp3') }));
vi.mock('../../../generators/lyriaMusic', () => ({
  isLyriaMusicEnabled: () => true,
  lyriaModelId: () => 'lyria-test',
  generateMusic: vi.fn(async () => ({ audio: Buffer.from('mp3'), mimeType: 'audio/mpeg' })),
}));

const { deductSpy, refundSpy } = vi.hoisted(() => ({
  deductSpy: vi.fn(async () => 100),
  refundSpy: vi.fn(async () => undefined),
}));
vi.mock('../../../credits', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../credits')>();
  return {
    ...actual,
    deductCredits: deductSpy,
    refundCredits: refundSpy,
    resolveFeatureCreditRate: vi.fn(async () => ({ configured: true, errorCode: null })),
  };
});

import { generateMusicForVersion } from '../service';
import { creditKeys } from '../../../credits/idempotencyKeys';

function makePrisma() {
  let createCount = 0;
  return {
    creativeApproval: { findUnique: vi.fn(async () => ({ status: 'APPROVED' })) },
    creativeVersion: { findUnique: vi.fn(async () => ({ snapshot: { plan: { totalRuntimeSeconds: 30 } } })) },
    creativeProject: { findUnique: vi.fn(async () => ({ bible: null })) },
    audioPerformancePlan: { findFirst: vi.fn(async () => ({ id: 'plan1' })) },
    audioTrack: { findFirst: vi.fn(async () => ({ id: 'track1' })) },
    audioCue: {
      findFirst: vi.fn(async () => null), // both requests pass the pre-charge guard
      create: vi.fn(async () => {
        createCount += 1;
        if (createCount === 1) return { id: 'cue1' };
        const err = Object.assign(new Error('unique'), { code: 'P2002' });
        throw err;
      }),
      update: vi.fn(async () => ({ id: 'cue1' })),
      delete: vi.fn(async () => ({ id: 'cue1' })),
    },
    audioAsset: { create: vi.fn(async () => ({ id: 'asset1' })), findUnique: vi.fn(async () => null) },
    __createCount: () => createCount,
  };
}

const input = { userId: 'u1', creativeVersionId: 'v1', creativeProjectId: 'p1' } as never;

beforeEach(() => vi.clearAllMocks());

describe('generateMusicForVersion — concurrent same-version race', () => {
  it('one charge, zero refunds: the P2002 loser neither charges nor refunds', async () => {
    const prisma = makePrisma();
    const results = await Promise.allSettled([
      generateMusicForVersion(prisma as never, input),
      generateMusicForVersion(prisma as never, input),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const conflicted = results.filter((r) => r.status === 'rejected' && (r.reason as { code?: string })?.code === 'CONFLICT');

    expect(fulfilled).toHaveLength(1);
    expect(conflicted).toHaveLength(1);
    expect(deductSpy).toHaveBeenCalledTimes(1); // exactly one charge
    expect(refundSpy).not.toHaveBeenCalled();   // the loser never charged → no refund
  });

  it('keys the charge by the CUE, not the version', async () => {
    const prisma = makePrisma();
    await generateMusicForVersion(prisma as never, input);
    expect(deductSpy).toHaveBeenCalledWith(
      expect.anything(), 'u1', expect.anything(), 'v1', expect.any(String),
      creditKeys.music.charge('story:audio_generation', 'cue1'),
    );
  });
});
