'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { AcademyShell, Card, EmptyState, dateLabel, statusLabel } from '../../AcademyShell';

export default function AcademySubmissionPage() {
  const params = useParams<{ submissionId: string }>();
  const submissionId = params.submissionId;
  const utils = trpc.useUtils();
  const submission = trpc.academy.getSubmission.useQuery({ submissionId }, { enabled: Boolean(submissionId) });
  const addComment = trpc.academy.addComment.useMutation({ onSuccess: () => { setComment(''); utils.academy.getSubmission.invalidate({ submissionId }); } });
  const review = trpc.academy.reviewSubmission.useMutation({ onSuccess: () => utils.academy.getSubmission.invalidate({ submissionId }) });
  const [comment, setComment] = useState('');
  const [summary, setSummary] = useState('');
  const [score, setScore] = useState('');

  if (submission.isLoading) return <AcademyShell title="Submission"><EmptyState>Loading submission...</EmptyState></AcademyShell>;
  if (submission.error) return <AcademyShell title="Submission unavailable"><EmptyState>{submission.error.message}</EmptyState></AcademyShell>;
  if (!submission.data) return null;

  const data: any = submission.data;
  const assignment = data.assignment;
  const project = data.project;
  const snapshot = data.snapshot ?? {};
  const reviewer = Boolean(data.reviewer);
  const rubric = Array.isArray(assignment.rubric) ? assignment.rubric : [];
  const rubricScores = rubric.map((criterion: any, index: number) => ({
    criterionId: criterion.id,
    title: criterion.title,
    maximumPoints: Number(criterion.maximumPoints ?? 0),
    score: Number(criterion.maximumPoints ?? 0),
    notes: '',
    orderIndex: criterion.orderIndex ?? index + 1,
  }));

  const submitReview = (status: 'REVISION_REQUESTED' | 'APPROVED' | 'GRADED') => {
    review.mutate({
      submissionId,
      status,
      instructorSummary: summary || undefined,
      score: score ? Number(score) : undefined,
      rubricScores: status === 'GRADED' ? rubricScores : undefined,
    });
  };

  return (
    <AcademyShell title={assignment.title} subtitle={`${data.student.displayName} · ${statusLabel(data.status)}`}>
      <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
        <div className="space-y-5">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black uppercase text-[var(--noc-blue)]">Submitted Project</p>
                <h2 className="text-2xl font-black">{snapshot.projectTitle ?? project?.title ?? 'Story Workspace Project'}</h2>
              </div>
              <span className="rounded-full bg-[var(--noc-blue)]/10 px-3 py-1 text-xs font-black text-[var(--noc-blue)]">Attempt {data.attemptNumber}</span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <div className="rounded-xl bg-white/5 p-3"><p className="text-xs font-black uppercase text-[var(--noc-t4)]">Characters</p><p className="text-2xl font-black">{snapshot.characterCount ?? project?.characterMemory?.length ?? 0}</p></div>
              <div className="rounded-xl bg-white/5 p-3"><p className="text-xs font-black uppercase text-[var(--noc-t4)]">Scenes</p><p className="text-2xl font-black">{snapshot.sceneCount ?? project?.sceneSeeds?.length ?? 0}</p></div>
              <div className="rounded-xl bg-white/5 p-3"><p className="text-xs font-black uppercase text-[var(--noc-t4)]">Storybook</p><p className="text-2xl font-black">{snapshot.storybookReady ? 'Ready' : 'Open'}</p></div>
              <div className="rounded-xl bg-white/5 p-3"><p className="text-xs font-black uppercase text-[var(--noc-t4)]">Submitted</p><p className="text-sm font-black">{dateLabel(data.submittedAt)}</p></div>
            </div>
            {project && (
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href={`/story-playground/${project.id}`} className="rounded-xl border border-[var(--noc-hairline)] bg-white/5 px-4 py-3 font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60">Open Workspace Read-Only</Link>
                <Link href={`/story-playground/${project.id}/storybook`} className="rounded-xl bg-[var(--noc-blue)] px-4 py-3 font-black text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60">Open Storybook</Link>
              </div>
            )}
            {data.submissionText && <p className="mt-5 whitespace-pre-wrap rounded-xl bg-amber-500/10 p-4 font-semibold text-[var(--noc-t2)]">{data.submissionText}</p>}
          </Card>

          <Card>
            <p className="text-sm font-black uppercase text-[var(--noc-magenta)]">Contextual Comments</p>
            {reviewer && (
              <form onSubmit={(event) => { event.preventDefault(); if (comment.trim()) addComment.mutate({ submissionId, targetType: 'SUBMISSION', body: comment }); }} className="mt-4 grid gap-3">
                <textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add feedback for the student." className="min-h-28 rounded-xl border border-[var(--noc-hairline)] bg-white/5 px-4 py-3 font-semibold text-[var(--noc-t1)] placeholder:text-[var(--noc-t6)] outline-none focus:border-[var(--noc-blue)]" />
                <button disabled={addComment.isPending} className="w-fit rounded-xl bg-[#b13b63] px-4 py-3 font-black text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-magenta)]/60">Add Comment</button>
              </form>
            )}
            <div className="mt-4 grid gap-3">
              {(data.comments ?? []).map((item: any) => (
                <div key={item.id} className="rounded-xl bg-white/5 p-4">
                  <p className="font-semibold text-[var(--noc-t2)]">{item.body}</p>
                  <p className="mt-2 text-xs font-bold text-[var(--noc-t4)]">{statusLabel(item.targetType)} · {item.author.displayName} · {dateLabel(item.createdAt)}</p>
                </div>
              ))}
              {(data.comments ?? []).length === 0 && <EmptyState>No comments yet.</EmptyState>}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <p className="text-sm font-black uppercase text-[#2fbf71]">Instructor Review</p>
            {reviewer ? (
              <div className="mt-4 grid gap-3">
                <textarea value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Overall feedback summary." className="min-h-28 rounded-xl border border-[var(--noc-hairline)] bg-white/5 px-4 py-3 font-semibold text-[var(--noc-t1)] placeholder:text-[var(--noc-t6)] outline-none focus:border-[var(--noc-blue)]" />
                <input value={score} onChange={(event) => setScore(event.target.value)} placeholder="Score, e.g. 88" className="rounded-xl border border-[var(--noc-hairline)] bg-white/5 px-4 py-3 font-bold text-[var(--noc-t1)] placeholder:text-[var(--noc-t6)] outline-none focus:border-[var(--noc-blue)]" />
                <div className="grid gap-2">
                  <button onClick={() => submitReview('REVISION_REQUESTED')} className="rounded-xl bg-[#ffcf4a] px-4 py-3 font-black text-[#172033] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60">Request Revision</button>
                  <button onClick={() => submitReview('APPROVED')} className="rounded-xl bg-[#2fbf71] px-4 py-3 font-black text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2fbf71]/60">Approve</button>
                  <button onClick={() => submitReview('GRADED')} className="rounded-xl bg-[var(--noc-blue)] px-4 py-3 font-black text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60">Grade</button>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-xl bg-amber-500/10 p-4 font-semibold text-[var(--noc-t2)]">{data.instructorSummary || 'Feedback will appear here after review.'}</div>
            )}
          </Card>

          <Card>
            <p className="text-sm font-black uppercase text-[var(--noc-purple)]">Rubric</p>
            <div className="mt-3 grid gap-2">
              {rubric.map((criterion: any) => {
                const saved = data.rubricScores?.find((item: any) => item.criterionId === criterion.id);
                return (
                  <div key={criterion.id} className="rounded-xl bg-white/5 p-3">
                    <div className="flex justify-between gap-2">
                      <p className="font-black">{criterion.title}</p>
                      <span className="text-sm font-black">{saved ? `${saved.score}/` : ''}{criterion.maximumPoints} pts</span>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-[var(--noc-t4)]">{criterion.description}</p>
                  </div>
                );
              })}
              {rubric.length === 0 && <EmptyState>No rubric attached.</EmptyState>}
            </div>
          </Card>
        </div>
      </div>
    </AcademyShell>
  );
}
