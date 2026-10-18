import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';

/**
 * The middleware's tRPC `.use(...)` wrapper lives in trpc.ts; everything
 * decision-making lives in `enforceRateLimit`, which is what these tests drive.
 * `checkLimit` is mocked (no Redis), so the assertions are about keys, buckets
 * and the error shape.
 */

const { checkLimitMock } = vi.hoisted(() => ({ checkLimitMock: vi.fn() }));

vi.mock('../resilience/rateLimit', () => ({
  checkLimit: checkLimitMock,
  BUCKETS: {},
}));

import { enforceRateLimit, __resetRateLimitWarningForTests } from '../resilience/rateLimitMiddleware';

type Call = [key: string, bucket: string];

function calls(): Call[] {
  return checkLimitMock.mock.calls.map(([key, bucket]) => [String(key), String(bucket)] as Call);
}
const bucketsChecked = () => calls().map(([, bucket]) => bucket);

beforeEach(() => {
  checkLimitMock.mockReset();
  __resetRateLimitWarningForTests();
  checkLimitMock.mockImplementation(async (_key: string, bucket: string) => ({
    allowed: true,
    remaining: 1,
    retryAfterMs: 0,
    bucket,
  }));
});

describe('enforceRateLimit — bucket selection', () => {
  it('7. unauthenticated requests use the ip key and unauth + unauthBurst', async () => {
    await enforceRateLimit({ path: 'feed.forYou', user: null, userId: null, ip: '203.0.113.9' });

    expect(bucketsChecked()).toEqual(['unauth', 'unauthBurst']);
    expect(calls()[0]![0]).toBe('ip:203.0.113.9:unauth');
  });

  it('8. authenticated requests use the user key and auth + authBurst', async () => {
    await enforceRateLimit({
      path: 'feed.following',
      user: { id: 'u1', role: 'CREATOR' },
      userId: 'u1',
      ip: '203.0.113.9',
    });

    expect(bucketsChecked()).toEqual(['auth', 'authBurst']);
    expect(calls()[0]![0]).toBe('user:u1:auth');
  });

  it('9. expensive procedures also hit the expensive buckets', async () => {
    await enforceRateLimit({
      path: 'generation.create',
      user: { id: 'u1', role: 'CREATOR' },
      userId: 'u1',
      ip: null,
    });

    expect(bucketsChecked()).toEqual(['auth', 'authBurst', 'expensive', 'expensiveBurst']);
    expect(calls()[2]![0]).toBe('user:u1:expensive');
  });

  it('10. admins use the admin bucket only — no burst, no expensive', async () => {
    await enforceRateLimit({
      path: 'generation.create',
      user: { id: 'admin1', role: 'ADMIN' },
      userId: 'admin1',
      ip: null,
    });

    expect(bucketsChecked()).toEqual(['admin']);
    expect(calls()[0]![0]).toBe('user:admin1:admin');
  });

  it('11. over the limit throws TOO_MANY_REQUESTS with retryAfterMs in the cause', async () => {
    checkLimitMock.mockImplementation(async (_key: string, bucket: string) =>
      bucket === 'expensive'
        ? { allowed: false, remaining: 0, retryAfterMs: 4_500, bucket }
        : { allowed: true, remaining: 1, retryAfterMs: 0, bucket },
    );

    const error = (await enforceRateLimit({
      path: 'generation.create',
      user: { id: 'u1', role: 'CREATOR' },
      userId: 'u1',
      ip: null,
    }).catch((e: unknown) => e)) as TRPCError;

    expect(error).toBeInstanceOf(TRPCError);
    expect(error.code).toBe('TOO_MANY_REQUESTS');
    const cause = error.cause as unknown as { bucket: string; retryAfterMs: number };
    expect(cause.bucket).toBe('expensive');
    expect(cause.retryAfterMs).toBe(4_500);
  });

  it('12. a missing ip falls back to ip:unknown and warns once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await enforceRateLimit({ path: 'feed.forYou', user: null, userId: null, ip: null });
    await enforceRateLimit({ path: 'feed.forYou', user: null, userId: null, ip: null });

    expect(calls()[0]![0]).toBe('ip:unknown:unauth');
    const ipWarnings = warn.mock.calls.filter((args) => String(args[0]).includes('ip_missing'));
    expect(ipWarnings).toHaveLength(1);

    warn.mockRestore();
  });
});
