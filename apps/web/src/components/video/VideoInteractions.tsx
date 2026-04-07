'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useUser } from '@/lib/auth';
import { trpc } from '@/lib/trpc';

interface VideoInteractionsProps {
  video: {
    id: string;
    likeCount: number;
    dislikeCount: number;
    avgStarRating: number;
    starRatingCount: number;
    creator: {
      id: string;
      username: string;
      displayName: string;
      avatarUrl: string | null;
      verified: boolean;
    };
  };
  viewerInteraction?: {
    liked: boolean;
    disliked: boolean;
    starRating: number | null;
  } | null;
}

export function VideoInteractions({ video, viewerInteraction }: VideoInteractionsProps) {
  const { isSignedIn } = useUser();
  const [liked, setLiked] = useState(viewerInteraction?.liked ?? false);
  const [disliked, setDisliked] = useState(viewerInteraction?.disliked ?? false);
  const [likeCount, setLikeCount] = useState(video.likeCount);
  const [showStars, setShowStars] = useState(false);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [myRating, setMyRating] = useState(viewerInteraction?.starRating ?? 0);

  const toggleLike = trpc.interaction.toggleLike.useMutation({
    onMutate: () => {
      const wasLiked = liked;
      setLiked(!wasLiked);
      setLikeCount((c) => c + (wasLiked ? -1 : 1));
      if (!wasLiked && disliked) setDisliked(false);
    },
  });

  const toggleDislike = trpc.interaction.toggleDislike.useMutation({
    onMutate: () => {
      const wasDisliked = disliked;
      setDisliked(!wasDisliked);
      if (!wasDisliked && liked) {
        setLiked(false);
        setLikeCount((c) => c - 1);
      }
    },
  });

  const setRating = trpc.interaction.setRating.useMutation({
    onSuccess: ({ rating }) => {
      setMyRating(rating);
      setShowStars(false);
    },
  });

  const toggleFollow = trpc.user.toggleFollow.useMutation();

  const handleLike = () => {
    if (!isSignedIn) return;
    toggleLike.mutate({ videoId: video.id });
  };

  const handleDislike = () => {
    if (!isSignedIn) return;
    toggleDislike.mutate({ videoId: video.id });
  };

  const handleRate = (rating: number) => {
    if (!isSignedIn) return;
    setRating.mutate({ videoId: video.id, rating });
  };

  return (
    <div className="flex flex-col items-center gap-5 py-4">
      {/* Creator avatar */}
      <Link href={`/${video.creator.username}`} className="relative">
        <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white">
          {video.creator.avatarUrl ? (
            <img src={video.creator.avatarUrl} alt={video.creator.displayName} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-pink-500 flex items-center justify-center text-white font-bold">
              {video.creator.displayName[0]}
            </div>
          )}
        </div>
        {/* Follow + button */}
        <button
          onClick={(e) => {
            e.preventDefault();
            if (isSignedIn) toggleFollow.mutate({ targetUserId: video.creator.id });
          }}
          className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-pink-500 flex items-center justify-center"
        >
          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </Link>

      {/* Like */}
      <button onClick={handleLike} className="flex flex-col items-center gap-1">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${liked ? 'bg-pink-500' : 'bg-white/20'}`}>
          <svg className="w-6 h-6 text-white" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        </div>
        <span className="text-white text-xs font-semibold">{likeCount.toLocaleString()}</span>
      </button>

      {/* Dislike */}
      <button onClick={handleDislike} className="flex flex-col items-center gap-1">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${disliked ? 'bg-gray-500' : 'bg-white/20'}`}>
          <svg className="w-6 h-6 text-white" fill={disliked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
          </svg>
        </div>
        <span className="text-white text-xs font-semibold">{video.dislikeCount.toLocaleString()}</span>
      </button>

      {/* Star rating */}
      <div className="relative flex flex-col items-center gap-1">
        <button
          onClick={() => isSignedIn && setShowStars(!showStars)}
          className="flex flex-col items-center gap-1"
        >
          <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${myRating > 0 ? 'bg-yellow-500' : 'bg-white/20'}`}>
            <svg className="w-6 h-6 text-white" fill={myRating > 0 ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </div>
          <span className="text-white text-xs font-semibold">
            {video.avgStarRating > 0 ? video.avgStarRating.toFixed(1) : '—'}
          </span>
        </button>

        {/* Star picker popover */}
        {showStars && (
          <div className="absolute right-14 bottom-0 bg-black/90 border border-white/20 rounded-xl p-3 flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onMouseEnter={() => setHoveredStar(star)}
                onMouseLeave={() => setHoveredStar(0)}
                onClick={() => handleRate(star)}
              >
                <svg
                  className={`w-7 h-7 transition-colors ${star <= (hoveredStar || myRating) ? 'text-yellow-400' : 'text-white/30'}`}
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Share */}
      <button
        onClick={() => navigator.share?.({ title: 'Check this out on Raivstream', url: window.location.href })}
        className="flex flex-col items-center gap-1"
      >
        <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
        </div>
        <span className="text-white text-xs font-semibold">Share</span>
      </button>
    </div>
  );
}
