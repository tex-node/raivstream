import { describe, it, expect, vi } from 'vitest';
import { appRouter } from '../../index';

/**
 * D-004 - Media Library scoping.
 *
 * The security property is the point: a caller must only ever receive rows
 * whose owner is them, and assets with no URL must never be emitted (a broken
 * card is worse than a shorter library).
 */

function makePrisma(overrides: Partial<Record<'story' | 'video' | 'audio' | 'export', unknown[]>> = {}) {
  const calls = { story: [] as unknown[], video: [] as unknown[], audio: [] as unknown[], export: [] as unknown[] };

  return {
    calls,
    storySceneAsset: {
      findMany: vi.fn(async (args: unknown) => {
        calls.story.push(args);
        return overrides.story ?? [];
      }),
    },
    video: {
      findMany: vi.fn(async (args: unknown) => {
        calls.video.push(args);
        return overrides.video ?? [];
      }),
    },
    audioAsset: {
      findMany: vi.fn(async (args: unknown) => {
        calls.audio.push(args);
        return overrides.audio ?? [];
      }),
    },
    storyVideoExport: {
      findMany: vi.fn(async (args: unknown) => {
        calls.export.push(args);
        return overrides.export ?? [];
      }),
    },
  };
}

function caller(prisma: ReturnType<typeof makePrisma>) {
  return appRouter.createCaller({
    prisma: prisma as never,
    userId: 'user-1',
    user: { id: 'user-1', email: 'a@b.test', username: 'u', displayName: 'U', role: 'CREATOR' as const },
  } as never);
}

describe('library.getAssets', () => {
  it('scopes every source to the caller', async () => {
    const prisma = makePrisma();
    await caller(prisma).library.getAssets({ limit: 10 });

    expect((prisma.calls.story[0] as { where: { userId: string } }).where.userId).toBe('user-1');
    expect((prisma.calls.video[0] as { where: { creatorId: string } }).where.creatorId).toBe('user-1');
    expect((prisma.calls.audio[0] as { where: { userId: string } }).where.userId).toBe('user-1');
  });

  it('hides non-READY story assets and never emits rows without a URL', async () => {
    const prisma = makePrisma({
      story: [
        { id: 'a1', assetUrl: 'https://cdn/a1.png', thumbnailUrl: null, assetType: 'IMAGE', createdAt: new Date('2026-10-01') },
        { id: 'a2', assetUrl: null, thumbnailUrl: null, assetType: 'IMAGE', createdAt: new Date('2026-10-02') },
      ],
      video: [
        { id: 'v1', mp4Url: null, hlsMasterUrl: null, thumbnailUrl: 't', status: 'READY', createdAt: new Date('2026-10-03'), generationJob: null },
        { id: 'v2', mp4Url: 'https://cdn/v2.mp4', hlsMasterUrl: null, thumbnailUrl: 't', status: 'READY', createdAt: new Date('2026-10-04'), generationJob: { id: 'g1' } },
      ],
      audio: [
        { id: 'au1', publicUrl: 'https://cdn/au1.mp3', projectId: 'p1', createdAt: new Date('2026-10-05') },
        { id: 'au2', publicUrl: 'https://cdn/au2.mp3', projectId: null, createdAt: new Date('2026-10-06') },
      ],
    });

    const result = await caller(prisma).library.getAssets({ limit: 10 });
    const ids = result.items.map((item) => item.id);

    expect(ids).not.toContain('a2'); // no URL
    expect(ids).not.toContain('v1'); // no URL
    expect(ids).toEqual(['au2', 'au1', 'v2', 'a1']); // newest first
  });

  it('derives source from the data, not a stored field', async () => {
    const prisma = makePrisma({
      video: [{ id: 'v2', mp4Url: 'https://cdn/v2.mp4', hlsMasterUrl: null, thumbnailUrl: null, status: 'READY', createdAt: new Date('2026-10-04'), generationJob: { id: 'g1' } }],
      audio: [
        { id: 'story-audio', publicUrl: 'u1', projectId: 'p1', createdAt: new Date('2026-10-01') },
        { id: 'studio-audio', publicUrl: 'u2', projectId: null, createdAt: new Date('2026-10-02') },
      ],
    });

    const result = await caller(prisma).library.getAssets({ limit: 10 });
    const byId = Object.fromEntries(result.items.map((item) => [item.id, item]));

    expect(byId.v2.source).toBe('generated');
    expect(byId['story-audio'].source).toBe('story');
    expect(byId['studio-audio'].source).toBe('studio');
  });

  it('surfaces PROCESSING videos with a status instead of hiding them', async () => {
    const prisma = makePrisma({
      video: [{ id: 'v3', mp4Url: 'https://cdn/v3.mp4', hlsMasterUrl: null, thumbnailUrl: null, status: 'PROCESSING', createdAt: new Date('2026-10-04'), generationJob: null }],
    });

    const result = await caller(prisma).library.getAssets({ limit: 10 });
    expect(result.items[0]).toMatchObject({ id: 'v3', status: 'PROCESSING', source: 'upload' });
  });

  it('rejects an unparseable cursor instead of silently returning page one', async () => {
    const prisma = makePrisma();
    await expect(
      caller(prisma).library.getAssets({ limit: 10, cursor: { createdAt: 'not-a-date', id: 'x' } }),
    ).rejects.toThrow(/Invalid cursor/);
  });

  it('skips sources the filter excludes', async () => {
    const prisma = makePrisma();
    await caller(prisma).library.getAssets({ limit: 10, type: 'audio' });

    expect(prisma.calls.story).toHaveLength(0);
    expect(prisma.calls.video).toHaveLength(0);
    expect(prisma.calls.audio).toHaveLength(1);
  });
});

describe('library.getAssets - final exports', () => {
  it('includes StoryVideoExport rows with the project title', async () => {
    const prisma = makePrisma({
      export: [
        { id: 'exp1', assetUrl: 'https://cdn/final.mp4', createdAt: new Date('2026-10-20'), durationSeconds: 12, project: { title: 'Wings of Dawn' } },
      ],
    });

    const result = await caller(prisma).library.getAssets({ limit: 10 });

    expect(result.items[0]).toMatchObject({
      id: 'exp1',
      type: 'video',
      source: 'export',
      title: 'Wings of Dawn',
      url: 'https://cdn/final.mp4',
    });
  });
});