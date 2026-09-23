'use client';

import { trpc } from '@/lib/trpc';

type Approval = { id: string; projectId: string; versionId: string; versionNumber: number; kind: string; status: string; note: string | null };

/** Raivstream 5.0 — version-specific approval (Approve / Request changes / Reject). */
export function ApprovalBar({ projectId, currentVersionId }: { projectId: string; currentVersionId?: string | null }) {
  const approvals = trpc.creative.approval.list.useQuery({ projectId });
  const decide = trpc.creative.approval.decide.useMutation({ onSuccess: () => approvals.refetch() });

  const rows = (approvals.data ?? []) as Approval[];
  const byVersion = new Map<number, Approval[]>();
  for (const row of rows) {
    const list = byVersion.get(row.versionNumber) ?? [];
    list.push(row);
    byVersion.set(row.versionNumber, list);
  }
  const versions = [...byVersion.keys()].sort((a, b) => b - a);

  const label: Record<string, string> = { CREATIVE: 'Creative', PRODUCTION: 'Production', OUTPUT: 'Output' };
  const statusColor: Record<string, string> = {
    APPROVED: 'var(--noc-blue)',
    REJECTED: '#e35d5d',
    CHANGES_REQUESTED: '#e8a13d',
    INVALIDATED: 'var(--noc-t6)',
    PENDING: 'var(--noc-t5)',
  };

  return (
    <section id="approval" className="rounded-2xl border border-[rgba(233,233,237,0.1)] bg-[var(--noc-bar)] p-5 text-white">
      <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-t2)]">Approval</p>
      {versions.length === 0 ? (
        <p className="mt-1 text-sm text-[var(--noc-t4)]">Create a version to approve the creative.</p>
      ) : (
        <div className="mt-2 space-y-4">
          {versions.map((versionNumber) => {
            const versionApprovals = byVersion.get(versionNumber) ?? [];
            const isCurrent = versionApprovals.some((a) => a.versionId === currentVersionId) || (versions[0] === versionNumber);
            return (
              <div key={versionNumber} className={`rounded-xl p-3 ${isCurrent ? 'bg-[rgba(233,233,237,0.05)]' : 'opacity-70'}`}>
                <p className="text-xs font-black uppercase text-[var(--noc-t4)]">Version {versionNumber}{isCurrent ? ' · current' : ''}</p>
                <div className="mt-2 space-y-2">
                  {(['CREATIVE', 'PRODUCTION', 'OUTPUT'] as const).map((kind) => {
                    const approval = versionApprovals.find((a) => a.kind === kind);
                    return (
                      <div key={kind} className="flex flex-wrap items-center gap-2">
                        <span className="w-24 text-xs font-bold text-[var(--noc-t4)]">{label[kind]}</span>
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-black uppercase" style={{ background: `${statusColor[approval?.status ?? 'PENDING']}22`, color: statusColor[approval?.status ?? 'PENDING'] }}>
                          {approval?.status ?? 'PENDING'}
                        </span>
                        <div className="flex gap-1.5">
                          {(['approve', 'request_changes', 'reject'] as const).map((decision) => (
                            <button
                              key={decision}
                              type="button"
                              disabled={decide.isPending}
                              onClick={() => decide.mutate({ projectId, versionId: approval?.versionId ?? currentVersionId ?? '', kind, decision })}
                              className="rounded-full border border-[rgba(233,233,237,0.2)] px-2.5 py-0.5 text-[10px] font-bold text-[var(--noc-t2)] disabled:opacity-40"
                            >
                              {decision === 'approve' ? 'Approve' : decision === 'request_changes' ? 'Request changes' : 'Reject'}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}