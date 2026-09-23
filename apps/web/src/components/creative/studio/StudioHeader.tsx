'use client';

/** Raivstream 5.0 — Studio header: brand name + DNA summary. */
export function StudioHeader({ studio }: { studio: { name: string; brand: { brandIdentity?: Record<string, unknown>; visualLanguage?: Record<string, unknown> } } }) {
  return (
    <div className="rounded-2xl border border-[rgba(233,233,237,0.1)] bg-[var(--noc-bar)] p-6 text-white">
      <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-purple)]">Studio</p>
      <h1 className="mt-1 text-3xl font-black">{studio.name}</h1>
      {typeof studio.brand?.brandIdentity?.tagline === 'string' && <p className="mt-2 text-sm text-[var(--noc-t3)]">{studio.brand.brandIdentity.tagline}</p>}
      {studio.brand?.visualLanguage && <p className="mt-2 text-xs text-[var(--noc-t5)]">Visual language: {JSON.stringify(studio.brand.visualLanguage)}</p>}
    </div>
  );
}