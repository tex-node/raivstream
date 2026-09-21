'use client';

import Link from 'next/link';
import { useUser } from '@/lib/auth';
import { trpc } from '@/lib/trpc';

/**
 * Persistent low-balance warning. Renders nothing unless the signed-in user's
 * credit balance is below the server-side LOW_BALANCE_THRESHOLD, in which case
 * it shows the balance prominently with a "low balance warning" label and a
 * top-up action. Place on generation surfaces so it is visible before the next
 * image is generated.
 */
export function LowBalanceWarning() {
  const { isSignedIn, isLoaded } = useUser();
  const { data } = trpc.user.creditBalance.useQuery(undefined, { enabled: Boolean(isSignedIn) });

  if (!isLoaded || !isSignedIn || !data?.lowBalance) return null;

  return (
    <div
      role="alert"
      className="flex items-center gap-3 rounded-xl border px-4 py-3"
      style={{ borderColor: 'rgba(245,158,11,0.45)', background: 'rgba(245,158,11,0.10)' }}
    >
      <svg aria-hidden="true" className="h-5 w-5 flex-shrink-0" fill="none" stroke="#f59e0b" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      </svg>
      <div className="flex-1">
        <p className="text-sm font-bold" style={{ color: '#f59e0b' }}>
          Low balance warning
        </p>
        <p className="text-xs" style={{ color: 'var(--noc-t4)' }}>
          Your balance is <strong style={{ color: 'var(--noc-t2)' }}>{data.balance.toLocaleString()} credits</strong> — below the{' '}
          {data.threshold.toLocaleString()}-unit threshold. Generation will stop once credits run out.
        </p>
      </div>
      <Link
        href="/credits"
        className="flex-shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90"
        style={{ background: '#f59e0b', color: '#0B0D14' }}
      >
        Top up
      </Link>
    </div>
  );
}