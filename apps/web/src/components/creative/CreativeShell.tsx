'use client';

import { ReactNode } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { ProjectSidebar, type CreativeProject } from './ProjectSidebar';

/** Raivstream 5.0 — desktop studio shell: persistent sidebar + canvas. */
export function CreativeShell({
  project,
  children,
}: {
  project: CreativeProject;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--noc-page)] text-[var(--noc-t1)]">
      <Navbar />
      <div className="mx-auto flex max-w-[1440px] gap-6 px-4 py-6 md:px-8">
        <aside className="hidden w-64 shrink-0 lg:block">
          <ProjectSidebar project={project} />
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}