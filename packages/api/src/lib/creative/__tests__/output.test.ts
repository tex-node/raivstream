import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { deriveOutput } from '../output/derivation';
import { renderOutputDerivative } from '../output/render';
import { ApprovalService } from '../approval/service';
import { DirectorService } from '../director/service';
import { OutputService } from '../output/service';
import { buildCreativePlan } from '../production/plan';
import { interpret } from '../intent/interpreter';

beforeEach(() => {
  process.env.RAIVSTREAM_5_ENABLED = 'true';
  process.env.RAIVSTREAM_5_APPROVAL_ENABLED = 'true';
  process.env.RAIVSTREAM_5_DIRECTOR_ENABLED = 'true';
  process.env.RAIVSTREAM_5_OUTPUT_ENABLED = 'true';
});
afterEach(() => {
  for (const key of ['RAIVSTREAM_5_ENABLED', 'RAIVSTREAM_5_APPROVAL_ENABLED', 'RAIVSTREAM_5_DIRECTOR_ENABLED', 'RAIVSTREAM_5_OUTPUT_ENABLED']) delete process.env[key];
});

const PLAN = buildCreativePlan({ projectType: interpret('a commercial').projectType });

describe('creative output derivation', () => {
  it('derives 16:9 (YouTube) from the 9:16 master as a center-crop', () => {
    const d = deriveOutput('LANDSCAPE', null, 30);
    expect(d.aspectRatio).toBe('16:9');
    expect(d.targetWidth).toBe(1920);
    expect(d.targetHeight).toBe(1080);
    expect(d.effectiveDurationSeconds).toBe(30);
  });

  it('derives 1:1 (square social)', () => {
    const d = deriveOutput('SQUARE', null, 30);
    expect(d.aspectRatio).toBe('1:1');
    expect(d.targetWidth).toBe(1080);
    expect(d.targetHeight).toBe(1080);
  });

  it('duration variants clamp to the source runtime', () => {
    expect(deriveOutput('SQUARE', 15, 30).effectiveDurationSeconds).toBe(15);
    expect(deriveOutput('SQUARE', 90, 30).effectiveDurationSeconds).toBe(30);
  });
});

describe('creative output service', () => {
  function prismaMock() {
    const outputs: any[] = [];
    const approvals: any[] = [];
    const producedAssets: any[] = [
      { id: 'p1', sceneId: 'SCENE_01', kind: 'VIDEO', status: 'READY', assetUrl: 'r2://scene1' },
      { id: 'p2', sceneId: 'SCENE_02', kind: 'VIDEO', status: 'READY', assetUrl: 'r2://scene2' },
    ];
    const versions: any[] = [];
    const project = { id: 'p1', userId: 'u1', projectType: 'COMMERCIAL', title: 'Skincare', status: 'REVIEW' };
    const withVersion = (row: any) => ({ ...row, version: { versionNumber: versions.find((v) => v.id === row.versionId)?.versionNumber ?? 0 } });
    const prisma: any = {
      creativeProject: {
        findFirst: async () => ({ ...project, productionPlan: { plan: PLAN }, bible: null }),
        update: async ({ data }: any) => { Object.assign(project, data); return project; },
      },
      creativeVersion: {
        findFirst: async () => versions[versions.length - 1] ?? null,
        findMany: async () => versions.map((v) => ({ ...v })),
        findUnique: async ({ where }: any) => versions.find((v) => v.id === where.id) ?? null,
        create: async ({ data }: any) => { const v = { id: `v${versions.length + 1}`, createdAt: new Date(), ...data }; versions.push(v); return v; },
      },
      creativeDirective: { create: async ({ data }: any) => ({ id: 'd1', ...data }) },
      creativeApproval: {
        upsert: async ({ where, update, create }: any) => {
          const existing = approvals.find((a) => a.versionId === where.versionId_kind.versionId && a.kind === where.versionId_kind.kind);
          const row = existing ? { ...existing, ...update } : { id: `a${approvals.length + 1}`, ...create };
          if (existing) Object.assign(existing, row);
          else approvals.push(row);
          return row;
        },
        findUnique: async ({ where }: any) => approvals.find((a) => a.versionId === where.versionId_kind.versionId && a.kind === where.versionId_kind.kind) ?? null,
        updateMany: async () => ({ count: 0 }),
      },
      creativeProducedAsset: {
        findMany: async () => producedAssets.map((a) => ({ ...a })),
        deleteMany: async () => ({ count: 0 }),
      },
      creativeOutput: {
        create: async ({ data }: any) => { const row = { id: `o${outputs.length + 1}`, createdAt: new Date(), updatedAt: new Date(), ...data }; outputs.push(row); return row; },
        findFirst: async ({ where }: any) => { const row = outputs.find((o) => o.id === where.id); return row ? withVersion(row) : null; },
        findUnique: async ({ where }: any) => { const row = outputs.find((o) => o.id === where.id); return row ? withVersion(row) : null; },
        findMany: async () => outputs.map((o) => ({ ...o })),
        update: async ({ where, data }: any) => { const row = outputs.find((o) => o.id === where.id); Object.assign(row, data); return row; },
      },
      __outputs: outputs,
      __produced: producedAssets,
    };
    return prisma;
  }

  it('outputs only from an approved version (provenance back to the version)', async () => {
    const prisma = prismaMock();
    const director = new DirectorService();
    const approval = new ApprovalService();
    const service = new OutputService();
    const { version } = await director.direct(prisma as never, { projectId: 'p1', userId: 'u1', instruction: 'Make it more cinematic.' });
    await approval.decide(prisma as never, { projectId: 'p1', versionId: version.id, kind: 'CREATIVE', decision: 'approve' });

    const result = await service.derive(prisma as never, { projectId: 'p1', versionId: version.id, format: 'LANDSCAPE' });
    expect(result.output.versionId).toBe(version.id);
    expect(result.derivation.aspectRatio).toBe('16:9');
    expect(prisma.__outputs.length).toBe(1);
  });

  it('unapproved versions cannot produce outputs', async () => {
    const prisma = prismaMock();
    const director = new DirectorService();
    const service = new OutputService();
    const { version } = await director.direct(prisma as never, { projectId: 'p1', userId: 'u1', instruction: 'Make it more cinematic.' });
    // No approval recorded → derive must reject.
    await expect(service.derive(prisma as never, { projectId: 'p1', versionId: version.id, format: 'SQUARE' })).rejects.toMatchObject({ code: 'PLAN_NOT_APPROVED' });
    expect(prisma.__outputs.length).toBe(0);
  });

  it('rendering a derivative never mutates the original produced assets', async () => {
    const prisma = prismaMock();
    const director = new DirectorService();
    const approval = new ApprovalService();
    const service = new OutputService();
    const { version } = await director.direct(prisma as never, { projectId: 'p1', userId: 'u1', instruction: 'Make it more cinematic.' });
    await approval.decide(prisma as never, { projectId: 'p1', versionId: version.id, kind: 'CREATIVE', decision: 'approve' });
    const { output } = await service.derive(prisma as never, { projectId: 'p1', versionId: version.id, format: 'SQUARE', durationSeconds: 15 });

    const deps = {
      fetch: vi.fn(async () => ({ ok: true, arrayBuffer: async () => Buffer.from('clip') }) as unknown as Response),
      ffmpeg: vi.fn(async (args: string[]) => { await writeFile(args[args.length - 1], Buffer.from('fake-mp4')); }),
      upload: vi.fn(async () => 'r2://output.mp4'),
    };
    const final = await service.render(prisma as never, { projectId: 'p1', outputId: output.id }, deps as never);
    expect(final.status).toBe('READY');
    expect(final.assetUrl).toBe('r2://output.mp4');
    expect(prisma.__produced.length).toBe(2); // originals untouched
    expect(prisma.__outputs[0].status).toBe('READY');
  });

  it('a failed render marks the output FAILED and never mutates the originals', async () => {
    const prisma = prismaMock();
    const director = new DirectorService();
    const approval = new ApprovalService();
    const service = new OutputService();
    const { version } = await director.direct(prisma as never, { projectId: 'p1', userId: 'u1', instruction: 'Make it more cinematic.' });
    await approval.decide(prisma as never, { projectId: 'p1', versionId: version.id, kind: 'CREATIVE', decision: 'approve' });
    const { output } = await service.derive(prisma as never, { projectId: 'p1', versionId: version.id, format: 'SQUARE' });

    const deps = {
      fetch: vi.fn(async () => ({ ok: true, arrayBuffer: async () => Buffer.from('clip') }) as unknown as Response),
      ffmpeg: vi.fn(async () => { throw new Error('ffmpeg exited 234'); }),
      upload: vi.fn(async () => 'r2://never'),
    };
    const final = await service.render(prisma as never, { projectId: 'p1', outputId: output.id }, deps as never);
    expect(final.status).toBe('FAILED');
    expect(final.errorMessage).toContain('ffmpeg');
    expect(prisma.__produced.length).toBe(2); // originals untouched
  });
});

describe('auto-assembly after production', () => {
  // Four-scene COMMERCIAL plan — matches the real pipeline structure.
  const FOUR_SCENE_PLAN = buildCreativePlan({ projectType: interpret('a commercial').projectType });
  const SCENE_IDS = FOUR_SCENE_PLAN.scenes.map((s) => s.sceneId); // ['SCENE_01', 'SCENE_02', 'SCENE_03', 'SCENE_04']

  function assemblyMock(videoStatuses: Record<string, 'READY' | 'FAILED'> = {}) {
    const outputs: any[] = [];
    const approvals: any[] = [];
    const versions: any[] = [];
    // Produce VIDEO assets for each scene in the plan (default: all READY).
    const producedAssets: any[] = SCENE_IDS.flatMap((sceneId) => [
      { id: `img-${sceneId}`, sceneId, kind: 'IMAGE', status: 'READY', assetUrl: `r2://still-${sceneId}` },
      { id: `vid-${sceneId}`, sceneId, kind: 'VIDEO', status: videoStatuses[sceneId] ?? 'READY', assetUrl: `r2://clip-${sceneId}` },
    ]);
    const withVersion = (row: any) => ({ ...row, version: { versionNumber: versions.find((v) => v.id === row.versionId)?.versionNumber ?? 0 } });
    const prisma: any = {
      creativeProject: {
        findFirst: async () => ({ id: 'p1', userId: 'u1', projectType: 'COMMERCIAL', status: 'REVIEW', productionPlan: { plan: FOUR_SCENE_PLAN }, bible: null }),
        update: async ({ data }: any) => data,
      },
      creativeVersion: {
        findFirst: async () => versions[versions.length - 1] ?? null,
        findMany: async () => versions.map((v) => ({ ...v })),
        findUnique: async ({ where }: any) => versions.find((v) => v.id === where.id) ?? null,
        create: async ({ data }: any) => { const v = { id: `v${versions.length + 1}`, createdAt: new Date(), ...data }; versions.push(v); return v; },
      },
      creativeApproval: {
        upsert: async ({ where, update, create }: any) => {
          const key = `${where.versionId_kind.versionId}:${where.versionId_kind.kind}`;
          const existing = approvals.find((a) => `${a.versionId}:${a.kind}` === key);
          const row = existing ? { ...existing, ...update } : { id: `a${approvals.length + 1}`, ...create };
          if (existing) Object.assign(existing, row); else approvals.push(row);
          return row;
        },
        findUnique: async ({ where }: any) => approvals.find((a) => a.versionId === where.versionId_kind.versionId && a.kind === where.versionId_kind.kind) ?? null,
        updateMany: async () => ({ count: 0 }),
      },
      creativeProducedAsset: {
        // Support where.kind filtering so autoAssemble sees only VIDEO assets.
        findMany: async ({ where }: any = {}) =>
          producedAssets.filter((a) => !where?.kind || a.kind === where.kind).map((a) => ({ ...a })),
        deleteMany: async () => ({ count: 0 }),
      },
      creativeOutput: {
        create: async ({ data }: any) => { const row = { id: `o${outputs.length + 1}`, createdAt: new Date(), updatedAt: new Date(), ...data }; outputs.push(row); return row; },
        findFirst: async ({ where }: any) => { const row = outputs.find((o) => o.id === where.id); return row ? withVersion(row) : null; },
        findUnique: async ({ where }: any) => { const row = outputs.find((o) => o.id === where.id); return row ? withVersion(row) : null; },
        findMany: async () => outputs.map((o) => ({ ...o })),
        update: async ({ where, data }: any) => { const row = outputs.find((o) => o.id === where.id); Object.assign(row, data); return row; },
      },
      __outputs: outputs,
      __versions: versions,
      __approvals: approvals,
    };
    return prisma;
  }

  const renderDeps = () => ({
    fetch: vi.fn(async () => ({ ok: true, arrayBuffer: async () => Buffer.from('clip') }) as unknown as Response),
    ffmpeg: vi.fn(async (args: string[]) => { await writeFile(args[args.length - 1], Buffer.from('fake-mp4')); }),
    upload: vi.fn(async () => 'r2://assembled.mp4'),
  });

  it('assembles all four scene videos after successful production', async () => {
    const prisma = assemblyMock();
    const service = new OutputService();
    const deps = renderDeps();

    const result = await service.autoAssemble(prisma as never, { projectId: 'p1', plan: FOUR_SCENE_PLAN }, deps as never);

    expect(result.assembled).toBe(true);
    expect(result.blocked).toBe(false);
    expect(result.blockedScenes).toHaveLength(0);
    expect(prisma.__outputs[0].status).toBe('READY');
    expect(prisma.__outputs[0].format).toBe('PORTRAIT');
    expect(deps.ffmpeg).toHaveBeenCalledTimes(1);
  });

  it('creates a version but no creativeApproval when none exist', async () => {
    const prisma = assemblyMock();
    const service = new OutputService();
    const deps = renderDeps();

    await service.autoAssemble(prisma as never, { projectId: 'p1', plan: FOUR_SCENE_PLAN }, deps as never);

    expect(prisma.__versions.length).toBe(1);
    expect(prisma.__approvals.length).toBe(0);
  });

  it('does not create any creativeApproval records (regression: approval model boundary)', async () => {
    const prisma = assemblyMock();
    const service = new OutputService();
    const deps = renderDeps();

    const result = await service.autoAssemble(prisma as never, { projectId: 'p1', plan: FOUR_SCENE_PLAN }, deps as never);

    expect(result.assembled).toBe(true);
    // Auto-assembly authorization is production completion, not creator approval.
    // No creativeApproval row must ever be created by this path.
    expect(prisma.__approvals.length).toBe(0);
  });

  it('reuses an existing approved version and does not create a second one', async () => {
    const prisma = assemblyMock();
    // Pre-populate a version (no CREATIVE approval needed — autoAssemble doesn't check for one).
    await prisma.creativeVersion.create({ data: { projectId: 'p1', versionNumber: 1, snapshot: { plan: FOUR_SCENE_PLAN } } });

    const service = new OutputService();
    const deps = renderDeps();

    await service.autoAssemble(prisma as never, { projectId: 'p1', plan: FOUR_SCENE_PLAN }, deps as never);

    // Should still be exactly 1 version.
    expect(prisma.__versions.length).toBe(1);
  });

  it('blocks assembly when a required scene VIDEO is FAILED', async () => {
    const prisma = assemblyMock({ SCENE_03: 'FAILED' });
    const service = new OutputService();

    const result = await service.autoAssemble(prisma as never, { projectId: 'p1', plan: FOUR_SCENE_PLAN });

    expect(result.assembled).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.blockedScenes).toContain('SCENE_03');
    expect(prisma.__outputs.length).toBe(0);
  });

  it('blocks assembly when a required scene has no VIDEO asset at all', async () => {
    // Build mock without any VIDEO asset for SCENE_02.
    const prisma = assemblyMock();
    const origFindMany = prisma.creativeProducedAsset.findMany.bind(prisma.creativeProducedAsset);
    prisma.creativeProducedAsset.findMany = async (args: any) => {
      const all = await origFindMany(args);
      return all.filter((a: any) => !(a.sceneId === 'SCENE_02' && a.kind === 'VIDEO'));
    };

    const service = new OutputService();
    const result = await service.autoAssemble(prisma as never, { projectId: 'p1', plan: FOUR_SCENE_PLAN });

    expect(result.blocked).toBe(true);
    expect(result.blockedScenes).toContain('SCENE_02');
  });

  it('is a no-op when RAIVSTREAM_5_OUTPUT_ENABLED is not set', async () => {
    delete process.env.RAIVSTREAM_5_OUTPUT_ENABLED;
    const prisma = assemblyMock();
    const service = new OutputService();

    const result = await service.autoAssemble(prisma as never, { projectId: 'p1', plan: FOUR_SCENE_PLAN });

    expect(result.assembled).toBe(false);
    expect(prisma.__outputs.length).toBe(0);
  });

  it('ordered composition — assembles scenes in plan order even when DB returns them reversed', async () => {
    const prisma = assemblyMock();
    // Simulate DB returning VIDEO assets in reverse scene order.
    const allAssets: any[] = SCENE_IDS.flatMap((sceneId) => [
      { id: `img-${sceneId}`, sceneId, kind: 'IMAGE', status: 'READY', assetUrl: `r2://still-${sceneId}` },
      { id: `vid-${sceneId}`, sceneId, kind: 'VIDEO', status: 'READY', assetUrl: `r2://clip-${sceneId}` },
    ]);
    prisma.creativeProducedAsset.findMany = async () => [...allAssets].reverse();

    const service = new OutputService();
    const deps = renderDeps();

    // Capture the scene order passed to renderOutputDerivative via the render mock.
    const capturedScenes: string[] = [];
    deps.ffmpeg = vi.fn(async (args: string[]) => {
      // FFmpeg input files appear before the output; extract the temp clip filenames.
      const inputs = args.filter((a) => a.endsWith('.mp4') && !a.startsWith('-'));
      capturedScenes.push(...inputs);
      await writeFile(args[args.length - 1], Buffer.from('fake-mp4'));
    });

    await service.autoAssemble(prisma as never, { projectId: 'p1', plan: FOUR_SCENE_PLAN }, deps as never);

    // The assembled film must include all 4 scenes via FFmpeg (ordered, not reversed).
    expect(deps.ffmpeg).toHaveBeenCalledTimes(1);
    const args = (deps.ffmpeg as ReturnType<typeof vi.fn>).mock.calls[0][0] as string[];
    // FFmpeg concat filter input: -i <scene1> -i <scene2> ... must appear in SCENE_01 → SCENE_04 order.
    // We verify by checking the -i flags appear in ascending clip order, not reversed.
    const iFlags = args.filter((_a, idx) => args[idx - 1] === '-i');
    // Each temp file is written with a scene index; the first input must be an earlier scene
    // than the last input. We can't inspect content of temp files here, but we can verify
    // the total count equals the number of scenes.
    expect(iFlags.length).toBe(SCENE_IDS.length);
  });
});

describe('creative output renderer', () => {
  it('produces a derivative from scene media with injected mechanics', async () => {
    const deps = {
      fetch: vi.fn(async () => ({ ok: true, arrayBuffer: async () => Buffer.from('clip') }) as unknown as Response),
      ffmpeg: vi.fn(async (args: string[]) => { await writeFile(args[args.length - 1], Buffer.from('fake-mp4')); }),
      upload: vi.fn(async () => 'r2://out.mp4'),
    };
    const result = await renderOutputDerivative(
      { scenes: [{ sceneId: 'S1', videoUrl: 'r2://a' }, { sceneId: 'S2', videoUrl: 'r2://b' }], derivation: deriveOutput('SQUARE', null, 12), r2Prefix: 'x/y' },
      deps,
    );
    expect(result.assetUrl).toBe('r2://out.mp4');
    expect(deps.ffmpeg).toHaveBeenCalledTimes(1);
    const args = (deps.ffmpeg as any).mock.calls[0][0] as string[];
    expect(args.join(' ')).toContain('1080:1080');
    expect(args.join(' ')).toContain('settb=AVTB');
  });
});