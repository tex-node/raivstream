import { describe, expect, it, vi } from 'vitest';
import { RESOLUTION_EXPECTED_BUT_CLEARED_ZERO, resolveClearedFlags } from '../resolveClearedFlags';

/**
 * The fourth recurrence of "resolve reports zero" (2026-11-03). Matching by project + scene
 * across every take fixes the flag that stayed live after its take scored 90; the assertion
 * makes a zero-cleared pass fail instead of reporting a number.
 */

function prismaWith(opts: { assets: Array<{ id: string }>; liveFlags: number }) {
  const updates: unknown[] = [];
  return {
    prisma: {
      creativeProducedAsset: { findMany: vi.fn(async () => opts.assets) },
      creativeReviewFlag: {
        count: vi.fn(async () => opts.liveFlags),
        updateMany: vi.fn(async (args: unknown) => {
          updates.push(args);
          return { count: opts.liveFlags };
        }),
      },
    } as never,
    updates,
  };
}

describe('resolution matches by project + scene, across takes', () => {
  it('resolves a flag pointing at a demoted asset when the scene clears', async () => {
    const { prisma } = prismaWith({ assets: [{ id: 'take_1' }, { id: 'take_2' }], liveFlags: 1 });
    const result = await resolveClearedFlags(prisma, {
      projectId: 'proj_1',
      sceneScores: [{ sceneId: 'SCENE_03', identity: 90 }],
    });
    expect(result.cleared).toBe(1);
    expect(result.expected).toBe(1);
  });

  it('does not resolve a scene that is genuinely below floor', async () => {
    const { prisma } = prismaWith({ assets: [{ id: 'take_1' }], liveFlags: 1 });
    const result = await resolveClearedFlags(prisma, {
      projectId: 'proj_1',
      sceneScores: [{ sceneId: 'SCENE_02', identity: 70 }],
    });
    expect(result.cleared).toBe(0);
    expect(result.expected).toBe(0);
  });

  it('fails loudly when clears were expected but nothing was cleared', async () => {
    const prisma = {
      creativeProducedAsset: { findMany: vi.fn(async () => [{ id: 'take_1' }]) },
      creativeReviewFlag: {
        count: vi.fn(async () => 1),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
    } as never;
    await expect(
      resolveClearedFlags(prisma, { projectId: 'proj_1', sceneScores: [{ sceneId: 'SCENE_03', identity: 90 }] }),
    ).rejects.toThrow(new RegExp(RESOLUTION_EXPECTED_BUT_CLEARED_ZERO));
  });

  it('a scene with no produced assets is skipped without throwing', async () => {
    const { prisma } = prismaWith({ assets: [], liveFlags: 0 });
    const result = await resolveClearedFlags(prisma, {
      projectId: 'proj_1',
      sceneScores: [{ sceneId: 'SCENE_09', identity: 90 }],
    });
    expect(result.cleared).toBe(0);
  });
});