'use client';

import Link from 'next/link';
import { trpc } from '@/lib/trpc';

/**
 * Phase 3.5 — /watch.
 *
 * Attribution is read from the endpoint's join (CreatorProfile → User → Video) on
 * every render. Nothing here stores a name: a copied name would defeat the rename
 * behaviour the service test pins down.
 */
export default function WatchPage() {
  const { data, isLoading } = trpc.films.approved.useQuery();
  const films = (data ?? []) as Array<{
    id: string;
    video: { id: string; title: string; thumbnailUrl?: string | null; duration?: number | null };
    submittedBy: {
      username: string;
      displayName?: string | null;
      creatorProfile?: { displayName?: string | null } | null;
    };
  }>;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 text-[var(--noc-t1)]">
      <h1 className="text-3xl font-black">Watch</h1>
      <p className="mt-1 text-sm opacity-70">Films accepted by the review queue.</p>

      {isLoading && <p className="mt-6 text-sm opacity-70">Loading…</p>}

      <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {films.map((film) => (
          <li key={film.id} className="rounded-2xl border border-white/10 bg-white/5 p-3">
            {film.video.thumbnailUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={film.video.thumbnailUrl} alt="" className="mb-3 aspect-[9/16] w-full rounded-xl object-cover" />
            )}
            <p className="text-sm font-bold">{film.video.title}</p>
            <p className="mt-1 text-xs opacity-70">
              {/* Derived, not copied: the profile wins, the account name is the fallback. */}
              by{' '}
              <Link href={`/filmmakers/${film.submittedBy.username}`} className="underline">
                {film.submittedBy.creatorProfile?.displayName ?? film.submittedBy.displayName ?? film.submittedBy.username}
              </Link>
            </p>
          </li>
        ))}
      </ul>

      {!isLoading && films.length === 0 && (
        <p className="mt-6 text-sm opacity-70">No accepted films yet.</p>
      )}
    </main>
  );
}
