'use client';

/** Raivstream 5.0 — SceneCard placeholder for the plan/preview surface.
 *  Full scenes arrive with Production Planning; this establishes the visual
 *  language of the canvas. */
export function SceneCard({ index, title, hint }: { index: number; title?: string; hint?: string }) {
  return (
    <article className="rounded-2xl border border-[rgba(233,233,237,0.1)] bg-[rgba(233,233,237,0.03)] p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-t6)]">Scene {String(index).padStart(2, '0')}</p>
      <h3 className="mt-1 text-lg font-black">{title ?? 'Scene'}</h3>
      <p className="mt-1 text-sm text-[var(--noc-t5)]">{hint ?? 'Planning will break this scene into shots automatically.'}</p>
    </article>
  );
}