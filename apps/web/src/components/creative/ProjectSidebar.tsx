'use client';

export type WorkspaceStage = 'UNDERSTAND' | 'PLAN' | 'PREVIEW' | 'PRODUCE' | 'REVIEW' | 'DELIVER';

export type CreativeProject = {
  id: string;
  title: string;
  projectType: string;
  status: string;
  nextAction: string;
  hasPlan?: boolean;
  currentVersionId?: string | null;
  workspace?: { stage: WorkspaceStage; label: string; completed: WorkspaceStage[]; hasBible: boolean; hasPlan: boolean; hasVersion: boolean };
  brief?: { originalIntent: string; refinedIntent?: string; objective?: string; audience?: string; format?: string; durationSeconds?: number; tone?: string; setting?: string } | null;
  bible?: { version: number; story?: unknown; characters?: unknown[]; worlds?: unknown[]; visualLanguage?: unknown } | null;
};

const STAGE_ITEMS: Array<{ id: WorkspaceStage; label: string; anchor: string }> = [
  { id: 'UNDERSTAND', label: 'What you imagined', anchor: '#workspace' },
  { id: 'PLAN', label: 'The plan', anchor: '#plan' },
  { id: 'PREVIEW', label: 'Preview', anchor: '#preview' },
  { id: 'PRODUCE', label: 'Production', anchor: '#production' },
  { id: 'REVIEW', label: 'Review & direct', anchor: '#review' },
  { id: 'DELIVER', label: 'Deliverables', anchor: '#outputs' },
];

/**
 * Raivstream 5.0 — progressive-disclosure sidebar.
 *
 * The creator sees where they are and what comes next. Deeper controls (Brief,
 * Creative Bible, Versions) live under "Advanced details" and only appear when
 * the capability actually exists.
 */
export function ProjectSidebar({ project }: { project: CreativeProject }) {
  const stage = project.workspace?.stage ?? 'UNDERSTAND';
  const completed = project.workspace?.completed ?? [];
  const currentIndex = STAGE_ITEMS.findIndex((item) => item.id === stage);
  const advanced = [
    { label: 'Brief', anchor: '#brief', available: Boolean(project.brief) },
    { label: 'Creative Bible', anchor: '#creative-bible', available: Boolean(project.bible) },
    { label: 'Versions', anchor: '#director', available: Boolean(project.currentVersionId) },
  ].filter((item) => item.available);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[rgba(233,233,237,0.1)] bg-[rgba(233,233,237,0.03)] p-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-t6)]">Project</p>
        <h2 className="mt-1 text-lg font-black leading-tight">{project.title}</h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-[var(--noc-purple)]/15 px-2 py-0.5 text-[10px] font-black uppercase text-[var(--noc-purple)]">{project.projectType}</span>
          <span className="rounded-full bg-[rgba(233,233,237,0.08)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--noc-t5)]">{project.status}</span>
        </div>
      </div>

      <nav className="space-y-1 text-sm font-semibold">
        {STAGE_ITEMS.map((item, index) => {
          const isCurrent = item.id === stage;
          const isDone = completed.includes(item.id) || index < currentIndex;
          const reachable = isDone || isCurrent;
          return (
            <a
              key={item.id}
              href={reachable ? item.anchor : undefined}
              aria-disabled={!reachable}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 ${
                isCurrent
                  ? 'bg-[rgba(178,90,217,0.12)] text-[var(--noc-t1)]'
                  : reachable
                    ? 'text-[var(--noc-t4)] hover:bg-[rgba(233,233,237,0.05)] hover:text-[var(--noc-t1)]'
                    : 'cursor-default text-[var(--noc-t6)] opacity-60'
              }`}
            >
              <span className="w-3 text-xs">{isDone ? '✓' : isCurrent ? '●' : '○'}</span>
              {item.label}
            </a>
          );
        })}
      </nav>

      {advanced.length > 0 && (
        <details className="rounded-xl border border-[rgba(233,233,237,0.08)] bg-[rgba(233,233,237,0.02)] p-3">
          <summary className="cursor-pointer text-[10px] font-black uppercase tracking-widest text-[var(--noc-t6)]">Advanced details</summary>
          <nav className="mt-2 space-y-1 text-sm font-semibold text-[var(--noc-t5)]">
            {advanced.map((item) => (
              <a key={item.label} href={item.anchor} className="block rounded-lg px-2 py-1.5 hover:bg-[rgba(233,233,237,0.05)] hover:text-[var(--noc-t1)]">
                {item.label}
              </a>
            ))}
          </nav>
        </details>
      )}
    </div>
  );
}
