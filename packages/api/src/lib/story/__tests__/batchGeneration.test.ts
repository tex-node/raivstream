/**
 * Phase 2 (R16-04) — batch scene generation controller.
 * Mock-level: createBatchRun / runBatch / recoverStuckBatchRuns against an
 * in-memory prisma stub (no DB).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createBatchRun,
  runBatch,
  recoverStuckBatchRuns,
  resetBatchRecoveryGuardForTests,
  BATCH_STALE_MS,
  BATCH_RECOVERY_GUARD_MS,
  type BatchDeps,
} from '../batchGeneration';

const deps = (generateScene: BatchDeps['generateScene'], perItemCost = 80): BatchDeps => ({ generateScene, perItemCost });

function makePrisma(opts: { scenes?: string[]; activeRun?: boolean } = {}) {
  const scenes = opts.scenes ?? ['s1', 's2', 's3'];
  const runs: any[] = [];
  const items: any[] = [];
  let seq = 0;

  const prisma: any = {
    storyProject: { findFirst: vi.fn(async () => ({ id: 'p1' })) },
    storySceneSeed: { findMany: vi.fn(async ({ where }: any) => where.id.in.filter((id: string) => scenes.includes(id)).map((id: string) => ({ id }))) },
    batchGenerationRun: {
      findFirst: vi.fn(async ({ where }: any) => {
        if (opts.activeRun) return { id: 'active' };
        return runs.find((r) => (where?.id ? r.id === where.id : true) && (where?.createdByUserId ? r.createdByUserId === where.createdByUserId : true)) ?? null;
      }),
      findUnique: vi.fn(async ({ where }: any) => runs.find((r) => r.id === where.id) ?? null),
      findMany: vi.fn(async ({ where }: any = {}) =>
        runs.filter((r) => {
          if (where?.status && r.status !== where.status) return false;
          if (where?.projectId && r.projectId !== where.projectId) return false;
          if (where?.OR) {
            return where.OR.some((c: any) =>
              c.lastHeartbeatAt === null ? r.lastHeartbeatAt === null : Boolean(r.lastHeartbeatAt && r.lastHeartbeatAt < c.lastHeartbeatAt.lt),
            );
          }
          return true;
        }),
      ),
      create: vi.fn(async ({ data }: any) => {
        const run = { status: data.status, concurrency: data.concurrency, costCapCredits: data.costCapCredits, costUsedCredits: 0, startedAt: null, ...data, id: `run-${++seq}` };
        runs.push(run);
        for (const item of data.items?.create ?? []) items.push({ id: `it-${++seq}`, runId: run.id, sceneId: item.sceneId, status: 'QUEUED', attemptCount: 0, creditsUsed: 0, assetId: null, errorMessage: null, createdAt: new Date(seq) });
        return run;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const run = runs.find((r) => r.id === where.id);
        for (const [k, v] of Object.entries(data)) {
          if (v && typeof v === 'object' && 'increment' in (v as object)) run[k] = (run[k] ?? 0) + (v as any).increment;
          else run[k] = v;
        }
        return run;
      }),
    },
    batchGenerationItem: {
      findMany: vi.fn(async ({ where, take }: any) =>
        items.filter((i) => i.runId === where.runId && (where.status ? i.status === where.status : true)).slice(0, take ?? items.length),
      ),
      count: vi.fn(async ({ where }: any) => items.filter((i) => i.runId === where.runId && i.status === where.status).length),
      updateMany: vi.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const i of items) {
          if (i.id === where.id && i.status === where.status) {
            for (const [k, v] of Object.entries(data)) i[k] = v && typeof v === 'object' && 'increment' in (v as object) ? i[k] + (v as any).increment : v;
            count++;
          }
        }
        return { count };
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const i = items.find((x) => x.id === where.id);
        Object.assign(i, data);
        return i;
      }),
    },
    __runs: runs,
    __items: items,
  };
  return prisma;
}

const seedRun = (prisma: any, over: Partial<any> = {}) => {
  const run = { id: 'run-1', projectId: 'p1', status: 'RUNNING', concurrency: 2, costCapCredits: 10000, costUsedCredits: 0, startedAt: null, lastHeartbeatAt: new Date(), createdByUserId: 'u1', ...over };
  prisma.__runs.push(run);
  return run;
};
const seedItem = (prisma: any, over: Partial<any> = {}) => {
  const item = { id: `it-${prisma.__items.length + 1}`, runId: 'run-1', sceneId: 's1', status: 'QUEUED', attemptCount: 0, creditsUsed: 0, assetId: null, errorMessage: null, createdAt: new Date(), ...over };
  prisma.__items.push(item);
  return item;
};

beforeEach(() => resetBatchRecoveryGuardForTests());

describe('createBatchRun', () => {
  it('rejects when the estimate exceeds the cap and creates nothing', async () => {
    const prisma = makePrisma();
    await expect(
      createBatchRun(prisma, { projectId: 'p1', userId: 'u1', sceneIds: ['s1', 's2', 's3'], costCapCredits: 100 }, deps(async () => ({ assetId: 'a' }), 80)),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(prisma.batchGenerationRun.create).not.toHaveBeenCalled();
  });

  it('rejects a second concurrent run for the same project', async () => {
    const prisma = makePrisma({ activeRun: true });
    await expect(
      createBatchRun(prisma, { projectId: 'p1', userId: 'u1', sceneIds: ['s1'] }, deps(async () => ({ assetId: 'a' }))),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('dedupes sceneIds so (runId, sceneId) uniqueness holds', async () => {
    const prisma = makePrisma();
    await createBatchRun(prisma, { projectId: 'p1', userId: 'u1', sceneIds: ['s1', 's1', 's2'] }, deps(async () => ({ assetId: 'a' })));
    const created = (prisma.batchGenerationRun.create as ReturnType<typeof vi.fn>).mock.calls[0]![0].data.items.create as Array<{ sceneId: string }>;
    expect(created.map((i) => i.sceneId)).toEqual(['s1', 's2']);
  });
});

describe('runBatch', () => {
  it('completes when all items succeed', async () => {
    const prisma = makePrisma();
    seedRun(prisma);
    seedItem(prisma, { sceneId: 's1' });
    seedItem(prisma, { sceneId: 's2' });
    await runBatch(prisma, 'run-1', deps(async () => ({ assetId: 'a' })));
    expect(prisma.__items.every((i: any) => i.status === 'READY')).toBe(true);
    expect(prisma.__runs[0].status).toBe('COMPLETED');
    expect(prisma.__runs[0].costUsedCredits).toBe(160);
  });

  it('a failing item does not stop the run', async () => {
    const prisma = makePrisma();
    seedRun(prisma);
    seedItem(prisma, { sceneId: 's1' });
    seedItem(prisma, { sceneId: 's2', id: 'it-fail' });
    let n = 0;
    await runBatch(prisma, 'run-1', deps(async () => {
      n += 1;
      if (n === 1) throw new Error('boom');
      return { assetId: 'a' };
    }));
    const statuses = prisma.__items.map((i: any) => i.status).sort();
    expect(statuses).toEqual(['FAILED', 'READY']);
    expect(prisma.__runs[0].status).toBe('COMPLETED');
  });

  it('never re-processes a READY item (no double-charge)', async () => {
    const prisma = makePrisma();
    seedRun(prisma);
    seedItem(prisma, { sceneId: 's1', status: 'READY', assetId: 'a' });
    const gen = vi.fn(async () => ({ assetId: 'a' }));
    await runBatch(prisma, 'run-1', deps(gen));
    expect(gen).not.toHaveBeenCalled();
    expect(prisma.__runs[0].status).toBe('COMPLETED');
  });

  it('delegates each QUEUED item to the injected generateScene with the run + sceneId', async () => {
    // The controller is dependency-injected: routing (FLUX2_EDIT + deterministic
    // seed) lives inside the injected `generateScene` — wired by `batchDepsFor`
    // (story.ts) to `generateSceneImageAsset`, the same function the single-scene
    // path uses. This guards the delegation contract: the run object (carrying
    // `projectId`) and the sceneId reach the dep unchanged.
    const prisma = makePrisma();
    seedRun(prisma);
    seedItem(prisma, { sceneId: 's1' });
    seedItem(prisma, { sceneId: 's2' });
    const gen = vi.fn(async (_run: any, _sceneId: string) => ({ assetId: 'a' }));
    await runBatch(prisma, 'run-1', deps(gen));
    expect(gen).toHaveBeenCalledTimes(2);
    expect(gen.mock.calls.map((c) => c[1]).sort()).toEqual(['s1', 's2']);
    expect(gen.mock.calls[0]![0]).toMatchObject({ projectId: 'p1' });
  });

  it('pauses mid-run when the next item would exceed the cap', async () => {
    const prisma = makePrisma();
    seedRun(prisma, { costCapCredits: 100 }); // 100/80 → only 1 item affordable
    seedItem(prisma, { sceneId: 's1' });
    seedItem(prisma, { sceneId: 's2' });
    await runBatch(prisma, 'run-1', deps(async () => ({ assetId: 'a' }), 80));
    expect(prisma.__runs[0].status).toBe('PAUSED');
    expect(prisma.__runs[0].pauseReason).toContain('100');
    expect(prisma.__items.find((i: any) => i.sceneId === 's2').status).toBe('QUEUED');
  });

  it('does nothing when the run is not RUNNING (cancelled)', async () => {
    const prisma = makePrisma();
    seedRun(prisma, { status: 'CANCELLED' });
    seedItem(prisma);
    const gen = vi.fn(async () => ({ assetId: 'a' }));
    await runBatch(prisma, 'run-1', deps(gen));
    expect(gen).not.toHaveBeenCalled();
  });
});

describe('recoverStuckBatchRuns', () => {
  it('re-kicks a stale RUNNING run and respects the guard', async () => {
    const prisma = makePrisma();
    const now = Date.now();
    const stale = seedRun(prisma, { lastHeartbeatAt: new Date(now - BATCH_STALE_MS - 1000) });

    const first = await recoverStuckBatchRuns(prisma, deps(async () => ({ assetId: 'a' })), { now });
    expect(first.recovered).toBe(1);

    const guarded = await recoverStuckBatchRuns(prisma, deps(async () => ({ assetId: 'a' })), { now: now + BATCH_RECOVERY_GUARD_MS - 1 });
    expect(guarded.skipped).toBe(true);
    expect(stale).toBeTruthy();
  });

  it('ignores a fresh RUNNING run', async () => {
    const prisma = makePrisma();
    seedRun(prisma, { lastHeartbeatAt: new Date() });
    const res = await recoverStuckBatchRuns(prisma, deps(async () => ({ assetId: 'a' })), { now: Date.now() });
    expect(res.recovered).toBe(0);
  });
});
