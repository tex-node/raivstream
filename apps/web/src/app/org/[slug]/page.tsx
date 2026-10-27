'use client';

/**
 * D-004 Phase 1 - organization dashboard for members.
 *
 * Bootstraps from the URL slug via `organization.resolveSlug`, which returns the
 * same 403 for "no such org" as for "not a member" - the page never reveals
 * whether a slug exists to someone outside it.
 *
 * The body is `OrgDashboardView`, shared with `/admin/organizations/[orgId]` so
 * the two surfaces cannot drift.
 */

import { useParams } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { Navbar } from '@/components/layout/Navbar';
import { OrgDashboardView } from '@/components/org/OrgDashboardView';

export default function OrgDashboardPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? '';
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

  const { orgId, name, type, role, inviteCode } = resolved.data;

  return (
    <div className="min-h-screen bg-[var(--noc-page)]">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <OrgDashboardView orgId={orgId} name={name} type={type} role={role} inviteCode={inviteCode} />
      </main>
    </div>
  );
}