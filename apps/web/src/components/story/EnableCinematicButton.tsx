'use client';

/**
 * "Enable Cinematic Multi-Shot" — on-demand manifest generation with consent.
 *
 * Product decisions this encodes:
 *  1. **On demand.** One GPT-4o call per project, and 4x the clips, so it is never
 *     automatic — the user asks for it.
 *  2. **Consent before cost.** The estimate is fetched first and the modal states
 *     scenes, shots and credits. `getShotManifestEstimate` deliberately never
 *     calls the LLM; a dry run would cost as much as the real thing.
 *  3. **Fail loudly.** A disabled structurer surfaces as
 *     "Multi-shot mode is currently unavailable" rather than a silent single-shot
 *     fallback that would look enabled and produce nothing.
 */

import { useState } from 'react';
import { Clapperboard, Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';

export function EnableCinematicButton({ projectId }: { projectId: string }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const estimate = trpc.story.getShotManifestEstimate.useQuery(
    { projectId },
    { enabled: Boolean(projectId) },
  );

  const enable = trpc.story.ensureShotManifest.useMutation({
    onSuccess: async () => {
      setOpen(false);
      setError(null);
      // Scene cards re-render and MultiShotControls appears because the manifest
      // now exists.
      await utils.story.invalidate();
    },
    onError: (err) => {
      setError(
        err.data?.code === 'PRECONDITION_FAILED'
          ? 'Multi-shot mode is currently unavailable.'
          : err.message,
      );
    },
  });

  if (estimate.isLoading || estimate.error) return null;

  // Already enabled: nothing to offer, and no reason to nag.
  if (estimate.data?.hasManifest) return null;

  const data = estimate.data;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[rgba(139,92,246,0.28)] bg-[rgba(139,92,246,0.08)] p-3">
        <div>
          <p className="text-sm font-black text-[var(--noc-t1)]">Cinematic Multi-Shot</p>
          <p className="mt-0.5 text-[11px] font-semibold text-[var(--noc-t5)]">
            Up to {data?.shotsPerScene ?? 5} continuous shots per scene for smoother motion.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setError(null); setOpen(true); }}
          className="inline-flex items-center gap-2 rounded-xl bg-[rgba(139,92,246,0.9)] px-4 py-2 text-sm font-black text-white"
        >
          <Clapperboard size={16} />
          Enable Cinematic Multi-Shot
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] p-5">
            <h2 className="text-sm font-black text-[var(--noc-t1)]">Enable Cinematic Mode?</h2>
            <p className="mt-2 text-xs font-semibold text-[var(--noc-t4)]">
              Cinematic Mode will generate{' '}
              <strong>up to {data?.totalShots ?? 0} clips</strong> across{' '}
              {data?.sceneCount ?? 0} scenes (estimated{' '}
              <strong>{(data?.estimatedCredits ?? 0).toLocaleString()} credits</strong>). You are
              charged per clip actually rendered, so the final cost may be lower. Proceed?
            </p>

            {error && (
              <p className="mt-3 text-xs font-bold text-[var(--noc-magenta)]">{error}</p>
            )}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={enable.isPending}
                onClick={() => enable.mutate({ projectId })}
                className="flex-1 rounded-lg bg-[rgba(139,92,246,0.9)] px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
              >
                {enable.isPending ? 'Building breakdown…' : 'Proceed'}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-[var(--noc-hairline)] px-4 py-2 text-sm font-bold text-[var(--noc-t3)]"
              >
                Cancel
              </button>
            </div>

            <p className="mt-3 text-[10px] text-[var(--noc-t6)]">
              This does not generate the clips yet - it only plans the shots. You choose when to render each scene.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
