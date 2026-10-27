'use client';

/**
 * D-004 Phase 1 - organization dashboard (view-only).
 *
 * Bootstraps from the URL slug via `organization.resolveSlug`, so a non-member
 * sees the same 403 the API would give - the page never renders a roster for an
 * org the caller cannot access.
 *
 * Shows BOTH published videos and completed exports: production had 4 published
 * R16 videos versus 35 READY exports, so a published-only view would be empty.
 */

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { Navbar } from '@/components/layout/Navbar';
import { MediaThumb } from '@/components/video/MediaThumb';

type Tab = 'overview' | 'students' | 'videos';
type ModerationFilter = 'all' | 'APPROVED' | 'PENDING' | 'REJECTED';

const STATUS_STYLES: Record<string, string> = {
  APPROVED: 'bg-[rgba(16,185,129,0.15)] text-[#34d399]',
  PENDING: 'bg-[rgba(245,158,11,0.15)] text-[#fbbf24]',
  REJECTED: 'bg-[rgba(239,68,68,0.15)] text-[#f87171]',
  FLAGGED: 'bg-[rgba(239,68,68,0.15)] text-[#f87171]',
};

export default function OrgDashboardPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? '';
  const [tab, setTab] = useState<Tab>('overview');
  const [moderation, setModeration] = useState<ModerationFilter>('all');

  const resolved = trpc.organization.resolveSlug.useQuery({ slug }, { enabled: Boolean(slug) });

  if (resolved.isLoading) {
    return <main className="p-8 text-[var(--noc-t4)]">Loading organization…</main>;
  }

  if (resolved.error || !resolved.data) {
    return (
      <main className="p-8">
        <h1 className="text-xl font-black text-[var(--noc-t1)]">Organization unavailable</h1>
        <p className="mt-2 text-sm text-[var(--noc-t4)]">
          This organization does not exist, or you are not a member of it.
        </p>
      </main>
    );
  }

  const { orgId, name, type, role } = resolved.data;

  return (
    <div className="min-h-screen bg-[var(--noc-page)]">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-[var(--noc-t1)]">{name}</h1>
            <p className="mt-1 text-xs uppercase tracking-wider text-[var(--noc-t5)]">
              {type} · your role: {role}
            </p>
          </div>
          <div className="flex gap-2">
            {(['overview', 'students', 'videos'] as Tab[]).map((value) => (
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
                {value}
              </button>
            ))}
          </div>
        </header>

        {tab === 'overview' && <Overview orgId={orgId} />}
        {tab === 'students' && <Students orgId={orgId} />}
        {tab === 'videos' && (
          <Videos orgId={orgId} moderation={moderation} onModerationChange={setModeration} />
        )}
      </main>
    </div>
  );
}

function Overview({ orgId }: { orgId: string }) {
  const { data, isLoading, error } = trpc.organization.getDashboard.useQuery({ orgId });

  if (isLoading) return <p className="mt-8 text-sm text-[var(--noc-t4)]">Loading…</p>;
  if (error) return <p className="mt-8 text-sm text-[var(--noc-magenta)]">{error.message}</p>;
  if (!data) return null;

  const cards = [
    { label: 'Students', value: data.stats.studentCount },
    { label: 'Published', value: data.stats.publishedCount },
    { label: 'Completed exports', value: data.stats.exportCount },
    { label: 'Approved', value: data.stats.approvedCount },
    { label: 'Pending review', value: data.stats.pendingCount },
  ];

  return (
    <>
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] p-4">
            <p className="text-2xl font-black text-[var(--noc-t1)]">{card.value}</p>
            <p className="mt-1 text-[10px] uppercase tracking-wider text-[var(--noc-t5)]">{card.label}</p>
          </div>
        ))}
      </div>

      <h2 className="mt-8 text-sm font-bold uppercase tracking-wider text-[var(--noc-t4)]">Recent activity</h2>
      {data.recentActivity.length === 0 ? (
        <p className="mt-3 text-xs text-[var(--noc-t5)]">No student work yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-[var(--noc-hairline)] rounded-xl border border-[var(--noc-hairline)]">
          {data.recentActivity.map((item) => (
            <li key={`${item.source}-${item.id}`} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="truncate text-sm text-[var(--noc-t2)]">{item.title}</span>
              <span className="shrink-0 text-xs text-[var(--noc-t5)]">
                {item.creatorUsername} · {item.source === 'published' ? 'Published' : 'Export'} ·{' '}
                {new Date(item.createdAt).toLocaleDateString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Students({ orgId }: { orgId: string }) {
  const { data, isLoading, error } = trpc.organization.listStudents.useQuery({ orgId, limit: 100 });

  if (isLoading) return <p className="mt-8 text-sm text-[var(--noc-t4)]">Loading…</p>;
  if (error) return <p className="mt-8 text-sm text-[var(--noc-magenta)]">{error.message}</p>;

  if (!data || data.items.length === 0) {
    return (
      <div className="mt-8 rounded-2xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] px-6 py-12 text-center">
        <p className="text-sm font-semibold text-[var(--noc-t3)]">No students yet.</p>
        <p className="mt-1 text-xs text-[var(--noc-t5)]">
          Ask a Raivstream admin to add members to this organization.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 overflow-x-auto rounded-xl border border-[var(--noc-hairline)]">
      <table className="w-full text-left text-sm">
        <thead className="bg-[var(--noc-card)] text-[10px] uppercase tracking-wider text-[var(--noc-t5)]">
          <tr>
            <th className="px-4 py-3">Student</th>
            <th className="px-4 py-3">Email</th>
            <th className="px-4 py-3">Joined</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((student) => (
            <tr key={student.userId} className="border-t border-[var(--noc-hairline)]">
              <td className="px-4 py-3 text-[var(--noc-t1)]">{student.username}</td>
              <td className="px-4 py-3 text-[var(--noc-t4)]">{student.email}</td>
              <td className="px-4 py-3 text-[var(--noc-t4)]">
                {new Date(student.joinedAt).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Videos({
  orgId,
  moderation,
  onModerationChange,
}: {
  orgId: string;
  moderation: ModerationFilter;
  onModerationChange: (value: ModerationFilter) => void;
}) {
  const { data, isLoading, error } = trpc.organization.listVideos.useQuery({
    orgId,
    limit: 60,
    ...(moderation === 'all' ? {} : { moderationStatus: moderation }),
  });

  const items = data?.items ?? [];

  return (
    <>
      <div className="mt-5 flex flex-wrap gap-2">
        {(['all', 'APPROVED', 'PENDING', 'REJECTED'] as ModerationFilter[]).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onModerationChange(value)}
            className={`rounded-full px-3 py-1 text-[11px] font-bold capitalize ${
              moderation === value
                ? 'bg-[rgba(217,70,168,0.2)] text-[var(--noc-t1)]'
                : 'bg-[var(--noc-card)] text-[var(--noc-t5)]'
            }`}
          >
            {value.toLowerCase()}
          </button>
        ))}
      </div>

      {isLoading && <p className="mt-6 text-sm text-[var(--noc-t4)]">Loading…</p>}
      {error && <p className="mt-6 text-sm text-[var(--noc-magenta)]">{error.message}</p>}

      {!isLoading && !error && items.length === 0 && (
        <div className="mt-8 rounded-2xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] px-6 py-12 text-center">
          <p className="text-sm font-semibold text-[var(--noc-t3)]">No videos yet.</p>
          <p className="mt-1 text-xs text-[var(--noc-t5)]">
            Student work appears here as soon as scenes are animated or a story is exported.
          </p>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => (
          <div key={`${item.source}-${item.id}`} className="overflow-hidden rounded-xl border border-[var(--noc-hairline)] bg-[var(--noc-card)]">
            <div className="relative aspect-square">
              <MediaThumb alt={item.title} thumbnailUrl={item.thumbnailUrl} videoUrl={item.videoUrl} />
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-xs text-white">▶</span>
              </span>
            </div>
            <div className="px-2.5 py-2">
              <p className="truncate text-xs font-bold text-[var(--noc-t2)]">{item.title}</p>
              <div className="mt-1 flex items-center justify-between text-[10px] text-[var(--noc-t5)]">
                <span className="truncate">{item.creatorUsername}</span>
                {item.source === 'published' && item.status ? (
                  <span className={`rounded-full px-1.5 py-0.5 font-bold ${STATUS_STYLES[item.status] ?? ''}`}>
                    {item.status.toLowerCase()}
                  </span>
                ) : (
                  <span className="text-[var(--noc-t6)]">export</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
