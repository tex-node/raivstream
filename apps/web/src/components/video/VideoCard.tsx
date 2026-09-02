'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { VideoPlayer } from './VideoPlayer';
import { VideoInteractions } from './VideoInteractions';
import { trpc } from '@/lib/trpc';
import { useUser } from '@/lib/auth';

interface VideoCardProps {
  video: {
    id: string;
    title: string;
    description: string | null;
    thumbnailUrl: string;
    mp4Url: string | null;        // primary served MP4 (R2 CDN)
    hlsMasterUrl: string | null;  // HLS playlist — set only after transcoding
    duration: number;
    viewCount: number;
    likeCount: number;
    dislikeCount: number;
    avgStarRating: number;
    starRatingCount: number;
    isPremiumOnly: boolean;
    tags: string[];
    creator: {
      id: string;
      username: string;
      displayName: string;
      avatarUrl: string | null;
      verified: boolean;
    };
  };
  isActive:        boolean;
  /** True when the user has hit their free episode limit AND this video is premium-only */
  isLocked?:       boolean;
  onEnded?:        () => void;
}

/** Returns true if the URL points to a static image rather than a video */
function isImageUrl(url: string): boolean {
  return /\.(jpg|jpeg|png|webp|gif|avif|bmp|svg)(\?|$)/i.test(url);
}

export function VideoCard({ video, isActive, isLocked = false, onEnded }: VideoCardProps) {
  const { isSignedIn } = useUser();
  const router         = useRouter();
  const trackProgress  = trpc.interaction.trackProgress.useMutation();
  const recordView     = trpc.interaction.recordView.useMutation();
  // Tracks which videoId we've already pinged so we don't double-count on re-renders
  const recordedViewId = useRef<string | null>(null);
  const imageTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isLandscapeImage, setIsLandscapeImage] = useState(false);

  // Guest view counting — fires once per video activation for non-signed-in users
  useEffect(() => {
    if (isActive && !isSignedIn && recordedViewId.current !== video.id) {
      recordedViewId.current = video.id;
      recordView.mutate({ videoId: video.id });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, isSignedIn, video.id]);

  const handleProgress = (currentTime: number, duration: number) => {
    if (!isSignedIn) return;
    trackProgress.mutate({
      videoId: video.id,
      watchTimeSeconds: Math.floor(currentTime),
      completed: currentTime / duration >= 0.9,
      lastPosition: Math.floor(currentTime),
    });
  };

  // Determine what to render:
  // HLS > real MP4 > image (thumbnailUrl or image mp4Url) > processing placeholder
  const hlsUrl   = video.hlsMasterUrl;
  const mediaUrl = video.mp4Url;
  const hasVideo = (hlsUrl || mediaUrl) && !isImageUrl(hlsUrl ?? mediaUrl ?? '');
  const imageUrl = isImageUrl(hlsUrl ?? mediaUrl ?? '')
    ? (hlsUrl ?? mediaUrl)!
    : video.thumbnailUrl;
  const isImageOnly = !hasVideo;

  // Image autoscroll: 5 s after becoming active
  useEffect(() => {
    if (!isImageOnly || !onEnded) return;
    if (isActive) {
      imageTimerRef.current = setTimeout(onEnded, 5000);
    } else {
      if (imageTimerRef.current) {
        clearTimeout(imageTimerRef.current);
        imageTimerRef.current = null;
      }
    }
    return () => {
      if (imageTimerRef.current) {
        clearTimeout(imageTimerRef.current);
        imageTimerRef.current = null;
      }
    };
  }, [isActive, isImageOnly, onEnded]);

  return (
    <div className="relative w-full h-full">
      {/* Video/image fills the full screen */}
      {hasVideo ? (
        <VideoPlayer
          videoUrl={(hlsUrl ?? mediaUrl)!}
          thumbnailUrl={video.thumbnailUrl}
          isActive={isActive && !isLocked}
          onProgress={handleProgress}
          onEnded={onEnded}
        />
      ) : imageUrl ? (
        /* Image-only content — AI generated images published to feed.
           Landscape images get the same blurred-backdrop treatment as landscape videos:
           a blurred + scaled copy fills the black letterbox bars behind the main image. */
        <div className="relative w-full h-full bg-black overflow-hidden">
          {/* Blurred backdrop — same src, fades in once we know the image is landscape */}
          <img
            src={imageUrl}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            style={{
              filter:    'blur(28px)',
              transform: 'scale(1.15)',
              opacity:   isLandscapeImage ? 1 : 0,
            }}
          />
          {/* Main image — always object-contain so it never crops */}
          <img
            src={imageUrl}
            alt={video.title}
            className="relative w-full h-full object-contain"
            onLoad={(e) => {
              const img = e.currentTarget;
              setIsLandscapeImage(img.naturalWidth > img.naturalHeight);
            }}
          />
        </div>
      ) : (
        <div className="w-full h-full bg-[var(--noc-page)] flex items-center justify-center">
          <span className="text-[var(--noc-t4)] text-sm">Processing…</span>
        </div>
      )}

      {/* Premium lock overlay — shown when user has hit their free episode limit */}
      {isLocked && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-black/75 backdrop-blur-sm">
          <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <div className="text-center px-6">
            <p className="text-white font-semibold text-base">Premium Content</p>
            <p className="text-white/50 text-sm mt-1">
              Subscribe to keep watching
            </p>
          </div>
          <button
            onClick={() => router.push('/pricing')}
            className="px-6 py-2.5 rounded-2xl text-sm font-semibold transition-colors"
            style={{ background: 'var(--noc-gradient)', color: '#0B0D14' }}
          >
            Subscribe — ₦1,500/mo
          </button>
        </div>
      )}

      {/* Bottom overlay: title, creator, tags — leaves right 64px for interaction buttons */}
      <div className="absolute bottom-0 left-0 right-16 p-4 bg-gradient-to-t from-black/80 to-transparent z-10">
        <Link href={`/${video.creator.username}`} className="flex items-center gap-2 mb-2">
          <span className="text-white font-semibold text-sm">
            @{video.creator.username}
          </span>
          {video.creator.verified && (
            <svg className="w-4 h-4 text-[#4f8bd6]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
          )}
        </Link>

        <p className="text-white text-sm font-medium mb-1 line-clamp-2">{video.title}</p>

        {video.description && (
          <p className="text-white/70 text-xs mb-2 line-clamp-2">{video.description}</p>
        )}

        {/* Tags */}
        {video.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {video.tags.slice(0, 4).map((tag) => (
              <span key={tag} className="text-white/80 text-xs">
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Interaction buttons — overlaid on the right side of the video */}
      <div className="absolute right-0 bottom-0 w-16 flex flex-col justify-end z-10">
        <VideoInteractions video={video} />
      </div>
    </div>
  );
}
