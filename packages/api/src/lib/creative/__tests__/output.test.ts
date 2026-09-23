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