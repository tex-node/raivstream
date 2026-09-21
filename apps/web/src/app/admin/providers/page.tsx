'use client';

import { trpc } from '@/lib/trpc';
import { AdminSpinner, AdminError, AdminStatCard } from '../AdminShell';

const KIND_LABEL: Record<string, string> = {
  image: 'Image',
  video: 'Video',
  ugc_video: 'Talking video',
};

export default function AdminProvidersPage() {
  const { data, isLoading, error } = trpc.providers.health.useQuery();

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--noc-t1)]">Provider Health</h1>
        <p className="mt-1 text-sm text-[var(--noc-t4)]">
          Configured media providers and their capabilities. Read-only snapshot — no secrets are exposed.
        </p>
      </div>

      {isLoading ? (
        <AdminSpinner />
      ) : error ? (
        <AdminError message={error.message} />
      ) : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <AdminStatCard label="Providers" value={data.summary.providers} />
            <AdminStatCard label="Configured" value={data.summary.configured} accent="#22c55e" />
            <AdminStatCard label="Capabilities configured" value={data.summary.capabilitiesConfigured} />
            <AdminStatCard label="Capabilities live" value={data.summary.capabilitiesEnabled} accent="var(--noc-purple)" />
          </div>

          <div className="space-y-4">
            {data.providers.map((provider) => (
              <div key={provider.id} className="overflow-hidden rounded-2xl border border-[var(--noc-hairline)]">
                <div className="flex items-center justify-between border-b border-[var(--noc-hairline)] bg-[var(--noc-card)] px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold text-[var(--noc-t1)]">{provider.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${provider.configured ? 'bg-green-500/15 text-green-400' : 'bg-[var(--noc-hairline)] text-[var(--noc-t4)]'}`}>
                      {provider.configured ? 'configured' : 'not configured'}
                    </span>
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--noc-hairline)] text-left text-[var(--noc-t4)]">
                      <th className="px-5 py-2.5 font-medium">Capability</th>
                      <th className="px-5 py-2.5 font-medium">Model</th>
                      <th className="px-5 py-2.5 font-medium">Endpoint</th>
                      <th className="px-5 py-2.5 text-right font-medium">State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {provider.capabilities.map((cap) => (
                      <tr key={cap.model} className="border-t border-[var(--noc-hairline)]">
                        <td className="px-5 py-3 text-[var(--noc-t3)]">{KIND_LABEL[cap.kind] ?? cap.kind}</td>
                        <td className="px-5 py-3 font-medium text-[var(--noc-t1)]">{cap.model}</td>
                        <td className="max-w-xs truncate px-5 py-3 font-mono text-xs text-[var(--noc-t4)]">{cap.endpoint ?? '—'}</td>
                        <td className="px-5 py-3 text-right">
                          {cap.enabled ? (
                            <span className="rounded-full bg-green-500/15 px-2 py-1 text-xs font-semibold text-green-400">live</span>
                          ) : cap.configured ? (
                            <span className="rounded-full bg-amber-500/15 px-2 py-1 text-xs font-semibold text-amber-400">disabled</span>
                          ) : (
                            <span className="rounded-full bg-[var(--noc-hairline)] px-2 py-1 text-xs font-semibold text-[var(--noc-t4)]">missing</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {provider.capabilities.some((c) => !c.enabled && c.reason) && (
                  <div className="border-t border-[var(--noc-hairline)] px-5 py-2 text-xs text-[var(--noc-t5)]">
                    {provider.capabilities.filter((c) => !c.enabled && c.reason).map((c) => (
                      <div key={c.model}>{c.model}: {c.reason}</div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
