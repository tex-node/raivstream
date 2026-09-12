/**
 * Refund alert dispatch — read-only detection, dedup/cooldown, dry-run delivery.
 *
 * This module only reads refund operations (via refundOperationsMonitor). It
 * never claims/completes operations, mutates balances, touches the ledger, or
 * calls FAL/R2/generation. No external notification integration is activated
 * here; the default sink is a redacted dry-run logger. A future scheduler must
 * be added in a separate, explicitly approved task.
 */

import type { PrismaClient } from '@raivstream/database';
import {
  detectRefundRecoveryAlerts,
  type RefundRecoveryAlert,
  type AlertSeverity,
  type MonitorOptions,
} from './refundOperationsMonitor';

export const DEFAULT_ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6h, named

/** dedupKey -> ISO timestamp of the last notification. Serializable for future persistence. */
export type AlertCooldownState = Record<string, string>;

export function resolveAlertCooldownMs(
  env: { FAL_REFUND_ALERT_COOLDOWN_MS?: string } = process.env as { FAL_REFUND_ALERT_COOLDOWN_MS?: string },
): number {
  const raw = env.FAL_REFUND_ALERT_COOLDOWN_MS;
  if (!raw) return DEFAULT_ALERT_COOLDOWN_MS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ALERT_COOLDOWN_MS;
}

export interface CooldownOptions {
  now?: Date;
  cooldownMs?: number;
}

export interface AlertCooldownDecision {
  toNotify: RefundRecoveryAlert[];
  suppressed: RefundRecoveryAlert[];
  nextState: AlertCooldownState;
}

/**
 * Applies per-dedupKey cooldown. Deterministic: given the same alerts, previous
 * state, now, and cooldown, it returns the same decision. An alert re-notifies
 * only once its cooldown window has elapsed.
 */
export function selectAlertsToNotify(
  alerts: RefundRecoveryAlert[],
  previousState: AlertCooldownState = {},
  options: CooldownOptions = {},
): AlertCooldownDecision {
  const nowMs = (options.now ?? new Date()).getTime();
  const cooldownMs = options.cooldownMs ?? resolveAlertCooldownMs();
  const nextState: AlertCooldownState = { ...previousState };
  const toNotify: RefundRecoveryAlert[] = [];
  const suppressed: RefundRecoveryAlert[] = [];

  for (const alert of alerts) {
    const lastIso = previousState[alert.dedupKey];
    const lastMs = lastIso ? Date.parse(lastIso) : Number.NaN;
    if (Number.isFinite(lastMs) && nowMs - lastMs < cooldownMs) {
      suppressed.push(alert);
      continue;
    }
    toNotify.push(alert);
    nextState[alert.dedupKey] = new Date(nowMs).toISOString();
  }

  return { toNotify, suppressed, nextState };
}

export interface RefundAlertNotification {
  severity: AlertSeverity;
  dedupKey: string;
  count: number;
  title: string;
  message: string;
  generatedAt: string;
}

const TITLE_BY_KIND: Record<RefundRecoveryAlert['kind'], string> = {
  EXHAUSTED: 'FAL refunds exhausted',
  STALE_FAILED: 'FAL refunds stale',
  RECENT_FAILURE: 'FAL refunds repeated failures',
};

/** Builds a redacted, deterministic notification payload (no user ids/secrets). */
export function toAlertNotification(alert: RefundRecoveryAlert, generatedAt: string): RefundAlertNotification {
  return {
    severity: alert.severity,
    dedupKey: alert.dedupKey,
    count: alert.count,
    title: TITLE_BY_KIND[alert.kind],
    message: alert.message,
    generatedAt,
  };
}

export type AlertSink = (notification: RefundAlertNotification) => void | Promise<void>;

/** Default sink: prints a redacted dry-run line. No external delivery. */
export const dryRunAlertSink: AlertSink = (notification) => {
  console.log(
    `[refund-alert][dry-run] severity=${notification.severity} key=${notification.dedupKey} count=${notification.count} :: ${notification.message}`,
  );
};

export async function deliverRefundAlerts(
  alerts: RefundRecoveryAlert[],
  sink: AlertSink = dryRunAlertSink,
  generatedAt = new Date().toISOString(),
): Promise<{ delivered: number; notifications: RefundAlertNotification[] }> {
  const notifications = alerts.map((alert) => toAlertNotification(alert, generatedAt));
  for (const notification of notifications) await sink(notification);
  return { delivered: notifications.length, notifications };
}

export interface RefundAlertCycleOptions extends MonitorOptions {
  previousState?: AlertCooldownState;
  cooldownMs?: number;
  sink?: AlertSink;
}

export interface RefundAlertCycleResult {
  generatedAt: string;
  detected: number;
  notified: number;
  suppressed: number;
  notifications: RefundAlertNotification[];
  nextState: AlertCooldownState;
}

/**
 * Read-only alert cycle: detect -> cooldown-filter -> deliver (dry-run by default).
 * Safe to invoke manually; does not mutate refund/credit state.
 */
export async function runRefundAlertCycle(
  prisma: PrismaClient,
  options: RefundAlertCycleOptions = {},
): Promise<RefundAlertCycleResult> {
  const now = options.now ?? new Date();
  const generatedAt = now.toISOString();

  const issues = await detectRefundRecoveryAlerts(prisma, options);
  const decision = selectAlertsToNotify(issues.alerts, options.previousState ?? {}, {
    now,
    cooldownMs: options.cooldownMs,
  });
  const { notifications } = await deliverRefundAlerts(decision.toNotify, options.sink ?? dryRunAlertSink, generatedAt);

  return {
    generatedAt,
    detected: issues.alerts.length,
    notified: notifications.length,
    suppressed: decision.suppressed.length,
    notifications,
    nextState: decision.nextState,
  };
}
