'use client';

import { ReactNode, useState } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { ProjectSidebar, type CreativeProject } from './ProjectSidebar';

/**
 * Raivstream 5.0 — desktop studio shell.
 *
 * Three conceptual areas: PROJECT (left) · CANVAS (center) · DIRECTOR (right).
 * The Director is the primary control and persists beside the canvas on wide
 * screens; below `xl` it becomes a drawer so the canvas keeps priority.
 */
export function CreativeShell({
  project,
  director,
  children,
}: {
  project: CreativeProject;
  director?: ReactNode;
  children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[var(--noc-page)] text-[var(--noc-t1)]">
      <Navbar />
      <div className="mx-auto flex max-w-[1600px] gap-6 px-4 py-6 md:px-8">
        <aside className="hidden w-60 shrink-0 lg:block">
          <ProjectSidebar project={project} />
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
        {director && (
          <aside className="hidden w-80 shrink-0 xl:block">
            <div className="sticky top-6">{director}</div>
          </aside>
        )}
      </div>

      {director && (
        <>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="fixed bottom-5 right-5 z-40 rounded-full bg-[linear-gradient(90deg,#d946a8,#b25ad9)] px-5 py-3 text-sm font-black text-white shadow-2xl xl:hidden"
          >
            ✦ Director
          </button>
          {drawerOpen && (
            <div className="fixed inset-0 z-50 xl:hidden">
              <button type="button" aria-label="Close director" className="absolute inset-0 bg-black/60" onClick={() => setDrawerOpen(false)} />
              <div className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l border-[rgba(233,233,237,0.1)] bg-[var(--noc-page)] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-black text-[var(--noc-t1)]">Director</p>
                  <button type="button" onClick={() => setDrawerOpen(false)} className="rounded-lg border border-[rgba(233,233,237,0.16)] px-3 py-1 text-xs font-bold text-[var(--noc-t3)]">
                    Close
                  </button>
                </div>
                {director}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
