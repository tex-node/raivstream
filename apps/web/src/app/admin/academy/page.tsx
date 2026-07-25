'use client';

import Link from 'next/link';
import { trpc } from '@/lib/trpc';

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border p-5" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}>
      <p className="text-xs font-semibold uppercase tracking-wider text-white/40">{label}</p>
      <p className="mt-2 text-3xl font-bold text-white">{value.toLocaleString()}</p>
    </div>
  );
}

export default function AdminAcademyPage() {
  const { data, isLoading, error } = trpc.academy.adminOverview.useQuery();

  if (isLoading) return <div className="p-8 text-white/60">Loading Academy diagnostics...</div>;
  if (error) return <div className="p-8 text-red-300">{error.message}</div>;
  if (!data) return null;

  return (
    <div className="space-y-8 p-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Academy Diagnostics</h1>
        <p className="mt-1 text-sm text-white/40">Platform-level inspection for courses, classes, enrollments, and submissions.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <Stat label="Courses" value={data.courses} />
        <Stat label="Classes" value={data.classes} />
        <Stat label="Active Memberships" value={data.memberships} />
        <Stat label="Submissions" value={data.submissions} />
        <Stat label="Awaiting Review" value={data.awaitingReview} />
      </div>

      <section className="rounded-2xl border" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        <div className="border-b px-5 py-4" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          <h2 className="font-bold text-white">Recent Classes</h2>
        </div>
        <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          {data.recentClasses.map((klass: any) => (
            <Link key={klass.id} href={`/academy/classes/${klass.id}`} className="grid gap-2 px-5 py-4 text-sm hover:bg-white/5 md:grid-cols-[1fr_1fr_1fr_auto]">
              <span className="font-semibold text-white">{klass.title}</span>
              <span className="text-white/50">{klass.course.title}</span>
              <span className="text-white/50">@{klass.instructor.username}</span>
              <span className="text-white/40">{klass._count.memberships} members · {klass._count.assignments} assignments</span>
            </Link>
          ))}
          {data.recentClasses.length === 0 && <div className="px-5 py-8 text-center text-white/30">No Academy classes yet.</div>}
        </div>
      </section>
    </div>
  );
}
