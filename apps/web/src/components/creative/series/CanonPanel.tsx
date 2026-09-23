'use client';

/** Raivstream 5.0 — Canon: what must remain true (read view; editing via the same panel). */
export function CanonPanel({ canon }: { canon?: any }) {
  if (!canon) return <p className="rounded-2xl border border-[rgba(233,233,237,0.1)] bg-[rgba(233,233,237,0.03)] p-5 text-sm text-[var(--noc-t5)]">Canon is not set yet.</p>;
  const section = (title: string, value?: unknown) => (
    <div className="rounded-xl border border-[rgba(233,233,237,0.08)] bg-[rgba(233,233,237,0.03)] p-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-t6)]">{title}</p>
      <p className="mt-1 text-sm font-semibold text-[var(--noc-t2)]">{typeof value === 'string' ? value : JSON.stringify(value ?? '')}</p>
    </div>
  );
  return (
    <section className="rounded-2xl border border-[rgba(233,233,237,0.1)] bg-[rgba(233,233,237,0.03)] p-5">
      <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-purple)]">Canon · v{canon.version ?? 1}</p>
      <p className="mt-1 text-xs text-[var(--noc-t6)]">What Raivstream must protect across every episode.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {section('World', canon.world)}
        {section('Visual language', canon.visualLanguage)}
        {section('Audio language', canon.audioLanguage)}
        {section('Story rules', (canon.storyRules ?? []).join('; '))}
      </div>
      {canon.characterCanon?.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-black uppercase text-[var(--noc-t6)]">Character canon</p>
          {canon.characterCanon.map((character: any) => (
            <div key={character.name} className="mt-1 rounded-xl border border-[rgba(233,233,237,0.08)] bg-[rgba(233,233,237,0.03)] p-3">
              <p className="text-sm font-black">{character.name}</p>
              <p className="text-xs text-[var(--noc-t5)]">{JSON.stringify(character.identity)}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}