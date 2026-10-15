#!/usr/bin/env tsx
/**
 * Phase 4b — share-attribution retention CLI.
 *
 * Rolls raw `share_attributions` older than 90 days into
 * `share_link_daily_counts`, then deletes the raw rows. Same function as
 * `admin.runShareAttributionRetention`; no HTTP, no admin token. Idempotent.
 *
 * Usage: pnpm --filter @raivstream/api share:retention
 */
import { PrismaClient } from '@raivstream/database';
import { runShareRetention } from '../src/lib/story/shareRetentionCli';

async function main() {
  const prisma = new PrismaClient();
  try {
    const result = await runShareRetention(prisma as never);
    console.log(`[share.retention] aggregated=${result.aggregated} deleted=${result.deleted}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[share.retention] failed', error);
  process.exit(1);
});
