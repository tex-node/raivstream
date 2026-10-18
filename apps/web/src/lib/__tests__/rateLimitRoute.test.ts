import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Route-level adapter tests. `checkLimit` is mocked — the state machine is
 * covered by packages/api's rateLimit.test.ts; here we only assert the HTTP
 * shape the four credential routes return.
 */

const { checkLimitMock } = vi.hoisted(() => ({ checkLimitMock: vi.fn() }));

vi.mock('@raivstream/api/src/lib/resilience/rateLimit', () => ({
  checkLimit: checkLimitMock,
  BUCKETS: {
    authLogin: { windowMs: 900_000, max: 5 },
    authRegister: { windowMs: 900_000, max: 3 },
    authRefresh: { windowMs: 900_000, max: 30 },
    authGoogleLogin: { windowMs: 900_000, max: 10 },
  },
}));

import { rateLimitRoute } from '../rateLimit';

function request(ip = '203.0.113.7'): Request {
  return new Request('https://app.raivstream.com/api/auth/login', {
    method: 'POST',
    headers: { 'x-forwarded-for': `${ip}, 10.0.0.1` },
  });
}

beforeEach(() => {
  checkLimitMock.mockReset();
});

describe('rateLimitRoute', () => {
  it('13. passes through (null) under the limit, keyed by the first forwarded IP', async () => {
    checkLimitMock.mockResolvedValue({ allowed: true, remaining: 4, retryAfterMs: 0, bucket: 'authLogin' });

    const result = await rateLimitRoute(request(), 'authLogin');

    expect(result).toBeNull();
    expect(checkLimitMock).toHaveBeenCalledWith('ip:203.0.113.7:authLogin', 'authLogin');
  });

  it('14. returns 429 with Retry-After when over the limit', async () => {
    checkLimitMock.mockResolvedValue({ allowed: false, remaining: 0, retryAfterMs: 42_000, bucket: 'authLogin' });

    const response = await rateLimitRoute(request(), 'authLogin');

    expect(response).toBeInstanceOf(Response);
    expect(response!.status).toBe(429);
    expect(response!.headers.get('Retry-After')).toBe('42');
    expect(response!.headers.get('X-RateLimit-Limit')).toBe('5');
  });

  it('15. has no in-memory fallback left in the module', () => {
    const source = readFileSync(fileURLToPath(new URL('../rateLimit.ts', import.meta.url)), 'utf8');
    expect(source).not.toMatch(/new Map\(/);
    expect(source).not.toMatch(/memoryCheck/);
  });

  it('rejects a bucket it is not meant to own', async () => {
    await expect(rateLimitRoute(request(), 'auth' as never)).rejects.toThrow(/does not accept bucket/);
  });
});
