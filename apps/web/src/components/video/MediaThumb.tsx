'use client';

/**
 * D-004 - one thumbnail renderer for mixed media.
 *
 * The fallback chain was hand-rolled in `analytics/page.tsx` and again inside
 * the video card: try the still, fall back to a muted video frame, then to a
 * placeholder. Three copies meant three behaviours; this is the single one.
 *
 * Deliberately *not* a player: no controls, no autoplay, no HLS. Grids want a
 * frame, and the feed's `VideoPlayer` exists for actual playback.
 */

import { useState } from 'react';

export interface MediaThumbProps {
  thumbnailUrl?: string | null;
  videoUrl?: string | null;
  alt: string;
  className?: string;
}

export function MediaThumb({ thumbnailUrl, videoUrl, alt, className }: MediaThumbProps) {
  const [imageFailed, setImageFailed] = useState(false);

  const wrapper = className ?? 'w-full h-full';

  if (thumbnailUrl && !imageFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote R2/generated URLs, not Next assets
      <img
        src={thumbnailUrl}
        alt={alt}
        onError={() => setImageFailed(true)}
        className={`${wrapper} object-cover`}
      />
    );
  }

  if (videoUrl) {
    return (
      <video
        src={videoUrl}
        muted
        playsInline
        preload="metadata"
        className={`${wrapper} object-cover`}
      />
    );
  }

  return (
    <div
      className={`${wrapper} flex items-center justify-center bg-gradient-to-br from-zinc-900 to-zinc-800`}
      role="img"
      aria-label={alt}
    >
      <svg className="w-5 h-5 text-[var(--noc-t6)]" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 5v14l11-7z" />
      </svg>
    </div>
  );
}
