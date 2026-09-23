'use client';

import { useUser } from '@/lib/auth';
import { trpc } from '@/lib/trpc';

type SceneStatus = {
  sceneId: string;
  title: string;
  status: 'PENDING' | 'GENERATING' | 'READY' | 'FAILED';
  assets: Array<{ id: string; kind: string; status: string; assetUrl: string | null; thumbnailUrl: string | null; errorMessage: string | null }>;
};

type ProductionStatus = {
  status: string;
  expected: number;
  ready: number;
  failed: number;
  generating: number;
  progressPercent: number;
  scenes: SceneStatus[];
};

/**
 * Raivstream 5.0 — Slice 3 production surface.
 * The creator sees: Produce → "Creating your scenes…" → results + retry.
 * No providers, models, prompts, JSON or generation-job terminology.
 */
export function ProductionPanel({ projectId, status }: { projectId: string; status: string }) {
  const { isLoaded, isSignedIn } = useUser();
  const utils = trpc.useUtils();
  const produce = trpc.creative.production.produce.useMutation({
    onSuccess: () => utils.creative.project.get.invalidate({ projectId }),
  });

  const isProducing = status === 'GENERATING';
  const isReview = status === 'REVIEW';
  const readyToProduce = status === 'APPROVED';

  const statusQuery = trpc.creative.production.productionStatus.useQuery(
    { projectId },
    {
      enabled: Boolean(isLoaded && isSignedIn && (isProducing || isReview)),
      refetchInterval: (query) => {
        const data = query.state.data as ProductionStatus | undefined;
        const stillBusy = data?.status === 'GENERATING' || (data?.generating ?? 0) > 0;
        return stillBusy ? 4000 : false;
      },
      retry: false,
    },
  );

  const data = statusQuery.data as ProductionStatus | undefined;

  if (readyToProduce) {
    return (
      <section className="rounded-2xl border border-dashed border-[rgba(79,139,214,0.4)] bg-[rgba(79,139,214,0.06)] p-5">
        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-blue)]">Production</p>
        <p className="mt-1 text-sm text-[var(--noc-t3)]">Everything is planned and approved. Ready to bring it to life.</p>
        <button
          type="button"
          disabled={produce.isPending}
          onClick={() => produce.mutate({ projectId })}
          className="mt-4 rounded-xl bg-[linear-gradient(90deg,#4f8bd6,#b25ad9)] px-6 py-3 font-black text-[#0B0D12] disabled:opacity-50"
        >
          {produce.isPending ? 'Starting…' : 'Produce'}
        </button>
        {produce.error && <p className="mt-2 text-sm text-[#e35d5d]">{produce.error.message}</p>}
      </section>
    );
  }

  if (!isProducing && !isReview) return null;

  if (isProducing && !data) {
    return (
      <section className="rounded-2xl border border-[rgba(233,233,237,0.1)] bg-[var(--noc-bar)] p-5 text-white">
        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-t2)]">Production</p>
        <p className="mt-1 text-lg font-black">Creating your scenes…</p>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[rgba(233,233,237,0.12)]">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-[var(--noc-gradient)]" />
        </div>
      </section>
    );
  }

  const scenes = data?.scenes ?? [];
  const failedScenes = scenes.filter((scene) => scene.status === 'FAILED');
  const complete = isReview && failedScenes.length === 0;

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-[rgba(233,233,237,0.1)] bg-[var(--noc-bar)] p-5 text-white">
        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-t2)]">Production</p>
        {isProducing ? (
          <>
            <p className="mt-1 text-lg font-black">Creating your scenes…</p>
            <p className="mt-1 text-xs text-[var(--noc-t4)]">{data?.ready ?? 0} of {data?.expected ?? 0} ready</p>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[rgba(233,233,237,0.12)]">
              <div className="h-full rounded-full bg-[var(--noc-gradient)] transition-all" style={{ width: `${data?.progressPercent ?? 0}%` }} />
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 text-lg font-black">{complete ? 'Your scenes are ready' : 'Production finished with a few things to fix'}</p>
            {failedScenes.length > 0 && (
              <button
                type="button"
                disabled={produce.isPending}
                onClick={() => produce.mutate({ projectId })}
                className="mt-3 rounded-xl bg-[var(--noc-purple)] px-4 py-2 text-sm font-black text-[#0B0D12] disabled:opacity-50"
              >
                {produce.isPending ? 'Retrying…' : `Retry ${failedScenes.length} scene${failedScenes.length === 1 ? '' : 's'}`}
              </button>
            )}
          </>
        )}
      </div>

      {scenes.map((scene, index) => (
        <article key={scene.sceneId} className="rounded-2xl border border-[rgba(233,233,237,0.1)] bg-[rgba(233,233,237,0.03)] p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-t6)]">Scene {String(index + 1).padStart(2, '0')}</p>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-black uppercase"
              style={{
                background: scene.status === 'READY' ? 'rgba(79,139,214,0.16)' : scene.status === 'FAILED' ? 'rgba(227,93,93,0.16)' : scene.status === 'GENERATING' ? 'rgba(217,70,168,0.16)' : 'rgba(233,233,237,0.08)',
                color: scene.status === 'READY' ? 'var(--noc-blue)' : scene.status === 'FAILED' ? '#e35d5d' : scene.status === 'GENERATING' ? 'var(--noc-magenta)' : 'var(--noc-t5)',
              }}
            >
              {scene.status === 'READY' ? 'Ready' : scene.status === 'FAILED' ? 'Needs attention' : scene.status === 'GENERATING' ? 'Creating…' : 'Queued'}
            </span>
          </div>
          <h3 className="mt-1 text-lg font-black">{scene.title}</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {scene.assets.map((asset) => (
              <div key={asset.id} className="overflow-hidden rounded-xl border border-[rgba(233,233,237,0.08)] bg-[var(--noc-page)]">
                {asset.status === 'READY' && asset.assetUrl ? (
                  asset.kind === 'VIDEO' ? (
                    <video controls src={asset.assetUrl} className="aspect-[9/16] w-full object-cover" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={asset.thumbnailUrl ?? asset.assetUrl} alt="" className="aspect-[9/16] w-full object-cover" />
                  )
                ) : (
                  <div className="flex aspect-[9/16] items-center justify-center text-xs font-bold text-[var(--noc-t5)]">
                    {asset.status === 'FAILED' ? 'Could not generate' : 'Creating…'}
                  </div>
                )}
                {asset.status === 'FAILED' && asset.errorMessage && (
                  <p className="p-2 text-[11px] text-[#e35d5d]">{asset.errorMessage}</p>
                )}
              </div>
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}