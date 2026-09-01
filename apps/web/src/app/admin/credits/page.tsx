'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/lib/auth';
import { AdminSpinner, AdminError } from '../AdminShell';

const FEATURE_KEY_LABELS: Record<string, string> = {
  'generate:nano_banana': 'Nano Banana',
  'generate:grok_imagine':'Grok Imagine',
  'generate:ltx2':        'LTX-2',
  'generate:wan_25':      'Wan 2.5',
  'generate:kling':       'Kling',
  'generate:higgsfield':  'Higgsfield',
  'thumbnail:ai':         'AI Thumbnail',
  'video:transcribe':     'Transcription',
  'video:enhance':        'Video Enhance',
};

function EditRateRow({
  rate,
  isAdmin,
}: {
  rate: {
    id: string;
    featureKey: string;
    creditsPerUnit: number;
    unitLabel: string;
    description: string | null;
    isActive: boolean;
  };
  isAdmin: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [cost,    setCost]    = useState(String(rate.creditsPerUnit));
  const [active,  setActive]  = useState(rate.isActive);
  const [desc,    setDesc]    = useState(rate.description ?? '');
  const [error,   setError]   = useState<string | null>(null);
  const utils = trpc.useUtils();

  const update = trpc.admin.updateCreditRate.useMutation({
    onSuccess: () => { utils.admin.listCreditRates.invalidate(); setEditing(false); },
    onError:   (e) => setError(e.message),
  });

  const handleSave = () => {
    const n = parseInt(cost, 10);
    if (isNaN(n) || n < 0) { setError('Enter a valid non-negative integer'); return; }
    update.mutate({ id: rate.id, creditsPerUnit: n, isActive: active, description: desc || undefined });
  };

  const label = FEATURE_KEY_LABELS[rate.featureKey] ?? rate.featureKey;

  if (editing) {
    return (
      <tr className="bg-[var(--noc-blue)]/[0.04]">
        <td className="px-5 py-3">
          <div className="font-mono text-xs text-[var(--noc-t4)]">{rate.featureKey}</div>
          <div className="text-sm font-medium text-[var(--noc-t1)]">{label}</div>
        </td>
        <td className="px-5 py-3">
          <input
            type="number"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            className="w-24 rounded-lg border border-[var(--noc-blue)]/40 bg-white/[0.08] px-3 py-1.5 font-mono text-sm text-[var(--noc-t1)] outline-none focus:border-[var(--noc-blue)]"
          />
        </td>
        <td className="px-5 py-3 text-xs text-[var(--noc-t4)]">{rate.unitLabel}</td>
        <td className="px-5 py-3">
          <input
            type="text"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Description…"
            className="w-full rounded-lg border border-[var(--noc-hairline)] bg-white/[0.06] px-3 py-1.5 text-sm text-[var(--noc-t1)] outline-none focus:border-[var(--noc-blue)]"
          />
        </td>
        <td className="px-5 py-3">
          <select
            value={active ? 'true' : 'false'}
            onChange={(e) => setActive(e.target.value === 'true')}
            className="rounded-lg border border-[var(--noc-hairline)] bg-white/[0.06] px-2 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60"
            style={{ color: active ? '#22c55e' : '#ef4444' }}
          >
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </td>
        <td className="px-5 py-3 text-right">
          {error && <div className="mb-1 text-xs text-red-400">{error}</div>}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setEditing(false); setError(null); }}
              className="rounded-lg border border-[var(--noc-hairline)] px-3 py-1.5 text-xs text-[var(--noc-t3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={update.isPending}
              className="rounded-lg bg-[var(--noc-blue)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60"
            >
              {update.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t border-[var(--noc-hairline)]">
      <td className="px-5 py-3">
        <div className="font-mono text-xs text-[var(--noc-t4)]">{rate.featureKey}</div>
        <div className="text-sm font-medium text-[var(--noc-t1)]">{label}</div>
      </td>
      <td className="px-5 py-3 font-mono font-bold text-[var(--noc-purple)]">{rate.creditsPerUnit.toLocaleString()}</td>
      <td className="px-5 py-3 text-xs text-[var(--noc-t4)]">per {rate.unitLabel}</td>
      <td className="px-5 py-3 text-xs text-[var(--noc-t3)]">{rate.description ?? '—'}</td>
      <td className="px-5 py-3">
        <span
          className="rounded-full px-2 py-0.5 text-xs font-semibold"
          style={{
            background: rate.isActive ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
            color:      rate.isActive ? '#22c55e' : '#ef4444',
          }}
        >
          {rate.isActive ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td className="px-5 py-3 text-right">
        {isAdmin && (
          <button
            onClick={() => setEditing(true)}
            className="rounded-lg bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-[var(--noc-t3)] transition-colors hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60"
          >
            Edit
          </button>
        )}
      </td>
    </tr>
  );
}

function AddRateModal({ onClose }: { onClose: () => void }) {
  const [featureKey, setFeatureKey] = useState('');
  const [cost,       setCost]       = useState('');
  const [unit,       setUnit]       = useState('request');
  const [desc,       setDesc]       = useState('');
  const [error,      setError]      = useState<string | null>(null);
  const utils = trpc.useUtils();

  const create = trpc.admin.createCreditRate.useMutation({
    onSuccess: () => { utils.admin.listCreditRates.invalidate(); onClose(); },
    onError:   (e) => setError(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseInt(cost, 10);
    if (isNaN(n) || n < 0) { setError('Enter a valid cost'); return; }
    if (!featureKey.includes(':')) { setError('Feature key must be namespaced, e.g. generate:my_model'); return; }
    create.mutate({ featureKey, creditsPerUnit: n, unitLabel: unit, description: desc || undefined });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--noc-hairline)] bg-[#0d1526] p-6">
        <h3 className="mb-5 text-lg font-bold text-[var(--noc-t1)]">Add Credit Rate</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <AdminError message={error} />}

          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-[var(--noc-t4)]">Feature Key</label>
            <input
              type="text"
              value={featureKey}
              onChange={(e) => setFeatureKey(e.target.value)}
              placeholder="generate:my_model"
              className="w-full rounded-xl border border-[var(--noc-hairline)] bg-white/[0.06] px-4 py-2.5 font-mono text-sm text-[var(--noc-t1)] outline-none focus:border-[var(--noc-blue)]"
              required
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-[var(--noc-t4)]">Credits per Unit</label>
            <input
              type="number"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="100"
              className="w-full rounded-xl border border-[var(--noc-hairline)] bg-white/[0.06] px-4 py-2.5 text-sm text-[var(--noc-t1)] outline-none focus:border-[var(--noc-blue)]"
              required
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-[var(--noc-t4)]">Unit Label</label>
            <input
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="request"
              className="w-full rounded-xl border border-[var(--noc-hairline)] bg-white/[0.06] px-4 py-2.5 text-sm text-[var(--noc-t1)] outline-none focus:border-[var(--noc-blue)]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-[var(--noc-t4)]">Description (optional)</label>
            <input
              type="text"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Short description…"
              className="w-full rounded-xl border border-[var(--noc-hairline)] bg-white/[0.06] px-4 py-2.5 text-sm text-[var(--noc-t1)] outline-none focus:border-[var(--noc-blue)]"
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
              disabled={create.isPending}
              className="flex-1 rounded-xl bg-[var(--noc-blue)] py-2.5 text-sm font-semibold text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60"
            >
              {create.isPending ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ManualCreditsPanel({ isAdmin }: { isAdmin: boolean }) {
  const [lookup,      setLookup]      = useState('');
  const [amount,      setAmount]      = useState('5000');
  const [action,      setAction]      = useState<'gift' | 'refund' | 'deduct'>('gift');
  const [reason,      setReason]      = useState('');
  const [referenceId, setReferenceId] = useState('');
  const [error,       setError]       = useState<string | null>(null);
  const [result, setResult] = useState<{ before: number; after: number; delta: number } | null>(null);
  const utils = trpc.useUtils();

  const adjust = trpc.admin.adjustCredits.useMutation({
    onSuccess: (data) => {
      setResult(data);
      setError(null);
      utils.admin.getOverview.invalidate();
      utils.admin.listUsers.invalidate();
    },
    onError: (e) => { setResult(null); setError(e.message); },
  });

  const parsedAmount = Math.abs(parseInt(amount, 10) || 0);
  const signedAmount = action === 'deduct' ? -parsedAmount : parsedAmount;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) { setError('Admin access required'); return; }
    if (!lookup.trim()) { setError('Enter a user email, username, or ID'); return; }
    if (!parsedAmount) { setError('Enter a positive credit amount'); return; }
    if (!reason.trim()) { setError('Reason is required for the ledger'); return; }
    adjust.mutate({ lookup: lookup.trim(), amount: signedAmount, action, description: reason.trim(), referenceId: referenceId.trim() || undefined });
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="rounded-2xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] p-6">
        <h2 className="text-lg font-bold text-[var(--noc-t1)]">Manual Credits / Coupons</h2>
        <p className="mt-1 text-sm text-[var(--noc-t4)]">Gift AI credits, record coupon grants, or refund credits manually. Every action writes to the credit ledger.</p>

        {!isAdmin && (
          <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            Only admins can adjust balances.
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {error  && <AdminError message={error} />}
          {result && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              Applied {result.delta.toLocaleString()} credits. Balance changed from {result.before.toLocaleString()} to {result.after.toLocaleString()}.
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-[var(--noc-t4)]">User email, username, or ID</label>
            <input
              value={lookup}
              onChange={(e) => setLookup(e.target.value)}
              placeholder="email@example.com or @username"
              className="w-full rounded-xl border border-[var(--noc-hairline)] bg-white/[0.06] px-4 py-2.5 text-sm text-[var(--noc-t1)] outline-none focus:border-[var(--noc-blue)]"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wider text-[var(--noc-t4)]">Action</label>
              <select
                value={action}
                onChange={(e) => setAction(e.target.value as typeof action)}
                className="w-full rounded-xl border border-[var(--noc-hairline)] bg-white/[0.06] px-4 py-2.5 text-sm text-[var(--noc-t1)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60"
              >
                <option value="gift">Gift / Coupon</option>
                <option value="refund">Refund</option>
                <option value="deduct">Deduct</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wider text-[var(--noc-t4)]">Credits</label>
              <input
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-xl border border-[var(--noc-hairline)] bg-white/[0.06] px-4 py-2.5 text-sm text-[var(--noc-t1)] outline-none focus:border-[var(--noc-blue)]"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-[var(--noc-t4)]">Reason</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Promo coupon, support refund, manual correction..."
              className="w-full rounded-xl border border-[var(--noc-hairline)] bg-white/[0.06] px-4 py-2.5 text-sm text-[var(--noc-t1)] outline-none focus:border-[var(--noc-blue)]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-[var(--noc-t4)]">Coupon / reference ID (optional)</label>
            <input
              value={referenceId}
              onChange={(e) => setReferenceId(e.target.value)}
              placeholder="coupon-launch-5000"
              className="w-full rounded-xl border border-[var(--noc-hairline)] bg-white/[0.06] px-4 py-2.5 text-sm text-[var(--noc-t1)] outline-none focus:border-[var(--noc-blue)]"
            />
          </div>

          <button
            type="submit"
            disabled={!isAdmin || adjust.isPending}
            className="rounded-xl bg-[var(--noc-blue)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60"
          >
            {adjust.isPending ? 'Applying...' : `Apply ${signedAmount.toLocaleString()} credits`}
          </button>
        </form>
      </div>

      <div className="rounded-2xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] p-5 text-sm">
        <h3 className="font-semibold text-[var(--noc-t1)]">Ledger behavior</h3>
        <div className="mt-4 space-y-3 text-[var(--noc-t4)]">
          <p><span className="text-[var(--noc-t2)]">Gift / Coupon:</span> adds credits as a BONUS transaction.</p>
          <p><span className="text-[var(--noc-t2)]">Refund:</span> adds credits as a REFUND transaction.</p>
          <p><span className="text-[var(--noc-t2)]">Deduct:</span> removes credits as a USAGE transaction and floors the balance at zero.</p>
          <p>Use the reference field for coupon codes, support ticket IDs, or refund references.</p>
        </div>
      </div>
    </div>
  );
}

export default function AdminCreditsPage() {
  const { user: me } = useAuth();
  const isAdmin = me?.role === 'ADMIN';
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeTab, setActiveTab]       = useState<'rates' | 'manual'>('rates');

  const { data: rates, isLoading, error } = trpc.admin.listCreditRates.useQuery();

  return (
    <div className="space-y-6 p-8">
      {showAddModal && <AddRateModal onClose={() => setShowAddModal(false)} />}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--noc-t1)]">Credits</h1>
          <p className="mt-1 text-sm text-[var(--noc-t4)]">Configure feature costs and manually grant or refund credits</p>
        </div>
        {isAdmin && activeTab === 'rates' && (
          <button
            onClick={() => setShowAddModal(true)}
            className="rounded-xl bg-[var(--noc-blue)] px-4 py-2.5 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60"
          >
            + Add Rate
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-[var(--noc-hairline)]">
        {(['rates', 'manual'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="border-b-2 px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60"
            style={{
              borderColor: activeTab === tab ? 'var(--noc-blue)' : 'transparent',
              color:        activeTab === tab ? 'var(--noc-t1)'   : 'var(--noc-t4)',
            }}
          >
            {tab === 'rates' ? 'Feature rates' : 'Manual credits / coupons'}
          </button>
        ))}
      </div>

      {activeTab === 'manual' ? (
        <ManualCreditsPanel isAdmin={isAdmin} />
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-[var(--noc-hairline)]">
            {isLoading ? (
              <AdminSpinner />
            ) : error ? (
              <div className="px-6 py-8"><AdminError message={error.message} /></div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--noc-hairline)] bg-[var(--noc-card)]">
                    <th className="px-5 py-3 text-left font-medium text-[var(--noc-t4)]">Feature</th>
                    <th className="px-5 py-3 text-left font-medium text-[var(--noc-t4)]">Cost</th>
                    <th className="px-5 py-3 text-left font-medium text-[var(--noc-t4)]">Unit</th>
                    <th className="px-5 py-3 text-left font-medium text-[var(--noc-t4)]">Description</th>
                    <th className="px-5 py-3 text-left font-medium text-[var(--noc-t4)]">Status</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {rates?.map((rate) => <EditRateRow key={rate.id} rate={rate} isAdmin={isAdmin} />)}
                  {rates?.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-10 text-center text-[var(--noc-t5)]">
                        No credit rates configured. Add one to get started.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          <div className="rounded-xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] px-5 py-4 text-sm text-[var(--noc-t4)]">
            <span className="font-medium text-[var(--noc-t3)]">Exchange rate:</span> 1,000 credits = ₦1,000 ·
            Credits are deducted atomically before job submission and refunded automatically on failure.
          </div>
        </>
      )}
    </div>
  );
}
