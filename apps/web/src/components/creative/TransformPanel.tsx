'use client';

import { useEffect, useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc';
import {
  elapsedLabel, formatTransformCost, instructionGuidance, instructionPlaceholder,
  noChangeCaveat, provenanceLine, timedOut, timeoutCopy, transformErrorCopy,
  type TransformOperation,
} from '@/lib/transformPanel';

/**
 * Transform a scene asset (2026-11-16).
 *
 * Sits beside the existing creative actions rather than in a new surface. Six states, each traceable to a
 * measurement: the quote (rate x billed seconds from the same plan the charge uses), a progress clock from the
 * first second (the measured polls were 72.8-95.3 s), a surfaced 10-minute timeout that says nothing was charged,
 * the derived take with its provenance, the no-change caveat for restyle, and creator-facing refusal copy.
 */
export function TransformPanel({
  projectId,
  assetId,
  assetLabel,
}: {
  projectId: string;
  assetId: string;
  assetLabel?: string;
}) {
  const [operation, setOperation] = useState<TransformOperation>('relight');
  const [resolution, setResolution] = useState<'720p' | '1080p'>('720p');
  const [instruction, setInstruction] = useState('');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const utils = trpc.useUtils();
  const quote = trpc.creative.transformQuote.useQuery({ projectId, assetId, operation, resolution }, { retry: false });

  const run = trpc.creative[operation === 'relight' ? 'relight' : 'restyle'].useMutation({
    onMutate: () => { setStartedAt(Date.now()); setNow(Date.now()); },
    onSettled: () => setStartedAt(null),
    onSuccess: () => { utils.creative.project.get.invalidate({ projectId }); },
  } as never);

  useEffect(() => {
    if (startedAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  const timedOutNow = timedOut(startedAt, now);
  const progress = elapsedLabel(startedAt, now);
  const caveat = useMemo(() => noChangeCaveat(operation), [operation]);
  const result = (run.data ?? null) as { assetId?: string } | null;

  return (
    <section className="rounded-lg border border-white/10 p-4" aria-label="Transform asset">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium">Transform</h3>
        <span className="text-xs opacity-60">{assetLabel ?? assetId}</span>
      </header>

      <div className="mb-3 flex gap-2">
        {(['relight', 'restyle'] as TransformOperation[]).map((op) => (
          <button
            key={op}
            type="button"
            onClick={() => setOperation(op)}
            aria-pressed={operation === op}
            className={`rounded px-3 py-1 text-xs ${operation === op ? 'bg-white/20' : 'bg-white/5'}`}
          >
            {op === 'relight' ? 'Relight' : 'Restyle'}
          </button>
        ))}
        <select
          aria-label="Resolution"
          value={resolution}
          onChange={(event) => setResolution(event.target.value as '720p' | '1080p')}
          className="rounded bg-white/5 px-2 py-1 text-xs"
        >
          <option value="720p">720p</option>
          <option value="1080p">1080p</option>
        </select>
      </div>

      {operation === 'restyle' && (
        <div className="mb-3">
          <label className="mb-1 block text-xs opacity-70" htmlFor="transform-instruction">
            Describe the look directly
          </label>
          <textarea
            id="transform-instruction"
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            placeholder={instructionPlaceholder(operation)}
            className="h-20 w-full rounded bg-white/5 p-2 text-xs"
          />
          <p className="mt-1 text-[11px] opacity-60">{instructionGuidance(operation)}</p>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs opacity-70">{formatTransformCost(quote.data)}</span>
        <button
          type="button"
          disabled={run.isPending || (operation === 'restyle' && instruction.trim().length < 4)}
          onClick={() => {
            if (operation === 'relight') run.mutate({ projectId, assetId, resolution } as never);
            else run.mutate({ projectId, assetId, resolution, instruction } as never);
          }}
          className="rounded bg-white/20 px-3 py-1 text-xs disabled:opacity-40"
        >
          {run.isPending ? 'Transforming…' : `Run ${operation === 'relight' ? 'relight' : 'restyle'}`}
        </button>
      </div>

      {progress && !timedOutNow && <p className="mt-2 text-xs opacity-70">{progress}</p>}
      {timedOutNow && <p className="mt-2 text-xs text-amber-300">{timeoutCopy()}</p>}

      {run.error && <p className="mt-2 text-xs text-red-300">{transformErrorCopy(run.error.message)}</p>}

      {result?.assetId && (
        <p className="mt-2 text-[11px] opacity-60">{provenanceLine(`transform:${operation}:${resolution}`, assetId)}</p>
      )}

      {caveat && <p className="mt-2 text-[11px] opacity-60">{caveat}</p>}
    </section>
  );
}
