import { describe, expect, it, vi } from 'vitest';
import { feedQuarantineWhere, projectIdentity, quarantinedProjectIds } from '../quarantineFeed';

/**
 * The NULL trap is the whole risk of this file.
 *
 * A naive `sourceProjectId: { notIn: quarantinedIds }` drops every row whose source is
 * NULL, because `NULL NOT IN (...)` evaluates to unknown. That would quarantine the
 * entire historical library and every future publication with an unknown source — while
 * looking exactly like a working filter. These tests fail if anyone "simplifies" it.
 */

describe('feedQuarantineWhere — the NULL branch is load-bearing', () => {
  it('an empty quarantine set adds no clause at all', () => {
    expect(feedQuarantineWhere([])).toEqual({});
  });

  it('keeps NULL-sourced videos by branching on null explicitly', () => {
    const where = feedQuarantineWhere(['proj_bad']) as { OR: unknown[] };
    expect(where.OR).toEqual([
      { sourceProjectId: null },
      { sourceProjectId: { notIn: ['proj_bad'] } },
    ]);
  });

  it('is NOT a bare notIn — that shape would hide the whole historical library', () => {
    const where = feedQuarantineWhere(['proj_bad']) as Record<string, unknown>;
    expect(where.sourceProjectId).toBeUndefined();
    expect(JSON.stringify(where)).not.toBe(JSON.stringify({ sourceProjectId: { notIn: ['proj_bad'] } }));
  });
});

function stubPrisma(runs: Array<{ projectId: string; characterIdentityScore: number | null }>, sources: Array<string | null>) {
  return {
    creativeCriticRun: { findMany: vi.fn(async () => runs) },
    video: { findMany: vi.fn(async () => sources.map((sourceProjectId) => ({ sourceProjectId }))) },
  } as never;
}

describe('projectIdentity — one computation for both surfaces', () => {
  it('takes the minimum across scored assets', async () => {
    const prisma = stubPrisma(
      [
        { projectId: 'p1', characterIdentityScore: 90 },
        { projectId: 'p1', characterIdentityScore: 10 },
        { projectId: 'p1', characterIdentityScore: 70 },
      ],
      ['p1'],
    );
    expect(await projectIdentity(prisma, 'p1')).toEqual({
      projectId: 'p1',
      minIdentity: 10,
      scored: 3,
      belowFloor: true,
    });
  });

  it('an unscored film is not below floor — unknown is fail-open', async () => {
    const prisma = stubPrisma([], ['p1']);
    expect(await projectIdentity(prisma, 'p1')).toEqual({
      projectId: 'p1',
      minIdentity: null,
      scored: 0,
      belowFloor: false,
    });
  });

  it('exactly at the floor is not below it', async () => {
    const prisma = stubPrisma([{ projectId: 'p1', characterIdentityScore: 85 }], ['p1']);
    expect((await projectIdentity(prisma, 'p1')).belowFloor).toBe(false);
  });
});

describe('quarantinedProjectIds — only sourced, only below floor', () => {
  it('includes a sourced project whose minimum is below floor', async () => {
    const prisma = stubPrisma(
      [
        { projectId: 'bad', characterIdentityScore: 0 },
        { projectId: 'good', characterIdentityScore: 92 },
      ],
      ['bad', 'good'],
    );
    expect(await quarantinedProjectIds(prisma)).toEqual(['bad']);
  });

  it('ignores projects with no sourced video (the historical library)', async () => {
    const prisma = stubPrisma([{ projectId: 'bad', characterIdentityScore: 0 }], [null, null]);
    expect(await quarantinedProjectIds(prisma)).toEqual([]);
  });

  it('ignores a sourced project that has no scores yet', async () => {
    const prisma = stubPrisma([], ['unsure']);
    expect(await quarantinedProjectIds(prisma)).toEqual([]);
  });
});
