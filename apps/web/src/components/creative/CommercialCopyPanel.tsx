'use client';

import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { BEAT_HINTS, allSignals, signalLine, type CommercialVerdict } from '@/lib/commercialSignal';

/**
 * The commercial's three beats, and the gate shown before publish (2026-11-17).
 *
 * Mounted in the project workspace, where the brief already lives and where the plan and review are - the read put a commercial's authoring there rather
 * than in /create, because a commercial has no dedicated route and the brief is the object that already holds its copies of intent.
 *
 * Three labelled fields, not one prose blob: the contract scores hook, benefit and cta separately, and a creator who writes into three labelled fields
 * writes three beats. The hints are the contract's own low-score sentences, which are the only guidance a creator needs. The signal uses the same verdict
 * the publish gate raises, so the line and the refusal cannot disagree.
 */
export function CommercialCopyPanel({ projectId }: { projectId: string }) {
  const utils = trpc.useUtils();
  const query = trpc.creative.commercialCopy.useQuery({ projectId }, { retry: false });
  const [beats, setBeats] = useState({ hook: '', benefit: '', cta: '' });
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (query.data?.beats) setBeats(query.data.beats);
  }, [query.data?.beats]);

  const save = trpc.creative.setCommercialCopy.useMutation({
    onSuccess: () => utils.creative.commercialCopy.invalidate({ projectId }),
  });

  const verdict = (query.data?.verdict ?? null) as CommercialVerdict | null;
  const line = signalLine(verdict);
  const all = allSignals(verdict);

  return (
    <section className="rounded-2xl border border-[rgba(233,233,237,0.08)] bg-[rgba(233,233,237,0.02)] p-5">
      <h3 className="text-sm font-medium">The ad</h3>
      <p className="mt-1 text-xs opacity-60">Three beats. The check runs as you write, and the same check refuses publication.</p>

      {(['hook', 'benefit', 'cta'] as const).map((beat) => (
        <label key={beat} className="mt-3 block">
          <span className="text-[11px] font-black uppercase tracking-widest opacity-70">{beat === 'cta' ? 'CTA' : beat}</span>
          <textarea
            className="mt-1 h-16 w-full rounded-xl bg-white/5 p-2 text-sm"
            value={beats[beat]}
            placeholder={BEAT_HINTS[beat]}
            onChange={(event) => setBeats((current) => ({ ...current, [beat]: event.target.value }))}
          />
        </label>
      ))}

      <button
        type="button"
        className="mt-3 rounded-xl bg-white/15 px-3 py-1 text-xs disabled:opacity-40"
        disabled={save.isPending}
        onClick={() => save.mutate({ projectId, ...beats })}
      >
        {save.isPending ? 'Saving…' : 'Save the ad'}
      </button>

      {line && (
        <div className="mt-3 rounded-xl border border-[rgba(233,233,237,0.08)] p-3 text-xs">
          <p className="opacity-80">{line}</p>
          {all.length > 1 && (
            <button type="button" className="mt-1 underline opacity-60" onClick={() => setExpanded((value) => !value)}>
              {expanded ? 'Hide the rest' : 'See the rest'}
            </button>
          )}
          {expanded && (
            <ul className="mt-2 space-y-1">
              {all.slice(1).map((signal) => (
                <li key={signal} className="opacity-70">{signal}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
