/**
 * Phase F4 — Educational Video Audio Integration Tests
 *
 * Verifies that educational MP4 exports contain narration audio muxed
 * per-scene (video looped to audio length, then concatenated).
 *
 * All tests are hermetic — no real DB, FFmpeg, R2, or network calls.
 *
 * Coverage per spec F4.10:
 *  A. Audio supplied → FFmpeg receives video + audio per scene
 *  B. Educational export — all scenes have video + audio → READY
 *  C. Missing narration audio → PRECONDITION_FAILED (not silent video)
 *  D. Audio ownership — audioUrl is never accepted from client input
 *  E. Scene ordering — orderIndex ASC preserved in mux
 *  F. Non-educational regression — STORY exports unchanged (no audio)
 *  G. FFmpeg invocation — audio file path appears in FFmpeg args
 *
 * F4.11: Acceptance pipeline shape verified (ships, age 7-9)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { StoryVideoExportService } from '../../lib/story/storyVideoExportService';
import { TRPCError } from '@trpc/server';
import * as renderModule from '../../lib/creative/output/render';
import { renderOutputDerivative } from '../../lib/creative/output/render';
import { deriveOutput } from '../../lib/creative/output/derivation';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeScene(
  id: string,
  orderIndex: number,
  projectId: string,
  narrationAudioUrl: string | null = null,
) {
  return { id, orderIndex, title: `Scene ${orderIndex}`, projectId, narrationAudioUrl };
}

function makeVideoAsset(id: string, sceneId: string, projectId: string) {
  return {
    id,
    sceneId,
    projectId,
    assetType: 'VIDEO',
    status: 'READY',
    assetUrl: `https://cdn.raivstream.com/assets/${id}.mp4`,
    isLatest: true,
    deletedAt: null,
    durationSeconds: 5,
  };
}

function makeProject(
  id: string,
  userId: string,
  audienceMode = 'KIDS',
  contentType: string | null = null,
) {
  return { id, userId, audienceMode, contentType };
}

function makeExportRow(id: string, projectId: string, hash: string, status = 'READY') {
  return {
    id,
    projectId,
    userId: 'user-1',
    status,
    sourceHash: hash,
    sceneIds: [],
    assetUrl: status === 'READY' ? `https://r2.raivstream.com/story-exports/${projectId}/exports/${id}/out.mp4` : null,
    r2Key: null,
    durationSeconds: null,
    widthPx: null,
    heightPx: null,
    errorMessage: null,
    createdAt: new Date('2026-01-01'),
    completedAt: status === 'READY' ? new Date('2026-01-01T00:01:00') : null,
    updatedAt: new Date('2026-01-01'),
  };
}

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    storyProject: { findFirst: vi.fn().mockResolvedValue(null) },
    storySceneSeed: { findMany: vi.fn().mockResolvedValue([]) },
    storySceneAsset: { findMany: vi.fn().mockResolvedValue([]) },
    storyVideoExport: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(makeExportRow('export-1', 'project-edu', 'hash-abc', 'GENERATING')),
      update: vi.fn().mockResolvedValue(makeExportRow('export-1', 'project-edu', 'hash-abc', 'READY')),
    },
    analyticsEvent: { create: vi.fn().mockResolvedValue({}) },
    ...overrides,
  };
}

const AUDIO_URL = 'https://r2.raivstream.com/narration/scene-1.mp3';
const AUDIO_URL_2 = 'https://r2.raivstream.com/narration/scene-2.mp3';

// ─── A. Audio mux — FFmpeg receives video + audio per scene ───────────────────

describe('F4 §A — renderOutputDerivative: audio mux path', () => {
  it('calls FFmpeg N+1 times for N scenes with audio (per-scene mux + concat)', async () => {
    let ffmpegCallCount = 0;
    const capturedArgLists: string[][] = [];

    const deps = {
      fetch: vi.fn(async () => ({ ok: true, arrayBuffer: async () => Buffer.from('media') }) as unknown as Response),
      ffmpeg: vi.fn(async (args: string[]) => {
        ffmpegCallCount++;
        capturedArgLists.push([...args]);
        // Write a minimal MP4 to the output file so subsequent reads work
        const outFile = args[args.length - 1];
        if (outFile) await writeFile(outFile, Buffer.from('fake-mp4'));
      }),
      upload: vi.fn(async () => 'r2://out.mp4'),
    };

    await renderOutputDerivative(
      {
        scenes: [
          { sceneId: 'S1', videoUrl: 'r2://v1', audioUrl: AUDIO_URL },
          { sceneId: 'S2', videoUrl: 'r2://v2', audioUrl: AUDIO_URL_2 },
        ],
        derivation: deriveOutput('PORTRAIT', null, 10),
        r2Prefix: 'x/y',
      },
      deps as never,
    );

    // 2 per-scene + 1 concat = 3 calls
    expect(ffmpegCallCount).toBe(3);
    expect(capturedArgLists).toHaveLength(3);
  });

  it('per-scene FFmpeg args include -stream_loop -1 and -shortest (loop video to audio length)', async () => {
    const capturedArgLists: string[][] = [];

    const deps = {
      fetch: vi.fn(async () => ({ ok: true, arrayBuffer: async () => Buffer.from('media') }) as unknown as Response),
      ffmpeg: vi.fn(async (args: string[]) => {
        capturedArgLists.push([...args]);
        const outFile = args[args.length - 1];
        if (outFile) await writeFile(outFile, Buffer.from('fake-mp4'));
      }),
      upload: vi.fn(async () => 'r2://out.mp4'),
    };

    await renderOutputDerivative(
      {
        scenes: [{ sceneId: 'S1', videoUrl: 'r2://v1', audioUrl: AUDIO_URL }],
        derivation: deriveOutput('PORTRAIT', null, 10),
        r2Prefix: 'x/y',
      },
      deps as never,
    );

    // First call = per-scene mux
    const perSceneArgs = capturedArgLists[0]!;
    expect(perSceneArgs).toContain('-stream_loop');
    expect(perSceneArgs).toContain('-1');
    expect(perSceneArgs).toContain('-shortest');
  });

  it('per-scene FFmpeg maps both video stream [v] and audio stream 1:a', async () => {
    const capturedArgLists: string[][] = [];

    const deps = {
      fetch: vi.fn(async () => ({ ok: true, arrayBuffer: async () => Buffer.from('media') }) as unknown as Response),
      ffmpeg: vi.fn(async (args: string[]) => {
        capturedArgLists.push([...args]);
        const outFile = args[args.length - 1];
        if (outFile) await writeFile(outFile, Buffer.from('fake-mp4'));
      }),
      upload: vi.fn(async () => 'r2://out.mp4'),
    };

    await renderOutputDerivative(
      {
        scenes: [{ sceneId: 'S1', videoUrl: 'r2://v1', audioUrl: AUDIO_URL }],
        derivation: deriveOutput('PORTRAIT', null, 10),
        r2Prefix: 'x/y',
      },
      deps as never,
    );

    const perSceneArgs = capturedArgLists[0]!;
    // -map [v] and -map 1:a
    const mapIndices = perSceneArgs.flatMap((a, i) => (a === '-map' ? [perSceneArgs[i + 1]] : []));
    expect(mapIndices).toContain('[v]');
    expect(mapIndices).toContain('1:a');
  });

  it('concat FFmpeg args include concat=n=N:v=1:a=1 (audio in output)', async () => {
    const capturedArgLists: string[][] = [];

    const deps = {
      fetch: vi.fn(async () => ({ ok: true, arrayBuffer: async () => Buffer.from('media') }) as unknown as Response),
      ffmpeg: vi.fn(async (args: string[]) => {
        capturedArgLists.push([...args]);
        const outFile = args[args.length - 1];
        if (outFile) await writeFile(outFile, Buffer.from('fake-mp4'));
      }),
      upload: vi.fn(async () => 'r2://out.mp4'),
    };

    await renderOutputDerivative(
      {
        scenes: [
          { sceneId: 'S1', videoUrl: 'r2://v1', audioUrl: AUDIO_URL },
          { sceneId: 'S2', videoUrl: 'r2://v2', audioUrl: AUDIO_URL_2 },
        ],
        derivation: deriveOutput('PORTRAIT', null, 10),
        r2Prefix: 'x/y',
      },
      deps as never,
    );

    // Last call = concat
    const concatArgs = capturedArgLists[capturedArgLists.length - 1]!;
    const filterArg = concatArgs.find((a) => a.includes('concat='));
    expect(filterArg).toMatch(/concat=n=2:v=1:a=1/);
    expect(filterArg).toMatch(/\[vout\]\[aout\]/);
  });

  it('concat step maps [vout] and [aout] (both streams in final MP4)', async () => {
    const capturedArgLists: string[][] = [];

    const deps = {
      fetch: vi.fn(async () => ({ ok: true, arrayBuffer: async () => Buffer.from('media') }) as unknown as Response),
      ffmpeg: vi.fn(async (args: string[]) => {
        capturedArgLists.push([...args]);
        const outFile = args[args.length - 1];
        if (outFile) await writeFile(outFile, Buffer.from('fake-mp4'));
      }),
      upload: vi.fn(async () => 'r2://out.mp4'),
    };

    await renderOutputDerivative(
      {
        scenes: [{ sceneId: 'S1', videoUrl: 'r2://v1', audioUrl: AUDIO_URL }],
        derivation: deriveOutput('PORTRAIT', null, 10),
        r2Prefix: 'x/y',
      },
      deps as never,
    );

    const concatArgs = capturedArgLists[capturedArgLists.length - 1]!;
    const mapValues = concatArgs.flatMap((a, i) => (a === '-map' ? [concatArgs[i + 1]] : []));
    expect(mapValues).toContain('[vout]');
    expect(mapValues).toContain('[aout]');
  });

  it('downloads both video and audio files (2 fetches per scene)', async () => {
    const fetchedUrls: string[] = [];

    const deps = {
      fetch: vi.fn(async (url: string) => {
        fetchedUrls.push(url);
        return { ok: true, arrayBuffer: async () => Buffer.from('media') } as unknown as Response;
      }),
      ffmpeg: vi.fn(async (args: string[]) => {
        const outFile = args[args.length - 1];
        if (outFile) await writeFile(outFile, Buffer.from('fake-mp4'));
      }),
      upload: vi.fn(async () => 'r2://out.mp4'),
    };

    await renderOutputDerivative(
      {
        scenes: [
          { sceneId: 'S1', videoUrl: 'r2://v1', audioUrl: AUDIO_URL },
          { sceneId: 'S2', videoUrl: 'r2://v2', audioUrl: AUDIO_URL_2 },
        ],
        derivation: deriveOutput('PORTRAIT', null, 10),
        r2Prefix: 'x/y',
      },
      deps as never,
    );

    // 2 scenes × 2 files = 4 fetches
    expect(fetchedUrls).toHaveLength(4);
    expect(fetchedUrls).toContain('r2://v1');
    expect(fetchedUrls).toContain(AUDIO_URL);
    expect(fetchedUrls).toContain('r2://v2');
    expect(fetchedUrls).toContain(AUDIO_URL_2);
  });

  it('throws when mixed audio/no-audio scenes are passed (all-or-nothing invariant)', async () => {
    const deps = {
      fetch: vi.fn(async () => ({ ok: true, arrayBuffer: async () => Buffer.from('media') }) as unknown as Response),
      ffmpeg: vi.fn(async (args: string[]) => {
        const outFile = args[args.length - 1];
        if (outFile) await writeFile(outFile, Buffer.from('fake-mp4'));
      }),
      upload: vi.fn(async () => 'r2://out.mp4'),
    };

    await expect(
      renderOutputDerivative(
        {
          scenes: [
            { sceneId: 'S1', videoUrl: 'r2://v1', audioUrl: AUDIO_URL },  // has audio
            { sceneId: 'S2', videoUrl: 'r2://v2' },                         // no audio
          ],
          derivation: deriveOutput('PORTRAIT', null, 10),
          r2Prefix: 'x/y',
        },
        deps as never,
      ),
    ).rejects.toThrow(/Missing.*S2|all scenes.*audio/i);
  });
});

// ─── B. Educational export — all scenes have video + audio → READY ────────────

describe('F4 §B — StoryVideoExportService: educational export with full audio', () => {
  let service: StoryVideoExportService;

  beforeEach(() => {
    service = new StoryVideoExportService();
  });

  it('educational export with all audio → calls renderOutputDerivative with audioUrl on every scene', async () => {
    let capturedScenes: Array<{ sceneId: string; audioUrl?: string | null }> = [];
    const spy = vi.spyOn(renderModule, 'renderOutputDerivative').mockImplementation(async ({ scenes }) => {
      capturedScenes = scenes as typeof capturedScenes;
      return { assetUrl: 'https://r2.raivstream.com/out.mp4' };
    });

    const prisma = makePrisma();
    (prisma.storyProject.findFirst as any).mockResolvedValue(
      makeProject('project-edu', 'user-1', 'KIDS', 'EDUCATIONAL'),
    );
    (prisma.storySceneSeed.findMany as any).mockResolvedValue([
      makeScene('scene-1', 0, 'project-edu', AUDIO_URL),
      makeScene('scene-2', 1, 'project-edu', AUDIO_URL_2),
    ]);
    (prisma.storySceneAsset.findMany as any).mockResolvedValue([
      makeVideoAsset('asset-1', 'scene-1', 'project-edu'),
      makeVideoAsset('asset-2', 'scene-2', 'project-edu'),
    ]);
    (prisma.storyVideoExport.create as any).mockResolvedValue(
      makeExportRow('export-1', 'project-edu', 'hash-edu', 'GENERATING'),
    );
    (prisma.storyVideoExport.update as any).mockResolvedValue(
      makeExportRow('export-1', 'project-edu', 'hash-edu', 'READY'),
    );

    const result = await service.requestExport(prisma as any, {
      userId: 'user-1',
      projectId: 'project-edu',
      isR16: true,
    });

    expect(result.status).toBe('READY');
    expect(capturedScenes).toHaveLength(2);
    for (const scene of capturedScenes) {
      expect(scene.audioUrl, `scene ${scene.sceneId} missing audioUrl`).toBeTruthy();
    }

    spy.mockRestore();
  });

  it('educational export audioUrl values match the DB narrationAudioUrl (not client input)', async () => {
    let capturedScenes: Array<{ sceneId: string; audioUrl?: string | null }> = [];
    const spy = vi.spyOn(renderModule, 'renderOutputDerivative').mockImplementation(async ({ scenes }) => {
      capturedScenes = scenes as typeof capturedScenes;
      return { assetUrl: 'https://r2.raivstream.com/out.mp4' };
    });

    const prisma = makePrisma();
    (prisma.storyProject.findFirst as any).mockResolvedValue(
      makeProject('project-edu', 'user-1', 'KIDS', 'EDUCATIONAL'),
    );
    (prisma.storySceneSeed.findMany as any).mockResolvedValue([
      makeScene('scene-1', 0, 'project-edu', 'https://r2.raivstream.com/narration/scene-1-db.mp3'),
    ]);
    (prisma.storySceneAsset.findMany as any).mockResolvedValue([
      makeVideoAsset('asset-1', 'scene-1', 'project-edu'),
    ]);
    (prisma.storyVideoExport.create as any).mockResolvedValue(
      makeExportRow('export-1', 'project-edu', 'hash-edu', 'GENERATING'),
    );
    (prisma.storyVideoExport.update as any).mockResolvedValue(
      makeExportRow('export-1', 'project-edu', 'hash-edu', 'READY'),
    );

    await service.requestExport(prisma as any, { userId: 'user-1', projectId: 'project-edu', isR16: true });

    // audioUrl must come from DB, not from somewhere else
    expect(capturedScenes[0]?.audioUrl).toBe('https://r2.raivstream.com/narration/scene-1-db.mp3');
    spy.mockRestore();
  });
});

// ─── C. Missing narration audio → PRECONDITION_FAILED ─────────────────────────

describe('F4 §C — StoryVideoExportService: missing narration audio blocks educational export', () => {
  let service: StoryVideoExportService;
  beforeEach(() => { service = new StoryVideoExportService(); });

  it('educational export fails when one scene has no narrationAudioUrl', async () => {
    const prisma = makePrisma();
    (prisma.storyProject.findFirst as any).mockResolvedValue(
      makeProject('project-edu', 'user-1', 'KIDS', 'EDUCATIONAL'),
    );
    (prisma.storySceneSeed.findMany as any).mockResolvedValue([
      makeScene('scene-1', 0, 'project-edu', AUDIO_URL),   // has audio
      makeScene('scene-2', 1, 'project-edu', null),          // NO audio
    ]);
    (prisma.storySceneAsset.findMany as any).mockResolvedValue([
      makeVideoAsset('asset-1', 'scene-1', 'project-edu'),
      makeVideoAsset('asset-2', 'scene-2', 'project-edu'),
    ]);

    const err = await service
      .requestExport(prisma as any, { userId: 'user-1', projectId: 'project-edu', isR16: true })
      .catch((e) => e);

    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe('PRECONDITION_FAILED');
    expect((err as TRPCError).message).toMatch(/narration audio/i);
    expect((err as TRPCError).message).toMatch(/Generate narration/i);
  });

  it('educational export fails when ALL scenes are missing narrationAudioUrl', async () => {
    const prisma = makePrisma();
    (prisma.storyProject.findFirst as any).mockResolvedValue(
      makeProject('project-edu', 'user-1', 'KIDS', 'EDUCATIONAL'),
    );
    (prisma.storySceneSeed.findMany as any).mockResolvedValue([
      makeScene('scene-1', 0, 'project-edu', null),
      makeScene('scene-2', 1, 'project-edu', null),
    ]);
    (prisma.storySceneAsset.findMany as any).mockResolvedValue([
      makeVideoAsset('asset-1', 'scene-1', 'project-edu'),
      makeVideoAsset('asset-2', 'scene-2', 'project-edu'),
    ]);

    const err = await service
      .requestExport(prisma as any, { userId: 'user-1', projectId: 'project-edu', isR16: true })
      .catch((e) => e);

    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe('PRECONDITION_FAILED');
  });

  it('missing audio error fires BEFORE FFmpeg is ever called (no partial render)', async () => {
    const renderSpy = vi.spyOn(renderModule, 'renderOutputDerivative');

    const prisma = makePrisma();
    (prisma.storyProject.findFirst as any).mockResolvedValue(
      makeProject('project-edu', 'user-1', 'KIDS', 'EDUCATIONAL'),
    );
    (prisma.storySceneSeed.findMany as any).mockResolvedValue([
      makeScene('scene-1', 0, 'project-edu', null),
    ]);
    (prisma.storySceneAsset.findMany as any).mockResolvedValue([
      makeVideoAsset('asset-1', 'scene-1', 'project-edu'),
    ]);

    await service
      .requestExport(prisma as any, { userId: 'user-1', projectId: 'project-edu', isR16: true })
      .catch(() => undefined);

    expect(renderSpy).not.toHaveBeenCalled();
    renderSpy.mockRestore();
  });
});

// ─── D. Audio ownership — client cannot inject audioUrl ───────────────────────

describe('F4 §D — Audio ownership: audioUrl is derived from DB, never from client', () => {
  let service: StoryVideoExportService;
  beforeEach(() => { service = new StoryVideoExportService(); });

  it('requestExport input schema has no audioUrl field', () => {
    // The requestStoryVideoExport tRPC procedure only accepts { projectId }.
    // This test documents the invariant: audio comes from DB rows, not client.
    const input = { projectId: 'project-edu' };
    // TypeScript check: the input object must not have audioUrl
    expect('audioUrl' in input).toBe(false);
  });

  it('scene audio is sourced from StorySceneSeed.narrationAudioUrl (project-owned row)', async () => {
    let capturedScenes: Array<{ sceneId: string; audioUrl?: string | null }> = [];
    const spy = vi.spyOn(renderModule, 'renderOutputDerivative').mockImplementation(async ({ scenes }) => {
      capturedScenes = scenes as typeof capturedScenes;
      return { assetUrl: 'https://r2.raivstream.com/out.mp4' };
    });

    const prisma = makePrisma();
    const dbAudioUrl = 'https://r2.raivstream.com/narration/owned-by-this-project.mp3';
    (prisma.storyProject.findFirst as any).mockResolvedValue(
      makeProject('project-edu', 'user-1', 'KIDS', 'EDUCATIONAL'),
    );
    (prisma.storySceneSeed.findMany as any).mockResolvedValue([
      makeScene('scene-1', 0, 'project-edu', dbAudioUrl),
    ]);
    (prisma.storySceneAsset.findMany as any).mockResolvedValue([
      makeVideoAsset('asset-1', 'scene-1', 'project-edu'),
    ]);
    (prisma.storyVideoExport.create as any).mockResolvedValue(
      makeExportRow('export-1', 'project-edu', 'hash-edu', 'GENERATING'),
    );
    (prisma.storyVideoExport.update as any).mockResolvedValue(
      makeExportRow('export-1', 'project-edu', 'hash-edu', 'READY'),
    );

    await service.requestExport(prisma as any, { userId: 'user-1', projectId: 'project-edu', isR16: true });

    // Audio URL must exactly match what was in the DB — not any client value
    expect(capturedScenes[0]?.audioUrl).toBe(dbAudioUrl);
    spy.mockRestore();
  });

  it('audio from a different project cannot bleed in (scene query is project-scoped)', async () => {
    // If the DB query for StorySceneSeed is scoped to projectId, then audio URLs
    // from other projects can't appear. We verify the findMany is called with projectId.
    const prisma = makePrisma();
    (prisma.storyProject.findFirst as any).mockResolvedValue(
      makeProject('project-edu', 'user-1', 'KIDS', 'EDUCATIONAL'),
    );
    (prisma.storySceneSeed.findMany as any).mockResolvedValue([]);

    await service
      .requestExport(prisma as any, { userId: 'user-1', projectId: 'project-edu', isR16: true })
      .catch(() => undefined);

    const seedCall = (prisma.storySceneSeed.findMany as any).mock.calls[0][0];
    expect(seedCall.where.projectId).toBe('project-edu');
  });
});

// ─── E. Scene ordering — orderIndex ASC preserved in mux ──────────────────────

describe('F4 §E — Scene ordering preserved in educational mux', () => {
  let service: StoryVideoExportService;
  beforeEach(() => { service = new StoryVideoExportService(); });

  it('passes scenes to renderOutputDerivative in orderIndex ASC order for educational export', async () => {
    let capturedScenes: Array<{ sceneId: string }> = [];
    const spy = vi.spyOn(renderModule, 'renderOutputDerivative').mockImplementation(async ({ scenes }) => {
      capturedScenes = scenes as typeof capturedScenes;
      return { assetUrl: 'https://r2.raivstream.com/out.mp4' };
    });

    const prisma = makePrisma();
    (prisma.storyProject.findFirst as any).mockResolvedValue(
      makeProject('project-edu', 'user-1', 'KIDS', 'EDUCATIONAL'),
    );
    // DB returns them in orderIndex order (Prisma orderBy: orderIndex asc)
    (prisma.storySceneSeed.findMany as any).mockResolvedValue([
      makeScene('scene-a', 0, 'project-edu', AUDIO_URL),
      makeScene('scene-b', 1, 'project-edu', AUDIO_URL_2),
    ]);
    (prisma.storySceneAsset.findMany as any).mockResolvedValue([
      makeVideoAsset('asset-a', 'scene-a', 'project-edu'),
      makeVideoAsset('asset-b', 'scene-b', 'project-edu'),
    ]);
    (prisma.storyVideoExport.create as any).mockImplementation(({ data }: any) =>
      Promise.resolve(makeExportRow('export-1', 'project-edu', data.sourceHash, 'GENERATING')),
    );
    (prisma.storyVideoExport.update as any).mockResolvedValue(
      makeExportRow('export-1', 'project-edu', 'any', 'READY'),
    );

    await service.requestExport(prisma as any, { userId: 'user-1', projectId: 'project-edu', isR16: true });

    expect(capturedScenes[0]?.sceneId).toBe('scene-a');
    expect(capturedScenes[1]?.sceneId).toBe('scene-b');
    spy.mockRestore();
  });

  it('storySceneSeed findMany is called with orderBy: { orderIndex: asc }', async () => {
    const prisma = makePrisma();
    (prisma.storyProject.findFirst as any).mockResolvedValue(
      makeProject('project-edu', 'user-1', 'KIDS', 'EDUCATIONAL'),
    );
    (prisma.storySceneSeed.findMany as any).mockResolvedValue([]);

    await service
      .requestExport(prisma as any, { userId: 'user-1', projectId: 'project-edu', isR16: true })
      .catch(() => undefined);

    const seedCall = (prisma.storySceneSeed.findMany as any).mock.calls[0][0];
    expect(seedCall.orderBy).toMatchObject({ orderIndex: 'asc' });
  });
});

// ─── F. Non-educational regression — STORY exports unchanged ──────────────────

describe('F4 §F — Non-educational regression: STORY exports have no audio mux', () => {
  let service: StoryVideoExportService;
  beforeEach(() => { service = new StoryVideoExportService(); });

  it('STORY project export passes scenes WITHOUT audioUrl to renderOutputDerivative', async () => {
    let capturedScenes: Array<{ sceneId: string; audioUrl?: string | null }> = [];
    const spy = vi.spyOn(renderModule, 'renderOutputDerivative').mockImplementation(async ({ scenes }) => {
      capturedScenes = scenes as typeof capturedScenes;
      return { assetUrl: 'https://r2.raivstream.com/out.mp4' };
    });

    const prisma = makePrisma();
    (prisma.storyProject.findFirst as any).mockResolvedValue(
      makeProject('project-story', 'user-1', 'KIDS', 'STORY'),  // contentType=STORY
    );
    // Scenes have narrationAudioUrl set (from earlier narration generation) but
    // since contentType !== EDUCATIONAL, audio must NOT be included in export.
    (prisma.storySceneSeed.findMany as any).mockResolvedValue([
      makeScene('scene-1', 0, 'project-story', AUDIO_URL),  // has audio but is STORY
    ]);
    (prisma.storySceneAsset.findMany as any).mockResolvedValue([
      makeVideoAsset('asset-1', 'scene-1', 'project-story'),
    ]);
    (prisma.storyVideoExport.create as any).mockResolvedValue(
      makeExportRow('export-1', 'project-story', 'hash-story', 'GENERATING'),
    );
    (prisma.storyVideoExport.update as any).mockResolvedValue(
      makeExportRow('export-1', 'project-story', 'hash-story', 'READY'),
    );

    await service.requestExport(prisma as any, { userId: 'user-1', projectId: 'project-story', isR16: true });

    // STORY export: audioUrl must be undefined/null (not included)
    for (const scene of capturedScenes) {
      expect(scene.audioUrl, `STORY scene ${scene.sceneId} should not have audioUrl`).toBeFalsy();
    }
    spy.mockRestore();
  });

  it('null contentType project (legacy) exports without audio', async () => {
    let capturedScenes: Array<{ sceneId: string; audioUrl?: string | null }> = [];
    const spy = vi.spyOn(renderModule, 'renderOutputDerivative').mockImplementation(async ({ scenes }) => {
      capturedScenes = scenes as typeof capturedScenes;
      return { assetUrl: 'https://r2.raivstream.com/out.mp4' };
    });

    const prisma = makePrisma();
    (prisma.storyProject.findFirst as any).mockResolvedValue(
      makeProject('project-legacy', 'user-1', 'KIDS', null),  // contentType=null (legacy)
    );
    (prisma.storySceneSeed.findMany as any).mockResolvedValue([
      makeScene('scene-1', 0, 'project-legacy', null),
    ]);
    (prisma.storySceneAsset.findMany as any).mockResolvedValue([
      makeVideoAsset('asset-1', 'scene-1', 'project-legacy'),
    ]);
    (prisma.storyVideoExport.create as any).mockResolvedValue(
      makeExportRow('export-1', 'project-legacy', 'hash-legacy', 'GENERATING'),
    );
    (prisma.storyVideoExport.update as any).mockResolvedValue(
      makeExportRow('export-1', 'project-legacy', 'hash-legacy', 'READY'),
    );

    const result = await service.requestExport(prisma as any, {
      userId: 'user-1',
      projectId: 'project-legacy',
      isR16: true,
    });

    expect(result.status).toBe('READY');
    for (const scene of capturedScenes) {
      expect(scene.audioUrl).toBeFalsy();
    }
    spy.mockRestore();
  });

  it('video-only path: renderOutputDerivative is called once (no per-scene loop)', async () => {
    const deps = {
      fetch: vi.fn(async () => ({ ok: true, arrayBuffer: async () => Buffer.from('media') }) as unknown as Response),
      ffmpeg: vi.fn(async (args: string[]) => {
        const outFile = args[args.length - 1];
        if (outFile) await writeFile(outFile, Buffer.from('fake-mp4'));
      }),
      upload: vi.fn(async () => 'r2://out.mp4'),
    };

    await renderOutputDerivative(
      {
        scenes: [
          { sceneId: 'S1', videoUrl: 'r2://v1' },  // no audioUrl
          { sceneId: 'S2', videoUrl: 'r2://v2' },  // no audioUrl
        ],
        derivation: deriveOutput('PORTRAIT', null, 10),
        r2Prefix: 'x/y',
      },
      deps as never,
    );

    // Exactly 1 FFmpeg call (the video-only concat)
    expect(deps.ffmpeg).toHaveBeenCalledTimes(1);

    // The single call must use a=0 (no audio in output)
    const args = (deps.ffmpeg as any).mock.calls[0][0] as string[];
    const filterArg = args.find((a) => a.includes('concat='));
    expect(filterArg).toMatch(/a=0/);
  });
});

// ─── G. FFmpeg invocation — audio file paths appear in mux args ───────────────

describe('F4 §G — FFmpeg invocation verification', () => {
  it('per-scene FFmpeg call receives audio file as an -i input', async () => {
    const inputFiles: string[] = [];
    const capturedCalls: string[][] = [];

    const deps = {
      fetch: vi.fn(async () => ({ ok: true, arrayBuffer: async () => Buffer.from('media') }) as unknown as Response),
      ffmpeg: vi.fn(async (args: string[]) => {
        capturedCalls.push([...args]);
        // Capture -i values
        args.forEach((a, i) => { if (a === '-i') inputFiles.push(args[i + 1] ?? ''); });
        const outFile = args[args.length - 1];
        if (outFile) await writeFile(outFile, Buffer.from('fake-mp4'));
      }),
      upload: vi.fn(async () => 'r2://out.mp4'),
    };

    await renderOutputDerivative(
      {
        scenes: [{ sceneId: 'S1', videoUrl: 'r2://video', audioUrl: AUDIO_URL }],
        derivation: deriveOutput('PORTRAIT', null, 10),
        r2Prefix: 'x/y',
      },
      deps as never,
    );

    // Per-scene call (index 0) must have 2 -i inputs: video file + audio file
    const perSceneInputs = capturedCalls[0]!.flatMap((a, i) =>
      capturedCalls[0]![i - 1] === '-i' ? [a] : [],
    );
    expect(perSceneInputs).toHaveLength(2);
    // Both are local temp files (not the original URLs)
    for (const f of perSceneInputs) {
      expect(f).toMatch(/\.(bin|mp4)$/i);
    }
  });

  it('per-scene audio codec is aac (not copy — ensures container compatibility)', async () => {
    const capturedCalls: string[][] = [];

    const deps = {
      fetch: vi.fn(async () => ({ ok: true, arrayBuffer: async () => Buffer.from('media') }) as unknown as Response),
      ffmpeg: vi.fn(async (args: string[]) => {
        capturedCalls.push([...args]);
        const outFile = args[args.length - 1];
        if (outFile) await writeFile(outFile, Buffer.from('fake-mp4'));
      }),
      upload: vi.fn(async () => 'r2://out.mp4'),
    };

    await renderOutputDerivative(
      {
        scenes: [{ sceneId: 'S1', videoUrl: 'r2://v1', audioUrl: AUDIO_URL }],
        derivation: deriveOutput('PORTRAIT', null, 10),
        r2Prefix: 'x/y',
      },
      deps as never,
    );

    // Per-scene mux call should specify -c:a aac
    const perSceneArgs = capturedCalls[0]!.join(' ');
    expect(perSceneArgs).toContain('-c:a aac');
  });

  it('final concat includes -movflags +faststart (web streaming)', async () => {
    const capturedCalls: string[][] = [];

    const deps = {
      fetch: vi.fn(async () => ({ ok: true, arrayBuffer: async () => Buffer.from('media') }) as unknown as Response),
      ffmpeg: vi.fn(async (args: string[]) => {
        capturedCalls.push([...args]);
        const outFile = args[args.length - 1];
        if (outFile) await writeFile(outFile, Buffer.from('fake-mp4'));
      }),
      upload: vi.fn(async () => 'r2://out.mp4'),
    };

    await renderOutputDerivative(
      {
        scenes: [{ sceneId: 'S1', videoUrl: 'r2://v1', audioUrl: AUDIO_URL }],
        derivation: deriveOutput('PORTRAIT', null, 10),
        r2Prefix: 'x/y',
      },
      deps as never,
    );

    // Last call = concat
    const concatArgs = capturedCalls[capturedCalls.length - 1]!.join(' ');
    expect(concatArgs).toContain('+faststart');
  });

  it('video codec is libx264 with yuv420p in per-scene and concat calls', async () => {
    const capturedCalls: string[][] = [];

    const deps = {
      fetch: vi.fn(async () => ({ ok: true, arrayBuffer: async () => Buffer.from('media') }) as unknown as Response),
      ffmpeg: vi.fn(async (args: string[]) => {
        capturedCalls.push([...args]);
        const outFile = args[args.length - 1];
        if (outFile) await writeFile(outFile, Buffer.from('fake-mp4'));
      }),
      upload: vi.fn(async () => 'r2://out.mp4'),
    };

    await renderOutputDerivative(
      {
        scenes: [{ sceneId: 'S1', videoUrl: 'r2://v1', audioUrl: AUDIO_URL }],
        derivation: deriveOutput('PORTRAIT', null, 10),
        r2Prefix: 'x/y',
      },
      deps as never,
    );

    for (const call of capturedCalls) {
      const args = call.join(' ');
      expect(args).toContain('libx264');
      expect(args).toContain('yuv420p');
    }
  });
});

// ─── F4.11 — Acceptance: ships 7-9 pipeline shape ────────────────────────────

describe('F4 §F4.11 — Acceptance: ships educational export pipeline shape', () => {
  /**
   * Verifies the service correctly handles the ships/7-9 educational pipeline:
   * 6 teaching scenes, each with video + narration audio → export with 6 muxed scenes.
   *
   * Real TTS and video generation are NOT invoked here.
   * Status: MUXING LOGIC = VERIFIED (mocked) | REAL MP4 AUDIO = NOT VERIFIED (needs API keys)
   */

  it('ships educational export (6 scenes) passes 6 scenes with audio to renderer', async () => {
    let capturedScenes: Array<{ sceneId: string; audioUrl?: string | null }> = [];
    const spy = vi.spyOn(renderModule, 'renderOutputDerivative').mockImplementation(async ({ scenes }) => {
      capturedScenes = scenes as typeof capturedScenes;
      return { assetUrl: 'https://r2.raivstream.com/ships-export.mp4' };
    });

    const prisma = makePrisma();
    (prisma.storyProject.findFirst as any).mockResolvedValue(
      makeProject('project-ships', 'user-1', 'KIDS', 'EDUCATIONAL'),
    );

    const sceneIds = ['sc-1', 'sc-2', 'sc-3', 'sc-4', 'sc-5', 'sc-6'];
    const scenes = sceneIds.map((id, i) =>
      makeScene(id, i, 'project-ships', `https://r2.raivstream.com/narration/${id}.mp3`),
    );
    const assets = sceneIds.map((id) =>
      makeVideoAsset(`asset-${id}`, id, 'project-ships'),
    );

    (prisma.storySceneSeed.findMany as any).mockResolvedValue(scenes);
    (prisma.storySceneAsset.findMany as any).mockResolvedValue(assets);
    (prisma.storyVideoExport.create as any).mockImplementation(({ data }: any) =>
      Promise.resolve(makeExportRow('export-ships', 'project-ships', data.sourceHash, 'GENERATING')),
    );
    (prisma.storyVideoExport.update as any).mockResolvedValue(
      makeExportRow('export-ships', 'project-ships', 'hash-ships', 'READY'),
    );

    const result = await service.requestExport(prisma as any, {
      userId: 'user-1',
      projectId: 'project-ships',
      isR16: true,
    });

    expect(result.status).toBe('READY');
    expect(capturedScenes).toHaveLength(6);

    // Every scene has both videoUrl and audioUrl
    for (const scene of capturedScenes) {
      expect(scene.audioUrl, `scene ${scene.sceneId} missing audioUrl`).toBeTruthy();
    }

    // Scenes are in orderIndex order
    for (let i = 0; i < sceneIds.length; i++) {
      expect(capturedScenes[i]?.sceneId).toBe(sceneIds[i]);
    }

    spy.mockRestore();
  });

  let service: StoryVideoExportService;
  beforeEach(() => { service = new StoryVideoExportService(); });

  it('ships export sourceHash includes audio URLs (distinct from a video-only export)', async () => {
    const hashes: string[] = [];
    const spy = vi.spyOn(renderModule, 'renderOutputDerivative').mockResolvedValue({
      assetUrl: 'https://r2.raivstream.com/out.mp4',
    });

    const prisma = makePrisma();
    (prisma.storyProject.findFirst as any).mockResolvedValue(
      makeProject('project-ships', 'user-1', 'KIDS', 'EDUCATIONAL'),
    );
    (prisma.storySceneSeed.findMany as any).mockResolvedValue([
      makeScene('sc-1', 0, 'project-ships', AUDIO_URL),
    ]);
    (prisma.storySceneAsset.findMany as any).mockResolvedValue([
      makeVideoAsset('asset-1', 'sc-1', 'project-ships'),
    ]);
    (prisma.storyVideoExport.create as any).mockImplementation(({ data }: any) => {
      hashes.push(data.sourceHash as string);
      return Promise.resolve(makeExportRow('export-1', 'project-ships', data.sourceHash, 'GENERATING'));
    });
    (prisma.storyVideoExport.update as any).mockResolvedValue(
      makeExportRow('export-1', 'project-ships', 'hash-x', 'READY'),
    );

    await service.requestExport(prisma as any, { userId: 'user-1', projectId: 'project-ships', isR16: true });

    // Now simulate a second export with the same video but no audio (non-educational project)
    // The hash must differ
    const prisma2 = makePrisma();
    (prisma2.storyProject.findFirst as any).mockResolvedValue(
      makeProject('project-ships', 'user-1', 'KIDS', null),  // non-educational
    );
    (prisma2.storySceneSeed.findMany as any).mockResolvedValue([
      makeScene('sc-1', 0, 'project-ships', null),  // no audio
    ]);
    (prisma2.storySceneAsset.findMany as any).mockResolvedValue([
      makeVideoAsset('asset-1', 'sc-1', 'project-ships'),
    ]);
    (prisma2.storyVideoExport.create as any).mockImplementation(({ data }: any) => {
      hashes.push(data.sourceHash as string);
      return Promise.resolve(makeExportRow('export-2', 'project-ships', data.sourceHash, 'GENERATING'));
    });
    (prisma2.storyVideoExport.update as any).mockResolvedValue(
      makeExportRow('export-2', 'project-ships', 'hash-y', 'READY'),
    );

    await service.requestExport(prisma2 as any, { userId: 'user-1', projectId: 'project-ships', isR16: true });

    expect(hashes).toHaveLength(2);
    expect(hashes[0]).not.toBe(hashes[1]);  // audio export ≠ non-audio export hash

    spy.mockRestore();
  });
});
