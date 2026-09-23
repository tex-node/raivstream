'use client';

type Episode = { id: string; projectId: string; seasonNumber: number; episodeNumber: number; title: string; synopsis: string | null; status: string };

/** Raivstream 5.0 — episode index (S01 E01 …), each linking to its project workspace. */
export function EpisodeList({ episodes }: { episodes: Episode[] }) {
  if (episodes.length === 0) {
    return <p className="rounded-2xl border border-[rgba(233,233,237,0.1)] bg-[rgba(233,233,237,0.03)] p-5 text-sm text-[var(--noc-t5)]">No episodes yet — create the first one above.</p>;
  }
  return (
    <div className="space-y-2">
      {episodes.map((episode) => (
        <a
          key={episode.id}
          href={`/projects/${episode.projectId}`}
          className="block rounded-2xl border border-[rgba(233,233,237,0.1)] bg-[rgba(233,233,237,0.03)] p-4 transition-colors hover:border-[var(--noc-purple)]"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-t6)]">
              S{String(episode.seasonNumber).padStart(2, '0')} E{String(episode.episodeNumber).padStart(2, '0')}
            </p>
            <span className="rounded-full bg-[rgba(233,233,237,0.08)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--noc-t5)]">{episode.status}</span>
          </div>
          <h3 className="mt-1 text-lg font-black">{episode.title}</h3>
          {episode.synopsis && <p className="mt-1 line-clamp-2 text-sm text-[var(--noc-t4)]">{episode.synopsis}</p>}
        </a>
      ))}
    </div>
  );
}