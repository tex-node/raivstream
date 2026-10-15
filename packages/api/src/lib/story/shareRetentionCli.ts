/**
 * Phase 4b — share-attribution retention, CLI core.
 *
 * Calls the SAME function the admin procedure `runShareAttributionRetention`
 * uses (`recoverShareAttributionRetention`): rolls raw `share_attributions`
 * older than the 90-day window into `share_link_daily_counts`, then deletes the
 * raw rows. Kept separate from the script entrypoint so it is unit-testable
 * without a process-level side effect.
 */
import { recoverShareAttributionRetention } from './shareAttributionRetention';

export interface ShareRetentionPrisma {
  shareAttribution: unknown;
  shareLinkDailyCount: unknown;
  $transaction?: unknown;
}

export async function runShareRetention(prisma: ShareRetentionPrisma) {
  return recoverShareAttributionRetention(prisma as never);
}
