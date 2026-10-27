'use client';

/**
 * D-004 Phase 1 - admin view of a single organization.
 *
 * Renders the SAME `OrgDashboardView` as `/org/[slug]` (adminMode adds the
 * Members tab) so the two surfaces cannot drift.
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { OrgDashboardView } from '@/components/org/OrgDashboardView';

export default function AdminOrganizationDetailPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = params?.orgId ?? '';
  const { data, isLoading, error } = trpc.admin.getOrganization.useQuery({ orgId }, { enabled: Boolean(orgId) });

  if (isLoading) return <main className="p-8 text-[var(--noc-t4)]">Loading organization…</main>;

  if (error || !data) {
    return (
      <main className="p-8">
        <p className="text-sm text-[var(--noc-magenta)]">{error?.message ?? 'Organization not found.'}</p>
        <Link href="/admin/organizations" className="mt-3 inline-block text-xs text-[var(--noc-t5)] underline">
          Back to organizations
        </Link>
      </main>
    );
  }

  return (
    <main className="p-6">
      <Link href="/admin/organizations" className="text-xs text-[var(--noc-t5)] underline">
        ← All organizations
      </Link>
      <div className="mt-3">
        <OrgDashboardView
          orgId={data.org.id}
          name={data.org.name}
          type={data.org.type}
          adminMode
        />
      </div>
    </main>
  );
}
