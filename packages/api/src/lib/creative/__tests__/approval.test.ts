import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ApprovalService } from '../approval/service';
import { DirectorService } from '../director/service';
import { buildCreativePlan } from '../production/plan';
import { interpret } from '../intent/interpreter';

beforeEach(() => {
  process.env.RAIVSTREAM_5_ENABLED = 'true';
  process.env.RAIVSTREAM_5_APPROVAL_ENABLED = 'true';
  process.env.RAIVSTREAM_5_DIRECTOR_ENABLED = 'true';
});
afterEach(() => {
  delete process.env.RAIVSTREAM_5_ENABLED;
  delete process.env.RAIVSTREAM_5_APPROVAL_ENABLED;
  delete process.env.RAIVSTREAM_5_DIRECTOR_ENABLED;
});

const PLAN = buildCreativePlan({ projectType: interpret('a commercial').projectType });

function prismaMock() {
  const approvals: any[] = [];
  const versions: any[] = [];
  const directives: any[] = [];
  const project = { id: 'p1', userId: 'u1', projectType: 'COMMERCIAL', title: 'Skincare', status: 'REVIEW', currentVersionId: null };
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
    creativeDirective: { create: async ({ data }: any) => { const d = { id: `d${directives.length + 1}`, createdAt: new Date(), ...data }; directives.push(d); return d; } },
    creativeApproval: {
      upsert: async ({ where, update, create }: any) => {
        const existing = approvals.find((a) => a.versionId === where.versionId_kind.versionId && a.kind === where.versionId_kind.kind);
        const row = existing ? { ...existing, ...update, updatedAt: new Date() } : { id: `a${approvals.length + 1}`, createdAt: new Date(), updatedAt: new Date(), ...create };
        if (existing) Object.assign(existing, row);
        else approvals.push(row);
        return row;
      },
      findUnique: async ({ where }: any) => approvals.find((a) => a.versionId === where.versionId_kind.versionId && a.kind === where.versionId_kind.kind) ?? null,
      findMany: async () => approvals.map((a: any) => ({ ...a, version: { versionNumber: versions.find((v) => v.id === a.versionId)?.versionNumber ?? 0 } })),
      updateMany: async ({ where, data }: any) => {
        for (const approval of approvals) if (approval.projectId === where.projectId && approval.status === where.status) Object.assign(approval, data);
        return { count: approvals.filter((a) => a.projectId === where.projectId && a.status === where.status).length };
      },
    },
    __approvals: approvals,
    __versions: versions,
  };
  return prisma;
}

describe('creative approval', () => {
  it('approves a version (CREATIVE) and reads it back as approved', async () => {
    const prisma = prismaMock();
    const service = new ApprovalService();
    const { version } = await new DirectorService().direct(prisma as never, { projectId: 'p1', userId: 'u1', instruction: 'Make it more cinematic.' });
    await service.decide(prisma as never, { projectId: 'p1', versionId: version.id, kind: 'CREATIVE', decision: 'approve' });
    expect(await service.isApproved(prisma as never, { projectId: 'p1', versionId: version.id, kind: 'CREATIVE' })).toBe(true);
  });

  it('material Direct invalidates prior approvals (never silently re-approved)', async () => {
    const prisma = prismaMock();
    const director = new DirectorService();
    const approval = new ApprovalService();
    const v1 = await director.direct(prisma as never, { projectId: 'p1', userId: 'u1', instruction: 'Make it more cinematic.' });
    await approval.decide(prisma as never, { projectId: 'p1', versionId: v1.version.id, kind: 'CREATIVE', decision: 'approve' });
    expect(prisma.__approvals.some((a: any) => a.status === 'APPROVED')).toBe(true);

    const v2 = await director.direct(prisma as never, { projectId: 'p1', userId: 'u1', instruction: 'Make the ending hopeful.' });
    expect(prisma.__approvals.some((a: any) => a.status === 'INVALIDATED')).toBe(true);
    expect(await approval.isApproved(prisma as never, { projectId: 'p1', versionId: v1.version.id })).toBe(false);
    expect(await approval.isApproved(prisma as never, { projectId: 'p1', versionId: v2.version.id })).toBe(false); // new version starts PENDING
  });

  it('non-material actions (no new version) leave approvals intact', async () => {
    const prisma = prismaMock();
    const director = new DirectorService();
    const approval = new ApprovalService();
    const v1 = await director.direct(prisma as never, { projectId: 'p1', userId: 'u1', instruction: 'Make it more cinematic.' });
    await approval.decide(prisma as never, { projectId: 'p1', versionId: v1.version.id, kind: 'CREATIVE', decision: 'approve' });
    // Read-only / re-review paths never create versions → no invalidation.
    await approval.list(prisma as never, { projectId: 'p1' });
    expect(await approval.isApproved(prisma as never, { projectId: 'p1', versionId: v1.version.id })).toBe(true);
  });

  it('reject and request-changes set the right statuses', async () => {
    const prisma = prismaMock();
    const director = new DirectorService();
    const approval = new ApprovalService();
    const v1 = await director.direct(prisma as never, { projectId: 'p1', userId: 'u1', instruction: 'Make it more cinematic.' });
    await approval.decide(prisma as never, { projectId: 'p1', versionId: v1.version.id, kind: 'CREATIVE', decision: 'reject' });
    await approval.decide(prisma as never, { projectId: 'p1', versionId: v1.version.id, kind: 'PRODUCTION', decision: 'request_changes' });
    expect(prisma.__approvals.find((a: any) => a.kind === 'CREATIVE').status).toBe('REJECTED');
    expect(prisma.__approvals.find((a: any) => a.kind === 'PRODUCTION').status).toBe('CHANGES_REQUESTED');
  });
});