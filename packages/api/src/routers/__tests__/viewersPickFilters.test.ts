import { describe, expect, it, vi } from 'vitest';
import { feedRouter } from '../feed';

/**
 * viewersPick has a fallback path, and the fallback is where the clauses were lost.
 *
 * Production evidence 2026-11-02: `viewersPick` returned 14 items including a video with
 * `starRatingCount: 0` and the published below-floor video. The primary where was
 * correct, but with no video qualifying the resolver fell through to a fallback that
 * rebuilt its where from scratch and silently dropped the star filter, `withdrawnAt`
 * **and** the quarantine clause.
 *
 * These tests assert on the EMITTED where object, not on results: a result assertion
 * passes whenever the data happens to exclude a row, and would not have caught this.
 */

interface StubOptions {
  primaryRows?: unknown[];
  fallbackRows?: unknown[];
  quarantinedProjectId?: string;
}

const BELOW_FLOOR = 10;

function makePrisma(options: StubOptions = {}) {
  const { primaryRows = [{ id: 'v1' }], fallbackRows = [], quarantinedProjectId } = options;
  const findMany = vi.fn(async (args: { where?: Record<string, unknown> }) => {
    const where = args?.where ?? {};
    if ('sourceProjectId' in where) {
      return quarantinedProjectId ? [{ sourceProjectId: quarantinedProjectId }] : [{ sourceProjectId: null }];
    }
    if ('starRatingCount' in where) return primaryRows;
    return fallbackRows;
  });

  const creativeCriticRun = {
    findMany: vi.fn(async () =>
      quarantinedProjectId ? [{ projectId: quarantinedProjectId, characterIdentityScore: BELOW_FLOOR }] : [],
    ),
  };

  return { prisma: { video: { findMany }, creativeCriticRun } as never, findMany };
}

const caller = (prisma: unknown) => feedRouter.createCaller({ prisma } as never);

/** Queries carrying `status` are viewersPick's own; the quarantine lookup does not. */
function feedCalls(findMany: { mock: { calls: Array<[unknown]> } }): Array<Record<string, unknown>> {
  return findMany.mock.calls
    .map((call) => (call[0] as { where?: Record<string, unknown> })?.where)
    .filter((where): where is Record<string, unknown> => Boolean(where && 'status' in where));
}

describe('viewersPick primary path', () => {
  it('emits the star filter and the withdrawal filter', async () => {
    const { prisma, findMany } = makePrisma();
    await caller(prisma).viewersPick({ limit: 10 });
    const where = feedCalls(findMany)[0]!;
    expect(where.starRatingCount).toEqual({ gte: 3 });
    expect(where.withdrawnAt).toBeNull();
  });

  it('emits the quarantine branch when a sourced project is below floor', async () => {
    const { prisma, findMany } = makePrisma({ quarantinedProjectId: 'proj_bad' });
    await caller(prisma).viewersPick({ limit: 10 });
    const where = feedCalls(findMany)[0]!;
    expect(where.OR).toEqual([
      { sourceProjectId: null },
      { sourceProjectId: { notIn: ['proj_bad'] } },
    ]);
  });

  it('adds no OR clause when nothing is quarantined', async () => {
    const { prisma, findMany } = makePrisma();
    await caller(prisma).viewersPick({ limit: 10 });
    expect(feedCalls(findMany)[0]!.OR).toBeUndefined();
  });
});

describe('viewersPick fallback path — the bug that quarantine exposed', () => {
  it('relaxes ONLY the star filter, keeping withdrawal, moderation and quarantine', async () => {
    const { prisma, findMany } = makePrisma({
      primaryRows: [],
      fallbackRows: [{ id: 'f1' }],
      quarantinedProjectId: 'proj_bad',
    });
    const result = (await caller(prisma).viewersPick({ limit: 10 })) as { videos: Array<{ id: string }> };
    expect(result.videos).toEqual([{ id: 'f1' }]);

    const calls = feedCalls(findMany);
    expect(calls).toHaveLength(2);
    const where = calls[1]!;

    expect(where.starRatingCount).toBeUndefined();
    expect(where.withdrawnAt).toBeNull();
    expect(where.moderationStatus).toEqual({ not: 'REJECTED' });
    expect(where.OR).toEqual([
      { sourceProjectId: null },
      { sourceProjectId: { notIn: ['proj_bad'] } },
    ]);
  });

  it('the fallback is not a bare trending query — that shape produced the 0-star rows', async () => {
    const { prisma, findMany } = makePrisma({ primaryRows: [], fallbackRows: [{ id: 'f1' }] });
    await caller(prisma).viewersPick({ limit: 10 });
    const where = feedCalls(findMany)[1]!;
    expect(Object.keys(where).sort()).toEqual(['isPublic', 'moderationStatus', 'status', 'withdrawnAt'].sort());
  });
});