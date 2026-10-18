import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PrismaClient } from '@raivstream/database';
import { writeFile } from 'node:fs/promises';
import type { OutputRenderDeps } from '../../creative/output/render';

/**
 * D-033 queue boundary.
 *
 * The inline runner seam (src/test/setupExportRunner.ts) makes most service
 * tests exercise enqueue→render together. These tests disable that seam
 * (`__setExportRunnerForTests(null)`) and mock the queue, so they assert the
 * contract with the worker: what is enqueued, when, and that a replay does not
 * double-render.
 *
 * The renderer is injected through `deps` rather than module-mocked: the setup
 * file loads the service before per-file mocks are registered, so module-level
 * mocking of its dependencies would not apply.
 */

const { enqueueMock } = vi.hoisted(() => ({ enqueueMock: vi.fn(async () => 'job-1') }));

vi.mock('../index', () => ({
  enqueueStoryExport: enqueueMock,
  STORY_EXPORT_QUEUE: 'export.story',
}));

import { __setExportRunnerForTests, storyVideoExportService } from '../../story/storyVideoExportService';
import { handleStoryExportJob } from '../exportJob';

const MINUTE = 60_000;

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'export-1',
    projectId: 'proj-1',
    userId: 'user-1',
    status: 'PENDING',
    sourceHash: 'hash-1',
    sceneIds: ['scene-1'],
    assetUrl: null,
    r2Key: null,
    durationSeconds: null,
    widthPx: null,
    heightPx: null,
    errorMessage: null,
    endCardApplied: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    completedAt: null,
    ...overrides,
  };
}

function makePrisma(seed: { row?: Record<string, unknown> | null } = {}) {
  const state = {
    row: seed.row === undefined ? null : seed.row,
    updates: [] as Array<Record<string, unknown>>,
  };

  const prisma = {
    state,
    storyProject: {
      // findFirst serves both the request validation and the job's lookup.
      findFirst: async () => ({ audienceMode: 'KIDS', backgroundMusicUrl: null, contentType: 'STORY' }),
    },
    storySceneSeed: {
      findMany: async () => [
        { id: 'scene-1', orderIndex: 0, title: 'S1', narrationAudioUrl: null },
      ],
    },
    storySceneAsset: {
      findMany: async () => [
        { id: 'asset-1', sceneId: 'scene-1', assetUrl: 'https://cdn.test/scene-1.mp4', durationSeconds: 5 },
      ],
    },
    user: { findUnique: async () => ({ username: 'creator' }) },
    storyVideoExport: {
      findFirst: async () => state.row,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.row = makeRow({ ...data, id: 'export-1' });
        return state.row;
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        state.updates.push(data);
        state.row = { ...(state.row ?? makeRow()), ...data, updatedAt: new Date() };
        return state.row;
      },
    },
  };

  return prisma as unknown as PrismaClient & { state: typeof state };
}

/** Deterministic render dependencies — no network, no real ffmpeg. */
function renderDeps(overrides: Partial<OutputRenderDeps> = {}): OutputRenderDeps {
  return {
    fetch: vi.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response)) as unknown as typeof fetch,
    ffmpeg: vi.fn(async (args: string[]) => {
      const out = [...args].reverse().find((a) => a.endsWith('.mp4'));
      if (out) await writeFile(out, Buffer.alloc(8, 0x00));
    }),
    upload: vi.fn(async () => 'https://cdn.test/out.mp4'),
    endCardPreflight: async () => ({ drawtext: true, font: true, ok: true }),
    ...overrides,
  };
}

beforeEach(() => {
  enqueueMock.mockClear();
  __setExportRunnerForTests(null);
});

describe('D-033 export job — queue boundary', () => {
  it('1. enqueues a new export once and returns PENDING without rendering', async () => {
    const prisma = makePrisma();

    const result = await storyVideoExportService.requestExport(prisma, {
      userId: 'user-1',
      projectId: 'proj-1',
      isR16: true,
    });

    expect(result.status).toBe('PENDING');
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(enqueueMock).toHaveBeenCalledWith('export-1');
    // The web process creates the row as PENDING and issues no further write —
    // the GENERATING transition belongs to the worker.
    expect(prisma.state.row?.status).toBe('PENDING');
    expect(prisma.state.updates).toHaveLength(0);
  });

  it('2. replay: the handler on a READY row is a no-op (no write)', async () => {
    const prisma = makePrisma({ row: makeRow({ status: 'READY', assetUrl: 'https://cdn.test/out.mp4' }) });

    await handleStoryExportJob(prisma, { exportId: 'export-1' });
    await handleStoryExportJob(prisma, { exportId: 'export-1' });

    expect(prisma.state.updates).toHaveLength(0);
    expect(prisma.state.row?.status).toBe('READY');
  });

  it('3. FAILED row is requeued by requestExport, then the job drives PENDING → GENERATING → READY', async () => {
    const prisma = makePrisma({
      row: makeRow({ status: 'FAILED', errorMessage: 'boom', updatedAt: new Date(Date.now() - 2 * MINUTE) }),
    });

    const result = await storyVideoExportService.requestExport(prisma, {
      userId: 'user-1', projectId: 'proj-1', isR16: true,
    });
    expect(result.status).toBe('PENDING');
    expect(enqueueMock).toHaveBeenCalledWith('export-1');

    const final = await storyVideoExportService.runExportJob(
      prisma,
      { exportId: 'export-1' },
      renderDeps(),
      prisma.state.row as never,
    );

    expect(final.status).toBe('READY');
    const statuses = prisma.state.updates.map((u) => u.status).filter(Boolean);
    expect(statuses).toEqual(['PENDING', 'GENERATING', 'READY']);
  });

  it('4. stuck GENERATING (31 min) is reset to PENDING and requeued', async () => {
    const prisma = makePrisma({
      row: makeRow({ status: 'GENERATING', updatedAt: new Date(Date.now() - 31 * MINUTE) }),
    });

    const result = await storyVideoExportService.requestExport(prisma, {
      userId: 'user-1', projectId: 'proj-1', isR16: true,
    });

    expect(result.status).toBe('PENDING');
    expect(enqueueMock).toHaveBeenCalledTimes(1);
  });

  it('5. fresh GENERATING (5 min) is returned as-is and NOT requeued', async () => {
    const prisma = makePrisma({
      row: makeRow({ status: 'GENERATING', updatedAt: new Date(Date.now() - 5 * MINUTE) }),
    });

    const result = await storyVideoExportService.requestExport(prisma, {
      userId: 'user-1', projectId: 'proj-1', isR16: true,
    });

    expect(result.status).toBe('GENERATING');
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('6. a project with no narration still renders and reaches READY (D-030)', async () => {
    const prisma = makePrisma({ row: makeRow({ status: 'PENDING' }) });

    const final = await storyVideoExportService.runExportJob(
      prisma,
      { exportId: 'export-1' },
      renderDeps(),
      prisma.state.row as never,
    );

    expect(final.status).toBe('READY');
    expect(prisma.state.row?.status).toBe('READY');
  });

  it('7. a render failure marks the row FAILED with the error message', async () => {
    const prisma = makePrisma({ row: makeRow({ status: 'PENDING' }) });

    const deps = renderDeps({
      ffmpeg: vi.fn(async () => { throw new Error('ffmpeg exited with 1: disc full'); }),
    });

    const final = await storyVideoExportService.runExportJob(
      prisma,
      { exportId: 'export-1' },
      deps,
      prisma.state.row as never,
    );

    expect(final.status).toBe('FAILED');
    expect(String(prisma.state.row?.errorMessage)).toContain('disc full');
  });
});
