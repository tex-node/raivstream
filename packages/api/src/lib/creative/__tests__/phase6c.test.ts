/**
 * Phase 6C acceptance tests — Google Lyria music generation bridge.
 *
 * Covers:
 *   A  buildMusicBrief  — pure mapping function
 *   B  generateMusicForVersion — approval gate, Lyria gate, credit gate,
 *                                 idempotency, success flow, failure + refund
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TRPCError } from '@trpc/server';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  generateMusic: vi.fn<() => Promise<{ audio: Buffer; mimeType: string }>>(),
  isLyriaMusicEnabled: vi.fn<() => boolean>(() => true),
  lyriaModelId: vi.fn<() => string>(() => 'lyria-3-clip-preview'),
  uploadBufferToR2: vi.fn<() => Promise<string | null>>(),
  resolveFeatureCreditRate: vi.fn<() => Promise<{ configured: boolean; cost: number; errorCode: string | null }>>(),
  deductCredits: vi.fn<() => Promise<number>>(),
  refundCredits: vi.fn<() => Promise<void>>(),
}));

vi.mock('../../generators/lyriaMusic', () => ({
  generateMusic: mocks.generateMusic,
  isLyriaMusicEnabled: mocks.isLyriaMusicEnabled,
  lyriaModelId: mocks.lyriaModelId,
}));
vi.mock('../../r2', () => ({
  uploadBufferToR2: mocks.uploadBufferToR2,
}));
vi.mock('../../credits', () => ({
  resolveFeatureCreditRate: mocks.resolveFeatureCreditRate,
  deductCredits: mocks.deductCredits,
  refundCredits: mocks.refundCredits,
  STORY_AUDIO_GENERATION_FEATURE_KEY: 'story:audio_generation',
  STORY_SPEECH_GENERATION_FEATURE_KEY: 'story:speech_generation',
}));

import {
  buildMusicBrief,
  generateMusicForVersion,
} from '../audio/service';
import type { CreativeProductionPlanState } from '../production/plan';
import type { CreativeBibleState } from '../shared/types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const PLAN: CreativeProductionPlanState = {
  version: 1,
  structure: 'Hook → Reveal → CTA',
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
  ],
  totalRuntimeSeconds: 30,
  timeline: [
    { sceneId: 'SCENE_01', startSeconds: 0,  endSeconds: 5  },
    { sceneId: 'SCENE_02', startSeconds: 5,  endSeconds: 11 },
  ],
  notes: [],
};

const BIBLE: CreativeBibleState = {
  version: 1,
  audioLanguage: {
    style: 'cinematic, atmospheric',
    mood: 'tense',
    tempo: 'slow',
    score: 'orchestral strings with subtle piano',
    sound: 'minimal ambient noise',
    primaryLanguage: 'en',
  },
};

// ─── A — buildMusicBrief ──────────────────────────────────────────────────────

describe('buildMusicBrief', () => {
  it('uses creator instructions verbatim when provided, overriding bible', () => {
    const brief = buildMusicBrief(BIBLE, PLAN, 'dark jazz, brushed drums, minor key');
    expect(brief.prompt).toContain('dark jazz, brushed drums, minor key');
    expect(brief.prompt).not.toContain('orchestral');
    expect(brief.prompt).toContain('Instrumental background score.');
    expect(brief.prompt).toContain('No vocals, no lyrics.');
  });

  it('creator instructions include duration hint', () => {
    const brief = buildMusicBrief(BIBLE, PLAN, 'upbeat funk');
    expect(brief.prompt).toContain('30 seconds');
    expect(brief.durationSeconds).toBe(30);
  });

  it('uses AudioLanguageSpec fields: score field when present', () => {
    const brief = buildMusicBrief(BIBLE, PLAN);
    expect(brief.prompt).toContain('orchestral strings with subtle piano');
    // score present means style should NOT appear
    expect(brief.prompt).not.toContain('cinematic, atmospheric');
  });

  it('falls back to style when score is absent', () => {
    const bibleNoScore: CreativeBibleState = {
      version: 1,
      audioLanguage: { style: 'lo-fi hip hop', mood: 'relaxed', primaryLanguage: 'en' },
    };
    const brief = buildMusicBrief(bibleNoScore, PLAN);
    expect(brief.prompt).toContain('lo-fi hip hop');
  });

  it('includes mood, tempo, and sound from AudioLanguageSpec', () => {
    const brief = buildMusicBrief(BIBLE, PLAN);
    expect(brief.prompt).toContain('tense mood');
    expect(brief.prompt).toContain('slow pacing');
    expect(brief.prompt).toContain('minimal ambient noise');
  });

  it('gracefully handles null bible — produces a minimal valid brief', () => {
    const brief = buildMusicBrief(null, PLAN);
    expect(brief.prompt).toContain('Instrumental background score.');
    expect(brief.prompt).toContain('No vocals, no lyrics.');
    expect(brief.negativePrompt).toBeTruthy();
    expect(brief.durationSeconds).toBe(30);
  });

  it('gracefully handles empty bible (no audioLanguage)', () => {
    const brief = buildMusicBrief({ version: 1 }, PLAN);
    expect(brief.prompt).toContain('Instrumental background score.');
    expect(brief.durationSeconds).toBe(30);
  });

  it('durationSeconds = Math.max(1, Math.round(totalRuntimeSeconds))', () => {
    const shortPlan = { ...PLAN, totalRuntimeSeconds: 0.4 };
    expect(buildMusicBrief(null, shortPlan).durationSeconds).toBe(1);

    const fractionalPlan = { ...PLAN, totalRuntimeSeconds: 29.7 };
    expect(buildMusicBrief(null, fractionalPlan).durationSeconds).toBe(30);
  });

  it('negativePrompt always excludes vocals and speech', () => {
    const brief = buildMusicBrief(BIBLE, PLAN);
    expect(brief.negativePrompt).toContain('vocals');
    expect(brief.negativePrompt).toContain('speech');
  });

  it('returns a MusicBrief with all required fields', () => {
    const brief = buildMusicBrief(BIBLE, PLAN);
    expect(brief).toHaveProperty('prompt');
    expect(brief).toHaveProperty('negativePrompt');
    expect(brief).toHaveProperty('durationSeconds');
  });
});

// ─── B — generateMusicForVersion ────────────────────────────────────────────

describe('generateMusicForVersion', () => {
  const VERSION_ID = 'cv-1';
  const PROJECT_ID = 'cp-1';
  const USER_ID    = 'user-1';
  const PLAN_ID    = 'plan-1';
  const TRACK_ID   = 'track-music-1';
  const CUE_ID     = 'cue-music-1';
  const ASSET_ID   = 'asset-music-1';

  const BASE_INPUT = {
    creativeVersionId: VERSION_ID,
    creativeProjectId: PROJECT_ID,
    userId: USER_ID,
  };

  function makePrisma(overrides: {
    approvalStatus?: string | null;
    audioPlan?: { id: string } | null;
    musicTrack?: { id: string } | null;
    existingCue?: { id: string; audioAssetId: string | null } | null;
    existingAsset?: { id: string; storageKey: string } | null;
    versionSnapshot?: object | null;
    projectBible?: object | null;
  } = {}) {
    const {
      approvalStatus = 'APPROVED',
      audioPlan = { id: PLAN_ID },
      musicTrack = { id: TRACK_ID },
      existingCue = null,
      existingAsset = null,
      versionSnapshot = { plan: PLAN },
      projectBible = BIBLE,
    } = overrides;

    return {
      creativeApproval: {
        findUnique: vi.fn().mockResolvedValue(approvalStatus ? { status: approvalStatus } : null),
      },
      audioPerformancePlan: {
        findFirst: vi.fn().mockResolvedValue(audioPlan),
        create: vi.fn(),
      },
      audioTrack: {
        findFirst: vi.fn().mockResolvedValue(musicTrack),
      },
      audioCue: {
        findFirst: vi.fn().mockResolvedValue(existingCue),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn().mockResolvedValue({ id: CUE_ID }),
        update: vi.fn().mockResolvedValue({ id: CUE_ID }),
      },
      audioAsset: {
        create: vi.fn().mockResolvedValue({ id: ASSET_ID }),
        findUnique: vi.fn().mockResolvedValue(existingAsset),
      },
      creativeVersion: {
        findUnique: vi.fn().mockResolvedValue({ snapshot: versionSnapshot }),
      },
      creativeProject: {
        findUnique: vi.fn().mockResolvedValue({ bible: projectBible }),
      },
      featureCreditRate: { findUnique: vi.fn() },
      creditBalance: { updateMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() },
      creditTransaction: { create: vi.fn() },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({
        creditBalance: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), findUnique: vi.fn().mockResolvedValue({ balance: 900 }), upsert: vi.fn() },
        creditTransaction: { create: vi.fn() },
      })),
    } as unknown as Parameters<typeof generateMusicForVersion>[0];
  }

  beforeEach(() => {
    process.env.RAIVSTREAM_5_ENABLED       = 'true';
    process.env.RAIVSTREAM_5_AUDIO_ENABLED = 'true';

    mocks.isLyriaMusicEnabled.mockReturnValue(true);
    mocks.lyriaModelId.mockReturnValue('lyria-3-clip-preview');
    mocks.resolveFeatureCreditRate.mockResolvedValue({ configured: true, cost: 100, errorCode: null });
    mocks.deductCredits.mockResolvedValue(100);
    mocks.refundCredits.mockResolvedValue(undefined);
    mocks.generateMusic.mockResolvedValue({ audio: Buffer.from('musicbytes'), mimeType: 'audio/mpeg' });
    mocks.uploadBufferToR2.mockResolvedValue('https://cdn.example.com/music.mp3');
  });

  afterEach(() => {
    delete process.env.RAIVSTREAM_5_ENABLED;
    delete process.env.RAIVSTREAM_5_AUDIO_ENABLED;
    vi.clearAllMocks();
  });

  // ── Gate: audio flag ─────────────────────────────────────────────────────

  it('returns null when audio flag is off', async () => {
    delete process.env.RAIVSTREAM_5_AUDIO_ENABLED;
    const prisma = makePrisma();
    const result = await generateMusicForVersion(prisma, BASE_INPUT);
    expect(result).toBeNull();
    expect(mocks.generateMusic).not.toHaveBeenCalled();
  });

  it('returns null when creative flag is off', async () => {
    delete process.env.RAIVSTREAM_5_ENABLED;
    const prisma = makePrisma();
    const result = await generateMusicForVersion(prisma, BASE_INPUT);
    expect(result).toBeNull();
  });

  // ── Gate: Lyria enabled ─────────────────────────────────────────────────

  it('throws PRECONDITION_FAILED when Lyria is disabled', async () => {
    mocks.isLyriaMusicEnabled.mockReturnValue(false);
    const prisma = makePrisma();
    await expect(generateMusicForVersion(prisma, BASE_INPUT)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    expect(mocks.generateMusic).not.toHaveBeenCalled();
  });

  // ── Gate: approval ───────────────────────────────────────────────────────

  it('throws PRECONDITION_FAILED when version has no approval record', async () => {
    const prisma = makePrisma({ approvalStatus: null });
    await expect(generateMusicForVersion(prisma, BASE_INPUT)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    expect(mocks.generateMusic).not.toHaveBeenCalled();
    expect(mocks.deductCredits).not.toHaveBeenCalled();
  });

  it('throws PRECONDITION_FAILED when version is PENDING (not yet approved)', async () => {
    const prisma = makePrisma({ approvalStatus: 'PENDING' });
    await expect(generateMusicForVersion(prisma, BASE_INPUT)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    expect(mocks.deductCredits).not.toHaveBeenCalled();
  });

  // ── Gate: audio plan ────────────────────────────────────────────────────

  it('throws PRECONDITION_FAILED when no AudioPerformancePlan found', async () => {
    const prisma = makePrisma({ audioPlan: null });
    await expect(generateMusicForVersion(prisma, BASE_INPUT)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    expect(mocks.generateMusic).not.toHaveBeenCalled();
  });

  it('throws PRECONDITION_FAILED when no MUSIC track on the plan', async () => {
    const prisma = makePrisma({ musicTrack: null });
    await expect(generateMusicForVersion(prisma, BASE_INPUT)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    expect(mocks.generateMusic).not.toHaveBeenCalled();
  });

  // ── Idempotency ──────────────────────────────────────────────────────────

  it('returns existing asset without charge when MUSIC track already materialised', async () => {
    const existingCue = { id: CUE_ID, audioAssetId: ASSET_ID };
    const existingAsset = { id: ASSET_ID, storageKey: `creative/${PROJECT_ID}/music/${CUE_ID}.mp3` };
    const prisma = makePrisma({ existingCue, existingAsset });
    const result = await generateMusicForVersion(prisma, BASE_INPUT);

    expect(result).toMatchObject({ assetId: ASSET_ID, creditsUsed: 0, reused: true });
    expect(mocks.deductCredits).not.toHaveBeenCalled();
    expect(mocks.generateMusic).not.toHaveBeenCalled();
  });

  // ── Gate: credit rate ────────────────────────────────────────────────────

  it('throws PRECONDITION_FAILED when story:audio_generation rate is not configured — fail-closed', async () => {
    mocks.resolveFeatureCreditRate.mockResolvedValue({ configured: false, cost: 0, errorCode: 'RATE_MISSING' });
    const prisma = makePrisma();
    await expect(generateMusicForVersion(prisma, BASE_INPUT)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    expect(mocks.generateMusic).not.toHaveBeenCalled();
    expect(mocks.deductCredits).not.toHaveBeenCalled();
  });

  // ── Success flow ─────────────────────────────────────────────────────────

  it('succeeds: deducts credits, calls Lyria, uploads, creates asset, materialises cue', async () => {
    const prisma = makePrisma();
    const result = await generateMusicForVersion(prisma, BASE_INPUT);

    expect(result).toMatchObject({ assetId: ASSET_ID, creditsUsed: 100, reused: false });
    expect(result?.storageKey).toContain('music');

    expect(mocks.deductCredits).toHaveBeenCalledWith(
      prisma, USER_ID, 'story:audio_generation', VERSION_ID, expect.any(String),
    );
    expect(mocks.generateMusic).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: expect.stringContaining('Instrumental') }),
      {},
    );
    expect(mocks.uploadBufferToR2).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.stringContaining('music'),
      'audio/mpeg',
    );

    const assetCreate = (prisma as unknown as { audioAsset: { create: ReturnType<typeof vi.fn> } }).audioAsset.create;
    expect(assetCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: USER_ID,
        creativeVersionId: VERSION_ID,
        sourceKind: 'SYNTHETIC_MUSIC',
        providerJobId: 'lyria:lyria-3-clip-preview',
      }),
    }));

    const cueUpdate = (prisma as unknown as { audioCue: { update: ReturnType<typeof vi.fn> } }).audioCue.update;
    expect(cueUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ audioAssetId: ASSET_ID }),
    }));
  });

  it('passes creatorInstructions through to brief when provided', async () => {
    const prisma = makePrisma();
    await generateMusicForVersion(prisma, { ...BASE_INPUT, creatorInstructions: 'slow jazz, muted trumpet' });
    expect(mocks.generateMusic).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: expect.stringContaining('slow jazz, muted trumpet') }),
      {},
    );
  });

  // ── Failure + refund ─────────────────────────────────────────────────────

  it('refunds credits and rethrows when Lyria generation throws', async () => {
    mocks.generateMusic.mockRejectedValue(new Error('Lyria 503'));
    const prisma = makePrisma();
    await expect(generateMusicForVersion(prisma, BASE_INPUT)).rejects.toThrow('Lyria 503');
    expect(mocks.refundCredits).toHaveBeenCalledWith(
      prisma, USER_ID, 100, 'story:audio_generation', VERSION_ID, expect.any(String),
    );
  });

  it('refunds credits when R2 upload returns null', async () => {
    mocks.uploadBufferToR2.mockResolvedValue(null);
    const prisma = makePrisma();
    await expect(generateMusicForVersion(prisma, BASE_INPUT)).rejects.toThrow(/R2 storage/);
    expect(mocks.refundCredits).toHaveBeenCalled();
  });

  it('does not create AudioAsset on any failure — no asset on Lyria error', async () => {
    mocks.generateMusic.mockRejectedValue(new Error('provider error'));
    const prisma = makePrisma();
    await expect(generateMusicForVersion(prisma, BASE_INPUT)).rejects.toThrow();
    const assetCreate = (prisma as unknown as { audioAsset: { create: ReturnType<typeof vi.fn> } }).audioAsset.create;
    expect(assetCreate).not.toHaveBeenCalled();
  });

  it('does not create AudioAsset on any failure — no asset on upload error', async () => {
    mocks.uploadBufferToR2.mockResolvedValue(null);
    const prisma = makePrisma();
    await expect(generateMusicForVersion(prisma, BASE_INPUT)).rejects.toThrow();
    const assetCreate = (prisma as unknown as { audioAsset: { create: ReturnType<typeof vi.fn> } }).audioAsset.create;
    expect(assetCreate).not.toHaveBeenCalled();
  });

  // ── Structural safety ────────────────────────────────────────────────────

  it('cannot be called during scene production — function signature requires creativeVersionId', () => {
    // generateMusicForVersion requires creativeVersionId (only exists after full version lock)
    // and checks CREATIVE approval before touching the provider.
    // This test documents the structural guarantee: passing any non-approved version throws.
    const prisma = makePrisma({ approvalStatus: 'PENDING' });
    return expect(generateMusicForVersion(prisma, BASE_INPUT)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
  });
});
