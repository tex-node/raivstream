'use client';

import { useUser } from '@/lib/auth';
import { trpc } from '@/lib/trpc';
import { creatorError } from './errorMessages';

type SceneStatus = {
  sceneId: string;
  title: string;
  status: 'PENDING' | 'GENERATING' | 'READY' | 'FAILED';
  assets: Array<{ id: string; kind: string; status: string; assetUrl: string | null; thumbnailUrl: string | null; errorMessage: string | null }>;
};

type StageEntry = { id: string; label: string; state: 'done' | 'active' | 'pending' };

type ProductionStatus = {
  status: string;
  expected: number;
  ready: number;
  failed: number;
  generating: number;
  progressPercent: number;
  stage: string;
  stages: StageEntry[];
  totalScenes: number;
  currentSceneIndex: number;
  images: { ready: number; expected: number };
  videos: { ready: number; expected: number };
  runStatus: string | null;
  scenes: SceneStatus[];
};

function StageMark({ state }: { state: StageEntry['state'] }) {
  if (state === 'done') return <span className="text-[var(--noc-blue)]">✓</span>;
  if (state === 'active') return <span className="animate-pulse text-[var(--noc-magenta)]">●</span>;
  return <span className="text-[var(--noc-t6)]">○</span>;
}

function DimensionBar({ label, ready, expected, waiting }: { label: string; ready: number; expected: number; waiting?: boolean }) {
  const pct = expected > 0 ? Math.round((ready / expected) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-[var(--noc-t4)]">
        <span>{label}</span>
        <span>{waiting ? 'Waiting' : `${ready} / ${expected}`}</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[rgba(233,233,237,0.12)]">
        <div className="h-full rounded-full bg-[var(--noc-gradient)] transition-all" style={{ width: `${waiting ? 0 : pct}%` }} />
      </div>
    </div>
  );
}

/**
 * Raivstream 5.0 — production surface.
 *
 * The creator sees meaningful creative progress — a stage checklist and real
 * dimensions — never providers, models, jobs or a fake percentage.
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

  // Assembly state: poll the creativeOutput list while in REVIEW so we can
  // reflect ASSEMBLING → FINAL_READY without a page refresh.
  type OutputState = { id: string; status: string; assetUrl: string | null; format: string; createdAt: Date | string };
  const outputsQuery = trpc.creative.output.list.useQuery(
    { projectId },
    {
      enabled: Boolean(isLoaded && isSignedIn && isReview),
      refetchInterval: (query) => {
        const outputs = (query.state.data ?? []) as OutputState[];
        const hasReady = outputs.some((o) => o.status === 'READY');
        return isReview && !hasReady ? 4000 : false;
      },
      retry: false,
    },
  );
  const outputs = (outputsQuery.data ?? []) as OutputState[];
  const latestOutput = outputs[0] ?? null;

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

  const scenes = data?.scenes ?? [];
  const failedScenes = scenes.filter((scene) => scene.status === 'FAILED');
  const stages = data?.stages ?? [];

  // Fix D state machine — never claim "Your film is ready" until assembly has completed.
  // NEEDS_ATTENTION: one or more scene VIDEOs failed (assembly is blocked).
  // ASSEMBLING: all scenes succeeded; assembly is in progress (no READY output yet).
  // ASSEMBLY_FAILED: assembly ran but FFmpeg or upload failed.
  // FINAL_READY: assembled film is available.
  const hasFailedVideos = scenes.some((scene) => scene.assets.some((a) => a.kind === 'VIDEO' && a.status === 'FAILED'));
  const assemblyFinalReady = latestOutput?.status === 'READY';
  const assemblyFailed = !assemblyFinalReady && latestOutput?.status === 'FAILED';
  const assembling = isReview && !hasFailedVideos && !assemblyFinalReady && !assemblyFailed;

  const complete = assemblyFinalReady;

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-[rgba(233,233,237,0.1)] bg-[var(--noc-bar)] p-5 text-white">
        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-t2)]">Production</p>
        {isProducing ? (
          <>
            <p className="mt-1 text-lg font-black">Creating your film</p>
            {data && data.totalScenes > 0 && (
              <p className="mt-1 text-xs text-[var(--noc-t4)]">
                Scene {Math.min(data.currentSceneIndex + 1, data.totalScenes)} of {data.totalScenes}
              </p>
            )}

            {stages.length > 0 && (
              <ul className="mt-3 space-y-1.5 text-sm text-[var(--noc-t2)]">
                {stages.map((entry) => (
                  <li key={entry.id} className="flex items-center gap-2">
                    <StageMark state={entry.state} />
                    <span className={entry.state === 'active' ? 'font-bold text-[var(--noc-t1)]' : entry.state === 'pending' ? 'text-[var(--noc-t5)]' : ''}>{entry.label}</span>
                  </li>
                ))}
              </ul>
            )}

            {data && (
              <div className="mt-4 space-y-3">
                <DimensionBar label="Character consistency" ready={data.images.ready} expected={data.images.expected} />
                <DimensionBar label="Visual continuity" ready={data.videos.ready} expected={data.videos.expected} />
                <DimensionBar label="Final assembly" ready={1} expected={1} waiting />
              </div>
            )}
          </>
        ) : (
          <>
            {complete ? (
              <>
                <p className="mt-1 text-lg font-black">Your film is ready</p>
                {latestOutput?.assetUrl && (
                  <video
                    controls
                    src={latestOutput.assetUrl}
                    className="mt-4 w-full rounded-xl border border-[rgba(233,233,237,0.08)]"
                    style={{ aspectRatio: '9/16', maxHeight: '480px', objectFit: 'cover' }}
                  />
                )}
              </>
            ) : assembling ? (
              <>
                <p className="mt-1 text-lg font-black">Assembling your film…</p>
                <p className="mt-1 text-xs text-[var(--noc-t4)]">Combining all scenes into the final cut</p>
                <div className="mt-3">
                  <DimensionBar label="Final assembly" ready={0} expected={1} waiting />
                </div>
              </>
            ) : assemblyFailed ? (
              <>
                <p className="mt-1 text-lg font-black">Assembly failed</p>
                <p className="mt-1 text-xs text-[#e35d5d]">{latestOutput?.assetUrl ?? 'The scenes are ready but the final cut could not be assembled. Please retry.'}</p>
              </>
            ) : (
              <>
                <p className="mt-1 text-lg font-black">Production finished with a few things to fix</p>
                <p className="mt-1 text-xs text-[var(--noc-t4)]">
                  {hasFailedVideos
                    ? `Assembly is waiting on ${failedScenes.length} scene${failedScenes.length === 1 ? '' : 's'} that need attention`
                    : 'Some scenes could not be generated'}
                </p>
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
                {asset.status === 'FAILED' && (
                  <p className="p-2 text-[11px] text-[#e35d5d]">{creatorError(asset.errorMessage)}</p>
                )}
              </div>
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}
