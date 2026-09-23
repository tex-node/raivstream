'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';

/** Raivstream 5.0 — create a campaign (optionally tied to a product). */
export function NewCampaignPanel({ studioId, products }: { studioId: string; products: { id: string; name: string }[] }) {
  const [name, setName] = useState('');
  const [objective, setObjective] = useState('');
  const [productId, setProductId] = useState('');
  const create = trpc.creative.studio.campaign.create.useMutation({ onSuccess: () => setName('') });
  return (
    <section className="rounded-2xl border border-dashed border-[rgba(79,139,214,0.4)] bg-[rgba(79,139,214,0.06)] p-5">
      <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-blue)]">New campaign</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Campaign name" className="rounded-xl border border-[rgba(233,233,237,0.14)] bg-[rgba(233,233,237,0.05)] px-3 py-2 text-sm text-[var(--noc-t1)] outline-none" />
        <input value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Objective" className="rounded-xl border border-[rgba(233,233,237,0.14)] bg-[rgba(233,233,237,0.05)] px-3 py-2 text-sm text-[var(--noc-t1)] outline-none" />
        <select value={productId} onChange={(e) => setProductId(e.target.value)} className="rounded-xl border border-[rgba(233,233,237,0.14)] bg-[rgba(233,233,237,0.05)] px-3 py-2 text-sm text-[var(--noc-t1)]">
          <option value="">No product</option>
          {products.map((product) => <option key={product.id} value={product.id} className="bg-[var(--noc-page)] text-[var(--noc-t1)]">{product.name}</option>)}
        </select>
      </div>
      <button
        type="button"
        disabled={create.isPending || name.trim().length < 2}
        onClick={() => create.mutate({ studioId, name, objective: objective || undefined, productId: productId || undefined })}
        className="mt-3 rounded-xl bg-[linear-gradient(90deg,#4f8bd6,#b25ad9)] px-5 py-2 text-sm font-black text-[#0B0D12] disabled:opacity-40"
      >
        {create.isPending ? 'Creating…' : '+ Create campaign'}
      </button>
    </section>
  );
}