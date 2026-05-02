'use client';

import { useState } from 'react';
import { trpc, type RouterOutputs } from '@/lib/trpc';

type R16Video = RouterOutputs['admin']['r16Queue']['videos'][number];

type View = 'pending' | 'approved';
type ContentRating = 'G' | 'PG' | 'PG-13' | 'R';

const MODEL_LABELS: Record<string, string> = {
  FLUX:          'Flux.1 Dev',
  GROK_IMAGINE:  'Grok Imagine',
  WAN_25:        'Wan 2.6',
  SEEDANCE:      'Seedance',
  HUNYUAN_VIDEO: 'HunyuanVideo',
  KLING_I2V:     'Kling I2V',
  KLING_R2V:     'Kling R2V',
  LTX2:          'LTX-2',
  COG_VIDEO_X:   'CogVideoX',
  NANO_BANANA:   'Nano Banana',
  VEO3:          'Veo 3',
  HIGGSFIELD:    'Higgsfield',
  KLING:         'Kling',
};

function isImageUrl(url: string): boolean {
  return /\.(jpg|jpeg|png|webp|gif|avif|bmp|svg)(\?|$)/i.test(url);
}

export default function R16ModerationPage() {
  const [view, setView]                     = useState<View>('pending');
  const [page, setPage]                     = useState(1);
  const [activeVideo, setActiveVideo]       = useState<string | null>(null);
  const [contentRating, setContentRating]   = useState<ContentRating>('G');
  const [reason, setReason]                 = useState('');

  const { data: stats, refetch: refetchStats } = trpc.admin.r16Stats.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  const { data, refetch, isLoading } = trpc.admin.r16Queue.useQuery(
    { view, page, pageSize: 12 },
  );

  const moderate = trpc.admin.r16Moderate.useMutation({
    onSuccess: () => {
      setActiveVideo(null);
      setReason('');
      refetch();
      refetchStats();
    },
  });

  const handleViewChange = (v: View) => {
    setView(v);
    setPage(1);
    setActiveVideo(null);
  };

  const handleAction = (videoId: string, action: 'approve' | 'reject') => {
    moderate.mutate({
      videoId,
      action,
      contentRating: action === 'approve' ? contentRating : undefined,
      reason: reason.trim() || undefined,
    });
  };

  const selectedVideo = data?.videos.find((v: R16Video) => v.id === activeVideo);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">🧒</span>
          <h1 className="text-xl font-bold text-white">R16 Kids Feed Moderation</h1>
        </div>
        <p className="text-white/40 text-sm">
          Review AI-generated media before it can appear on the R16 kids feed. Only videos marked
          kids-safe here will be shown on r16.raivstream.com.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div
          className="rounded-xl p-4 border"
          style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.07)' }}
        >
          <div className="text-2xl font-bold" style={{ color: '#f59e0b' }}>
            {stats?.pending ?? '—'}
          </div>
          <div className="text-white/50 text-xs mt-0.5">Pending R16 Review</div>
        </div>
        <div
          className="rounded-xl p-4 border"
          style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.07)' }}
        >
          <div className="text-2xl font-bold" style={{ color: '#10b981' }}>
            {stats?.approved ?? '—'}
          </div>
          <div className="text-white/50 text-xs mt-0.5">Approved for R16</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
        {([
          { value: 'pending',  label: 'Pending Review', color: '#f59e0b', count: stats?.pending },
          { value: 'approved', label: 'Approved',       color: '#10b981', count: undefined },
        ] as { value: View; label: string; color: string; count?: number }[]).map(({ value, label, color, count }) => (
          <button
            key={value}
            onClick={() => handleViewChange(value)}
            className="flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: view === value ? 'rgba(255,255,255,0.08)' : 'transparent',
              color:      view === value ? color : 'rgba(255,255,255,0.40)',
            }}
          >
            {label}
            {count != null && count > 0 && (
              <span
                className="ml-1.5 px-1.5 py-0.5 rounded-full text-xs font-bold"
                style={{ background: color + '25', color }}
              >
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Main layout */}
      <div className="flex gap-4">
        {/* Grid */}
        <div className={`flex-1 min-w-0 ${activeVideo ? 'hidden md:block' : ''}`}>
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <div className="w-6 h-6 border-2 border-green-500/30 border-t-green-500 rounded-full animate-spin" />
            </div>
          ) : !data?.videos.length ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <div className="text-4xl mb-3">{view === 'pending' ? '✅' : '🧒'}</div>
              <div className="text-white/50 text-sm">
                {view === 'pending'
                  ? 'No AI-generated videos awaiting R16 review'
                  : 'No videos approved for R16 yet'}
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {data.videos.map((video: R16Video) => {
                  const mediaUrl = video.mp4Url ?? '';
                  const isImg    = isImageUrl(mediaUrl);
                  const isActive = activeVideo === video.id;

                  return (
                    <button
                      key={video.id}
                      onClick={() => {
                        setActiveVideo(isActive ? null : video.id);
                        setReason('');
                        setContentRating((video.contentRating as ContentRating) ?? 'G');
                      }}
                      className="relative group rounded-xl overflow-hidden text-left border-2 transition-all"
                      style={{
                        borderColor: isActive ? '#10b981' : 'transparent',
                        background:  'rgba(255,255,255,0.03)',
                        aspectRatio: '9/16',
                      }}
                    >
                      {/* Thumbnail */}
                      {isImg ? (
                        <img src={mediaUrl} alt={video.title} className="absolute inset-0 w-full h-full object-cover" />
                      ) : video.thumbnailUrl ? (
                        <img src={video.thumbnailUrl} alt={video.title} className="absolute inset-0 w-full h-full object-cover" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center" style={{ background: '#0d1420' }}>
                          <svg className="w-8 h-8 text-white/20" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      )}

                      <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 50%)' }} />

                      <div className="absolute bottom-0 left-0 right-0 p-2">
                        <div className="text-white text-xs font-medium truncate">{video.title || 'Untitled'}</div>
                        <div className="text-white/50 text-xs truncate">
                          {video.generationJob ? MODEL_LABELS[video.generationJob.model] ?? video.generationJob.model : ''}
                        </div>
                      </div>

                      {/* R16 status badge */}
                      <div className="absolute top-2 right-2">
                        {video.isKidsSafe ? (
                          <span className="px-1.5 py-0.5 rounded text-xs font-bold" style={{ background: '#10b98125', color: '#10b981' }}>R16 ✓</span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-xs font-bold" style={{ background: '#f59e0b25', color: '#f59e0b' }}>Review</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Pagination */}
              {data.totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-5">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 rounded-lg text-sm text-white/60 hover:text-white disabled:opacity-30 transition-colors"
                    style={{ background: 'rgba(255,255,255,0.06)' }}
                  >
                    ← Prev
                  </button>
                  <span className="text-white/40 text-sm">{page} / {data.totalPages}</span>
                  <button
                    onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                    disabled={page === data.totalPages}
                    className="px-3 py-1.5 rounded-lg text-sm text-white/60 hover:text-white disabled:opacity-30 transition-colors"
                    style={{ background: 'rgba(255,255,255,0.06)' }}
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Detail panel */}
        {activeVideo && selectedVideo && (
          <div
            className="w-full md:w-80 flex-shrink-0 rounded-2xl border p-4 flex flex-col gap-4"
            style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
          >
            {/* Mobile close */}
            <div className="flex items-center justify-between md:hidden">
              <span className="text-white font-semibold text-sm">R16 Review</span>
              <button onClick={() => setActiveVideo(null)} className="text-white/40 hover:text-white">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Preview */}
            <div className="rounded-xl overflow-hidden" style={{ aspectRatio: '9/16', background: '#0d1420' }}>
              {(() => {
                const url = selectedVideo.mp4Url ?? '';
                if (isImageUrl(url)) return <img src={url} alt={selectedVideo.title} className="w-full h-full object-cover" />;
                if (url) return <video src={url} controls muted className="w-full h-full object-cover" />;
                if (selectedVideo.thumbnailUrl) return <img src={selectedVideo.thumbnailUrl} alt={selectedVideo.title} className="w-full h-full object-cover" />;
                return <div className="flex items-center justify-center h-full"><span className="text-white/20 text-sm">No preview</span></div>;
              })()}
            </div>

            {/* Meta */}
            <div>
              <h3 className="text-white font-semibold text-sm leading-tight">{selectedVideo.title || 'Untitled'}</h3>
              {selectedVideo.description && (
                <p className="text-white/50 text-xs mt-1 line-clamp-2">{selectedVideo.description}</p>
              )}

              {/* Creator */}
              <div className="flex items-center gap-2 mt-2">
                {selectedVideo.creator.avatarUrl ? (
                  <img src={selectedVideo.creator.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
                ) : (
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)', color: '#fff' }}
                  >
                    {(selectedVideo.creator.displayName ?? selectedVideo.creator.username)[0]}
                  </div>
                )}
                <span className="text-white/60 text-xs">@{selectedVideo.creator.username}</span>
              </div>

              {/* AI model + prompt */}
              {selectedVideo.generationJob && (
                <div
                  className="mt-3 rounded-lg p-2.5 text-xs"
                  style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.15)' }}
                >
                  <div className="font-semibold mb-1" style={{ color: '#10b981' }}>
                    🤖 {MODEL_LABELS[selectedVideo.generationJob.model] ?? selectedVideo.generationJob.model}
                  </div>
                  <div className="text-white/50 line-clamp-3">{selectedVideo.generationJob.prompt}</div>
                </div>
              )}

              {/* Tags */}
              {selectedVideo.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {selectedVideo.tags.slice(0, 5).map((tag: string) => (
                    <span key={tag} className="text-xs px-1.5 py-0.5 rounded"
                      style={{ background: 'rgba(167,139,250,0.1)', color: '#a78bfa' }}>
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="flex flex-col gap-3">
              {/* Content rating (only relevant for approval) */}
              <div>
                <label className="text-white/50 text-xs mb-1.5 block">Kids Content Rating</label>
                <div className="flex gap-1.5">
                  {(['G', 'PG', 'PG-13'] as ContentRating[]).map((r) => (
                    <button
                      key={r}
                      onClick={() => setContentRating(r)}
                      className="flex-1 py-1 rounded-lg text-xs font-bold transition-all"
                      style={{
                        background: contentRating === r ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.05)',
                        color:      contentRating === r ? '#10b981' : 'rgba(255,255,255,0.4)',
                        border:     `1px solid ${contentRating === r ? '#10b98140' : 'transparent'}`,
                      }}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <p className="text-white/25 text-xs mt-1">Rating applied when approving. R-rated content cannot be approved.</p>
              </div>

              {/* Reason */}
              <div>
                <label className="text-white/50 text-xs mb-1.5 block">Note (optional)</label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  placeholder="Add a note…"
                  className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-white/25 outline-none resize-none"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                />
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => handleAction(activeVideo, 'reject')}
                  disabled={moderate.isPending}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                  style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}
                >
                  Keep off R16
                </button>
                <button
                  onClick={() => handleAction(activeVideo, 'approve')}
                  disabled={moderate.isPending}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                  style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}
                >
                  {moderate.isPending ? '…' : 'Approve for R16'}
                </button>
              </div>

              {/* Moderation history */}
              {selectedVideo.moderationLogs.length > 0 && (
                <div className="border-t pt-3" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
                  <div className="text-white/30 text-xs mb-2">History</div>
                  {selectedVideo.moderationLogs.map((log: R16Video['moderationLogs'][number]) => (
                    <div key={log.id} className="text-xs text-white/50 mb-1">
                      <span className="font-medium" style={{
                        color: log.action === 'approve' ? '#10b981' : log.action === 'reject' ? '#ef4444' : '#f59e0b',
                      }}>
                        {log.action}
                      </span>
                      {log.reason && <span className="ml-1">— {log.reason}</span>}
                      <span className="ml-1 text-white/25">
                        {new Date(log.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
