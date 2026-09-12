'use client';

import { trpc } from '@/lib/trpc';
import { AdminSpinner, AdminError, AdminStatCard, AdminCard } from '../AdminShell';

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

function formatAge(ms?: number | null) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return '—';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export default function FalRefundsPage() {
  const { data, isLoading, error } = trpc.admin.refundOperations.useQuery(undefined, { refetchInterval: 60000 });

  if (isLoading) return <AdminSpinner />;
  if (error) return <div className="p-6"><AdminError message={error.message} /></div>;
  if (!data) return null;

  const { overview, alerts } = data;
  const { counts, amounts } = overview;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-bold text-[var(--noc-t1)]">FAL Refunds</h1>
        <p className="mt-1 text-sm text-[var(--noc-t4)]">
          Read-only refund outbox observability. No actions are available on this page.
        </p>
      </div>

      {alerts.length > 0 && (
        <AdminCard className="p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--noc-purple)]">Operator attention</div>
          <ul className="space-y-1 text-sm text-[var(--noc-t2)]">
            {alerts.map((alert) => (
              <li key={alert.dedupKey}>• {alert.message}</li>
            ))}
          </ul>
        </AdminCard>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <AdminStatCard label="Recoverable" value={counts.recoverable} sub={`${amounts.awaitingRecovery} credits awaiting`} />
        <AdminStatCard label="Exhausted" value={counts.exhausted} sub={`${amounts.exhausted} credits stuck`} accent={counts.exhausted > 0 ? 'var(--noc-purple)' : undefined} />
        <AdminStatCard label="Stale failed" value={counts.staleFailed} sub="Beyond stale threshold" />
        <AdminStatCard label="Completed" value={counts.completed} sub="Financially inert" />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <AdminStatCard label="Pending" value={counts.pending} />
        <AdminStatCard label="Failed" value={counts.failed} />
        <AdminStatCard label="Oldest unresolved" value={overview.oldestUnresolved ? formatAge(overview.oldestUnresolved.ageMs) : '—'} sub={overview.oldestUnresolved ? `attempts ${overview.oldestUnresolved.attempts}` : 'None'} />
        <AdminStatCard label="Latest update" value={formatDate(overview.latestOperationAt)} sub={`Stale threshold ${formatAge(overview.staleThresholdMs)}`} />
      </div>

      <AdminCard className="p-4">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--noc-t4)]">Recent failures</div>
        {overview.recentFailures.length === 0 ? (
          <div className="text-sm text-[var(--noc-t5)]">No failed refund operations.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-[var(--noc-t5)]">
                  <th className="py-2 pr-4">Key tag</th>
                  <th className="py-2 pr-4">Category</th>
                  <th className="py-2 pr-4">Attempts</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2 pr-4">Updated</th>
                  <th className="py-2">Error</th>
                </tr>
              </thead>
              <tbody className="text-[var(--noc-t2)]">
                {overview.recentFailures.map((failure, index) => (
                  <tr key={`${failure.idempotencyKeyTag}-${index}`} className="border-t border-[var(--noc-hairline)]">
                    <td className="py-2 pr-4 font-mono text-xs">{failure.idempotencyKeyTag}</td>
                    <td className="py-2 pr-4">{failure.errorCategory}</td>
                    <td className="py-2 pr-4">{failure.attempts}</td>
                    <td className="py-2 pr-4">{failure.amount}</td>
                    <td className="py-2 pr-4">{formatDate(failure.updatedAt)}</td>
                    <td className="py-2 text-xs text-[var(--noc-t4)]">{failure.errorPreview ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>
    </div>
  );
}
