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

type AssetType = 'image' | 'video' | 'audio';
type Filter = 'all' | AssetType;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Videos' },
  { value: 'audio', label: 'Audio' },
];

const SOURCE_LABELS: Record<string, string> = {
  story: 'Story',
  studio: 'Studio',
  upload: 'Upload',
  generated: 'Generated',
};

export default function LibraryPage() {
  const [filter, setFilter] = useState<Filter>('all');

  const query = trpc.library.getAssets.useQuery({
    limit: 30,
    ...(filter === 'all' ? {} : { type: filter }),
  });

  const assets = query.data?.items ?? [];

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
            <p className="text-sm font-semibold text-[var(--noc-t3)]">Nothing here yet.</p>
            <p className="mt-1 text-xs text-[var(--noc-t5)]">
              Generate a story scene, upload a video, or make an avatar and it will appear here.
            </p>
          </div>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {assets.map((asset) => {
            const processing = asset.status === 'PROCESSING';
            return (
              <div
                key={asset.id}
                className="overflow-hidden rounded-xl border border-[var(--noc-hairline)] bg-[var(--noc-card)]"
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
                  <span className="font-bold uppercase tracking-wide text-[var(--noc-t4)]">
                    {SOURCE_LABELS[asset.source] ?? asset.source}
                  </span>
                  <span>{new Date(asset.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            );
          })}
        </div>

        {query.data?.nextCursor && (
          <p className="mt-6 text-center text-xs text-[var(--noc-t6)]">
            Showing the newest {assets.length}. Paging lands in Phase 1.1.
          </p>
        )}
      </main>
    </div>
  );
}
