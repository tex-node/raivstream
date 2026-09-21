'use client';

import { trpc } from '@/lib/trpc';
import { AdminSpinner, AdminError, AdminStatCard } from './AdminShell';
import { MODEL_LABELS } from '@/lib/modelLabels';

const STATUS_COLORS: Record<string, string> = {
  COMPLETED:  '#22c55e',
  GENERATING: '#f59e0b',
  QUEUED:     'var(--noc-purple)',
  FAILED:     '#ef4444',
  CANCELLED:  '#6b7280',
};

export default function AdminOverviewPage() {
  const { data, isLoading, error } = trpc.admin.getOverview.useQuery();

  if (isLoading) return <AdminSpinner />;
  if (error) return <div className="p-8"><AdminError message={error.message} /></div>;
  if (!data) return null;

  const { users, content, credits, revenue } = data;

  return (
    <div className="space-y-8 p-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--noc-t1)]">Dashboard Overview</h1>
        <p className="mt-1 text-sm text-[var(--noc-t4)]">Platform health at a glance</p>
      </div>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--noc-t4)]">Users</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <AdminStatCard label="Total Users"  value={users.total}              sub={`+${users.newToday} today`} accent="var(--noc-purple)" />
          <AdminStatCard label="Free Tier"    value={users.byTier.FREE ?? 0}  sub="No subscription" />
          <AdminStatCard label="Viewer Plan"  value={users.byTier.VIEWER ?? 0} sub="₦1,500/month" accent="#22c55e" />
          <AdminStatCard label="Creator Plan" value={users.byTier.CREATOR ?? 0} sub="Credit buyers" accent="#f59e0b" />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--noc-t4)]">Roles</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <AdminStatCard label="Viewers"    value={users.byRole.VIEWER    ?? 0} />
          <AdminStatCard label="Creators"   value={users.byRole.CREATOR   ?? 0} accent="var(--noc-purple)" />
          <AdminStatCard label="Moderators" value={users.byRole.MODERATOR ?? 0} accent="#f59e0b" />
          <AdminStatCard label="Admins"     value={users.byRole.ADMIN     ?? 0} accent="#ef4444" />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--noc-t4)]">Content</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <AdminStatCard label="Published Videos"  value={content.totalVideos}                                         accent="#22c55e" />
          <AdminStatCard label="Total Watch Hours" value={`${content.totalWatchHours.toLocaleString()}h`}              accent="var(--noc-purple)" />
          <AdminStatCard label="AI Jobs Run"       value={credits.totalGenerationJobs} />
          <AdminStatCard label="Credits in Wallet" value={credits.inCirculation} sub="across all users"               accent="#f59e0b" />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--noc-t4)]">AI Generation Status</h2>
        <div className="grid grid-cols-5 gap-3">
          {Object.entries(credits.jobsByStatus).map(([status, count]) => (
            <div key={status} className="rounded-xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] p-4 text-center">
              <div className="text-xl font-bold" style={{ color: STATUS_COLORS[status] ?? 'var(--noc-t1)' }}>
                {(count as number).toLocaleString()}
              </div>
              <div className="mt-1 text-xs capitalize text-[var(--noc-t4)]">{status.toLowerCase()}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--noc-t4)]">AI Model Usage</h2>
        <div className="overflow-hidden rounded-2xl border border-[var(--noc-hairline)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--noc-hairline)] bg-[var(--noc-card)]">
                <th className="px-5 py-3 text-left font-medium text-[var(--noc-t4)]">Model</th>
                <th className="px-5 py-3 text-right font-medium text-[var(--noc-t4)]">Jobs</th>
                <th className="px-5 py-3 text-right font-medium text-[var(--noc-t4)]">Credits Used</th>
              </tr>
            </thead>
            <tbody>
              {credits.jobsByModel.map((row: { model: string; count: number; creditsUsed: number }, i: number) => (
                <tr key={row.model} className={`border-t border-[var(--noc-hairline)] ${i % 2 !== 0 ? 'bg-white/[0.01]' : ''}`}>
                  <td className="px-5 py-3 font-medium text-[var(--noc-t1)]">{MODEL_LABELS[row.model] ?? row.model}</td>
                  <td className="px-5 py-3 text-right text-[var(--noc-t3)]">{row.count.toLocaleString()}</td>
                  <td className="px-5 py-3 text-right font-medium text-[var(--noc-purple)]">{row.creditsUsed.toLocaleString()}</td>
                </tr>
              ))}
              {credits.jobsByModel.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-5 py-8 text-center text-[var(--noc-t5)]">No generation jobs yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--noc-t4)]">Revenue (Last 30 Days)</h2>
        <div className="grid grid-cols-2 gap-4">
          <AdminStatCard label="Credits Sold"   value={revenue.last30DaysCreditsPurchased.toLocaleString()} sub="credits purchased"     accent="#22c55e" />
          <AdminStatCard label="Transactions"   value={revenue.last30DaysTransactions}                      sub="credit purchase events" />
        </div>
      </section>
    </div>
  );
}
