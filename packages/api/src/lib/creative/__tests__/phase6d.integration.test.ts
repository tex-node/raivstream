/**
 * Phase 6D — PostgreSQL Concurrency Integration Test
 *
 * Proves that the partial unique index on audio_cues
 * ("trackId" WHERE metadata->>'kind' = 'MUSIC_TRACK') prevents duplicate cues
 * and duplicate charges under concurrent requests against a real PostgreSQL 17
 * database.
 *
 * Database:  disposable localhost:5433 cluster (trust auth, not the VPS)
 * Mocks:     generateMusic (Lyria), uploadBufferToR2 (R2)
 * Real:      deductCredits, refundCredits, resolveFeatureCreditRate, all DB ops
 *
 * Skips gracefully when the test database is not reachable (CI without the
 * disposable cluster spun up).
 */

import { vi, describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { PrismaClient } from '@raivstream/database';
import { generateMusicForVersion, type GenerateMusicInput } from '../audio/service';
import { STORY_AUDIO_GENERATION_FEATURE_KEY } from '../../credits';

// Prisma enum values for fixture creation
const AudioTrackType        = { MUSIC: 'MUSIC'           } as const;
const CreativeApprovalKind  = { CREATIVE: 'CREATIVE'     } as const;
const CreativeApprovalStatus = { APPROVED: 'APPROVED'   } as const;

// ── Provider mocks (never call real Lyria or real R2) ─────────────────────────
// vi.hoisted creates the mock instances ONCE before any factory runs; the factory
// then references them so the service and test always share the same vi.fn() objects.
// (If vi.fn() were inside the factory, multiple factory invocations would create
//  separate instances, breaking the mockResolvedValue setup in beforeAll.)

const mocks = vi.hoisted(() => ({
  generateMusic:    vi.fn<() => Promise<{ audio: Buffer; mimeType: string }>>(),
  uploadBufferToR2: vi.fn<() => Promise<string | null>>(),
}));

vi.mock('../../generators/lyriaMusic', () => ({
  generateMusic:       mocks.generateMusic,
  isLyriaMusicEnabled: vi.fn<() => boolean>(() => true),
  lyriaModelId:        vi.fn<() => string>(() => 'lyria-3-clip-preview'),
}));

vi.mock('../../r2', () => ({
  uploadBufferToR2: mocks.uploadBufferToR2,
}));

// ── Test database ─────────────────────────────────────────────────────────────

const TEST_DB_URL =
  'postgresql://postgres@localhost:5433/raivstream_phase6d_test';
const RACE_ITERATIONS = 20;
const CREDITS_PER_UNIT = 100;

let db: PrismaClient | null = null;

// ── Minimal production plan satisfying buildMusicBrief ────────────────────────
const MINIMAL_PLAN = {
  scenes: [],
  timeline: [],
  totalRuntimeSeconds: 30,
};

// ── Shared fixture IDs ────────────────────────────────────────────────────────
let userId: string;
let projectId: string;

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeAll(async () => {
  // Connect to disposable test cluster.
  const client = new PrismaClient({
    datasources: { db: { url: TEST_DB_URL } },
    log: [],
  });
  try {
    await client.$connect();
    await client.$queryRaw`SELECT 1`;
    db = client;
  } catch {
    console.warn(
      '[phase6d integration] Test database not reachable — all tests will be skipped.',
    );
    await client.$disconnect().catch(() => {});
    return;
  }

  // Enable feature flags required by generateMusicForVersion.
  process.env.RAIVSTREAM_5_ENABLED      = 'true';
  process.env.RAIVSTREAM_5_AUDIO_ENABLED = 'true';

  // Clean tables that the tests touch (order respects FK constraints).
  await db.$transaction([
    db.$executeRaw`TRUNCATE "audio_cues" CASCADE`,
    db.$executeRaw`TRUNCATE "audio_assets" CASCADE`,
    db.$executeRaw`TRUNCATE "audio_tracks" CASCADE`,
    db.$executeRaw`TRUNCATE "audio_performance_plans" CASCADE`,
    db.$executeRaw`TRUNCATE "creative_approvals" CASCADE`,
    db.$executeRaw`TRUNCATE "creative_versions" CASCADE`,
    db.$executeRaw`TRUNCATE "creative_projects" CASCADE`,
    db.$executeRaw`TRUNCATE "credit_transactions" CASCADE`,
    db.$executeRaw`TRUNCATE "credit_balances" CASCADE`,
    db.$executeRaw`TRUNCATE "feature_credit_rates" CASCADE`,
    db.$executeRaw`TRUNCATE "users" CASCADE`,
  ]);

  // Seed: user
  const user = await db.user.create({
    data: {
      email:       'phase6d-integration@test.local',
      username:    'phase6d-test',
      displayName: 'Phase 6D Test User',
      verified:    true,
    },
  });
  userId = user.id;

  // Seed: project (no bible relation needed — buildMusicBrief handles null)
  const project = await db.creativeProject.create({
    data: { userId, title: 'Phase 6D Integration Test Project' },
  });
  projectId = project.id;

  // Seed: credit rate for story:audio_generation
  await db.featureCreditRate.create({
    data: {
      featureKey:     STORY_AUDIO_GENERATION_FEATURE_KEY,
      creditsPerUnit: CREDITS_PER_UNIT,
      isActive:       true,
      description:    'Integration test rate',
    },
  });

  // Seed: credit balance large enough for 20 iterations × 2 deducts each
  await db.creditBalance.create({
    data: { userId, balance: RACE_ITERATIONS * CREDITS_PER_UNIT * 3 },
  });
});

afterAll(async () => {
  await db?.$disconnect();
  delete process.env.RAIVSTREAM_5_ENABLED;
  delete process.env.RAIVSTREAM_5_AUDIO_ENABLED;
});

beforeEach(() => {
  // Re-establish mock implementations before each test.
  // vitest's restoreMocks:true resets vi.fn() implementations before each test,
  // so beforeAll is too early — implementations must be set here.
  mocks.generateMusic.mockResolvedValue({
    audio:    Buffer.alloc(16, 0x42),
    mimeType: 'audio/mp3',
  });
  mocks.uploadBufferToR2.mockResolvedValue('https://cdn.test/phase6d-integration.mp3');
});

afterEach(() => {
  mocks.generateMusic.mockClear();
  mocks.uploadBufferToR2.mockClear();
});

// ── Helper to build per-iteration fixtures ────────────────────────────────────

async function buildVersionFixture(versionNumber: number) {
  if (!db) throw new Error('DB unavailable');

  const version = await db.creativeVersion.create({
    data: { projectId, versionNumber, snapshot: { plan: MINIMAL_PLAN } },
  });

  await db.creativeApproval.create({
    data: {
      projectId,
      versionId: version.id,
      kind:   CreativeApprovalKind.CREATIVE   as never,
      status: CreativeApprovalStatus.APPROVED as never,
    },
  });

  // audioPerformancePlan.create() fails at runtime in Prisma 5 when optional relations
  // (projectId, sequenceId) are absent — Prisma requires an explicit discriminant.
  // Use $executeRaw to bypass the validator.
  const planId = `pln-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await db.$executeRaw`
    INSERT INTO "audio_performance_plans"
      (id, "creativeVersionId", status, "currentVersionNumber", "createdAt", "updatedAt")
    VALUES
      (${planId}, ${version.id}, 'DRAFT'::"AudioPlanStatus", 0, NOW(), NOW())
  `;

  const track = await db.audioTrack.create({
    data: {
      planId,
      type:    AudioTrackType.MUSIC as never,
      name:    'Music',
      enabled: true,
      volume:  0.4,
      order:   2,
    },
  });

  return { version, planId, track };
}

function makeInput(versionId: string): GenerateMusicInput {
  return {
    creativeVersionId:  versionId,
    creativeProjectId:  projectId,
    userId,
    creatorInstructions: undefined,
    deps: { env: { LYRIA_MUSIC_ENABLED: 'true' } as NodeJS.ProcessEnv },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Phase 6D — PostgreSQL concurrency gate (real DB)', () => {

  describe('Race test — same track, concurrent requests', () => {
    it(
      `two concurrent requests produce exactly 1 cue, 1 Lyria call, 1 net charge — across ${RACE_ITERATIONS} iterations`,
      async () => {
        if (!db) return; // skip gracefully when test DB is not available
        let totalNetCharges = 0;
        let raceIterations = 0;   // how many iterations hit P2002 (true race path)
        let reuseIterations = 0;  // how many iterations ran sequentially (idempotency path)

        for (let i = 0; i < RACE_ITERATIONS; i++) {
          const { version, track } = await buildVersionFixture(i + 1);
          const input = makeInput(version.id);

          const [r1, r2] = await Promise.allSettled([
            generateMusicForVersion(db!, input),
            generateMusicForVersion(db!, input),
          ]);

          // ── DB invariant: exactly one materialised cue — NEVER two
          const cues = await db!.audioCue.findMany({
            where: { trackId: track.id },
            select: { id: true, audioAssetId: true },
          });
          expect(cues).toHaveLength(1);
          expect(cues[0]!.audioAssetId).not.toBeNull();

          // ── Lyria invariant: at most one call per iteration — NEVER two
          expect(mocks.generateMusic).toHaveBeenCalledTimes(1);

          // ── Outcome classification
          // Two valid outcomes in a single-process event-loop environment:
          //   Race path:       r1 wins index lock; r2 gets P2002 → CONFLICT
          //                    2 deducts, 1 refund, net 1 charge
          //   Sequential path: r1 materialises before r2 starts; r2 takes idempotency path
          //                    1 deduct, 0 refunds, net 1 charge
          // Both prove the invariant (no duplicate cues, no duplicate charges).
          const fulfilled = [r1, r2].filter((r) => r.status === 'fulfilled');
          const conflicted = [r1, r2].filter(
            (r) =>
              r.status === 'rejected' &&
              (r as PromiseRejectedResult).reason?.code === 'CONFLICT',
          );
          const generated = fulfilled.filter(
            (r) => (r as PromiseFulfilledResult<Awaited<ReturnType<typeof generateMusicForVersion>>>).value?.reused === false,
          );
          const reused = fulfilled.filter(
            (r) => (r as PromiseFulfilledResult<Awaited<ReturnType<typeof generateMusicForVersion>>>).value?.reused === true,
          );

          // Exactly 1 generation either way
          expect(generated).toHaveLength(1);
          // The second request must resolve as either CONFLICT or reuse
          expect(reused.length + conflicted.length).toBe(1);

          // ── Credit ledger for this version
          const txs = await db!.creditTransaction.findMany({
            where: { referenceId: version.id },
            select: { type: true, amount: true },
          });
          const deducts = txs.filter((t) => t.type === 'USAGE');
          const refunds  = txs.filter((t) => t.type === 'REFUND');

          // Net charges must equal exactly 1 regardless of path
          expect(deducts.length - refunds.length).toBe(1);

          totalNetCharges += deducts.length - refunds.length;
          if (conflicted.length > 0) raceIterations++;
          else reuseIterations++;

          mocks.generateMusic.mockClear();
        }

        // ── Aggregate: net exactly 1 charge per iteration across all 20 iterations
        expect(totalNetCharges).toBe(RACE_ITERATIONS);
        console.info(
          `[phase6d] race=${raceIterations}/${RACE_ITERATIONS} reuse=${reuseIterations}/${RACE_ITERATIONS}`,
        );

        // ── Final balance: started at RACE_ITERATIONS * 3 units; used exactly RACE_ITERATIONS
        const bal = await db!.creditBalance.findUnique({ where: { userId }, select: { balance: true } });
        const expected = RACE_ITERATIONS * CREDITS_PER_UNIT * 3 - RACE_ITERATIONS * CREDITS_PER_UNIT;
        expect(bal!.balance).toBe(expected);
      },
    );
  });

  describe('Control test — different tracks, concurrent requests', () => {
    it(
      'two concurrent requests for different tracks both succeed',
      async () => {
        if (!db) return;
        const BASE_VERSION = RACE_ITERATIONS + 100;
        const { version: vA, track: trackA } = await buildVersionFixture(BASE_VERSION + 1);
        const { version: vB, track: trackB } = await buildVersionFixture(BASE_VERSION + 2);

        const [r1, r2] = await Promise.allSettled([
          generateMusicForVersion(db!, makeInput(vA.id)),
          generateMusicForVersion(db!, makeInput(vB.id)),
        ]);

        expect(r1.status).toBe('fulfilled');
        expect(r2.status).toBe('fulfilled');

        // Two distinct cues, one per track
        const cuesA = await db!.audioCue.findMany({ where: { trackId: trackA.id } });
        const cuesB = await db!.audioCue.findMany({ where: { trackId: trackB.id } });
        expect(cuesA).toHaveLength(1);
        expect(cuesB).toHaveLength(1);
        expect(cuesA[0]!.audioAssetId).not.toBeNull();
        expect(cuesB[0]!.audioAssetId).not.toBeNull();

        // Two Lyria calls (one per track)
        expect(mocks.generateMusic).toHaveBeenCalledTimes(2);
      },
    );
  });

  describe('Orphan recovery test', () => {
    it(
      'unmaterialised cue blocks retry with CONFLICT before deduct; delete unlocks',
      async () => {
        if (!db) return;
        const BASE_VERSION = RACE_ITERATIONS + 200;
        const { version, track } = await buildVersionFixture(BASE_VERSION + 1);
        const input = makeInput(version.id);

        // Plant an unmaterialised (orphaned) cue directly — simulates a
        // previous attempt that failed after cue creation but before cleanup.
        const orphan = await db!.audioCue.create({
          data: {
            trackId:          track.id,
            startTimeSeconds: 0,
            durationSeconds:  30,
            order:            0,
            enabled:          true,
            volume:           0.4,
            metadata:         { kind: 'MUSIC_TRACK', creativeVersionId: version.id },
          },
          select: { id: true },
        });

        // ── Retry is blocked before any credit deduction
        await expect(generateMusicForVersion(db!, input)).rejects.toMatchObject({
          code: 'CONFLICT',
          message: expect.stringContaining(orphan.id),
        });

        const txsBefore = await db!.creditTransaction.findMany({ where: { referenceId: version.id } });
        expect(txsBefore).toHaveLength(0); // no charge attempted

        expect(mocks.generateMusic).not.toHaveBeenCalled();

        // ── Admin deletes the orphan — track is unlocked
        await db!.audioCue.delete({ where: { id: orphan.id } });

        // ── Next retry succeeds cleanly
        const result = await generateMusicForVersion(db!, input);
        expect(result).not.toBeNull();
        expect(result!.reused).toBe(false);
        expect(result!.creditsUsed).toBe(CREDITS_PER_UNIT);

        const cues = await db!.audioCue.findMany({ where: { trackId: track.id } });
        expect(cues).toHaveLength(1);
        expect(cues[0]!.audioAssetId).not.toBeNull();

        expect(mocks.generateMusic).toHaveBeenCalledTimes(1);
      },
    );
  });

  describe('Idempotency test — materialised cue is returned without charge', () => {
    it(
      'second call returns existing asset with creditsUsed=0 and reused=true',
      async () => {
        if (!db) return;
        const BASE_VERSION = RACE_ITERATIONS + 300;
        const { version } = await buildVersionFixture(BASE_VERSION + 1);
        const input = makeInput(version.id);

        // First call — succeeds
        const r1 = await generateMusicForVersion(db!, input);
        expect(r1).not.toBeNull();
        expect(r1!.reused).toBe(false);
        expect(r1!.creditsUsed).toBe(CREDITS_PER_UNIT);

        mocks.generateMusic.mockClear();

        // Second call — idempotent return, no new charge
        const r2 = await generateMusicForVersion(db!, input);
        expect(r2).not.toBeNull();
        expect(r2!.reused).toBe(true);
        expect(r2!.creditsUsed).toBe(0);
        expect(r2!.assetId).toBe(r1!.assetId);

        expect(mocks.generateMusic).not.toHaveBeenCalled();
      },
    );
  });

});
