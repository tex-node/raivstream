'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/lib/auth';
import { AdminSpinner, AdminError } from '../AdminShell';

const ROLE_COLORS: Record<string, string> = {
  ADMIN:     '#ef4444',
  MODERATOR: '#f59e0b',
  CREATOR:   'var(--noc-purple)',
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
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError]   = useState<string | null>(null);
  const utils = trpc.useUtils();

  const adjust = trpc.admin.adjustCredits.useMutation({
    onSuccess: () => { utils.admin.listUsers.invalidate(); onClose(); },
    onError:   (e) => setError(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseInt(amount, 10);
    if (isNaN(n) || n === 0) { setError('Enter a non-zero integer'); return; }
    if (!reason.trim()) { setError('Reason is required'); return; }
    adjust.mutate({ userId, amount: n, description: reason });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--noc-hairline)] bg-[#0d1526] p-6">
        <h3 className="text-lg font-bold text-[var(--noc-t1)]">Adjust Credits</h3>
        <p className="mb-5 mt-1 text-sm text-[var(--noc-t4)]">
          @{username} · current balance: <span className="text-[var(--noc-purple)]">{currentBalance.toLocaleString()}</span>
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <AdminError message={error} />}

          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-[var(--noc-t4)]">
              Amount (positive = add, negative = deduct)
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 500 or -100"
              className="w-full rounded-xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] px-4 py-2.5 text-sm text-[var(--noc-t1)] outline-none focus:border-[var(--noc-blue)]"
              required
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-[var(--noc-t4)]">Reason</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Promotional bonus"
              className="w-full rounded-xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] px-4 py-2.5 text-sm text-[var(--noc-t1)] outline-none focus:border-[var(--noc-blue)]"
              required
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-[var(--noc-hairline)] py-2.5 text-sm font-medium text-[var(--noc-t3)] hover:text-[var(--noc-t1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={adjust.isPending}
              className="flex-1 rounded-xl bg-[var(--noc-blue)] py-2.5 text-sm font-semibold text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60"
            >
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

  const roleColor = ROLE_COLORS[currentRole] ?? 'var(--noc-t4)';

  if (me?.role !== 'ADMIN') {
    return (
      <span className="rounded-full px-2 py-1 text-xs font-semibold" style={{ background: `${roleColor}22`, color: roleColor }}>
        {currentRole}
      </span>
    );
  }

  return (
    <select
      value={currentRole}
      disabled={setRole.isPending}
      onChange={(e) => setRole.mutate({ userId, role: e.target.value as Role })}
      className="cursor-pointer rounded-full px-2 py-1 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60"
      style={{ background: `${roleColor}22`, color: roleColor, border: 'none' }}
    >
      <option value="VIEWER">VIEWER</option>
      <option value="CREATOR">CREATOR</option>
      <option value="MODERATOR">MODERATOR</option>
      <option value="ADMIN">ADMIN</option>
    </select>
  );
}

export default function AdminUsersPage() {
  const [search,          setSearch]          = useState('');
  const [role,            setRole]            = useState<Role | undefined>();
  const [page,            setPage]            = useState(1);
  const [creditModal,     setCreditModal]     = useState<{ userId: string; username: string; balance: number } | null>(null);
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
    <div className="space-y-6 p-8">
      {creditModal && (
        <AdjustCreditsModal
          userId={creditModal.userId}
          username={creditModal.username}
          currentBalance={creditModal.balance}
          onClose={() => setCreditModal(null)}
        />
      )}

      <div>
        <h1 className="text-2xl font-bold text-[var(--noc-t1)]">Users</h1>
        <p className="mt-1 text-sm text-[var(--noc-t4)]">Manage accounts, roles, and credit balances</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search email / username…"
          className="w-72 rounded-xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] px-4 py-2.5 text-sm text-[var(--noc-t1)] placeholder:text-[var(--noc-t5)] outline-none focus:border-[var(--noc-blue)]"
        />
        <select
          value={role ?? ''}
          onChange={(e) => { setRole((e.target.value as Role) || undefined); setPage(1); }}
          className="rounded-xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] px-3 py-2.5 text-sm text-[var(--noc-t1)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60"
        >
          <option value="">All roles</option>
          <option value="VIEWER">Viewer</option>
          <option value="CREATOR">Creator</option>
          <option value="MODERATOR">Moderator</option>
          <option value="ADMIN">Admin</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-[var(--noc-hairline)]">
        {isLoading ? (
          <AdminSpinner />
        ) : error ? (
          <div className="px-6 py-8"><AdminError message={error.message} /></div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--noc-hairline)] bg-[var(--noc-card)]">
                <th className="px-5 py-3 text-left font-medium text-[var(--noc-t4)]">User</th>
                <th className="px-5 py-3 text-left font-medium text-[var(--noc-t4)]">Role</th>
                <th className="px-5 py-3 text-left font-medium text-[var(--noc-t4)]">Tier</th>
                <th className="px-5 py-3 text-right font-medium text-[var(--noc-t4)]">Credits</th>
                <th className="px-5 py-3 text-right font-medium text-[var(--noc-t4)]">Videos</th>
                <th className="px-5 py-3 text-right font-medium text-[var(--noc-t4)]">Joined</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {data?.users.map((u, i) => (
                <tr key={u.id} className={`border-t border-[var(--noc-hairline)] ${i % 2 !== 0 ? 'bg-white/[0.01]' : ''}`}>
                  <td className="px-5 py-3">
                    <div className="font-medium text-[var(--noc-t1)]">{u.displayName}</div>
                    <div className="text-xs text-[var(--noc-t4)]">@{u.username} · {u.email}</div>
                  </td>
                  <td className="px-5 py-3">
                    <RoleSelect userId={u.id} currentRole={u.role} />
                  </td>
                  <td className="px-5 py-3">
                    <span className="rounded-full px-2 py-1 text-xs font-semibold"
                      style={{ background: `${TIER_COLORS[u.premiumTier]}22`, color: TIER_COLORS[u.premiumTier] }}>
                      {u.premiumTier}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-sm text-[var(--noc-purple)]">
                    {u.creditBalance.toLocaleString()}
                  </td>
                  <td className="px-5 py-3 text-right text-[var(--noc-t3)]">{u._count.videos}</td>
                  <td className="px-5 py-3 text-right text-xs text-[var(--noc-t4)]">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => setCreditModal({ userId: u.id, username: u.username, balance: u.creditBalance })}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60"
                      style={{ background: 'rgba(178,90,217,0.12)', color: 'var(--noc-purple)' }}
                    >
                      ⚡ Credits
                    </button>
                  </td>
                </tr>
              ))}
              {data?.users.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-[var(--noc-t5)]">No users found</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--noc-t4)]">{data.total.toLocaleString()} users total</span>
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
