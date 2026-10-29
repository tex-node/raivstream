'use client';

/**
 * D-004 - Media Library, Phase 1 shell.
 *
 * Read-only: lists the signed-in user's story images/videos, uploads and audio,
 * newest first, with a composite cursor. Non-playable items (PROCESSING) render
 * with a badge instead of a play affordance.
 */

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Navbar } from '@/components/layout/Navbar';
import { MediaThumb } from '@/components/video/MediaThumb';
import { PublishModal } from '@/components/media/PublishModal';
import { VideoLightbox } from '@/components/video/VideoLightbox';

type AssetType = 'image' | 'video' | 'audio';
/** 'export' is a source inside the video set, not a media type of its own. */
type Filter = 'all' | AssetType | 'export';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Videos' },
  { value: 'audio', label: 'Audio' },
  { value: 'export', label: 'Exports' },
];

const EMPTY_COPY: Record<Filter, { title: string; body: string }> = {
  all: {
    title: 'Nothing here yet.',
    body: 'Generate a story scene, upload a video, or make an avatar and it will appear here.',
  },
  image: {
    title: 'No images yet.',
    body: 'Generate scene stills in the Story Playground and they will appear here.',
  },
  video: {
    title: 'No videos yet.',
    body: 'Animate a scene in the Studio (H3_MAX) or export a story to see videos here.',
  },
  audio: {
    title: 'No audio yet.',
    body: 'Narration and generated audio will appear here once you create some.',
  },
  export: {
    title: 'No final exports yet.',
    body: 'Export a story to a finished video and it will appear here, ready to download.',
  },
};

function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

const SOURCE_LABELS: Record<string, string> = {
  story: 'Story',
  studio: 'Studio',
  upload: 'Upload',
  generated: 'Generated',
  export: 'Final Export',
};

export default function LibraryPage() {
  const [filter, setFilter] = useState<Filter>('all');

  // An explicit `type` (undefined for All) so the query key changes with the tab
  // and the request is unambiguous in the network panel.
  // Infinite query keyed on the filter: changing the pill resets the pages
  // because the input (and therefore the query key) changes.
  const query = trpc.library.getAssets.useInfiniteQuery(
    {
      limit: 60,
      ...(filter === 'export'
        ? { source: 'export' as const }
        : { type: filter === 'all' ? undefined : filter }),
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    },
  );

  const assets = query.data?.pages.flatMap((page) => page.items) ?? [];
  const [publishTarget, setPublishTarget] = useState<{ id: string; title: string } | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [published, setPublished] = useState(false);
  const [playing, setPlaying] = useState<{ url: string; title: string } | null>(null);
  const utils = trpc.useUtils();

  const publishAsset = trpc.library.publishAsset.useMutation({
    onSuccess: async () => {
      setPublished(true);
      setPublishError(null);
      await utils.library.getAssets.invalidate();
    },
    onError: (err) => setPublishError(err.message),
  });

  return (
    <div className="min-h-screen bg-[var(--noc-page)]">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-2xl font-black text-[var(--noc-t1)]">Library</h1>
        <p className="mt-1 text-sm text-[var(--noc-t4)]">
          Everything you have made: story art, uploads, generated videos and audio.
        </p>

        <div className="mt-5 flex gap-2">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
              className={`rounded-full px-4 py-1.5 text-xs font-bold ${
                filter === option.value
                  ? 'bg-[rgba(217,70,168,0.2)] text-[var(--noc-t1)]'
                  : 'bg-[var(--noc-card)] text-[var(--noc-t5)]'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {query.isLoading && (
          <p className="mt-8 text-sm text-[var(--noc-t4)]">Loading your library…</p>
        )}

        {query.error && (
          <p className="mt-8 text-sm text-[var(--noc-magenta)]">{query.error.message}</p>
        )}

        {!query.isLoading && !query.error && assets.length === 0 && (
          <div className="mt-10 rounded-2xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] px-6 py-12 text-center">
            <p className="text-sm font-semibold text-[var(--noc-t3)]">{EMPTY_COPY[filter].title}</p>
            <p className="mt-1 text-xs text-[var(--noc-t5)]">{EMPTY_COPY[filter].body}</p>
          </div>
        )}

        {!query.isLoading && !query.error && assets.length > 0 && (
          <p className="mt-4 text-xs text-[var(--noc-t6)]">
            {assets.length} item{assets.length === 1 ? '' : 's'}
            {filter === 'all' ? '' : ` · ${filter}`}
          </p>
        )}

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {assets.map((asset) => {
            const processing = asset.status === 'PROCESSING';
            return (
              <div
                key={asset.id}
                onClick={() => {
                  if (asset.type === "video") {
                    setPlaying({ url: asset.url, title: asset.title });
                  }
                }}
                className={`overflow-hidden rounded-xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] ${asset.type === "video" ? "cursor-pointer" : ""}`}
              >
                <div className="relative aspect-square">
                  {asset.type === 'audio' ? (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-900 to-zinc-800">
                      <span className="text-2xl" aria-hidden="true">♪</span>
                    </div>
                  ) : (
                    <MediaThumb
                      alt={`${SOURCE_LABELS[asset.source] ?? asset.source} ${asset.type}`}
                      thumbnailUrl={asset.thumbnailUrl ?? null}
                      videoUrl={asset.type === 'video' ? asset.url : null}
                    />
                  )}

                  {asset.type === 'video' && !processing && (
                    <span
                      className="pointer-events-none absolute inset-0 flex items-center justify-center"
                      aria-hidden="true"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-sm text-white">
                        ▶
                      </span>
                    </span>
                  )}
                  {processing && (
                    <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-bold text-white">
                      Processing…
                    </span>
                  )}
                  {asset.type === 'audio' && (
                    <a
                      href={asset.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute inset-0 flex items-end justify-center pb-2 text-[10px] font-bold text-white/80"
                    >
                      Open audio
                    </a>
                  )}
                </div>
                <div className="flex items-center justify-between px-2.5 py-2 text-[10px] text-[var(--noc-t5)]">
                  {asset.source === "export" ? (
                    <span className="rounded-full bg-[rgba(139,92,246,0.2)] px-1.5 py-0.5 font-bold text-[#a78bfa]">Final Export</span>
                  ) : (
                    <span className="font-bold uppercase tracking-wide text-[var(--noc-t4)]">
                      {sourceLabel(asset.source)}
                    </span>
                  )}
                  <span>{new Date(asset.createdAt).toLocaleDateString()}</span>
                </div>
                {asset.type === "video" && asset.source === "story" && (
                  <button
                    type="button"
                    onClick={() => { setPublished(false); setPublishError(null); setPublishTarget({ id: asset.id, title: `Story ${new Date(asset.createdAt).toLocaleDateString()}` }); }}
                    className="w-full border-t border-[var(--noc-hairline)] py-1.5 text-[10px] font-bold text-[var(--noc-t4)] hover:text-[var(--noc-t1)]"
                  >
                    Publish to Feed
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {query.hasNextPage && (
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => void query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
              className="rounded-lg border border-[var(--noc-hairline)] px-5 py-2 text-xs font-bold text-[var(--noc-t3)] disabled:opacity-50"
            >
              {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}

        {!query.hasNextPage && assets.length > 0 && (
          <p className="mt-6 text-center text-xs text-[var(--noc-t6)]">
            End of library · {assets.length} items
          </p>
        )}
        <VideoLightbox
          isOpen={Boolean(playing)}
          onClose={() => setPlaying(null)}
          videoUrl={playing?.url ?? null}
          title={playing?.title}
          downloadFileName={playing?.title}
        />

        <PublishModal
          open={Boolean(publishTarget)}
          defaultTitle={publishTarget?.title}
          pending={publishAsset.isPending}
          error={publishError}
          published={published}
          onClose={() => { setPublishTarget(null); setPublishError(null); setPublished(false); }}
          onSubmit={(values) => {
            if (!publishTarget) return;
            setPublishError(null);
            publishAsset.mutate({ assetId: publishTarget.id, ...values });
          }}
        />
      </main>
    </div>
  );
}
