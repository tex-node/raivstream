import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Real-database integration tests require a disposable PostgreSQL cluster and
    // are run separately (`test:integration`) so the parallel unit suite cannot
    // starve their connection/TRUNCATE setup. See vitest.integration.config.ts.
    exclude: ['**/node_modules/**', '**/dist/**', 'src/**/*.integration.test.ts'],
    globals: true,
    clearMocks: true,
    restoreMocks: true,
    // Hermetic Redis fake for the rate-limit middleware (no live Upstash in CI),
    // and an inline export runner so service tests do not need a live queue.
    setupFiles: ['src/test/setupRateLimit.ts', 'src/test/setupExportRunner.ts'],
  },
});
