'use client';

/**
 * D-084 - provider health dashboard.
 *
 * Two failure modes, deliberately separated because the remedy differs:
 *   circuit_open  - transient; a probe retries automatically after cooldown.
 *   account locked - a 401/403 from the provider; only a human can fix it
 *                    (top up, unlock the key, or resolve a support ticket).
 *
 * Reading the two as one "provider down" state is what made the fal lock look
 * like a random outage for days.
 */


import { trpc } from '@/lib/trpc';

type Row = {
  id: string;
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  lastFailureAt: string | null;
  lastFailureCode: string | null;
  lastFailureWasAuth: boolean;
  configEnabled: boolean;
  accountStatus: 'locked' | null;
};

const STATE_STYLES: Record<Row['state'], string> = {
  closed: 'bg-[rgba(16,185,129,0.15)] text-[#34d399]',
  'half-open': 'bg-[rgba(245,158,11,0.15)] text-[#fbbf24]',
  open: 'bg-[rgba(239,68,68,0.15)] text-[#f87171]',
};

export default function ProviderHealthPage() {
  const { data, isLoading, error } = trpc.admin.providerHealth.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  const rows = (data?.providers ?? []) as Row[];
  const summary = data?.summary ?? { unavailable: 0, locked: 0 };

  const lockedRows = rows.filter((row) => row.accountStatus === 'locked');

  if (isLoading) {
    return <main className="p-8 text-[var(--noc-t4)]">Loading provider health…</main>;
  }

  if (error) {
    return (
      <main className="p-8 text-[var(--noc-magenta)]">
        Failed to load provider health: {error.message}
      </main>
    );
  }

  return (
    <main className="p-6">
      <h1 className="text-2xl font-black text-[var(--noc-t1)]">Provider Health</h1>
      <p className="mt-1 text-sm text-[var(--noc-t4)]">
        Circuit state is in-memory per process and resets on deploy. A breaker opens on the first
        401/403, or after the configured failure threshold for transient errors.
      </p>

      {summary.unavailable > 0 && (
        <div className="mt-4 rounded-xl border border-[rgba(239,68,68,0.4)] bg-[rgba(239,68,68,0.08)] px-4 py-3 text-sm font-semibold text-[#f87171]">
          ⚠️ {summary.unavailable} provider{summary.unavailable === 1 ? '' : 's'} unavailable
        </div>
      )}

      {lockedRows.map((row) => (
        <div
          key={`locked-${row.id}`}
          className="mt-3 rounded-xl border border-[rgba(245,158,11,0.4)] bg-[rgba(245,158,11,0.08)] px-4 py-3 text-sm font-semibold text-[#fbbf24]"
        >
          🔒 {row.id} account locked — this is an account or key problem, not an outage.
          {row.lastFailureCode ? ` (${row.lastFailureCode})` : ''} Check the provider dashboard
          (balance / key status) before retrying.
        </div>
      ))}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-[var(--noc-hairline)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--noc-card)] text-xs uppercase tracking-wider text-[var(--noc-t5)]">
            <tr>
              <th className="px-4 py-3">Provider</th>
              <th className="px-4 py-3">State</th>
              <th className="px-4 py-3">Failures</th>
              <th className="px-4 py-3">Last failure</th>
              <th className="px-4 py-3">Error</th>
              <th className="px-4 py-3">Config</th>
              <th className="px-4 py-3">Account</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-[var(--noc-hairline)]">
                <td className="px-4 py-3 font-mono text-[var(--noc-t1)]">{row.id}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATE_STYLES[row.state]}`}>
                    {row.state}
                  </span>
                </td>
                <td className="px-4 py-3 text-[var(--noc-t3)]">{row.failureCount}</td>
                <td className="px-4 py-3 text-[var(--noc-t4)]">
                  {row.lastFailureAt ? new Date(row.lastFailureAt).toLocaleString() : '—'}
                </td>
                <td className="max-w-[220px] truncate px-4 py-3 text-[var(--noc-t5)]" title={row.lastFailureCode ?? ''}>
                  {row.lastFailureCode ?? '—'}
                  {row.lastFailureWasAuth && (
                    <span className="ml-2 text-xs font-bold text-[#fbbf24]">auth</span>
                  )}
                </td>
                <td className="px-4 py-3 text-[var(--noc-t4)]">
                  {row.configEnabled ? 'configured' : 'missing key'}
                </td>
                <td className="px-4 py-3">
                  {row.accountStatus === 'locked' ? (
                    <span className="font-bold text-[#fbbf24]">locked</span>
                  ) : (
                    <span className="text-[var(--noc-t6)]">ok</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-[var(--noc-t6)]">
        {rows.length} providers · {summary.unavailable} unavailable · {summary.locked} locked
      </p>
    </main>
  );
}
