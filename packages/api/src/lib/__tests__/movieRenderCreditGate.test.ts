import { describe, expect, it } from 'vitest';
import { resolveMovieRenderCreditRate } from '../credits';

function prismaMockWithRate(rate: { creditsPerUnit: number; isActive: boolean } | null) {
  return {
    featureCreditRate: {
      findUnique: async () => rate,
    },
  } as any;
}

describe('movie render credit gate', () => {
  // Case A — missing rate row
  it('returns MOVIE_RENDER_RATE_MISSING when no rate row exists', async () => {
    const result = await resolveMovieRenderCreditRate(prismaMockWithRate(null));
    expect(result.configured).toBe(false);
    expect(result.cost).toBe(0);
    expect(result.errorCode).toBe('MOVIE_RENDER_RATE_MISSING');
  });

  // Case B — zero or inactive rate
  it('returns MOVIE_RENDER_RATE_INVALID when rate is zero', async () => {
    const result = await resolveMovieRenderCreditRate(prismaMockWithRate({ creditsPerUnit: 0, isActive: true }));
    expect(result.configured).toBe(false);
    expect(result.cost).toBe(0);
    expect(result.errorCode).toBe('MOVIE_RENDER_RATE_INVALID');
  });

  it('returns MOVIE_RENDER_RATE_INVALID when rate is inactive', async () => {
    const result = await resolveMovieRenderCreditRate(prismaMockWithRate({ creditsPerUnit: 100, isActive: false }));
    expect(result.configured).toBe(false);
    expect(result.cost).toBe(0);
    expect(result.errorCode).toBe('MOVIE_RENDER_RATE_INVALID');
  });

  // Case C — valid positive rate (production value = 100)
  it('returns configured=true with cost when rate is active and positive', async () => {
    const result = await resolveMovieRenderCreditRate(prismaMockWithRate({ creditsPerUnit: 100, isActive: true }));
    expect(result.configured).toBe(true);
    expect(result.cost).toBe(100);
    expect(result.errorCode).toBeNull();
  });

  // Case D — idempotency: resolver is pure per call; no persistent side effects
  it('returns the same result on repeated calls with the same rate', async () => {
    const prisma = prismaMockWithRate({ creditsPerUnit: 100, isActive: true });
    const first = await resolveMovieRenderCreditRate(prisma);
    const second = await resolveMovieRenderCreditRate(prisma);
    expect(first).toEqual(second);
  });

  // Case E — confirmed zero persistent side effects on invalid configuration
  it('produces no mutation when rate is missing — resolver is read-only', async () => {
    const mutations: string[] = [];
    const prisma = {
      featureCreditRate: {
        findUnique: async () => null,
        upsert: async () => { mutations.push('upsert'); },
        create: async () => { mutations.push('create'); },
        update: async () => { mutations.push('update'); },
      },
    } as any;
    const result = await resolveMovieRenderCreditRate(prisma);
    expect(result.configured).toBe(false);
    expect(mutations).toHaveLength(0);
  });
});
