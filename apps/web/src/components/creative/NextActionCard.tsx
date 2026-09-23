'use client';

import type { CreativeProject } from './ProjectSidebar';

const NEXT_ACTION_LABEL: Record<string, string> = {
  UNDERSTAND_INTENT: 'Tell Raivstream what you’re imagining',
  BUILD_BIBLE: 'Raivstream is shaping the creative direction',
  REVIEW_PLAN: 'Review the plan',
  APPROVE_PREVIEW: 'Approve the preview',
  PRODUCE: 'Bring it to life',
  REVIEW_OUTPUT: 'Review what Raivstream made',
  DIRECT: 'Direct a change',
  APPROVE_OUTPUT: 'Approve this version',
  EXPORT: 'Export your deliverables',
};

/** Raivstream 5.0 — the single, backend-derived "what happens next?" card. */
export function NextActionCard({ project }: { project: CreativeProject }) {
  const label = project.workspace?.label;
  return (
    <div id="workspace" className="rounded-2xl bg-[linear-gradient(90deg,rgba(217,70,168,0.14),rgba(178,90,217,0.14))] p-5">
      <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-purple)]">{label ?? 'Next step'}</p>
      <p className="mt-1 text-lg font-black text-[var(--noc-t1)]">{NEXT_ACTION_LABEL[project.nextAction] ?? project.nextAction}</p>
    </div>
  );
}
