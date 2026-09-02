'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { AcademyShell, Card, EmptyState, dateLabel, statusLabel } from '../../AcademyShell';

export default function AcademyClassPage() {
  const params = useParams<{ classId: string }>();
  const classId = params.classId;
  const utils = trpc.useUtils();
  const klass = trpc.academy.getClass.useQuery({ classId }, { enabled: Boolean(classId) });
  const createAssignments = trpc.academy.createTemplateAssignments.useMutation({ onSuccess: () => utils.academy.getClass.invalidate({ classId }) });

  if (klass.isLoading) return <AcademyShell title="Class"><EmptyState>Loading class...</EmptyState></AcademyShell>;
  if (klass.error) return <AcademyShell title="Class unavailable"><EmptyState>{klass.error.message}</EmptyState></AcademyShell>;
  if (!klass.data) return null;

  const data: any = klass.data;
  const modules = data.course.modules ?? [];
  const assignments = data.assignments ?? [];
  const students = (data.memberships ?? []).filter((membership: any) => membership.role === 'STUDENT');

  return (
    <AcademyShell title={data.title} subtitle={`${data.course.title} · Invite code ${data.inviteCode}`}>
      <div className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
        <div className="space-y-5">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black uppercase text-[var(--noc-blue)]">Lessons</p>
                <h2 className="text-2xl font-black">Course Roadmap</h2>
              </div>
              <span className="rounded-full bg-[var(--noc-blue)]/10 px-3 py-1 text-sm font-black text-[var(--noc-blue)]">{statusLabel(data.status)}</span>
            </div>
            <div className="mt-4 space-y-4">
              {modules.map((module: any) => (
                <div key={module.id} className="rounded-2xl bg-[var(--noc-card)] p-4">
                  <h3 className="text-lg font-black">{module.title}</h3>
                  <p className="text-sm font-semibold text-[var(--noc-t4)]">{module.description}</p>
                  <div className="mt-3 grid gap-2">
                    {module.lessons.map((lesson: any) => {
                      const progress = lesson.progress?.[0];
                      return (
                        <Link key={lesson.id} href={`/academy/classes/${classId}/lessons/${lesson.id}`} className="rounded-xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] p-4 hover:ring-2 hover:ring-[var(--noc-blue)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h4 className="font-black">{lesson.title}</h4>
                            <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-black text-amber-400">{statusLabel(progress?.status ?? 'NOT_STARTED')}</span>
                          </div>
                          <p className="mt-1 text-sm font-bold text-[var(--noc-t4)]">{lesson.summary}</p>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black uppercase text-[var(--noc-magenta)]">Assignments</p>
                <h2 className="text-2xl font-black">Project Milestones</h2>
              </div>
              <button onClick={() => createAssignments.mutate({ classId })} disabled={createAssignments.isPending} className="rounded-xl bg-[#ffcf4a] px-4 py-3 text-sm font-black text-[#172033] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60">Add Template Assignments</button>
            </div>
            <div className="mt-4 grid gap-3">
              {assignments.map((assignment: any) => (
                <Link key={assignment.id} href={`/academy/classes/${classId}/assignments/${assignment.id}`} className="rounded-xl border border-[var(--noc-hairline)] p-4 hover:bg-amber-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-black">{assignment.title}</h3>
                    <span className="rounded-full bg-[var(--noc-blue)]/10 px-3 py-1 text-xs font-black text-[var(--noc-blue)]">{statusLabel(assignment.status)}</span>
                  </div>
                  <p className="mt-1 text-sm font-bold text-[var(--noc-t4)]">{assignment.brief}</p>
                  <p className="mt-2 text-xs font-bold text-[var(--noc-t4)]">{assignment.submissions.length} submissions · Due {dateLabel(assignment.dueAt)}</p>
                </Link>
              ))}
              {assignments.length === 0 && <EmptyState>No assignments yet.</EmptyState>}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <p className="text-sm font-black uppercase text-[var(--noc-blue)]">Class Roster</p>
            <h2 className="text-2xl font-black">{students.length} Students</h2>
            <div className="mt-4 grid gap-2">
              {students.map((membership: any) => (
                <div key={membership.id} className="rounded-xl bg-[var(--noc-card)] p-3">
                  <p className="font-black">{membership.user.displayName}</p>
                  <p className="text-xs font-bold text-[var(--noc-t4)]">@{membership.user.username} · {membership.progressPercent}% complete</p>
                  <p className="text-xs font-bold text-[var(--noc-t4)]">Last active {dateLabel(membership.lastActiveAt)}</p>
                </div>
              ))}
              {students.length === 0 && <EmptyState>No students have joined yet.</EmptyState>}
            </div>
          </Card>

          <Card>
            <p className="text-sm font-black uppercase text-[var(--noc-purple)]">Invite</p>
            <h2 className="text-3xl font-black tracking-wide">{data.inviteCode}</h2>
            <p className="mt-2 text-sm font-semibold text-[var(--noc-t4)]">Students can join from `/academy` using this code while enrollment is open.</p>
          </Card>
        </div>
      </div>
    </AcademyShell>
  );
}
