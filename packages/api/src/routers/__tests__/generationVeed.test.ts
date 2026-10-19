import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as creditsModule from '../../lib/credits';
import * as generatorsModule from '../../lib/generators';
import { __setVeedGateDepsForTests } from '../../lib/veedFabricSafety';
import { appRouter } from '../../index';

/**
 * D-076 — router wiring for VEED Fabric.
 *
 * The gate itself is unit-tested in lib/__tests__/veedFabricSafety.test.ts.
 * This file asserts what unit tests cannot: that `generation.create` actually
 * CALLS the gate, and that a rejection happens BEFORE money moves.
 *
 * The gate's I/O is substituted (image moderator, ffprobe) via the test seam, so
 * the real gate logic runs — mocking `gateVeedFabricInputs` wholesale would let
 * cases 2/3 pass even if the router stopped calling it.
 */

const IMAGE = 'https://cdn.test/presenter.png';
const AUDIO = 'https://cdn.test/voice.mp3';

function makePrisma() {
  const job = {
    id: 'job-1',
    userId: 'u1',
    model: 'VEED_FABRIC',
    prompt: 'Talking presenter video',
    status: 'QUEUED',
    outputUrl: null,
    creditsUsed: 0,
  };

  return {
    job,
    generationJob: {
      create: vi.fn(async () => ({ ...job })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...job, ...data })),
      delete: vi.fn(async () => ({ ...job })),
    },
    creditBalance: {
      findUnique: vi.fn(async () => ({ balance: 1000 })),
    },
  };
}

function makeCtx(prisma: ReturnType<typeof makePrisma>) {
  return {
    prisma: prisma as never,
    userId: 'u1',
    user: {
      id: 'u1',
      email: 'a@b.test',
      username: 'tester',
      displayName: 'Tester',
      role: 'CREATOR' as const,
    },
  } as never;
}

function setupSpies() {
  return {
    deduct: vi.spyOn(creditsModule, 'deductCredits').mockResolvedValue(200),
    submit: vi.spyOn(generatorsModule, 'submitGenerationJob').mockResolvedValue({
      providerJobId: 'provider-1',
      outputUrl: undefined,
    } as never),
  };
}

let spies: ReturnType<typeof setupSpies>;

beforeEach(() => {
  vi.clearAllMocks();
  spies = setupSpies();
  __setVeedGateDepsForTests({
    moderateImage: vi.fn(async () => ({ verdict: 'allowed' as const })),
    probe: vi.fn(async () => 12),
    log: vi.fn(),
    transcribe: vi.fn(async () => 'hello world'),
    moderateText: vi.fn(async () => ({ allowed: true })),
  });
});

afterEach(() => {
  __setVeedGateDepsForTests(null);
  vi.restoreAllMocks();
});

describe('generation.create — VEED Fabric wiring', () => {
  it('1. happy path: gate passes, then charges, then submits (in that order)', async () => {
    const prisma = makePrisma();
    const caller = appRouter.createCaller(makeCtx(prisma));

    await caller.generation.create({
      model: 'VEED_FABRIC',
      seedImageUrl: IMAGE,
      audioUrl: AUDIO,
      consent: true,
      resolution: '720p',
    });

    expect(spies.deduct).toHaveBeenCalledTimes(1);
    expect(spies.submit).toHaveBeenCalledTimes(1);
    // Order is the contract: charging before the gate would be the bug.
    expect(spies.deduct.mock.invocationCallOrder[0]!).toBeLessThan(spies.submit.mock.invocationCallOrder[0]!);
  });

  it('2. missing consent rejects before any charge or provider call', async () => {
    const prisma = makePrisma();
    const caller = appRouter.createCaller(makeCtx(prisma));

    await expect(
      caller.generation.create({
        model: 'VEED_FABRIC',
        seedImageUrl: IMAGE,
        audioUrl: AUDIO,
        consent: false,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    expect(spies.deduct).not.toHaveBeenCalled();
    expect(spies.submit).not.toHaveBeenCalled();
    // No orphan job row for a rejected request either.
    expect(prisma.generationJob.create).not.toHaveBeenCalled();
  });

  it('3. a flagged presenter image throws CONTENT_REJECTED with no charge and no provider call', async () => {
    __setVeedGateDepsForTests({
      moderateImage: vi.fn(async () => ({ verdict: 'flagged' as const, reason: 'violence', categories: ['violence'] })),
      probe: vi.fn(async () => 12),
      log: vi.fn(),
      transcribe: vi.fn(async () => 'hello world'),
      moderateText: vi.fn(async () => ({ allowed: true })),
    });

    const prisma = makePrisma();
    const caller = appRouter.createCaller(makeCtx(prisma));

    await expect(
      caller.generation.create({
        model: 'VEED_FABRIC',
        seedImageUrl: IMAGE,
        audioUrl: AUDIO,
        consent: true,
      }),
    ).rejects.toThrow(/CONTENT_REJECTED/);

    expect(spies.deduct).not.toHaveBeenCalled();
    expect(spies.submit).not.toHaveBeenCalled();
    expect(prisma.generationJob.create).not.toHaveBeenCalled();
  });

  it('4. FLUX2 is untouched by the Fabric gate (regression)', async () => {
    const prisma = makePrisma();
    const caller = appRouter.createCaller(makeCtx(prisma));

    await caller.generation.create({ model: 'FLUX2', prompt: 'a red fox' });

    expect(spies.deduct).toHaveBeenCalledTimes(1);
    expect(spies.submit).toHaveBeenCalledTimes(1);
  });
});

describe('generation.create — per-second pricing path (production config)', () => {
  it('gates VEED_FABRIC before the per-second branch that returns early', async () => {
    // Production runs with VIDEO_PER_SECOND_PRICING on. That branch returns via
    // createWithReserveSettle BEFORE the main gate, so an unflagged gate here
    // means moderation never runs - which is exactly what shipped in #84..#89.
    vi.stubEnv('VIDEO_PER_SECOND_PRICING', '1');
    __setVeedGateDepsForTests({
      moderateImage: vi.fn(async () => ({ verdict: 'flagged' as const, reason: 'violence', categories: ['violence'] })),
      probe: vi.fn(async () => 12),
      log: vi.fn(),
      transcribe: vi.fn(async () => 'hello world'),
      moderateText: vi.fn(async () => ({ allowed: true })),
    });

    const prisma = makePrisma();
    const caller = appRouter.createCaller(makeCtx(prisma));

    await expect(
      caller.generation.create({
        model: 'VEED_FABRIC',
        seedImageUrl: IMAGE,
        audioUrl: AUDIO,
        consent: true,
      }),
    ).rejects.toThrow(/CONTENT_REJECTED/);

    expect(spies.deduct).not.toHaveBeenCalled();
    expect(spies.submit).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
