'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import {
  critiqueLine, dimensionLabel, expandedCritique, visibleCritique, type CritiquePayload,
} from '@/lib/chapterCritique';

/**
 * The chapter critique line (2026-11-17).
 *
 * Sits beside the chapter and the rewrite chips — where a creator reads the text AND can act on it, which is the
 * transform panel's lesson: feedback that arrives in a different surface is feedback that gets ignored.
 *
 * On load for the lowest dimension (the scorer is deterministic and free), behind an expand for all three. The
 * copy is an observation, never a verdict, and a chapter that scores well shows nothing at all.
 */
export function ChapterCritique({ projectId }: { projectId: string }) {
  const [expanded, setExpanded] = useState(false);
  const query = trpc.story.chapterCritique.useQuery({ projectId }, { retry: false, refetchOnWindowFocus: false });
  const payload = (query.data?.critique ?? null) as CritiquePayload | null;
  const shown = visibleCritique(payload);
  const all = expandedCritique(payload);

  if (!shown) return null; // A good chapter says nothing rather than three high numbers.

  return (
    <div className="mt-3 rounded-xl border border-[rgba(233,233,237,0.08)] bg-[rgba(233,233,237,0.02)] p-3 text-xs">
      <p className="text-[var(--noc-t3)]">{critiqueLine(shown)}</p>
      {all.length > 0 && (
        <button type="button" onClick={() => setExpanded((value) => !value)} className="mt-1 underline opacity-60">
          {expanded ? 'Hide all three' : 'See all three'}
        </button>
      )}
      {expanded && (
        <ul className="mt-2 space-y-1">
          {all.map((dimension) => (
            <li key={dimension.key} className="opacity-70">
              <span className="font-medium">{dimensionLabel(dimension.key)}</span> — {dimension.lowScoreMeaning}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
