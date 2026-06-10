'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { VideoCard } from '@/components/video/VideoCard';
import { PaywallModal } from '@/components/feed/PaywallModal';
import { useUser } from '@/lib/auth';
import { useR16 } from '@/lib/r16';

const GUEST_LIMIT   = 50;
const STORAGE_KEY   = 'rv_guest_watched';

type FeedType = 'forYou' | 'following' | 'trending' | 'viewersPick';

interface VideoFeedProps {
  feedType: FeedType;
}

export function VideoFeed({ feedType }: VideoFeedProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const isScrolling  = useRef(false);
  const { isSignedIn, user } = useUser();
  const router  = useRouter();
  const isR16   = useR16();

  // ── Guest episode tracking (sessionStorage — no account needed) ───────────
  // Track unique video IDs the guest has seen. After GUEST_LIMIT, show modal.
  const [guestWatched, setGuestWatched] = useState<string[]>([]);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    if (isSignedIn) return; // not needed once logged in
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) setGuestWatched(JSON.parse(stored));
    } catch { /* ignore — private browsing */ }
  }, [isSignedIn]);

  // Record each new video the guest scrolls to
  useEffect(() => {
    if (isSignedIn) return;
    const videoId = videos[activeIndex]?.id;
    if (!videoId || guestWatched.includes(videoId)) return;
    const updated = [...guestWatched, videoId];
    setGuestWatched(updated);
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, isSignedIn]);

  // ── Signed-in FREE episode gate (server-side count) ───────────────────────
  const gateQuery = trpc.user.episodeGate.useQuery(undefined, {
    enabled: isSignedIn && user?.premiumTier === 'FREE',
  });
  const gate            = gateQuery.data;
  // Guests: hard modal after GUEST_LIMIT unique videos
  const showGuestModal  = !isSignedIn && guestWatched.length >= GUEST_LIMIT;
  // Signed-in FREE past 10: soft gate — free content plays, premium is locked
  const freeContentOnly = !!(gate?.freeContentOnly);

  // Feed queries
  const forYouQuery = trpc.feed.forYou.useInfiniteQuery(
    { limit: 10, kidsOnly: isR16 },
    { getNextPageParam: (last) => last.nextCursor, enabled: feedType === 'forYou' }
  );
  const followingQuery = trpc.feed.following.useInfiniteQuery(
    { limit: 10 },
    { getNextPageParam: (last) => last.nextCursor, enabled: feedType === 'following' && isSignedIn && !isR16 }
  );
  const trendingQuery = trpc.feed.trending.useInfiniteQuery(
    { limit: 10, kidsOnly: isR16 },
    { getNextPageParam: (last) => last.nextCursor, enabled: feedType === 'trending' }
  );
  const viewersPickQuery = trpc.feed.viewersPick.useInfiniteQuery(
    { limit: 10, kidsOnly: isR16 },
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
    // Wrap around: going past last → back to first
    const clamped = index >= videos.length ? 0 : Math.max(0, index);
    if (clamped === activeIndex && index < videos.length) return;

    isScrolling.current = true;
    setActiveIndex(clamped);
    container.scrollTo({ top: clamped * container.clientHeight, behavior: 'smooth' });
    setTimeout(() => { isScrolling.current = false; }, 650);

    // Prefetch more when near the end
    if (clamped >= videos.length - 3 && activeQuery.hasNextPage && !activeQuery.isFetchingNextPage) {
      activeQuery.fetchNextPage();
    }
  }, [activeIndex, videos.length, activeQuery]);

  // ── Track active index via scroll position (simple, reliable on all devices) ──
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container || isScrolling.current) return;
    const newIndex = Math.round(container.scrollTop / container.clientHeight);
    if (newIndex !== activeIndex) {
      setActiveIndex(newIndex);
      if (newIndex >= videos.length - 3 && activeQuery.hasNextPage && !activeQuery.isFetchingNextPage) {
        activeQuery.fetchNextPage();
      }
    }
  }, [activeIndex, videos.length, activeQuery]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

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
        className="absolute inset-0 overflow-y-scroll snap-y snap-mandatory"
        style={{ scrollbarWidth: 'none', scrollSnapType: 'y mandatory' }}
      >
        {videos.map((video, i) => {
          const locked = freeContentOnly && video.isPremiumOnly;
          return (
            <div
              key={`${video.id}-${i}`}
              data-slide={i}
              className="snap-start w-full flex-shrink-0"
              style={{ height: '100%', scrollSnapAlign: 'start' }}
            >
              <VideoCard
                video={video}
                isActive={i === activeIndex && !showGuestModal}
                isLocked={locked}
                onEnded={() => goTo(i + 1)}
              />
            </div>
          );
        })}

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

      {/* Sticky banner — signed-in FREE users past their 10-episode limit */}
      {freeContentOnly && !bannerDismissed && (
        <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4 py-2.5 bg-black/90 backdrop-blur-sm border-b border-white/10">
          <span className="text-white/70 text-sm">🔒 Watching free content · Subscribe for unlimited</span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/pricing')}
              className="text-xs font-semibold text-violet-400 hover:text-violet-300"
            >
              Subscribe →
            </button>
            <button
              onClick={() => setBannerDismissed(true)}
              className="text-white/30 hover:text-white/60 text-base leading-none"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Hard paywall overlay — guests after 50 free episodes */}
      {showGuestModal && (
        <PaywallModal watched={guestWatched.length} limit={GUEST_LIMIT} />
      )}
    </div>
  );
}
