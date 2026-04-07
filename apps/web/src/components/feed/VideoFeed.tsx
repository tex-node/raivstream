'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import { VideoCard } from '@/components/video/VideoCard';

type FeedType = 'forYou' | 'following' | 'trending' | 'viewersPick';

interface VideoFeedProps {
  feedType: FeedType;
}

export function VideoFeed({ feedType }: VideoFeedProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const isScrolling = useRef(false);

  // Fetch the right feed based on tab
  const forYouQuery = trpc.feed.forYou.useInfiniteQuery(
    { limit: 10 },
    { getNextPageParam: (last) => last.nextCursor, enabled: feedType === 'forYou' }
  );
  const followingQuery = trpc.feed.following.useInfiniteQuery(
    { limit: 10 },
    { getNextPageParam: (last) => last.nextCursor, enabled: feedType === 'following' }
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
    feedType === 'forYou'
      ? forYouQuery
      : feedType === 'following'
      ? followingQuery
      : feedType === 'trending'
      ? trendingQuery
      : viewersPickQuery;

  const videos = activeQuery.data?.pages.flatMap((p) => p.videos) ?? [];
  const isLoading = activeQuery.isLoading;

  // Reset active index when feed type changes
  useEffect(() => {
    setActiveIndex(0);
    containerRef.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [feedType]);

  // Snap scrolling — detect which video is in view
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container || isScrolling.current) return;

    const height = container.clientHeight;
    const scrollTop = container.scrollTop;
    const newIndex = Math.round(scrollTop / height);

    if (newIndex !== activeIndex) {
      setActiveIndex(newIndex);
    }

    // Load more when near the end
    if (newIndex >= videos.length - 3 && activeQuery.hasNextPage && !activeQuery.isFetchingNextPage) {
      activeQuery.fetchNextPage();
    }
  }, [activeIndex, videos.length, activeQuery]);

  // Wheel-based snapping
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      if (isScrolling.current) return;

      const container = containerRef.current;
      if (!container) return;

      const direction = e.deltaY > 0 ? 1 : -1;
      const nextIndex = Math.max(0, Math.min(videos.length - 1, activeIndex + direction));

      if (nextIndex !== activeIndex) {
        isScrolling.current = true;
        setActiveIndex(nextIndex);
        container.scrollTo({
          top: nextIndex * container.clientHeight,
          behavior: 'smooth',
        });
        setTimeout(() => { isScrolling.current = false; }, 600);
      }
    },
    [activeIndex, videos.length]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-black">
        <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-black text-white gap-3">
        <div className="text-6xl">📭</div>
        <p className="text-white/60 text-center text-sm px-8">
          {feedType === 'following'
            ? 'Follow some creators to see their videos here'
            : 'No videos yet — check back soon!'}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-scroll snap-y snap-mandatory scroll-smooth"
      style={{ scrollbarWidth: 'none' }}
    >
      {videos.map((video, i) => (
        <div
          key={`${video.id}-${i}`}
          className="snap-start w-full h-screen flex-shrink-0"
        >
          <VideoCard video={video} isActive={i === activeIndex} />
        </div>
      ))}

      {activeQuery.isFetchingNextPage && (
        <div className="h-20 flex items-center justify-center bg-black">
          <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
