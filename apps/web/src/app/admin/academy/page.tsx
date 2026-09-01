'use client';

import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { AdminSpinner, AdminError, AdminStatCard } from '../AdminShell';

export default function AdminAcademyPage() {
  const { data, isLoading, error } = trpc.academy.adminOverview.useQuery();

  if (isLoading) return <div className="p-8"><AdminSpinner /></div>;
  if (error) return <div className="p-8"><AdminError message={error.message} /></div>;
  if (!data) return null;

  return (
    <div className="space-y-8 p-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--noc-t1)]">Academy Diagnostics</h1>
        <p className="mt-1 text-sm text-[var(--noc-t4)]">Platform-level inspection for courses, classes, enrollments, and submissions.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <AdminStatCard label="Courses"             value={data.courses} />
        <AdminStatCard label="Classes"             value={data.classes} />
        <AdminStatCard label="Active Memberships"  value={data.memberships} />
        <AdminStatCard label="Submissions"         value={data.submissions} />
        <AdminStatCard label="Awaiting Review"     value={data.awaitingReview} />
      </div>

      <section className="overflow-hidden rounded-2xl border border-[var(--noc-hairline)]">
        <div className="border-b border-[var(--noc-hairline)] px-5 py-4">
          <h2 className="font-bold text-[var(--noc-t1)]">Recent Classes</h2>
        </div>
        <div className="divide-y divide-[var(--noc-hairline)]">
          {data.recentClasses.map((klass: any) => (
            <Link
              key={klass.id}
              href={`/academy/classes/${klass.id}`}
              className="grid gap-2 px-5 py-4 text-sm hover:bg-white/[0.04] md:grid-cols-[1fr_1fr_1fr_auto]"
            >
              <span className="font-semibold text-[var(--noc-t1)]">{klass.title}</span>
              <span className="text-[var(--noc-t4)]">{klass.course.title}</span>
              <span className="text-[var(--noc-t4)]">@{klass.instructor.username}</span>
              <span className="text-[var(--noc-t5)]">{klass._count.memberships} members · {klass._count.assignments} assignments</span>
            </Link>
          ))}
          {data.recentClasses.length === 0 && (
            <div className="px-5 py-8 text-center text-[var(--noc-t5)]">No Academy classes yet.</div>
          )}
        </div>
      </section>
    </div>
  );
}
