import { describe, expect, it, vi } from 'vitest';

/**
 * The last silent-zero site (2026-11-03).
 *
 * `runner.ts` used `.catch(() => 0)`, so a missing rate row, a missing balance row, or a Prisma
 * error all became `creditsUsed = 0` and the run continued unbilled. Now exactly ONE zero is
 * tolerated — a missing rate, which is a configuration state — and it is logged and returned as
 * `unrated: true`. Everything else is rethrown.
 */

vi.mock('../../../credits', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../credits')>();
  return { ...actual, chargeOrThrow: vi.fn() };
});

import { chargeOrThrow } from '../../../credits';
import { chargeProductionAsset } from '../runner';

const input = {
  userId: 'u1',
  featureKey: 'generate:flux2',
  referenceId: 'creative-produce-a1-a1',
  description: 'Creative production: SCENE_01 image',
  idempotencyKey: 'creative-produce-a1-a1',
  projectId: 'p1',
  sceneId: 'SCENE_01',
};

const mocked = chargeOrThrow as unknown as {
  mockResolvedValue: (v: number) => void;
  mockRejectedValue: (e: Error) => void;
};

describe('the production charge policy', () => {
  it('reports the real amount when the charge succeeds', async () => {
    mocked.mockResolvedValue(80);
    const result = await chargeProductionAsset({} as never, input);
    expect(result).toEqual({ credits: 80, unrated: false });
  });

  it('the ONE tolerated zero is a missing rate, and it is marked unrated', async () => {
    mocked.mockRejectedValue(new Error('No active credit rate configured for feature: generate:flux2'));
    const result = await chargeProductionAsset({} as never, input);
    expect(result).toEqual({ credits: 0, unrated: true });
  });

  it('a balance failure is NOT a zero — it propagates', async () => {
    mocked.mockRejectedValue(new Error('Insufficient credits — you need 80 but have 0.'));
    await expect(chargeProductionAsset({} as never, input)).rejects.toThrow(/Insufficient credits/);
  });

  it('a database error is NOT a zero — it propagates', async () => {
    mocked.mockRejectedValue(new Error('P1001: cannot reach database server'));
    await expect(chargeProductionAsset({} as never, input)).rejects.toThrow(/P1001/);
  });
});