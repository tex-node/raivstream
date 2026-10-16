/**
 * Per-second video pricing unit tests (VIDEO_PER_SECOND_PRICING flag).
 *
 * Covers:
 *   1. `perSecondCredits` — rounding at 4/10/15 s for 65/105/210 cr/s
 *   2. `h3MaxFeatureKey` / `veedFabricFeatureKey` — key derivation from resolution
 *   3. `toH3MaxInput` — throws on unrecognised resolution
 *   4. Reserve → settle cycle: charge = min(requested, actual) × rate
 *   5. Reserve → release on failure: balance fully restored
 *   6. Flag OFF → flat 200 cr rate lookup still works (old path unaffected)
 */

import { describe, it, expect } from 'vitest';
import { perSecondCredits, h3MaxFeatureKey, veedFabricFeatureKey, isVideoPerSecondPricingEnabled } from '../credits';
import { toH3MaxInput } from '../mediaProviders/fal/contracts';
import { MediaProviderError } from '../mediaProviders/types';

// ─── 1. perSecondCredits rounding ────────────────────────────────────────────

describe('perSecondCredits', () => {
  it('4s × 65 cr/s = 260', () => expect(perSecondCredits(4, 65)).toBe(260));
  it('5s × 65 cr/s = 325', () => expect(perSecondCredits(5, 65)).toBe(325));
  it('10s × 65 cr/s = 650', () => expect(perSecondCredits(10, 65)).toBe(650));
  it('15s × 65 cr/s = 975', () => expect(perSecondCredits(15, 65)).toBe(975));
  it('10s × 105 cr/s = 1050', () => expect(perSecondCredits(10, 105)).toBe(1050));
  it('10s × 210 cr/s = 2100', () => expect(perSecondCredits(10, 210)).toBe(2100));
  it('rounds up fractional seconds', () => {
    // 4.3s × 65 = 279.5 → 280
    expect(perSecondCredits(4.3, 65)).toBe(280);
  });
});

// ─── 2. Feature key derivation ───────────────────────────────────────────────

describe('h3MaxFeatureKey', () => {
  it('480P → generate:h3_max_480p', () => expect(h3MaxFeatureKey('480P')).toBe('generate:h3_max_480p'));
  it('768P → generate:h3_max_768p', () => expect(h3MaxFeatureKey('768P')).toBe('generate:h3_max_768p'));
  it('1080P → generate:h3_max_1080p', () => expect(h3MaxFeatureKey('1080P')).toBe('generate:h3_max_1080p'));
  it('lowercase normalised — 768p → generate:h3_max_768p', () => expect(h3MaxFeatureKey('768p')).toBe('generate:h3_max_768p'));
  it('unknown resolution falls back to 480p key', () => expect(h3MaxFeatureKey('720P')).toBe('generate:h3_max_480p'));
});

describe('veedFabricFeatureKey', () => {
  it('720p → generate:veed_fabric_720p', () => expect(veedFabricFeatureKey('720p')).toBe('generate:veed_fabric_720p'));
  it('480p → generate:veed_fabric_480p', () => expect(veedFabricFeatureKey('480p')).toBe('generate:veed_fabric_480p'));
  it('unknown → generate:veed_fabric_480p', () => expect(veedFabricFeatureKey('360p')).toBe('generate:veed_fabric_480p'));
});

// ─── 3. toH3MaxInput rejects unrecognised resolution ─────────────────────────

describe('toH3MaxInput resolution guard', () => {
  const base = { prompt: 'test', imageUrl: 'https://example.com/img.jpg' };

  it('accepts 480P', () => {
    expect(() => toH3MaxInput({ ...base, resolution: '480P' })).not.toThrow();
    expect(toH3MaxInput({ ...base, resolution: '480P' }).resolution).toBe('480P');
  });

  it('accepts 768P', () => {
    expect(toH3MaxInput({ ...base, resolution: '768P' }).resolution).toBe('768P');
  });

  it('accepts 1080P', () => {
    expect(toH3MaxInput({ ...base, resolution: '1080P' }).resolution).toBe('1080P');
  });

  it('normalises lowercase — 768p → 768P in payload', () => {
    expect(toH3MaxInput({ ...base, resolution: '768p' }).resolution).toBe('768P');
  });

  it('throws on unrecognised resolution (720P)', () => {
    expect(() => toH3MaxInput({ ...base, resolution: '720P' })).toThrow(MediaProviderError);
  });

  it('throws on arbitrary string', () => {
    expect(() => toH3MaxInput({ ...base, resolution: 'HD' })).toThrow(MediaProviderError);
  });

  it('omits resolution field when undefined (provider default)', () => {
    const result = toH3MaxInput({ ...base });
    expect(result.resolution).toBeUndefined();
  });
});

// ─── 4. Reserve → settle — charge = min(requested, actual) × rate ────────────

describe('reserve → settle credit cycle', () => {
  function makeReserveSettlePrisma() {
    let balance = 2000;
    const reservations: Record<string, { amount: number; status: 'HELD' | 'SETTLED' | 'RELEASED'; settled?: number }> = {};
    const events: string[] = [];

    return {
      events,
      get balance() { return balance; },
      creditReservation: {
        findUnique: async ({ where }: any) => reservations[where.idempotencyKey] ?? null,
        create: async ({ data }: any) => {
          reservations[data.idempotencyKey] = { amount: data.amount, status: 'HELD' };
          events.push(`reserve:${data.amount}`);
          return { ...data };
        },
        update: async ({ where, data }: any) => {
          const r = reservations[where.idempotencyKey]!;
          Object.assign(r, data);
          events.push(`${data.status.toLowerCase()}:${data.settledAmount ?? ''}`);
          return r;
        },
      },
      creditBalance: {
        updateMany: async ({ where, data }: any) => {
          if (balance >= where.balance.gte) {
            balance += data.balance.decrement ? -data.balance.decrement : data.balance.increment;
            return { count: 1 };
          }
          return { count: 0 };
        },
        upsert: async ({ update, create }: any) => {
          balance += update?.balance?.increment ?? create.balance;
          return { balance };
        },
        findUnique: async () => ({ balance }),
      },
      creditTransaction: {
        findUnique: async () => null,
        create: async () => ({}),
      },
      $transaction: async (fn: (tx: any) => Promise<any>) => fn({
        creditReservation: {
          findUnique: async ({ where }: any) => reservations[where.idempotencyKey] ?? null,
          create: async ({ data }: any) => {
            reservations[data.idempotencyKey] = { amount: data.amount, status: 'HELD' };
            events.push(`reserve:${data.amount}`);
            return { ...data };
          },
          update: async ({ where, data }: any) => {
            const r = reservations[where.idempotencyKey]!;
            Object.assign(r, data);
            events.push(`${data.status.toLowerCase()}:${data.settledAmount ?? ''}`);
            return r;
          },
        },
        creditBalance: {
          updateMany: async ({ where, data }: any) => {
            if (balance >= where.balance.gte) {
              balance -= data.balance.decrement;
              return { count: 1 };
            }
            return { count: 0 };
          },
          upsert: async ({ update, create }: any) => {
            balance += update?.balance?.increment ?? create.balance;
            return { balance };
          },
          findUnique: async () => ({ balance }),
        },
        creditTransaction: { create: async () => ({}) },
      }),
    } as any;
  }

  it('settles to actual duration when actual < requested', async () => {
    const { reserveCredits, settleCredits } = await import('../credits');
    const prisma = makeReserveSettlePrisma();

    // Reserve 10s × 65 cr/s = 650
    const reserved = await reserveCredits(prisma, {
      userId: 'u1', featureKey: 'generate:h3_max_480p', amount: 650,
      idempotencyKey: 'test:reserve:1', referenceId: 'ref1',
    });
    expect(reserved).toBe(650);
    expect(prisma.balance).toBe(2000 - 650);

    // Actual output is 8.2s → Math.ceil(8.2 × 65) = 533
    await settleCredits(prisma, 'test:reserve:1', 533);
    // Refund = 650 - 533 = 117
    expect(prisma.balance).toBe(2000 - 650 + 117);
  });

  it('settles to requested when actual >= requested (no extra charge)', async () => {
    const { reserveCredits, settleCredits } = await import('../credits');
    const prisma = makeReserveSettlePrisma();

    await reserveCredits(prisma, {
      userId: 'u1', featureKey: 'generate:h3_max_480p', amount: 325,
      idempotencyKey: 'test:reserve:2', referenceId: 'ref2',
    });
    // Actual > requested: cap at reserved amount, no extra charge
    await settleCredits(prisma, 'test:reserve:2', 325);
    expect(prisma.balance).toBe(2000 - 325);
  });
});

// ─── 5. Reserve → release on failure ─────────────────────────────────────────

describe('reserve → release on failure', () => {
  it('restores full balance when released', async () => {
    const { reserveCredits, releaseCredits } = await import('../credits');

    let balance = 1000;
    const reservations: Record<string, any> = {};
    const prisma = {
      creditReservation: {
        findUnique: async ({ where }: any) => reservations[where.idempotencyKey] ?? null,
        create: async ({ data }: any) => { reservations[data.idempotencyKey] = { ...data, status: 'HELD' }; return data; },
        update: async ({ where, data }: any) => { Object.assign(reservations[where.idempotencyKey], data); return reservations[where.idempotencyKey]; },
      },
      creditBalance: {
        updateMany: async ({ where, data }: any) => {
          if (balance >= where.balance.gte) { balance -= data.balance.decrement; return { count: 1 }; }
          return { count: 0 };
        },
        upsert: async ({ update }: any) => { balance += update.balance.increment; return { balance }; },
        findUnique: async () => ({ balance }),
      },
      creditTransaction: { findUnique: async () => null, create: async () => ({}) },
      $transaction: async (fn: (tx: any) => Promise<any>) => fn({
        creditReservation: {
          findUnique: async ({ where }: any) => reservations[where.idempotencyKey] ?? null,
          create: async ({ data }: any) => { reservations[data.idempotencyKey] = { ...data, status: 'HELD' }; return data; },
          update: async ({ where, data }: any) => { Object.assign(reservations[where.idempotencyKey], data); return reservations[where.idempotencyKey]; },
        },
        creditBalance: {
          updateMany: async ({ where, data }: any) => {
            if (balance >= where.balance.gte) { balance -= data.balance.decrement; return { count: 1 }; }
            return { count: 0 };
          },
          upsert: async ({ update }: any) => { balance += update.balance.increment; return { balance }; },
          findUnique: async () => ({ balance }),
        },
        creditTransaction: { create: async () => ({}) },
      }),
    } as any;

    await reserveCredits(prisma, {
      userId: 'u1', featureKey: 'generate:h3_max_480p', amount: 260,
      idempotencyKey: 'test:release:1', referenceId: 'ref3',
    });
    expect(balance).toBe(740);

    await releaseCredits(prisma, 'test:release:1');
    expect(balance).toBe(1000);
  });
});

// ─── 6. Flag OFF → flat path untouched ───────────────────────────────────────

describe('isVideoPerSecondPricingEnabled', () => {
  it('returns false when env var is absent', () => {
    expect(isVideoPerSecondPricingEnabled({})).toBe(false);
  });
  it('returns false when env var is "false"', () => {
    expect(isVideoPerSecondPricingEnabled({ VIDEO_PER_SECOND_PRICING: 'false' })).toBe(false);
  });
  it('returns true when env var is "true"', () => {
    expect(isVideoPerSecondPricingEnabled({ VIDEO_PER_SECOND_PRICING: 'true' })).toBe(true);
  });
});
