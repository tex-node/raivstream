'use client';

import { useState, useCallback } from 'react';
import { trpc, type RouterOutputs } from '@/lib/trpc';

type AdminUser  = RouterOutputs['admin']['listUsers']['users'][number];
type AdminGetUser = RouterOutputs['admin']['getUser'];
type AdminUserTx = NonNullable<AdminGetUser>['recentTx'][number];
import { useAuth } from '@/lib/auth';

// ─── Types ─────────────────────────────────────────────────────────────────────

type Role     = 'VIEWER' | 'CREATOR' | 'MODERATOR' | 'ADMIN';
type Tier     = 'FREE'   | 'VIEWER'  | 'CREATOR';
type SortBy   = 'joined' | 'views'   | 'videos'    | 'credits' | 'followers';
type SortDir  = 'asc'    | 'desc';

// ─── Constants ─────────────────────────────────────────────────────────────────

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

// ─── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, color, sub }: { label: string; value: number | string; color: string; sub?: string }) {
  return (
    <div className="rounded-xl p-4 border" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.07)' }}>
      <div className="text-2xl font-bold" style={{ color }}>{typeof value === 'number' ? value.toLocaleString() : value}</div>
      <div className="text-white/50 text-xs mt-0.5">{label}</div>
      {sub && <div className="text-white/25 text-xs mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── Sortable column header ─────────────────────────────────────────────────────

function SortHeader({
  col, label, sortBy, sortDir, onSort,
}: { col: SortBy; label: string; sortBy: SortBy; sortDir: SortDir; onSort: (c: SortBy) => void }) {
  const active = sortBy === col;
  return (
    <button
      onClick={() => onSort(col)}
      className="flex items-center gap-1 font-medium transition-colors hover:text-white"
      style={{ color: active ? '#a78bfa' : 'rgba(255,255,255,0.40)' }}
    >
      {label}
      <span className="text-xs opacity-70">
        {active ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}
      </span>
    </button>
  );
}

// ─── Adjust Credits Modal ───────────────────────────────────────────────────────

function CreditsModal({ userId, username, balance, onClose }: {
  userId: string; username: string; balance: number; onClose: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error,  setError]  = useState<string | null>(null);
  const utils = trpc.useUtils();

  const adjust = trpc.admin.adjustCredits.useMutation({
    onSuccess: () => { utils.admin.listUsers.invalidate(); onClose(); },
    onError:   (e) => setError(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseInt(amount, 10);
    if (isNaN(n) || n === 0) { setError('Enter a non-zero integer'); return; }
    if (!reason.trim())       { setError('Reason is required');       return; }
    adjust.mutate({ userId, amount: n, description: reason });
  };

  const preset = (n: number) => { setAmount(String(n)); setError(null); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div className="w-full max-w-sm rounded-2xl border p-6 space-y-4" style={{ background: '#0d1526', borderColor: 'rgba(255,255,255,0.12)' }}>
        <div>
          <h3 className="text-white font-bold text-lg">Adjust Credits</h3>
          <p className="text-white/40 text-sm mt-0.5">
            @{username} · balance: <span style={{ color: '#a78bfa' }}>{balance.toLocaleString()}</span>
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-3 py-2 rounded-xl">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Quick presets */}
          <div>
            <label className="block text-xs text-white/40 uppercase tracking-wider mb-2">Quick add</label>
            <div className="flex gap-2 flex-wrap">
              {[100, 500, 1000, 5000].map((n) => (
                <button key={n} type="button" onClick={() => preset(n)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={{ background: amount === String(n) ? 'rgba(167,139,250,0.25)' : 'rgba(167,139,250,0.1)', color: '#a78bfa' }}>
                  +{n.toLocaleString()}
                </button>
              ))}
              {[100, 500].map((n) => (
                <button key={-n} type="button" onClick={() => preset(-n)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={{ background: amount === String(-n) ? 'rgba(239,68,68,0.25)' : 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                  -{n}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-white/40 uppercase tracking-wider mb-1.5">Custom amount</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setError(null); }}
              placeholder="e.g. 500 or −100"
              className="w-full rounded-xl px-4 py-2.5 text-white text-sm outline-none"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}
            />
            {amount && !isNaN(parseInt(amount)) && (
              <p className="text-xs mt-1" style={{ color: parseInt(amount) >= 0 ? '#10b981' : '#ef4444' }}>
                New balance: {Math.max(0, balance + parseInt(amount)).toLocaleString()}
              </p>
            )}
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

// ─── User Detail Drawer ─────────────────────────────────────────────────────────

function UserDrawer({ userId, onClose, onOpenCredits }: {
  userId: string; onClose: () => void; onOpenCredits: () => void;
}) {
  const { data, isLoading } = trpc.admin.getUser.useQuery({ userId });
  const { user: me } = useAuth();
  const utils = trpc.useUtils();

  const setRole = trpc.admin.setUserRole.useMutation({ onSuccess: () => utils.admin.listUsers.invalidate() });
  const setBan  = trpc.admin.setUserBan.useMutation({  onSuccess: () => { utils.admin.listUsers.invalidate(); utils.admin.getUser.invalidate({ userId }); } });

  const u    = data?.user;
  const txs  = data?.recentTx ?? [];
  const isBanned = u?.lockedUntil ? new Date(u.lockedUntil) > new Date() : false;

  return (
    <div className="fixed inset-0 z-40 flex" onClick={onClose}>
      <div className="flex-1" />
      <div
        className="w-full max-w-md h-full overflow-y-auto flex flex-col border-l"
        style={{ background: '#080f1f', borderColor: 'rgba(255,255,255,0.08)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 z-10"
          style={{ background: '#080f1f', borderColor: 'rgba(255,255,255,0.08)' }}>
          <span className="text-white font-semibold">User Detail</span>
          <button onClick={onClose} className="text-white/40 hover:text-white p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
          </div>
        ) : !u ? (
          <div className="flex-1 flex items-center justify-center text-white/40 text-sm">User not found</div>
        ) : (
          <div className="flex-1 p-5 space-y-5">
            {/* Identity */}
            <div className="flex items-start gap-3">
              {u.avatarUrl ? (
                <img src={u.avatarUrl} alt="" className="w-14 h-14 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)', color: '#fff' }}>
                  {(u.displayName || u.username)[0].toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="text-white font-semibold text-base leading-tight">{u.displayName}</div>
                <div className="text-white/50 text-sm">@{u.username}</div>
                <div className="text-white/30 text-xs truncate mt-0.5">{u.email}</div>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: `${ROLE_COLORS[u.role]}22`, color: ROLE_COLORS[u.role] }}>
                    {u.role}
                  </span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: `${TIER_COLORS[u.premiumTier]}22`, color: TIER_COLORS[u.premiumTier] }}>
                    {u.premiumTier}
                  </span>
                  {isBanned && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                      BANNED
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Total Views',   value: (u.totalViews ?? 0).toLocaleString(),          color: '#60a5fa' },
                { label: 'Videos',        value: u._count.videos.toString(),                    color: '#a78bfa' },
                { label: 'AI Jobs',       value: u._count.generationJobs.toString(),            color: '#f59e0b' },
                { label: 'Followers',     value: (u.followerCount ?? 0).toLocaleString(),       color: '#10b981' },
                { label: 'Credits',       value: (u.creditBalance?.balance ?? 0).toLocaleString(), color: '#a78bfa' },
                { label: 'Joined',        value: new Date(u.createdAt).toLocaleDateString(),    color: 'rgba(255,255,255,0.5)' },
              ].map(({ label, value, color }) => (
                <div key={label} className="rounded-lg p-3 border"
                  style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
                  <div className="text-sm font-bold" style={{ color }}>{value}</div>
                  <div className="text-white/40 text-xs mt-0.5">{label}</div>
                </div>
              ))}
            </div>

            {/* Actions */}
            {me?.role === 'ADMIN' && (
              <div className="space-y-2">
                <div className="text-white/40 text-xs uppercase tracking-wider">Actions</div>

                {/* Role change */}
                <div className="flex items-center justify-between rounded-xl p-3 border"
                  style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
                  <span className="text-white/70 text-sm">Role</span>
                  <select
                    value={u.role}
                    disabled={setRole.isPending || u.id === me.id}
                    onChange={(e) => setRole.mutate({ userId: u.id, role: e.target.value as Role })}
                    className="text-sm font-semibold rounded-lg px-3 py-1.5 outline-none cursor-pointer"
                    style={{ background: `${ROLE_COLORS[u.role]}22`, color: ROLE_COLORS[u.role], border: 'none' }}
                  >
                    <option value="VIEWER">VIEWER</option>
                    <option value="CREATOR">CREATOR</option>
                    <option value="MODERATOR">MODERATOR</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                </div>

                {/* Credits */}
                <button onClick={onOpenCredits}
                  className="w-full flex items-center justify-between rounded-xl p-3 border transition-opacity hover:opacity-80"
                  style={{ background: 'rgba(167,139,250,0.05)', borderColor: 'rgba(167,139,250,0.2)' }}>
                  <span className="text-white/70 text-sm">Adjust credits</span>
                  <span className="text-sm font-bold" style={{ color: '#a78bfa' }}>
                    {(u.creditBalance?.balance ?? 0).toLocaleString()} ⚡
                  </span>
                </button>

                {/* Ban / Unban */}
                {u.id !== me.id && (
                  <button
                    onClick={() => setBan.mutate({ userId: u.id, banned: !isBanned })}
                    disabled={setBan.isPending}
                    className="w-full flex items-center justify-between rounded-xl p-3 border transition-opacity hover:opacity-80 disabled:opacity-50"
                    style={{
                      background:   isBanned ? 'rgba(16,185,129,0.05)'  : 'rgba(239,68,68,0.05)',
                      borderColor:  isBanned ? 'rgba(16,185,129,0.20)'  : 'rgba(239,68,68,0.20)',
                    }}
                  >
                    <span className="text-sm" style={{ color: isBanned ? '#10b981' : '#ef4444' }}>
                      {setBan.isPending ? 'Updating…' : isBanned ? 'Unban user' : 'Suspend user'}
                    </span>
                    <span className="text-lg">{isBanned ? '🔓' : '🔒'}</span>
                  </button>
                )}
              </div>
            )}

            {/* Credit history */}
            {txs.length > 0 && (
              <div>
                <div className="text-white/40 text-xs uppercase tracking-wider mb-2">Recent Credit Transactions</div>
                <div className="space-y-1.5">
                  {txs.map((tx: AdminUserTx) => (
                    <div key={tx.id} className="flex items-start justify-between text-xs rounded-lg px-3 py-2 gap-2"
                      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div className="min-w-0">
                        <div className="text-white/60 truncate">{tx.description ?? tx.type}</div>
                        <div className="text-white/25 mt-0.5">{new Date(tx.createdAt).toLocaleDateString()}</div>
                      </div>
                      <span className="font-bold flex-shrink-0" style={{ color: tx.amount > 0 ? '#10b981' : '#ef4444' }}>
                        {tx.amount > 0 ? '+' : ''}{tx.amount}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Row ───────────────────────────────────────────────────────────────────────

type UserRow = {
  id: string; email: string; username: string; displayName: string;
  avatarUrl: string | null; role: string; premiumTier: string;
  totalViews: number; followerCount: number; creditBalance: number;
  isBanned: boolean; createdAt: Date;
  _count: { videos: number; generationJobs: number };
};

function UserTableRow({ u, isAdmin, onSelect, onCredits }: {
  u: UserRow; isAdmin: boolean; onSelect: () => void; onCredits: () => void;
}) {
  const utils   = trpc.useUtils();
  const setRole = trpc.admin.setUserRole.useMutation({ onSuccess: () => utils.admin.listUsers.invalidate() });
  const setBan  = trpc.admin.setUserBan.useMutation({  onSuccess: () => utils.admin.listUsers.invalidate() });

  return (
    <tr
      className="border-t cursor-pointer transition-colors"
      style={{ borderColor: 'rgba(255,255,255,0.05)' }}
      onClick={onSelect}
    >
      {/* User */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          {u.avatarUrl ? (
            <img src={u.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)', color: '#fff' }}>
              {(u.displayName || u.username)[0].toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="text-white text-sm font-medium truncate flex items-center gap-1.5">
              {u.displayName}
              {u.isBanned && <span className="text-xs px-1.5 py-0.5 rounded font-bold flex-shrink-0" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>Banned</span>}
            </div>
            <div className="text-white/40 text-xs truncate">@{u.username}</div>
          </div>
        </div>
      </td>

      {/* Role */}
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        {isAdmin ? (
          <select
            value={u.role}
            disabled={setRole.isPending}
            onChange={(e) => setRole.mutate({ userId: u.id, role: e.target.value as Role })}
            className="text-xs font-semibold rounded-full px-2 py-1 outline-none cursor-pointer"
            style={{ background: `${ROLE_COLORS[u.role]}22`, color: ROLE_COLORS[u.role], border: 'none' }}
          >
            <option value="VIEWER">VIEWER</option>
            <option value="CREATOR">CREATOR</option>
            <option value="MODERATOR">MODERATOR</option>
            <option value="ADMIN">ADMIN</option>
          </select>
        ) : (
          <span className="text-xs font-semibold px-2 py-1 rounded-full"
            style={{ background: `${ROLE_COLORS[u.role]}22`, color: ROLE_COLORS[u.role] }}>
            {u.role}
          </span>
        )}
      </td>

      {/* Tier */}
      <td className="px-4 py-3 hidden md:table-cell">
        <span className="text-xs font-semibold px-2 py-1 rounded-full"
          style={{ background: `${TIER_COLORS[u.premiumTier]}22`, color: TIER_COLORS[u.premiumTier] }}>
          {u.premiumTier}
        </span>
      </td>

      {/* Views */}
      <td className="px-4 py-3 text-right text-sm hidden lg:table-cell" style={{ color: '#60a5fa' }}>
        {(u.totalViews ?? 0).toLocaleString()}
      </td>

      {/* Videos */}
      <td className="px-4 py-3 text-right text-sm text-white/60 hidden md:table-cell">
        {u._count.videos}
      </td>

      {/* Credits */}
      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onCredits}
          className="font-mono text-sm font-semibold hover:opacity-80 transition-opacity"
          style={{ color: '#a78bfa' }}
          title="Adjust credits"
        >
          {u.creditBalance.toLocaleString()} ⚡
        </button>
      </td>

      {/* Joined */}
      <td className="px-4 py-3 text-right text-white/30 text-xs hidden lg:table-cell">
        {new Date(u.createdAt).toLocaleDateString()}
      </td>

      {/* Ban action */}
      {isAdmin && (
        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setBan.mutate({ userId: u.id, banned: !u.isBanned })}
            disabled={setBan.isPending}
            className="text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all disabled:opacity-40"
            style={{
              background:  u.isBanned ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
              color:       u.isBanned ? '#10b981'               : '#ef4444',
            }}
          >
            {u.isBanned ? 'Unban' : 'Suspend'}
          </button>
        </td>
      )}
    </tr>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminUsersPage() {
  const { user: me } = useAuth();
  const isAdmin = me?.role === 'ADMIN';

  const [search,         setSearch]         = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [role,           setRoleFilter]     = useState<Role | undefined>();
  const [tier,           setTierFilter]     = useState<Tier | undefined>();
  const [sortBy,         setSortBy]         = useState<SortBy>('joined');
  const [sortDir,        setSortDir]        = useState<SortDir>('desc');
  const [page,           setPage]           = useState(1);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [creditModal,    setCreditModal]    = useState<{ userId: string; username: string; balance: number } | null>(null);

  const handleSearch = useCallback((v: string) => {
    setSearch(v);
    clearTimeout((window as any)._searchTimer);
    (window as any)._searchTimer = setTimeout(() => { setDebouncedSearch(v); setPage(1); }, 350);
  }, []);

  const handleSort = (col: SortBy) => {
    if (col === sortBy) { setSortDir((d) => d === 'desc' ? 'asc' : 'desc'); }
    else                { setSortBy(col); setSortDir('desc'); }
    setPage(1);
  };

  const { data, isLoading, error } = trpc.admin.listUsers.useQuery({
    search:   debouncedSearch || undefined,
    role,
    tier,
    sortBy,
    sortDir,
    page,
    pageSize: 25,
  });

  const users = data?.users ?? [];
  const stats = data?.stats;

  const selectedUser = users.find((u: AdminUser) => u.id === selectedUserId);

  return (
    <div className="p-4 md:p-6 max-w-full mx-auto space-y-5">

      {/* Modals */}
      {creditModal && (
        <CreditsModal
          userId={creditModal.userId}
          username={creditModal.username}
          balance={creditModal.balance}
          onClose={() => setCreditModal(null)}
        />
      )}
      {selectedUserId && (
        <UserDrawer
          userId={selectedUserId}
          onClose={() => setSelectedUserId(null)}
          onOpenCredits={() => {
            if (!selectedUser) return;
            setCreditModal({ userId: selectedUser.id, username: selectedUser.username, balance: selectedUser.creditBalance });
          }}
        />
      )}

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">Users</h1>
        <p className="text-white/40 text-sm mt-0.5">Manage accounts, roles, credit balances, and suspensions</p>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total Users"  value={stats.total}                 color="#a78bfa" />
          <StatCard
            label="Staff"
            value={(stats.roleCounts['ADMIN'] ?? 0) + (stats.roleCounts['MODERATOR'] ?? 0)}
            color="#ef4444"
            sub={`${stats.roleCounts['ADMIN'] ?? 0} admin · ${stats.roleCounts['MODERATOR'] ?? 0} mod`}
          />
          <StatCard
            label="Premium"
            value={(stats.tierCounts['VIEWER'] ?? 0) + (stats.tierCounts['CREATOR'] ?? 0)}
            color="#22c55e"
            sub={`${stats.tierCounts['VIEWER'] ?? 0} viewer · ${stats.tierCounts['CREATOR'] ?? 0} creator`}
          />
          <StatCard label="Suspended"   value={stats.bannedCount}            color="#ef4444" />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search name / username / email…"
          className="rounded-xl px-4 py-2 text-white text-sm outline-none flex-1 min-w-48"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}
        />
        <select
          value={role ?? ''}
          onChange={(e) => { setRoleFilter((e.target.value as Role) || undefined); setPage(1); }}
          className="rounded-xl px-3 py-2 text-sm outline-none"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: 'white' }}
        >
          <option value="">All roles</option>
          <option value="VIEWER">Viewer</option>
          <option value="CREATOR">Creator</option>
          <option value="MODERATOR">Moderator</option>
          <option value="ADMIN">Admin</option>
        </select>
        <select
          value={tier ?? ''}
          onChange={(e) => { setTierFilter((e.target.value as Tier) || undefined); setPage(1); }}
          className="rounded-xl px-3 py-2 text-sm outline-none"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: 'white' }}
        >
          <option value="">All tiers</option>
          <option value="FREE">Free</option>
          <option value="VIEWER">Viewer</option>
          <option value="CREATOR">Creator</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-2xl border overflow-x-auto" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
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
                <th className="text-left px-4 py-3 text-white/40 font-medium">User</th>
                <th className="text-left px-4 py-3 text-white/40 font-medium">Role</th>
                <th className="text-left px-4 py-3 text-white/40 font-medium hidden md:table-cell">Tier</th>
                <th className="text-right px-4 py-3 font-medium hidden lg:table-cell">
                  <SortHeader col="views"   label="Views"   sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                </th>
                <th className="text-right px-4 py-3 font-medium hidden md:table-cell">
                  <div className="flex justify-end">
                    <SortHeader col="videos"  label="Videos"  sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  </div>
                </th>
                <th className="text-right px-4 py-3 font-medium">
                  <div className="flex justify-end">
                    <SortHeader col="credits" label="Credits" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  </div>
                </th>
                <th className="text-right px-4 py-3 font-medium hidden lg:table-cell">
                  <div className="flex justify-end">
                    <SortHeader col="joined"  label="Joined"  sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  </div>
                </th>
                {isAdmin && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody>
              {users.map((u: AdminUser) => (
                <UserTableRow
                  key={u.id}
                  u={u as UserRow}
                  isAdmin={isAdmin}
                  onSelect={() => setSelectedUserId(u.id)}
                  onCredits={() => setCreditModal({ userId: u.id, username: u.username, balance: u.creditBalance })}
                />
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 8 : 7} className="px-5 py-12 text-center text-white/30">
                    No users found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-white/40">{data.total.toLocaleString()} users</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-lg disabled:opacity-30 text-white/60 hover:text-white transition-colors border"
              style={{ borderColor: 'rgba(255,255,255,0.10)' }}
            >←</button>
            <span className="text-white/60">Page {page} of {data.totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              disabled={page === data.totalPages}
              className="px-3 py-1.5 rounded-lg disabled:opacity-30 text-white/60 hover:text-white transition-colors border"
              style={{ borderColor: 'rgba(255,255,255,0.10)' }}
            >→</button>
          </div>
        </div>
      )}
    </div>
  );
}
