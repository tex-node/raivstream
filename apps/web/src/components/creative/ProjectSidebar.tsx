'use client';

export type CreativeProject = {
  id: string;
  title: string;
  projectType: string;
  status: string;
  nextAction: string;
  currentVersionId?: string | null;
  brief?: { originalIntent: string; refinedIntent?: string; objective?: string; audience?: string; format?: string; durationSeconds?: number; tone?: string; setting?: string } | null;
  bible?: { version: number; story?: unknown; characters?: unknown[]; worlds?: unknown[]; visualLanguage?: unknown } | null;
};

export function ProjectSidebar({ project }: { project: CreativeProject }) {
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
      <nav className="space-y-1 text-sm font-semibold text-[var(--noc-t4)]">
        {['Brief', 'Creative Bible', 'Plan', 'Preview', 'Review'].map((item) => (
          <a
            key={item}
            href={`#${item.toLowerCase().replace(/\s+/g, '-')}`}
            className="block rounded-lg px-3 py-2 hover:bg-[rgba(233,233,237,0.05)] hover:text-[var(--noc-t1)]"
          >
            {item}
          </a>
        ))}
      </nav>
    </div>
  );
}