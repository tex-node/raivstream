'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { ReadinessGate, type ReadinessResolution } from '@/components/creative/ReadinessGate';

type Decision = {
  interpretation: string;
  directive: { scope: string; intent: string };
  affectedEntities: Array<{ type: string; name?: string; id?: string }>;
  preservedEntities: Array<{ type: string; name?: string; id?: string }>;
  preserves: string[];
  affectedSceneIds: string[];
  creativeChanges: Array<{ scope: string; field: string; to: unknown }>;
  productionChanges: Array<{ description: string }>;
  impact: string;
};

const FALLBACK_EXAMPLES: Array<{ label: string; instruction: string }> = [
  { label: 'Make it more cinematic', instruction: 'Make it more cinematic.' },
  { label: 'Make it feel more premium', instruction: 'Make it feel more premium.' },
  { label: 'Make the ending more hopeful', instruction: 'Make the ending more hopeful.' },
  { label: 'You decide', instruction: 'Improve this — decide what needs the most work and make it better.' },
];

/**
 * Raivstream 5.0 — Director (DIRECT / EXPLORE).
 *
 * Direct is the dominant interaction. The creator types what they want; the
 * Director answers with change + preserve + impact BEFORE anything is
 * regenerated. That is the mind-reader moment: Raivstream understood the
 * meaning, not just the words.
 */
type RequiredAction = { ready: false; reason: string; need: 'NAME' | 'ASSET'; question: string; contextType: string };

export function DirectorPanel({ projectId }: { projectId: string }) {
  const [instruction, setInstruction] = useState('');
  const [gateResolved, setGateResolved] = useState(false);
  const utils = trpc.useUtils();
  const propose = trpc.creative.director.propose.useMutation();
  const explore = trpc.creative.director.explore.useMutation();
  const applyInstruction = trpc.creative.director.applyInstruction.useMutation({
    onSuccess: () => {
      setGateResolved(false);
      utils.creative.director.versions.invalidate({ projectId });
      utils.creative.project.get.invalidate({ projectId });
    },
  });
  const produce = trpc.creative.production.produce.useMutation({ onSuccess: () => utils.creative.project.get.invalidate({ projectId }) });
  const updateBrief = trpc.creative.project.updateBrief.useMutation();
  const requestUpload = trpc.creative.project.requestAttachmentUpload.useMutation();
  const confirmAttachment = trpc.creative.project.confirmAttachment.useMutation({
    onSuccess: () => {
      setGateResolved(true);
      utils.creative.project.get.invalidate({ projectId });
    },
  });
  const versionsQuery = trpc.creative.director.versions.useQuery({ projectId });
  const suggestionsQuery = trpc.creative.director.suggestions.useQuery({ projectId });
  const suggestions = (suggestionsQuery.data as Array<{ label: string; instruction: string }> | undefined) ?? FALLBACK_EXAMPLES;

  const decision = propose.data?.decision as Decision | undefined;
  const applied = applyInstruction.data;
  const requiredAction: RequiredAction | undefined = applied?.requiredAction as RequiredAction | undefined;
  const showGate = Boolean(requiredAction && !gateResolved);
  const exploreVersions = explore.data?.versions as Array<{ id: string; versionNumber: number; label: string | null }> | undefined;
  const versions = versionsQuery.data as Array<{ id: string; versionNumber: number; label: string | null }> | undefined;

  const ready = instruction.trim().length > 2;
  const run = () => {
    if (!ready) return;
    applyInstruction.reset();
    propose.mutate({ projectId, instruction });
  };

  const gateLoading = updateBrief.isPending || requestUpload.isPending || confirmAttachment.isPending;

  const resolveGate = async (resolution: ReadinessResolution) => {
    if (resolution.kind === 'fictional') {
      await updateBrief.mutateAsync({ projectId, refinedIntent: `${instruction} Use a fictional concept — invent it rather than using a real one.` });
      setGateResolved(true);
      return;
    }
    if (resolution.kind === 'describe') {
      await updateBrief.mutateAsync({ projectId, refinedIntent: `${instruction} ${resolution.text}` });
      setGateResolved(true);
      return;
    }
    // kind === 'asset' — upload the file then record it in the brief
    if (resolution.file) {
      try {
        const { uploadUrl, key } = await requestUpload.mutateAsync({ projectId, fileName: resolution.fileName ?? resolution.file.name, contentType: resolution.file.type || 'image/jpeg' });
        await fetch(uploadUrl, { method: 'PUT', body: resolution.file, headers: { 'Content-Type': resolution.file.type || 'image/jpeg' } });
        await confirmAttachment.mutateAsync({ projectId, key, label: requiredAction?.contextType ?? 'Source', kind: resolution.file.type.startsWith('video') ? 'video' : 'image' });
      } catch {
        // errors surfaced via mutation error state
      }
    } else {
      // No actual file (e.g. fileName only) — record as label-only attachment; production boundary will catch it
      await updateBrief.mutateAsync({ projectId, refinedIntent: `${instruction} ${resolution.fileName ?? 'product photo uploaded'}` });
      setGateResolved(true);
    }
  };

  return (
    <section id="director" className="space-y-4">
      <div className="rounded-2xl border border-dashed border-[rgba(178,90,217,0.4)] bg-[rgba(178,90,217,0.06)] p-5">
        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-purple)]">Director</p>
        <p className="mt-1 text-lg font-black text-[var(--noc-t1)]">What would you like to change?</p>
        <p className="mt-1 text-sm text-[var(--noc-t3)]">Say it in your own words. Raivstream figures out what changes and what stays.</p>

        <input
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') run();
          }}
          placeholder="Direct a change…"
          className="mt-3 w-full rounded-xl border border-[rgba(233,233,237,0.14)] bg-[rgba(233,233,237,0.05)] px-4 py-3 text-sm text-[var(--noc-t1)] outline-none focus:border-[var(--noc-purple)]"
        />

        {suggestionsQuery.isLoading ? (
          <p className="mt-3 text-xs text-[var(--noc-t5)]">Thinking about this project…</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.label}
                type="button"
                onClick={() => {
                  setInstruction(suggestion.instruction);
                  propose.reset();
                  propose.mutate({ projectId, instruction: suggestion.instruction });
                }}
                className="rounded-full border border-[rgba(178,90,217,0.35)] bg-[rgba(178,90,217,0.08)] px-3 py-1 text-xs font-bold text-[var(--noc-purple)] hover:bg-[rgba(178,90,217,0.16)]"
              >
                ✦ {suggestion.label}
              </button>
            ))}
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={propose.isPending || !ready}
            onClick={run}
            className="rounded-xl bg-[linear-gradient(90deg,#d946a8,#b25ad9)] px-4 py-2 text-sm font-black text-white disabled:opacity-40"
          >
            {propose.isPending ? 'Understanding…' : 'Direct'}
          </button>
          <button
            type="button"
            disabled={explore.isPending || !ready}
            onClick={() => explore.mutate({ projectId, instruction })}
            className="rounded-xl border border-[rgba(178,90,217,0.5)] px-4 py-2 text-sm font-black text-[var(--noc-purple)] disabled:opacity-40"
          >
            {explore.isPending ? 'Exploring…' : 'Explore alternatives'}
          </button>
        </div>
        {propose.error && <p className="mt-2 text-sm text-[#e35d5d]">{propose.error.message}</p>}
        {explore.error && <p className="mt-2 text-sm text-[#e35d5d]">{explore.error.message}</p>}
      </div>

      {decision && (
        <div className="rounded-2xl border border-[rgba(233,233,237,0.1)] bg-[rgba(233,233,237,0.03)] p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-purple)]">Here&apos;s what I understand</p>
          <p className="mt-1 text-lg font-black">{decision.interpretation}</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <p className="text-xs font-black uppercase text-[var(--noc-t6)]">I&apos;ll change</p>
              <ul className="mt-1 space-y-1 text-sm text-[var(--noc-t2)]">
                {decision.creativeChanges.map((change, index) => (
                  <li key={index}>• {change.field}{change.to ? `: ${String(change.to)}` : ''}</li>
                ))}
                {decision.productionChanges.map((change, index) => (
                  <li key={`p${index}`} className="text-[var(--noc-t5)]">• {change.description}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-black uppercase text-[var(--noc-t6)]">I&apos;ll preserve</p>
              <ul className="mt-1 space-y-1 text-sm text-[var(--noc-t3)]">
                {(decision.preserves.length ? decision.preserves : decision.preservedEntities.map((entity) => entity.name ?? entity.type)).map((item, index) => (
                  <li key={index}>• {item}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[rgba(79,139,214,0.14)] px-3 py-1 text-xs font-black uppercase text-[var(--noc-blue)]">Impact: {decision.impact}</span>
            <span className="text-xs text-[var(--noc-t5)]">
              This affects {decision.affectedSceneIds.length} scene{decision.affectedSceneIds.length === 1 ? '' : 's'}.
            </span>
            <button
              type="button"
              disabled={applyInstruction.isPending}
              onClick={() => applyInstruction.mutate({ projectId, instruction })}
              className="ml-auto rounded-xl bg-[var(--noc-purple)] px-4 py-2 text-sm font-black text-[#0B0D12] disabled:opacity-50"
            >
              {applyInstruction.isPending ? 'Applying…' : 'Apply change'}
            </button>
          </div>
          {applyInstruction.error && <p className="mt-2 text-sm text-[#e35d5d]">{applyInstruction.error.message}</p>}
        </div>
      )}

      {applied && showGate && requiredAction && (
        <div className="rounded-2xl border border-[rgba(178,90,217,0.3)] bg-[rgba(178,90,217,0.05)] p-5">
          <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-[var(--noc-purple)]">Before I can regenerate</p>
          <ReadinessGate
            question={requiredAction.question}
            contextType={requiredAction.contextType as import('@/components/creative/ReadinessGate').ReadinessContextType}
            need={requiredAction.need}
            busy={gateLoading}
            onResolve={(r) => { void resolveGate(r); }}
            onBack={() => { applyInstruction.reset(); setGateResolved(false); }}
          />
          {(updateBrief.error || requestUpload.error || confirmAttachment.error) && (
            <p className="mt-2 text-sm text-[#e35d5d]">{(updateBrief.error ?? requestUpload.error ?? confirmAttachment.error)?.message}</p>
          )}
        </div>
      )}

      {applied && !showGate && (
        <div className="rounded-2xl border border-[rgba(79,139,214,0.25)] bg-[rgba(79,139,214,0.06)] p-5">
          <p className="text-sm font-bold text-[var(--noc-blue)]">
            Applied. {applied.affectedSceneIds.length} scene{applied.affectedSceneIds.length === 1 ? '' : 's'} will be regenerated — everything else stays exactly as it is.
          </p>
          <button
            type="button"
            disabled={produce.isPending}
            onClick={() => produce.mutate({ projectId })}
            className="mt-3 w-full rounded-xl bg-[linear-gradient(90deg,#4f8bd6,#b25ad9)] px-4 py-2.5 text-sm font-black text-[#0B0D12] disabled:opacity-50"
          >
            {produce.isPending ? 'Starting…' : `Regenerate ${applied.affectedSceneIds.length} affected scene${applied.affectedSceneIds.length === 1 ? '' : 's'}`}
          </button>
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
        <details className="rounded-2xl border border-[rgba(233,233,237,0.1)] bg-[rgba(233,233,237,0.03)] p-5">
          <summary className="cursor-pointer text-[10px] font-black uppercase tracking-widest text-[var(--noc-t6)]">Versions ({versions.length})</summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {versions.map((version) => (
              <span key={version.id} className="rounded-full bg-[rgba(233,233,237,0.08)] px-3 py-1 text-xs font-bold text-[var(--noc-t4)]">
                v{version.versionNumber}{version.label ? ` · ${version.label}` : ''}
              </span>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
