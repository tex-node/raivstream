'use client';

/**
 * Track C - admin view of a single user.
 *
 * Reads only: profile, usage totals, their media and their ledger. Every source
 * comes from admin-gated procedures, so this page cannot leak a user's data to a
 * non-admin even if the route is guessed.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { MediaThumb } from '@/components/video/MediaThumb';
import { VideoLightbox } from '@/components/video/VideoLightbox';

type Tab = 'media' | 'ledger';

const ROLE_STYLES: Record<string, string> = {
  ADMIN: 'bg-[rgba(239,68,68,0.15)] text-[#f87171]',
  MODERATOR: 'bg-[rgba(245,158,11,0.15)] text-[#fbbf24]',
  CREATOR: 'bg-[rgba(16,185,129,0.15)] text-[#34d399]',
  VIEWER: 'bg-[rgba(148,163,184,0.15)] text-[#94a3b8]',
};

export default function AdminUserDetailPage() {
  const params = useParams<{ userId: string }>();
  const userId = params?.userId ?? '';
  const [tab, setTab] = useState<Tab>('media');

  const detail = trpc.admin.getUserDetail.useQuery({ userId }, { enabled: Boolean(userId) });

  if (detail.isLoading) return <main className="p-8 text-[var(--noc-t4)]">Loading user…</main>;

  if (detail.error || !detail.data) {
    return (
      <main className="p-8">
        <p className="text-sm text-[var(--noc-magenta)]">{detail.error?.message ?? 'User not found.'}</p>
        <Link href="/admin/users" className="mt-3 inline-block text-xs text-[var(--noc-t5)] underline">Back to users</Link>
      </main>
    );
  }

  const { user, usage } = detail.data;

  const cards = [
    { label: 'Current balance', value: usage.currentBalance.toLocaleString() },
    { label: 'Total spent', value: usage.creditsUsed.toLocaleString() },
    { label: 'Total added', value: usage.creditsBought.toLocaleString() },
    { label: 'Stories created', value: usage.storiesCreated.toLocaleString() },
    { label: 'Videos published', value: usage.videosPublished.toLocaleString() },
  ];

  return (
    <main className="p-6">
      <Link href="/admin/users" className="text-xs text-[var(--noc-t5)] underline">← All users</Link>

      <header className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-[var(--noc-t1)]">{user.username}</h1>
          <p className="mt-1 text-sm text-[var(--noc-t4)]">{user.email}</p>
          <div className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-wider text-[var(--noc-t5)]">
            <span className={`rounded-full px-2 py-0.5 font-bold ${ROLE_STYLES[user.role] ?? ''}`}>
              {String(user.role).toLowerCase()}
            </span>
            <span>Joined {new Date(user.createdAt).toLocaleDateString()}</span>
            <span>· {usage.mediaCount} media items</span>
          </div>
        </div>
        <a
          href={`/${user.username}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-[var(--noc-hairline)] px-3 py-1.5 text-xs font-bold text-[var(--noc-t3)]"
        >
          View public profile
        </a>
      </header>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] p-4">
            <p className="text-xl font-black text-[var(--noc-t1)]">{card.value}</p>
            <p className="mt-1 text-[10px] uppercase tracking-wider text-[var(--noc-t5)]">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex gap-2">
        {(['media', 'ledger'] as Tab[]).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`rounded-full px-4 py-1.5 text-xs font-bold capitalize ${
              tab === value
                ? 'bg-[rgba(217,70,168,0.2)] text-[var(--noc-t1)]'
                : 'bg-[var(--noc-card)] text-[var(--noc-t5)]'
            }`}
          >
            {value === 'media' ? 'Media library' : 'Ledger'}
          </button>
        ))}
      </div>

      {tab === 'media' ? <Media userId={userId} /> : <Ledger userId={userId} />}
    </main>
  );
}

function Media({ userId }: { userId: string }) {
  const [selected, setSelected] = useState<{ url: string; title: string } | null>(null);
  const [exportsOnly, setExportsOnly] = useState(false);
  // Infinite query keyed on the filter so switching pills resets the pages.
  const { data, isLoading, error, hasNextPage, isFetchingNextPage, fetchNextPage } =
    trpc.admin.getUserMedia.useInfiniteQuery(
      {
        userId,
        limit: 60,
        ...(exportsOnly ? { source: 'export' as const } : {}),
      },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      },
    );
  const items = data?.pages.flatMap((page) => page.items) ?? [];

  if (isLoading) return <p className="mt-6 text-sm text-[var(--noc-t4)]">Loading media…</p>;
  if (error) return <p className="mt-6 text-sm text-[var(--noc-magenta)]">{error.message}</p>;

  if (items.length === 0) {
    return (
      <div className="mt-6 rounded-2xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] px-6 py-12 text-center">
        <p className="text-sm font-semibold text-[var(--noc-t3)]">No media yet.</p>
      </div>
    );
  }

  return (
    <>
    <div className="mt-4 flex gap-2">
      {[{ label: 'All', value: false }, { label: 'Exports', value: true }].map((option) => (
        <button
          key={option.label}
          type="button"
          onClick={() => setExportsOnly(option.value)}
          className={`rounded-full px-3 py-1 text-[11px] font-bold ${
            exportsOnly === option.value
              ? 'bg-[rgba(217,70,168,0.2)] text-[var(--noc-t1)]'
              : 'bg-[var(--noc-card)] text-[var(--noc-t5)]'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>

    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((asset) => (
        <div
          key={`${asset.source}-${asset.id}`}
          onClick={() => {
            if (asset.type === "video") {
              setSelected({ url: asset.url, title: asset.title });
            }
          }}
          className={`overflow-hidden rounded-xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] ${asset.type === "video" ? "cursor-pointer" : ""}`}
        >
          <div className="relative aspect-square">
            {asset.type === 'audio' ? (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-900 to-zinc-800">
                <span className="text-2xl" aria-hidden="true">♪</span>
              </div>
            ) : (
              <MediaThumb
                alt={asset.type}
                thumbnailUrl={asset.thumbnailUrl ?? null}
                videoUrl={asset.type === 'video' ? asset.url : null}
              />
            )}
            {asset.type === 'video' && (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-[10px] text-white">▶</span>
              </span>
            )}
          </div>
          <div className="flex items-center justify-between px-2 py-1.5 text-[10px] text-[var(--noc-t5)]">
            <span className="truncate">
              {asset.source === "export" ? (
                <span className="rounded-full bg-[rgba(139,92,246,0.2)] px-1.5 py-0.5 font-bold text-[#a78bfa]">Final Export</span>
              ) : (
                <span className="uppercase tracking-wide text-[var(--noc-t4)]">{asset.source}</span>
              )}
            </span>
            <span>{new Date(asset.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
      ))}

      {hasNextPage && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => void fetchNextPage()}
            disabled={isFetchingNextPage}
            className="rounded-lg border border-[var(--noc-hairline)] px-5 py-2 text-xs font-bold text-[var(--noc-t3)] disabled:opacity-50"
          >
            {isFetchingNextPage ? 'Loading…' : `Load more (${items.length} shown)`}
          </button>
        </div>
      )}
    </div>

      <VideoLightbox
        isOpen={Boolean(selected)}
        onClose={() => setSelected(null)}
        videoUrl={selected?.url ?? null}
        title={selected?.title}
        downloadFileName={selected?.title}
      />
    </>
  );
}

function Ledger({ userId }: { userId: string }) {
  const { data, isLoading, error } = trpc.admin.getUserTransactions.useQuery({ userId, limit: 100 });
  const rows = data?.items ?? [];

  if (isLoading) return <p className="mt-6 text-sm text-[var(--noc-t4)]">Loading ledger…</p>;
  if (error) return <p className="mt-6 text-sm text-[var(--noc-magenta)]">{error.message}</p>;

  if (rows.length === 0) {
    return (
      <div className="mt-6 rounded-2xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] px-6 py-12 text-center">
        <p className="text-sm font-semibold text-[var(--noc-t3)]">No transactions.</p>
      </div>
    );
  }

  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--noc-hairline)]">
      <table className="w-full text-left text-sm">
        <thead className="bg-[var(--noc-card)] text-[10px] uppercase tracking-wider text-[var(--noc-t5)]">
          <tr>
            <th className="px-3 py-3">Date</th>
            <th className="px-3 py-3">Type</th>
            <th className="px-3 py-3">Amount</th>
            <th className="px-3 py-3">Feature</th>
            <th className="px-3 py-3">Balance after</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-[var(--noc-hairline)]">
              <td className="px-3 py-2.5 text-xs text-[var(--noc-t4)]">{new Date(row.createdAt).toLocaleString()}</td>
              <td className="px-3 py-2.5 text-xs text-[var(--noc-t3)]">{String(row.type).toLowerCase()}</td>
              <td className={`px-3 py-2.5 text-xs font-bold ${row.amount < 0 ? 'text-[var(--noc-magenta)]' : 'text-[#34d399]'}`}>
                {row.amount > 0 ? '+' : ''}{row.amount.toLocaleString()}
              </td>
              <td className="px-3 py-2.5 font-mono text-[10px] text-[var(--noc-t5)]">{row.featureKey ?? '—'}</td>
              <td className="px-3 py-2.5 text-xs text-[var(--noc-t4)]">{row.balanceAfter?.toLocaleString() ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
