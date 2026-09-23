'use client';

import { useParams } from 'next/navigation';
import { useUser } from '@/lib/auth';
import { trpc } from '@/lib/trpc';
import { CreativeShell } from '@/components/creative/CreativeShell';
import { CreativeCanvas } from '@/components/creative/CreativeCanvas';
import { CreativeBriefView } from '@/components/creative/CreativeBriefView';
import { CreativeBibleView } from '@/components/creative/CreativeBibleView';
import { NextActionCard } from '@/components/creative/NextActionCard';
import { PlanView } from '@/components/creative/PlanView';
import { PreviewPanel } from '@/components/creative/PreviewPanel';
import { ProductionPanel } from '@/components/creative/ProductionPanel';
import { ReviewPanel } from '@/components/creative/ReviewPanel';
import { DirectorPanel } from '@/components/creative/DirectorPanel';
import { ApprovalBar } from '@/components/creative/ApprovalBar';
import { OutputPanel } from '@/components/creative/OutputPanel';

export default function CreativeProjectPage() {
  const params = useParams<{ projectId: string }>();
  const { isLoaded, isSignedIn } = useUser();
  const projectId = params.projectId;

  const projectQuery = trpc.creative.project.get.useQuery(
    { projectId },
    { enabled: Boolean(isLoaded && isSignedIn && projectId) },
  );
  const utils = trpc.useUtils();

  const planQuery = trpc.creative.production.getPlan.useQuery(
    { projectId },
    { enabled: Boolean(isLoaded && isSignedIn && projectId && (projectQuery.data as any)?.hasPlan), retry: false },
  );
  const buildPlan = trpc.creative.production.plan.useMutation({
    onSuccess: async () => {
      await utils.creative.project.get.invalidate({ projectId });
      await planQuery.refetch();
    },
  });
  const approve = trpc.creative.project.updateStatus.useMutation({
    onSuccess: () => utils.creative.project.get.invalidate({ projectId }),
  });

  if (projectQuery.isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-[var(--noc-page)] text-[var(--noc-t4)]">Loading project…</div>;
  }

  if (projectQuery.error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[var(--noc-page)] text-[var(--noc-t4)]">
        <p className="font-bold text-[#e35d5d]">{projectQuery.error.message}</p>
        <a href="/create" className="text-sm font-semibold text-[var(--noc-purple)]">← Start a new project</a>
      </div>
    );
  }

  const project = projectQuery.data as any;
  if (!project) return null;
  const plan = planQuery.data as any;
  const canBuildPlan = !project.hasPlan && !buildPlan.isPending;

  return (
    <CreativeShell project={project}>
      <CreativeCanvas project={project}>
        <NextActionCard project={project} />
        <CreativeBriefView project={project} />
        <CreativeBibleView project={project} />

        {canBuildPlan ? (
          <section className="rounded-2xl border border-dashed border-[rgba(178,90,217,0.4)] bg-[rgba(178,90,217,0.06)] p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-purple)]">Plan</p>
            <p className="mt-1 text-sm text-[var(--noc-t3)]">The plan turns your brief + bible into scenes, shots and a timeline — all decided automatically.</p>
            <button
              type="button"
              disabled={buildPlan.isPending}
              onClick={() => buildPlan.mutate({ projectId })}
              className="mt-4 rounded-xl bg-[linear-gradient(90deg,#d946a8,#b25ad9)] px-5 py-3 font-black text-white disabled:opacity-50"
            >
              {buildPlan.isPending ? 'Planning…' : 'Build the production plan'}
            </button>
            {buildPlan.error && <p className="mt-2 text-sm text-[#e35d5d]">{buildPlan.error.message}</p>}
          </section>
        ) : plan ? (
          <>
            <PlanView plan={plan.plan} />
            {project.status === 'PREVIEW' && (
              <PreviewPanel
                preview={plan.preview}
                approving={approve.isPending}
                onApprove={() => approve.mutate({ projectId, status: 'APPROVED' })}
              />
            )}
            {['APPROVED', 'GENERATING', 'REVIEW'].includes(project.status) && (
              <ProductionPanel projectId={projectId} status={project.status} />
            )}
            {project.status === 'REVIEW' && (
              <>
                <ReviewPanel projectId={projectId} />
                <DirectorPanel projectId={projectId} />
              </>
            )}
            {project.currentVersionId && (
              <>
                <ApprovalBar projectId={projectId} currentVersionId={project.currentVersionId} />
                <OutputPanel projectId={projectId} currentVersionId={project.currentVersionId} />
              </>
            )}
          </>
        ) : null}
      </CreativeCanvas>
    </CreativeShell>
  );
}