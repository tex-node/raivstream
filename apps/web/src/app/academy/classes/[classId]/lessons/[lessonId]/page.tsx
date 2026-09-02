'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { AcademyShell, Card, EmptyState, statusLabel } from '../../../../AcademyShell';

export default function AcademyLessonPage() {
  const params = useParams<{ classId: string; lessonId: string }>();
  const { classId, lessonId } = params;
  const utils = trpc.useUtils();
  const lesson = trpc.academy.getLesson.useQuery({ classId, lessonId }, { enabled: Boolean(classId && lessonId) });
  const updateProgress = trpc.academy.updateLessonProgress.useMutation({ onSuccess: () => utils.academy.getLesson.invalidate({ classId, lessonId }) });

  if (lesson.isLoading) return <AcademyShell title="Lesson"><EmptyState>Loading lesson...</EmptyState></AcademyShell>;
  if (lesson.error) return <AcademyShell title="Lesson unavailable"><EmptyState>{lesson.error.message}</EmptyState></AcademyShell>;
  if (!lesson.data) return null;

  const data: any = lesson.data;
  const objectives = Array.isArray(data.learningObjectives) ? data.learningObjectives : [];

  return (
    <AcademyShell title={data.title} subtitle={data.summary}>
      <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
        <Card>
          <p className="text-sm font-black uppercase text-[var(--noc-blue)]">{statusLabel(data.lessonType)} Lesson</p>
          <div className="prose prose-slate mt-4 max-w-none">
            <p className="whitespace-pre-wrap text-base font-semibold leading-7 text-[var(--noc-t2)]">{data.lessonContent || 'Lesson content will appear here.'}</p>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <button onClick={() => updateProgress.mutate({ classId, lessonId, status: 'IN_PROGRESS' })} className="rounded-xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] px-4 py-3 font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60">Save Progress</button>
            <button onClick={() => updateProgress.mutate({ classId, lessonId, status: 'COMPLETED' })} className="rounded-xl bg-[#2fbf71] px-4 py-3 font-black text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2fbf71]/60">Mark Complete</button>
            <Link href={`/academy/classes/${classId}`} className="rounded-xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] px-4 py-3 font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60">Back to Class</Link>
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <p className="text-sm font-black uppercase text-[#2fbf71]">Objectives</p>
            <div className="mt-3 grid gap-2">
              {objectives.map((objective: string) => <div key={objective} className="rounded-xl bg-[var(--noc-card)] p-3 font-bold">{objective}</div>)}
              {objectives.length === 0 && <EmptyState>No objectives listed.</EmptyState>}
            </div>
          </Card>

          <Card>
            <p className="text-sm font-black uppercase text-[var(--noc-magenta)]">Assignments</p>
            <div className="mt-3 grid gap-2">
              {(data.assignments ?? []).map((assignment: any) => (
                <Link key={assignment.id} href={`/academy/classes/${classId}/assignments/${assignment.id}`} className="rounded-xl bg-amber-500/10 p-3 font-black hover:ring-2 hover:ring-[var(--noc-magenta)]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-magenta)]/60">{assignment.title}</Link>
              ))}
              {(data.assignments ?? []).length === 0 && <EmptyState>No assignment attached to this lesson.</EmptyState>}
            </div>
          </Card>
        </div>
      </div>
    </AcademyShell>
  );
}
