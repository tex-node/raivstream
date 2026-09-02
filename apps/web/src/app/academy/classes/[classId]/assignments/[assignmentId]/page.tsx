'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { AcademyShell, Card, EmptyState, dateLabel, statusLabel } from '../../../../AcademyShell';

function tabForStage(stage?: string | null) {
  if (!stage) return 'overview';
  if (stage.includes('CHARACTER')) return 'characters';
  if (stage.includes('SCENE')) return 'scenes';
  if (stage.includes('STORYBOOK')) return 'storybook';
  if (stage.includes('IMAGE') || stage.includes('ASSET')) return 'assets';
  return 'story';
}

export default function AcademyAssignmentPage() {
  const params = useParams<{ classId: string; assignmentId: string }>();
  const { classId, assignmentId } = params;
  const utils = trpc.useUtils();
  const assignment = trpc.academy.getAssignment.useQuery({ assignmentId }, { enabled: Boolean(assignmentId) });
  const projects = trpc.academy.listStudentProjects.useQuery();
  const submit = trpc.academy.submitAssignment.useMutation({ onSuccess: () => utils.academy.getAssignment.invalidate({ assignmentId }) });
  const [projectId, setProjectId] = useState('');
  const [submissionText, setSubmissionText] = useState('');

  const data: any = assignment.data?.assignment;
  const mySubmission: any = assignment.data?.mySubmission;
  const selectedProjectId = projectId || mySubmission?.projectId || '';
  const workspaceUrl = useMemo(() => {
    if (!selectedProjectId || !data) return '/story-playground';
    const tab = tabForStage(data.requiredWorkspaceStage);
    return `/story-playground/${selectedProjectId}?tab=${tab}&academyAssignment=${assignmentId}`;
  }, [assignmentId, data, selectedProjectId]);

  if (assignment.isLoading) return <AcademyShell title="Assignment"><EmptyState>Loading assignment...</EmptyState></AcademyShell>;
  if (assignment.error) return <AcademyShell title="Assignment unavailable"><EmptyState>{assignment.error.message}</EmptyState></AcademyShell>;
  if (!data) return null;

  const rubric = Array.isArray(data.rubric) ? data.rubric : [];

  return (
    <AcademyShell title={data.title} subtitle={data.brief}>
      <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
        <div className="space-y-5">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black uppercase text-[var(--noc-blue)]">{statusLabel(data.deliverableType)}</p>
                <h2 className="text-2xl font-black">Instructions</h2>
              </div>
              <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-black text-amber-400">Due {dateLabel(data.dueAt)}</span>
            </div>
            <p className="mt-4 whitespace-pre-wrap font-semibold leading-7 text-[var(--noc-t2)]">{data.instructions || data.brief}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href={`/academy/classes/${classId}`} className="rounded-xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] px-4 py-3 font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60">Back to Class</Link>
              <Link href={workspaceUrl} className="rounded-xl bg-[var(--noc-blue)] px-4 py-3 font-black text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60">Open Story Workspace</Link>
            </div>
          </Card>

          <Card>
            <p className="text-sm font-black uppercase text-[#2fbf71]">Submit Work</p>
            <h2 className="text-2xl font-black">Attach Story Workspace Project</h2>
            <div className="mt-4 grid gap-3">
              <select value={selectedProjectId} onChange={(event) => setProjectId(event.target.value)} className="rounded-xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] px-4 py-3 font-bold text-[var(--noc-t1)] outline-none focus:border-[var(--noc-blue)]">
                <option value="">Choose a project</option>
                {(projects.data ?? []).map((project: any) => <option key={project.id} value={project.id}>{project.title}</option>)}
              </select>
              <textarea value={submissionText} onChange={(event) => setSubmissionText(event.target.value)} placeholder="Add a creative statement, reflection, or notes for your instructor." className="min-h-32 rounded-xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] px-4 py-3 font-semibold text-[var(--noc-t1)] placeholder:text-[var(--noc-t6)] outline-none focus:border-[var(--noc-blue)]" />
              <div className="flex flex-wrap gap-3">
                <button onClick={() => submit.mutate({ assignmentId, projectId: selectedProjectId || undefined, submissionText: submissionText || undefined })} disabled={submit.isPending || !selectedProjectId} className="rounded-xl bg-[#2fbf71] px-4 py-3 font-black text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2fbf71]/60">Submit Work</button>
                <Link href="/story-playground" className="rounded-xl bg-[#ffcf4a] px-4 py-3 font-black text-[#172033] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60">Create New Story</Link>
              </div>
              {submit.error && <p className="text-sm font-bold text-[var(--noc-magenta)]">{submit.error.message}</p>}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <p className="text-sm font-black uppercase text-[var(--noc-magenta)]">Submission</p>
            {mySubmission ? (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-2xl font-black">{statusLabel(mySubmission.status)}</h2>
                  <span className="rounded-full bg-[var(--noc-blue)]/10 px-3 py-1 text-xs font-black text-[var(--noc-blue)]">Attempt {mySubmission.attemptNumber}</span>
                </div>
                <p className="mt-2 text-sm font-bold text-[var(--noc-t4)]">Submitted {dateLabel(mySubmission.submittedAt)}</p>
                {mySubmission.project && <Link href={`/story-playground/${mySubmission.project.id}?academyAssignment=${assignmentId}`} className="mt-4 block rounded-xl bg-[var(--noc-card)] p-4 font-black hover:ring-2 hover:ring-[var(--noc-blue)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60">{mySubmission.project.title}</Link>}
                {mySubmission.instructorSummary && <p className="mt-4 rounded-xl bg-amber-500/10 p-4 font-semibold text-[var(--noc-t2)]">{mySubmission.instructorSummary}</p>}
                <Link href={`/academy/submissions/${mySubmission.id}`} className="mt-4 inline-block rounded-xl bg-[var(--noc-blue)] px-4 py-3 font-black text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60">Open Feedback</Link>
              </div>
            ) : <EmptyState>No submission yet.</EmptyState>}
          </Card>

          <Card>
            <p className="text-sm font-black uppercase text-[var(--noc-purple)]">Rubric</p>
            <div className="mt-3 grid gap-2">
              {rubric.map((criterion: any) => (
                <div key={criterion.id} className="rounded-xl bg-[var(--noc-card)] p-3">
                  <div className="flex justify-between gap-2">
                    <p className="font-black">{criterion.title}</p>
                    <span className="text-sm font-black">{criterion.maximumPoints} pts</span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-[var(--noc-t4)]">{criterion.description}</p>
                </div>
              ))}
              {rubric.length === 0 && <EmptyState>No rubric provided.</EmptyState>}
            </div>
          </Card>
        </div>
      </div>
    </AcademyShell>
  );
}
