'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';

type ModerationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'FLAGGED';
type ContentRating = 'G' | 'PG' | 'PG-13' | 'R';

const STATUS_TABS: { value: ModerationStatus; label: string; color: string }[] = [
  { value: 'PENDING',  label: 'Pending',  color: '#f59e0b' },
  { value: 'FLAGGED',  label: 'Flagged',  color: '#ef4444' },
  { value: 'APPROVED', label: 'Approved', color: '#10b981' },
  { value: 'REJECTED', label: 'Rejected', color: '#6b7280' },
];

function isImageUrl(url: string): boolean {
  return /\.(jpg|jpeg|png|webp|gif|avif|bmp|svg)(\?|$)/i.test(url);
}

export default function ModerationPage() {
  const [activeStatus, setActiveStatus] = useState<ModerationStatus>('PENDING');
  const [page, setPage] = useState(1);
  const [activeVideo, setActiveVideo] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [isKidsSafe, setIsKidsSafe] = useState(false);
  const [contentRating, setContentRating] = useState<ContentRating>('PG');

  const { data: stats } = trpc.admin.getModerationStats.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  const { data, refetch, isLoading } = trpc.admin.moderationQueue.useQuery(
    { status: activeStatus, page, pageSize: 12 },
    { keepPreviousData: true }
  );

  const moderate = trpc.admin.moderateVideo.useMutation({
    onSuccess: () => {
      setActiveVideo(null);
      setReason('');
      refetch();
    },
  });

  const handleTabChange = (status: ModerationStatus) => {
    setActiveStatus(status);
    setPage(1);
    setActiveVideo(null);
  };

  const handleAction = (videoId: string, action: 'approve' | 'reject' | 'flag') => {
    moderate.mutate({
      videoId,
      action,
      reason: reason.trim() || undefined,
      isKidsSafe,
      contentRating,
    });
  };

  const selectedVideo = data?.videos.find((v) => v.id === activeVideo);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Content Moderation</h1>
        <p className="text-white/40 text-sm mt-0.5">Review and approve videos before they appear in feeds</p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Pending',  value: stats.pending,  color: '#f59e0b' },
            { label: 'Flagged',  value: stats.flagged,  color: '#ef4444' },
            { label: 'Approved', value: stats.approved, color: '#10b981' },
            { label: 'Rejected', value: stats.rejected, color: '#6b7280' },
          ].map(({ label, value, color }) => (
            <div
              key={label}
              className="rounded-xl p-4 border"
              style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.07)' }}
            >
              <div className="text-2xl font-bold" style={{ color }}>{value}</div>
              <div className="text-white/50 text-xs mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-5 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
        {STATUS_TABS.map(({ value, label, color }) => (
          <button
            key={value}
            onClick={() => handleTabChange(value)}
            className="flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: activeStatus === value ? 'rgba(255,255,255,0.08)' : 'transparent',
              color: activeStatus === value ? color : 'rgba(255,255,255,0.40)',
            }}
          >
            {label}
            {value === 'PENDING' && stats?.pending ? (
              <span
                className="ml-1.5 px-1.5 py-0.5 rounded-full text-xs font-bold"
                style={{ background: color + '25', color }}
              >
                {stats.pending}
              </span>
            ) : value === 'FLAGGED' && stats?.flagged ? (
              <span
                className="ml-1.5 px-1.5 py-0.5 rounded-full text-xs font-bold"
                style={{ background: color + '25', color }}
              >
                {stats.flagged}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Main content — grid + detail panel */}
      <div className="flex gap-4">
        {/* Video grid */}
        <div className={`flex-1 min-w-0 ${activeVideo ? 'hidden md:block' : ''}`}>
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <div className="w-6 h-6 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
            </div>
          ) : !data?.videos.length ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <div className="text-4xl mb-3">✅</div>
              <div className="text-white/50 text-sm">No {activeStatus.toLowerCase()} videos</div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {data.videos.map((video) => {
                  const mediaUrl = video.mp4Url ?? '';
                  const isImg = isImageUrl(mediaUrl);
                  const isActive = activeVideo === video.id;

                  return (
                    <button
                      key={video.id}
                      onClick={() => {
                        setActiveVideo(isActive ? null : video.id);
                        setReason('');
                        setIsKidsSafe(video.isKidsSafe ?? false);
                        setContentRating((video.contentRating as ContentRating) ?? 'PG');
                      }}
                      className="relative group rounded-xl overflow-hidden text-left border-2 transition-all"
                      style={{
                        borderColor: isActive ? '#a78bfa' : 'transparent',
                        background: 'rgba(255,255,255,0.03)',
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

                      {/* Gradient overlay */}
                      <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 50%)' }} />

                      {/* Info */}
                      <div className="absolute bottom-0 left-0 right-0 p-2">
                        <div className="text-white text-xs font-medium truncate">{video.title}</div>
                        <div className="text-white/50 text-xs truncate">@{video.creator.username}</div>
                      </div>

                      {/* Status badge */}
                      <div className="absolute top-2 right-2">
                        {video.moderationStatus === 'PENDING' && (
                          <span className="px-1.5 py-0.5 rounded text-xs font-bold" style={{ background: '#f59e0b25', color: '#f59e0b' }}>PENDING</span>
                        )}
                        {video.moderationStatus === 'FLAGGED' && (
                          <span className="px-1.5 py-0.5 rounded text-xs font-bold" style={{ background: '#ef444425', color: '#ef4444' }}>FLAGGED</span>
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
                  <span className="text-white/40 text-sm">
                    {page} / {data.totalPages}
                  </span>
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
            {/* Close on mobile */}
            <div className="flex items-center justify-between md:hidden">
              <span className="text-white font-semibold text-sm">Review</span>
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
                if (isImageUrl(url)) {
                  return <img src={url} alt={selectedVideo.title} className="w-full h-full object-cover" />;
                }
                if (url) {
                  return (
                    <video
                      src={url}
                      controls
                      muted
                      className="w-full h-full object-cover"
                    />
                  );
                }
                if (selectedVideo.thumbnailUrl) {
                  return <img src={selectedVideo.thumbnailUrl} alt={selectedVideo.title} className="w-full h-full object-cover" />;
                }
                return (
                  <div className="flex items-center justify-center h-full">
                    <span className="text-white/20 text-sm">No preview</span>
                  </div>
                );
              })()}
            </div>

            {/* Info */}
            <div>
              <h3 className="text-white font-semibold text-sm leading-tight">{selectedVideo.title}</h3>
              {selectedVideo.description && (
                <p className="text-white/50 text-xs mt-1 line-clamp-3">{selectedVideo.description}</p>
              )}
              <div className="flex items-center gap-2 mt-2">
                {selectedVideo.creator.avatarUrl ? (
                  <img src={selectedVideo.creator.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
                ) : (
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)', color: '#fff' }}>
                    {selectedVideo.creator.displayName[0]}
                  </div>
                )}
                <span className="text-white/60 text-xs">@{selectedVideo.creator.username}</span>
              </div>
              {selectedVideo.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {selectedVideo.tags.slice(0, 5).map((tag) => (
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
              {/* Content rating */}
              <div>
                <label className="text-white/50 text-xs mb-1.5 block">Content Rating</label>
                <div className="flex gap-1.5">
                  {(['G', 'PG', 'PG-13', 'R'] as ContentRating[]).map((r) => (
                    <button
                      key={r}
                      onClick={() => setContentRating(r)}
                      className="flex-1 py-1 rounded-lg text-xs font-bold transition-all"
                      style={{
                        background: contentRating === r ? 'rgba(167,139,250,0.2)' : 'rgba(255,255,255,0.05)',
                        color: contentRating === r ? '#a78bfa' : 'rgba(255,255,255,0.4)',
                        border: `1px solid ${contentRating === r ? '#a78bfa40' : 'transparent'}`,
                      }}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Kids safe */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isKidsSafe}
                  onChange={(e) => setIsKidsSafe(e.target.checked)}
                  className="w-4 h-4 accent-violet-500"
                />
                <span className="text-white/70 text-sm">Safe for R16 (kids feed)</span>
              </label>

              {/* Reason */}
              <div>
                <label className="text-white/50 text-xs mb-1.5 block">Reason (optional for approve)</label>
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
                  className="flex-1 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                  style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}
                >
                  Reject
                </button>
                <button
                  onClick={() => handleAction(activeVideo, 'flag')}
                  disabled={moderate.isPending}
                  className="flex-1 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                  style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}
                >
                  Flag
                </button>
                <button
                  onClick={() => handleAction(activeVideo, 'approve')}
                  disabled={moderate.isPending}
                  className="flex-1 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                  style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}
                >
                  {moderate.isPending ? '…' : 'Approve'}
                </button>
              </div>

              {/* Recent moderation logs */}
              {selectedVideo.moderationLogs.length > 0 && (
                <div className="border-t pt-3" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
                  <div className="text-white/30 text-xs mb-2">History</div>
                  {selectedVideo.moderationLogs.map((log) => (
                    <div key={log.id} className="text-xs text-white/50 mb-1">
                      <span className="font-medium" style={{
                        color: log.action === 'approve' ? '#10b981' : log.action === 'reject' ? '#ef4444' : '#f59e0b'
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
