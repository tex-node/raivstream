'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';

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
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(3).replace(/\.?0+$/, '')}s` : 'n/a';
}

export default function MovieRenderDiagnosticsPage() {
  const [days, setDays] = useState(30);
  const diagnostics = trpc.admin.movieRenderDiagnostics.useQuery({ days, limit: 50 });
  const data = diagnostics.data as any;

  return (
    <div className="min-h-screen p-6 text-white md:p-8">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-black uppercase text-violet-300">Story Playground</p>
          <h1 className="text-3xl font-black">Movie Render Diagnostics</h1>
          <p className="mt-2 max-w-3xl text-sm font-semibold text-white/50">Operational view for deterministic Phase 9B.1 movie renders. This page is admin-only.</p>
        </div>
        <select value={days} onChange={(event) => setDays(Number(event.target.value))} className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm font-bold text-white">
          {[7, 14, 30, 60, 90].map((value) => <option key={value} value={value} className="bg-[#080f1f]">{value} days</option>)}
        </select>
      </div>

      {diagnostics.isLoading && <div className="rounded-2xl border border-white/10 bg-white/5 p-6 font-bold text-white/60">Loading render diagnostics...</div>}
      {diagnostics.error && <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 font-bold text-red-200">{diagnostics.error.message}</div>}

      {data && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5"><p className="text-xs font-black uppercase text-white/40">FFmpeg</p><p className="mt-2 text-3xl font-black">{data.ffmpegReady ? 'Ready' : 'Missing'}</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5"><p className="text-xs font-black uppercase text-white/40">Credit Rate</p><p className={`mt-2 text-3xl font-black ${data.creditRateConfigured ? 'text-green-400' : 'text-red-400'}`}>{data.creditRateConfigured ? `${data.creditRateCredits} cr` : 'Not Set'}</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5"><p className="text-xs font-black uppercase text-white/40">Jobs</p><p className="mt-2 text-3xl font-black">{data.totals.jobs}</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5"><p className="text-xs font-black uppercase text-white/40">Active</p><p className="mt-2 text-3xl font-black">{data.totals.active}</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5"><p className="text-xs font-black uppercase text-white/40">Failed</p><p className="mt-2 text-3xl font-black">{data.totals.failed}</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5"><p className="text-xs font-black uppercase text-white/40">Storage</p><p className="mt-2 text-3xl font-black">{formatBytes(data.totals.totalBytes)}</p></div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
              <div className="border-b border-white/10 px-5 py-4">
                <h2 className="text-xl font-black">Recent Renders</h2>
                <p className="text-sm font-semibold text-white/40">Average completed render time: {formatDuration(data.totals.averageRenderMs)}</p>
              </div>
              <div className="divide-y divide-white/10">
                {data.recentJobs.length === 0 ? <p className="p-5 text-sm font-bold text-white/50">No movie renders in this period.</p> : data.recentJobs.map((job: any) => (
                  <article key={job.id} className="p-5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-xs font-black uppercase text-white/40">{job.projectTitle}</p>
                        <h3 className="text-lg font-black">{job.status} · {job.currentStage ?? 'queued'}</h3>
                        <p className="mt-1 text-xs font-semibold text-white/40">{job.id} · {formatDate(job.createdAt)}</p>
                        <p className="mt-2 text-xs font-bold text-white/45">
                          Runtime expected {formatSeconds(job.expectedDurationSeconds)} · actual {formatSeconds(job.actualDurationSeconds)} · delta {formatSeconds(job.durationDeltaSeconds)} · tolerance {formatSeconds(job.durationToleranceSeconds)}
                        </p>
                        <p className="mt-1 text-xs font-bold text-white/35">Renderer {job.rendererVersion ?? 'unknown'}</p>
                        {job.errorMessage && <p className="mt-2 rounded-xl bg-red-500/10 p-3 text-sm font-bold text-red-200">{job.errorMessage}</p>}
                      </div>
                      {job.movieUrl && <a href={job.movieUrl} className="rounded-xl bg-violet-500 px-3 py-2 text-sm font-black text-white">Open MP4</a>}
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full bg-emerald-400" style={{ width: `${Math.min(100, Math.max(0, job.progressPercent ?? 0))}%` }} />
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <aside className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <h2 className="text-xl font-black">Status Counts</h2>
                <div className="mt-4 space-y-2">
                  {Object.entries(data.jobsByStatus).map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-sm font-bold">
                      <span>{status}</span>
                      <span>{String(count)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <h2 className="text-xl font-black">Recent Events</h2>
                <div className="mt-4 max-h-[440px] space-y-2 overflow-y-auto">
                  {data.recentEvents.map((event: any) => (
                    <div key={event.id} className="rounded-xl bg-white/5 p-3">
                      <p className="text-sm font-black">{event.eventName}</p>
                      <p className="text-xs font-semibold text-white/40">{event.stage ?? 'render'} · {formatDate(event.createdAt)}</p>
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
