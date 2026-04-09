'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';

const MODEL_LABELS: Record<string, string> = {
  GROK_IMAGINE: 'Grok Imagine',
  NANO_BANANA:  'Nano Banana',
  LTX2:         'LTX-2',
  WAN_25:       'Wan 2.5',
  KLING:        'Kling',
  HIGGSFIELD:   'Higgsfield',
};

const STATUS_COLORS: Record<string, string> = {
  COMPLETED:  '#22c55e',
  GENERATING: '#f59e0b',
  QUEUED:     '#a78bfa',
  FAILED:     '#ef4444',
  CANCELLED:  '#6b7280',
};

type JobStatus = 'QUEUED' | 'GENERATING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
type JobModel  = 'NANO_BANANA' | 'GROK_IMAGINE' | 'LTX2' | 'WAN_25' | 'KLING' | 'HIGGSFIELD';

export default function AdminJobsPage() {
  const [status, setStatus] = useState<JobStatus | undefined>();
  const [model,  setModel]  = useState<JobModel  | undefined>();
  const [page,   setPage]   = useState(1);

  const { data, isLoading, error } = trpc.admin.listGenerationJobs.useQuery({
    status,
    model,
    page,
    pageSize: 25,
  });

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-white text-2xl font-bold">AI Generation Jobs</h1>
        <p className="text-white/40 text-sm mt-1">All generation jobs across the platform</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={status ?? ''}
          onChange={(e) => { setStatus((e.target.value as JobStatus) || undefined); setPage(1); }}
          className="rounded-xl px-3 py-2.5 text-sm outline-none"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: 'white' }}
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
          className="rounded-xl px-3 py-2.5 text-sm outline-none"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: 'white' }}
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
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="px-6 py-8 text-red-300 text-sm">{error.message}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <th className="text-left px-5 py-3 text-white/40 font-medium">User</th>
                <th className="text-left px-5 py-3 text-white/40 font-medium">Model</th>
                <th className="text-left px-5 py-3 text-white/40 font-medium">Status</th>
                <th className="text-left px-5 py-3 text-white/40 font-medium">Prompt</th>
                <th className="text-right px-5 py-3 text-white/40 font-medium">Credits</th>
                <th className="text-right px-5 py-3 text-white/40 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {data?.jobs.map((job, i) => (
                <tr key={job.id}
                  className="border-t"
                  style={{
                    borderColor: 'rgba(255,255,255,0.05)',
                    background:  i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                  }}
                >
                  <td className="px-5 py-3">
                    <div className="text-white font-medium">@{job.user.username}</div>
                    <div className="text-xs text-white/40">{job.user.email}</div>
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-xs font-semibold px-2 py-1 rounded-full"
                      style={{ background: 'rgba(167,139,250,0.12)', color: '#a78bfa' }}>
                      {MODEL_LABELS[job.model] ?? job.model}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-xs font-semibold px-2 py-1 rounded-full"
                      style={{
                        background: `${STATUS_COLORS[job.status] ?? '#6b7280'}22`,
                        color:       STATUS_COLORS[job.status] ?? '#6b7280',
                      }}>
                      {job.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 max-w-xs">
                    <p className="text-white/70 truncate text-xs">{job.prompt}</p>
                    {job.errorMessage && (
                      <p className="text-red-400 text-xs truncate mt-0.5">{job.errorMessage}</p>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right font-mono" style={{ color: '#a78bfa' }}>
                    {job.creditsUsed}
                  </td>
                  <td className="px-5 py-3 text-right text-white/40 text-xs">
                    {new Date(job.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
              {data?.jobs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-white/30">No jobs found</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-white/40">{data.total.toLocaleString()} jobs total</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-lg disabled:opacity-30 text-white/60 hover:text-white transition-colors border"
              style={{ borderColor: 'rgba(255,255,255,0.10)' }}
            >
              ←
            </button>
            <span className="text-white/60">Page {page} of {data.totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              disabled={page === data.totalPages}
              className="px-3 py-1.5 rounded-lg disabled:opacity-30 text-white/60 hover:text-white transition-colors border"
              style={{ borderColor: 'rgba(255,255,255,0.10)' }}
            >
              →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


