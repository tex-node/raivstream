'use client';

/**
 * D-004 Phase 1 - shared organization dashboard.
 *
 * `/org/[slug]` and `/admin/organizations/[orgId]` render THIS component so the
 * two views cannot drift. The only difference is `adminMode`, which reveals the
 * Members tab and the member-management actions.
 */

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { MediaThumb } from '@/components/video/MediaThumb';

type Tab = 'overview' | 'students' | 'videos' | 'members';
type ModerationFilter = 'all' | 'APPROVED' | 'PENDING' | 'REJECTED';
type OrgRole = 'ORG_ADMIN' | 'ORG_MODERATOR' | 'STUDENT';

const STATUS_STYLES: Record<string, string> = {
  APPROVED: 'bg-[rgba(16,185,129,0.15)] text-[#34d399]',
  PENDING: 'bg-[rgba(245,158,11,0.15)] text-[#fbbf24]',
  REJECTED: 'bg-[rgba(239,68,68,0.15)] text-[#f87171]',
  FLAGGED: 'bg-[rgba(239,68,68,0.15)] text-[#f87171]',
};

export interface OrgDashboardViewProps {
  orgId: string;
  name: string;
  type: string;
  role?: string;
  adminMode?: boolean;
}

export function OrgDashboardView({ orgId, name, type, role, adminMode = false }: OrgDashboardViewProps) {
  // Members is org-admin (or Raivstream admin) only: an ORG_MODERATOR is view-only.
  const canManageMembers = adminMode || role === 'ORG_ADMIN';
  const [tab, setTab] = useState<Tab>('overview');
  const [moderation, setModeration] = useState<ModerationFilter>('all');

  const tabs: Tab[] = canManageMembers
    ? ['overview', 'students', 'videos', 'members']
    : ['overview', 'students', 'videos'];

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-[var(--noc-t1)]">{name}</h1>
          <p className="mt-1 text-xs uppercase tracking-wider text-[var(--noc-t5)]">
            {type}
            {role ? ` · your role: ${role}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {tabs.map((value) => (
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
      {tab === 'members' && canManageMembers && <Members orgId={orgId} mode={adminMode ? 'admin' : 'org'} />}
    </>
  );
}

function Overview({ orgId }: { orgId: string }) {
  const { data, isLoading, error } = trpc.organization.getDashboard.useQuery({ orgId });

  if (isLoading) return <p className="mt-8 text-sm text-[var(--noc-t4)]">Loading…</p>;
  if (error) return <p className="mt-8 text-sm text-[var(--noc-magenta)]">{error.message}</p>;
  if (!data) return null;

  const cards = [
    { label: 'Members', value: data.stats.memberCount },
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
            <th className="px-4 py-3">Member</th>
            <th className="px-4 py-3">Email</th>
            <th className="px-4 py-3">Role</th>
            <th className="px-4 py-3">Joined</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((student) => (
            <tr key={student.userId} className="border-t border-[var(--noc-hairline)]">
              <td className="px-4 py-3 text-[var(--noc-t1)]">{student.username}</td>
              <td className="px-4 py-3 text-[var(--noc-t4)]">{student.email}</td>
              <td className="px-4 py-3 text-[var(--noc-t4)]">{(student as { role?: string }).role?.toLowerCase() ?? 'student'}</td>
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

const ROLE_LABELS: Record<OrgRole, string> = {
  ORG_ADMIN: 'Org admin',
  ORG_MODERATOR: 'Org moderator',
  STUDENT: 'Student',
};

/**
 * Member management, shared by both surfaces.
 *
 * `mode` selects the API, not just the label: a Raivstream admin acts cross-org
 * (`admin.*`), an org admin acts on their own org (`org.*`, which enforces
 * ORG_ADMIN server-side). The roster query differs for the same reason - an
 * admin is usually not a member of the org they are inspecting.
 */
function Members({ orgId, mode }: { orgId: string; mode: 'admin' | 'org' }) {
  const utils = trpc.useUtils();
  const isAdminMode = mode === 'admin';

  const adminData = trpc.admin.getOrganization.useQuery({ orgId }, { enabled: isAdminMode });
  const orgRoster = trpc.organization.listStudents.useQuery({ orgId, limit: 100 }, { enabled: !isAdminMode });

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrgRole>('STUDENT');
  const [formError, setFormError] = useState<string | null>(null);

  const refresh = async () => {
    if (isAdminMode) {
      await utils.admin.getOrganization.invalidate({ orgId });
      return;
    }
    await utils.organization.listStudents.invalidate({ orgId, limit: 100 });
    await utils.organization.getDashboard.invalidate({ orgId });
  };

  const adminAdd = trpc.admin.addOrgMember.useMutation({
    onSuccess: async () => { setEmail(''); setFormError(null); await refresh(); },
    onError: (err) => setFormError(err.message),
  });
  const orgAdd = trpc.organization.addMember.useMutation({
    onSuccess: async () => { setEmail(''); setFormError(null); await refresh(); },
    onError: (err) => setFormError(err.message),
  });
  const adminRemove = trpc.admin.removeOrgMember.useMutation({ onSuccess: refresh });
  const orgRemove = trpc.organization.removeMember.useMutation({
    onSuccess: refresh,
    onError: (err) => setFormError(err.message),
  });

  const isLoading = isAdminMode ? adminData.isLoading : orgRoster.isLoading;
  const error = isAdminMode ? adminData.error : orgRoster.error;

  const members = isAdminMode
    ? (adminData.data?.members ?? []).map((m) => ({
        id: m.id,
        userId: m.user.id,
        username: m.user.username,
        email: m.user.email,
        role: m.role as OrgRole,
        status: String(m.status),
        createdAt: m.createdAt,
      }))
    : (orgRoster.data?.items ?? []).map((m) => ({
        id: m.userId,
        userId: m.userId,
        username: m.username,
        email: m.email,
        role: ((m as { role?: string }).role ?? 'STUDENT') as OrgRole,
        status: 'ACTIVE',
        createdAt: m.joinedAt,
      }));

  const submitting = adminAdd.isPending || orgAdd.isPending;

  if (isLoading) return <p className="mt-8 text-sm text-[var(--noc-t4)]">Loading members…</p>;
  if (error) return <p className="mt-8 text-sm text-[var(--noc-magenta)]">{error.message}</p>;

  return (
    <>
      <div className="mt-6 rounded-xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--noc-t4)]">Add member</p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-[220px] flex-1">
            <label className="mb-1 block text-[10px] uppercase tracking-wider text-[var(--noc-t5)]">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="student@school.example"
              className="w-full rounded-lg border border-[var(--noc-hairline)] bg-[var(--noc-page)] px-3 py-2 text-sm text-[var(--noc-t1)] outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wider text-[var(--noc-t5)]">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as OrgRole)}
              className="rounded-lg border border-[var(--noc-hairline)] bg-[var(--noc-page)] px-3 py-2 text-sm text-[var(--noc-t1)]"
            >
              {(Object.keys(ROLE_LABELS) as OrgRole[]).map((value) => (
                <option key={value} value={value}>{ROLE_LABELS[value]}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            disabled={!email.trim() || submitting}
            onClick={() => {
              const payload = { orgId, email: email.trim(), role };
              if (isAdminMode) adminAdd.mutate(payload);
              else orgAdd.mutate(payload);
            }}
            className="rounded-lg bg-[rgba(217,70,168,0.9)] px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            {submitting ? 'Adding…' : 'Add member'}
          </button>
        </div>
        {formError && <p className="mt-2 text-xs font-semibold text-[var(--noc-magenta)]">{formError}</p>}
        <p className="mt-2 text-[10px] text-[var(--noc-t6)]">
          The account must already exist - an unknown email returns “No account with that email”.
        </p>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--noc-hairline)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--noc-card)] text-[10px] uppercase tracking-wider text-[var(--noc-t5)]">
            <tr>
              <th className="px-4 py-3">Member</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id} className="border-t border-[var(--noc-hairline)]">
                <td className="px-4 py-3">
                  <span className="block text-[var(--noc-t1)]">{member.username}</span>
                  <span className="block text-xs text-[var(--noc-t5)]">{member.email}</span>
                </td>
                <td className="px-4 py-3 text-[var(--noc-t4)]">{ROLE_LABELS[member.role] ?? member.role}</td>
                <td className="px-4 py-3 text-[var(--noc-t4)]">{member.status.toLowerCase()}</td>
                <td className="px-4 py-3 text-[var(--noc-t4)]">{new Date(member.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right">
                  {member.status === 'ACTIVE' && (
                    <button
                      type="button"
                      onClick={() => (isAdminMode
                        ? adminRemove.mutate({ orgId, userId: member.userId })
                        : orgRemove.mutate({ orgId, userId: member.userId }))}
                      className="text-xs font-bold text-[var(--noc-magenta)]"
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}