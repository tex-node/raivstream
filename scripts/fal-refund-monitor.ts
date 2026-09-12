#!/usr/bin/env tsx
/**
 * Staging-only FAL refund monitoring command (READ-ONLY, DRY-RUN).
 *
 * Usage (from repo root, on the isolated staging host):
 *   RAIVSTREAM_ENV=staging pnpm fal:refund:monitor
 *
 * Optional cooldown state persistence (staging-only, outside the repo):
 *   FAL_REFUND_ALERT_STATE_FILE=/root/raivstream-secrets/fal-refund-alert-state.json
 *
 * Safety:
 *   - Fails closed unless RAIVSTREAM_ENV=staging (see assertStagingEnvironment).
 *   - Read-only: never claims/completes refunds, never mutates balances/ledger.
 *   - Never calls FAL/R2/generation. Default sink is a redacted dry-run logger.
 *   - No external notifications, scheduler, cron, or worker are activated.
 *
 * Exit codes: 0 = ran, 1 = runtime error, 2 = environment/guard refusal.
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { readFileSync, writeFileSync } from 'fs';

config({ path: resolve(__dirname, '../apps/web/.env.local') });
config({ path: resolve(__dirname, '../.env') });

async function main(): Promise<void> {
  const { assertStagingEnvironment } = await import('../packages/api/src/lib/mediaProviders/refundRecovery');

  try {
    assertStagingEnvironment(process.env as { RAIVSTREAM_ENV?: string; NODE_ENV?: string; DATABASE_URL?: string });
  } catch (error) {
    console.error(`refund-monitor: refused — ${error instanceof Error ? error.message : 'staging guard failed'}`);
    process.exit(2);
  }

  const stateFile = process.env.FAL_REFUND_ALERT_STATE_FILE;
  let previousState: Record<string, string> = {};
  if (stateFile) {
    try {
      previousState = JSON.parse(readFileSync(stateFile, 'utf8'));
    } catch {
      previousState = {};
    }
  }

  try {
    const { prisma } = await import('../packages/database');
    const { runRefundAlertCycle } = await import('../packages/api/src/lib/mediaProviders/refundAlertDispatch');

    const result = await runRefundAlertCycle(prisma, { previousState });
    console.log(
      `refund-monitor: detected=${result.detected} notified=${result.notified} suppressed=${result.suppressed}`,
    );

    if (stateFile) {
      try {
        writeFileSync(stateFile, JSON.stringify(result.nextState), { mode: 0o600 });
      } catch {
        console.error('refund-monitor: warning — could not persist cooldown state');
      }
    }

    await prisma.$disconnect().catch(() => undefined);
    process.exit(0);
  } catch {
    console.error('refund-monitor: failed — unrecoverable error');
    process.exit(1);
  }
}

main().catch(() => {
  console.error('refund-monitor: failed to start');
  process.exit(1);
});
