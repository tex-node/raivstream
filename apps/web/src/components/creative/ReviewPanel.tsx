'use client';

import { useState } from 'react';
import { useUser } from '@/lib/auth';
import { trpc } from '@/lib/trpc';

type Finding = {
  id: string;
  category: string;
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  suggestedFixInstruction?: string;
  suggestedPreserves?: string[];
  suggestedImpact?: string;
  affectedEntities?: Array<{ type: string; name?: string; id?: string }>;
  resolution?: 'KEEP' | 'FIX' | 'REVIEW';
};
type Run = { id: string; sceneId: string | null; findings: Finding[]; status: string };
type Decision = {
  interpretation: string;
  preserves: string[];
  affectedSceneIds: string[];
  creativeChanges: Array<{ field: string; to: unknown }>;
  impact: string;
};

/**
 * Raivstream 5.0 — Review with the closed Review → Director loop.
 *
 * REVIEW → Finding → Raivstream understands the problem → proposed correction
 * → impact → [Fix it]. The creator never translates a critic finding into a
 * production instruction; the Director does that.
 */
export function ReviewPanel({ projectId }: { projectId: string }) {
  const { isLoaded, isSignedIn } = useUser();
  const utils = trpc.useUtils();
  const reviewGet = trpc.creative.review.get.useQuery({ projectId }, { enabled: Boolean(isLoaded && isSignedIn) });
  const runReview = trpc.creative.review.run.useMutation({ onSuccess: () => reviewGet.refetch() });
  const resolve = trpc.creative.review.resolve.useMutation({ onSuccess: () => reviewGet.refetch() });
  const propose = trpc.creative.director.propose.useMutation();
  const applyInstruction = trpc.creative.director.applyInstruction.useMutation({ onSuccess: () => utils.creative.project.get.invalidate({ projectId }) });
  const produce = trpc.creative.production.produce.useMutation({ onSuccess: () => utils.creative.project.get.invalidate({ projectId }) });

  const [fixing, setFixing] = useState<{ runId: string; finding: Finding } | null>(null);

  const runs = (reviewGet.data?.runs ?? []) as Run[];
  const resolutions = (reviewGet.data?.resolutions ?? {}) as Record<string, string>;

  const handleFixIt = (run: Run, finding: Finding) => {
    resolve.mutate({ projectId, runId: run.id, findingId: finding.id, resolution: 'FIX' });
    if (finding.suggestedFixInstruction) {
      setFixing({ runId: run.id, finding });
      applyInstruction.reset();
      propose.mutate({ projectId, instruction: finding.suggestedFixInstruction });
    }
  };
  const decision = propose.data?.decision as Decision | undefined;
  const applied = applyInstruction.data;

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

      {runs.length === 0 && <p className="text-sm text-[var(--noc-t5)]">Run a review to get actionable notes on your scenes.</p>}

      {runs.map((run) =>
        run.findings.length === 0 ? null : (
          <article key={run.id} className="rounded-2xl border border-[rgba(233,233,237,0.1)] bg-[rgba(233,233,237,0.03)] p-4">
            {run.findings.map((finding) => {
              const chosen = resolutions[`${run.id}:${finding.id}`] ?? finding.resolution;
              const severityColor = finding.severity === 'HIGH' ? '#e35d5d' : finding.severity === 'MEDIUM' ? '#e8a13d' : 'var(--noc-t5)';
              const sceneName = finding.affectedEntities?.[0]?.name;
              const isFixing = fixing?.finding.id === finding.id;
              return (
                <div key={finding.id} className="border-b border-[rgba(233,233,237,0.06)] py-3 last:border-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-t6)]">{finding.category}</p>
                      <p className="mt-0.5 text-sm font-semibold text-[var(--noc-t1)]">{finding.description}</p>
                    </div>
                    <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase" style={{ background: `${severityColor}22`, color: severityColor }}>
                      {finding.severity}
                    </span>
                  </div>

                  {finding.suggestedFixInstruction && (
                    <div className="mt-2 rounded-xl border border-[rgba(79,139,214,0.25)] bg-[rgba(79,139,214,0.07)] p-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-blue)]">Suggested fix</p>
                      <p className="mt-1 text-sm text-[var(--noc-t2)]">{finding.suggestedFixInstruction}</p>
                      <p className="mt-1 text-xs text-[var(--noc-t5)]">
                        Affects: {sceneName ?? finding.category.toLowerCase()}
                        {finding.suggestedPreserves?.length ? ` · Preserves: ${finding.suggestedPreserves.join(', ')}` : ''}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={propose.isPending || applyInstruction.isPending || produce.isPending}
                          onClick={() => handleFixIt(run, finding)}
                          className="rounded-full bg-[linear-gradient(90deg,#4f8bd6,#b25ad9)] px-3 py-1 text-xs font-black text-[#0B0D12] disabled:opacity-50"
                        >
                          {isFixing && propose.isPending ? 'Understanding…' : 'Fix it'}
                        </button>
                        <button
                          type="button"
                          disabled={resolve.isPending}
                          onClick={() => resolve.mutate({ projectId, runId: run.id, findingId: finding.id, resolution: 'KEEP' })}
                          className="rounded-full border border-[rgba(233,233,237,0.2)] px-3 py-1 text-xs font-bold text-[var(--noc-t2)]"
                        >
                          Keep as is
                        </button>
                        <button
                          type="button"
                          onClick={() => document.getElementById('director')?.scrollIntoView({ behavior: 'smooth' })}
                          className="rounded-full border border-[rgba(178,90,217,0.4)] px-3 py-1 text-xs font-bold text-[var(--noc-purple)]"
                        >
                          Direct myself
                        </button>
                      </div>
                    </div>
                  )}

                  {isFixing && decision && (
                    <div className="mt-2 rounded-xl border border-[rgba(178,90,217,0.3)] bg-[rgba(178,90,217,0.06)] p-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-purple)]">Here&apos;s what I understand</p>
                      <p className="mt-1 text-sm font-bold text-[var(--noc-t1)]">{decision.interpretation}</p>
                      <p className="mt-1 text-xs text-[var(--noc-t2)]">I&apos;ll change: {decision.creativeChanges.map((change) => change.field).join(', ') || 'the flagged scene'}</p>
                      <p className="text-xs text-[var(--noc-t4)]">I&apos;ll preserve: {decision.preserves.slice(0, 4).join(', ') || 'everything else'}</p>
                      <p className="text-xs text-[var(--noc-t5)]">This affects {decision.affectedSceneIds.length} scene{decision.affectedSceneIds.length === 1 ? '' : 's'}.</p>
                      <button
                        type="button"
                        disabled={applyInstruction.isPending}
                        onClick={() => applyInstruction.mutate({ projectId, instruction: finding.suggestedFixInstruction! })}
                        className="mt-2 rounded-full bg-[var(--noc-purple)] px-3 py-1 text-xs font-black text-[#0B0D12] disabled:opacity-50"
                      >
                        {applyInstruction.isPending ? 'Applying…' : 'Apply change'}
                      </button>
                      {applyInstruction.error && <p className="mt-1 text-xs text-[#e35d5d]">{applyInstruction.error.message}</p>}
                      {applied && (
                        <button
                          type="button"
                          disabled={produce.isPending}
                          onClick={() => produce.mutate({ projectId })}
                          className="mt-2 ml-2 rounded-full bg-[linear-gradient(90deg,#4f8bd6,#b25ad9)] px-3 py-1 text-xs font-black text-[#0B0D12] disabled:opacity-50"
                        >
                          {produce.isPending ? 'Starting…' : `Regenerate ${applied.affectedSceneIds.length} affected scene${applied.affectedSceneIds.length === 1 ? '' : 's'}`}
                        </button>
                      )}
                    </div>
                  )}

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
                              : 'border-[var(--noc-purple)] bg-[rgba(178,90,217,0.15)] text-[var(--noc-t1)]'
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
