'use client';

import type { ReactNode } from 'react';

/**
 * Raivstream 5.0 — advanced detail disclosure.
 *
 * Deeper control (Brief, Creative Bible, Versions) is available but never
 * required. The capability exists before the interface asks the creator to
 * understand it.
 */
export function AdvancedDetails({ title, hint, children, defaultOpen = false }: { title: string; hint?: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="rounded-2xl border border-[rgba(233,233,237,0.08)] bg-[rgba(233,233,237,0.02)] p-4">
      <summary className="cursor-pointer text-[10px] font-black uppercase tracking-widest text-[var(--noc-t6)]">{title}</summary>
      {hint && <p className="mt-1 text-xs text-[var(--noc-t5)]">{hint}</p>}
      <div className="mt-3">{children}</div>
    </details>
  );
}
