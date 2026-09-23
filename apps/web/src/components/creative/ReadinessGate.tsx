'use client';

import { useState } from 'react';
import { transformAcceptsVideo } from '@/lib/creativeCapabilities';

export type ReadinessContextType = 'PRODUCT' | 'BRAND' | 'LOGO' | 'PERSON' | 'SOURCE';

export type ReadinessResolution =
  | { kind: 'asset'; fileName?: string }
  | { kind: 'describe'; text: string }
  | { kind: 'fictional' };

const LABELS: Record<ReadinessContextType, { upload: string; fictional: string; placeholder: string }> = {
  PRODUCT: {
    upload: 'Upload a product photo',
    fictional: 'I don’t have assets yet — use a fictional product',
    placeholder: 'e.g. a vitamin-C serum in a frosted glass bottle',
  },
  BRAND: {
    upload: 'Upload a product or brand image',
    fictional: 'I don’t have assets yet — use a fictional brand',
    placeholder: 'e.g. Voltaic, a premium skincare brand',
  },
  LOGO: {
    upload: 'Upload the logo',
    fictional: 'I don’t have it yet — use a fictional mark',
    placeholder: 'e.g. a minimal serif wordmark',
  },
  PERSON: {
    upload: 'Choose a reference photo',
    fictional: 'Use a fictional character instead',
    placeholder: 'e.g. a woman in her thirties with short hair',
  },
  SOURCE: {
    upload: transformAcceptsVideo() ? 'Upload an image or video' : 'Upload an image',
    fictional: 'I don’t have a source — use a fictional one',
    placeholder: 'e.g. a photo of my product on a table',
  },
};

/**
 * Raivstream 5.0 — Intent Readiness Gate.
 *
 * Raivstream may invent creative treatment, but it must not invent the
 * creator's essential source material. When the source is missing, ask ONE
 * consequential question — never a questionnaire — and never fabricate the
 * product/brand/person.
 */
export function ReadinessGate({
  question,
  contextType,
  busy,
  onResolve,
  onBack,
}: {
  question: string;
  contextType: ReadinessContextType;
  busy?: boolean;
  onResolve: (resolution: ReadinessResolution) => void;
  onBack: () => void;
}) {
  const [describe, setDescribe] = useState('');
  const labels = LABELS[contextType];

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="text-sm font-semibold text-[var(--noc-purple)]">
        ← Edit my idea
      </button>

      <div className="rounded-2xl border border-[rgba(233,233,237,0.1)] bg-[rgba(233,233,237,0.03)] p-6">
        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-purple)]">One quick thing</p>
        <h2 className="mt-1 text-2xl font-black tracking-tight text-[var(--noc-t1)]">{question}</h2>
        <p className="mt-2 text-sm text-[var(--noc-t4)]">
          I won’t invent your real {contextType.toLowerCase()}. Share the real one, describe it, or tell me to design a fictional one.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <label
            className={`cursor-pointer rounded-xl bg-[var(--noc-purple)] px-4 py-2 text-sm font-black text-[#0B0D12] ${busy ? 'opacity-50' : ''}`}
          >
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onResolve({ kind: 'asset', fileName: file.name });
              }}
            />
            {labels.upload}
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => onResolve({ kind: 'fictional' })}
            className="rounded-xl border border-dashed border-[rgba(233,233,237,0.24)] px-4 py-2 text-sm font-bold text-[var(--noc-t4)] disabled:opacity-50"
          >
            {labels.fictional}
          </button>
        </div>

        <div className="mt-5 border-t border-[rgba(233,233,237,0.08)] pt-4">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--noc-t5)]">Or describe it instead</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              value={describe}
              onChange={(event) => setDescribe(event.target.value)}
              placeholder={labels.placeholder}
              className="min-w-0 flex-1 rounded-xl border border-[rgba(233,233,237,0.14)] bg-[rgba(233,233,237,0.05)] px-4 py-2.5 text-sm text-[var(--noc-t1)] outline-none focus:border-[var(--noc-purple)]"
            />
            <button
              type="button"
              disabled={busy || describe.trim().length < 2}
              onClick={() => onResolve({ kind: 'describe', text: describe.trim() })}
              className="rounded-xl bg-[linear-gradient(90deg,#d946a8,#b25ad9)] px-5 py-2.5 text-sm font-black text-white disabled:opacity-40"
            >
              Use this
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
