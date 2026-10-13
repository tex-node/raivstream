'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { AdminSpinner, AdminError, AdminStatCard, AdminCard } from '../AdminShell';

const RANGES = [
  { days: 7,   label: '7D' },
  { days: 30,  label: '28D' },
  { days: 90,  label: '90D' },
];

export default function AdminUsagePage() {
  const [days, setDays] = useState(30);
  const [page, setPage] = useState(1);
  const [onlyDiscrepancies, setOnlyDiscrepancies] = useState(false);

  const usage = trpc.admin.usageReport.useQuery({ days });
  const recon = trpc.admin.reconcileBalances.useQuery({ page, pageSize: 25, onlyDiscrepancies });

  return (
    <div className="space-y-8 p-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--noc-t1)]">Usage &amp; Ledger</h1>
        <p className="mt-1 text-sm text-[var(--noc-t4)]">
          Purchases, grants, consumption and refunds — reconciled against the authoritative ledger.
        </p>
      </div>

      {/* ── Credit flows ─────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--noc-t4)]">Credit flows</h2>
          <div className="flex gap-1 rounded-full border border-[var(--noc-hairline)] p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.days}
                type="button"
                onClick={() => setDays(r.days)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  days === r.days ? 'bg-[var(--noc-blue)]/20 text-[var(--noc-blue)]' : 'text-[var(--noc-t4)] hover:text-[var(--noc-t1)]'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {usage.isLoading ? (
          <AdminSpinner />
        ) : usage.error ? (
          <AdminError message={usage.error.message} />
        ) : usage.data ? (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
              <AdminStatCard label="Purchases"   value={usage.data.credits.purchases.amount}   sub={`${usage.data.credits.purchases.count} transactions`} accent="#22c55e" />
              <AdminStatCard label="Grants"      value={usage.data.credits.grants.amount}      sub={`${usage.data.credits.grants.count} bonuses`} />
              <AdminStatCard label="Consumption" value={usage.data.credits.consumption.amount} sub={`${usage.data.credits.consumption.count} charges`} accent="#f472b6" />
              <AdminStatCard label="Refunds"     value={usage.data.credits.refunds.amount}     sub={`${usage.data.credits.refunds.count} refunds`} />
              <AdminStatCard label="Net Consumption" value={usage.data.credits.netConsumption} sub="consumption − refunds" />
            </div>

            <AdminCard className="overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--noc-hairline)] bg-white/[0.02]">
                    <th className="px-5 py-3 text-left font-medium text-[var(--noc-t4)]">Feature</th>
                    <th className="px-5 py-3 text-right font-medium text-[var(--noc-t4)]">Credits</th>
                    <th className="px-5 py-3 text-right font-medium text-[var(--noc-t4)]">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.data.credits.byFeature.map((f) => (
                    <tr key={f.featureKey} className="border-t border-[var(--noc-hairline)]">
                      <td className="px-5 py-3 font-mono text-xs text-[var(--noc-t2)]">{f.featureKey}</td>
                      <td className="px-5 py-3 text-right font-mono text-[var(--noc-t3)]">{f.amount.toLocaleString()}</td>
                      <td className="px-5 py-3 text-right text-[var(--noc-t4)]">{f.count.toLocaleString()}</td>
                    </tr>
                  ))}
                  {usage.data.credits.byFeature.length === 0 && (
                    <tr><td colSpan={3} className="px-5 py-8 text-center text-[var(--noc-t5)]">No consumption in window</td></tr>
                  )}
                </tbody>
              </table>
            </AdminCard>
          </>
        ) : null}
      </section>

      {/* ── Generation outcomes ──────────────────────────────────────────────── */}
      {usage.data && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--noc-t4)]">Generation outcomes</h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
            <AdminStatCard label="Attempts"            value={usage.data.generations.attempts} sub="generation jobs" />
            <AdminStatCard label="Successful"          value={usage.data.generations.completed} sub="completed" accent="#22c55e" />
            <AdminStatCard label="Failed"              value={usage.data.generations.failed} sub="failed" accent="#f87171" />
            <AdminStatCard label="Dead-letter"         value={usage.data.generations.deadLetterExhausted} sub="retries exhausted" />
            <AdminStatCard label="Cancelled"           value={usage.data.generations.cancelled} sub="cancelled" />
            <AdminStatCard label="Published assets"    value={usage.data.generations.publishedAssets} sub="linked to feed Video" />
          </div>
          <p className="text-xs text-[var(--noc-t5)]">
            Asset and generation counts are asset/generation counts — <span className="text-[var(--noc-t3)]">not token usage</span>.
            Failed generations are reported separately from total attempts.
          </p>
        </section>
      )}

      {/* ── Reconciliation ───────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--noc-t4)]">Balance reconciliation</h2>
            <p className="mt-1 text-xs text-[var(--noc-t5)]">
              Invariant: <code className="text-[var(--noc-t3)]">{recon.data?.invariant ?? 'SUM(ledger) === balance'}</code> · read-only
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs text-[var(--noc-t4)]">
            <input
              type="checkbox"
              checked={onlyDiscrepancies}
              onChange={(e) => { setOnlyDiscrepancies(e.target.checked); setPage(1); }}
              className="accent-[var(--noc-blue)]"
            />
            Only discrepancies
          </label>
        </div>

        {recon.isLoading ? (
          <AdminSpinner />
        ) : recon.error ? (
          <AdminError message={recon.error.message} />
        ) : recon.data ? (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <AdminStatCard label="Users"          value={recon.data.summary.totalUsers} />
              <AdminStatCard label="In Sync"        value={recon.data.summary.usersInSync} accent="#22c55e" />
              <AdminStatCard label="Discrepancies"  value={recon.data.summary.usersWithDiscrepancy} accent={recon.data.summary.usersWithDiscrepancy > 0 ? '#f87171' : undefined} />
              <AdminStatCard label="Abs. Discrepancy" value={recon.data.summary.absDiscrepancy} sub="sum of |balance − ledger|" />
            </div>

            <AdminCard className="overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--noc-hairline)] bg-white/[0.02]">
                    <th className="px-5 py-3 text-left font-medium text-[var(--noc-t4)]">User</th>
                    <th className="px-5 py-3 text-right font-medium text-[var(--noc-t4)]">Balance</th>
                    <th className="px-5 py-3 text-right font-medium text-[var(--noc-t4)]">Ledger Sum</th>
                    <th className="px-5 py-3 text-right font-medium text-[var(--noc-t4)]">Discrepancy</th>
                    <th className="px-5 py-3 text-right font-medium text-[var(--noc-t4)]">Entries</th>
                  </tr>
                </thead>
                <tbody>
                  {recon.data.rows.map((r) => (
                    <tr key={r.userId} className="border-t border-[var(--noc-hairline)]">
                      <td className="px-5 py-3">
                        <div className="font-medium text-[var(--noc-t1)]">@{r.username ?? r.userId.slice(0, 8)}</div>
                        {r.email && <div className="text-xs text-[var(--noc-t4)]">{r.email}</div>}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-[var(--noc-t3)]">{r.balance.toLocaleString()}</td>
                      <td className="px-5 py-3 text-right font-mono text-[var(--noc-t3)]">{r.ledgerSum.toLocaleString()}</td>
                      <td className="px-5 py-3 text-right font-mono font-bold" style={{ color: r.inSync ? '#22c55e' : '#f87171' }}>
                        {r.discrepancy > 0 ? '+' : ''}{r.discrepancy.toLocaleString()}
                      </td>
                      <td className="px-5 py-3 text-right text-[var(--noc-t4)]">{r.ledgerCount}</td>
                    </tr>
                  ))}
                  {recon.data.rows.length === 0 && (
                    <tr><td colSpan={5} className="px-5 py-8 text-center text-[var(--noc-t5)]">No rows</td></tr>
                  )}
                </tbody>
              </table>
            </AdminCard>

            {recon.data.totalPages > 1 && (
              <div className="flex items-center justify-between text-xs text-[var(--noc-t4)]">
                <span>Page {recon.data.page} of {recon.data.totalPages} · {recon.data.total} rows</span>
                <div className="flex gap-2">
                  <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-lg border border-[var(--noc-hairline)] px-3 py-1 disabled:opacity-40">Prev</button>
                  <button type="button" disabled={page >= recon.data.totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-[var(--noc-hairline)] px-3 py-1 disabled:opacity-40">Next</button>
                </div>
              </div>
            )}
          </>
        ) : null}
      </section>
    </div>
  );
}
