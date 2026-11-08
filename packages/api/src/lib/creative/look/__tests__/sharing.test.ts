import { describe, expect, it } from 'vitest';
import { LookNameConflictError, LookShareForbiddenError, lookPromptForProduction, saveLook, shareLook } from '../service';

/**
 * Sharing a look (Phase 6, first slice).
 *
 * The plan's Phase 6 asks for looks that can be "applied, shared, and reused". Applied and reused
 * shipped in Phase 5; sharing is the part that did not exist, and it needs no new table - a shared
 * look is the same object copied into another project, with the existing conflict rule deciding
 * collisions.
 */

type Row = { id: string; projectId: string; name: string; lens: number; movement: string; lighting: string; grade: string; resolution: number; createdAt: Date };

function makePrisma(owners: Record<string, string> = {}): { prisma: never; rows: Row[] } {
  const rows: Row[] = [];
  let n = 0;
  const match = (row: Row, where: Record<string, unknown>) => {
    if (where.projectId !== undefined && row.projectId !== where.projectId) return false;
    if (where.name !== undefined && row.name !== where.name) return false;
    const not = where.NOT as { id?: string } | undefined;
    if (not?.id && row.id === not.id) return false;
    return true;
  };
  const prisma = {
    creativeProject: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in
          .filter((id) => owners[id] !== undefined)
          .map((id) => ({ id, userId: owners[id] })),
    },
    cinematicLook: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => rows.find((row) => match(row, where)) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        n += 1;
        const row = { id: `look_${n}`, createdAt: new Date(), ...(data as object) } as Row;
        rows.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = rows.find((c) => c.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
      findMany: async ({ where }: { where: Record<string, unknown> }) => rows.filter((row) => match(row, where)),
    },
  } as never;
  return { prisma, rows };
}

const CALLER = 'user_alice';
const noir = { name: 'Noir', lens: 85 as const, movement: 'push-in' as const, lighting: 'low-key' as const, grade: 'monochrome' as const, resolution: 1080 as const };

describe('a look can be shared into another project', () => {
  it('copies every field, not a subset', async () => {
    const { prisma } = makePrisma({ p1: CALLER, p2: CALLER });
    await saveLook(prisma, { projectId: 'p1', look: noir });
    const shared = await shareLook(prisma, { callerId: CALLER, fromProjectId: 'p1', name: 'Noir', toProjectId: 'p2' });
    expect(shared.projectId).toBe('p2');
    expect(shared).toMatchObject({ name: 'Noir', lens: 85, movement: 'push-in', lighting: 'low-key', grade: 'monochrome', resolution: 1080 });
  });

  it('the shared look applies in the receiving project through the Phase 5 consumer', async () => {
    const { prisma } = makePrisma({ p1: CALLER, p2: CALLER });
    await saveLook(prisma, { projectId: 'p1', look: noir });
    await shareLook(prisma, { callerId: CALLER, fromProjectId: 'p1', name: 'Noir', toProjectId: 'p2' });
    const applied = await lookPromptForProduction(prisma, { projectId: 'p2', name: 'Noir' });
    expect(applied?.fragment).toContain('85mm');
    expect(applied?.fragment).toContain('monochrome grade');
  });

  it('the source look is untouched', async () => {
    const { prisma } = makePrisma({ p1: CALLER, p2: CALLER });
    await saveLook(prisma, { projectId: 'p1', look: noir });
    await shareLook(prisma, { callerId: CALLER, fromProjectId: 'p1', name: 'Noir', toProjectId: 'p2' });
    expect((await lookPromptForProduction(prisma, { projectId: 'p1', name: 'Noir' }))?.look.grade).toBe('monochrome');
  });

  it('sharing onto an existing name is the same typed conflict, not a silent overwrite', async () => {
    const { prisma } = makePrisma({ p1: CALLER, p2: CALLER });
    await saveLook(prisma, { projectId: 'p1', look: noir });
    await saveLook(prisma, { projectId: 'p2', look: { ...noir, grade: 'warm' } });
    await expect(shareLook(prisma, { callerId: CALLER, fromProjectId: 'p1', name: 'Noir', toProjectId: 'p2' })).rejects.toBeInstanceOf(LookNameConflictError);
  });

  it('a share can overwrite when the caller says so', async () => {
    const { prisma } = makePrisma({ p1: CALLER, p2: CALLER });
    await saveLook(prisma, { projectId: 'p1', look: noir });
    await saveLook(prisma, { projectId: 'p2', look: { ...noir, grade: 'warm' } });
    const shared = await shareLook(prisma, { callerId: CALLER, fromProjectId: 'p1', name: 'Noir', toProjectId: 'p2', overwrite: true });
    expect(shared.grade).toBe('monochrome');
  });

  it('sharing a look that does not exist fails loudly', async () => {
    const { prisma } = makePrisma({ p1: CALLER, p2: CALLER });
    await expect(shareLook(prisma, { callerId: CALLER, fromProjectId: 'p1', name: 'Absent', toProjectId: 'p2' })).rejects.toThrow(/No look named/);
  });
});

describe('the boundary: sharing requires owning both ends', () => {
  // CONTRACT CHANGED (2026-11-08). This block used to document an absence: "shareLook copies
  // between projects whose owners differ, with no ownership check". The check now exists at the
  // service, so the old test would be asserting the vulnerability. It changed deliberately, the
  // way the moderation-fallback suite's contract did, and it now proves the refusals instead.
  it('caller owns both ends: the share succeeds', async () => {
    const { prisma } = makePrisma({ source: CALLER, target: CALLER });
    await saveLook(prisma, { projectId: 'source', look: noir });
    const shared = await shareLook(prisma, { callerId: CALLER, fromProjectId: 'source', name: 'Noir', toProjectId: 'target' });
    expect(shared.projectId).toBe('target');
  });

  it('READ direction: owning the target but not the source is refused, named as the source side', async () => {
    const { prisma } = makePrisma({ source: 'user_bob', target: CALLER });
    await saveLook(prisma, { projectId: 'source', look: noir });
    await expect(
      shareLook(prisma, { callerId: CALLER, fromProjectId: 'source', name: 'Noir', toProjectId: 'target' }),
    ).rejects.toBeInstanceOf(LookShareForbiddenError);
  });

  it('WRITE direction: owning the source but not the target is refused, named as the target side', async () => {
    const { prisma } = makePrisma({ source: CALLER, target: 'user_bob' });
    await saveLook(prisma, { projectId: 'source', look: noir });
    await expect(
      shareLook(prisma, { callerId: CALLER, fromProjectId: 'source', name: 'Noir', toProjectId: 'target' }),
    ).rejects.toBeInstanceOf(LookShareForbiddenError);
  });

  it('an unauthorized overwrite is refused and the target look is untouched', async () => {
    const { prisma } = makePrisma({ source: CALLER, target: 'user_bob' });
    await saveLook(prisma, { projectId: 'source', look: noir });
    await saveLook(prisma, { projectId: 'target', look: { ...noir, grade: 'warm' } });
    await expect(
      shareLook(prisma, { callerId: CALLER, fromProjectId: 'source', name: 'Noir', toProjectId: 'target', overwrite: true }),
    ).rejects.toBeInstanceOf(LookShareForbiddenError);
    const untouched = await lookPromptForProduction(prisma, { projectId: 'target', name: 'Noir' });
    expect(untouched?.look.grade).toBe('warm');
  });

  it('the refusal names the side that failed', async () => {
    const { prisma } = makePrisma({ source: 'user_bob', target: CALLER });
    await saveLook(prisma, { projectId: 'source', look: noir });
    let error: unknown;
    try {
      await shareLook(prisma, { callerId: CALLER, fromProjectId: 'source', name: 'Noir', toProjectId: 'target' });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(LookShareForbiddenError);
    expect((error as LookShareForbiddenError).side).toBe('source');
    expect((error as LookShareForbiddenError).code).toBe('LOOK_SHARE_FORBIDDEN');
  });

  it('the refusal precedes the source read - no look is fetched on the error path', async () => {
    const { prisma } = makePrisma({ source: 'user_bob', target: CALLER });
    await saveLook(prisma, { projectId: 'source', look: noir });
    const lookModel = (prisma as unknown as { cinematicLook: { findFirst: unknown } }).cinematicLook;
    const spy = lookModel.findFirst as unknown as (...args: unknown[]) => Promise<unknown>;
    let readAttempted = false;
    lookModel.findFirst = (async (...args: unknown[]) => {
      readAttempted = true;
      return spy(...args);
    }) as never;

    await expect(
      shareLook(prisma, { callerId: CALLER, fromProjectId: 'source', name: 'Noir', toProjectId: 'target' }),
    ).rejects.toBeInstanceOf(LookShareForbiddenError);
    expect(readAttempted).toBe(false);
  });
});
