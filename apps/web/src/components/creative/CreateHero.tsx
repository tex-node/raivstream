'use client';

/** Raivstream 5.0 — the /create hero. One line, no wizard. */
export function CreateHero() {
  return (
    <div className="mb-8 text-center">
      <h1 className="text-4xl font-extrabold tracking-tight md:text-5xl">
        What are you <span className="bg-gradient-to-r from-[var(--noc-magenta)] via-[var(--noc-purple)] to-[var(--noc-blue)] bg-clip-text text-transparent">creating?</span>
      </h1>
      <p className="mx-auto mt-3 max-w-xl text-[var(--noc-t4)]">
        Tell Raivstream what you&apos;re imagining. It figures out how to make it.
      </p>
    </div>
  );
}