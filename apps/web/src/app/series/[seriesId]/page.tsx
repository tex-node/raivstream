'use client';

import { useParams } from 'next/navigation';
import { useUser } from '@/lib/auth';
import { trpc } from '@/lib/trpc';
import { SeriesHeader } from '@/components/creative/series/SeriesHeader';
import { NewEpisodePanel } from '@/components/creative/series/NewEpisodePanel';
import { EpisodeList } from '@/components/creative/series/EpisodeList';
import { CanonPanel } from '@/components/creative/series/CanonPanel';
import { SeriesMemoryPanel } from '@/components/creative/series/SeriesMemoryPanel';
import { Navbar } from '@/components/layout/Navbar';

export default function SeriesPage() {
  const params = useParams<{ seriesId: string }>();
  const { isLoaded, isSignedIn } = useUser();
  const seriesId = params.seriesId;

  const seriesQuery = trpc.creative.series.get.useQuery({ seriesId }, { enabled: Boolean(isLoaded && isSignedIn && seriesId) });
  const episodesQuery = trpc.creative.series.episode.list.useQuery({ seriesId }, { enabled: Boolean(isLoaded && isSignedIn && seriesId) });
  const contextQuery = trpc.creative.series.context.get.useQuery({ seriesId }, { enabled: Boolean(isLoaded && isSignedIn && seriesId) });

  if (seriesQuery.isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-[var(--noc-page)] text-[var(--noc-t4)]">Loading series…</div>;
  }
  if (seriesQuery.error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[var(--noc-page)] text-[var(--noc-t4)]">
        <p className="font-bold text-[#e35d5d]">{seriesQuery.error.message}</p>
        <a href="/create" className="text-sm font-semibold text-[var(--noc-purple)]">← Start a new project</a>
      </div>
    );
  }

  const series = seriesQuery.data as any;
  const episodes = (episodesQuery.data ?? []) as any[];
  const latestEpisode = episodes[episodes.length - 1];

  return (
    <div className="min-h-screen bg-[var(--noc-page)] text-[var(--noc-t1)]">
      <Navbar />
      <div className="mx-auto max-w-4xl space-y-5 px-4 py-8">
        <SeriesHeader series={series} latestEpisodeId={latestEpisode?.projectId ?? null} />
        <NewEpisodePanel seriesId={seriesId} />
        <section className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-t6)]">Episodes</p>
          <EpisodeList episodes={episodes} />
        </section>
        <CanonPanel canon={series.canon} />
        <SeriesMemoryPanel memory={series.memory} />
        {contextQuery.data && (
          <p className="text-xs text-[var(--noc-t6)]">
            Context ready: {contextQuery.data.characters.length} characters, {contextQuery.data.worlds.length} worlds, {contextQuery.data.unresolvedThreads.length} open thread(s).
          </p>
        )}
      </div>
    </div>
  );
}