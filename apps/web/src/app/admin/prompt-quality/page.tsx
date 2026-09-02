'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { AdminSpinner, AdminError } from '../AdminShell';

type PromptQualityRow = {
  id: string;
  storyTitle: string;
  projectId: string;
  sceneTitle: string;
  visualStyle: string | null;
  provider: string;
  actualProviderModel: string | null;
  requestedModel: string | null;
  enhancerProvider: string | null;
  promptEnhancementEnabled: boolean;
  promptLength: number;
  generationTimeMs: number | null;
  creditsUsed: number;
  regenerated: boolean;
  finalAssetSelected: boolean;
  activeForStorybook?: boolean;
  latestAsset?: boolean;
  favoriteAsset?: boolean;
  creativeStatus?: string;
  criticScore?: number | null;
  criticRecommendation?: string | null;
  approvedAt?: string | Date | null;
  assetVersionCount?: number;
  audienceMode: string | null;
  storyCompleted: boolean;
  status: string;
  createdAt: string | Date;
  ratingCount: number;
  averageRating: number | null;
  latestComment: string | null;
  result: {
    assetUrl: string | null;
    thumbnailUrl: string | null;
    width: number | null;
    height: number | null;
    errorMessage: string | null;
  };
  critic: {
    id: string;
    status: string;
    overallScore: number | null;
    recommendation: string | null;
    confidence: number | null;
    scores: Record<string, number | null>;
    strengths: string[] | null;
    issues: Array<{ category: string; severity: string; description: string }> | null;
    improvementPlan: Record<string, string[]> | null;
    criticProvider: string | null;
    criticModel: string | null;
    criticVersion: string | null;
    specificationVersion: number | null;
    promptVersion: number | null;
    generationVersion: number | null;
    retryAttempt: number;
    parentCriticRunId: string | null;
    resultingAssetId: string | null;
    errorMessage: string | null;
    durationMs: number | null;
  } | null;
  criticRuns: Array<{ id: string; status: string; overallScore: number | null; recommendation: string | null; retryAttempt: number; parentCriticRunId: string | null; resultingAssetId: string | null; createdAt: string | Date }>;
  criticFeedback: Array<{ id: string; rating: string; categories: unknown; hasComment: boolean; createdAt: string | Date }>;
  expanded: {
    deterministicPrompt: string | null;
    enhancedPrompt: string | null;
    negativePrompt: string | null;
    providerMetadata: unknown;
    generationResult: unknown;
  };
};

function formatMs(value: number | null) {
  if (value === null) return '-';
  return `${Math.round(value / 1000)}s`;
}

function ratingLabel(value: number | null, count: number) {
  if (!count || value === null) return 'No ratings';
  return `${value > 0 ? 'Positive' : value < 0 ? 'Negative' : 'Mixed'} (${count})`;
}

export default function AdminPromptQualityPage() {
  const [days, setDays] = useState(30);
  const [expandedRows, setExpandedRows] = useState<string[]>([]);
  const { data, isLoading, error } = trpc.admin.promptQuality.useQuery({ days, limit: 100 });

  const toggleRow = (id: string) => {
    setExpandedRows((current) =>
      current.includes(id) ? current.filter((rowId) => rowId !== id) : [...current, id],
    );
  };

  return (
    <div className="space-y-6 p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--noc-t1)]">Prompt Quality</h1>
          <p className="mt-1 text-sm text-[var(--noc-t4)]">Evaluate story prompts, provider routing, ratings, and generation quality.</p>
        </div>
        <select
          value={days}
          onChange={(event) => setDays(Number(event.target.value))}
          className="rounded-xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] px-3 py-2.5 text-sm text-[var(--noc-t1)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60"
        >
          <option value={7}   className="bg-[var(--noc-page)]">Last 7 days</option>
          <option value={30}  className="bg-[var(--noc-page)]">Last 30 days</option>
          <option value={90}  className="bg-[var(--noc-page)]">Last 90 days</option>
          <option value={180} className="bg-[var(--noc-page)]">Last 180 days</option>
        </select>
      </div>

      {isLoading && <AdminSpinner />}
      {error && <AdminError message={error.message} />}

      {data && (
        <>
          <section className="grid gap-4 md:grid-cols-3">
            {data.summaries.slice(0, 6).map((summary) => (
              <div
                key={`${summary.visualStyle}-${summary.enhancerProvider}-${summary.actualProviderModel}`}
                className="rounded-2xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] p-5"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--noc-t4)]">{summary.visualStyle}</p>
                <h2 className="mt-2 text-lg font-bold text-[var(--noc-t1)]">{summary.actualProviderModel}</h2>
                <p className="mt-1 text-xs text-[var(--noc-t4)]">{summary.enhancerProvider}</p>
                <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                  <span className="rounded-lg bg-[var(--noc-card)] p-2 text-[var(--noc-t4)]">
                    Rating<br /><b className="text-[var(--noc-t1)]">{summary.averageRating === null ? '-' : summary.averageRating.toFixed(2)}</b>
                  </span>
                  <span className="rounded-lg bg-[var(--noc-card)] p-2 text-[var(--noc-t4)]">
                    Regen<br /><b className="text-[var(--noc-t1)]">{summary.averageRegenerations.toFixed(2)}</b>
                  </span>
                  <span className="rounded-lg bg-[var(--noc-card)] p-2 text-[var(--noc-t4)]">
                    Time<br /><b className="text-[var(--noc-t1)]">{formatMs(summary.averageGenerationTimeMs)}</b>
                  </span>
                </div>
              </div>
            ))}
          </section>

          {'criticSummary' in data && data.criticSummary && (
            <section className="grid gap-4 md:grid-cols-4">
              {([
                ['Critic completed',     data.criticSummary.completed],
                ['Skipped / failed',     `${data.criticSummary.skipped} / ${data.criticSummary.failed}`],
                ['Avg score',            data.criticSummary.averageOverallScore === null ? '-' : Math.round(data.criticSummary.averageOverallScore)],
                ['Retry rate',           `${Math.round(data.criticSummary.retryRate * 100)}%`],
                ['Retry success',        `${Math.round(data.criticSummary.retrySuccessRate * 100)}%`],
                ['Avg improvement',      data.criticSummary.averageScoreImprovement === null ? '-' : data.criticSummary.averageScoreImprovement.toFixed(1)],
                ['Avg critic time',      formatMs(data.criticSummary.averageDurationMs)],
                ['Human disagreement',   `${Math.round(data.criticSummary.criticHumanDisagreementRate * 100)}%`],
              ] as [string, string | number][]).map(([title, value]) => (
                <div key={title} className="rounded-2xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--noc-t4)]">{title}</p>
                  <p className="mt-2 text-2xl font-bold text-[var(--noc-t1)]">{value}</p>
                </div>
              ))}
            </section>
          )}

          <section className="overflow-hidden rounded-2xl border border-[var(--noc-hairline)]">
            <div className="border-b border-[var(--noc-hairline)] px-5 py-4">
              <h2 className="text-lg font-bold text-[var(--noc-t1)]">Generation Records</h2>
              <p className="mt-1 text-sm text-[var(--noc-t5)]">Raw prompts are hidden until a row is expanded.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--noc-hairline)] bg-[var(--noc-card)]">
                    <th className="px-4 py-3 text-left font-medium text-[var(--noc-t4)]">Story / Scene</th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--noc-t4)]">Style</th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--noc-t4)]">Provider</th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--noc-t4)]">Prompt</th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--noc-t4)]">Perf</th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--noc-t4)]">Rating</th>
                    <th className="px-4 py-3 text-right font-medium text-[var(--noc-t4)]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.rows as PromptQualityRow[]).map((row, index) => {
                    const expanded = expandedRows.includes(row.id);
                    return (
                      <tr key={row.id} className={`border-t border-[var(--noc-hairline)] align-top ${index % 2 !== 0 ? 'bg-white/[0.01]' : ''}`}>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-[var(--noc-t2)]">{row.storyTitle}</p>
                          <p className="mt-1 text-xs text-[var(--noc-t4)]">{row.sceneTitle}</p>
                          <p className="mt-1 text-[11px] text-[var(--noc-t5)]">{row.audienceMode} / {row.storyCompleted ? 'completed' : 'in progress'}</p>
                          {(row.result.thumbnailUrl || row.result.assetUrl) ? (
                            <img src={row.result.thumbnailUrl ?? row.result.assetUrl ?? ''} alt="" className="mt-3 h-24 w-16 rounded-lg object-cover" />
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-[var(--noc-t3)]">{row.visualStyle ?? '-'}</td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-[var(--noc-t2)]">{row.provider}</p>
                          <p className="text-xs text-[var(--noc-t4)]">Actual: {row.actualProviderModel ?? '-'}</p>
                          <p className="text-xs text-[var(--noc-t4)]">Requested: {row.requestedModel ?? '-'}</p>
                        </td>
                        <td className="px-4 py-3 text-[var(--noc-t3)]">
                          <p>{row.promptEnhancementEnabled ? 'Enhanced' : 'Deterministic'}</p>
                          <p className="text-xs text-[var(--noc-t5)]">{row.promptLength.toLocaleString()} chars</p>
                        </td>
                        <td className="px-4 py-3 text-[var(--noc-t3)]">
                          <p>{formatMs(row.generationTimeMs)}</p>
                          <p className="text-xs text-[var(--noc-t5)]">{row.creditsUsed} credits</p>
                          <p className="text-xs text-[var(--noc-t5)]">{row.regenerated ? 'Regenerated' : 'First generation'} / {row.latestAsset ? 'latest' : 'history'}</p>
                          <p className="text-xs text-[var(--noc-t5)]">
                            {row.activeForStorybook ? 'active' : 'not active'} / {row.favoriteAsset ? 'favorite' : 'not favorite'} / {row.assetVersionCount ?? 0} versions
                          </p>
                          <p className="text-xs text-[var(--noc-t5)]">
                            Creative: {row.creativeStatus ?? 'DRAFT'}{row.criticScore == null ? '' : ` / ${Math.round(row.criticScore)}`}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-[var(--noc-t3)]">{ratingLabel(row.averageRating, row.ratingCount)}</p>
                          {row.latestComment && <p className="mt-1 max-w-xs truncate text-xs text-[var(--noc-t5)]">{row.latestComment}</p>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => toggleRow(row.id)}
                            className="rounded-xl px-3 py-2 text-xs font-bold text-[var(--noc-blue)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60"
                            style={{ background: 'rgba(79,139,214,0.12)' }}
                          >
                            {expanded ? 'Hide Details' : 'Expand'}
                          </button>
                          {expanded && (
                            <div className="mt-4 space-y-3 text-left">
                              {([
                                ['Original deterministic prompt', row.expanded.deterministicPrompt],
                                ['Enhanced prompt',               row.expanded.enhancedPrompt],
                                ['Negative prompt',               row.expanded.negativePrompt],
                                ['Creative critic',               JSON.stringify(row.critic, null, 2)],
                                ['Critic retry lineage',          JSON.stringify(row.criticRuns, null, 2)],
                                ['Human critic feedback',         JSON.stringify(row.criticFeedback, null, 2)],
                                ['Provider metadata',             JSON.stringify(row.expanded.providerMetadata, null, 2)],
                                ['Generation result',             JSON.stringify(row.expanded.generationResult, null, 2)],
                              ] as [string, string | null][]).map(([label, value]) => (
                                <div key={label} className="rounded-xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] p-3">
                                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--noc-t4)]">{label}</p>
                                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-[var(--noc-t3)]">{value || '-'}</pre>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {data.rows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-5 py-10 text-center text-[var(--noc-t5)]">No prompt quality records yet</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
