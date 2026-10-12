/**
 * Phase 6D — Secure router wiring + concurrency-safe idempotency.
 *
 * Tests:
 *   Part 1: Service TOCTOU guard — P2002 on cue create → CONFLICT + refund
 *   Part 2: Service cue cleanup — unmaterialised cue deleted on Lyria failure
 *   Part 3: creativeAudioRouter — ownership checks, wiring, null-service guard
 *
 * No live provider calls. All external dependencies mocked.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { generateMusicForVersion } from '../audio/service';
import { creativeAudioRouter } from '../../../routers/creative/audio';

// ── Hoist all mocks ──────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  generateMusic:            vi.fn<() => Promise<{ audio: Buffer; mimeType: string }>>(),
  isLyriaMusicEnabled:      vi.fn<() => boolean>(() => true),
  lyriaModelId:             vi.fn<() => string>(() => 'lyria-3-clip-preview'),
  uploadBufferToR2:         vi.fn<() => Promise<string | null>>(),
  resolveFeatureCreditRate: vi.fn<() => Promise<{ configured: boolean; cost: number; errorCode: string | null }>>(),
  deductCredits:            vi.fn<() => Promise<number>>(),
  refundCredits:            vi.fn<() => Promise<void>>(),
}));

vi.mock('../../generators/lyriaMusic', () => ({
  generateMusic:       mocks.generateMusic,
  isLyriaMusicEnabled: mocks.isLyriaMusicEnabled,
  lyriaModelId:        mocks.lyriaModelId,
}));

vi.mock('../../r2', () => ({
  uploadBufferToR2: mocks.uploadBufferToR2,
}));

vi.mock('../../credits', () => ({
  resolveFeatureCreditRate:            mocks.resolveFeatureCreditRate,
  deductCredits:                       mocks.deductCredits,
  refundCredits:                       mocks.refundCredits,
  STORY_SPEECH_GENERATION_FEATURE_KEY: 'story:speech_generation',
  STORY_AUDIO_GENERATION_FEATURE_KEY:  'story:audio_generation',
}));

// ── Constants ────────────────────────────────────────────────────────────────

const USER_ID    = 'user-phase6d';
const PROJECT_ID = 'proj-phase6d';
const VERSION_ID = 'ver-phase6d';
const PLAN_ID    = 'plan-phase6d';
const TRACK_ID   = 'track-phase6d';
const CUE_ID     = 'cue-phase6d';
const ASSET_ID   = 'asset-phase6d';

const PLAN = {
  totalRuntimeSeconds: 45,
  scenes: [],
  timeline: [],
  sceneCount: 0,
  estimatedTotalDuration: 45,
};

const BIBLE = {
  audioLanguage: {
    score: 'Cinematic orchestral',
    mood: 'tense',
    tempo: 'moderate',
  },
};

const BASE_INPUT = {
  creativeVersionId: VERSION_ID,
  creativeProjectId: PROJECT_ID,
  userId: USER_ID,
};

// ── Prisma factory ────────────────────────────────────────────────────────────

function makePrisma(overrides: {
  approvalStatus?:  string | null;
  audioPlan?:       { id: string } | null;
  musicTrack?:      { id: string } | null;
  existingCue?:     { id: string; audioAssetId: string | null } | null;
  existingAsset?:   { id: string; storageKey: string } | null;
  cueCreateError?:  Error | null;
  projectFound?:    boolean;
  versionFound?:    boolean;
} = {}) {
  const {
    approvalStatus  = 'APPROVED',
    audioPlan       = { id: PLAN_ID },
    musicTrack      = { id: TRACK_ID },
    existingCue     = null,
    existingAsset   = null,
    cueCreateError  = null,
    projectFound    = true,
    versionFound    = true,
  } = overrides;

  const audioCueCreate = cueCreateError
    ? vi.fn().mockRejectedValue(cueCreateError)
    : vi.fn().mockResolvedValue({ id: CUE_ID });

  return {
    creativeApproval: {
      findUnique: vi.fn().mockResolvedValue(approvalStatus ? { status: approvalStatus } : null),
    },
    audioPerformancePlan: {
      findFirst: vi.fn().mockResolvedValue(audioPlan),
      create:    vi.fn(),
    },
    audioTrack: {
      findFirst: vi.fn().mockResolvedValue(musicTrack),
    },
    audioCue: {
      findFirst:  vi.fn().mockResolvedValue(existingCue),
      findUnique: vi.fn(),
      findMany:   vi.fn(),
      create:     audioCueCreate,
      update:     vi.fn().mockResolvedValue({ id: CUE_ID }),
      delete:     vi.fn().mockResolvedValue({ id: CUE_ID }),
    },
    audioAsset: {
      create:     vi.fn().mockResolvedValue({ id: ASSET_ID }),
      findUnique: vi.fn().mockResolvedValue(existingAsset),
    },
    creativeVersion: {
      findUnique: vi.fn().mockResolvedValue({ snapshot: { plan: PLAN } }),
      findFirst:  vi.fn().mockResolvedValue(versionFound ? { id: VERSION_ID } : null),
    },
    creativeProject: {
      findUnique: vi.fn().mockResolvedValue({ bible: BIBLE }),
      findFirst:  vi.fn().mockResolvedValue(projectFound ? { id: PROJECT_ID } : null),
    },
    featureCreditRate: { findUnique: vi.fn() },
    creditBalance:     { updateMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() },
    creditTransaction: { create: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        creditBalance:     {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUnique: vi.fn().mockResolvedValue({ balance: 900 }),
          upsert:     vi.fn(),
        },
        creditTransaction: { create: vi.fn() },
      }),
    ),
  } as unknown as Parameters<typeof generateMusicForVersion>[0];
}

// ── Shared setup ─────────────────────────────────────────────────────────────

function setupHappyPath() {
  process.env.RAIVSTREAM_5_ENABLED       = 'true';
  process.env.RAIVSTREAM_5_AUDIO_ENABLED = 'true';
  mocks.isLyriaMusicEnabled.mockReturnValue(true);
  mocks.lyriaModelId.mockReturnValue('lyria-3-clip-preview');
  mocks.resolveFeatureCreditRate.mockResolvedValue({ configured: true, cost: 100, errorCode: null });
  mocks.deductCredits.mockResolvedValue(100);
  mocks.refundCredits.mockResolvedValue(undefined);
  mocks.generateMusic.mockResolvedValue({ audio: Buffer.from('musicbytes'), mimeType: 'audio/mpeg' });
  mocks.uploadBufferToR2.mockResolvedValue('https://cdn.example.com/music.mp3');
}

function teardown() {
  delete process.env.RAIVSTREAM_5_ENABLED;
  delete process.env.RAIVSTREAM_5_AUDIO_ENABLED;
  vi.clearAllMocks();
}

// ─────────────────────────────────────────────────────────────────────────────
// Part 0: Orphaned unmaterialised cue detection (idempotency — before deduct)
// ─────────────────────────────────────────────────────────────────────────────

describe('Phase 6D — Orphaned unmaterialised cue detection', () => {
  beforeEach(setupHappyPath);
  afterEach(teardown);

  it('throws CONFLICT before deducting credits when an unmaterialised cue already exists', async () => {
    const orphanedCue = { id: 'orphan-cue-id', audioAssetId: null };
    const prisma = makePrisma({ existingCue: orphanedCue });

    await expect(generateMusicForVersion(prisma, BASE_INPUT)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringContaining('orphan-cue-id'),
    });
    expect(mocks.deductCredits).not.toHaveBeenCalled();
  });

  it('includes the cue ID in the CONFLICT message so an admin can delete it to recover', async () => {
    const orphanedCue = { id: 'stuck-cue-abc123', audioAssetId: null };
    const prisma = makePrisma({ existingCue: orphanedCue });

    const err = await generateMusicForVersion(prisma, BASE_INPUT).catch((e: unknown) => e);
    expect((err as { message?: string }).message).toContain('stuck-cue-abc123');
  });

  it('two sequential requests after a cleanup failure: second retry always throws CONFLICT before deduct', async () => {
    // Simulate: first request succeeds at cue creation but fails at Lyria AND delete also fails.
    // The orphaned cue now blocks all future requests at the idempotency check.
    mocks.generateMusic.mockRejectedValue(new Error('Lyria 503'));
    const prisma = makePrisma();
    type CueMock = { audioCue: { delete: ReturnType<typeof vi.fn> } };
    (prisma as unknown as CueMock).audioCue.delete.mockRejectedValue(new Error('delete failed'));

    // First request: creates cue, Lyria fails, delete fails → throws Lyria error, cue left orphaned
    await expect(generateMusicForVersion(prisma, BASE_INPUT)).rejects.toThrow('Lyria 503');
    const firstDeductCount = mocks.deductCredits.mock.calls.length; // 1 deduct, 1 refund

    // Now the orphaned cue is "in the DB" — simulate by updating the findFirst mock
    // to return the cue that was created (id=CUE_ID, audioAssetId=null).
    type FindMock = { audioCue: { findFirst: ReturnType<typeof vi.fn> } };
    (prisma as unknown as FindMock).audioCue.findFirst.mockResolvedValue({ id: CUE_ID, audioAssetId: null });

    vi.clearAllMocks();
    setupHappyPath();

    // Second request: hits idempotency check → CONFLICT before any deduct
    await expect(generateMusicForVersion(prisma, BASE_INPUT)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringContaining(CUE_ID),
    });
    expect(mocks.deductCredits).not.toHaveBeenCalled();
    // First request deducted and refunded once; second request deducted zero times
    expect(firstDeductCount).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Part 0b: Concurrent two-request race proof
// ─────────────────────────────────────────────────────────────────────────────

describe('Phase 6D — Concurrent two-request race', () => {
  beforeEach(setupHappyPath);
  afterEach(teardown);

  it('two concurrent requests: only one Lyria call, only one permanent charge (the P2002 loser never charges or refunds)', async () => {
    // Request A: succeeds at audioCue.create (gets the index lock), proceeds to Lyria.
    // Request B: P2002 from audioCue.create (index already held by A), refunds immediately.
    //
    // We simulate concurrency sequentially: both requests share the same prisma mock but
    // the second request uses cueCreateError: P2002.
    const prismaA = makePrisma();
    const p2002 = Object.assign(new Error('Unique constraint.'), { code: 'P2002' });
    const prismaB = makePrisma({ cueCreateError: p2002 });

    const [resultA, resultB] = await Promise.allSettled([
      generateMusicForVersion(prismaA, BASE_INPUT),
      generateMusicForVersion(prismaB, BASE_INPUT),
    ]);

    // Request A succeeds.
    expect(resultA.status).toBe('fulfilled');

    // Request B gets CONFLICT.
    expect(resultB.status).toBe('rejected');
    expect((resultB as PromiseRejectedResult).reason).toMatchObject({ code: 'CONFLICT' });

    // Lyria was called exactly once (only by request A).
    expect(mocks.generateMusic).toHaveBeenCalledTimes(1);

    // Net credit accounting: only A reaches the charge site (per-cue key); B fails the
    // cue create with P2002 BEFORE charging, so B neither charges nor refunds.
    expect(mocks.deductCredits).toHaveBeenCalledTimes(1);  // only A charges
    expect(mocks.refundCredits).not.toHaveBeenCalled();    // B never charged → no refund
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Part 1: Service TOCTOU guard
// ─────────────────────────────────────────────────────────────────────────────

describe('Phase 6D — Service TOCTOU guard', () => {
  beforeEach(setupHappyPath);
  afterEach(teardown);

  it('throws CONFLICT when cue create hits a P2002 unique constraint violation', async () => {
    const p2002 = Object.assign(new Error('Unique constraint failed.'), { code: 'P2002' });
    const prisma = makePrisma({ cueCreateError: p2002 });

    await expect(generateMusicForVersion(prisma, BASE_INPUT)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringContaining('already in progress'),
    });
  });

  it('throws CONFLICT on P2002 without charging or refunding', async () => {
    const p2002 = Object.assign(new Error('Unique constraint.'), { code: 'P2002' });
    const prisma = makePrisma({ cueCreateError: p2002 });

    await expect(generateMusicForVersion(prisma, BASE_INPUT)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    // The cue create failed before the charge site: nothing was charged, so nothing refunds.
    expect(mocks.deductCredits).not.toHaveBeenCalled();
    expect(mocks.refundCredits).not.toHaveBeenCalled();
  });

  it('rethrows non-P2002 cue create errors (no charge yet, no refund)', async () => {
    const dbErr = Object.assign(new Error('DB connection lost'), { code: 'P1001' });
    const prisma = makePrisma({ cueCreateError: dbErr });

    await expect(generateMusicForVersion(prisma, BASE_INPUT)).rejects.toThrow('DB connection lost');
    expect(mocks.deductCredits).not.toHaveBeenCalled();
    expect(mocks.refundCredits).not.toHaveBeenCalled();
  });

  it('rethrows P2003 as-is, NOT as CONFLICT', async () => {
    const fk = Object.assign(new Error('Foreign key constraint'), { code: 'P2003' });
    const prisma = makePrisma({ cueCreateError: fk });

    await expect(generateMusicForVersion(prisma, BASE_INPUT)).rejects.toThrow('Foreign key constraint');
  });

  it('cue is created with kind=MUSIC_TRACK metadata (partial index target)', async () => {
    const prisma = makePrisma();
    await generateMusicForVersion(prisma, BASE_INPUT);

    type CueMock = { audioCue: { create: ReturnType<typeof vi.fn> } };
    expect((prisma as unknown as CueMock).audioCue.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({ kind: 'MUSIC_TRACK' }),
        }),
      }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Part 2: Service cue cleanup on failure
// ─────────────────────────────────────────────────────────────────────────────

describe('Phase 6D — Service cue cleanup on provider failure', () => {
  beforeEach(setupHappyPath);
  afterEach(teardown);

  it('deletes the unmaterialised cue when Lyria throws (unlocks the track for retry)', async () => {
    mocks.generateMusic.mockRejectedValue(new Error('Lyria 503'));
    const prisma = makePrisma();

    await expect(generateMusicForVersion(prisma, BASE_INPUT)).rejects.toThrow('Lyria 503');
    type CueMock = { audioCue: { delete: ReturnType<typeof vi.fn> } };
    expect((prisma as unknown as CueMock).audioCue.delete).toHaveBeenCalledWith(
      { where: { id: CUE_ID } },
    );
  });

  it('deletes the unmaterialised cue when R2 upload returns null', async () => {
    mocks.generateMusic.mockResolvedValue({ audio: Buffer.from('x'), mimeType: 'audio/mpeg' });
    mocks.uploadBufferToR2.mockResolvedValue(null);
    const prisma = makePrisma();

    await expect(generateMusicForVersion(prisma, BASE_INPUT)).rejects.toThrow(/R2 storage/);
    type CueMock = { audioCue: { delete: ReturnType<typeof vi.fn> } };
    expect((prisma as unknown as CueMock).audioCue.delete).toHaveBeenCalledWith(
      { where: { id: CUE_ID } },
    );
  });

  it('rethrows the original Lyria error even when cue delete also fails', async () => {
    mocks.generateMusic.mockRejectedValue(new Error('provider down'));
    const prisma = makePrisma();
    type CueMock = { audioCue: { delete: ReturnType<typeof vi.fn> } };
    (prisma as unknown as CueMock).audioCue.delete.mockRejectedValue(new Error('delete failed'));

    await expect(generateMusicForVersion(prisma, BASE_INPUT)).rejects.toThrow('provider down');
  });

  it('refunds credits when Lyria throws', async () => {
    mocks.generateMusic.mockRejectedValue(new Error('Lyria 500'));
    const prisma = makePrisma();

    await expect(generateMusicForVersion(prisma, BASE_INPUT)).rejects.toThrow();
    expect(mocks.refundCredits).toHaveBeenCalledWith(
      prisma, USER_ID, 100, 'story:audio_generation', VERSION_ID, expect.any(String),
      `music:refund:story:audio_generation:${CUE_ID}`,
    );
  });

  it('does NOT delete the cue on success', async () => {
    const prisma = makePrisma();
    await generateMusicForVersion(prisma, BASE_INPUT);
    type CueMock = { audioCue: { delete: ReturnType<typeof vi.fn> } };
    expect((prisma as unknown as CueMock).audioCue.delete).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Part 3: creativeAudioRouter — ownership checks and wiring
// ─────────────────────────────────────────────────────────────────────────────

describe('Phase 6D — creativeAudioRouter.generateMusic', () => {
  const mockUser = {
    id: USER_ID,
    email: 'test@example.com',
    username: 'testuser',
    displayName: 'Test User',
    avatarUrl: null,
    role: 'USER',
    premiumTier: 'FREE',
    verified: true,
    followerCount: 0,
    followingCount: 0,
    totalViews: 0,
    totalLikes: 0,
  };

  beforeEach(setupHappyPath);
  afterEach(teardown);

  it('throws NOT_FOUND when the project does not belong to the caller', async () => {
    const prisma = makePrisma({ projectFound: false });
    const caller = creativeAudioRouter.createCaller(
      { user: mockUser, isR16: false, userId: USER_ID, prisma } as never,
    );
    await expect(
      caller.generateMusic({ creativeProjectId: PROJECT_ID, creativeVersionId: VERSION_ID }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('does not reach the service when project ownership fails', async () => {
    const prisma = makePrisma({ projectFound: false });
    const caller = creativeAudioRouter.createCaller(
      { user: mockUser, isR16: false, userId: USER_ID, prisma } as never,
    );
    await expect(
      caller.generateMusic({ creativeProjectId: PROJECT_ID, creativeVersionId: VERSION_ID }),
    ).rejects.toThrow();
    expect(mocks.generateMusic).not.toHaveBeenCalled();
    expect(mocks.deductCredits).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when the version does not belong to the project', async () => {
    const prisma = makePrisma({ versionFound: false });
    const caller = creativeAudioRouter.createCaller(
      { user: mockUser, isR16: false, userId: USER_ID, prisma } as never,
    );
    await expect(
      caller.generateMusic({ creativeProjectId: PROJECT_ID, creativeVersionId: VERSION_ID }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws FORBIDDEN when audio feature flag is disabled (service returns null)', async () => {
    delete process.env.RAIVSTREAM_5_AUDIO_ENABLED;
    const prisma = makePrisma();
    const caller = creativeAudioRouter.createCaller(
      { user: mockUser, isR16: false, userId: USER_ID, prisma } as never,
    );
    await expect(
      caller.generateMusic({ creativeProjectId: PROJECT_ID, creativeVersionId: VERSION_ID }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('succeeds end-to-end when all checks pass and Lyria returns audio', async () => {
    const prisma = makePrisma();
    const caller = creativeAudioRouter.createCaller(
      { user: mockUser, isR16: false, userId: USER_ID, prisma } as never,
    );
    const result = await caller.generateMusic({
      creativeProjectId: PROJECT_ID,
      creativeVersionId: VERSION_ID,
    });
    expect(result).toMatchObject({ assetId: ASSET_ID, creditsUsed: 100, reused: false });
  });

  it('surfaces CONFLICT when cue create hits P2002 (concurrent generation)', async () => {
    const p2002 = Object.assign(new Error('Unique constraint.'), { code: 'P2002' });
    const prisma = makePrisma({ cueCreateError: p2002 });
    const caller = creativeAudioRouter.createCaller(
      { user: mockUser, isR16: false, userId: USER_ID, prisma } as never,
    );
    await expect(
      caller.generateMusic({ creativeProjectId: PROJECT_ID, creativeVersionId: VERSION_ID }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('passes creatorInstructions through to Lyria prompt', async () => {
    const prisma = makePrisma();
    const caller = creativeAudioRouter.createCaller(
      { user: mockUser, isR16: false, userId: USER_ID, prisma } as never,
    );
    await caller.generateMusic({
      creativeProjectId: PROJECT_ID,
      creativeVersionId: VERSION_ID,
      creatorInstructions: 'slow jazz, muted trumpet',
    });
    expect(mocks.generateMusic).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: expect.stringContaining('slow jazz, muted trumpet') }),
      {},
    );
  });
});
