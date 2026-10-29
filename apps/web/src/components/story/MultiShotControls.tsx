'use client';

/**
 * Multi-shot generation for a Story Playground scene.
 *
 * DESIGN: Option A — the card shows one playable video plus a "Multi-Shot"
 * film-strip badge, and a "View shots" expander lists the individual clips.
 * Story Playground is aimed at kids and educators, so a carousel of four small
 * players (Option B) or a modal storyboard (Option C) would add concepts for no
 * gain. One video, one badge, optional detail on demand.
 *
 * There is NO stitched concat in the backend today: `runSceneShotClipChain`
 * produces individual `StorySceneAsset` rows tagged with `shotIndex`. So the card
 * shows the first READY shot and the badge says how many exist, rather than
 * pretending a single stitched file exists.
 */

import { useState } from 'react';
import { Clapperboard, Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';

type ShotClip = {
  id: string;
  shotIndex: number | null;
  status: string;
  assetUrl: string | null;
};

export function MultiShotControls({
  projectId,
  sceneId,
}: {
  projectId: string;
  sceneId: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const { data, refetch } = trpc.story.getSceneShotClips.useQuery(
    { projectId, sceneId },
    {
      // Poll only while something is in flight; a finished scene costs nothing.
      refetchInterval: (query) => {
        const clips = (query.state.data?.clips ?? []) as ShotClip[];
        return clips.some((c) => c.status === 'GENERATING' || c.status === 'PENDING') ? 4000 : false;
      },
    },
  );

  const generate = trpc.story.generateSceneShotClips.useMutation({
    onSuccess: () => { void refetch(); },
  });

  const stitch = trpc.story.stitchSceneShots.useMutation({
    onSuccess: () => { void refetch(); },
  });

  const plan = (data?.plan ?? []) as unknown[];
  const clips = (data?.clips ?? []) as ShotClip[];
  const ready = clips.filter((c) => c.status === 'READY' && c.assetUrl);
  const rendering = clips.filter((c) => c.status === 'GENERATING' || c.status === 'PENDING');
  const total = plan.length || clips.length;
  const inFlight = rendering.length > 0 || generate.isPending;

  // Nothing to offer when the scene has no shot grid in its manifest.
  if (total === 0) return null;

  const shown = ready.length;

  return (
    <div className="mt-2 rounded-xl border border-[rgba(139,92,246,0.28)] bg-[rgba(139,92,246,0.08)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(139,92,246,0.18)] px-2 py-1 text-[10px] font-black uppercase tracking-wider text-[#a78bfa]">
          <Clapperboard size={12} /> Multi-Shot
        </span>
        <span className="text-[10px] font-bold text-[var(--noc-t5)]">
          {inFlight
            ? `Rendering shot ${Math.min(shown + 1, total)} of ${total}…`
            : `${shown} of ${total} shots ready`}
        </span>
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[rgba(233,233,237,0.10)]">
        <div
          className="h-full rounded-full bg-[#a78bfa] transition-all"
          style={{ width: `${total === 0 ? 0 : Math.round((shown / total) * 100)}%` }}
        />
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => generate.mutate({ projectId, sceneId })}
          disabled={inFlight}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[rgba(139,92,246,0.9)] px-3 py-1.5 text-xs font-black text-white disabled:opacity-50"
        >
          {inFlight ? <Loader2 className="animate-spin" size={14} /> : <Clapperboard size={14} />}
          {shown > 0 ? 'Continue shots' : 'Generate Multi-Shot'}
        </button>

        {ready.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="rounded-lg border border-[rgba(233,233,237,0.12)] px-3 py-1.5 text-xs font-black text-[var(--noc-t3)]"
          >
            {expanded ? 'Hide shots' : `View shots (${ready.length})`}
          </button>
        )}
      </div>

      {expanded && (
        <ul className="mt-2 space-y-1">
          {ready.map((clip) => (
            <li key={clip.id}>
              <a
                href={clip.assetUrl ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-bold text-[var(--noc-blue)] underline"
              >
                Shot {clip.shotIndex ?? '?'}
              </a>
            </li>
          ))}
        </ul>
      )}

      {ready.length >= 2 && ready.length === total && !inFlight && (
        <button
          type="button"
          onClick={() => stitch.mutate({ projectId, sceneId })}
          disabled={stitch.isPending}
          className="mt-2 inline-flex items-center justify-center gap-2 rounded-lg bg-[rgba(16,185,129,0.9)] px-3 py-1.5 text-xs font-black text-white disabled:opacity-50"
        >
          {stitch.isPending ? <Loader2 className="animate-spin" size={14} /> : null}
          {stitch.isPending ? 'Stitching…' : 'Stitch Video'}
        </button>
      )}

      {stitch.data?.assetUrl && (
        <p className="mt-2 text-[11px] font-bold text-[#34d399]">
          Stitched {stitch.data.clipCount} shots ·{' '}
          <a href={stitch.data.assetUrl} target="_blank" rel="noopener noreferrer" className="underline">
            open video
          </a>
        </p>
      )}

      {stitch.error && (
        <p className="mt-2 text-[11px] font-bold text-[var(--noc-magenta)]">{stitch.error.message}</p>
      )}

      {generate.error && (
        <p className="mt-2 text-[11px] font-bold text-[var(--noc-magenta)]">{generate.error.message}</p>
      )}
    </div>
  );
}
