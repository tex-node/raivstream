'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
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
    tags: string[];
    creator: {
      id: string;
      username: string;
      displayName: string;
      avatarUrl: string | null;
      verified: boolean;
    };
  };
  isActive: boolean;
  onEnded?: () => void;
}

/** Returns true if the URL points to a static image rather than a video */
function isImageUrl(url: string): boolean {
  return /\.(jpg|jpeg|png|webp|gif|avif|bmp|svg)(\?|$)/i.test(url);
}

export function VideoCard({ video, isActive, onEnded }: VideoCardProps) {
  const { isSignedIn } = useUser();
  const trackProgress = trpc.interaction.trackProgress.useMutation();
  const imageTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isLandscapeImage, setIsLandscapeImage] = useState(false);

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
          isActive={isActive}
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
        <div className="w-full h-full bg-gray-900 flex items-center justify-center">
          <span className="text-white/50 text-sm">Processing…</span>
        </div>
      )}

      {/* Bottom overlay: title, creator, tags — leaves right 64px for interaction buttons */}
      <div className="absolute bottom-0 left-0 right-16 p-4 bg-gradient-to-t from-black/80 to-transparent z-10">
        <Link href={`/${video.creator.username}`} className="flex items-center gap-2 mb-2">
          <span className="text-white font-semibold text-sm">
            @{video.creator.username}
          </span>
          {video.creator.verified && (
            <svg className="w-4 h-4 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
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
