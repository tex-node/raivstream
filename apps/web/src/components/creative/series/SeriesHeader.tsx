'use client';

/** Raivstream 5.0 — Series header: title, description, status, continue. */
export function SeriesHeader({ series, latestEpisodeId }: { series: { title: string; description?: string | null; status: string }; latestEpisodeId?: string | null }) {
  return (
    <div className="rounded-2xl border border-[rgba(233,233,237,0.1)] bg-[var(--noc-bar)] p-6 text-white">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-purple)]">Series</p>
          <h1 className="mt-1 text-3xl font-black">{series.title}</h1>
          {series.description && <p className="mt-2 max-w-2xl text-sm font-semibold text-[var(--noc-t3)]">{series.description}</p>}
        </div>
        <span className="rounded-full bg-[rgba(79,139,214,0.14)] px-3 py-1 text-xs font-black uppercase text-[var(--noc-blue)]">{series.status}</span>
      </div>
      {latestEpisodeId && (
        <a href={`/projects/${latestEpisodeId}`} className="mt-4 inline-block rounded-xl bg-[linear-gradient(90deg,#d946a8,#b25ad9)] px-5 py-2.5 text-sm font-black text-white">
          Continue latest episode →
        </a>
      )}
    </div>
  );
}