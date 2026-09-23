'use client';

import type { CreativeProject } from './ProjectSidebar';

/** Raivstream 5.0 — the Brief: what the creator wants. The original words are always preserved. */
export function CreativeBriefView({ project }: { project: CreativeProject }) {
  const brief = project.brief;
  if (!brief) return <section className="rounded-2xl border border-[rgba(233,233,237,0.1)] bg-[rgba(233,233,237,0.03)] p-5 text-[var(--noc-t4)]">No brief yet.</section>;

  const fields: Array<[string, string | undefined]> = [
    ['Objective', brief.objective],
    ['Audience', brief.audience],
    ['Format', brief.format],
    ['Duration', brief.durationSeconds ? `${brief.durationSeconds}s` : undefined],
    ['Tone', brief.tone],
    ['Setting', brief.setting],
  ].filter(([, value]) => Boolean(value)) as Array<[string, string]>;

  return (
    <section id="brief" className="rounded-2xl border border-[rgba(233,233,237,0.1)] bg-[rgba(233,233,237,0.03)] p-5">
      <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-purple)]">Brief — what you want</p>
      <blockquote className="mt-2 border-l-2 border-[var(--noc-purple)] pl-3 text-lg italic text-[var(--noc-t1)]">{brief.originalIntent}</blockquote>
      {brief.refinedIntent && <p className="mt-3 text-sm font-semibold text-[var(--noc-t3)]">{brief.refinedIntent}</p>}
      {fields.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {fields.map(([label, value]) => (
            <span key={label} className="rounded-full bg-[rgba(79,139,214,0.12)] px-2.5 py-1 text-xs font-semibold text-[var(--noc-blue)]">
              {label}: {value}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}