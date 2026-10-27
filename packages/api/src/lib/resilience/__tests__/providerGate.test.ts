import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { breakerFor } from '../circuitBreaker';
import { assertProviderAvailable, evaluateProviderGate, providerIdForModel, __setProviderGateSnapshotForTests } from '../providerGate';
import * as creditsModule from '../../credits';
import * as generatorsModule from '../../generators';
import { appRouter } from '../../../index';

/**
 * D-084 - pre-charge provider gate.
 *
 * The behaviour under test is about money: an open circuit must reject BEFORE
 * the job row and before `deductCredits`, so a user never pays a round trip to
 * learn something the breaker already knows.
 */

function forceOpen(provider: string) {
  // An auth failure now trips on the FIRST strike (see circuitBreaker).
  return breakerFor(provider).call(async () => {
    throw Object.assign(new Error('fal ugc disabled: account locked (HTTP 403)'), { status: 403 });
  }).catch(() => undefined);
}

describe('providerGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves the provider from the registry, not from a display string', () => {
    expect(providerIdForModel('VEED_FABRIC')).toBe('fal');
    expect(providerIdForModel('H3_MAX')).toBe('fal');
    expect(providerIdForModel('NOT_A_MODEL')).toBeNull();
  });

  it('allows a closed circuit', () => {
    const decision = evaluateProviderGate('FLUX2');
    expect(decision.blocked).toBe(false);
    expect(() => assertProviderAvailable('FLUX2')).not.toThrow();
  });

  it('trips the breaker on the first auth failure and then blocks', async () => {
    await forceOpen('fal');

    const decision = evaluateProviderGate('VEED_FABRIC');
    expect(decision.state).toBe('open');
    expect(decision.blocked).toBe(true);

    const snapshot = breakerFor('fal').snapshot();
    expect(snapshot.lastFailureWasAuth).toBe(true);
    expect(snapshot.lastFailureCode).toBe('HTTP_403');
    expect(snapshot.lastFailureMessage).toMatch(/403/);

    expect(() => assertProviderAvailable('VEED_FABRIC')).toThrow(/temporarily unavailable/);
  });

  it('lets an unknown model through so submit can produce its own error', () => {
    expect(() => assertProviderAvailable('NOT_A_MODEL')).not.toThrow();
  });

  it('generation.create rejects before any charge when the circuit is open', async () => {
    await forceOpen('fal');

    const created: unknown[] = [];
    const prisma = {
      generationJob: {
        create: vi.fn(async ({ data }: { data: unknown }) => { created.push(data); return { id: 'job-1', ...(data as object) }; }),
        update: vi.fn(async () => ({})),
        delete: vi.fn(async () => ({})),
      },
      creditBalance: { findUnique: vi.fn(async () => ({ balance: 1000 })) },
    };
    const deduct = vi.spyOn(creditsModule, 'deductCredits').mockResolvedValue(80);
    const submit = vi.spyOn(generatorsModule, 'submitGenerationJob').mockResolvedValue({ providerJobId: 'p1' } as never);

    const caller = appRouter.createCaller({
      prisma: prisma as never,
      userId: 'u1',
      user: { id: 'u1', email: 'a@b.test', username: 't', displayName: 'T', role: 'CREATOR' as const },
    } as never);

    await expect(caller.generation.create({ model: 'FLUX2', prompt: 'a red fox' }))
      .rejects.toThrow(/temporarily unavailable/);

    expect(deduct).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    expect(created).toHaveLength(0);
  });
});

describe('providerGate - state handling', () => {
  function snap(state: 'closed' | 'open' | 'half-open') {
    return (id: string) => ({
      provider: id,
      state,
      failureCount: state === 'closed' ? 0 : 1,
      lastFailureAt: state === 'closed' ? null : new Date().toISOString(),
      openedAt: state === 'open' ? new Date().toISOString() : null,
      nextProbeAt: null,
      lastFailureCode: state === 'closed' ? null : '403',
      lastFailureMessage: state === 'closed' ? null : 'account locked (HTTP 403)',
      lastFailureWasAuth: state !== 'closed',
    });
  }

  afterEach(() => __setProviderGateSnapshotForTests(null));

  it('blocks only when open', () => {
    __setProviderGateSnapshotForTests(snap('open'));
    expect(evaluateProviderGate('FLUX2').blocked).toBe(true);
    expect(() => assertProviderAvailable('FLUX2')).toThrow(/temporarily unavailable/);
  });

  it('allows half-open so recovery is never starved', () => {
    __setProviderGateSnapshotForTests(snap('half-open'));
    expect(evaluateProviderGate('FLUX2').blocked).toBe(false);
    expect(() => assertProviderAvailable('FLUX2')).not.toThrow();
  });

  it('allows closed', () => {
    __setProviderGateSnapshotForTests(snap('closed'));
    expect(() => assertProviderAvailable('FLUX2')).not.toThrow();
  });
});

describe('admin.providerHealth', () => {
  it('returns all seven providers and synthesises a locked account', async () => {
    __setProviderGateSnapshotForTests((id) => ({
      provider: id,
      state: id === 'fal' ? 'open' : 'closed',
      failureCount: id === 'fal' ? 1 : 0,
      lastFailureAt: id === 'fal' ? new Date().toISOString() : null,
      openedAt: id === 'fal' ? new Date().toISOString() : null,
      nextProbeAt: null,
      lastFailureCode: id === 'fal' ? '403' : null,
      lastFailureMessage: id === 'fal' ? 'fal ugc disabled: account locked (HTTP 403)' : null,
      lastFailureWasAuth: id === 'fal',
    }));

    const caller = appRouter.createCaller({
      prisma: {} as never,
      userId: 'admin-1',
      user: { id: 'admin-1', email: 'a@b.test', username: 'admin', displayName: 'A', role: 'MODERATOR' as const },
    } as never);

    const result = await caller.admin.providerHealth();

    expect(result.providers).toHaveLength(7);
    expect(result.summary.unavailable).toBe(1);
    expect(result.summary.locked).toBe(1);
    expect(result.providers.find((p) => p.id === 'fal')).toMatchObject({
      state: 'open',
      accountStatus: 'locked',
      lastFailureWasAuth: true,
      lastFailureCode: 'HTTP_403',
    });

    __setProviderGateSnapshotForTests(null);
  });
});