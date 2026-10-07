'use client';

import { useState } from 'react';

/**
 * Minimal client-side shape of HomerStoryState — only the fields we display.
 * Defined here to avoid importing the full Homer types into the web bundle.
 */
export interface HomerStateSummary {
  premise: { value: string };
  genre?: { value?: string };
  tone?: { value?: string };
  themes?: { value?: string[] };
  entities: {
    characters: Array<{ id: string; name: { value: string }; role: { value: string } }>;
    locations: Array<{ id: string; name: { value: string } }>;
    objects: Array<{ id: string; name: { value: string }; critical?: { value?: boolean } }>;
  };
  threads: Array<{ id: string; summary: string; status?: string }>;
}

/**
 * "Here's what I understand" — Homer's semantic summary of the creator's story.
 *
 * Shows meaning, not implementation. No IDs, no provenance enums, no raw JSON.
 * The creator can approve with "Build this" or correct naturally.
 */
export function HomerUnderstandingView({
  state,
  starting,
  startError,
  onBuildThis,
  onCorrect,
  onBack,
  onDirectMyself,
}: {
  state: HomerStateSummary;
  starting: boolean;
  startError?: string;
  onBuildThis: () => void;
  onCorrect: (correctionText: string) => void;
  onBack: () => void;
  onDirectMyself?: () => void;
}) {
  const [correctionText, setCorrectionText] = useState('');
  const [showCorrection, setShowCorrection] = useState(false);

  const characters = state.entities?.characters ?? [];
  const locations = state.entities?.locations ?? [];
  const criticalObjects = (state.entities?.objects ?? []).filter((o) => o.critical?.value);
  const openThreads = (state.threads ?? []).filter((t) => t.status === 'open' || !t.status);
  const toneLine = [state.genre?.value, state.tone?.value].filter(Boolean).join(' / ');

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="text-sm font-semibold text-[var(--noc-purple)]">
        ← Edit my idea
      </button>

      <div className="rounded-2xl border border-[rgba(233,233,237,0.1)] bg-[rgba(233,233,237,0.03)] p-6">
        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-purple)]">Here&apos;s what I understand</p>

        <p className="mt-3 text-lg font-semibold leading-relaxed text-[var(--noc-t1)]">
          {state.premise.value}
        </p>

        {toneLine && (
          <p className="mt-1 text-sm text-[var(--noc-t4)]">
            Tone: <span className="text-[var(--noc-t2)]">{toneLine}</span>
          </p>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {characters.length > 0 && (
            <section>
              <p className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-[var(--noc-t5)]">
                Characters
              </p>
              <ul className="space-y-1">
                {characters.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 text-sm text-[var(--noc-t2)]">
                    <span className="font-semibold">{c.name.value}</span>
                    {c.role.value && c.role.value !== 'unknown' && (
                      <span className="text-xs text-[var(--noc-t5)]">· {c.role.value}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {locations.length > 0 && (
            <section>
              <p className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-[var(--noc-t5)]">
                World
              </p>
              <ul className="space-y-1">
                {locations.map((l) => (
                  <li key={l.id} className="text-sm text-[var(--noc-t2)]">
                    {l.name.value}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {criticalObjects.length > 0 && (
            <section>
              <p className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-[var(--noc-t5)]">
                Important {criticalObjects.length === 1 ? 'object' : 'objects'}
              </p>
              <ul className="space-y-1">
                {criticalObjects.map((o) => (
                  <li key={o.id} className="text-sm text-[var(--noc-t2)]">
                    {o.name.value}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {openThreads.length > 0 && (
            <section>
              <p className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-[var(--noc-t5)]">
                Story {openThreads.length === 1 ? 'thread' : 'threads'}
              </p>
              <ul className="space-y-1">
                {openThreads.map((t) => (
                  <li key={t.id} className="text-sm leading-snug text-[var(--noc-t2)]">
                    {t.summary}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* Correction input */}
        <div className="mt-6 border-t border-[rgba(233,233,237,0.08)] pt-5">
          {!showCorrection ? (
            <button
              type="button"
              onClick={() => setShowCorrection(true)}
              className="text-sm font-semibold text-[var(--noc-t4)] hover:text-[var(--noc-t2)]"
            >
              Something to change?
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-[var(--noc-t2)]">
                What should Homer know?
              </p>
              <textarea
                value={correctionText}
                onChange={(e) => setCorrectionText(e.target.value)}
                autoFocus
                rows={3}
                placeholder="e.g. The radio belonged to her mother."
                className="w-full resize-none rounded-xl border border-[rgba(233,233,237,0.14)] bg-[rgba(233,233,237,0.05)] px-4 py-2.5 text-sm text-[var(--noc-t1)] outline-none focus:border-[var(--noc-purple)] placeholder:text-[var(--noc-t6)]"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={correctionText.trim().length < 2 || starting}
                  onClick={() => {
                    if (correctionText.trim().length >= 2) {
                      onCorrect(correctionText.trim());
                      setCorrectionText('');
                      setShowCorrection(false);
                    }
                  }}
                  className="rounded-xl bg-[rgba(178,90,217,0.15)] px-4 py-2 text-sm font-bold text-[var(--noc-purple)] disabled:opacity-40"
                >
                  Update understanding
                </button>
                <button
                  type="button"
                  onClick={() => { setShowCorrection(false); setCorrectionText(''); }}
                  className="rounded-xl px-4 py-2 text-sm font-semibold text-[var(--noc-t5)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Primary action */}
        <button
          type="button"
          disabled={starting}
          onClick={onBuildThis}
          className="mt-5 w-full rounded-xl bg-[linear-gradient(90deg,#d946a8,#b25ad9,#4f8bd6)] px-5 py-3 font-black text-white disabled:opacity-50"
        >
          {starting ? 'Building this…' : 'Build this'}
        </button>

        {/* Secondary action — Homer Directing (Phase 2) */}
        <button
          type="button"
          disabled={starting || !onDirectMyself}
          onClick={onDirectMyself}
          className="mt-2 w-full rounded-xl border border-[rgba(178,90,217,0.3)] px-5 py-2.5 text-sm font-semibold text-[var(--noc-purple)] hover:border-[var(--noc-purple)] hover:bg-[rgba(178,90,217,0.07)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Shape the story myself
        </button>

        {startError && (
          <p className="mt-3 text-center text-sm text-[#e35d5d]">{startError}</p>
        )}
      </div>
    </div>
  );
}
