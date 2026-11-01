'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { trpc } from '@/lib/trpc';

/**
 * Phase 3.5 — /filmmakers/[username].
 *
 * Profile and accepted films. Attribution comes from the profile at request time, so
 * a rename propagates without touching a video row.
 *
 * NO EARNINGS PANEL: there is no revenue period, no pool and no ledger row yet. A
 * figure here would be invented, which is why the payout decision forbids one.
 */
export default function FilmmakerPage() {
  const params = useParams<{ username: string }>();
  const username = typeof params?.username === 'string' ? params.username : '';

  const { data, isLoading } = trpc.films.filmmaker.useQuery({ username }, { enabled: Boolean(username) });
  const filmmaker = data as
    | {
        displayName: string;
        bio?: string | null;
        avatarUrl?: string | null;
        isVerified?: boolean;
        username: string;
        films: Array<{ id: string; video: { id: string; title: string; thumbnailUrl?: string | null } }>;
      }
    | null
    | undefined;

  if (isLoading) return <main className="mx-auto max-w-3xl px-4 py-10 text-sm opacity-70">Loading…</main>;
  if (!filmmaker) return <main className="mx-auto max-w-3xl px-4 py-10 text-sm opacity-70">Filmmaker not found.</main>;

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 text-[var(--noc-t1)]">
      <header className="flex items-center gap-4">
        {filmmaker.avatarUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={filmmaker.avatarUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
        )}
        <div>
          <h1 className="text-2xl font-black">
            {filmmaker.displayName} {filmmaker.isVerified && <span title="Verified filmmaker">✓</span>}
          </h1>
          <p className="text-sm opacity-70">@{filmmaker.username}</p>
        </div>
      </header>

      {filmmaker.bio && <p className="mt-4 text-sm whitespace-pre-line">{filmmaker.bio}</p>}

      <h2 className="mt-8 text-xl font-bold">Films</h2>
      <ul className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {filmmaker.films.map((film) => (
          <li key={film.id} className="rounded-2xl border border-white/10 bg-white/5 p-3">
            {film.video.thumbnailUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={film.video.thumbnailUrl} alt="" className="mb-2 aspect-[9/16] w-full rounded-xl object-cover" />
            )}
            <p className="text-sm font-semibold">{film.video.title}</p>
          </li>
        ))}
      </ul>
      {filmmaker.films.length === 0 && <p className="mt-3 text-sm opacity-70">No accepted films yet.</p>}

      <p className="mt-10 text-xs opacity-50">
        <Link href="/watch" className="underline">Back to Watch</Link>
      </p>
    </main>
  );
}
