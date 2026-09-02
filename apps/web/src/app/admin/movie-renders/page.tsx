'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { AdminSpinner, AdminStatCard } from '../AdminShell';

function formatDate(value?: string | Date | null) {
  if (!value) return 'Recently';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

function formatBytes(value?: number | null) {
  if (!value) return '0 B';
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatDuration(ms?: number | null) {
  if (!ms) return 'No completed renders';
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function formatSeconds(value?: number | null) {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${value.toFixed(3).replace(/\.?0+$/, '')}s`
    : 'n/a';
}

export default function MovieRenderDiagnosticsPage() {
  const [days, setDays] = useState(30);
  const diagnostics = trpc.admin.movieRenderDiagnostics.useQuery({ days, limit: 50 });
  const data = diagnostics.data as any;

  return (
    <div className="p-6 text-[var(--noc-t1)] md:p-8">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-black uppercase text-[var(--noc-purple)]">Story Playground</p>
          <h1 className="text-3xl font-black text-[var(--noc-t1)]">Movie Render Diagnostics</h1>
          <p className="mt-2 max-w-3xl text-sm font-semibold text-[var(--noc-t4)]">Operational view for deterministic Phase 9B.1 movie renders. This page is admin-only.</p>
        </div>
        <select
          value={days}
          onChange={(event) => setDays(Number(event.target.value))}
          className="rounded-xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] px-3 py-2 text-sm font-bold text-[var(--noc-t1)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60"
        >
          {[7, 14, 30, 60, 90].map((value) => (
            <option key={value} value={value} className="bg-[var(--noc-page)]">{value} days</option>
          ))}
        </select>
      </div>

      {diagnostics.isLoading && <AdminSpinner />}
      {diagnostics.error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 font-bold text-red-200">
          {diagnostics.error.message}
        </div>
      )}

      {data && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <AdminStatCard label="FFmpeg"              value={data.ffmpegReady ? 'Ready' : 'Missing'} />
            <AdminStatCard
              label="Movie Render Credits"
              value={data.movieRenderRateConfigured ? `${data.movieRenderCreditCost} cr` : 'Not Set'}
              sub={data.movieRenderConfigurationHealthy ? 'Configured' : 'Action required'}
              accent={data.movieRenderRateConfigured ? '#22c55e' : '#ef4444'}
            />
            <AdminStatCard label="Jobs"    value={data.totals.jobs} />
            <AdminStatCard label="Active"  value={data.totals.active} />
            <AdminStatCard label="Failed"  value={data.totals.failed} accent={data.totals.failed > 0 ? '#ef4444' : undefined} />
            <AdminStatCard label="Storage" value={formatBytes(data.totals.totalBytes)} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="overflow-hidden rounded-2xl border border-[var(--noc-hairline)] bg-[var(--noc-card)]">
              <div className="border-b border-[var(--noc-hairline)] px-5 py-4">
                <h2 className="text-xl font-black text-[var(--noc-t1)]">Recent Renders</h2>
                <p className="text-sm font-semibold text-[var(--noc-t4)]">Average completed render time: {formatDuration(data.totals.averageRenderMs)}</p>
              </div>
              <div className="divide-y divide-[var(--noc-hairline)]">
                {data.recentJobs.length === 0 ? (
                  <p className="p-5 text-sm font-bold text-[var(--noc-t4)]">No movie renders in this period.</p>
                ) : data.recentJobs.map((job: any) => (
                  <article key={job.id} className="p-5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-xs font-black uppercase text-[var(--noc-t4)]">{job.projectTitle}</p>
                        <h3 className="text-lg font-black text-[var(--noc-t1)]">{job.status} · {job.currentStage ?? 'queued'}</h3>
                        <p className="mt-1 font-mono text-xs text-[var(--noc-t4)]">{job.id} · {formatDate(job.createdAt)}</p>
                        <p className="mt-2 text-xs font-bold text-[var(--noc-t4)]">
                          Runtime expected {formatSeconds(job.expectedDurationSeconds)} · actual {formatSeconds(job.actualDurationSeconds)} · delta {formatSeconds(job.durationDeltaSeconds)} · tolerance {formatSeconds(job.durationToleranceSeconds)}
                        </p>
                        <p className="mt-1 text-xs font-bold text-[var(--noc-t5)]">Renderer {job.rendererVersion ?? 'unknown'}</p>
                        {job.errorMessage && (
                          <p className="mt-2 rounded-xl bg-red-500/10 p-3 text-sm font-bold text-red-200">{job.errorMessage}</p>
                        )}
                      </div>
                      {job.movieUrl && (
                        <a
                          href={job.movieUrl}
                          className="rounded-xl bg-[var(--noc-blue)] px-3 py-2 text-sm font-black text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60"
                        >
                          Open MP4
                        </a>
                      )}
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--noc-card)]">
                      <div className="h-full bg-emerald-400" style={{ width: `${Math.min(100, Math.max(0, job.progressPercent ?? 0))}%` }} />
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <aside className="space-y-4">
              <div className="rounded-2xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] p-5">
                <h2 className="text-xl font-black text-[var(--noc-t1)]">Status Counts</h2>
                <div className="mt-4 space-y-2">
                  {Object.entries(data.jobsByStatus).map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between rounded-xl bg-[var(--noc-card)] px-3 py-2 text-sm font-bold">
                      <span className="text-[var(--noc-t2)]">{status}</span>
                      <span className="text-[var(--noc-t1)]">{String(count)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] p-5">
                <h2 className="text-xl font-black text-[var(--noc-t1)]">Recent Events</h2>
                <div className="mt-4 max-h-[440px] space-y-2 overflow-y-auto">
                  {data.recentEvents.map((event: any) => (
                    <div key={event.id} className="rounded-xl bg-[var(--noc-card)] p-3">
                      <p className="text-sm font-black text-[var(--noc-t1)]">{event.eventName}</p>
                      <p className="text-xs font-semibold text-[var(--noc-t4)]">{event.stage ?? 'render'} · {formatDate(event.createdAt)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        </div>
      )}
    </div>
  );
}
