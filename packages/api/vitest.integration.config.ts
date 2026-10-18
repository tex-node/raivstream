import { defineConfig } from 'vitest/config';

/**
 * Isolated configuration for real-database integration tests.
 *
 * These tests require a reachable disposable PostgreSQL cluster (see
 * `docs/phase-6/PHASE-6D-ACCEPTANCE.md`) and perform real connection setup and
 * `TRUNCATE`s. Running them inside the default parallel unit suite starves the
 * `beforeAll` hook under load and times it out, so they are invoked separately:
 *
 *     pnpm --filter @raivstream/api test:integration
 *
 * `fileParallelism: false` keeps the single DB test file from competing with
 * itself; the raised hook/test timeouts give real network + DB setup headroom on
 * slow or loaded CI machines without masking an assertion failure.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    globals: true,
    clearMocks: true,
    restoreMocks: true,
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 60_000,
    setupFiles: ['src/test/setupRateLimit.ts'],
  },
});
