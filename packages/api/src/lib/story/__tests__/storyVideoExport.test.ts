/**
 * Phase C — StoryVideoExportService backgroundMusicUrl threading.
 *
 * Tests:
 *   A. backgroundMusicUrl is passed to renderOutputDerivative when set on project.
 *   B. backgroundMusicUrl=null when project has none (render receives undefined/null).
 *   C. Source hash changes when backgroundMusicUrl changes (cache invalidation).
 *   D. R16 gate: non-R16 context is rejected.
 *   E. KIDS-mode gate: non-KIDS project is rejected.
 */

import { writeFile } from 'node:fs/promises';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StoryVideoExportService } from '../storyVideoExportService';
import type { OutputRenderDeps } from '../../creative/output/render';
import type { PrismaClient } from '@raivstream/database';

// ─── Minimal Prisma mock helpers ──────────────────────────────────────────────

function makeProject(overrides: Record<string, unknown> = {}) {
  return {
    id: 'proj-1',
    userId: 'user-1',
    audienceMode: 'KIDS',
    contentType: 'STORY',
    backgroundMusicUrl: null,
    ...overrides,
  };
}

function makeScene(id: string, orderIndex: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    projectId: 'proj-1',
    orderIndex,
    title: `Scene ${orderIndex}`,
    description: `Description ${orderIndex}`,
    narrationAudioUrl: null,
    ...overrides,
  };
}

function makeAsset(sceneId: string) {
  return {
    id: `asset-${sceneId}`,
    sceneId,
    projectId: 'proj-1',
    assetUrl: `https://cdn.test/${sceneId}.mp4`,
    durationSeconds: 4,
    assetType: 'VIDEO',
    status: 'READY',
    isLatest: true,
    deletedAt: null,
  };
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

function makePrisma(
  project: ReturnType<typeof makeProject>,
  scenes: ReturnType<typeof makeScene>[],
  assets: ReturnType<typeof makeAsset>[],
): DeepPartial<PrismaClient> {
  return {
    storyProject: {
      findFirst: vi.fn().mockResolvedValue(project),
    } as unknown as PrismaClient['storyProject'],
    storySceneSeed: {
      findMany: vi.fn().mockResolvedValue(scenes),
    } as unknown as PrismaClient['storySceneSeed'],
    storySceneAsset: {
      findMany: vi.fn().mockResolvedValue(assets),
    } as unknown as PrismaClient['storySceneAsset'],
    storyVideoExport: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'export-1', projectId: 'proj-1', status: 'GENERATING', sourceHash: 'hash', sceneIds: [], createdAt: new Date(), completedAt: null, assetUrl: null, durationSeconds: null, widthPx: null, heightPx: null, errorMessage: null }),
      update: vi.fn().mockResolvedValue({ id: 'export-1', projectId: 'proj-1', status: 'READY', sourceHash: 'hash', sceneIds: [], createdAt: new Date(), completedAt: new Date(), assetUrl: 'https://cdn.test/out.mp4', durationSeconds: null, widthPx: null, heightPx: null, errorMessage: null }),
    } as unknown as PrismaClient['storyVideoExport'],
  };
}

const BASE_SCENES = [makeScene('s1', 0)];
const BASE_ASSETS = [makeAsset('s1')];

// ─── Render deps capture helper ──────────────────────────────────────────────

function makeCaptureDeps(): { deps: OutputRenderDeps; capturedInput: { backgroundMusicUrl?: string | null } } {
  const capturedInput: { backgroundMusicUrl?: string | null } = {};
  const deps: OutputRenderDeps = {
    fetch: vi.fn(async (_url: unknown) => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response)) as typeof fetch,
    ffmpeg: vi.fn(async () => {}),
    upload: vi.fn(async () => 'https://cdn.test/out.mp4'),
  };
  // Wrap ffmpeg to capture the first renderOutputDerivative call's bgMusic
  // by patching at the service level via the deps object.
  const origUpload = deps.upload!;
  let callCount = 0;
  deps.upload = vi.fn(async (buf: Buffer, key: string, ct: string) => {
    callCount++;
    return origUpload(buf, key, ct);
  });
  return { deps, capturedInput };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('StoryVideoExportService — Phase C backgroundMusicUrl', () => {
  let svc: StoryVideoExportService;

  beforeEach(() => {
    svc = new StoryVideoExportService();
  });

  describe('A. backgroundMusicUrl passed to render when set on project', () => {
    it('render receives backgroundMusicUrl from project', async () => {
      const project = makeProject({ backgroundMusicUrl: 'https://cdn.test/music.mp3' });
      const prisma = makePrisma(project, BASE_SCENES, BASE_ASSETS) as unknown as PrismaClient;

      let receivedMusicUrl: string | null | undefined = undefined;
      const ffmpegCalls: string[][] = [];
      const deps: OutputRenderDeps = {
        fetch: vi.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response)) as typeof fetch,
        ffmpeg: vi.fn(async (args: string[]) => {
          ffmpegCalls.push(args);
          const outArg = [...args].reverse().find((a) => a.endsWith('.mp4'));
          if (outArg) await writeFile(outArg, Buffer.alloc(8, 0x00));
        }),
        upload: vi.fn(async () => 'https://cdn.test/out.mp4'),
      };

      await svc.requestExport(prisma, { userId: 'user-1', projectId: 'proj-1', isR16: true }, deps);

      // With backgroundMusicUrl set, we expect 2 ffmpeg calls (video-only + music add)
      // for the video-only + music path.
      expect(ffmpegCalls.length).toBeGreaterThanOrEqual(2);
      // Second call must include volume=0.3 music filter
      const musicCall = ffmpegCalls.find((args) => args.join(' ').includes('volume=0.3'));
      expect(musicCall).toBeDefined();
    });
  });

  describe('B. backgroundMusicUrl null when project has none', () => {
    it('render receives no music (1 ffmpeg call in video-only path)', async () => {
      const project = makeProject({ backgroundMusicUrl: null });
      const prisma = makePrisma(project, BASE_SCENES, BASE_ASSETS) as unknown as PrismaClient;

      const ffmpegCalls: string[][] = [];
      const deps: OutputRenderDeps = {
        fetch: vi.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response)) as typeof fetch,
        ffmpeg: vi.fn(async (args: string[]) => {
          ffmpegCalls.push(args);
          const outArg = [...args].reverse().find((a) => a.endsWith('.mp4'));
          if (outArg) await writeFile(outArg, Buffer.alloc(8, 0x00));
        }),
        upload: vi.fn(async () => 'https://cdn.test/out.mp4'),
      };

      await svc.requestExport(prisma, { userId: 'user-1', projectId: 'proj-1', isR16: true }, deps);

      // Segment contract: 1 scene segment + 1 stream-copy concat + 1 end card = 3
      expect(ffmpegCalls).toHaveLength(3);
      expect(ffmpegCalls[0]!.join(' ')).not.toContain('volume=0.3');
    });
  });

  describe('C. Source hash changes when backgroundMusicUrl changes', () => {
    it('different hash for project with music vs without', async () => {
      // Collect the sourceHash passed to storyVideoExport.create
      async function hashFrom(project: ReturnType<typeof makeProject>): Promise<string> {
        const prisma = makePrisma(project, BASE_SCENES, BASE_ASSETS) as unknown as PrismaClient;
        // Synchronously extract the hash that would be computed by calling
        // requestExport — we need to spy on create.
        let capturedHash = '';
        const createSpy = vi.fn().mockImplementation((args: { data: { sourceHash: string } }) => {
          capturedHash = args.data.sourceHash;
          return Promise.resolve({ id: 'export-1', projectId: 'proj-1', status: 'GENERATING', sourceHash: capturedHash, sceneIds: [], createdAt: new Date(), completedAt: null, assetUrl: null, durationSeconds: null, widthPx: null, heightPx: null, errorMessage: null });
        });
        (prisma.storyVideoExport as unknown as Record<string, unknown>).create = createSpy;

        const deps: OutputRenderDeps = {
          fetch: vi.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response)) as typeof fetch,
          ffmpeg: vi.fn(async (args: string[]) => {
            const outArg = [...args].reverse().find((a) => a.endsWith('.mp4'));
            if (outArg) await writeFile(outArg, Buffer.alloc(8, 0x00));
          }),
          upload: vi.fn(async () => 'https://cdn.test/out.mp4'),
        };

        return svc.requestExport(prisma, { userId: 'user-1', projectId: 'proj-1', isR16: true }, deps)
          .then(() => capturedHash);
      }

      const hashNoMusic = await hashFrom(makeProject({ backgroundMusicUrl: null }));
      const hashWithMusic = await hashFrom(makeProject({ backgroundMusicUrl: 'https://cdn.test/music.mp3' }));

      expect(hashNoMusic).not.toBe('');
      expect(hashWithMusic).not.toBe('');
      expect(hashNoMusic).not.toBe(hashWithMusic);
    });
  });

  describe('D. R16 gate', () => {
    it('rejects when isR16=false', async () => {
      const prisma = makePrisma(makeProject(), BASE_SCENES, BASE_ASSETS) as unknown as PrismaClient;
      await expect(svc.requestExport(prisma, { userId: 'user-1', projectId: 'proj-1', isR16: false }, {}))
        .rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  describe('E. KIDS-mode gate', () => {
    it('rejects when project audienceMode is not KIDS', async () => {
      const project = makeProject({ audienceMode: 'GENERAL' });
      const prisma = makePrisma(project, BASE_SCENES, BASE_ASSETS) as unknown as PrismaClient;
      await expect(svc.requestExport(prisma, { userId: 'user-1', projectId: 'proj-1', isR16: true }, {}))
        .rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });
});

describe('StoryVideoExportService — endCardApplied writer', () => {
  let svc: StoryVideoExportService;

  beforeEach(() => {
    svc = new StoryVideoExportService();
  });

  function makePrismaCapturing(updateResult: Record<string, unknown>) {
    const updateSpy = vi.fn().mockResolvedValue({
      id: 'export-1', projectId: 'proj-1', status: 'READY', sourceHash: 'hash',
      sceneIds: [], createdAt: new Date(), completedAt: new Date(),
      assetUrl: 'https://cdn.test/out.mp4', durationSeconds: null, widthPx: null,
      heightPx: null, errorMessage: null, endCardApplied: null,
      ...updateResult,
    });
    const prisma: DeepPartial<PrismaClient> = {
      storyProject: {
        findFirst: vi.fn().mockResolvedValue(makeProject()),
      } as unknown as PrismaClient['storyProject'],
      storySceneSeed: {
        findMany: vi.fn().mockResolvedValue(BASE_SCENES),
      } as unknown as PrismaClient['storySceneSeed'],
      storySceneAsset: {
        findMany: vi.fn().mockResolvedValue(BASE_ASSETS),
      } as unknown as PrismaClient['storySceneAsset'],
      user: {
        findUnique: vi.fn().mockResolvedValue({ username: 'testuser' }),
      } as unknown as PrismaClient['user'],
      storyVideoExport: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'export-1', projectId: 'proj-1', status: 'GENERATING', sourceHash: 'hash',
          sceneIds: [], createdAt: new Date(), completedAt: null, assetUrl: null,
          durationSeconds: null, widthPx: null, heightPx: null, errorMessage: null, endCardApplied: null,
        }),
        update: updateSpy,
      } as unknown as PrismaClient['storyVideoExport'],
    };
    return { prisma: prisma as unknown as PrismaClient, updateSpy };
  }

  it('F. sets endCardApplied=true in DB update when card is applied', async () => {
    const { prisma, updateSpy } = makePrismaCapturing({ endCardApplied: true });
    const deps: OutputRenderDeps = {
      fetch: vi.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response)) as typeof fetch,
      ffmpeg: vi.fn(async (args: string[]) => {
        const outArg = [...args].reverse().find((a) => a.endsWith('.mp4'));
        if (outArg) await writeFile(outArg, Buffer.alloc(8, 0x00));
      }),
      upload: vi.fn(async () => 'https://cdn.test/out.mp4'),
      endCardPreflight: async () => ({ drawtext: true, font: true, ok: true }),
    };

    const result = await svc.requestExport(prisma, { userId: 'user-1', projectId: 'proj-1', isR16: true }, deps);

    // D-033: the first update is the GENERATING transition; endCardApplied lands
    // on the final READY write.
    const updateCall = updateSpy.mock.calls.at(-1)?.[0] as { data: Record<string, unknown> };
    expect(updateCall?.data.endCardApplied).toBe(true);
    expect(result.status).toBe('READY');
  });

  it('G. sets endCardApplied=false in DB update when preflight fails; export still READY', async () => {
    const { prisma, updateSpy } = makePrismaCapturing({ endCardApplied: false });
    const deps: OutputRenderDeps = {
      fetch: vi.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response)) as typeof fetch,
      ffmpeg: vi.fn(async (args: string[]) => {
        const outArg = [...args].reverse().find((a) => a.endsWith('.mp4'));
        if (outArg) await writeFile(outArg, Buffer.alloc(8, 0x00));
      }),
      upload: vi.fn(async () => 'https://cdn.test/out.mp4'),
      endCardPreflight: async () => ({ drawtext: false, font: true, ok: false }),
    };

    const result = await svc.requestExport(prisma, { userId: 'user-1', projectId: 'proj-1', isR16: true }, deps);

    const updateCall = updateSpy.mock.calls.at(-1)?.[0] as { data: Record<string, unknown> };
    expect(updateCall?.data.endCardApplied).toBe(false);
    expect(updateCall?.data.status).toBe('READY');
    expect(result.status).toBe('READY');
  });
});
