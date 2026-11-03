import { describe, expect, it, vi } from 'vitest';
import { castReferences } from '../identityBlock';

/**
 * The defect this pins (2026-11-03): the skip lookup searched EVERY project, so a character
 * name shared with another project matched that project's reference and this project created
 * none - `created=0`, `skipped=1`, and ten projects silently produced no references at all.
 *
 * The distinction the tests draw is the whole fix: zero because nothing was needed (skipped)
 * versus zero because something broke.
 */

function prismaWith(opts: { existing: { id: string } | null }) {
  const created: unknown[] = [];
  const updated: unknown[] = [];
  const prisma = {
    characterReferenceAsset: {
      findFirst: vi.fn(async () => opts.existing),
      create: vi.fn(async ({ data }: { data: unknown }) => {
        created.push(data);
        return { id: `ref_${created.length}` };
      }),
      update: vi.fn(async (args: unknown) => {
        updated.push(args);
        return {};
      }),
    },
  };
  return { prisma: prisma as never, created, updated, findFirst: prisma.characterReferenceAsset.findFirst };
}

const characters = [{ name: 'Lighthouse Keeper', visualDescription: 'a weathered man in his sixties' }];

describe('castReferences creates when the project has none', () => {
  it('creates a reference for a project with characters and zero existing rows', async () => {
    const { prisma, created } = prismaWith({ existing: null });
    const result = await castReferences(prisma, {
      projectId: 'proj_1',
      characters,
      generate: async () => 'https://cdn.example/ref.png',
    });
    expect(result.created).toHaveLength(1);
    expect(result.skipped).toHaveLength(0);
    expect(created).toHaveLength(1);
  });

  it('scopes the skip lookup to the project, so a foreign reference cannot suppress the create', async () => {
    const { prisma, findFirst } = prismaWith({ existing: null });
    await castReferences(prisma, { projectId: 'proj_1', characters, generate: async () => 'u' });
    const where = ((findFirst.mock.calls as unknown) as Array<[{ where: Record<string, unknown> }]>)[0][0].where;
    expect(where.projectId).toBe('proj_1');
  });
});

describe('castReferences skips when the project already has one', () => {
  it('returns created=0 and skipped>0 for an existing reference — a legitimate zero', async () => {
    const { prisma, created } = prismaWith({ existing: { id: 'ref_existing' } });
    const result = await castReferences(prisma, {
      projectId: 'proj_1',
      characters,
      generate: async () => 'https://cdn.example/never.png',
    });
    expect(result.created).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.reason).toBe('already_ready');
    expect(created).toHaveLength(0);
  });
});

describe('the silent zero is now distinguishable', () => {
  it('a character with no name is neither created nor skipped-as-existing', async () => {
    const { prisma, created } = prismaWith({ existing: null });
    const result = await castReferences(prisma, {
      projectId: 'proj_1',
      characters: [{ name: '   ' }],
      generate: async () => 'u',
    });
    expect(result.created).toHaveLength(0);
    expect(created).toHaveLength(0);
  });
});