'use client';

import { useParams } from 'next/navigation';
import { useUser } from '@/lib/auth';
import { trpc } from '@/lib/trpc';
import { CreativeShell } from '@/components/creative/CreativeShell';
import { CreativeCanvas } from '@/components/creative/CreativeCanvas';
import { CreativeBriefView } from '@/components/creative/CreativeBriefView';
import { CreativeBibleView } from '@/components/creative/CreativeBibleView';
import { AdvancedDetails } from '@/components/creative/AdvancedDetails';
import { NextActionCard } from '@/components/creative/NextActionCard';
import { PlanView } from '@/components/creative/PlanView';
import { PreviewPanel } from '@/components/creative/PreviewPanel';
import { ProductionPanel } from '@/components/creative/ProductionPanel';
import { ReviewPanel } from '@/components/creative/ReviewPanel';
import { DirectorPanel } from '@/components/creative/DirectorPanel';
import { ApprovalBar } from '@/components/creative/ApprovalBar';
import { OutputPanel } from '@/components/creative/OutputPanel';

/**
 * Raivstream 5.0 — project workspace with progressive disclosure.
 *
 * A first-time storyteller sees: what Raivstream understood → the plan →
 * preview → production → review. Bible / Characters / Worlds / Versions live
 * under "Advanced details" and only appear when they exist.
 */
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
  const hasAdvanced = Boolean(project.brief || project.bible || project.currentVersionId);

  return (
    <CreativeShell project={project} director={plan ? <DirectorPanel projectId={projectId} /> : undefined}>
      <CreativeCanvas project={project}>
        <NextActionCard project={project} />

        {/* "Here's what I understand" — always visible, in the creator's words. */}
        {project.brief?.refinedIntent && (
          <div className="rounded-2xl border border-[rgba(233,233,237,0.08)] bg-[rgba(233,233,237,0.02)] p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-t6)]">Here&apos;s what I understand</p>
            <p className="mt-1 text-sm text-[var(--noc-t2)]">{project.brief.refinedIntent}</p>
          </div>
        )}

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
              <div id="production">
                <ProductionPanel projectId={projectId} status={project.status} />
              </div>
            )}
            {project.status === 'REVIEW' && (
              <ReviewPanel projectId={projectId} />
            )}
            {project.currentVersionId && (
              <>
                <ApprovalBar projectId={projectId} currentVersionId={project.currentVersionId} />
                <OutputPanel projectId={projectId} currentVersionId={project.currentVersionId} />
              </>
            )}
          </>
        ) : null}

        {hasAdvanced && (
          <AdvancedDetails title="Advanced details" hint="Everything Raivstream knows and must preserve. You never need this to create — open it only when you want deeper control.">
            <div className="space-y-4">
              {project.brief && <CreativeBriefView project={project} />}
              {project.bible && <CreativeBibleView project={project} />}
            </div>
          </AdvancedDetails>
        )}
      </CreativeCanvas>
    </CreativeShell>
  );
}
