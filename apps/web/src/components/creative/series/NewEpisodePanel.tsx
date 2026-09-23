'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc';

/** Raivstream 5.0 — "What happens next?" episode creation. */
export function NewEpisodePanel({ seriesId }: { seriesId: string }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const create = trpc.creative.series.episode.create.useMutation({
    onSuccess: (result) => router.push(`/projects/${result.projectId}`),
  });
  return (
    <section className="rounded-2xl border border-dashed border-[rgba(178,90,217,0.4)] bg-[rgba(178,90,217,0.06)] p-5">
      <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-purple)]">New episode</p>
      <p className="mt-1 text-sm text-[var(--noc-t3)]">What happens next? Raivstream already knows the world, characters and canon.</p>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={2}
        placeholder="Amara discovers that her father knew about the underground city all along…"
        className="mt-3 w-full resize-none rounded-xl border border-[rgba(233,233,237,0.14)] bg-[rgba(233,233,237,0.05)] px-4 py-3 text-sm text-[var(--noc-t1)] outline-none focus:border-[var(--noc-purple)]"
      />
      <button
        type="button"
        disabled={create.isPending || prompt.trim().length < 3}
        onClick={() => create.mutate({ seriesId, prompt })}
        className="mt-3 rounded-xl bg-[linear-gradient(90deg,#d946a8,#b25ad9)] px-5 py-2.5 text-sm font-black text-white disabled:opacity-40"
      >
        {create.isPending ? 'Creating episode…' : '+ Create episode'}
      </button>
      {create.error && <p className="mt-2 text-sm text-[#e35d5d]">{create.error.message}</p>}
    </section>
  );
}