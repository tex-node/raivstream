import { describe, expect, it, vi } from 'vitest';
import {
  affectedSceneIdsForChapterEdit,
  pruneChapterVersions,
  snapshotChapterVersion,
  CHAPTER_VERSION_CAP,
} from '../chapterVersioning';

function prismaMock() {
  const versions: Array<{ id: string; chapterId: string; versionNumber: number }> = [];
  return {
    storyChapterVersion: {
      findFirst: vi.fn(async ({ where }: { where: { chapterId: string } }) => {
        const rows = versions.filter((v) => v.chapterId === where.chapterId).sort((a, b) => b.versionNumber - a.versionNumber);
        return rows[0] ? { versionNumber: rows[0].versionNumber } : null;
      }),
      create: vi.fn(async ({ data }: { data: { chapterId: string; versionNumber: number } }) => {
        const row = { id: `ver-${versions.length + 1}`, ...data };
        versions.push(row);
        return row;
      }),
      findMany: vi.fn(async ({ where }: { where: { chapterId: string } }) =>
        versions.filter((v) => v.chapterId === where.chapterId).sort((a, b) => b.versionNumber - a.versionNumber).map((v) => ({ id: v.id })),
      ),
      deleteMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
        const ids = new Set(where.id.in);
        let count = 0;
        for (let i = versions.length - 1; i >= 0; i -= 1) {
          if (ids.has(versions[i]!.id)) {
            versions.splice(i, 1);
            count += 1;
          }
        }
        return { count };
      }),
    },
    __versions: versions,
  };
}

const snap = (prisma: unknown, body: string) =>
  snapshotChapterVersion(prisma as never, { chapterId: 'c1', title: 't', summary: 's', body, createdByUserId: 'u1', source: 'EDIT' });

describe('affectedSceneIdsForChapterEdit', () => {
  const chapter = { sceneSeeds: [{ id: 's1' }, { id: 's2' }] };

  it('returns the chapter scenes when the body changed', () => {
    expect(affectedSceneIdsForChapterEdit(chapter, 'old', 'new')).toEqual(['s1', 's2']);
  });

  it('returns nothing when the body is unchanged', () => {
    expect(affectedSceneIdsForChapterEdit(chapter, 'same', 'same')).toEqual([]);
  });

  it('returns nothing when there are no scenes', () => {
    expect(affectedSceneIdsForChapterEdit({ sceneSeeds: [] }, 'a', 'b')).toEqual([]);
  });
});

describe('snapshotChapterVersion', () => {
  it('numbers versions monotonically (1, 2, 3 — never reused)', async () => {
    const prisma = prismaMock();
    const nums: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const v = await snap(prisma, `b${i}`);
      nums.push(v.versionNumber);
    }
    expect(nums).toEqual([1, 2, 3]);
  });

  it('caps at 50, pruning the oldest, while the latest 10 always remain', async () => {
    const prisma = prismaMock();
    for (let i = 0; i < 51; i += 1) await snap(prisma, `b${i}`);

    expect(prisma.__versions).toHaveLength(CHAPTER_VERSION_CAP); // 50
    const nums = prisma.__versions.map((v) => v.versionNumber).sort((a, b) => a - b);
    expect(nums[0]).toBe(2); // version 1 pruned
    for (let n = 42; n <= 51; n += 1) expect(nums).toContain(n); // newest 10 intact
  });

  it('does not prune while at or below the cap', async () => {
    const prisma = prismaMock();
    for (let i = 0; i < 5; i += 1) await snap(prisma, `b${i}`);
    expect(await pruneChapterVersions(prisma as never, 'c1')).toBe(0);
    expect(prisma.__versions).toHaveLength(5);
  });
});
