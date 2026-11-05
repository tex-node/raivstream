import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { nextChargeAttempt } from '../attempts';
import { creditKeys } from '../idempotencyKeys';

/**
 * The reuse-path billing hole (2026-11-05).
 *
 * `prod:charge:<assetId>:<attempt>` carried a retry counter that restarts at 1 per run, so a second
 * run over the same reused row replayed `...:1`: `deductCredits` wrote nothing and the provider was
 * billed. Observed live - balance 4,920 before and after a real render.
 *
 * The invariant these tests defend: a row that has been paid for cannot be rendered again under the
 * SAME charge key.
 */

function fakePrisma(keys: Array<string | null>) {
  return {
    creditTransaction: {
      findMany: async ({ where }: { where: { idempotencyKey: { startsWith: string } } }) =>
        keys
          .filter((key): key is string => typeof key === 'string' && key.startsWith(where.idempotencyKey.startsWith))
          .map((key) => ({ idempotencyKey: key })),
    },
  } as never;
}

describe('the attempt is derived from the row history, not a loop counter', () => {
  it('a row with no transactions starts at attempt 1', async () => {
    expect(await nextChargeAttempt(fakePrisma([]), 'asset_1')).toBe(1);
  });

  it('a row already charged once can never reuse attempt 1 again', async () => {
    const prisma = fakePrisma([creditKeys.prodAsset.charge('asset_1', 1)]);
    expect(await nextChargeAttempt(prisma, 'asset_1')).toBe(2);
  });

  it('a row charged and refunded still advances - the charge row is the durable record', async () => {
    const prisma = fakePrisma([creditKeys.prodAsset.charge('asset_1', 1), creditKeys.prodAsset.refund('asset_1', 1)]);
    expect(await nextChargeAttempt(prisma, 'asset_1')).toBe(2);
  });

  it('another asset history does not leak', async () => {
    const prisma = fakePrisma([creditKeys.prodAsset.charge('asset_2', 7)]);
    expect(await nextChargeAttempt(prisma, 'asset_1')).toBe(1);
  });
});

describe('the runner uses it for reused rows', () => {
  const source = readFileSync(join(__dirname, '..', '..', 'creative', 'production', 'runner.ts'), 'utf8');

  it('a reused row derives its charge attempt from history', () => {
    expect(source).toContain('const chargeAttempt = prior ? await nextChargeAttempt(prisma, asset.id) : attempt;');
  });

  it('a READY asset still skips both generation and charge', () => {
    expect(source).toMatch(/if \(prior && prior\.status === 'READY'\) \{[\s\S]{0,200}?continue;/);
  });
});
