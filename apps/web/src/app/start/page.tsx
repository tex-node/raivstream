'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc';

/**
 * Homer's front door (2026-11-21).
 *
 * The home surface is one question, not a dashboard: "What are you thinking?" The answer is routed by a deterministic classifier and returned as
 * a proposal - always HOMER_INFERENCE - with at most four buttons, Homer's read marked. The premise travels with the navigation, so the flow the
 * creator lands in opens FROM their sentence rather than as a form that ignores it.
 *
 * Deliberately no chat box: the record matters, not the transcript.
 */
const DESTINATION: Record<string, (premise: string) => string> = {
  AD: (premise) => `/create?type=ad&premise=${encodeURIComponent(premise)}`,
  COMMERCIAL: (premise) => `/create?type=commercial&premise=${encodeURIComponent(premise)}`,
  FILM: (premise) => `/create?type=film&premise=${encodeURIComponent(premise)}`,
  WRITING: (premise) => `/story-playground/new?type=story&premise=${encodeURIComponent(premise)}`,
};

export default function StartPage() {
  const router = useRouter();
  const [thinking, setThinking] = useState('');
  const [asked, setAsked] = useState(false);
  const route = trpc.creative.routeIntent.useQuery(
    { thinking: thinking.trim() },
    { enabled: asked && thinking.trim().length > 1, retry: false, refetchOnWindowFocus: false },
  );

  const submit = () => {
    if (thinking.trim().length < 2) return;
    setAsked(true);
    void route.refetch();
  };

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col justify-center px-5 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">What are you thinking?</h1>
      <p className="mt-2 text-sm opacity-60">One sentence is enough. I will suggest where it belongs, and you can change my mind.</p>

      <textarea
        className="mt-6 h-32 w-full rounded-2xl border border-[rgba(233,233,237,0.12)] bg-white/5 p-4 text-base outline-none focus:border-[var(--noc-cyan)]"
        value={thinking}
        placeholder="A 15 second spot for my coffee brand…"
        onChange={(event) => { setThinking(event.target.value); setAsked(false); }}
      />

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          className="rounded-xl bg-white/15 px-4 py-2 text-sm disabled:opacity-40"
          disabled={thinking.trim().length < 2 || route.isFetching}
          onClick={submit}
        >
          {route.isFetching ? 'Thinking…' : 'Continue'}
        </button>
        {route.isError && <span className="text-xs opacity-70">I could not read that just now. Try again.</span>}
      </div>

      {route.data && (
        <section className="mt-8 rounded-2xl border border-[rgba(233,233,237,0.08)] bg-[rgba(233,233,237,0.02)] p-5" aria-live="polite">
          <p className="text-sm">{route.data.question}</p>
          <p className="mt-1 text-[11px] uppercase tracking-widest opacity-50">my read · inference</p>

          <div className="mt-4 flex flex-wrap gap-2">
            {route.data.choices.map((choice) => (
              <button
                key={choice.path}
                type="button"
                className={`rounded-xl px-4 py-2 text-sm ${choice.chosen ? 'bg-[var(--noc-cyan)] font-semibold text-black' : 'bg-white/10'}`}
                onClick={() => router.push(DESTINATION[choice.path]!(route.data!.premise))}
              >
                {choice.chosen ? `${choice.label} — yes` : `No, ${choice.label}`}
              </button>
            ))}
          </div>

          <p className="mt-3 text-xs opacity-50">Your words come with you: “{route.data.premise}”.</p>
        </section>
      )}
    </main>
  );
}
