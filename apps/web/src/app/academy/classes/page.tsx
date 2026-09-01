'use client';

import Link from 'next/link';
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { AcademyShell, Card, EmptyState, dateLabel, statusLabel } from '../AcademyShell';

export default function AcademyClassesPage() {
  const utils = trpc.useUtils();
  const courses = trpc.academy.listMyCourses.useQuery();
  const instructor = trpc.academy.instructorDashboard.useQuery();
  const createTemplate = trpc.academy.createCourseFromTemplate.useMutation({ onSuccess: () => courses.refetch() });
  const createClass = trpc.academy.createClass.useMutation({ onSuccess: () => { setClassTitle(''); utils.academy.instructorDashboard.invalidate(); } });
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [classTitle, setClassTitle] = useState('');

  const courseList = courses.data ?? [];
  const classes = instructor.data?.classes ?? [];

  return (
    <AcademyShell title="Classes" subtitle="Create cohorts, share invite codes, and manage students.">
      <div className="grid gap-5 lg:grid-cols-[.85fr_1.15fr]">
        <Card>
          <p className="text-sm font-black uppercase text-[var(--noc-blue)]">Course Template</p>
          <h2 className="text-2xl font-black">AI Storytelling and Virtual Filmmaking</h2>
          <p className="mt-2 text-sm font-semibold text-[var(--noc-t4)]">A reusable four-week course with eight lessons and four assignment templates.</p>
          <button onClick={() => createTemplate.mutate()} disabled={createTemplate.isPending} className="mt-4 rounded-xl bg-[var(--noc-blue)] px-4 py-3 font-black text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60">Duplicate Template</button>
        </Card>

        <Card>
          <p className="text-sm font-black uppercase text-[#2fbf71]">New Class</p>
          <h2 className="text-2xl font-black">Create a Cohort</h2>
          <form onSubmit={(event) => { event.preventDefault(); if (selectedCourseId && classTitle.trim()) createClass.mutate({ courseId: selectedCourseId, title: classTitle }); }} className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <select value={selectedCourseId} onChange={(event) => setSelectedCourseId(event.target.value)} className="rounded-xl border border-[var(--noc-hairline)] bg-white/5 px-4 py-3 font-bold text-[var(--noc-t1)] outline-none focus:border-[var(--noc-blue)]">
              <option value="">Choose course</option>
              {courseList.map((course: any) => <option key={course.id} value={course.id}>{course.title}</option>)}
            </select>
            <input value={classTitle} onChange={(event) => setClassTitle(event.target.value)} placeholder="AI Filmmaking - July Cohort" className="rounded-xl border border-[var(--noc-hairline)] bg-white/5 px-4 py-3 font-bold text-[var(--noc-t1)] placeholder:text-[var(--noc-t6)] outline-none focus:border-[var(--noc-blue)]" />
            <button disabled={createClass.isPending} className="rounded-xl bg-[#2fbf71] px-4 py-3 font-black text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2fbf71]/60">Create</button>
          </form>
          {courseList.length === 0 && <p className="mt-3 text-sm font-bold text-[var(--noc-magenta)]">Create or duplicate a course first.</p>}
        </Card>
      </div>

      <Card className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-black uppercase text-amber-400">My Classes</p>
            <h2 className="text-2xl font-black">Instructor and TA Classes</h2>
          </div>
          <Link href="/academy" className="rounded-xl bg-[#ffcf4a] px-4 py-3 text-sm font-black text-[#172033] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60">Academy Dashboard</Link>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {classes.map((klass: any) => (
            <Link key={klass.id} href={`/academy/classes/${klass.id}`} className="rounded-2xl border border-[var(--noc-hairline)] bg-white/5 p-4 hover:ring-2 hover:ring-[var(--noc-blue)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-black">{klass.title}</h3>
                  <p className="mt-1 text-sm font-bold text-[var(--noc-t4)]">{klass.course.title}</p>
                </div>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black">{statusLabel(klass.status)}</span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs font-black">
                <span className="rounded-xl bg-white/5 p-2">{klass.memberships.length} people</span>
                <span className="rounded-xl bg-white/5 p-2">{klass.assignments.length} tasks</span>
                <span className="rounded-xl bg-white/5 p-2">{klass.inviteCode}</span>
              </div>
              <p className="mt-3 text-xs font-bold text-[var(--noc-t4)]">Updated {dateLabel(klass.updatedAt)}</p>
            </Link>
          ))}
          {classes.length === 0 && <EmptyState>No classes yet.</EmptyState>}
        </div>
      </Card>
    </AcademyShell>
  );
}
