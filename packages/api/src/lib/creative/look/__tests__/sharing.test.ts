import { describe, expect, it } from 'vitest';
import { LookNameConflictError, lookPromptForProduction, saveLook, shareLook } from '../service';

/**
 * Sharing a look (Phase 6, first slice).
 *
 * The plan's Phase 6 asks for looks that can be "applied, shared, and reused". Applied and reused
 * shipped in Phase 5; sharing is the part that did not exist, and it needs no new table - a shared
 * look is the same object copied into another project, with the existing conflict rule deciding
 * collisions.
 */

type Row = { id: string; projectId: string; name: string; lens: number; movement: string; lighting: string; grade: string; resolution: number; createdAt: Date };

function makePrisma(): { prisma: never; rows: Row[] } {
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

const noir = { name: 'Noir', lens: 85 as const, movement: 'push-in' as const, lighting: 'low-key' as const, grade: 'monochrome' as const, resolution: 1080 as const };

describe('a look can be shared into another project', () => {
  it('copies every field, not a subset', async () => {
    const { prisma } = makePrisma();
    await saveLook(prisma, { projectId: 'p1', look: noir });
    const shared = await shareLook(prisma, { fromProjectId: 'p1', name: 'Noir', toProjectId: 'p2' });
    expect(shared.projectId).toBe('p2');
    expect(shared).toMatchObject({ name: 'Noir', lens: 85, movement: 'push-in', lighting: 'low-key', grade: 'monochrome', resolution: 1080 });
  });

  it('the shared look applies in the receiving project through the Phase 5 consumer', async () => {
    const { prisma } = makePrisma();
    await saveLook(prisma, { projectId: 'p1', look: noir });
    await shareLook(prisma, { fromProjectId: 'p1', name: 'Noir', toProjectId: 'p2' });
    const applied = await lookPromptForProduction(prisma, { projectId: 'p2', name: 'Noir' });
    expect(applied?.fragment).toContain('85mm');
    expect(applied?.fragment).toContain('monochrome grade');
  });

  it('the source look is untouched', async () => {
    const { prisma } = makePrisma();
    await saveLook(prisma, { projectId: 'p1', look: noir });
    await shareLook(prisma, { fromProjectId: 'p1', name: 'Noir', toProjectId: 'p2' });
    expect((await lookPromptForProduction(prisma, { projectId: 'p1', name: 'Noir' }))?.look.grade).toBe('monochrome');
  });

  it('sharing onto an existing name is the same typed conflict, not a silent overwrite', async () => {
    const { prisma } = makePrisma();
    await saveLook(prisma, { projectId: 'p1', look: noir });
    await saveLook(prisma, { projectId: 'p2', look: { ...noir, grade: 'warm' } });
    await expect(shareLook(prisma, { fromProjectId: 'p1', name: 'Noir', toProjectId: 'p2' })).rejects.toBeInstanceOf(LookNameConflictError);
  });

  it('a share can overwrite when the caller says so', async () => {
    const { prisma } = makePrisma();
    await saveLook(prisma, { projectId: 'p1', look: noir });
    await saveLook(prisma, { projectId: 'p2', look: { ...noir, grade: 'warm' } });
    const shared = await shareLook(prisma, { fromProjectId: 'p1', name: 'Noir', toProjectId: 'p2', overwrite: true });
    expect(shared.grade).toBe('monochrome');
  });

  it('sharing a look that does not exist fails loudly', async () => {
    const { prisma } = makePrisma();
    await expect(shareLook(prisma, { fromProjectId: 'p1', name: 'Absent', toProjectId: 'p2' })).rejects.toThrow(/No look named/);
  });
});

describe('between creators: what the clause actually means', () => {
  // DOCUMENTS A GAP rather than a feature. `shareLook` takes two project ids and checks neither
  // ownership nor that the projects belong to different users. So it does cross the creator
  // boundary - mechanically - but it does so without authorization: any caller who can name two
  // project ids can copy a look between them. The plan's "shareable between creators" is therefore
  // met in the copy, not in the permission. Fixing this belongs to the router layer (who may call
  // shareLook), not to this service.
  it('copies between projects whose owners differ, with no ownership check', async () => {
    const { prisma } = makePrisma();
    await saveLook(prisma, { projectId: 'p1_owned_by_alice', look: noir });
    const shared = await shareLook(prisma, { fromProjectId: 'p1_owned_by_alice', name: 'Noir', toProjectId: 'p2_owned_by_bob' });
    expect(shared.projectId).toBe('p2_owned_by_bob');
    expect(shared.grade).toBe('monochrome');
  });
});
