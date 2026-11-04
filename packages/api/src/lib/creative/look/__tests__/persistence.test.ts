import { describe, expect, it } from 'vitest';
import { LookNameConflictError, composeWithLook, listLooks, lookPromptForProduction, renameLook, saveLook } from '../service';

/**
 * Phase 5 persistence: a look is saved, named, reusable, and survives a re-read.
 *
 * The acceptance criterion, clause by clause:
 *   1. saved under a name
 *   2. survives a re-read
 *   3. applied to a production
 *   4. a second production reuses it without re-entering fields
 */

type Row = { id: string; projectId: string; name: string; lens: number; movement: string; lighting: string; grade: string; resolution: number; createdAt: Date };

function makePrisma(seed: Row[] = []) {
  const rows: Row[] = [...seed];
  let n = 0;
  const match = (row: Row, where: Record<string, unknown>) => {
    if (where.projectId !== undefined && row.projectId !== where.projectId) return false;
    if (where.name !== undefined && row.name !== where.name) return false;
    const not = where.NOT as { id?: string } | undefined;
    if (not?.id && row.id === not.id) return false;
    return true;
  };
  return {
    rows,
    cinematicLook: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => rows.find((row) => match(row, where)) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        n += 1;
        const row = { id: `look_${n}`, createdAt: new Date(), ...(data as object) } as Row;
        rows.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = rows.find((candidate) => candidate.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
      findMany: async ({ where }: { where: Record<string, unknown> }) => rows.filter((row) => match(row, where)),
    },
  } as never;
}

const noirdLook = { name: 'Noir', lens: 85 as const, movement: 'push-in' as const, lighting: 'low-key' as const, grade: 'monochrome' as const, resolution: 1080 as const };

describe('a look is saved, named, and survives a re-read', () => {
  it('saves under a name and reads the same values back', async () => {
    const prisma = makePrisma();
    const saved = await saveLook(prisma, { projectId: 'p1', look: noirdLook });
    expect(saved.name).toBe('Noir');
    expect(saved.lens).toBe(85);

    const read = await lookPromptForProduction(prisma, { projectId: 'p1', name: 'Noir' });
    expect(read?.look.grade).toBe('monochrome');
    expect(read?.fragment).toContain('85mm');
    expect(read?.fragment).toContain('monochrome grade');
  });

  it('is scoped to the project: the same name in another project is a different look', async () => {
    const prisma = makePrisma();
    await saveLook(prisma, { projectId: 'p1', look: noirdLook });
    await saveLook(prisma, { projectId: 'p2', look: { ...noirdLook, grade: 'warm' } });
    expect((await lookPromptForProduction(prisma, { projectId: 'p1', name: 'Noir' }))?.look.grade).toBe('monochrome');
    expect((await lookPromptForProduction(prisma, { projectId: 'p2', name: 'Noir' }))?.look.grade).toBe('warm');
  });
});

describe('a duplicate name is a typed conflict, not a stack trace', () => {
  it('saving a duplicate name throws LookNameConflictError', async () => {
    const prisma = makePrisma();
    await saveLook(prisma, { projectId: 'p1', look: noirdLook });
    await expect(saveLook(prisma, { projectId: 'p1', look: noirdLook })).rejects.toBeInstanceOf(LookNameConflictError);
  });

  it('renaming onto an existing name throws the same conflict', async () => {
    const prisma = makePrisma();
    await saveLook(prisma, { projectId: 'p1', look: noirdLook });
    const second = await saveLook(prisma, { projectId: 'p1', look: { name: 'Warm', grade: 'warm' } });
    await expect(renameLook(prisma, { projectId: 'p1', id: second.id, name: 'Noir' })).rejects.toBeInstanceOf(LookNameConflictError);
  });

  it('rename keeps the look reachable under its new name', async () => {
    const prisma = makePrisma();
    const saved = await saveLook(prisma, { projectId: 'p1', look: noirdLook });
    await renameLook(prisma, { projectId: 'p1', id: saved.id, name: 'Night' });
    expect(await lookPromptForProduction(prisma, { projectId: 'p1', name: 'Noir' })).toBeNull();
    expect((await lookPromptForProduction(prisma, { projectId: 'p1', name: 'Night' }))?.fragment).toContain('85mm');
  });

  it('a project can hold several looks and list them', async () => {
    const prisma = makePrisma();
    await saveLook(prisma, { projectId: 'p1', look: noirdLook });
    await saveLook(prisma, { projectId: 'p1', look: { name: 'Warm', grade: 'warm' } });
    const looks = await listLooks(prisma, 'p1');
    expect(looks.map((look) => look.name)).toEqual(['Noir', 'Warm']);
  });
});

describe('the consumer applies a stored look to a production', () => {
  it('two productions reuse one saved look without re-entering any field', async () => {
    const prisma = makePrisma();
    await saveLook(prisma, { projectId: 'p1', look: noirdLook });

    const first = await lookPromptForProduction(prisma, { projectId: 'p1', name: 'Noir' });
    expect(first).not.toBeNull();
    const firstPrompt = composeWithLook('A lighthouse keeper at dusk', first!.fragment);

    // second production: name only, no look fields supplied
    const second = await lookPromptForProduction(prisma, { projectId: 'p1', name: 'Noir' });
    const secondPrompt = composeWithLook('The keeper climbs the stairs', second!.fragment);

    expect(firstPrompt).toContain('A lighthouse keeper at dusk.');
    expect(secondPrompt).toContain('The keeper climbs the stairs.');
    for (const prompt of [firstPrompt, secondPrompt]) {
      expect(prompt).toContain('85mm');
      expect(prompt).toContain('camera push-in');
      expect(prompt).toContain('low-key lighting');
      expect(prompt).toContain('monochrome grade');
    }
  });

  it('a missing look returns null rather than a silent default', async () => {
    const prisma = makePrisma();
    expect(await lookPromptForProduction(prisma, { projectId: 'p1', name: 'Absent' })).toBeNull();
  });
});
