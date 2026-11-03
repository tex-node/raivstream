import { describe, expect, it, vi } from 'vitest';
import { ASSET_RESET_AFTER_CHARGE, assertNotResetAfterCharge } from '../runner';

/**
 * The narrow leak, closed (2026-11-03).
 *
 * `deductCredits` keys on `charge(assetId, attempt)`. Resetting an already-charged asset to
 * QUEUED replays that key: the provider is billed again and the ledger records nothing.
 * Production evidence: a forced four-scene regeneration billed eight provider jobs and
 * deducted zero credits because the harness reset existing rows instead of creating takes.
 *
 * The fix forbids the bypass instead of inventing a second charging rule - a new attempt
 * must be a new row, which mints a new key and charges normally.
 */

const key = (n: number) => `creative-produce-ast_1-a${n}`;

function prismaWith(existingKey: string | null) {
  return {
    creditTransaction: {
      findUnique: vi.fn(async ({ where }: { where: { idempotencyKey: string } }) =>
        existingKey && where.idempotencyKey === existingKey ? { id: 'tx_1' } : null,
      ),
    },
  } as never;
}

describe('reset-after-charge is refused', () => {
  it('throws when the asset was already charged and is back in the queue', async () => {
    const prisma = prismaWith(key(1));
    await expect(
      assertNotResetAfterCharge(prisma, { assetId: 'ast_1', status: 'QUEUED', idempotencyKeyFor: key }),
    ).rejects.toThrow(new RegExp(`${ASSET_RESET_AFTER_CHARGE}.*new asset row`));
  });

  it('passes a brand-new asset that has never been charged', async () => {
    const prisma = prismaWith(null);
    await expect(
      assertNotResetAfterCharge(prisma, { assetId: 'ast_1', status: 'QUEUED', idempotencyKeyFor: key }),
    ).resolves.toBeUndefined();
  });

  it('does not query at all for an asset that is not queued', async () => {
    const prisma = prismaWith(key(1));
    await expect(
      assertNotResetAfterCharge(prisma, { assetId: 'ast_1', status: 'READY', idempotencyKeyFor: key }),
    ).resolves.toBeUndefined();
  });

  it('the error names the take model, so the caller knows the correct move', async () => {
    const prisma = prismaWith(key(1));
    await expect(
      assertNotResetAfterCharge(prisma, { assetId: 'ast_1', status: 'QUEUED', idempotencyKeyFor: key }),
    ).rejects.toThrow(/take/i);
  });
});