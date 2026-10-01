'use client';

import { useMemo, useState } from 'react';
import { Clapperboard, Loader2, Play, X } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useR16 } from '@/lib/r16';
import { trpc } from '@/lib/trpc';
import { useUser } from '@/lib/auth';

type VideoProgress = { current: number; total: number } | null;

type SceneLike = {
  id: string;
  imageUrl: string | null;
  assets?: Array<{
    assetType: 'IMAGE' | 'VIDEO';
    status: 'PENDING' | 'GENERATING' | 'READY' | 'FAILED';
    assetUrl: string | null;
  }>;
};

function latestReadyVideo(scene: SceneLike) {
  return scene.assets?.find((asset) => asset.assetType === 'VIDEO' && asset.status === 'READY') ?? null;
}

export default function StoryPlaygroundProjectLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const isR16 = useR16();
  const { isLoaded, isSignedIn } = useUser();
  const utils = trpc.useUtils();
  const [progress, setProgress] = useState<VideoProgress>(null);
  const [message, setMessage] = useState<string | null>(null);

  const workspace = trpc.story.getWorkspace.useQuery(
    { projectId },
    { enabled: Boolean(projectId && isLoaded && isSignedIn && isR16) },
  );
  const storyVideoExport = trpc.story.getStoryVideoExport.useQuery(
    { projectId },
    {
      enabled: Boolean(projectId && isLoaded && isSignedIn && isR16),
      refetchInterval: (query) => query.state.data?.status === 'GENERATING' ? 3000 : false,
    },
  );

  const generateSceneVideo = trpc.story.generateSceneVideo.useMutation();
  const requestStoryVideoExport = trpc.story.requestStoryVideoExport.useMutation({
    onSuccess: async () => {
      await storyVideoExport.refetch();
    },
    onError: (error) => setMessage(error.message),
  });

  const scenes = useMemo(
    () => ((workspace.data?.project?.sceneSeeds ?? []) as SceneLike[]).slice().sort((a, b) => {
      const aOrder = (a as SceneLike & { orderIndex?: number }).orderIndex ?? 0;
      const bOrder = (b as SceneLike & { orderIndex?: number }).orderIndex ?? 0;
      return aOrder - bOrder;
    }),
    [workspace.data?.project?.sceneSeeds],
  );

  const allScenesHaveStills = isR16 && scenes.length > 0 && scenes.every((scene) => Boolean(scene.imageUrl));
  const allScenesHaveReadyVideo = isR16 && scenes.length > 0 && scenes.every((scene) => Boolean(latestReadyVideo(scene)));
  const scenesNeedingVideo = scenes.filter((scene) => scene.imageUrl && !latestReadyVideo(scene));
  const isGenerating = progress !== null;
  const exportStatus = storyVideoExport.data?.status;

  const generateAllSceneVideos = async () => {
    if (!projectId || isGenerating || !allScenesHaveStills) return;
    setMessage(null);

    if (scenesNeedingVideo.length === 0) {
      requestStoryVideoExport.mutate({ projectId });
      return;
    }

    setProgress({ current: 0, total: scenesNeedingVideo.length });
    try {
      for (let index = 0; index < scenesNeedingVideo.length; index += 1) {
        setProgress({ current: index + 1, total: scenesNeedingVideo.length });
        await generateSceneVideo.mutateAsync({
          projectId,
          sceneId: scenesNeedingVideo[index]!.id,
          model: 'H3_MAX',
        });
      }

      await utils.story.getWorkspace.invalidate({ projectId });
      requestStoryVideoExport.mutate({ projectId });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Video generation failed.');
    } finally {
      setProgress(null);
    }
  };

  if (!isR16 || !isLoaded || !isSignedIn) return <>{children}</>;

  const showVideoEntry = allScenesHaveStills && exportStatus !== 'READY' && !allScenesHaveReadyVideo;

  return (
    <>
      {children}

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[90] flex justify-center px-4 pb-4">
        <div className="pointer-events-auto w-full max-w-3xl rounded-2xl border border-[rgba(233,233,237,0.12)] bg-[rgba(15,16,25,0.96)] p-3 shadow-2xl backdrop-blur-xl">
          {message && (
            <div className="mb-2 flex items-center justify-between gap-3 rounded-xl bg-[rgba(217,70,168,0.10)] px-4 py-2 text-sm font-bold text-[var(--noc-magenta)]">
              <span>{message}</span>
              <button type="button" onClick={() => setMessage(null)} aria-label="Dismiss" className="p-1"><X size={16} /></button>
            </div>
          )}

          {exportStatus === 'READY' && storyVideoExport.data?.id ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex-1">
                <p className="text-sm font-black uppercase tracking-wide text-[var(--noc-cyan)]">Your story video is ready</p>
                <p className="text-xs font-semibold text-[var(--noc-t4)]">Watch it or save the MP4.</p>
              </div>
              <a href={storyVideoExport.data.assetUrl ?? undefined} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[linear-gradient(90deg,#d946a8,#b25ad9)] px-5 py-3 font-black text-white">
                <Play size={17} /> Watch Story
              </a>
              <a href={`/api/story/export/${storyVideoExport.data.id}/download`} download="my-story.mp4" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--noc-purple)] px-5 py-3 font-black text-white">
                Save Video
              </a>
            </div>
          ) : exportStatus === 'GENERATING' || requestStoryVideoExport.isPending ? (
            <div>
              <p className="text-sm font-black uppercase tracking-wide text-[var(--noc-t4)]">Assembling your story…</p>
              <div className="mt-2 h-2 w-full animate-pulse rounded-full bg-[var(--noc-purple)] opacity-60" />
            </div>
          ) : isGenerating ? (
            <div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-black uppercase tracking-wide text-[var(--noc-t4)]">Generating Video</p>
                <span className="text-sm font-black text-[var(--noc-purple)]">{progress?.current}/{progress?.total}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[rgba(233,233,237,0.08)]">
                <div className="h-full rounded-full bg-[linear-gradient(90deg,#d946a8,#6f8eea)] transition-all" style={{ width: `${((progress?.current ?? 0) / Math.max(progress?.total ?? 1, 1)) * 100}%` }} />
              </div>
            </div>
          ) : exportStatus === 'FAILED' ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-wide text-[var(--noc-magenta)]">Video export failed</p>
                <p className="text-xs font-semibold text-[var(--noc-t4)]">All scene videos are available; try the story assembly again.</p>
              </div>
              <button type="button" onClick={() => requestStoryVideoExport.mutate({ projectId })} disabled={!allScenesHaveReadyVideo || requestStoryVideoExport.isPending} className="rounded-xl bg-[var(--noc-purple)] px-5 py-3 font-black text-white disabled:opacity-50">Try Again</button>
            </div>
          ) : showVideoEntry ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-wide text-[var(--noc-t4)]">Story Video</p>
                <p className="text-xs font-semibold text-[var(--noc-t5)]">Your {scenes.length} picture cards are ready to become a video.</p>
              </div>
              <button type="button" onClick={generateAllSceneVideos} disabled={isGenerating || requestStoryVideoExport.isPending} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[linear-gradient(90deg,#d946a8,#b25ad9)] px-6 py-3 font-black text-white disabled:opacity-50">
                {isGenerating ? <Loader2 className="animate-spin" size={18} /> : <Clapperboard size={18} />}
                Generate Video
              </button>
            </div>
          ) : allScenesHaveReadyVideo ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-wide text-[var(--noc-magenta)]">All scene videos are ready</p>
                <p className="text-xs font-semibold text-[var(--noc-t4)]">Assemble the finished story video.</p>
              </div>
              <button type="button" onClick={() => requestStoryVideoExport.mutate({ projectId })} disabled={requestStoryVideoExport.isPending} className="rounded-xl bg-[linear-gradient(90deg,#d946a8,#b25ad9)] px-6 py-3 font-black text-white disabled:opacity-50">Export Story</button>
            </div>
          ) : (
            <div className="text-xs font-bold text-[var(--noc-t5)]">Generate pictures for every scene to unlock story video generation.</div>
          )}
        </div>
      </div>
    </>
  );
}
