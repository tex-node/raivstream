'use client';

import { trpc } from '@/lib/trpc';
import { AdminSpinner, AdminError } from '../AdminShell';

type RuntimeHistogramItem = { label: string; count: number };
type TransitionUsageItem  = { transition: string; count: number };
type CameraUsageItem      = { cameraMovement: string; count: number };

function formatSeconds(value: number) {
  const rounded = Math.round(value);
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  return minutes ? `${minutes}:${String(seconds).padStart(2, '0')}` : `${seconds}s`;
}

function label(value?: string | null) {
  return value
    ? value.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
    : 'None';
}

export default function AdminSequencePage() {
  const { data, isLoading, error } = trpc.admin.sequenceAnalytics.useQuery({ days: 30 });

  return (
    <div className="p-6 text-[var(--noc-t1)] md:p-8">
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-[var(--noc-purple)]">Story Playground</p>
        <h1 className="mt-2 text-3xl font-black text-[var(--noc-t1)]">Sequence Insights</h1>
        <p className="mt-2 max-w-3xl text-sm font-medium text-[var(--noc-t4)]">
          Aggregate timeline planning metrics. Story text, notes, prompts, providers, and private media metadata are not shown here.
        </p>
      </div>

      {isLoading && <AdminSpinner />}
      {error && <AdminError message={error.message} />}

      {data && (
        <div className="space-y-6">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              ['Sequences',       data.sequenceCount],
              ['Projects',        data.projectsWithSequences],
              ['Avg Runtime',     formatSeconds(data.averageRuntime)],
              ['Avg Active Shots', data.averageActiveShotCount.toFixed(1)],
              ['Avg Shot Duration', formatSeconds(data.averageShotDuration)],
              ['Timeline Entries', data.totalTimelineEntries],
              ['Versions',        data.versionCount],
              ['Completion Rate', `${Math.round(data.sequenceCompletionRate * 100)}%`],
            ].map(([labelText, value]) => (
              <div key={labelText} className="rounded-2xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] p-5">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--noc-t4)]">{labelText}</p>
                <p className="mt-3 text-3xl font-black text-[var(--noc-t1)]">{value}</p>
              </div>
            ))}
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] p-5">
              <h2 className="text-lg font-black text-[var(--noc-t1)]">Runtime Histogram</h2>
              <div className="mt-4 space-y-3">
                {data.runtimeHistogram.map((item: RuntimeHistogramItem) => (
                  <div key={item.label}>
                    <div className="flex justify-between text-sm font-bold text-[var(--noc-t4)]">
                      <span>{item.label}</span>
                      <span>{item.count}</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-white/10">
                      <div
                        className="h-2 rounded-full bg-[var(--noc-blue)]"
                        style={{ width: `${data.sequenceCount ? (item.count / data.sequenceCount) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] p-5">
              <h2 className="text-lg font-black text-[var(--noc-t1)]">Transition Usage</h2>
              <div className="mt-4 space-y-2">
                {data.transitionUsage.length === 0 ? (
                  <p className="text-sm font-bold text-[var(--noc-t5)]">No transition data yet.</p>
                ) : data.transitionUsage.map((item: TransitionUsageItem) => (
                  <div key={item.transition} className="flex justify-between rounded-xl bg-white/[0.05] px-3 py-2 text-sm font-bold">
                    <span className="text-[var(--noc-t2)]">{label(item.transition)}</span>
                    <span className="text-[var(--noc-t1)]">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] p-5">
              <h2 className="text-lg font-black text-[var(--noc-t1)]">Camera Usage</h2>
              <div className="mt-4 space-y-2">
                {data.cameraUsage.length === 0 ? (
                  <p className="text-sm font-bold text-[var(--noc-t5)]">No camera data yet.</p>
                ) : data.cameraUsage.map((item: CameraUsageItem) => (
                  <div key={item.cameraMovement} className="flex justify-between rounded-xl bg-white/[0.05] px-3 py-2 text-sm font-bold">
                    <span className="text-[var(--noc-t2)]">{label(item.cameraMovement)}</span>
                    <span className="text-[var(--noc-t1)]">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
