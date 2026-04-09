'use client';

import { trpc } from '@/lib/trpc';

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div
      className="rounded-2xl p-5 border"
      style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
    >
      <div className="text-xs text-white/40 font-medium uppercase tracking-wider mb-2">{label}</div>
      <div className="text-2xl font-bold" style={{ color: accent ?? 'white' }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      {sub && <div className="text-xs text-white/30 mt-1">{sub}</div>}
    </div>
  );
}

const MODEL_LABELS: Record<string, string> = {
  GROK_IMAGINE: 'Grok Imagine',
  NANO_BANANA:  'Nano Banana',
  LTX2:         'LTX-2',
  WAN_25:       'Wan 2.5',
  KLING:        'Kling',
  HIGGSFIELD:   'Higgsfield',
};

const STATUS_COLORS: Record<string, string> = {
  COMPLETED:  '#22c55e',
  GENERATING: '#f59e0b',
  QUEUED:     '#a78bfa',
  FAILED:     '#ef4444',
  CANCELLED:  '#6b7280',
};

export default function AdminOverviewPage() {
  const { data, isLoading, error } = trpc.admin.getOverview.useQuery();

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-64">
        <div className="w-6 h-6 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 px-4 py-3 rounded-xl text-sm">
          {error.message}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { users, content, credits, revenue } = data;

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-white text-2xl font-bold">Dashboard Overview</h1>
        <p className="text-white/40 text-sm mt-1">Platform health at a glance</p>
      </div>

      {/* User stats */}
      <section>
        <h2 className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-3">Users</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Users"   value={users.total}    sub={`+${users.newToday} today`} accent="#a78bfa" />
          <StatCard label="Free Tier"     value={users.byTier.FREE ?? 0}     sub="No subscription" />
          <StatCard label="Viewer Plan"   value={users.byTier.VIEWER ?? 0}   sub="₦1,500/month" accent="#22c55e" />
          <StatCard label="Creator Plan"  value={users.byTier.CREATOR ?? 0}  sub="Credit buyers"  accent="#f59e0b" />
        </div>
      </section>

      {/* Roles breakdown */}
      <section>
        <h2 className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-3">Roles</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Viewers"    value={users.byRole.VIEWER    ?? 0} />
          <StatCard label="Creators"   value={users.byRole.CREATOR   ?? 0} accent="#a78bfa" />
          <StatCard label="Moderators" value={users.byRole.MODERATOR ?? 0} accent="#f59e0b" />
          <StatCard label="Admins"     value={users.byRole.ADMIN     ?? 0} accent="#ef4444" />
        </div>
      </section>

      {/* Content & watch */}
      <section>
        <h2 className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-3">Content</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Published Videos"  value={content.totalVideos}     accent="#22c55e" />
          <StatCard label="Total Watch Hours" value={`${content.totalWatchHours.toLocaleString()}h`} accent="#a78bfa" />
          <StatCard label="AI Jobs Run"       value={credits.totalGenerationJobs} />
          <StatCard label="Credits in Wallet" value={credits.inCirculation}   sub="across all users" accent="#f59e0b" />
        </div>
      </section>

      {/* AI job status breakdown */}
      <section>
        <h2 className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-3">AI Generation Status</h2>
        <div className="grid grid-cols-5 gap-3">
          {Object.entries(credits.jobsByStatus).map(([status, count]) => (
            <div key={status}
              className="rounded-xl p-4 border text-center"
              style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
            >
              <div className="text-xl font-bold" style={{ color: STATUS_COLORS[status] ?? 'white' }}>
                {(count as number).toLocaleString()}
              </div>
              <div className="text-xs text-white/40 mt-1 capitalize">{status.toLowerCase()}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Model usage */}
      <section>
        <h2 className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-3">AI Model Usage</h2>
        <div
          className="rounded-2xl border overflow-hidden"
          style={{ borderColor: 'rgba(255,255,255,0.08)' }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <th className="text-left px-5 py-3 text-white/40 font-medium">Model</th>
                <th className="text-right px-5 py-3 text-white/40 font-medium">Jobs</th>
                <th className="text-right px-5 py-3 text-white/40 font-medium">Credits Used</th>
              </tr>
            </thead>
            <tbody>
              {credits.jobsByModel.map((row: { model: string; count: number; creditsUsed: number }, i: number) => (
                <tr key={row.model}
                  className="border-t"
                  style={{ borderColor: 'rgba(255,255,255,0.05)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}
                >
                  <td className="px-5 py-3 text-white font-medium">{MODEL_LABELS[row.model] ?? row.model}</td>
                  <td className="px-5 py-3 text-right text-white/70">{row.count.toLocaleString()}</td>
                  <td className="px-5 py-3 text-right" style={{ color: '#a78bfa' }}>{row.creditsUsed.toLocaleString()}</td>
                </tr>
              ))}
              {credits.jobsByModel.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-5 py-8 text-center text-white/30">No generation jobs yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Revenue */}
      <section>
        <h2 className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-3">Revenue (Last 30 Days)</h2>
        <div className="grid grid-cols-2 gap-4">
          <StatCard
            label="Credits Sold"
            value={revenue.last30DaysCreditsPurchased.toLocaleString()}
            sub="credits purchased"
            accent="#22c55e"
          />
          <StatCard
            label="Transactions"
            value={revenue.last30DaysTransactions}
            sub="credit purchase events"
          />
        </div>
      </section>
    </div>
  );
}
