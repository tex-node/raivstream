/**
 * Unit-test setup: install a hermetic, always-allowing Redis fake so procedures
 * can be exercised through the tRPC middleware without a live Upstash instance.
 *
 * This is test-only scaffolding, not a production fallback: the module under
 * test still throws loudly when unconfigured, and `rateLimit.test.ts` overrides
 * this fake with a counting one to prove the window maths.
 */
import { beforeEach } from 'vitest';
import { __setRateLimitRedisForTests } from '../lib/resilience/rateLimit';

function alwaysAllowRedis() {
  const pipeline = {
    incr: () => pipeline,
    expire: () => pipeline,
    get: () => pipeline,
    // [incr, expire, get] results — one request counted, empty previous window.
    exec: async () => [[null, 1], [null, 1], [null, 0]],
  };
  return { pipeline: () => pipeline };
}

beforeEach(() => {
  __setRateLimitRedisForTests(alwaysAllowRedis());
});
