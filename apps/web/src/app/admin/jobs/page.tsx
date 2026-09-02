'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { AdminSpinner, AdminError } from '../AdminShell';

const MODEL_LABELS: Record<string, string> = {
  GROK_IMAGINE: 'Grok Imagine',
  NANO_BANANA:  'Nano Banana',
  LTX2:         'LTX-2',
  WAN_25:       'Wan 2.5',
  KLING:        'Kling',
  HIGGSFIELD:   'Higgsfield',
  VEO3:         'Veo 3',
};

const STATUS_COLORS: Record<string, string> = {
  COMPLETED:  '#22c55e',
  GENERATING: '#f59e0b',
  QUEUED:     'var(--noc-purple)',
  FAILED:     '#ef4444',
  CANCELLED:  '#6b7280',
};

type JobStatus = 'QUEUED' | 'GENERATING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
type JobModel  = 'NANO_BANANA' | 'GROK_IMAGINE' | 'LTX2' | 'WAN_25' | 'KLING' | 'HIGGSFIELD' | 'VEO3';

export default function AdminJobsPage() {
  const [status, setStatus] = useState<JobStatus | undefined>();
  const [model,  setModel]  = useState<JobModel  | undefined>();
  const [page,   setPage]   = useState(1);

  const { data, isLoading, error } = trpc.admin.listGenerationJobs.useQuery({ status, model, page, pageSize: 25 });

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--noc-t1)]">AI Generation Jobs</h1>
        <p className="mt-1 text-sm text-[var(--noc-t4)]">All generation jobs across the platform</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={status ?? ''}
          onChange={(e) => { setStatus((e.target.value as JobStatus) || undefined); setPage(1); }}
          className="rounded-xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] px-3 py-2.5 text-sm text-[var(--noc-t1)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60"
        >
          <option value="">All statuses</option>
          <option value="QUEUED">Queued</option>
          <option value="GENERATING">Generating</option>
          <option value="COMPLETED">Completed</option>
          <option value="FAILED">Failed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>

        <select
          value={model ?? ''}
          onChange={(e) => { setModel((e.target.value as JobModel) || undefined); setPage(1); }}
          className="rounded-xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] px-3 py-2.5 text-sm text-[var(--noc-t1)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60"
        >
          <option value="">All models</option>
          <option value="GROK_IMAGINE">Grok Imagine</option>
          <option value="NANO_BANANA">Nano Banana</option>
          <option value="LTX2">LTX-2</option>
          <option value="WAN_25">Wan 2.5</option>
          <option value="KLING">Kling</option>
          <option value="HIGGSFIELD">Higgsfield</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-[var(--noc-hairline)]">
        {isLoading ? (
          <AdminSpinner />
        ) : error ? (
          <div className="px-6 py-8"><AdminError message={error.message} /></div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--noc-hairline)] bg-[var(--noc-card)]">
                <th className="px-5 py-3 text-left font-medium text-[var(--noc-t4)]">User</th>
                <th className="px-5 py-3 text-left font-medium text-[var(--noc-t4)]">Model</th>
                <th className="px-5 py-3 text-left font-medium text-[var(--noc-t4)]">Status</th>
                <th className="px-5 py-3 text-left font-medium text-[var(--noc-t4)]">Prompt</th>
                <th className="px-5 py-3 text-right font-medium text-[var(--noc-t4)]">Credits</th>
                <th className="px-5 py-3 text-right font-medium text-[var(--noc-t4)]">Created</th>
              </tr>
            </thead>
            <tbody>
              {data?.jobs.map((job, i) => {
                const statusColor = STATUS_COLORS[job.status] ?? '#6b7280';
                return (
                  <tr key={job.id} className={`border-t border-[var(--noc-hairline)] ${i % 2 !== 0 ? 'bg-white/[0.01]' : ''}`}>
                    <td className="px-5 py-3">
                      <div className="font-medium text-[var(--noc-t1)]">@{job.user.username}</div>
                      <div className="text-xs text-[var(--noc-t4)]">{job.user.email}</div>
                    </td>
                    <td className="px-5 py-3">
                      <span className="rounded-full px-2 py-1 text-xs font-semibold" style={{ background: 'rgba(178,90,217,0.12)', color: 'var(--noc-purple)' }}>
                        {MODEL_LABELS[job.model] ?? job.model}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="rounded-full px-2 py-1 text-xs font-semibold" style={{ background: `${statusColor}22`, color: statusColor }}>
                        {job.status}
                      </span>
                    </td>
                    <td className="max-w-xs px-5 py-3">
                      <p className="truncate text-xs text-[var(--noc-t3)]">{job.prompt}</p>
                      {job.errorMessage && <p className="mt-0.5 truncate text-xs text-red-400">{job.errorMessage}</p>}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-[var(--noc-purple)]">{job.creditsUsed}</td>
                    <td className="px-5 py-3 text-right text-xs text-[var(--noc-t4)]">
                      {new Date(job.createdAt).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
              {data?.jobs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-[var(--noc-t5)]">No jobs found</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--noc-t4)]">{data.total.toLocaleString()} jobs total</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-lg border border-[var(--noc-hairline)] px-3 py-1.5 text-[var(--noc-t3)] transition-colors hover:text-[var(--noc-t1)] disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60"
            >
              ←
            </button>
            <span className="text-[var(--noc-t3)]">Page {page} of {data.totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              disabled={page === data.totalPages}
              className="rounded-lg border border-[var(--noc-hairline)] px-3 py-1.5 text-[var(--noc-t3)] transition-colors hover:text-[var(--noc-t1)] disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noc-blue)]/60"
            >
              →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
