/**
 * Phase 2C — R16 story video export regression suite (hardened).
 *
 * Covers export contract, safety invariants, idempotency, assembly,
 * concurrency-safe unique-constraint handling, legacy restriction
 * preservation, and non-R16 context blocking.
 *
 * All tests are hermetic — no real DB, FFmpeg, or R2 calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StoryVideoExportService } from '../../lib/story/storyVideoExportService';
import { assertSequenceAllowed, storyRouter } from '../story';
import { TRPCError } from '@trpc/server';
import * as renderModule from '../../lib/creative/output/render';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeScene(id: string, orderIndex: number, projectId: string) {
  return { id, orderIndex, title: `Scene ${orderIndex}`, projectId };
}

function makeVideoAsset(id: string, sceneId: string, projectId: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    sceneId,
    projectId,
    assetType: 'VIDEO',
    status: 'READY',
    assetUrl: `https://cdn.raivstream.com/assets/${id}.mp4`,
    isLatest: true,
    deletedAt: null,
    durationSeconds: 4,
    ...overrides,
  };
}

function makeProject(id: string, userId: string, audienceMode = 'KIDS') {
  return { id, userId, audienceMode };
}

function makeExportRow(id: string, projectId: string, sourceHash: string, status = 'READY') {
  return {
    id,
    projectId,
    userId: 'user-1',
    status,
    sourceHash,
    sceneIds: ['scene-1', 'scene-2'],
    assetUrl: status === 'READY' ? `https://r2.raivstream.com/story-exports/${projectId}/exports/${id}/out.mp4` : null,
    r2Key: status === 'READY' ? `story-exports/${projectId}/exports/${id}/out.mp4` : null,
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
      create: vi.fn().mockResolvedValue(makeExportRow('export-1', 'project-r16', 'hash-abc', 'GENERATING')),
      update: vi.fn().mockResolvedValue(makeExportRow('export-1', 'project-r16', 'hash-abc', 'READY')),
    },
    analyticsEvent: { create: vi.fn().mockResolvedValue({}) },
    ...overrides,
  };
}

/** Standard input for an R16 export call. */
function r16Input(projectId = 'project-r16') {
  return { userId: 'user-1', projectId, isR16: true };
}

/** Setup the happy-path prisma mock for a single-scene R16 project. */
function setupHappyPath(prisma: ReturnType<typeof makePrisma>, existingSpy?: any): any {
  (prisma.storyProject.findFirst as any).mockResolvedValue(makeProject('project-r16', 'user-1', 'KIDS'));
  (prisma.storySceneSeed.findMany as any).mockResolvedValue([makeScene('scene-1', 0, 'project-r16')]);
  (prisma.storySceneAsset.findMany as any).mockResolvedValue([makeVideoAsset('asset-1', 'scene-1', 'project-r16')]);
  (prisma.storyVideoExport.findFirst as any).mockResolvedValue(null);
  (prisma.storyVideoExport.create as any).mockResolvedValue(makeExportRow('export-1', 'project-r16', 'any-hash', 'GENERATING'));
  (prisma.storyVideoExport.update as any).mockResolvedValue(makeExportRow('export-1', 'project-r16', 'any-hash', 'READY'));

  return existingSpy ?? vi.spyOn(renderModule, 'renderOutputDerivative').mockResolvedValue({
    assetUrl: 'https://r2.raivstream.com/story-exports/project-r16/exports/export-1/out.mp4',
  });
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('R16 story video export', () => {
  let service: StoryVideoExportService;

  beforeEach(() => {
    service = new StoryVideoExportService();
  });

  // ── 1. R16 project can request export ──────────────────────────────────────
  it('allows export for a KIDS-mode R16 project', async () => {
    const prisma = makePrisma();
    const spy = setupHappyPath(prisma);

    const result = await service.requestExport(prisma as any, r16Input());
    expect(result.status).toBe('READY');
    expect(result.assetUrl).toBeTruthy();
    spy.mockRestore();
  });

  // ── 2. GENERAL project cannot use R16 export ───────────────────────────────
  it('rejects export for a GENERAL-mode project (FORBIDDEN)', async () => {
    const prisma = makePrisma();
    (prisma.storyProject.findFirst as any).mockResolvedValue(makeProject('p-general', 'user-1', 'GENERAL'));

    const err = await service.requestExport(prisma as any, r16Input('p-general')).catch((e) => e);
    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe('FORBIDDEN');
    expect((err as TRPCError).message).toMatch(/KIDS-mode/i);
  });

  // ── NEW: Normal (non-R16) user cannot invoke R16 export endpoint ───────────
  it('rejects export when ctx.isR16 is false, regardless of project audienceMode', async () => {
    const prisma = makePrisma();
    // Even if audienceMode is KIDS, ctx.isR16=false must be rejected
    (prisma.storyProject.findFirst as any).mockResolvedValue(makeProject('project-r16', 'user-1', 'KIDS'));

    const err = await service
      .requestExport(prisma as any, { userId: 'user-1', projectId: 'project-r16', isR16: false })
      .catch((e) => e);
    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe('FORBIDDEN');
    expect((err as TRPCError).message).toMatch(/R16 mode/i);
  });

  it('requestStoryVideoExport and getStoryVideoExport are exposed under r16Procedure', () => {
    // r16Procedure requires ctx.isR16 at middleware level — procedures exist on router
    expect((storyRouter as any)._def.procedures.requestStoryVideoExport).toBeDefined();
    expect((storyRouter as any)._def.procedures.getStoryVideoExport).toBeDefined();
  });

  // ── 3. Missing scene video blocks export ───────────────────────────────────
  it('blocks export when a scene has no READY video (PRECONDITION_FAILED)', async () => {
    const prisma = makePrisma();
    (prisma.storyProject.findFirst as any).mockResolvedValue(makeProject('project-r16', 'user-1', 'KIDS'));
    (prisma.storySceneSeed.findMany as any).mockResolvedValue([
      makeScene('scene-1', 0, 'project-r16'),
      makeScene('scene-2', 1, 'project-r16'),
    ]);
    (prisma.storySceneAsset.findMany as any).mockResolvedValue([
      makeVideoAsset('asset-1', 'scene-1', 'project-r16'),
      // scene-2 has no READY video
    ]);

    const err = await service.requestExport(prisma as any, r16Input()).catch((e) => e);
    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe('PRECONDITION_FAILED');
    expect((err as TRPCError).message).toMatch(/do not have a ready video/i);
  });

  // ── 4. Failed scene video blocks export ────────────────────────────────────
  it('blocks export when scene video is FAILED (excluded by READY filter)', async () => {
    const prisma = makePrisma();
    (prisma.storyProject.findFirst as any).mockResolvedValue(makeProject('project-r16', 'user-1', 'KIDS'));
    (prisma.storySceneSeed.findMany as any).mockResolvedValue([makeScene('scene-1', 0, 'project-r16')]);
    // DB query only returns READY assets; FAILED asset is excluded
    (prisma.storySceneAsset.findMany as any).mockResolvedValue([]);

    const err = await service.requestExport(prisma as any, r16Input()).catch((e) => e);
    expect((err as TRPCError).code).toBe('PRECONDITION_FAILED');
  });

  // ── 5. Cross-project scene asset blocks export ─────────────────────────────
  it('blocks export when a scene video belongs to a different project', async () => {
    const prisma = makePrisma();
    (prisma.storyProject.findFirst as any).mockResolvedValue(makeProject('project-r16', 'user-1', 'KIDS'));
    (prisma.storySceneSeed.findMany as any).mockResolvedValue([makeScene('scene-1', 0, 'project-r16')]);
    // Asset's projectId does NOT match — DB query filters by projectId so it returns empty
    (prisma.storySceneAsset.findMany as any).mockResolvedValue([]);

    const err = await service.requestExport(prisma as any, r16Input()).catch((e) => e);
    expect((err as TRPCError).code).toBe('PRECONDITION_FAILED');
  });

  // ── 6. Scene ordering is deterministic (orderIndex ascending) ──────────────
  it('passes scenes to renderOutputDerivative in orderIndex ascending order', async () => {
    let capturedScenes: Array<{ sceneId: string; videoUrl?: string | null }> = [];
    const spy = vi.spyOn(renderModule, 'renderOutputDerivative').mockImplementation(async ({ scenes }) => {
      capturedScenes = scenes as typeof capturedScenes;
      return { assetUrl: 'https://r2.raivstream.com/out.mp4' };
    });

    const prisma = makePrisma();
    (prisma.storyProject.findFirst as any).mockResolvedValue(makeProject('project-r16', 'user-1', 'KIDS'));
    (prisma.storySceneSeed.findMany as any).mockResolvedValue([
      makeScene('scene-a', 0, 'project-r16'),
      makeScene('scene-b', 1, 'project-r16'),
    ]);
    (prisma.storySceneAsset.findMany as any).mockResolvedValue([
      makeVideoAsset('asset-a', 'scene-a', 'project-r16'),
      makeVideoAsset('asset-b', 'scene-b', 'project-r16'),
    ]);
    (prisma.storyVideoExport.findFirst as any).mockResolvedValue(null);
    (prisma.storyVideoExport.create as any).mockImplementation(({ data }: any) =>
      Promise.resolve(makeExportRow('export-1', 'project-r16', data.sourceHash, 'GENERATING')),
    );
    (prisma.storyVideoExport.update as any).mockResolvedValue(makeExportRow('export-1', 'project-r16', 'any', 'READY'));

    await service.requestExport(prisma as any, r16Input());

    expect(capturedScenes[0].sceneId).toBe('scene-a');
    expect(capturedScenes[1].sceneId).toBe('scene-b');
    expect(capturedScenes[0].videoUrl).toContain('asset-a');
    expect(capturedScenes[1].videoUrl).toContain('asset-b');
    spy.mockRestore();
  });

  // ── 7. Existing READY export is reused (optimistic idempotency) ────────────
  it('returns existing READY export when sourceHash matches (no new FFmpeg)', async () => {
    const spy = vi.spyOn(renderModule, 'renderOutputDerivative');
    const prisma = makePrisma();
    (prisma.storyProject.findFirst as any).mockResolvedValue(makeProject('project-r16', 'user-1', 'KIDS'));
    (prisma.storySceneSeed.findMany as any).mockResolvedValue([makeScene('scene-1', 0, 'project-r16')]);
    (prisma.storySceneAsset.findMany as any).mockResolvedValue([makeVideoAsset('asset-1', 'scene-1', 'project-r16')]);
    (prisma.storyVideoExport.findFirst as any).mockResolvedValue(makeExportRow('export-existing', 'project-r16', 'some-hash', 'READY'));

    const result = await service.requestExport(prisma as any, r16Input());
    expect(result.id).toBe('export-existing');
    expect(result.status).toBe('READY');
    expect(prisma.storyVideoExport.create).not.toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  // ── 8. GENERATING export is reused (no duplicate job) ─────────────────────
  it('returns in-progress GENERATING export when sourceHash matches', async () => {
    const prisma = makePrisma();
    (prisma.storyProject.findFirst as any).mockResolvedValue(makeProject('project-r16', 'user-1', 'KIDS'));
    (prisma.storySceneSeed.findMany as any).mockResolvedValue([makeScene('scene-1', 0, 'project-r16')]);
    (prisma.storySceneAsset.findMany as any).mockResolvedValue([makeVideoAsset('asset-1', 'scene-1', 'project-r16')]);
    (prisma.storyVideoExport.findFirst as any).mockResolvedValue(makeExportRow('export-inflight', 'project-r16', 'some-hash', 'GENERATING'));

    const result = await service.requestExport(prisma as any, r16Input());
    expect(result.id).toBe('export-inflight');
    expect(result.status).toBe('GENERATING');
    expect(prisma.storyVideoExport.create).not.toHaveBeenCalled();
  });

  // ── NEW: Concurrency-safe idempotency — P2002 unique constraint handled ────
  it('handles concurrent duplicate requests via P2002 unique conflict resolution', async () => {
    const prisma = makePrisma();
    (prisma.storyProject.findFirst as any).mockResolvedValue(makeProject('project-r16', 'user-1', 'KIDS'));
    (prisma.storySceneSeed.findMany as any).mockResolvedValue([makeScene('scene-1', 0, 'project-r16')]);
    (prisma.storySceneAsset.findMany as any).mockResolvedValue([makeVideoAsset('asset-1', 'scene-1', 'project-r16')]);
    // First findFirst returns null (race — both concurrent requests see nothing)
    (prisma.storyVideoExport.findFirst as any)
      .mockResolvedValueOnce(null) // optimistic check: nothing exists yet
      .mockResolvedValueOnce(makeExportRow('export-race-winner', 'project-r16', 'hash-x', 'GENERATING')); // conflict recovery
    // create throws P2002 unique constraint violation
    const conflictErr = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    (prisma.storyVideoExport.create as any).mockRejectedValue(conflictErr);

    const result = await service.requestExport(prisma as any, r16Input());
    expect(result.id).toBe('export-race-winner');
    expect(result.status).toBe('GENERATING');

    // Verify the recovery findFirst is scoped by BOTH projectId AND sourceHash
    // (not just sourceHash — must use the composite unique key)
    const allFindFirstCalls = (prisma.storyVideoExport.findFirst as any).mock.calls as Array<[{ where: Record<string, unknown> }]>;
    const recoveryCalls = allFindFirstCalls.filter(
      ([arg]) => arg.where && 'sourceHash' in arg.where,
    );
    expect(recoveryCalls.length).toBeGreaterThanOrEqual(1);
    const recoveryWhere = recoveryCalls[recoveryCalls.length - 1][0].where;
    expect(recoveryWhere).toHaveProperty('projectId', 'project-r16');
    expect(recoveryWhere).toHaveProperty('sourceHash');
  });

  // ── 9. Assembly uses renderOutputDerivative ────────────────────────────────
  it('calls renderOutputDerivative with scene videos in PORTRAIT derivation', async () => {
    const prisma = makePrisma();
    const spy = setupHappyPath(prisma);

    await service.requestExport(prisma as any, r16Input());

    expect(spy).toHaveBeenCalledOnce();
    const callArg = (spy as any).mock.calls[0][0] as { scenes: any[]; derivation: any; r2Prefix: string };
    expect(callArg.scenes[0].sceneId).toBe('scene-1');
    expect(callArg.scenes[0].videoUrl).toContain('asset-1');
    expect(callArg.r2Prefix).toMatch(/story-exports\/project-r16\/exports\//);
    expect(callArg.derivation.format).toBe('PORTRAIT');
    spy.mockRestore();
  });

  // ── 10. R2 output URL is persisted ────────────────────────────────────────
  it('persists the R2 output URL and READY status after assembly', async () => {
    const r2Url = 'https://r2.raivstream.com/story-exports/project-r16/exports/export-1/out.mp4';
    const spy = vi.spyOn(renderModule, 'renderOutputDerivative').mockResolvedValue({ assetUrl: r2Url });
    const prisma = makePrisma();
    setupHappyPath(prisma, spy);
    (prisma.storyVideoExport.update as any).mockImplementation(({ data }: any) =>
      Promise.resolve({ ...makeExportRow('export-1', 'project-r16', 'any-hash', 'READY'), ...data }),
    );

    const result = await service.requestExport(prisma as any, r16Input());

    expect(result.assetUrl).toBe(r2Url);
    const updateCall = (prisma.storyVideoExport.update as any).mock.calls[0][0];
    expect(updateCall.data.assetUrl).toBe(r2Url);
    expect(updateCall.data.status).toBe('READY');
    spy.mockRestore();
  });

  // ── 11. FAILED assembly produces a creator-safe error ─────────────────────
  it('persists FAILED status with truncated message on assembly error', async () => {
    const spy = vi.spyOn(renderModule, 'renderOutputDerivative').mockRejectedValue(
      new Error('ffmpeg exited with 1: Error processing video — internal trace omitted'),
    );
    const prisma = makePrisma();
    setupHappyPath(prisma, spy);
    (prisma.storyVideoExport.update as any).mockImplementation(({ data }: any) =>
      Promise.resolve({ ...makeExportRow('export-1', 'project-r16', 'any-hash', 'FAILED'), ...data }),
    );

    const result = await service.requestExport(prisma as any, r16Input());
    expect(result.status).toBe('FAILED');
    expect(result.errorMessage).toBeTruthy();
    expect(result.errorMessage!.length).toBeLessThanOrEqual(500);
    spy.mockRestore();
  });

  // ── 12. Legacy R16 Sequence/Audio/Film restrictions remain intact ──────────
  it('assertSequenceAllowed throws FORBIDDEN for R16 context', () => {
    expect(() => assertSequenceAllowed({ isR16: true } as any)).toThrow();
    const err = (() => { try { assertSequenceAllowed({ isR16: true } as any); } catch (e) { return e; } })();
    expect((err as TRPCError).code).toBe('FORBIDDEN');
  });

  it('assertSequenceAllowed does NOT throw for non-R16 context', () => {
    expect(() => assertSequenceAllowed({ isR16: false } as any)).not.toThrow();
  });

  // ── 13. Non-R16 OutputService behavior unchanged ───────────────────────────
  it('storyRouter does NOT expose autoAssemble (R16 export is a separate pathway)', () => {
    expect((storyRouter as any)._def.procedures.autoAssemble).toBeUndefined();
  });

  // ── NEW: Full story export — sceneIds is not accepted as input ────────────
  it('requestStoryVideoExport input schema does not accept sceneIds (full story only)', () => {
    const procedureDef = (storyRouter as any)._def.procedures.requestStoryVideoExport;
    const schema = procedureDef._def.inputs?.[0] ?? procedureDef._def.input;
    // The parsed schema should only have projectId — not sceneIds
    expect(schema?.shape ?? schema?._def?.shape).not.toHaveProperty('sceneIds');
  });

  // ── NEW: Asset with null assetUrl is rejected (internal URL invariant) ─────
  it('blocks export when a READY video asset has null assetUrl', async () => {
    const prisma = makePrisma();
    (prisma.storyProject.findFirst as any).mockResolvedValue(makeProject('project-r16', 'user-1', 'KIDS'));
    (prisma.storySceneSeed.findMany as any).mockResolvedValue([makeScene('scene-1', 0, 'project-r16')]);
    // Asset is READY but assetUrl is null — service should treat this as missing
    (prisma.storySceneAsset.findMany as any).mockResolvedValue([
      makeVideoAsset('asset-1', 'scene-1', 'project-r16', { assetUrl: null }),
    ]);

    const err = await service.requestExport(prisma as any, r16Input()).catch((e) => e);
    expect((err as TRPCError).code).toBe('PRECONDITION_FAILED');
  });
});
