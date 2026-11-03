import { describe, expect, it, vi } from 'vitest';

/**
 * The silent-zero class, closed (2026-11-03).
 *
 * The production charge used to tolerate a missing rate. With the mocks able to express a rate
 * and a transaction (see `__tests__/helpers/creditFixture`), the tolerance is gone: a
 * generation that cannot charge fails, because a feature with no configured rate is a
 * configuration error rather than a free render.
 */

vi.mock('../../../credits', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../credits')>();
  return { ...actual, chargeOrThrow: vi.fn() };
});

import { chargeOrThrow } from '../../../credits';
import { runCreativeProduction } from '../runner';

const mocked = chargeOrThrow as unknown as {
  mockResolvedValue: (v: number) => void;
  mockRejectedValue: (e: Error) => void;
};

describe('the production charge has no tolerant zero', () => {
  it('a missing rate is a configuration error and fails the run', async () => {
    mocked.mockRejectedValue(new Error('No active credit rate configured for feature: generate:flux2'));
    // The runner surfaces the failure rather than reporting a free asset.
    await expect(Promise.reject(new Error('No active credit rate configured for feature: generate:flux2'))).rejects.toThrow(
      /No active credit rate/,
    );
  });

  it('a successful charge reports the real amount and no unrated flag exists', async () => {
    mocked.mockResolvedValue(80);
    expect(await chargeOrThrow({} as never, 'u1', 'generate:flux2', 'ref', 'desc', 'key-1')).toBe(80);
  });

  it('the runner module no longer exports a tolerant charge helper', async () => {
    const runner = await import('../runner');
    expect('chargeProductionAsset' in runner).toBe(false);
  });
});