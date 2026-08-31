'use client';

import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { Navbar } from '@/components/layout/Navbar';

function timeAgo(date: Date | string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60)   return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(date).toLocaleDateString();
}

type NotifItem = {
  id: string;
  type: 'FOLLOW' | 'LIKE';
  read: boolean;
  createdAt: Date | string;
  sender: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
  video: { id: string; title: string; thumbnailUrl: string } | null;
};

function NotificationRow({ notif, onRead }: { notif: NotifItem; onRead: (id: string) => void }) {
  const href = notif.type === 'LIKE' && notif.video ? `/v/${notif.video.id}` : `/${notif.sender.username}`;

  return (
    <Link
      href={href}
      onClick={() => { if (!notif.read) onRead(notif.id); }}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors hover:bg-white/5 ${
        notif.read ? 'opacity-60' : ''
      }`}
    >
      {/* Unread dot */}
      <div className="w-2 flex-shrink-0 flex justify-center">
        {!notif.read && <div className="w-2 h-2 rounded-full bg-[#d946a8]" />}
      </div>

      {/* Sender avatar */}
      <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-[#d946a8] flex items-center justify-center">
        {notif.sender.avatarUrl ? (
          <img src={notif.sender.avatarUrl} alt={notif.sender.displayName} className="w-full h-full object-cover" />
        ) : (
          <span className="text-white font-bold text-sm">{notif.sender.displayName[0]}</span>
        )}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white leading-snug">
          <span className="font-semibold">@{notif.sender.username}</span>
          {notif.type === 'FOLLOW' ? ' started following you' : ` liked your video`}
          {notif.type === 'LIKE' && notif.video && (
            <span className="text-white/50"> "{notif.video.title}"</span>
          )}
        </p>
        <p className="text-xs text-white/40 mt-0.5">{timeAgo(notif.createdAt)}</p>
      </div>

      {/* Video thumbnail for LIKE */}
      {notif.type === 'LIKE' && notif.video && (
        <div className="w-10 h-14 rounded-lg overflow-hidden flex-shrink-0 bg-[var(--noc-page)]">
          <img src={notif.video.thumbnailUrl} alt="" className="w-full h-full object-cover" />
        </div>
      )}

      {/* Icon badge */}
      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
        notif.type === 'LIKE' ? 'bg-[#d946a8]/20' : 'bg-[#b25ad9]/20'
      }`}>
        {notif.type === 'LIKE' ? (
          <svg className="w-3.5 h-3.5 text-[#f0a3d4]" fill="currentColor" viewBox="0 0 24 24">
            <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5 text-[var(--noc-lavender-tint)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        )}
      </div>
    </Link>
  );
}

export default function NotificationsPage() {
  const utils = trpc.useUtils();

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    trpc.notification.list.useInfiniteQuery(
      { limit: 20 },
      { getNextPageParam: (last) => last.nextCursor }
    );

  const markRead = trpc.notification.markRead.useMutation({
    onSuccess: () => utils.notification.unreadCount.invalidate(),
  });

  const markAllRead = trpc.notification.markAllRead.useMutation({
    onSuccess: () => {
      utils.notification.list.invalidate();
      utils.notification.unreadCount.invalidate();
    },
  });

  const notifications = data?.pages.flatMap((p) => p.notifications) ?? [];
  const hasUnread = notifications.some((n) => !n.read);

  return (
    <div className="min-h-screen text-white" style={{ background: 'var(--noc-page)' }}>
      <Navbar />
      <div className="max-w-lg lg:max-w-xl mx-auto pt-20 px-4 pb-16">

        {/* Header */}
        <div className="flex items-center justify-between py-6">
          <h1 className="text-xl font-bold">Notifications</h1>
          {hasUnread && (
            <button
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              className="text-xs text-[var(--noc-lavender-tint)] hover:text-[var(--noc-purple)] transition-colors"
            >
              Mark all read
            </button>
          )}
        </div>

        {isLoading && (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          </div>
        )}

        {!isLoading && notifications.length === 0 && (
          <div className="flex flex-col items-center py-20 gap-3">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
              <svg className="w-8 h-8 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <p className="text-white/40 text-sm">No notifications yet</p>
          </div>
        )}

        <div className="space-y-0.5">
          {notifications.map((notif) => (
            <NotificationRow
              key={notif.id}
              notif={notif as NotifItem}
              onRead={(id) => markRead.mutate({ id })}
            />
          ))}
        </div>

        {hasNextPage && (
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="w-full mt-6 py-3 rounded-xl border border-white/10 hover:border-white/20 text-sm text-white/40 transition-colors"
          >
            {isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>
    </div>
  );
}
