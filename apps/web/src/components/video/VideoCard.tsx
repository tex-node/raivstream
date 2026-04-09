'use client';

import Link from 'next/link';
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
}

export function VideoCard({ video, isActive }: VideoCardProps) {
  const { isSignedIn, user } = useUser();
  const trackProgress = trpc.interaction.trackProgress.useMutation();

  const handleProgress = (currentTime: number, duration: number) => {
    if (!isSignedIn) return;
    trackProgress.mutate({
      videoId: video.id,
      watchTimeSeconds: Math.floor(currentTime),
      completed: currentTime / duration >= 0.9,
      lastPosition: Math.floor(currentTime),
    });
  };

  return (
    <div className="relative w-full h-full flex">
      {/* Video fills the screen */}
      <div className="flex-1 relative">
        {/* HLS → MP4 → image-only (AI generated) → processing placeholder */}
        {(video.hlsMasterUrl ?? video.mp4Url) ? (
          <VideoPlayer
            videoUrl={(video.hlsMasterUrl ?? video.mp4Url)!}
            thumbnailUrl={video.thumbnailUrl}
            isActive={isActive}
            onProgress={handleProgress}
          />
        ) : video.thumbnailUrl ? (
          /* Image-only content (AI generated images published to feed) */
          <div className="w-full h-full bg-black flex items-center justify-center">
            <img
              src={video.thumbnailUrl}
              alt={video.title}
              className="w-full h-full object-contain"
            />
          </div>
        ) : (
          <div className="w-full h-full bg-gray-900 flex items-center justify-center">
            <span className="text-white/50 text-sm">Processing…</span>
          </div>
        )}

        {/* Bottom overlay: title, creator, tags */}
        <div className="absolute bottom-0 left-0 right-16 p-4 bg-gradient-to-t from-black/80 to-transparent">
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
      </div>

      {/* Right sidebar interactions */}
      <div className="w-16 flex flex-col justify-end">
        <VideoInteractions video={video} />
      </div>
    </div>
  );
}
