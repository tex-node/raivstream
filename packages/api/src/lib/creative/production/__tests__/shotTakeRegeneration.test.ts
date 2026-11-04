import { describe, expect, it, vi } from 'vitest';

/**
 * Shot-scoped take regeneration — Phase 4's first slice (2026-11-04).
 *
 * The database cannot supply the state this needs: 435 rows, **0 with a `shotId`**, 0 scenes with
 * two shots. So the fixture builds it — two shots in one scene, each with a produced take — and
 * the assertions run against that state rather than against a mock of the outcome.
 *
 * The claim under test is the "only that shot" half of the exit criterion: regenerating shot B
 * leaves shot A's take untouched in the database.
 */

vi.mock('../generationAdapter', () => ({
  generateStill: vi.fn(async () => ({ assetUrl: 'https://cdn.example/take.png' })),
}));
vi.mock('../../../credits', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../credits')>();
  return { ...actual, chargeOrThrow: vi.fn(async () => 80) };
});
vi.mock('../identityBlock', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../identityBlock')>();
  return { ...actual, resolveCreativeReferences: vi.fn(async () => []) };
});

import { chargeOrThrow } from '../../../credits';
import { createNewTake } from '../newTake';

interface Row {
  id: string;
  projectId: string;
  sceneId: string;
  shotId: string | null;
  kind: string;
  takeNumber: number;
  parentTakeId: string | null;
  isLatest: boolean;
  status: string;
  assetUrl: string | null;
}

/** The fixture: a scene with two shots, each holding take 1. The database has none of these. */
function makePrisma() {
  const rows: Row[] = [
    { id: 'asset_shotA_t1', projectId: 'p1', sceneId: 'SCENE_01', shotId: 'shot-A', kind: 'IMAGE', takeNumber: 1, parentTakeId: null, isLatest: true, status: 'READY', assetUrl: 'a.png' },
    { id: 'asset_shotB_t1', projectId: 'p1', sceneId: 'SCENE_01', shotId: 'shot-B', kind: 'IMAGE', takeNumber: 1, parentTakeId: null, isLatest: true, status: 'READY', assetUrl: 'b.png' },
  ];
  let created = 0;

  const prisma = {
    creativeProducedAsset: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const matched = rows
          .filter((row) =>
            row.projectId === where.projectId &&
            row.sceneId === where.sceneId &&
            row.kind === where.kind &&
            (where.shotId === undefined || row.shotId === where.shotId),
          )
          .sort((a, b) => b.takeNumber - a.takeNumber)[0];
        return matched ? { id: matched.id, takeNumber: matched.takeNumber } : null;
      }),
      create: vi.fn(async ({ data }: { data: Row }) => {
        created += 1;
        const row: Row = {
          id: `new_take_${created}`,
          projectId: data.projectId,
          sceneId: data.sceneId,
          shotId: data.shotId ?? null,
          kind: data.kind,
          takeNumber: data.takeNumber,
          parentTakeId: data.parentTakeId ?? null,
          isLatest: data.isLatest ?? true,
          status: data.status ?? 'QUEUED',
          assetUrl: data.assetUrl ?? null,
        };
        rows.push(row);
        return { id: row.id };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const row = rows.find((candidate) => candidate.id === where.id);
        if (row) Object.assign(row, data);
        return row;
      }),
      findMany: vi.fn(async () => rows),
    },
    creativeProject: { findUnique: vi.fn(async () => ({ userId: 'user_1' })) },
    characterReferenceAsset: { findFirst: vi.fn(async () => null) },
  };
  return { prisma: prisma as never, rows };
}

const input = {
  projectId: 'p1',
  sceneId: 'SCENE_01',
  shotId: 'shot-B',
  characters: [{ name: 'Lighthouse Keeper', visualDescription: 'a weathered man in his sixties' }],
  scenePrompt: 'Introduce the obstacle and raise the stakes.',
};

describe('regenerating one shot leaves the other alone', () => {
  it('creates shot B take 2 with shot B take 1 as its parent', async () => {
    const { prisma, rows } = makePrisma();
    const result = await createNewTake(prisma, input);

    expect(result.shotId).toBe('shot-B');
    expect(result.takeNumber).toBe(2);
    expect(result.parentTakeId).toBe('asset_shotB_t1');

    const take2 = rows.find((row) => row.id === result.assetId)!;
    expect(take2.takeNumber).toBe(2);
    expect(take2.shotId).toBe('shot-B');
    expect(take2.parentTakeId).toBe('asset_shotB_t1');
  });

  it('demotes shot B take 1 and leaves shot A take 1 untouched', async () => {
    const { prisma, rows } = makePrisma();
    await createNewTake(prisma, input);

    const shotB1 = rows.find((row) => row.id === 'asset_shotB_t1')!;
    const shotA1 = rows.find((row) => row.id === 'asset_shotA_t1')!;

    expect(shotB1.isLatest).toBe(false);
    // The "only that shot" half of the exit criterion, asserted against the row, not a mock.
    expect(shotA1.isLatest).toBe(true);
    expect(shotA1.id).toBe('asset_shotA_t1');
    expect(shotA1.takeNumber).toBe(1);
    expect(shotA1.assetUrl).toBe('a.png');
  });

  it('a shot take scoped to shot B does not see shot A as its predecessor', async () => {
    const { prisma } = makePrisma();
    const result = await createNewTake(prisma, input);
    expect(result.parentTakeId).not.toBe('asset_shotA_t1');
  });

  it('the charge is real, on the new row\'s key', async () => {
    const { prisma } = makePrisma();
    const result = await createNewTake(prisma, input);
    expect(result.creditsCharged).toBe(80);
    const call = (chargeOrThrow as unknown as { mock: { calls: unknown[][] } }).mock.calls.at(-1)!;
    expect(String(call[5])).toContain(`creative-take-${result.assetId}-a1`);
  });
});

describe('scene-level takes are unchanged by the shot path', () => {
  it('omitting shotId keeps the scene-level slot (shotId null)', async () => {
    const { prisma, rows } = makePrisma();
    const result = await createNewTake(prisma, { ...input, shotId: undefined });

    expect(result.shotId).toBeNull();
    const take = rows.find((row) => row.id === result.assetId)!;
    expect(take.shotId).toBeNull();
    expect(take.takeNumber).toBe(1);
  });
});