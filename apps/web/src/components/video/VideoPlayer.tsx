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
  const videoRef    = useRef<HTMLVideoElement>(null);
  const bgVideoRef  = useRef<HTMLVideoElement>(null);
  const [isPlaying,   setIsPlaying]   = useState(false);
  const [isMuted,     setIsMuted]     = useState(true); // start muted so browser allows autoplay
  const [isLoading,   setIsLoading]   = useState(true);
  const [isLandscape, setIsLandscape] = useState(false); // true when video is wider than it is tall
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Source setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    const video   = videoRef.current;
    const bgVideo = bgVideoRef.current;
    if (!video || !videoUrl) return;

    setIsLoading(true);
    setIsLandscape(false); // reset on new source

    // Always set bg video src (element is always in DOM now)
    if (bgVideo) {
      bgVideo.src    = videoUrl;
      bgVideo.preload = 'auto';
    }

    if (isHlsUrl(videoUrl)) {
      import('hls.js').then(({ default: Hls }) => {
        if (Hls.isSupported()) {
          const hls = new Hls({ enableWorker: true, backBufferLength: 30 });
          hls.loadSource(videoUrl);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => setIsLoading(false));
          hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) setIsLoading(false); });
          return () => hls.destroy();
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = videoUrl;
        }
      });
    } else {
      video.src     = videoUrl;
      video.preload = 'auto';
    }
  }, [videoUrl]);

  // ── Landscape detection — fires once video dimensions are known ───────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onMeta = () => {
      setIsLandscape(video.videoWidth > video.videoHeight);
    };
    video.addEventListener('loadedmetadata', onMeta);
    return () => video.removeEventListener('loadedmetadata', onMeta);
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
    const video   = videoRef.current;
    const bgVideo = bgVideoRef.current;
    if (!video) return;
    if (isActive) {
      video.play().then(() => setIsPlaying(true)).catch(() => {});
      bgVideo?.play().catch(() => {});
    } else {
      video.pause();
      video.currentTime = 0;
      setIsPlaying(false);
      if (bgVideo) { bgVideo.pause(); bgVideo.currentTime = 0; }
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
    <div className="relative w-full h-full bg-black select-none overflow-hidden">
      {/* ── Blurred backdrop — always in DOM so bgVideoRef is always attached.
          Visibility toggled via opacity/pointer-events once isLandscape is known.
          Same src as the foreground video → browser shares the decoded frames.   */}
      <video
        ref={bgVideoRef}
        className="absolute inset-0 w-full h-full object-cover"
        style={{
          filter:     'blur(28px)',
          transform:  'scale(1.15)',
          opacity:    isLandscape ? 1 : 0,
          pointerEvents: 'none',
        }}
        loop
        playsInline
        muted
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* Thumbnail — shown until the video can play */}
      {thumbnailUrl && isLoading && (
        <img
          src={thumbnailUrl}
          alt=""
          className={`absolute inset-0 w-full h-full ${isLandscape ? 'object-contain' : 'object-cover'}`}
        />
      )}

      {/* The video element — object-contain for landscape, object-cover for portrait */}
      <video
        ref={videoRef}
        className={`absolute inset-0 w-full h-full ${isLandscape ? 'object-contain' : 'object-cover'}`}
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
        <button
          type="button"
          onClick={togglePlay}
          aria-label="Play"
          className="absolute inset-0 flex items-center justify-center w-full bg-transparent border-0 p-0 cursor-pointer"
        >
          <div className="w-16 h-16 rounded-full bg-black/50 flex items-center justify-center">
            <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </button>
      )}

      {/* Mute button */}
      <button
        onClick={(e) => { e.stopPropagation(); toggleMute(); }}
        className="absolute bottom-4 left-4 w-10 h-10 rounded-full bg-black/50 flex items-center justify-center z-10 focus-visible:ring-2 focus-visible:ring-white/60"
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
