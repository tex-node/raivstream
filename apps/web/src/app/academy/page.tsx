'use client';

import Link from 'next/link';
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { AcademyShell, Card, EmptyState, dateLabel, statusLabel } from './AcademyShell';
import { useUser } from '@/lib/auth';

export default function AcademyHomePage() {
  const { isSignedIn, isLoaded } = useUser();
  const utils = trpc.useUtils();
  const student = trpc.academy.studentDashboard.useQuery(undefined, { enabled: isSignedIn });
  const instructor = trpc.academy.instructorDashboard.useQuery(undefined, { enabled: isSignedIn });
  const createTemplate = trpc.academy.createCourseFromTemplate.useMutation({ onSuccess: () => utils.academy.instructorDashboard.invalidate() });
  const joinClass = trpc.academy.joinClass.useMutation({ onSuccess: () => { setInviteCode(''); utils.academy.studentDashboard.invalidate(); } });
  const [inviteCode, setInviteCode] = useState('');

  if (!isLoaded) return <AcademyShell title="Academy"><EmptyState>Loading Academy...</EmptyState></AcademyShell>;
  if (!isSignedIn) {
    return (
      <AcademyShell title="Academy" subtitle="Sign in to join a class or run a filmmaking course.">
        <Link href="/sign-in" className="inline-block rounded-xl bg-[#172033] px-5 py-3 font-black text-white">Sign In</Link>
      </AcademyShell>
    );
  }

  const memberships = student.data?.memberships ?? [];
  const instructorClasses = instructor.data?.classes ?? [];
  const awaitingReview = instructor.data?.awaitingReview ?? [];

  return (
    <AcademyShell title="Academy" subtitle="Courses and classes built around Story Workspace projects.">
      <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
        <div className="space-y-5">
          <Card>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-black uppercase text-[#2f80ed]">Continue Learning</p>
                <h2 className="text-2xl font-black">My Classes</h2>
              </div>
              <Link href="/story-playground" className="rounded-xl bg-[#ffcf4a] px-4 py-3 text-sm font-black text-[#172033]">Open Story Workspace</Link>
            </div>
            <div className="mt-4 grid gap-3">
              {memberships.map((membership: any) => (
                <Link key={membership.id} href={`/academy/classes/${membership.class.id}`} className="rounded-xl bg-[#f7f4ee] p-4 hover:ring-2 hover:ring-[#2f80ed]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-black">{membership.class.title}</h3>
                      <p className="text-sm font-bold text-[#596070]">{membership.class.course.title}</p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-black">{membership.progressPercent}% complete</span>
                  </div>
                </Link>
              ))}
              {memberships.length === 0 && <EmptyState>No active classes yet. Join with an invite code.</EmptyState>}
            </div>
          </Card>

          <Card>
            <p className="text-sm font-black uppercase text-[#b13b63]">My Assignments</p>
            <h2 className="text-2xl font-black">Due and In Progress</h2>
            <div className="mt-4 grid gap-3">
              {memberships.flatMap((membership: any) => membership.class.assignments.map((assignment: any) => ({ assignment, klass: membership.class }))).slice(0, 8).map(({ assignment, klass }: any) => {
                const submission = assignment.submissions?.[0];
                return (
                  <Link key={assignment.id} href={`/academy/classes/${klass.id}/assignments/${assignment.id}`} className="rounded-xl border border-[#172033]/10 p-4 hover:bg-[#fff9ed]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-black">{assignment.title}</h3>
                      <span className="rounded-full bg-[#eef7ff] px-3 py-1 text-xs font-black text-[#2f80ed]">{submission ? statusLabel(submission.status) : 'Not Submitted'}</span>
                    </div>
                    <p className="mt-1 text-sm font-bold text-[#596070]">{klass.title} · Due {dateLabel(assignment.dueAt)}</p>
                  </Link>
                );
              })}
              {memberships.every((membership: any) => membership.class.assignments.length === 0) && <EmptyState>No assignments yet.</EmptyState>}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <p className="text-sm font-black uppercase text-[#2fbf71]">Join Class</p>
            <h2 className="text-2xl font-black">Invite Code</h2>
            <form onSubmit={(event) => { event.preventDefault(); if (inviteCode.trim()) joinClass.mutate({ inviteCode }); }} className="mt-4 flex gap-2">
              <input value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} placeholder="RAIV-ABC123" className="min-w-0 flex-1 rounded-xl border-2 border-[#172033]/10 px-4 py-3 font-bold outline-none" />
              <button disabled={joinClass.isPending} className="rounded-xl bg-[#2fbf71] px-4 py-3 font-black text-white disabled:opacity-50">Join</button>
            </form>
            {joinClass.error && <p className="mt-3 text-sm font-bold text-[#b13b63]">{joinClass.error.message}</p>}
          </Card>

          <Card>
            <p className="text-sm font-black uppercase text-[#7c3aed]">Instructor</p>
            <h2 className="text-2xl font-black">Run a Course</h2>
            <p className="mt-2 text-sm font-semibold text-[#596070]">Duplicate the one-month AI Storytelling and Virtual Filmmaking template, then create a class.</p>
            <button onClick={() => createTemplate.mutate()} disabled={createTemplate.isPending} className="mt-4 w-full rounded-xl bg-[#172033] px-4 py-3 font-black text-white disabled:opacity-50">Create Course Template</button>
          </Card>

          <Card>
            <p className="text-sm font-black uppercase text-[#f59e0b]">Instructor Dashboard</p>
            <h2 className="text-2xl font-black">Review Queue</h2>
            <p className="mt-2 text-sm font-bold text-[#596070]">{awaitingReview.length} submissions awaiting review.</p>
            <div className="mt-4 grid gap-2">
              {instructorClasses.slice(0, 4).map((klass: any) => (
                <Link key={klass.id} href={`/academy/classes/${klass.id}`} className="rounded-xl bg-[#f7f4ee] px-4 py-3 font-black">{klass.title}</Link>
              ))}
              {instructorClasses.length === 0 && <EmptyState>No instructor classes yet.</EmptyState>}
            </div>
          </Card>
        </div>
      </div>
    </AcademyShell>
  );
}
