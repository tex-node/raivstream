'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { Navbar } from '@/components/layout/Navbar';

function SearchResults() {
  const searchParams = useSearchParams();
  const query = searchParams.get('q') ?? '';

  // User search
  const { data: users, isLoading: usersLoading } = trpc.user.searchUsers.useQuery(
    { query },
    { enabled: query.length > 0 }
  );

  // Video search
  const { data, isLoading: videosLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.video.search.useInfiniteQuery(
      { query, limit: 20 },
      {
        getNextPageParam: (last) => last.nextCursor,
        enabled: query.length > 0,
      }
    );

  const videos = data?.pages.flatMap((p) => p.videos) ?? [];
  const isLoading = usersLoading || videosLoading;

  return (
    <div className="max-w-2xl lg:max-w-4xl xl:max-w-5xl mx-auto pt-20 px-4 pb-16">
      <h1 className="text-xl font-semibold mt-6 mb-6">
        {query ? (
          <>
            Results for <span className="text-[var(--noc-magenta)]">"{query}"</span>
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

      {/* ── User results ─────────────────────────────────────────── */}
      {!isLoading && users && users.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">People</h2>
          <div className="space-y-2">
            {users.map((user) => (
              <Link
                key={user.id}
                href={`/${user.username}`}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors"
              >
                <div className="w-11 h-11 rounded-full overflow-hidden flex-shrink-0 bg-[#d946a8] flex items-center justify-center">
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.displayName} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-white font-bold">{user.displayName[0]}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-white truncate">{user.displayName}</span>
                    {user.verified && (
                      <svg className="w-4 h-4 text-[#4f8bd6] flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                      </svg>
                    )}
                  </div>
                  <p className="text-xs text-white/40">@{user.username} · {user.followerCount.toLocaleString()} followers</p>
                  {user.bio && <p className="text-xs text-white/50 mt-0.5 truncate">{user.bio}</p>}
                </div>
                <svg className="w-4 h-4 text-white/20 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Video results ─────────────────────────────────────────── */}
      {!isLoading && videos.length === 0 && query && (!users || users.length === 0) && (
        <div className="text-center py-16 text-white/40">
          No results found for "{query}"
        </div>
      )}

      {videos.length > 0 && (
        <section>
          {users && users.length > 0 && (
            <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Videos</h2>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {videos.map((video) => (
              <Link key={video.id} href={`/v/${video.id}`} className="group">
                <div className="relative aspect-[9/16] bg-[var(--noc-page)] rounded-xl overflow-hidden">
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
        </section>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <div className="min-h-screen bg-black lg:bg-[var(--noc-page)] text-white">
      <Navbar />
      <Suspense fallback={
        <div className="flex justify-center py-32">
          <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      }>
        <SearchResults />
      </Suspense>
    </div>
  );
}
