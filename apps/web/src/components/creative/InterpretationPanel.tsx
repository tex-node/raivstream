'use client';

import { useState } from 'react';

type Interpretation = {
  projectType: string;
  summary: string;
  typeConfidence: number;
  explicit: Record<string, string | number | undefined>;
  inferred: Record<string, string | undefined>;
  uncertain: string[];
  questions: Array<{ id: string; prompt: string; options: string[]; canAutoDecide: boolean }>;
};

export function InterpretationPanel({
  isLoading,
  error,
  interpretation,
  onBack,
  onStart,
  starting,
  startError,
}: {
  isLoading: boolean;
  error?: string;
  interpretation?: Interpretation;
  onBack: () => void;
  onStart: () => void;
  starting: boolean;
  startError?: string;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [decidedBySystem, setDecidedBySystem] = useState<Record<string, boolean>>({});

  if (isLoading) {
    return <p className="py-10 text-center text-[var(--noc-t4)]">Understanding what you&apos;re imagining…</p>;
  }

  if (error) {
    const disabled = error.toLowerCase().includes('not enabled');
    return (
      <div className="rounded-2xl border border-[rgba(227,93,93,0.3)] bg-[rgba(227,93,93,0.08)] p-6 text-center">
        <p className="font-bold text-[#e35d5d]">{error}</p>
        {disabled && <p className="mt-2 text-sm text-[var(--noc-t4)]">Raivstream 5.0 is staged behind a feature flag. It&apos;s coming soon.</p>}
        <button type="button" onClick={onBack} className="mt-4 rounded-xl border border-[rgba(233,233,237,0.2)] px-4 py-2 text-sm font-bold">
          Back
        </button>
      </div>
    );
  }

  if (!interpretation) {
    return <p className="py-10 text-center text-[var(--noc-t4)]">Understanding what you&apos;re imagining…</p>;
  }

  const controls: Array<{ label: string; value?: string | number }> = [
    { label: 'Duration', value: interpretation.explicit.durationSeconds ? `${interpretation.explicit.durationSeconds}s` : undefined },
    { label: 'Format', value: interpretation.explicit.format },
    { label: 'Genre', value: interpretation.explicit.genre },
    { label: 'Tone', value: interpretation.explicit.tone },
    { label: 'Setting', value: interpretation.explicit.setting },
    { label: 'Visual style', value: interpretation.inferred.style },
    { label: 'Audience', value: interpretation.explicit.audience },
    { label: 'Voice', value: undefined },
    { label: 'Music', value: undefined },
  ];

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="text-sm font-semibold text-[var(--noc-purple)]">
        ← Edit my idea
      </button>

      <div className="rounded-2xl border border-[rgba(233,233,237,0.1)] bg-[rgba(233,233,237,0.03)] p-6">
        <h2 className="text-2xl font-black tracking-tight text-[var(--noc-t1)]">Here&apos;s what I understand</h2>
        <div className="mt-2 flex items-center gap-3">
          <span className="rounded-full bg-[var(--noc-purple)]/15 px-3 py-1 text-xs font-black uppercase tracking-wide text-[var(--noc-purple)]">
            {interpretation.projectType}
          </span>
          <span className="text-xs text-[var(--noc-t6)]">Raivstream decided this</span>
        </div>
        <p className="mt-3 text-lg font-semibold leading-relaxed text-[var(--noc-t1)]">{interpretation.summary}</p>

        {interpretation.inferred.style && (
          <p className="mt-3 text-sm text-[var(--noc-t3)]">
            Creative direction: {interpretation.inferred.style} <span className="text-[var(--noc-t5)]">· Auto</span>
          </p>
        )}

        <details className="mt-3 rounded-xl border border-[rgba(233,233,237,0.08)] bg-[rgba(233,233,237,0.02)] p-3">
          <summary className="cursor-pointer text-[10px] font-black uppercase tracking-widest text-[var(--noc-t6)]">Fine-tune · Auto</summary>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {controls.map((control) => (
              <div key={control.label} className="rounded-xl border border-[rgba(233,233,237,0.08)] bg-[rgba(233,233,237,0.02)] px-3 py-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-t6)]">{control.label}</p>
                <p className="mt-0.5 truncate text-sm font-semibold text-[var(--noc-t2)]">{control.value ?? 'Auto'}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-[var(--noc-t5)]">Let Raivstream decide — describe any change in your own words.</p>
        </details>

        {interpretation.questions.length > 0 && (
          <div className="mt-5 border-t border-[rgba(233,233,237,0.08)] pt-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--noc-t5)]">
              A couple of things I&apos;d love to know (or I&apos;ll decide)
            </p>
            <div className="mt-3 space-y-4">
              {interpretation.questions.map((question) => {
                const decided = decidedBySystem[question.id];
                return (
                  <div key={question.id}>
                    <p className="text-sm font-semibold text-[var(--noc-t1)]">{question.prompt}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {question.options.map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setAnswers((a) => ({ ...a, [question.id]: option }))}
                          className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                            answers[question.id] === option
                              ? 'border-[var(--noc-purple)] bg-[var(--noc-purple)]/15 text-[var(--noc-t1)]'
                              : 'border-[rgba(233,233,237,0.16)] text-[var(--noc-t4)]'
                          }`}
                        >
                          {option}
                        </button>
                      ))}
                      {question.canAutoDecide && (
                        <button
                          type="button"
                          onClick={() => {
                            setDecidedBySystem((d) => ({ ...d, [question.id]: !d[question.id] }));
                            setAnswers((a) => {
                              const next = { ...a };
                              delete next[question.id];
                              return next;
                            });
                          }}
                          className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                            decided ? 'border-[var(--noc-blue)] bg-[var(--noc-blue)]/15 text-[var(--noc-t1)]' : 'border-dashed border-[rgba(233,233,237,0.2)] text-[var(--noc-t5)]'
                          }`}
                        >
                          Let Raivstream decide
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <button
          type="button"
          disabled={starting}
          onClick={onStart}
          className="mt-6 w-full rounded-xl bg-[linear-gradient(90deg,#d946a8,#b25ad9,#4f8bd6)] px-5 py-3 font-black text-white disabled:opacity-50"
        >
          {starting ? 'Building this…' : 'Build this'}
        </button>
        {startError && <p className="mt-3 text-center text-sm text-[#e35d5d]">{startError}</p>}
      </div>
    </div>
  );
}