'use client';

import type { ReactNode } from 'react';
import type { CreativeProject } from './ProjectSidebar';

/** Raivstream 5.0 — the main creative canvas (desktop center column). */
export function CreativeCanvas({ project, children }: { project: CreativeProject; children?: ReactNode }) {
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[rgba(233,233,237,0.1)] bg-[var(--noc-bar)] p-5">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-t6)]">{project.projectType}</p>
          <h1 className="text-2xl font-black">{project.title}</h1>
        </div>
        <span className="rounded-full bg-[rgba(79,139,214,0.14)] px-3 py-1 text-xs font-black uppercase text-[var(--noc-blue)]">{project.status}</span>
      </header>
      {children}
    </div>
  );
}