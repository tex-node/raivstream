import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@raivstream/database';
import {
  DEFAULT_ALERT_COOLDOWN_MS,
  deliverRefundAlerts,
  dryRunAlertSink,
  resolveAlertCooldownMs,
  runRefundAlertCycle,
  selectAlertsToNotify,
  toAlertNotification,
  type RefundAlertNotification,
} from '../refundAlertDispatch';
import type { RefundRecoveryAlert } from '../refundOperationsMonitor';

const NOW = new Date('2026-09-12T12:00:00.000Z');
const min = (n: number) => new Date(NOW.getTime() - n * 60_000);
const hours = (n: number) => new Date(NOW.getTime() - n * 60 * 60_000);

const alert = (over: Partial<RefundRecoveryAlert> = {}): RefundRecoveryAlert => ({
  kind: 'EXHAUSTED',
  severity: 'CRITICAL',
  dedupKey: 'fal-refund:exhausted',
  count: 1,
  message: '1 refund operation reached the attempt limit',
  ...over,
});

describe('cooldown / dedup selection', () => {
  it('notifies on first sight, suppresses within cooldown, re-notifies after it', () => {
    const first = selectAlertsToNotify([alert()], {}, { now: NOW, cooldownMs: 6 * 60 * 60_000 });
    expect(first.toNotify).toHaveLength(1);
    expect(first.suppressed).toHaveLength(0);
    expect(first.nextState['fal-refund:exhausted']).toBe(NOW.toISOString());

    const soon = selectAlertsToNotify([alert()], first.nextState, { now: min(-30), cooldownMs: 6 * 60 * 60_000 });
    expect(soon.toNotify).toHaveLength(0);
    expect(soon.suppressed).toHaveLength(1);
    expect(soon.nextState['fal-refund:exhausted']).toBe(NOW.toISOString()); // unchanged

    const later = selectAlertsToNotify([alert()], first.nextState, {
      now: new Date(NOW.getTime() + 7 * 60 * 60_000),
      cooldownMs: 6 * 60 * 60_000,
    });
    expect(later.toNotify).toHaveLength(1);
  });

  it('is deterministic and preserves unrelated state entries', () => {
    const prev = { 'fal-refund:other': NOW.toISOString() };
    const a = selectAlertsToNotify([alert()], prev, { now: NOW, cooldownMs: DEFAULT_ALERT_COOLDOWN_MS });
    const b = selectAlertsToNotify([alert()], prev, { now: NOW, cooldownMs: DEFAULT_ALERT_COOLDOWN_MS });
    expect(a.nextState).toEqual(b.nextState);
    expect(a.nextState['fal-refund:other']).toBe(NOW.toISOString());
  });

  it('resolves cooldown from env with a safe default', () => {
    expect(resolveAlertCooldownMs({})).toBe(DEFAULT_ALERT_COOLDOWN_MS);
    expect(resolveAlertCooldownMs({ FAL_REFUND_ALERT_COOLDOWN_MS: '1000' })).toBe(1000);
    expect(resolveAlertCooldownMs({ FAL_REFUND_ALERT_COOLDOWN_MS: '-5' })).toBe(DEFAULT_ALERT_COOLDOWN_MS);
    expect(resolveAlertCooldownMs({ FAL_REFUND_ALERT_COOLDOWN_MS: 'abc' })).toBe(DEFAULT_ALERT_COOLDOWN_MS);
  });
});

describe('notification payload + delivery', () => {
  it('builds a redacted, deterministic notification', () => {
    const n = toAlertNotification(
      alert({ kind: 'RECENT_FAILURE', severity: 'WARNING', dedupKey: 'fal-refund:failure:connection', count: 4, message: '4 recent refund failures categorized as CONNECTION' }),
      NOW.toISOString(),
    );
    expect(n).toMatchObject({ severity: 'WARNING', dedupKey: 'fal-refund:failure:connection', count: 4, title: 'FAL refunds repeated failures' });
    expect(n.message).not.toMatch(/https?:\/\/|postgres|@/);
  });

  it('delivers to an injected sink and defaults to a dry-run sink', async () => {
    const sink = vi.fn<(n: RefundAlertNotification) => void>();
    const res = await deliverRefundAlerts([alert()], sink, NOW.toISOString());
    expect(res.delivered).toBe(1);
    expect(sink).toHaveBeenCalledTimes(1);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await deliverRefundAlerts([alert()], dryRunAlertSink, NOW.toISOString());
    expect(logSpy.mock.calls[0][0]).toContain('[refund-alert][dry-run]');
    expect(logSpy.mock.calls[0][0]).toContain('severity=CRITICAL');
    logSpy.mockRestore();
  });
});

// ─── runRefundAlertCycle (read-only orchestration) ────────────────────────────

type Op = { idempotencyKey: string; status: string; attempts: number; amount: number; createdAt: Date; updatedAt: Date; lastError: string | null };

function makePrisma(ops: Op[]) {
  const matches = (op: Op, where: any): boolean => {
    if (!where) return true;
    if (typeof where.status === 'string' && op.status !== where.status) return false;
    if (where.status?.in && !where.status.in.includes(op.status)) return false;
    if (where.attempts?.lt !== undefined && !(op.attempts < where.attempts.lt)) return false;
    if (where.attempts?.gte !== undefined && !(op.attempts >= where.attempts.gte)) return false;
    if (where.updatedAt?.lt && !(op.updatedAt < where.updatedAt.lt)) return false;
    return true;
  };
  return {
    creditOperation: {
      count: async ({ where }: any) => ops.filter((o) => matches(o, where)).length,
      aggregate: async ({ where }: any) => {
        const sum = ops.filter((o) => matches(o, where)).reduce((s, o) => s + o.amount, 0);
        return { _sum: { amount: sum === 0 ? null : sum } };
      },
      findFirst: async ({ where, orderBy }: any) => {
        const list = ops.filter((o) => matches(o, where));
        if (!list.length) return null;
        return [...list].sort((a, b) => (orderBy?.createdAt === 'asc' ? a.createdAt.getTime() - b.createdAt.getTime() : b.updatedAt.getTime() - a.updatedAt.getTime()))[0];
      },
      findMany: async ({ where, take }: any) => ops.filter((o) => matches(o, where)).slice(0, take ?? ops.length),
    },
  } as unknown as PrismaClient;
}

const CYCLE_OPS: Op[] = [
  { idempotencyKey: 'fal-refund:a', status: 'FAILED', attempts: 5, amount: 11, createdAt: hours(3), updatedAt: hours(26), lastError: 'ECONNREFUSED' },
  { idempotencyKey: 'fal-refund:b', status: 'FAILED', attempts: 1, amount: 7, createdAt: hours(2), updatedAt: hours(30), lastError: 'request timed out' },
];

describe('runRefundAlertCycle', () => {
  it('detects and notifies (read-only) and suppresses on a cooldown repeat', async () => {
    const prisma = makePrisma(CYCLE_OPS);
    const sink = vi.fn<(n: RefundAlertNotification) => void>();

    const first = await runRefundAlertCycle(prisma, { now: NOW, sink });
    expect(first.detected).toBeGreaterThan(0);
    expect(first.notified).toBe(first.detected);
    expect(first.suppressed).toBe(0);
    expect(sink).toHaveBeenCalledTimes(first.notified);

    const second = await runRefundAlertCycle(prisma, { now: min(-10), previousState: first.nextState, sink });
    expect(second.notified).toBe(0);
    expect(second.suppressed).toBe(first.detected);
  });

  it('handles an empty/healthy outbox with zero alerts', async () => {
    const res = await runRefundAlertCycle(makePrisma([]), { now: NOW, sink: vi.fn() });
    expect(res).toMatchObject({ detected: 0, notified: 0, suppressed: 0 });
    expect(res.notifications).toEqual([]);
  });
});
