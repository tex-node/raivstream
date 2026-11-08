/**
 * Always-visible credit balance (2026-11-08).
 *
 * The read: `user.creditBalance` was consumed at /credits, /generate and by LowBalanceWarning, which
 * is threshold-gated below 500 - so above that threshold the product showed a creator nothing. There
 * was no header indicator and **no mutation invalidated the query**, which is why this component
 * does not rely on invalidation: it refetches on focus and on an interval, so the number is never
 * older than the window it declares. A balance that renders once and goes stale is worse than none.
 *
 * No `?? 0` fallback: during load it renders a skeleton, because flashing zero is a wrong number.
 * R16 decision: hidden. /credits is in R16_BLOCKED_ROUTES, and exposing an economy to a child is a
 * policy decision that must not arrive as a side effect of a header change.
 */
'use client';

import { useR16 } from '@/lib/r16';
import { useUser } from '@/lib/auth';
import { trpc } from '@/lib/trpc';

export function CreditBalancePill() {
  const isR16 = useR16();
  const { user } = useUser();

  const { data, isLoading } = trpc.user.creditBalance.useQuery(undefined, {
    enabled: Boolean(user) && !isR16,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
    staleTime: 0,
  });

  // Hidden for guests and on R16 by decision, not by inheritance.
  if (!user || isR16) return null;

  if (isLoading || !data) {
    return (
      <span
        aria-hidden="true"
        className="inline-block h-6 w-16 animate-pulse rounded-full"
        style={{ background: 'rgba(255,255,255,0.06)' }}
      />
    );
  }

  return (
    <span
      title="Credit balance"
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums"
      style={{ background: 'rgba(178,90,217,0.12)', color: 'var(--noc-purple)' }}
    >
      <span aria-hidden="true">⚡</span>
      {data.balance.toLocaleString()}
    </span>
  );
}
