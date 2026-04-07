'use client';

import { useEffect, useRef, useState } from 'react';

interface VideoPlayerProps {
  /** Either a direct MP4 URL or an HLS .m3u8 URL */
  videoUrl: string;
  thumbnailUrl: string;
  isActive: boolean;
  onProgress?: (currentTime: number, duration: number) => void;
  onEnded?: () => void;
}

function isHlsUrl(url: string) {
  return url.includes('.m3u8');
}

export function VideoPlayer({
  videoUrl,
  thumbnailUrl,
  isActive,
  onProgress,
  onEnded,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Source setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;

    setIsLoading(true);

    if (isHlsUrl(videoUrl)) {
      // HLS path — load hls.js lazily so it doesn't bloat the initial bundle
      import('hls.js').then(({ default: Hls }) => {
        if (Hls.isSupported()) {
          const hls = new Hls({ enableWorker: true, backBufferLength: 30 });
          hls.loadSource(videoUrl);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => setIsLoading(false));
          hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) setIsLoading(false); });
          return () => hls.destroy();
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          // Safari native HLS
          video.src = videoUrl;
        }
      });
    } else {
      // Plain MP4 — just set src, browser handles range requests & seeking natively
      video.src = videoUrl;
      video.preload = 'auto';
    }
  }, [videoUrl]);

  // ── Loading state ─────────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onReady = () => setIsLoading(false);
    video.addEventListener('canplay', onReady);
    return () => video.removeEventListener('canplay', onReady);
  }, [videoUrl]);

  // ── Play / pause based on active slide ────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isActive) {
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      video.pause();
      video.currentTime = 0;
      setIsPlaying(false);
    }
  }, [isActive]);

  // ── Progress reporting (every 5 s while playing) ──────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isActive || !onProgress) return;
    progressInterval.current = setInterval(() => {
      if (!video.paused && video.duration) onProgress(video.currentTime, video.duration);
    }, 5000);
    return () => { if (progressInterval.current) clearInterval(progressInterval.current); };
  }, [isActive, onProgress]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().then(() => setIsPlaying(true)).catch(() => {});
    else { video.pause(); setIsPlaying(false); }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  return (
    <div className="relative w-full h-full bg-black select-none">
      {/* Thumbnail — shown until the video can play */}
      {thumbnailUrl && isLoading && (
        <img src={thumbnailUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
      )}

      {/* The video element — MP4 or HLS both use the same <video> */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        loop
        playsInline
        muted={isMuted}
        onEnded={onEnded}
        onClick={togglePlay}
        onWaiting={() => setIsLoading(true)}
        onPlaying={() => setIsLoading(false)}
      />

      {/* Spinner */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      )}

      {/* Paused overlay */}
      {!isLoading && !isPlaying && (
        <div className="absolute inset-0 flex items-center justify-center" onClick={togglePlay}>
          <div className="w-16 h-16 rounded-full bg-black/50 flex items-center justify-center">
            <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      )}

      {/* Mute button */}
      <button
        onClick={(e) => { e.stopPropagation(); toggleMute(); }}
        className="absolute bottom-4 right-4 w-10 h-10 rounded-full bg-black/50 flex items-center justify-center z-10"
        aria-label={isMuted ? 'Unmute' : 'Mute'}
      >
        {isMuted ? (
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
          </svg>
        ) : (
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15.536 8.464a5 5 0 010 7.072M12 6v12m-3.536-9.536a5 5 0 000 7.072M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
          </svg>
        )}
      </button>
    </div>
  );
}
