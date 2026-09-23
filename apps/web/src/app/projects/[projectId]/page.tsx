'use client';

import { useParams } from 'next/navigation';
import { useUser } from '@/lib/auth';
import { trpc } from '@/lib/trpc';
import { CreativeShell } from '@/components/creative/CreativeShell';
import { CreativeCanvas } from '@/components/creative/CreativeCanvas';
import { CreativeBriefView } from '@/components/creative/CreativeBriefView';
import { CreativeBibleView } from '@/components/creative/CreativeBibleView';
import { NextActionCard } from '@/components/creative/NextActionCard';
import { SceneCard } from '@/components/creative/SceneCard';

export default function CreativeProjectPage() {
  const params = useParams<{ projectId: string }>();
  const { isLoaded, isSignedIn } = useUser();
  const projectId = params.projectId;

  const projectQuery = trpc.creative.project.get.useQuery(
    { projectId },
    { enabled: Boolean(isLoaded && isSignedIn && projectId) },
  );

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

  return (
    <CreativeShell project={project}>
      <CreativeCanvas project={project}>
        <NextActionCard project={project} />
        <CreativeBriefView project={project} />
        <CreativeBibleView project={project} />
        <section id="plan" className="space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-t6)]">Plan</p>
          <div className="grid gap-3 md:grid-cols-3">
            <SceneCard index={1} />
            <SceneCard index={2} />
            <SceneCard index={3} />
          </div>
          <p className="text-sm text-[var(--noc-t6)]">Shot breakdown, timing, narration and visuals are decided automatically during planning.</p>
        </section>
      </CreativeCanvas>
    </CreativeShell>
  );
}