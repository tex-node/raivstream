'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useUser } from '@/lib/auth';
import { trpc } from '@/lib/trpc';
import { Navbar } from '@/components/layout/Navbar';

function StatCard({
  label,
  value,
  sub,
  color = 'white',
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: 'white' | 'pink' | 'green' | 'yellow';
}) {
  const colors = {
    white: 'text-white',
    pink: 'text-[var(--noc-pink-tint)]',
    green: 'text-green-400',
    yellow: 'text-yellow-400',
  };

  return (
    <div className="bg-[var(--noc-card)] border border-[var(--noc-hairline)] rounded-2xl p-5">
      <p className="text-[var(--noc-t4)] text-xs uppercase tracking-widest mb-2">{label}</p>
      <p className={`text-3xl font-extrabold ${colors[color]}`}>{value}</p>
      {sub && <p className="text-[var(--noc-t5)] text-xs mt-1">{sub}</p>}
    </div>
  );
}

function MiniChart({ data }: { data: Array<{ date: string; views: number }> }) {
  if (!data.length) return null;

  const max = Math.max(...data.map((d) => d.views), 1);
  const barWidth = `${100 / data.length}%`;

  return (
    <div className="flex items-end gap-px h-24">
      {data.map((d) => (
        <div
          key={d.date}
          title={`${d.date}: ${d.views} views`}
          className="flex-1 bg-[var(--noc-magenta)]/70 hover:bg-[var(--noc-pink-tint)] rounded-t transition-colors"
          style={{ height: `${Math.max((d.views / max) * 100, 2)}%` }}
        />
      ))}
    </div>
  );
}

function VideoThumb({
  title,
  thumbnailUrl,
  mp4Url,
}: {
  title: string;
  thumbnailUrl?: string | null;
  mp4Url?: string | null;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  if (thumbnailUrl && !imageFailed) {
    return (
      <img
        src={thumbnailUrl}
        alt={title}
        onError={() => setImageFailed(true)}
        className="w-full h-full object-cover"
      />
    );
  }

  if (mp4Url) {
    return <video src={mp4Url} muted playsInline preload="metadata" className="w-full h-full object-cover" />;
  }

  return (
    <div className="w-full h-full bg-gradient-to-br from-zinc-900 to-zinc-800 flex items-center justify-center">
      <svg className="w-5 h-5 text-[var(--noc-t6)]" fill="currentColor" viewBox="0 0 24 24">
        <path d="M8 5v14l11-7z" />
      </svg>
    </div>
  );
}

export default function AnalyticsPage() {
  const { isSignedIn } = useUser();
  const [sortBy, setSortBy] = useState<
    'viewCount' | 'likeCount' | 'avgStarRating' | 'engagementScore' | 'publishedAt'
  >('publishedAt');

  const overview = trpc.analytics.overview.useQuery(undefined, { enabled: isSignedIn ?? false });
  const dailyViews = trpc.analytics.dailyViews.useQuery(
    { days: 30 },
    { enabled: isSignedIn ?? false }
  );
  const videoBreakdown = trpc.analytics.videoBreakdown.useInfiniteQuery(
    { sortBy, order: 'desc', limit: 20 },
    {
      getNextPageParam: (last) => last.nextCursor,
      enabled: isSignedIn ?? false,
    }
  );

  const videos = videoBreakdown.data?.pages.flatMap((p) => p.videos) ?? [];
  const ov = overview.data;

  if (!isSignedIn) {
    return (
      <div className="min-h-screen bg-[var(--noc-page)] flex items-center justify-center text-[var(--noc-t1)]">
        <p>Please sign in to view analytics.</p>
      </div>
    );
  }

  if (overview.isLoading) {
    return (
      <div className="min-h-screen bg-[var(--noc-page)] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[var(--noc-hairline)] border-t-[var(--noc-t1)] rounded-full animate-spin" />
      </div>
    );
  }

  if (overview.error?.data?.code === 'FORBIDDEN') {
    return (
      <div className="min-h-screen bg-[var(--noc-page)] flex flex-col items-center justify-center text-[var(--noc-t1)] gap-6 px-4 text-center">
        <div className="text-5xl">🎬</div>
        <h1 className="text-2xl font-bold">Become a creator</h1>
        <p className="text-[var(--noc-t4)] max-w-sm">
          You need a creator account to access analytics. Upgrade to Creator Premium or become a
          creator for free.
        </p>
        <div className="flex gap-3">
          <Link
            href="/pricing"
            className="px-6 py-2.5 bg-[#d946a8] hover:opacity-90 rounded-full font-semibold text-sm transition-colors"
          >
            Upgrade plan
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--noc-page)] text-[var(--noc-t1)]">
      <Navbar />

      <div className="max-w-5xl mx-auto pt-24 px-4 pb-20">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Creator Analytics</h1>
          <Link
            href="/upload"
            className="flex items-center gap-2 bg-[#d946a8] hover:opacity-90 text-white text-sm font-semibold px-4 py-2 rounded-full transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Upload
          </Link>
        </div>

        {/* Overview stats */}
        {ov && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <StatCard label="Total Videos" value={ov.totalVideos} color="white" />
              <StatCard label="Total Views" value={ov.totalViews.toLocaleString()} color="pink" />
              <StatCard label="Total Likes" value={ov.totalLikes.toLocaleString()} color="green" />
              <StatCard label="Followers" value={ov.followerCount.toLocaleString()} color="yellow" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <StatCard
                label="Avg Star Rating"
                value={ov.avgStarRating > 0 ? ov.avgStarRating.toFixed(2) : '—'}
                sub="out of 5"
                color="yellow"
              />
              <StatCard
                label="Avg Completion Rate"
                value={`${(ov.avgCompletionRate * 100).toFixed(1)}%`}
                sub="viewers who finish"
                color="green"
              />
              <StatCard
                label="Avg Engagement Score"
                value={ov.avgEngagementScore.toFixed(2)}
                sub="algorithmic score"
                color="pink"
              />
            </div>
          </>
        )}

        {/* Daily views chart */}
        {dailyViews.data && dailyViews.data.length > 0 && (
          <div className="bg-[var(--noc-card)] border border-[var(--noc-hairline)] rounded-2xl p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Views — Last 30 Days</h2>
              <span className="text-[var(--noc-t5)] text-xs">
                {dailyViews.data.reduce((s, d) => s + d.views, 0).toLocaleString()} total
              </span>
            </div>
            <MiniChart data={dailyViews.data} />
            <div className="flex justify-between text-[var(--noc-t6)] text-xs mt-2">
              <span>{dailyViews.data[0]?.date}</span>
              <span>{dailyViews.data[dailyViews.data.length - 1]?.date}</span>
            </div>
          </div>
        )}

        {/* Video breakdown table */}
        <div className="bg-[var(--noc-card)] border border-[var(--noc-hairline)] rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--noc-hairline)]">
            <h2 className="font-semibold">Your Videos</h2>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="bg-[var(--noc-card)] border border-[var(--noc-hairline)] rounded-lg px-3 py-1.5 text-sm text-[var(--noc-t1)] outline-none"
            >
              <option value="publishedAt">Newest</option>
              <option value="viewCount">Most Viewed</option>
              <option value="likeCount">Most Liked</option>
              <option value="avgStarRating">Highest Rated</option>
              <option value="engagementScore">Engagement</option>
            </select>
          </div>

          <div className="divide-y divide-[var(--noc-hairline)]">
            {videos.map((v) => (
              <div key={v.id} className="flex items-center gap-4 px-6 py-4 hover:bg-[var(--noc-card)] transition-colors">
                {/* Thumbnail */}
                <div className="w-12 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-[var(--noc-page)]">
                  <VideoThumb
                    title={v.title}
                    thumbnailUrl={v.thumbnailUrl}
                    mp4Url={(v as { mp4Url?: string | null }).mp4Url}
                  />
                </div>

                {/* Title + status */}
                <div className="flex-1 min-w-0">
                  <Link href={`/v/${v.id}`} className="font-medium text-sm hover:text-[var(--noc-pink-tint)] transition-colors line-clamp-2">
                    {v.title}
                  </Link>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        v.status === 'READY'
                          ? 'bg-green-500/20 text-green-400'
                          : v.status === 'PROCESSING'
                          ? 'bg-yellow-500/20 text-yellow-400'
                          : v.status === 'FAILED'
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-[var(--noc-card)] text-[var(--noc-t4)]'
                      }`}
                    >
                      {v.status.toLowerCase()}
                    </span>
                    {v.isPremiumOnly && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[#d946a8]/20 text-[var(--noc-pink-tint)]">
                        premium
                      </span>
                    )}
                  </div>
                  <p className="text-[var(--noc-t6)] text-xs mt-1">
                    {new Date(v.publishedAt).toLocaleDateString()}
                  </p>
                </div>

                {/* Stats */}
                <div className="hidden sm:grid grid-cols-4 gap-6 text-center text-sm">
                  <div>
                    <p className="font-semibold">{v.viewCount.toLocaleString()}</p>
                    <p className="text-[var(--noc-t5)] text-xs">views</p>
                  </div>
                  <div>
                    <p className="font-semibold">{v.likeCount.toLocaleString()}</p>
                    <p className="text-[var(--noc-t5)] text-xs">likes</p>
                  </div>
                  <div>
                    <p className="font-semibold">
                      {v.avgStarRating > 0 ? v.avgStarRating.toFixed(1) : '—'}
                    </p>
                    <p className="text-[var(--noc-t5)] text-xs">stars</p>
                  </div>
                  <div>
                    <p className="font-semibold">{(v.completionRate * 100).toFixed(0)}%</p>
                    <p className="text-[var(--noc-t5)] text-xs">completion</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {videoBreakdown.hasNextPage && (
            <div className="px-6 py-4 border-t border-[var(--noc-hairline)]">
              <button
                onClick={() => videoBreakdown.fetchNextPage()}
                disabled={videoBreakdown.isFetchingNextPage}
                className="w-full py-2.5 rounded-xl border border-[var(--noc-hairline)] hover:border-[rgba(233,233,237,0.20)] text-sm text-[var(--noc-t3)] transition-colors"
              >
                {videoBreakdown.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}

          {videos.length === 0 && !videoBreakdown.isLoading && (
            <div className="text-center py-16 text-[var(--noc-t6)]">
              No videos yet.{' '}
              <Link href="/upload" className="text-[var(--noc-pink-tint)] hover:underline">
                Upload your first video
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
