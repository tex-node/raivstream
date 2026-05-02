'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/lib/auth';

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
  const [editing,  setEditing]  = useState(false);
  const [cost,     setCost]     = useState(String(rate.creditsPerUnit));
  const [active,   setActive]   = useState(rate.isActive);
  const [desc,     setDesc]     = useState(rate.description ?? '');
  const [error,    setError]    = useState<string | null>(null);
  const utils = trpc.useUtils();

  const update = trpc.admin.updateCreditRate.useMutation({
    onSuccess: () => {
      utils.admin.listCreditRates.invalidate();
      setEditing(false);
    },
    onError: (e) => setError(e.message),
  });

  const handleSave = () => {
    const n = parseInt(cost, 10);
    if (isNaN(n) || n < 0) { setError('Enter a valid non-negative integer'); return; }
    update.mutate({ id: rate.id, creditsPerUnit: n, isActive: active, description: desc || undefined });
  };

  const label = FEATURE_KEY_LABELS[rate.featureKey] ?? rate.featureKey;

  if (editing) {
    return (
      <tr style={{ background: 'rgba(167,139,250,0.06)' }}>
        <td className="px-5 py-3">
          <div className="font-mono text-xs text-white/60">{rate.featureKey}</div>
          <div className="text-white font-medium text-sm">{label}</div>
        </td>
        <td className="px-5 py-3">
          <input
            type="number"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            className="w-24 rounded-lg px-3 py-1.5 text-sm text-white outline-none font-mono"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(167,139,250,0.4)' }}
          />
        </td>
        <td className="px-5 py-3 text-white/50 text-xs">{rate.unitLabel}</td>
        <td className="px-5 py-3">
          <input
            type="text"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Description…"
            className="w-full rounded-lg px-3 py-1.5 text-sm text-white outline-none"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}
          />
        </td>
        <td className="px-5 py-3">
          <select
            value={active ? 'true' : 'false'}
            onChange={(e) => setActive(e.target.value === 'true')}
            className="rounded-lg px-2 py-1.5 text-xs outline-none"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: active ? '#22c55e' : '#ef4444' }}
          >
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </td>
        <td className="px-5 py-3 text-right">
          {error && <div className="text-red-400 text-xs mb-1">{error}</div>}
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setEditing(false); setError(null); }}
              className="text-xs px-3 py-1.5 rounded-lg text-white/50 border"
              style={{ borderColor: 'rgba(255,255,255,0.10)' }}>
              Cancel
            </button>
            <button onClick={handleSave} disabled={update.isPending}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)' }}>
              {update.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
      <td className="px-5 py-3">
        <div className="font-mono text-xs text-white/40">{rate.featureKey}</div>
        <div className="text-white font-medium text-sm">{label}</div>
      </td>
      <td className="px-5 py-3 font-mono font-bold" style={{ color: '#a78bfa' }}>
        {rate.creditsPerUnit.toLocaleString()}
      </td>
      <td className="px-5 py-3 text-xs text-white/40">per {rate.unitLabel}</td>
      <td className="px-5 py-3 text-xs text-white/50">{rate.description ?? '—'}</td>
      <td className="px-5 py-3">
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
          style={{
            background: rate.isActive ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
            color:      rate.isActive ? '#22c55e' : '#ef4444',
          }}>
          {rate.isActive ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td className="px-5 py-3 text-right">
        {isAdmin && (
          <button
            onClick={() => setEditing(true)}
            className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors hover:opacity-80"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}
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
  const [cost, setCost]             = useState('');
  const [unit, setUnit]             = useState('request');
  const [desc, setDesc]             = useState('');
  const [error, setError]           = useState<string | null>(null);
  const utils = trpc.useUtils();

  const create = trpc.admin.createCreditRate.useMutation({
    onSuccess: () => { utils.admin.listCreditRates.invalidate(); onClose(); },
    onError: (e) => setError(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseInt(cost, 10);
    if (isNaN(n) || n < 0) { setError('Enter a valid cost'); return; }
    if (!featureKey.includes(':')) { setError('Feature key must be namespaced, e.g. generate:my_model'); return; }
    create.mutate({ featureKey, creditsPerUnit: n, unitLabel: unit, description: desc || undefined });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-sm rounded-2xl border p-6"
        style={{ background: '#0d1526', borderColor: 'rgba(255,255,255,0.12)' }}>
        <h3 className="text-white font-bold text-lg mb-5">Add Credit Rate</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-3 py-2 rounded-xl">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs text-white/40 uppercase tracking-wider mb-1.5">Feature Key</label>
            <input type="text" value={featureKey} onChange={(e) => setFeatureKey(e.target.value)}
              placeholder="generate:my_model"
              className="w-full rounded-xl px-4 py-2.5 text-white text-sm outline-none font-mono"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}
              required />
          </div>

          <div>
            <label className="block text-xs text-white/40 uppercase tracking-wider mb-1.5">Credits per Unit</label>
            <input type="number" value={cost} onChange={(e) => setCost(e.target.value)}
              placeholder="100"
              className="w-full rounded-xl px-4 py-2.5 text-white text-sm outline-none"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}
              required />
          </div>

          <div>
            <label className="block text-xs text-white/40 uppercase tracking-wider mb-1.5">Unit Label</label>
            <input type="text" value={unit} onChange={(e) => setUnit(e.target.value)}
              placeholder="request"
              className="w-full rounded-xl px-4 py-2.5 text-white text-sm outline-none"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }} />
          </div>

          <div>
            <label className="block text-xs text-white/40 uppercase tracking-wider mb-1.5">Description (optional)</label>
            <input type="text" value={desc} onChange={(e) => setDesc(e.target.value)}
              placeholder="Short description…"
              className="w-full rounded-xl px-4 py-2.5 text-white text-sm outline-none"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }} />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white/60 border"
              style={{ borderColor: 'rgba(255,255,255,0.10)' }}>
              Cancel
            </button>
            <button type="submit" disabled={create.isPending}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)' }}>
              {create.isPending ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AdminCreditsPage() {
  const { user: me } = useAuth();
  const isAdmin = me?.role === 'ADMIN';
  const [showAddModal, setShowAddModal] = useState(false);

  const { data: rates, isLoading, error } = trpc.admin.listCreditRates.useQuery();

  return (
    <div className="p-8 space-y-6">
      {showAddModal && <AddRateModal onClose={() => setShowAddModal(false)} />}

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-white text-2xl font-bold">Credit Rates</h1>
          <p className="text-white/40 text-sm mt-1">Configure how many credits each feature costs</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)' }}
          >
            + Add Rate
          </button>
        )}
      </div>

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
                <th className="text-left px-5 py-3 text-white/40 font-medium">Feature</th>
                <th className="text-left px-5 py-3 text-white/40 font-medium">Cost</th>
                <th className="text-left px-5 py-3 text-white/40 font-medium">Unit</th>
                <th className="text-left px-5 py-3 text-white/40 font-medium">Description</th>
                <th className="text-left px-5 py-3 text-white/40 font-medium">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {rates?.map((rate: { id: string; featureKey: string; creditsPerUnit: number; unitLabel: string; description: string | null; isActive: boolean }) => (
                <EditRateRow key={rate.id} rate={rate} isAdmin={isAdmin} />
              ))}
              {rates?.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-white/30">
                    No credit rates configured. Add one to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-xl border px-5 py-4 text-sm text-white/40"
        style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
        <span className="text-white/60 font-medium">Exchange rate:</span> 1,000 credits = ₦1,000 ·
        Credits are deducted atomically before job submission and refunded automatically on failure.
      </div>
    </div>
  );
}


