'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/lib/auth';

const ROLE_COLORS: Record<string, string> = {
  ADMIN:     '#ef4444',
  MODERATOR: '#f59e0b',
  CREATOR:   '#a78bfa',
  VIEWER:    '#6b7280',
};

const TIER_COLORS: Record<string, string> = {
  FREE:    '#6b7280',
  VIEWER:  '#22c55e',
  CREATOR: '#f59e0b',
};

type Role = 'VIEWER' | 'CREATOR' | 'MODERATOR' | 'ADMIN';

function AdjustCreditsModal({
  userId,
  username,
  currentBalance,
  onClose,
}: {
  userId: string;
  username: string;
  currentBalance: number;
  onClose: () => void;
}) {
  const [amount, setAmount]     = useState('');
  const [reason, setReason]     = useState('');
  const [error, setError]       = useState<string | null>(null);
  const utils = trpc.useUtils();

  const adjust = trpc.admin.adjustCredits.useMutation({
    onSuccess: () => {
      utils.admin.listUsers.invalidate();
      onClose();
    },
    onError: (e) => setError(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseInt(amount, 10);
    if (isNaN(n) || n === 0) { setError('Enter a non-zero integer'); return; }
    if (!reason.trim()) { setError('Reason is required'); return; }
    adjust.mutate({ userId, amount: n, description: reason });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-sm rounded-2xl border p-6"
        style={{ background: '#0d1526', borderColor: 'rgba(255,255,255,0.12)' }}>
        <h3 className="text-white font-bold text-lg mb-1">Adjust Credits</h3>
        <p className="text-white/40 text-sm mb-5">
          @{username} · current balance: <span className="text-violet-400">{currentBalance.toLocaleString()}</span>
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-3 py-2 rounded-xl">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs text-white/40 uppercase tracking-wider mb-1.5">
              Amount (positive = add, negative = deduct)
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 500 or -100"
              className="w-full rounded-xl px-4 py-2.5 text-white text-sm outline-none"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}
              required
            />
          </div>

          <div>
            <label className="block text-xs text-white/40 uppercase tracking-wider mb-1.5">Reason</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Promotional bonus"
              className="w-full rounded-xl px-4 py-2.5 text-white text-sm outline-none"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}
              required
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white/60 border"
              style={{ borderColor: 'rgba(255,255,255,0.10)' }}>
              Cancel
            </button>
            <button type="submit" disabled={adjust.isPending}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)' }}>
              {adjust.isPending ? 'Saving…' : 'Apply'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RoleSelect({ userId, currentRole }: { userId: string; currentRole: string }) {
  const { user: me } = useAuth();
  const utils = trpc.useUtils();
  const setRole = trpc.admin.setUserRole.useMutation({
    onSuccess: () => utils.admin.listUsers.invalidate(),
  });

  if (me?.role !== 'ADMIN') {
    return (
      <span className="text-xs font-semibold px-2 py-1 rounded-full"
        style={{ background: `${ROLE_COLORS[currentRole]}22`, color: ROLE_COLORS[currentRole] }}>
        {currentRole}
      </span>
    );
  }

  return (
    <select
      value={currentRole}
      disabled={setRole.isPending}
      onChange={(e) => setRole.mutate({ userId, role: e.target.value as Role })}
      className="text-xs font-semibold rounded-full px-2 py-1 outline-none cursor-pointer"
      style={{
        background: `${ROLE_COLORS[currentRole]}22`,
        color:  ROLE_COLORS[currentRole],
        border: 'none',
      }}
    >
      <option value="VIEWER">VIEWER</option>
      <option value="CREATOR">CREATOR</option>
      <option value="MODERATOR">MODERATOR</option>
      <option value="ADMIN">ADMIN</option>
    </select>
  );
}

export default function AdminUsersPage() {
  const [search, setSearch]   = useState('');
  const [role, setRole]       = useState<Role | undefined>();
  const [page, setPage]       = useState(1);
  const [creditModal, setCreditModal] = useState<{ userId: string; username: string; balance: number } | null>(null);

  const [debouncedSearch, setDebouncedSearch] = useState('');

  const handleSearchChange = (v: string) => {
    setSearch(v);
    clearTimeout((window as any)._searchDebounce);
    (window as any)._searchDebounce = setTimeout(() => {
      setDebouncedSearch(v);
      setPage(1);
    }, 350);
  };

  const { data, isLoading, error } = trpc.admin.listUsers.useQuery({
    search:   debouncedSearch || undefined,
    role,
    page,
    pageSize: 25,
  });

  return (
    <div className="p-8 space-y-6">
      {creditModal && (
        <AdjustCreditsModal
          userId={creditModal.userId}
          username={creditModal.username}
          currentBalance={creditModal.balance}
          onClose={() => setCreditModal(null)}
        />
      )}

      {/* Header */}
      <div>
        <h1 className="text-white text-2xl font-bold">Users</h1>
        <p className="text-white/40 text-sm mt-1">Manage accounts, roles, and credit balances</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search email / username…"
          className="rounded-xl px-4 py-2.5 text-white text-sm outline-none w-72"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}
        />

        <select
          value={role ?? ''}
          onChange={(e) => { setRole((e.target.value as Role) || undefined); setPage(1); }}
          className="rounded-xl px-3 py-2.5 text-sm outline-none"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: 'white' }}
        >
          <option value="">All roles</option>
          <option value="VIEWER">Viewer</option>
          <option value="CREATOR">Creator</option>
          <option value="MODERATOR">Moderator</option>
          <option value="ADMIN">Admin</option>
        </select>
      </div>

      {/* Table */}
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
                <th className="text-left px-5 py-3 text-white/40 font-medium">Role</th>
                <th className="text-left px-5 py-3 text-white/40 font-medium">Tier</th>
                <th className="text-right px-5 py-3 text-white/40 font-medium">Credits</th>
                <th className="text-right px-5 py-3 text-white/40 font-medium">Videos</th>
                <th className="text-right px-5 py-3 text-white/40 font-medium">Joined</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {data?.users.map((u, i) => (
                <tr key={u.id}
                  className="border-t"
                  style={{
                    borderColor: 'rgba(255,255,255,0.05)',
                    background:  i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                  }}
                >
                  <td className="px-5 py-3">
                    <div className="font-medium text-white">{u.displayName}</div>
                    <div className="text-xs text-white/40">@{u.username} · {u.email}</div>
                  </td>
                  <td className="px-5 py-3">
                    <RoleSelect userId={u.id} currentRole={u.role} />
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-xs font-semibold px-2 py-1 rounded-full"
                      style={{ background: `${TIER_COLORS[u.premiumTier]}22`, color: TIER_COLORS[u.premiumTier] }}>
                      {u.premiumTier}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-sm" style={{ color: '#a78bfa' }}>
                    {u.creditBalance.toLocaleString()}
                  </td>
                  <td className="px-5 py-3 text-right text-white/60">{u._count.videos}</td>
                  <td className="px-5 py-3 text-right text-white/40 text-xs">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => setCreditModal({ userId: u.id, username: u.username, balance: u.creditBalance })}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors hover:opacity-80"
                      style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa' }}
                    >
                      ⚡ Credits
                    </button>
                  </td>
                </tr>
              ))}
              {data?.users.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-white/30">No users found</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-white/40">{data.total.toLocaleString()} users total</span>
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


