'use client';

import { useState } from 'react';

// ─── Local UI types ────────────────────────────────────────────────────────────
// These mirror the API's directing types without a cross-package import.

export type DirectingProvenance = 'USER_EXPLICIT' | 'USER_APPROVED' | 'HOMER_INFERENCE' | 'HOMER_PROPOSAL';

export interface DirectingDecisionUI {
  id: string;
  category: string;
  label: string;
  value: string;
  rationale: string;
  provenance: DirectingProvenance;
  createdAt: string;
}

export interface DirectingChoiceUI {
  value: string;
  label: string;
}

export interface DirectingQuestionUI {
  category: string;
  label: string;
  question: string;
  explanation?: string;
  choices: DirectingChoiceUI[];
}

// ─── Helper ────────────────────────────────────────────────────────────────────

function provenanceDot(provenance: DirectingProvenance): string {
  switch (provenance) {
    case 'USER_APPROVED':
    case 'USER_EXPLICIT':
      return 'bg-[var(--noc-purple)]';
    case 'HOMER_INFERENCE':
      return 'bg-[var(--noc-blue)]';
    case 'HOMER_PROPOSAL':
      return 'bg-[rgba(178,90,217,0.5)]';
  }
}

function provenanceLabel(provenance: DirectingProvenance): string {
  switch (provenance) {
    case 'USER_APPROVED': return 'You chose';
    case 'USER_EXPLICIT': return 'You specified';
    case 'HOMER_INFERENCE': return 'Homer understood';
    case 'HOMER_PROPOSAL': return 'Homer decided';
  }
}

function choiceLabel(decisions: DirectingDecisionUI[], category: string): string | undefined {
  return decisions.find((d) => d.category === category)?.value;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function HomerDirectingView({
  premiseLine,
  toneLine,
  question,
  decisions,
  loading,
  proposing,
  complete,
  starting,
  startError,
  onSelectChoice,
  onLetHomerDecide,
  onCustomAnswer,
  onBuildThis,
  onBack,
}: {
  premiseLine: string;
  toneLine?: string;
  question: DirectingQuestionUI | null;
  decisions: DirectingDecisionUI[];
  loading: boolean;
  proposing: boolean;
  complete: boolean;
  starting: boolean;
  startError?: string;
  onSelectChoice: (value: string, label: string) => void;
  onLetHomerDecide: () => void;
  onCustomAnswer: (text: string) => void;
  onBuildThis: () => void;
  onBack: () => void;
}) {
  const [customText, setCustomText] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const handleCustomSubmit = () => {
    const trimmed = customText.trim();
    if (trimmed.length < 2) return;
    onCustomAnswer(trimmed);
    setCustomText('');
    setShowCustom(false);
  };

  // ── Completed state ────────────────────────────────────────────────────────

  if (complete) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={onBack} className="text-sm font-semibold text-[var(--noc-purple)]">
          ← Back to story
        </button>

        <div className="rounded-2xl border border-[rgba(233,233,237,0.1)] bg-[rgba(233,233,237,0.03)] p-6">
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-purple)]">Story directed</p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-[var(--noc-t1)]">
            Your story is directed.
          </h2>
          <p className="mt-1 text-sm text-[var(--noc-t4)]">Homer knows what to make.</p>

          <div className="mt-5 space-y-2">
            {decisions.filter((d) => d.value !== 'not_applicable').map((d) => (
              <div key={d.id} className="flex items-start gap-2.5">
                <span className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${provenanceDot(d.provenance)}`} />
                <div>
                  <span className="text-xs font-bold text-[var(--noc-t3)] uppercase tracking-wide">{d.label}</span>
                  <span className="ml-1.5 text-sm text-[var(--noc-t2)]">{d.label === d.value ? d.value : d.value.replace(/_/g, ' ')}</span>
                  <p className="text-xs text-[var(--noc-t5)]">{d.rationale}</p>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            disabled={starting}
            onClick={onBuildThis}
            className="mt-6 w-full rounded-xl bg-[linear-gradient(90deg,#d946a8,#b25ad9,#4f8bd6)] px-5 py-3 font-black text-white disabled:opacity-50"
          >
            {starting ? 'Building this…' : 'Build this'}
          </button>
          {startError && <p className="mt-2 text-center text-sm text-[#e35d5d]">{startError}</p>}
        </div>
      </div>
    );
  }

  // ── Directing in progress ──────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="text-sm font-semibold text-[var(--noc-purple)]">
        ← Back to story
      </button>

      {/* Story context — compact */}
      <div className="rounded-2xl border border-[rgba(233,233,237,0.1)] bg-[rgba(233,233,237,0.03)] px-5 py-3">
        <p className="text-sm font-semibold leading-snug text-[var(--noc-t2)]">{premiseLine}</p>
        {toneLine && <p className="mt-0.5 text-xs text-[var(--noc-t5)]">{toneLine}</p>}
      </div>

      {/* Current question — dominant */}
      <div className="rounded-2xl border border-[rgba(233,233,237,0.1)] bg-[rgba(233,233,237,0.03)] p-6">
        {loading || !question ? (
          <p className="py-8 text-center text-sm text-[var(--noc-t5)]">
            {loading ? 'Homer is thinking…' : 'Loading…'}
          </p>
        ) : (
          <>
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-purple)]">
              {question.label}
            </p>
            <h2 className="mt-2 text-xl font-black tracking-tight text-[var(--noc-t1)]">
              {question.question}
            </h2>
            {question.explanation && (
              <p className="mt-1 text-sm text-[var(--noc-t4)]">{question.explanation}</p>
            )}

            {/* Choice grid */}
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              {question.choices.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  disabled={loading || proposing}
                  onClick={() => onSelectChoice(choice.value, choice.label)}
                  className="rounded-xl border border-[rgba(233,233,237,0.14)] bg-[rgba(233,233,237,0.04)] px-4 py-3 text-left text-sm font-semibold text-[var(--noc-t2)] hover:border-[var(--noc-purple)] hover:bg-[rgba(178,90,217,0.07)] hover:text-[var(--noc-t1)] disabled:opacity-40 transition-colors"
                >
                  {choice.label}
                </button>
              ))}
            </div>

            {/* Let Homer decide */}
            <button
              type="button"
              disabled={loading || proposing}
              onClick={onLetHomerDecide}
              className="mt-3 w-full rounded-xl border border-dashed border-[rgba(178,90,217,0.4)] px-4 py-2.5 text-sm font-semibold text-[var(--noc-purple)] hover:border-[var(--noc-purple)] hover:bg-[rgba(178,90,217,0.07)] disabled:opacity-40 transition-colors"
            >
              {proposing ? 'Homer is deciding…' : 'Let Homer decide'}
            </button>

            {/* Custom answer */}
            <div className="mt-3 border-t border-[rgba(233,233,237,0.08)] pt-3">
              {!showCustom ? (
                <button
                  type="button"
                  onClick={() => setShowCustom(true)}
                  className="text-xs font-semibold text-[var(--noc-t5)] hover:text-[var(--noc-t3)]"
                >
                  Describe it in your own words…
                </button>
              ) : (
                <div className="space-y-2">
                  <textarea
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                    autoFocus
                    rows={2}
                    placeholder="e.g. Like a memory half-forgotten…"
                    className="w-full resize-none rounded-xl border border-[rgba(233,233,237,0.14)] bg-[rgba(233,233,237,0.05)] px-3 py-2 text-sm text-[var(--noc-t1)] outline-none focus:border-[var(--noc-purple)] placeholder:text-[var(--noc-t6)]"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={customText.trim().length < 2}
                      onClick={handleCustomSubmit}
                      className="rounded-xl bg-[rgba(178,90,217,0.15)] px-4 py-1.5 text-sm font-bold text-[var(--noc-purple)] disabled:opacity-40"
                    >
                      Apply
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowCustom(false); setCustomText(''); }}
                      className="px-3 py-1.5 text-sm text-[var(--noc-t5)]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Prior decisions — receding */}
      {decisions.length > 0 && (
        <div className="rounded-2xl border border-[rgba(233,233,237,0.07)] px-5 py-4">
          <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-[var(--noc-t5)]">
            Decided so far
          </p>
          <div className="space-y-2">
            {decisions.filter((d) => d.value !== 'not_applicable').map((d) => (
              <div key={d.id} className="flex items-center gap-2.5">
                <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${provenanceDot(d.provenance)}`} />
                <span className="text-xs font-bold text-[var(--noc-t4)] uppercase tracking-wide">{d.label}</span>
                <span className="text-xs text-[var(--noc-t3)]">{d.value.replace(/_/g, ' ')}</span>
                <span className="ml-auto text-[10px] text-[var(--noc-t6)]">{provenanceLabel(d.provenance)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Build this anyway footer */}
      <div className="flex items-center justify-between border-t border-[rgba(233,233,237,0.08)] pt-3">
        <p className="text-xs text-[var(--noc-t6)]">
          {decisions.length > 0
            ? `${decisions.filter((d) => d.value !== 'not_applicable').length} of 7 shaped`
            : 'Shape the key creative decisions.'}
        </p>
        <button
          type="button"
          disabled={starting}
          onClick={onBuildThis}
          className="rounded-xl px-4 py-2 text-sm font-bold text-[var(--noc-t4)] hover:text-[var(--noc-t2)] disabled:opacity-40"
        >
          {starting ? 'Building…' : 'Build this anyway →'}
        </button>
      </div>
      {startError && <p className="text-center text-sm text-[#e35d5d]">{startError}</p>}
    </div>
  );
}

/** Compute display choice label from a value string. */
export function getChoiceDisplayLabel(value: string): string {
  return value.replace(/_/g, ' ');
}
