'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { Navbar } from '@/components/layout/Navbar';

export default function SearchPage() {
  const searchParams = useSearchParams();
  const query = searchParams.get('q') ?? '';

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.video.search.useInfiniteQuery(
      { query, limit: 20 },
      {
        getNextPageParam: (last) => last.nextCursor,
        enabled: query.length > 0,
      }
    );

  const videos = data?.pages.flatMap((p) => p.videos) ?? [];

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar />
      <div className="max-w-2xl mx-auto pt-20 px-4 pb-16">
        <h1 className="text-xl font-semibold mt-6 mb-6">
          {query ? (
            <>
              Results for <span className="text-pink-400">"{query}"</span>
            </>
          ) : (
            'Search'
          )}
        </h1>

        {isLoading && (
          <div className="flex justify-center py-16">
            <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}

        {!isLoading && videos.length === 0 && query && (
          <div className="text-center py-16 text-white/40">
            No videos found for "{query}"
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {videos.map((video) => (
            <Link key={video.id} href={`/v/${video.id}`} className="group">
              <div className="relative aspect-[9/16] bg-gray-900 rounded-xl overflow-hidden">
                <img
                  src={video.thumbnailUrl}
                  alt={video.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <p className="text-white text-xs font-semibold line-clamp-2">{video.title}</p>
                  <p className="text-white/60 text-xs mt-1">@{video.creator.username}</p>
                  <div className="flex items-center gap-2 mt-1.5 text-white/50 text-xs">
                    <span>{video.viewCount.toLocaleString()} views</span>
                    <span>·</span>
                    <span>❤️ {video.likeCount.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {hasNextPage && (
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="w-full mt-8 py-3 rounded-xl border border-white/20 hover:border-white/40 text-sm text-white/60 transition-colors"
          >
            {isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>
    </div>
  );
}
