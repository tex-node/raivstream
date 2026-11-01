'use client';

import { useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc';

/**
 * Phase 3.5 — submit a film.
 *
 * Two rules from docs/operations/phase-3.5-payout-decision.md are rendered here:
 * the terms are shown BEFORE submission (the pin is only honest if the filmmaker
 * saw what they agreed to), and a rejection is final for that video (a consequence
 * of `FilmSubmission.videoId` being unique, so "try again" would fail).
 *
 * There is deliberately no earnings or payout element on this page: no revenue
 * period, pool or ledger row exists yet, so any figure here would be invented.
 */
export default function SubmitFilmPage() {
  const [busyVideoId, setBusyVideoId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const terms = trpc.films.currentTerms.useQuery();
  const mine = trpc.films.mine.useQuery();
  const videos = trpc.video.myVideos.useQuery({} as never);

  const submit = trpc.films.submit.useMutation({
    onSuccess: async (created: { acceptedRevenueTermsId?: string | null }) => {
      setNotice(
        created?.acceptedRevenueTermsId
          ? `Submitted. Your film is pinned to the terms shown above (${terms.data?.name ?? 'current terms'}).`
          : 'Submitted.',
      );
      setBusyVideoId(null);
      await mine.refetch();
    },
    onError: (error) => {
      setBusyVideoId(null);
      setNotice(
        error.message.includes('already')
          ? 'That video already has a submission. A declined film needs a new video.'
          : error.message,
      );
    },
  });

  const submittedVideoIds = useMemo(
    () => new Set(((mine.data ?? []) as Array<{ videoId: string }>).map((s) => s.videoId)),
    [mine.data],
  );

  const list = ((videos.data as { items?: Array<{ id: string; title: string; thumbnailUrl?: string | null }> })?.items ?? []) as Array<{
    id: string;
    title: string;
    thumbnailUrl?: string | null;
  }>;

  const share = terms.data ? (terms.data.shareBps / 100).toFixed(2) : null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-[var(--noc-t1)]">
      <h1 className="text-3xl font-black">Submit a film</h1>

      <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 className="text-lg font-bold">What you are agreeing to</h2>
        {terms.isLoading && <p className="mt-2 text-sm opacity-70">Loading terms…</p>}
        {terms.data ? (
          <p className="mt-2 text-sm">
            <strong>{share}%</strong> of this film&apos;s share of the revenue pool —{' '}
            <em>{terms.data.name}</em>, in force from{' '}
            {new Date(terms.data.effectiveFrom).toLocaleDateString()}.
            <br />
            <span className="opacity-70">
              Submitting pins these terms to your film. Later changes to the terms do not affect a film that
              has already been submitted.
            </span>
          </p>
        ) : (
          !terms.isLoading && (
            <p className="mt-2 text-sm text-amber-300">
              No revenue terms are in force, so submissions are closed until an operator publishes them.
            </p>
          )
        )}
      </section>

      <section className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-5 text-sm">
        <strong>Review is a decision, not a payment.</strong> If a submission is declined, it is final for
        that video. You can submit a new film at any time.
      </section>

      {notice && (
        <p className="mt-4 rounded-xl border border-white/15 bg-white/5 p-4 text-sm" role="status">
          {notice}
        </p>
      )}

      <h2 className="mt-8 text-xl font-bold">Your finished videos</h2>
      {videos.isLoading && <p className="mt-2 text-sm opacity-70">Loading…</p>}
      <ul className="mt-3 space-y-3">
        {list.map((video) => {
          const already = submittedVideoIds.has(video.id);
          return (
            <li key={video.id} className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 p-3">
              {video.thumbnailUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={video.thumbnailUrl} alt="" className="h-14 w-10 rounded object-cover" />
              )}
              <span className="flex-1 text-sm font-semibold">{video.title}</span>
              <button
                type="button"
                disabled={already || busyVideoId === video.id || !terms.data}
                onClick={() => {
                  setBusyVideoId(video.id);
                  setNotice(null);
                  submit.mutate({ videoId: video.id, termsId: terms.data?.id });
                }}
                className="rounded-lg border border-white/20 px-3 py-1.5 text-sm font-bold disabled:opacity-40"
              >
                {already ? 'Already submitted' : busyVideoId === video.id ? 'Submitting…' : 'Submit'}
              </button>
            </li>
          );
        })}
        {!videos.isLoading && list.length === 0 && (
          <li className="text-sm opacity-70">You have no finished videos yet.</li>
        )}
      </ul>

      {((mine.data ?? []) as Array<{ id: string; status: string; declineReason?: string | null }>).length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-bold">Your submissions</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {((mine.data ?? []) as Array<{ id: string; status: string; declineReason?: string | null }>).map((s) => (
              <li key={s.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <strong>{s.status}</strong>
                {s.status === 'REJECTED' && s.declineReason && (
                  <p className="mt-1 opacity-80">Reason: {s.declineReason}</p>
                )}
                {s.status === 'REJECTED' && (
                  <p className="mt-1 opacity-60">
                    A declined film cannot be resubmitted — submit a new video to be considered again.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
