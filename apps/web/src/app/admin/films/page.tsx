'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';

/**
 * Phase 3.5 — /admin/films, the review queue.
 *
 * Three rules from docs/operations/phase-3.5-payout-decision.md:
 *  - a decline REQUIRES a reason (the button is disabled until one is typed, and the
 *    service refuses too — the UI check is convenience, the service check is truth);
 *  - there is NO payout field: approval is a decision, not a payment;
 *  - there is NO "re-open": a rejection is final for that video.
 *
 * The pinned terms are displayed read-only because "what was this accepted under?" is
 * the question asked in a dispute, not because the reviewer acts on them.
 */
export default function AdminFilmsPage() {
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const { data, isLoading, refetch } = trpc.films.queue.useQuery();
  const review = trpc.films.review.useMutation({
    onSuccess: async (updated: { status?: string }) => {
      setNotice(updated?.status === 'APPROVED' ? 'Approved.' : 'Declined.');
      await refetch();
    },
    onError: (error) => setNotice(error.message),
  });

  const queue = (data ?? []) as Array<{
    id: string;
    submittedAt: string;
    declineReason?: string | null;
    contentWarnings?: string[];
    video: { id: string; title: string; moderationStatus?: string; duration?: number | null };
    submittedBy: { username: string; displayName?: string | null; creatorProfile?: { displayName?: string | null } | null };
    acceptedRevenueTerms: { id: string; name: string; shareBps: number } | null;
  }>;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 text-[var(--noc-t1)]">
      <h1 className="text-3xl font-black">Film submissions</h1>
      <p className="mt-1 text-sm opacity-70">
        Approval decides whether a film appears on Watch. It does not change the video&apos;s moderation
        state, and it is not a payment.
      </p>

      {notice && (
        <p className="mt-4 rounded-xl border border-white/15 bg-white/5 p-3 text-sm" role="status">{notice}</p>
      )}

      {isLoading && <p className="mt-6 text-sm opacity-70">Loading…</p>}
      {!isLoading && queue.length === 0 && <p className="mt-6 text-sm opacity-70">Nothing pending.</p>}

      <ul className="mt-6 space-y-4">
        {queue.map((submission) => {
          const reason = reasons[submission.id] ?? '';
          const terms = submission.acceptedRevenueTerms;
          return (
            <li key={submission.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-bold">{submission.video.title}</h2>
                <span className="text-xs opacity-60">
                  submitted {new Date(submission.submittedAt).toLocaleString()} by{' '}
                  {submission.submittedBy.creatorProfile?.displayName ?? submission.submittedBy.displayName ?? submission.submittedBy.username}
                </span>
              </div>

              <p className="mt-2 text-xs opacity-80">
                {/* Read-only: what this film was pinned to. */}
                Pinned terms: {terms ? `${terms.name} — ${(terms.shareBps / 100).toFixed(2)}%` : 'none'}
                {submission.video.moderationStatus && ` · video moderation: ${submission.video.moderationStatus}`}
              </p>

              {submission.contentWarnings && submission.contentWarnings.length > 0 && (
                <p className="mt-1 text-xs text-amber-300">Warnings: {submission.contentWarnings.join(', ')}</p>
              )}

              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
                <button
                  type="button"
                  disabled={review.isPending}
                  onClick={() => {
                    setNotice(null);
                    review.mutate({ submissionId: submission.id, action: 'APPROVE' });
                  }}
                  className="rounded-lg bg-emerald-500/90 px-3 py-1.5 text-sm font-bold text-black disabled:opacity-40"
                >
                  Approve
                </button>

                <div className="flex flex-1 flex-col gap-2 sm:flex-row">
                  <input
                    value={reason}
                    onChange={(event) => setReasons((prev) => ({ ...prev, [submission.id]: event.target.value }))}
                    placeholder="Decline reason (required)"
                    className="flex-1 rounded-lg border border-white/20 bg-transparent px-3 py-1.5 text-sm"
                  />
                  <button
                    type="button"
                    disabled={review.isPending || reason.trim().length === 0}
                    onClick={() => {
                      setNotice(null);
                      review.mutate({ submissionId: submission.id, action: 'REJECT', reason: reason.trim() });
                    }}
                    className="rounded-lg border border-red-400/50 px-3 py-1.5 text-sm font-bold text-red-300 disabled:opacity-40"
                  >
                    Decline
                  </button>
                </div>
              </div>

              <p className="mt-2 text-[11px] opacity-50">
                A decline is final for this video. There is no re-open action, and no payout is issued here.
              </p>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
