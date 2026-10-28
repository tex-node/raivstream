import { describe, it, expect, vi } from 'vitest';
import { reconcileStuckJobs } from '../jobReconciliation';

/**
 * Reconciliation exists because a paid render can complete at the provider while
 * the poll never records it (the 7-hour stuck job after Postgres died).
 *
 * The property that matters most: a COMPLETED row must never point at the
 * provider's expiring CDN URL. Mirroring happens BEFORE the row is updated.
 */

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    model: 'VEED_FABRIC',
    providerJobId: 'fal:abc-123',
    userId: 'u1',
    featureKey: 'generate:veed_fabric_480p',
    costCredits: 1125,
    ...overrides,
  };
}

function prisma(rows: Array<Record<string, unknown>>) {
  const updates: Array<{ where: { id: string }; data: Record<string, unknown> }> = [];
  return {
    updates,
    generationJob: {
      findMany: vi.fn(async () => rows),
      update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        updates.push(args);
        return args;
      }),
    },
  };
}

function fetchSequence(responses: Array<{ ok?: boolean; json: unknown }>) {
  let i = 0;
  return vi.fn(async () => {
    const next = responses[Math.min(i++, responses.length - 1)];
    return { ok: next.ok ?? true, status: next.ok === false ? 500 : 200, json: async () => next.json };
  }) as unknown as typeof fetch;
}

describe('reconcileStuckJobs', () => {
  it('mirrors a completed render to R2 and marks the row COMPLETED', async () => {
    process.env.FAL_KEY = 'test-key';
    const p = prisma([job()]);
    const mirror = vi.fn(async () => 'https://cdn.test/generated/veed-fabric/job-1.mp4');

    const summary = await reconcileStuckJobs({
      prisma: p as never,
      fetchImpl: fetchSequence([
        { json: { status: 'COMPLETED' } },
        { json: { video: { url: 'https://fal.test/temp.mp4' } } },
      ]),
      mirror,
    });

    expect(summary.fixed).toBe(1);
    expect(mirror).toHaveBeenCalledWith('https://fal.test/temp.mp4', expect.stringContaining('job-1'), 'video/mp4');
    expect(p.updates[0].data).toMatchObject({
      status: 'COMPLETED',
      outputUrl: 'https://cdn.test/generated/veed-fabric/job-1.mp4',
    });
  });

  it('leaves the row alone when the provider is still running', async () => {
    process.env.FAL_KEY = 'test-key';
    const p = prisma([job()]);

    const summary = await reconcileStuckJobs({
      prisma: p as never,
      fetchImpl: fetchSequence([{ json: { status: 'IN_PROGRESS' } }]),
      mirror: vi.fn(),
    });

    expect(summary.stillPending).toBe(1);
    expect(p.updates).toHaveLength(0);
  });

  it('marks FAILED and refunds when the provider reports failure', async () => {
    process.env.FAL_KEY = 'test-key';
    const p = prisma([job()]);
    const refund = vi.fn(async () => {});

    const summary = await reconcileStuckJobs({
      prisma: p as never,
      fetchImpl: fetchSequence([{ json: { status: 'FAILED' } }]),
      mirror: vi.fn(),
      refund,
    });

    expect(summary.failed).toBe(1);
    expect(p.updates[0].data.status).toBe('FAILED');
    expect(refund).toHaveBeenCalledTimes(1);
  });

  it('does not mark COMPLETED when mirroring throws', async () => {
    process.env.FAL_KEY = 'test-key';
    const p = prisma([job()]);

    const summary = await reconcileStuckJobs({
      prisma: p as never,
      fetchImpl: fetchSequence([
        { json: { status: 'COMPLETED' } },
        { json: { video: { url: 'https://fal.test/temp.mp4' } } },
      ]),
      mirror: vi.fn(async () => { throw new Error('R2 unavailable'); }),
    });

    expect(summary.fixed).toBe(0);
    expect(p.updates).toHaveLength(0);
  });

  it('skips models with no endpoint mapping rather than guessing', async () => {
    process.env.FAL_KEY = 'test-key';
    const p = prisma([job({ model: 'SOME_OTHER_MODEL' })]);

    const summary = await reconcileStuckJobs({
      prisma: p as never,
      fetchImpl: fetchSequence([{ json: { status: 'COMPLETED' } }]),
      mirror: vi.fn(),
    });

    expect(summary.skipped).toBe(1);
    expect(p.updates).toHaveLength(0);
  });
});
