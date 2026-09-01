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
  const [page,         setPage]         = useState(1);
  const [activeVideo,  setActiveVideo]  = useState<string | null>(null);
  const [reason,       setReason]       = useState('');
  const [isKidsSafe,   setIsKidsSafe]   = useState(false);
  const [contentRating, setContentRating] = useState<ContentRating>('PG');

  const { data: stats } = trpc.admin.getModerationStats.useQuery(undefined, { refetchInterval: 30_000 });
  const { data, refetch, isLoading } = trpc.admin.moderationQueue.useQuery({ status: activeStatus, page, pageSize: 12 });

  const moderate = trpc.admin.moderateVideo.useMutation({
    onSuccess: () => { setActiveVideo(null); setReason(''); refetch(); },
  });

  const handleTabChange = (status: ModerationStatus) => {
    setActiveStatus(status);
    setPage(1);
    setActiveVideo(null);
  };

  const handleAction = (videoId: string, action: 'approve' | 'reject' | 'flag') => {
    moderate.mutate({ videoId, action, reason: reason.trim() || undefined, isKidsSafe, contentRating });
  };

  const selectedVideo = data?.videos.find((v) => v.id === activeVideo);

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[var(--noc-t1)]">Content Moderation</h1>
        <p className="mt-0.5 text-sm text-[var(--noc-t4)]">Review and approve videos before they appear in feeds</p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: 'Pending',  value: stats.pending,  color: '#f59e0b' },
            { label: 'Flagged',  value: stats.flagged,  color: '#ef4444' },
            { label: 'Approved', value: stats.approved, color: '#10b981' },
            { label: 'Rejected', value: stats.rejected, color: '#6b7280' },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] p-4">
              <div className="text-2xl font-bold" style={{ color }}>{value}</div>
              <div className="mt-0.5 text-xs text-[var(--noc-t4)]">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="mb-5 flex gap-1 rounded-xl bg-white/[0.04] p-1">
        {STATUS_TABS.map(({ value, label, color }) => (
          <button
            key={value}
            onClick={() => handleTabChange(value)}
            className="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60"
            style={{
              background: activeStatus === value ? 'rgba(255,255,255,0.08)' : 'transparent',
              color:       activeStatus === value ? color : 'var(--noc-t4)',
            }}
          >
            {label}
            {value === 'PENDING' && stats?.pending ? (
              <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-xs font-bold" style={{ background: `${color}25`, color }}>
                {stats.pending}
              </span>
            ) : value === 'FLAGGED' && stats?.flagged ? (
              <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-xs font-bold" style={{ background: `${color}25`, color }}>
                {stats.flagged}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Main content — grid + detail panel */}
      <div className="flex gap-4">
        {/* Video grid */}
        <div className={`min-w-0 flex-1 ${activeVideo ? 'hidden md:block' : ''}`}>
          {isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--noc-blue)]/30 border-t-[var(--noc-blue)]" />
            </div>
          ) : !data?.videos.length ? (
            <div className="flex h-48 flex-col items-center justify-center text-center">
              <div className="mb-3 text-4xl">✅</div>
              <div className="text-sm text-[var(--noc-t4)]">No {activeStatus.toLowerCase()} videos</div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {data.videos.map((video) => {
                  const mediaUrl = video.mp4Url ?? '';
                  const isImg    = isImageUrl(mediaUrl);
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
                      className="relative overflow-hidden rounded-xl border-2 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60"
                      style={{
                        borderColor: isActive ? 'var(--noc-blue)' : 'transparent',
                        background:  'rgba(233,233,237,0.04)',
                        aspectRatio: '9/16',
                      }}
                    >
                      {isImg ? (
                        <img src={mediaUrl} alt={video.title} className="absolute inset-0 h-full w-full object-cover" />
                      ) : video.thumbnailUrl ? (
                        <img src={video.thumbnailUrl} alt={video.title} className="absolute inset-0 h-full w-full object-cover" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center bg-[#0d1420]">
                          <svg className="h-8 w-8 text-[var(--noc-t5)]" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      )}

                      <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 50%)' }} />

                      <div className="absolute bottom-0 left-0 right-0 p-2">
                        <div className="truncate text-xs font-medium text-white">{video.title}</div>
                        <div className="truncate text-xs text-white/50">@{video.creator.username}</div>
                      </div>

                      <div className="absolute right-2 top-2">
                        {video.moderationStatus === 'PENDING' && (
                          <span className="rounded px-1.5 py-0.5 text-xs font-bold" style={{ background: '#f59e0b25', color: '#f59e0b' }}>PENDING</span>
                        )}
                        {video.moderationStatus === 'FLAGGED' && (
                          <span className="rounded px-1.5 py-0.5 text-xs font-bold" style={{ background: '#ef444425', color: '#ef4444' }}>FLAGGED</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {data.totalPages > 1 && (
                <div className="mt-5 flex items-center justify-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="rounded-lg bg-white/[0.06] px-3 py-1.5 text-sm text-[var(--noc-t3)] transition-colors hover:text-[var(--noc-t1)] disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60"
                  >
                    ← Prev
                  </button>
                  <span className="text-sm text-[var(--noc-t4)]">{page} / {data.totalPages}</span>
                  <button
                    onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                    disabled={page === data.totalPages}
                    className="rounded-lg bg-white/[0.06] px-3 py-1.5 text-sm text-[var(--noc-t3)] transition-colors hover:text-[var(--noc-t1)] disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60"
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
          <div className="flex w-full flex-shrink-0 flex-col gap-4 rounded-2xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] p-4 md:w-80">
            {/* Close on mobile */}
            <div className="flex items-center justify-between md:hidden">
              <span className="text-sm font-semibold text-[var(--noc-t1)]">Review</span>
              <button
                onClick={() => setActiveVideo(null)}
                className="text-[var(--noc-t4)] hover:text-[var(--noc-t1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Preview */}
            <div className="overflow-hidden rounded-xl bg-[#0d1420]" style={{ aspectRatio: '9/16' }}>
              {(() => {
                const url = selectedVideo.mp4Url ?? '';
                if (isImageUrl(url)) return <img src={url} alt={selectedVideo.title} className="h-full w-full object-cover" />;
                if (url) return <video src={url} controls muted className="h-full w-full object-cover" />;
                if (selectedVideo.thumbnailUrl) return <img src={selectedVideo.thumbnailUrl} alt={selectedVideo.title} className="h-full w-full object-cover" />;
                return <div className="flex h-full items-center justify-center text-sm text-[var(--noc-t5)]">No preview</div>;
              })()}
            </div>

            {/* Info */}
            <div>
              <h3 className="text-sm font-semibold leading-tight text-[var(--noc-t1)]">{selectedVideo.title}</h3>
              {selectedVideo.description && (
                <p className="mt-1 line-clamp-3 text-xs text-[var(--noc-t4)]">{selectedVideo.description}</p>
              )}
              <div className="mt-2 flex items-center gap-2">
                {selectedVideo.creator.avatarUrl ? (
                  <img src={selectedVideo.creator.avatarUrl} alt="" className="h-5 w-5 rounded-full object-cover" />
                ) : (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: 'var(--noc-gradient)' }}>
                    {selectedVideo.creator.displayName[0]}
                  </div>
                )}
                <span className="text-xs text-[var(--noc-t3)]">@{selectedVideo.creator.username}</span>
              </div>
              {selectedVideo.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {selectedVideo.tags.slice(0, 5).map((tag) => (
                    <span key={tag} className="rounded px-1.5 py-0.5 text-xs" style={{ background: 'rgba(178,90,217,0.1)', color: 'var(--noc-purple)' }}>
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="flex flex-col gap-3">
              <div>
                <label className="mb-1.5 block text-xs text-[var(--noc-t4)]">Content Rating</label>
                <div className="flex gap-1.5">
                  {(['G', 'PG', 'PG-13', 'R'] as ContentRating[]).map((r) => (
                    <button
                      key={r}
                      onClick={() => setContentRating(r)}
                      className="flex-1 rounded-lg py-1 text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60"
                      style={{
                        background: contentRating === r ? 'rgba(178,90,217,0.2)' : 'rgba(255,255,255,0.05)',
                        color:       contentRating === r ? 'var(--noc-purple)' : 'var(--noc-t4)',
                        border:      `1px solid ${contentRating === r ? 'rgba(178,90,217,0.4)' : 'transparent'}`,
                      }}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={isKidsSafe}
                  onChange={(e) => setIsKidsSafe(e.target.checked)}
                  className="h-4 w-4 accent-[var(--noc-blue)]"
                />
                <span className="text-sm text-[var(--noc-t2)]">Safe for R16 (kids feed)</span>
              </label>

              <div>
                <label className="mb-1.5 block text-xs text-[var(--noc-t4)]">Reason (optional for approve)</label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  placeholder="Add a note…"
                  className="w-full resize-none rounded-lg border border-[var(--noc-hairline)] bg-white/[0.06] px-3 py-2 text-sm text-[var(--noc-t1)] placeholder:text-[var(--noc-t5)] outline-none focus:border-[var(--noc-blue)]"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleAction(activeVideo, 'reject')}
                  disabled={moderate.isPending}
                  className="flex-1 rounded-xl border border-red-500/30 bg-red-500/15 py-2 text-sm font-semibold text-red-400 transition-all disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
                >
                  Reject
                </button>
                <button
                  onClick={() => handleAction(activeVideo, 'flag')}
                  disabled={moderate.isPending}
                  className="flex-1 rounded-xl border border-amber-500/30 bg-amber-500/15 py-2 text-sm font-semibold text-amber-400 transition-all disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40"
                >
                  Flag
                </button>
                <button
                  onClick={() => handleAction(activeVideo, 'approve')}
                  disabled={moderate.isPending}
                  className="flex-1 rounded-xl border border-emerald-500/30 bg-emerald-500/15 py-2 text-sm font-semibold text-emerald-400 transition-all disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
                >
                  {moderate.isPending ? '…' : 'Approve'}
                </button>
              </div>

              {selectedVideo.moderationLogs.length > 0 && (
                <div className="border-t border-[var(--noc-hairline)] pt-3">
                  <div className="mb-2 text-xs text-[var(--noc-t5)]">History</div>
                  {selectedVideo.moderationLogs.map((log) => (
                    <div key={log.id} className="mb-1 text-xs text-[var(--noc-t4)]">
                      <span className="font-medium" style={{
                        color: log.action === 'approve' ? '#10b981' : log.action === 'reject' ? '#ef4444' : '#f59e0b'
                      }}>
                        {log.action}
                      </span>
                      {log.reason && <span className="ml-1">— {log.reason}</span>}
                      <span className="ml-1 text-[var(--noc-t5)]">{new Date(log.createdAt).toLocaleDateString()}</span>
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
