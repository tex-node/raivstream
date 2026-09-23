'use client';

import { useUser } from '@/lib/auth';
import { trpc } from '@/lib/trpc';

type Finding = {
  id: string;
  category: string;
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  resolution?: 'KEEP' | 'FIX' | 'REVIEW';
};
type Run = { id: string; sceneId: string | null; findings: Finding[]; status: string };

/**
 * Raivstream 5.0 — Review (JUDGE). Human-readable findings with KEEP / FIX /
 * REVIEW. No scores, models or providers. A FIX routes to the Director.
 */
export function ReviewPanel({ projectId }: { projectId: string }) {
  const { isLoaded, isSignedIn } = useUser();
  const reviewGet = trpc.creative.review.get.useQuery({ projectId }, { enabled: Boolean(isLoaded && isSignedIn) });
  const runReview = trpc.creative.review.run.useMutation({ onSuccess: () => reviewGet.refetch() });
  const resolve = trpc.creative.review.resolve.useMutation({ onSuccess: () => reviewGet.refetch() });

  const runs = (reviewGet.data?.runs ?? []) as Run[];
  const resolutions = (reviewGet.data?.resolutions ?? {}) as Record<string, string>;

  return (
    <section id="review" className="space-y-4">
      <div className="rounded-2xl border border-[rgba(233,233,237,0.1)] bg-[var(--noc-bar)] p-5 text-white">
        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-t2)]">Review</p>
        <p className="mt-1 text-lg font-black">What&apos;s working, what deserves attention</p>
        <button
          type="button"
          disabled={runReview.isPending}
          onClick={() => runReview.mutate({ projectId })}
          className="mt-3 rounded-xl bg-[linear-gradient(90deg,#4f8bd6,#b25ad9)] px-5 py-2.5 text-sm font-black text-[#0B0D12] disabled:opacity-50"
        >
          {runReview.isPending ? 'Reviewing…' : runs.length > 0 ? 'Review again' : 'Run review'}
        </button>
      </div>

      {runs.length === 0 && (
        <p className="text-sm text-[var(--noc-t5)]">Run a review to get actionable notes on your scenes.</p>
      )}

      {runs.map((run) =>
        run.findings.length === 0 ? null : (
          <article key={run.id} className="rounded-2xl border border-[rgba(233,233,237,0.1)] bg-[rgba(233,233,237,0.03)] p-4">
            {run.findings.map((finding) => {
              const chosen = resolutions[`${run.id}:${finding.id}`] ?? finding.resolution;
              const severityColor = finding.severity === 'HIGH' ? '#e35d5d' : finding.severity === 'MEDIUM' ? '#e8a13d' : 'var(--noc-t5)';
              return (
                <div key={finding.id} className="border-b border-[rgba(233,233,237,0.06)] py-3 last:border-0">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-[var(--noc-t1)]">{finding.description}</p>
                    <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase" style={{ background: `${severityColor}22`, color: severityColor }}>
                      {finding.severity}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {(['KEEP', 'FIX', 'REVIEW'] as const).map((kind) => (
                      <button
                        key={kind}
                        type="button"
                        disabled={resolve.isPending}
                        onClick={() => resolve.mutate({ projectId, runId: run.id, findingId: finding.id, resolution: kind })}
                        className={`rounded-full border px-3 py-1 text-xs font-bold ${
                          chosen === kind
                            ? kind === 'FIX'
                              ? 'border-[var(--noc-magenta)] bg-[var(--noc-magenta)]/15 text-[var(--noc-t1)]'
                              : 'border-[var(--noc-purple)] bg-[var(--noc-purple)]/15 text-[var(--noc-t1)]'
                            : 'border-[rgba(233,233,237,0.16)] text-[var(--noc-t4)]'
                        }`}
                      >
                        {kind === 'FIX' ? 'Fix (Director)' : kind}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </article>
        ),
      )}
    </section>
  );
}