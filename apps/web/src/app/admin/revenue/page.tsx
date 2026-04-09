'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';

export default function AdminRevenuePage() {
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = trpc.admin.listPurchases.useQuery({ page, pageSize: 25 });

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-white text-2xl font-bold">Revenue</h1>
        <p className="text-white/40 text-sm mt-1">Credit purchase history and totals</p>
      </div>

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-2xl p-5 border" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}>
            <div className="text-xs text-white/40 font-medium uppercase tracking-wider mb-2">All-Time Credits Sold</div>
            <div className="text-2xl font-bold" style={{ color: '#22c55e' }}>
              {data.allTimeCreditsSold.toLocaleString()}
            </div>
            <div className="text-xs text-white/30 mt-1">credits purchased</div>
          </div>
          <div className="rounded-2xl p-5 border" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}>
            <div className="text-xs text-white/40 font-medium uppercase tracking-wider mb-2">Total Transactions</div>
            <div className="text-2xl font-bold text-white">
              {data.allTimeTransactions.toLocaleString()}
            </div>
            <div className="text-xs text-white/30 mt-1">credit purchases</div>
          </div>
        </div>
      )}

      {/* Transactions table */}
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="px-6 py-8 text-red-300 text-sm">{error.message}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <th className="text-left px-5 py-3 text-white/40 font-medium">User</th>
                <th className="text-right px-5 py-3 text-white/40 font-medium">Credits</th>
                <th className="text-left px-5 py-3 text-white/40 font-medium">Description</th>
                <th className="text-right px-5 py-3 text-white/40 font-medium">Balance After</th>
                <th className="text-right px-5 py-3 text-white/40 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {data?.transactions.map((tx, i) => (
                <tr key={tx.id}
                  className="border-t"
                  style={{
                    borderColor: 'rgba(255,255,255,0.05)',
                    background:  i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                  }}
                >
                  <td className="px-5 py-3">
                    <div className="text-white font-medium">@{tx.user.username}</div>
                    <div className="text-xs text-white/40">{tx.user.email}</div>
                  </td>
                  <td className="px-5 py-3 text-right font-mono font-bold" style={{ color: '#22c55e' }}>
                    +{tx.amount.toLocaleString()}
                  </td>
                  <td className="px-5 py-3 text-white/50 text-xs">{tx.description ?? '—'}</td>
                  <td className="px-5 py-3 text-right font-mono text-white/60">
                    {tx.balanceAfter.toLocaleString()}
                  </td>
                  <td className="px-5 py-3 text-right text-white/40 text-xs">
                    {new Date(tx.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
              {data?.transactions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-white/30">No purchases yet</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-white/40">{data.total.toLocaleString()} transactions total</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-lg disabled:opacity-30 text-white/60 hover:text-white transition-colors border"
              style={{ borderColor: 'rgba(255,255,255,0.10)' }}
            >
              ←
            </button>
            <span className="text-white/60">Page {page} of {data.totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              disabled={page === data.totalPages}
              className="px-3 py-1.5 rounded-lg disabled:opacity-30 text-white/60 hover:text-white transition-colors border"
              style={{ borderColor: 'rgba(255,255,255,0.10)' }}
            >
              →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


