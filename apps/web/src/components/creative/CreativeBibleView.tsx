'use client';

import type { CreativeProject } from './ProjectSidebar';
import { bibleContentString } from './labels';

function Section({ title, content }: { title: string; content?: unknown }) {
  const isEmpty = content === undefined || content === null || (Array.isArray(content) && content.length === 0);
  const display = isEmpty ? null : (bibleContentString(content) ?? null);
  return (
    <div className="rounded-xl border border-[rgba(233,233,237,0.08)] bg-[rgba(233,233,237,0.03)] p-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-t6)]">{title}</p>
      {isEmpty || display === null ? (
        <p className="mt-1 text-sm text-[var(--noc-t6)]">To be defined.</p>
      ) : (
        <p className="mt-1 text-sm font-semibold text-[var(--noc-t2)]">{display}</p>
      )}
    </div>
  );
}

/** Raivstream 5.0 — the Creative Bible: what Raivstream knows and must preserve. */
export function CreativeBibleView({ project }: { project: CreativeProject }) {
  const bible = project.bible;
  if (!bible) return <section className="rounded-2xl border border-[rgba(233,233,237,0.1)] bg-[rgba(233,233,237,0.03)] p-5 text-[var(--noc-t4)]">No bible yet.</section>;
  return (
    <section id="creative-bible" className="rounded-2xl border border-[rgba(233,233,237,0.1)] bg-[rgba(233,233,237,0.03)] p-5">
      <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-purple)]">Creative Bible — what I know and must preserve</p>
      <p className="mt-1 text-xs text-[var(--noc-t6)]">Version {bible.version}. Assumptions are proposed, not canon; your approval makes them canon.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Section title="Story" content={bible.story} />
        <Section title="Characters" content={bible.characters} />
        <Section title="Worlds" content={bible.worlds} />
        <Section title="Visual language" content={bible.visualLanguage} />
      </div>
    </section>
  );
}