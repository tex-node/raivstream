'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import { VideoCard } from '@/components/video/VideoCard';
import { PaywallModal } from '@/components/feed/PaywallModal';
import { useUser } from '@/lib/auth';

type FeedType = 'forYou' | 'following' | 'trending' | 'viewersPick';

interface VideoFeedProps {
  feedType: FeedType;
}

export function VideoFeed({ feedType }: VideoFeedProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const isScrolling  = useRef(false);
  const { isSignedIn, user } = useUser();

  // Episode gate — only for signed-in FREE users
  const gateQuery = trpc.user.episodeGate.useQuery(undefined, {
    enabled: isSignedIn && user?.premiumTier === 'FREE',
  });
  const gate        = gateQuery.data;
  const showPaywall = gate?.isGated ?? false;

  // Feed queries
  const forYouQuery = trpc.feed.forYou.useInfiniteQuery(
    { limit: 10 },
    { getNextPageParam: (last) => last.nextCursor, enabled: feedType === 'forYou' }
  );
  const followingQuery = trpc.feed.following.useInfiniteQuery(
    { limit: 10 },
    { getNextPageParam: (last) => last.nextCursor, enabled: feedType === 'following' && isSignedIn }
  );
  const trendingQuery = trpc.feed.trending.useInfiniteQuery(
    { limit: 10 },
    { getNextPageParam: (last) => last.nextCursor, enabled: feedType === 'trending' }
  );
  const viewersPickQuery = trpc.feed.viewersPick.useInfiniteQuery(
    { limit: 10 },
    { getNextPageParam: (last) => last.nextCursor, enabled: feedType === 'viewersPick' }
  );

  const activeQuery =
    feedType === 'forYou'      ? forYouQuery      :
    feedType === 'following'   ? followingQuery   :
    feedType === 'trending'    ? trendingQuery    :
    viewersPickQuery;

  const videos    = activeQuery.data?.pages.flatMap((p) => p.videos) ?? [];
  const isLoading = activeQuery.isLoading;

  // Reset when feed type changes
  useEffect(() => {
    setActiveIndex(0);
    containerRef.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [feedType]);

  // Programmatic navigation (desktop wheel / keyboard / dot buttons)
  const goTo = useCallback((index: number) => {
    const container = containerRef.current;
    if (!container || isScrolling.current) return;
    const clamped = Math.max(0, Math.min(videos.length - 1, index));
    if (clamped === activeIndex) return;

    isScrolling.current = true;
    setActiveIndex(clamped);
    container.scrollTo({ top: clamped * container.clientHeight, behavior: 'smooth' });
    setTimeout(() => { isScrolling.current = false; }, 650);

    // Prefetch more when near the end
    if (clamped >= videos.length - 3 && activeQuery.hasNextPage && !activeQuery.isFetchingNextPage) {
      activeQuery.fetchNextPage();
    }
  }, [activeIndex, videos.length, activeQuery]);

  // ── IntersectionObserver — tracks which slide is visible (works for native touch + programmatic) ──
  useEffect(() => {
    const container = containerRef.current;
    if (!container || videos.length === 0) return;

    const slides = Array.from(container.querySelectorAll<HTMLElement>('[data-slide]'));
    if (slides.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const idx = Number((entry.target as HTMLElement).dataset.slide);
            if (!Number.isNaN(idx)) {
              setActiveIndex(idx);
              // Prefetch more when near end
              if (idx >= videos.length - 3 && activeQuery.hasNextPage && !activeQuery.isFetchingNextPage) {
                activeQuery.fetchNextPage();
              }
            }
          }
        }
      },
      { root: container, threshold: 0.6 },
    );

    slides.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [videos.length, activeQuery]);

  // ── Desktop: mouse wheel — one video per tick ──────────────────────────────
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    if (isScrolling.current) return;
    goTo(activeIndex + (e.deltaY > 0 ? 1 : -1));
  }, [activeIndex, goTo]);

  // ── Keyboard — arrow keys ──────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') goTo(activeIndex + 1);
    if (e.key === 'ArrowUp'   || e.key === 'ArrowLeft')  goTo(activeIndex - 1);
  }, [activeIndex, goTo]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // wheel is non-passive so we can preventDefault (stops browser's native scroll during wheel)
    container.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      container.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleWheel, handleKeyDown]);

  // ── Empty / loading states ────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-black">
        <div className="w-12 h-12 border-4 border-white/20 border-t-violet-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-black text-white gap-4 px-6">
        <div className="text-6xl">🎬</div>
        <p className="text-white/60 text-center text-sm max-w-xs">
          {feedType === 'following'
            ? 'Follow some creators to see their videos here'
            : 'No videos yet — be the first to upload or generate one!'}
        </p>
        {feedType !== 'following' && (
          <a
            href="/generate"
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white mt-2"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)' }}
          >
            ✨ Generate with AI
          </a>
        )}
      </div>
    );
  }

  // ── Feed ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 relative">
      <div
        ref={containerRef}
        className="h-full overflow-y-scroll snap-y snap-mandatory"
        style={{ scrollbarWidth: 'none', scrollSnapType: 'y mandatory' }}
      >
        {videos.map((video, i) => (
          <div
            key={`${video.id}-${i}`}
            data-slide={i}
            className="snap-start w-full flex-shrink-0"
            style={{ height: '100dvh', scrollSnapAlign: 'start' }}
          >
            <VideoCard
              video={video}
              isActive={i === activeIndex && !showPaywall}
            />
          </div>
        ))}

        {activeQuery.isFetchingNextPage && (
          <div className="h-20 flex items-center justify-center bg-black">
            <div className="w-8 h-8 border-4 border-white/20 border-t-violet-500 rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Progress dots — desktop */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 hidden lg:flex flex-col gap-1.5 z-20">
        {videos.slice(0, 8).map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            className="w-1.5 rounded-full transition-all duration-200"
            style={{
              height:     i === activeIndex ? '20px' : '6px',
              background: i === activeIndex ? '#a78bfa' : 'rgba(255,255,255,0.25)',
            }}
          />
        ))}
      </div>

      {/* Paywall overlay */}
      {showPaywall && gate && (
        <PaywallModal watched={gate.watched} limit={gate.limit} />
      )}
    </div>
  );
}
