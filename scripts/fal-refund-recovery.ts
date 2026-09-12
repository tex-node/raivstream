#!/usr/bin/env tsx
/**
 * Staging-only manual recovery for FAL refund operations (CreditOperation outbox).
 *
 * Usage (from repo root):
 *   RAIVSTREAM_ENV=staging pnpm fal:refund:recover [limit]
 *
 * Safety:
 *   - Fails closed unless RAIVSTREAM_ENV=staging and NODE_ENV != production.
 *   - Refuses known production database hosts.
 *   - No FAL provider calls, no R2 writes, no manual credit edits.
 *   - Prints only counts (found/completed/skipped/failed); never secrets or URLs.
 *
 * Exit codes: 0 = completed, 1 = unrecoverable runtime error, 2 = refused by guard.
 */
import { config } from 'dotenv';
import { resolve } from 'path';

// Load the staging env first (mirrors scripts/runpod.ts), before any DB import.
config({ path: resolve(__dirname, '../apps/web/.env.local') });
config({ path: resolve(__dirname, '../.env') });

async function main(): Promise<void> {
  const limitRaw = process.argv[2];
  const { prisma } = await import('../packages/database');
  const { executeRecoveryCommand } = await import('../packages/api/src/lib/mediaProviders/refundRecovery');

  const code = await executeRecoveryCommand({ prisma, limitRaw });
  await prisma.$disconnect().catch(() => undefined);
  process.exit(code);
}

main().catch(() => {
  console.error('refund-recovery: failed to start');
  process.exit(1);
});
