'use client';

import type { CreativeProject } from './ProjectSidebar';

const NEXT_ACTION_LABEL: Record<string, string> = {
  UNDERSTAND_INTENT: 'Help Raivstream understand your idea',
  BUILD_BIBLE: 'Shape the Creative Bible',
  REVIEW_PLAN: 'Review the production plan',
  APPROVE_PREVIEW: 'Approve the preview',
  PRODUCE: 'Produce your project',
  REVIEW_OUTPUT: 'Review the output',
  DIRECT: 'Direct a change',
  APPROVE_OUTPUT: 'Approve this version',
  EXPORT: 'Export your deliverables',
};

/** Raivstream 5.0 — the single, backend-derived "what should I do next?" card. */
export function NextActionCard({ project }: { project: CreativeProject }) {
  return (
    <div className="rounded-2xl bg-[linear-gradient(90deg,rgba(217,70,168,0.14),rgba(178,90,217,0.14))] p-5">
      <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-purple)]">Next step</p>
      <p className="mt-1 text-lg font-black text-[var(--noc-t1)]">{NEXT_ACTION_LABEL[project.nextAction] ?? project.nextAction}</p>
    </div>
  );
}