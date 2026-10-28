'use client';

/**
 * Track C - video playback + download lightbox.
 *
 * The grid only shows a thumbnail, but admins need the raw MP4 to hand to
 * institutions, so this is both a player and a download affordance.
 *
 * The `download` attribute only works for same-origin URLs; across origins the
 * browser ignores it and navigates instead. R2 is a different origin, so the
 * filename hint is best-effort - the important part is that we link the MP4 and
 * not an HLS manifest, which the browser cannot save as a playable file.
 */

import { useEffect } from 'react';

export function VideoLightbox({
  isOpen,
  onClose,
  videoUrl,
  title,
}: {
  isOpen: boolean;
  onClose: () => void;
  videoUrl: string | null;
  title?: string;
}) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen || !videoUrl) return null;

  const safeName = (title ?? 'video').replace(/[^\w\s-]/g, '').trim() || 'video';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-3xl rounded-2xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] p-3"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-1 pb-2">
          <p className="truncate text-xs font-bold text-[var(--noc-t2)]">{title ?? 'Video'}</p>
          <button type="button" onClick={onClose} className="text-xs text-[var(--noc-t5)]">Close</button>
        </div>

        <video src={videoUrl} controls autoPlay className="max-h-[80vh] w-full rounded-xl bg-black" />

        <a
          href={videoUrl}
          download={`${safeName}.mp4`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 block w-full rounded-xl bg-[rgba(217,70,168,0.9)] px-4 py-2.5 text-center text-sm font-bold text-white"
        >
          Download Video
        </a>
      </div>
    </div>
  );
}
