'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';

type Decision = {
  interpretation: string;
  directive: { scope: string };
  affectedEntities: Array<{ type: string; name?: string; id?: string }>;
  preservedEntities: Array<{ type: string; name?: string; id?: string }>;
  creativeChanges: Array<{ scope: string; field: string; to: unknown }>;
  impact: string;
  productionChanges: Array<{ description: string }>;
};

/**
 * Raivstream 5.0 — Director (DIRECT / EXPLORE). Change + Preserve + Impact,
 * then hand off to Production. The creator never sees providers or generation.
 */
export function DirectorPanel({ projectId }: { projectId: string }) {
  const [instruction, setInstruction] = useState('');
  const utils = trpc.useUtils();
  const direct = trpc.creative.director.direct.useMutation();
  const explore = trpc.creative.director.explore.useMutation();
  const apply = trpc.creative.director.apply.useMutation({
    onSuccess: () => {
      utils.creative.director.versions.invalidate({ projectId });
      utils.creative.project.get.invalidate({ projectId });
    },
  });
  const produce = trpc.creative.production.produce.useMutation({ onSuccess: () => utils.creative.project.get.invalidate({ projectId }) });
  const versionsQuery = trpc.creative.director.versions.useQuery({ projectId });

  const decision = direct.data?.decision as Decision | undefined;
  const exploreVersions = explore.data?.versions as Array<{ id: string; versionNumber: number; label: string | null }> | undefined;
  const versions = versionsQuery.data as Array<{ id: string; versionNumber: number; label: string | null }> | undefined;

  const handleApply = () => {
    if (!direct.data) return;
    apply.mutate({ projectId, directiveId: direct.data.directiveId });
  };

  return (
    <section id="director" className="space-y-4">
      <div className="rounded-2xl border border-dashed border-[rgba(178,90,217,0.4)] bg-[rgba(178,90,217,0.06)] p-5">
        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-purple)]">Director</p>
        <p className="mt-1 text-sm text-[var(--noc-t3)]">Direct a change in plain words — “Make the ending hopeful”, “Make her more confident”, “Give me three endings”.</p>
        <input
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && instruction.trim().length > 2) direct.mutate({ projectId, instruction });
          }}
          placeholder="Direct a change…"
          className="mt-3 w-full rounded-xl border border-[rgba(233,233,237,0.14)] bg-[rgba(233,233,237,0.05)] px-4 py-3 text-sm text-[var(--noc-t1)] outline-none focus:border-[var(--noc-purple)]"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={direct.isPending || instruction.trim().length < 2}
            onClick={() => direct.mutate({ projectId, instruction })}
            className="rounded-xl bg-[linear-gradient(90deg,#d946a8,#b25ad9)] px-4 py-2 text-sm font-black text-white disabled:opacity-40"
          >
            {direct.isPending ? 'Directing…' : 'Direct'}
          </button>
          <button
            type="button"
            disabled={explore.isPending || instruction.trim().length < 2}
            onClick={() => explore.mutate({ projectId, instruction })}
            className="rounded-xl border border-[rgba(178,90,217,0.5)] px-4 py-2 text-sm font-black text-[var(--noc-purple)] disabled:opacity-40"
          >
            {explore.isPending ? 'Exploring…' : 'Explore'}
          </button>
        </div>
        {direct.error && <p className="mt-2 text-sm text-[#e35d5d]">{direct.error.message}</p>}
        {explore.error && <p className="mt-2 text-sm text-[#e35d5d]">{explore.error.message}</p>}
      </div>

      {decision && (
        <div className="rounded-2xl border border-[rgba(233,233,237,0.1)] bg-[rgba(233,233,237,0.03)] p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-purple)]">Decision · {decision.directive.scope}</p>
          <p className="mt-1 text-lg font-black">{decision.interpretation}</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <p className="text-xs font-black uppercase text-[var(--noc-t6)]">Change</p>
              <ul className="mt-1 space-y-1 text-sm text-[var(--noc-t2)]">
                {decision.creativeChanges.map((change, index) => (
                  <li key={index}>• {change.field}: {String(change.to)}</li>
                ))}
                {decision.productionChanges.map((change, index) => (
                  <li key={`p${index}`} className="text-[var(--noc-t5)]">• {change.description}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-black uppercase text-[var(--noc-t6)]">Preserve</p>
              <ul className="mt-1 space-y-1 text-sm text-[var(--noc-t3)]">
                {decision.preservedEntities.length > 0
                  ? decision.preservedEntities.map((entity, index) => <li key={index}>• {entity.name ?? entity.type}</li>)
                  : <li className="text-[var(--noc-t5)]">• identity, world, premise, approved decisions</li>}
              </ul>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[rgba(79,139,214,0.14)] px-3 py-1 text-xs font-black uppercase text-[var(--noc-blue)]">Impact: {decision.impact}</span>
            <button
              type="button"
              disabled={apply.isPending}
              onClick={handleApply}
              className="ml-auto rounded-xl bg-[var(--noc-purple)] px-4 py-2 text-sm font-black text-[#0B0D12] disabled:opacity-50"
            >
              {apply.isPending ? 'Applying…' : 'Apply & regenerate affected scenes'}
            </button>
          </div>
          {apply.data && (
            <button
              type="button"
              disabled={produce.isPending}
              onClick={() => produce.mutate({ projectId })}
              className="mt-3 w-full rounded-xl bg-[linear-gradient(90deg,#4f8bd6,#b25ad9)] px-4 py-2.5 text-sm font-black text-[#0B0D12] disabled:opacity-50"
            >
              {produce.isPending ? 'Starting…' : `Regenerate ${apply.data.affectedSceneIds.length} affected scene${apply.data.affectedSceneIds.length === 1 ? '' : 's'}`}
            </button>
          )}
        </div>
      )}

      {exploreVersions && exploreVersions.length > 0 && (
        <div className="rounded-2xl border border-[rgba(233,233,237,0.1)] bg-[rgba(233,233,237,0.03)] p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-purple)]">Explored variations (original preserved)</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {exploreVersions.map((version) => (
              <span key={version.id} className="rounded-full bg-[rgba(178,90,217,0.14)] px-3 py-1 text-xs font-bold text-[var(--noc-purple)]">
                {version.label ?? `v${version.versionNumber}`}
              </span>
            ))}
          </div>
        </div>
      )}

      {versions && versions.length > 0 && (
        <div className="rounded-2xl border border-[rgba(233,233,237,0.1)] bg-[rgba(233,233,237,0.03)] p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-t6)]">Versions</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {versions.map((version) => (
              <span key={version.id} className="rounded-full bg-[rgba(233,233,237,0.08)] px-3 py-1 text-xs font-bold text-[var(--noc-t4)]">
                v{version.versionNumber}{version.label ? ` · ${version.label}` : ''}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}