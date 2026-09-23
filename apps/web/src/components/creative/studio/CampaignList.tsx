'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc';

type Campaign = { id: string; name: string; objective?: string | null; productId?: string | null; projectIds: string[] };

/** Raivstream 5.0 — campaigns + "create a campaign project" (brand context inherited). */
export function CampaignList({ studioId, campaigns, products }: { studioId: string; campaigns: Campaign[]; products: { id: string; name: string }[] }) {
  const router = useRouter();
  const [campaignId, setCampaignId] = useState('');
  const [prompt, setPrompt] = useState('');
  const createProject = trpc.creative.studio.campaign.createProject.useMutation({ onSuccess: (result) => router.push(`/projects/${result.projectId}`) });

  return (
    <div className="space-y-3">
      {campaigns.length === 0 && <p className="rounded-2xl border border-[rgba(233,233,237,0.1)] bg-[rgba(233,233,237,0.03)] p-5 text-sm text-[var(--noc-t5)]">No campaigns yet.</p>}
      {campaigns.map((campaign) => (
        <div key={campaign.id} className="rounded-2xl border border-[rgba(233,233,237,0.1)] bg-[rgba(233,233,237,0.03)] p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-t6)]">Campaign{products.find((p) => p.id === campaign.productId) ? ` · ${products.find((p) => p.id === campaign.productId)?.name}` : ''}</p>
          <h3 className="mt-1 text-lg font-black">{campaign.name}</h3>
          {campaign.objective && <p className="mt-1 text-sm text-[var(--noc-t4)]">{campaign.objective}</p>}
          {campaign.projectIds.length > 0 && <p className="mt-1 text-xs text-[var(--noc-t5)]">{campaign.projectIds.length} project(s)</p>}
          <input
            value={campaignId === campaign.id ? prompt : ''}
            onChange={(e) => { setCampaignId(campaign.id); setPrompt(e.target.value); }}
            placeholder="Describe the campaign asset… e.g. 30-second launch film"
            className="mt-3 w-full rounded-xl border border-[rgba(233,233,237,0.14)] bg-[rgba(233,233,237,0.05)] px-3 py-2 text-sm text-[var(--noc-t1)] outline-none"
          />
          <button
            type="button"
            disabled={createProject.isPending || campaignId !== campaign.id || prompt.trim().length < 3}
            onClick={() => createProject.mutate({ campaignId: campaign.id, prompt })}
            className="mt-2 rounded-xl bg-[linear-gradient(90deg,#4f8bd6,#b25ad9)] px-4 py-2 text-sm font-black text-[#0B0D12] disabled:opacity-40"
          >
            {createProject.isPending ? 'Creating…' : 'Create project from brand context'}
          </button>
        </div>
      ))}
    </div>
  );
}