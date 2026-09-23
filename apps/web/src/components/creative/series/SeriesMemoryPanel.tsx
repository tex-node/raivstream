'use client';

/** Raivstream 5.0 — Series memory: what Raivstream has learned + open threads. */
export function SeriesMemoryPanel({ memory }: { memory?: any }) {
  if (!memory) return <p className="rounded-2xl border border-[rgba(233,233,237,0.1)] bg-[rgba(233,233,237,0.03)] p-5 text-sm text-[var(--noc-t5)]">No series memory yet.</p>;
  return (
    <section className="rounded-2xl border border-[rgba(233,233,237,0.1)] bg-[rgba(233,233,237,0.03)] p-5">
      <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-purple)]">Memory</p>
      <p className="mt-1 text-xs text-[var(--noc-t6)]">What Raivstream has learned — distinct from canon (what must remain true).</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <p className="text-xs font-black uppercase text-[var(--noc-t6)]">Learned</p>
          {(memory.learned ?? []).length === 0 && <p className="mt-1 text-sm text-[var(--noc-t6)]">Nothing yet.</p>}
          {(memory.learned ?? []).map((entry: any, index: number) => (
            <p key={index} className="mt-1 text-sm text-[var(--noc-t2)]">• {entry.fact}{entry.episodeNumber ? ` (E${entry.episodeNumber})` : ''}</p>
          ))}
        </div>
        <div>
          <p className="text-xs font-black uppercase text-[var(--noc-t6)]">Open threads</p>
          {(memory.openThreads ?? []).length === 0 && <p className="mt-1 text-sm text-[var(--noc-t6)]">None.</p>}
          {(memory.openThreads ?? []).map((entry: any, index: number) => (
            <p key={index} className="mt-1 text-sm text-[var(--noc-t3)]">• {entry.thread}{entry.openedInEpisode ? ` (E${entry.openedInEpisode})` : ''}</p>
          ))}
        </div>
      </div>
    </section>
  );
}