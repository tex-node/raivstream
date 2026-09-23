'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';

type Output = {
  id: string;
  versionId: string;
  versionNumber: number;
  format: string;
  durationSeconds: number | null;
  status: string;
  assetUrl: string | null;
  errorMessage: string | null;
};

const FORMAT_OPTIONS = [
  { value: 'MASTER', label: '9:16 · Master' },
  { value: 'PORTRAIT', label: '9:16 · Vertical' },
  { value: 'LANDSCAPE', label: '16:9 · YouTube' },
  { value: 'SQUARE', label: '1:1 · Square social' },
] as const;
const DURATION_OPTIONS = [
  { value: '', label: 'Full length' },
  { value: '30', label: '30-second cut' },
  { value: '15', label: '15-second cut' },
] as const;

/**
 * Raivstream 5.0 — Outputs: derivatives of the approved version. The creator
 * asks for a format/cut; the mechanics (crop, trim, re-encode) are ours.
 */
export function OutputPanel({ projectId, currentVersionId }: { projectId: string; currentVersionId?: string | null }) {
  const [format, setFormat] = useState<string>('LANDSCAPE');
  const [duration, setDuration] = useState<string>('');
  const outputs = trpc.creative.output.list.useQuery({ projectId });
  const derive = trpc.creative.output.derive.useMutation({
    onSuccess: (result) => {
      if (result?.output?.id) render.mutate({ projectId, outputId: result.output.id });
    },
  });
  const render = trpc.creative.output.render.useMutation({ onSuccess: () => outputs.refetch() });
  const list = (outputs.data ?? []) as Output[];

  const canDerive = Boolean(currentVersionId) && !derive.isPending && !render.isPending;

  return (
    <section id="outputs" className="space-y-4">
      <div className="rounded-2xl border border-dashed border-[rgba(79,139,214,0.4)] bg-[rgba(79,139,214,0.06)] p-5">
        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-blue)]">Outputs</p>
        <p className="mt-1 text-sm text-[var(--noc-t3)]">Derivatives of your approved version — pick a format and a cut.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select value={format} onChange={(e) => setFormat(e.target.value)} className="rounded-xl border border-[rgba(233,233,237,0.14)] bg-[rgba(233,233,237,0.05)] px-3 py-2 text-sm font-semibold text-[var(--noc-t1)]">
            {FORMAT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value} className="bg-[var(--noc-page)] text-[var(--noc-t1)]">{option.label}</option>
            ))}
          </select>
          <select value={duration} onChange={(e) => setDuration(e.target.value)} className="rounded-xl border border-[rgba(233,233,237,0.14)] bg-[rgba(233,233,237,0.05)] px-3 py-2 text-sm font-semibold text-[var(--noc-t1)]">
            {DURATION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value} className="bg-[var(--noc-page)] text-[var(--noc-t1)]">{option.label}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={!canDerive}
            onClick={() => currentVersionId && derive.mutate({ projectId, versionId: currentVersionId, format: format as 'MASTER' | 'LANDSCAPE' | 'PORTRAIT' | 'SQUARE', durationSeconds: duration ? Number(duration) : undefined })}
            className="rounded-xl bg-[linear-gradient(90deg,#4f8bd6,#b25ad9)] px-5 py-2 text-sm font-black text-[#0B0D12] disabled:opacity-40"
          >
            {derive.isPending || render.isPending ? 'Deriving…' : 'Derive output'}
          </button>
        </div>
        {!currentVersionId && <p className="mt-2 text-xs text-[var(--noc-t5)]">Create and approve a version first.</p>}
        {derive.error && <p className="mt-2 text-sm text-[#e35d5d]">{derive.error.message}</p>}
      </div>

      {list.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((output) => (
            <article key={output.id} className="rounded-2xl border border-[rgba(233,233,237,0.1)] bg-[rgba(233,233,237,0.03)] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-black">{FORMAT_OPTIONS.find((f) => f.value === output.format)?.label ?? output.format}</p>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-black uppercase"
                  style={{ background: output.status === 'READY' ? 'rgba(79,139,214,0.16)' : output.status === 'FAILED' ? 'rgba(227,93,93,0.16)' : 'rgba(217,70,168,0.16)', color: output.status === 'READY' ? 'var(--noc-blue)' : output.status === 'FAILED' ? '#e35d5d' : 'var(--noc-magenta)' }}
                >
                  {output.status === 'READY' ? 'Ready' : output.status === 'FAILED' ? 'Failed' : output.status}
                </span>
              </div>
              <p className="text-xs text-[var(--noc-t6)]">
                v{output.versionNumber}{output.durationSeconds ? ` · ${output.durationSeconds}s` : ' · full'}
              </p>
              {output.status === 'READY' && output.assetUrl ? (
                <video controls src={output.assetUrl} className="mt-2 w-full rounded-xl" />
              ) : (
                <div className="mt-2 flex aspect-video items-center justify-center rounded-xl bg-[rgba(233,233,237,0.04)] text-xs font-bold text-[var(--noc-t6)]">
                  {output.status === 'FAILED' ? output.errorMessage ?? 'Failed' : 'Deriving…'}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}