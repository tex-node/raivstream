'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { AdminSpinner, AdminStatCard } from '../AdminShell';

export default function AdminRevenuePage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = trpc.admin.listPurchases.useQuery({ page, pageSize: 25 });

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--noc-t1)]">Revenue</h1>
        <p className="mt-1 text-sm text-[var(--noc-t4)]">Credit purchase history and totals</p>
      </div>

      {data && (
        <div className="grid grid-cols-2 gap-4">
          <AdminStatCard label="All-Time Credits Sold" value={data.allTimeCreditsSold} sub="credits purchased" accent="#22c55e" />
          <AdminStatCard label="Total Transactions"    value={data.allTimeTransactions} sub="credit purchases" />
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-[var(--noc-hairline)]">
        {isLoading ? (
          <AdminSpinner />
        ) : error ? (
          <div className="px-6 py-8 text-sm text-red-300">{error.message}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--noc-hairline)] bg-[var(--noc-card)]">
                <th className="px-5 py-3 text-left font-medium text-[var(--noc-t4)]">User</th>
                <th className="px-5 py-3 text-right font-medium text-[var(--noc-t4)]">Credits</th>
                <th className="px-5 py-3 text-left font-medium text-[var(--noc-t4)]">Description</th>
                <th className="px-5 py-3 text-right font-medium text-[var(--noc-t4)]">Balance After</th>
                <th className="px-5 py-3 text-right font-medium text-[var(--noc-t4)]">Date</th>
              </tr>
            </thead>
            <tbody>
              {data?.transactions.map((tx, i) => (
                <tr key={tx.id} className={`border-t border-[var(--noc-hairline)] ${i % 2 !== 0 ? 'bg-white/[0.01]' : ''}`}>
                  <td className="px-5 py-3">
                    <div className="font-medium text-[var(--noc-t1)]">@{tx.user.username}</div>
                    <div className="text-xs text-[var(--noc-t4)]">{tx.user.email}</div>
                  </td>
                  <td className="px-5 py-3 text-right font-mono font-bold" style={{ color: '#22c55e' }}>
                    +{tx.amount.toLocaleString()}
                  </td>
                  <td className="px-5 py-3 text-xs text-[var(--noc-t4)]">{tx.description ?? '—'}</td>
                  <td className="px-5 py-3 text-right font-mono text-[var(--noc-t3)]">
                    {tx.balanceAfter.toLocaleString()}
                  </td>
                  <td className="px-5 py-3 text-right text-xs text-[var(--noc-t4)]">
                    {new Date(tx.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
              {data?.transactions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-[var(--noc-t5)]">No purchases yet</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--noc-t4)]">{data.total.toLocaleString()} transactions total</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-lg border border-[var(--noc-hairline)] px-3 py-1.5 text-[var(--noc-t3)] transition-colors hover:text-[var(--noc-t1)] disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60"
            >
              ←
            </button>
            <span className="text-[var(--noc-t3)]">Page {page} of {data.totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              disabled={page === data.totalPages}
              className="rounded-lg border border-[var(--noc-hairline)] px-3 py-1.5 text-[var(--noc-t3)] transition-colors hover:text-[var(--noc-t1)] disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60"
            >
              →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
