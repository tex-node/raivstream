import { PrismaClient } from '@prisma/client';

/**
 * Re-exported for callers that need the class rather than the singleton (2026-11-19).
 *
 * The operations scripts used `import { PrismaClient } from '@prisma/client'`, which the repository root does not declare
 * — so the import only resolved when hoisting happened to provide it, and the scripts type-check could not see it at all.
 * Going through the workspace package gives one Prisma type identity and one declaration site.
 */
export { PrismaClient };

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  (new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  }).$extends({
    query: {
      async $allOperations({ operation, model, args, query }) {
        const start = performance.now();
        const result = await query(args);
        const end = performance.now();

        if (end - start > 1000) {
          console.warn(`⚠️ Slow query detected: ${model}.${operation} took ${end - start}ms`);
        }

        return result;
      },
    },
  }) as unknown as PrismaClient);

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma as unknown as PrismaClient;
}

export * from '@prisma/client';
