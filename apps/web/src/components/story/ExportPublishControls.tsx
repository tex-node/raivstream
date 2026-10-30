'use client';

/**
 * Export + publish controls for the Story Workspace.
 *
 * Export is asynchronous (the worker assembles the MP4), so this polls only while
 * something is in flight and stops once READY - a finished story should not keep
 * a timer running. Publishing goes through `story.publishExport`, which creates a
 * feed `Video` in PENDING moderation.
 */

import { useState } from 'react';
import { Download, Loader2, Play } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { canExportStory } from './exportEligibility';
import { publishSlot } from './exportPublishState';
import { PublishModal, type PublishValues } from '@/components/media/PublishModal';

type ExportRow = {
  id: string;
  status: string;
  assetUrl: string | null;
};

export function ExportPublishControls({
  project,
  isR16Session,
  variant = 'full',
}: {
  project: { id?: string; title?: string | null; audienceMode?: string | null };
  isR16Session: boolean;
  /** compact is the layout bar: same three actions, tighter layout. */
  variant?: 'full' | 'compact';
}) {
  const projectId = project.id ?? '';
  // Gate mirrors the server boundary: requestExport refuses both `!isR16` and
  // non-KIDS projects, so the controls must not be offered here.
  const eligible = canExportStory({ isR16Session, audienceMode: project.audienceMode });
  const [open, setOpen] = useState(false);
  const [published, setPublished] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const latest = trpc.story.getStoryVideoExport.useQuery(
    { projectId },
    {
      enabled: Boolean(projectId),
      // Poll only while an export is being assembled.
      refetchInterval: (query) => {
        const row = (query.state.data as ExportRow | null | undefined);
        return row && row.status !== 'READY' && row.status !== 'FAILED' ? 4000 : false;
      },
    },
  );

  const request = trpc.story.requestStoryVideoExport.useMutation({
    onSuccess: () => { void latest.refetch(); },
    onError: (err) => setError(err.message),
  });

  const publish = trpc.story.publishExport.useMutation({
    onSuccess: async (data) => {
      setPublished(true);
      setError(null);
      void exportVideo.refetch();
      // On R16, publishing IS the kids-feed intent, so chain the submission. If it
      // fails the Video row still exists in PENDING and the button falls through to
      // 'submit' on the next render: publish is durable, submit is retryable.
      if (isKidsR16) {
        try {
          await submitForPublication.mutateAsync({ videoId: data.videoId });
        } catch {
          /* surfaced through submitForPublication's own error */
        }
      }
    },
    onError: (err) => setError(err.message),
  });

  const row = (latest.data ?? null) as ExportRow | null;
  const isReady = row?.status === 'READY' && Boolean(row.assetUrl);
  const isBusy = Boolean(row) && row!.status !== 'READY' && row!.status !== 'FAILED';

  const isKidsR16 = isR16Session && project.audienceMode === 'KIDS';

  // The Video row publishExport created, plus the kids-review submission. Two
  // separate facts - see the comment at the button.
  const exportVideo = trpc.story.getExportVideo.useQuery(
    { exportId: row?.id ?? '' },
    { enabled: Boolean(row?.id) && isKidsR16 },
  );

  const submitForPublication = trpc.video.submitForPublication.useMutation({
    onSuccess: () => { void exportVideo.refetch(); },
    onError: (err) => setError(err.message),
  });

  const publishState = publishSlot({
    isR16Session,
    audienceMode: project.audienceMode,
    exportStatus: row?.status ?? null,
    video: exportVideo.data ?? null,
    loading: exportVideo.isLoading,
  });

  if (!eligible) {
    return (
      <div className="rounded-lg border border-dashed border-white/10 px-4 py-3 text-sm text-white/50">
        {project.audienceMode === 'KIDS' && !isR16Session
          ? 'Open this story on the R16 app to export it.'
          : project.audienceMode === 'GENERAL' && isR16Session
          ? 'General stories export from the main app.'
          : 'Full-movie export is not available for this story.'}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-t4)]">Final movie</p>

      {isBusy ? (
        <p className="mt-2 flex items-center gap-2 text-sm font-bold text-[var(--noc-t3)]">
          <Loader2 className="animate-spin" size={16} />
          Assembling your story… ({row!.status.toLowerCase()})
        </p>
      ) : isReady ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="w-full text-[11px] font-black uppercase tracking-wide text-[var(--noc-cyan)]">
            {publishState === 'publish' ? 'Ready to publish'
              : publishState === 'submitted' ? 'Submitted for review'
              : publishState === 'live' ? 'Live in the kids feed'
              : 'Your story video is ready'}
          </p>
          <a
            href={row!.assetUrl as string}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-[rgba(79,139,214,0.12)] px-3 py-2 text-sm font-black text-[var(--noc-blue)]"
          >
            <Play size={16} /> Watch Story
          </a>
          <a
            href={`/api/story/export/${row!.id}/download`}
            download="my-story.mp4"
            className="inline-flex items-center gap-2 rounded-xl bg-[rgba(139,92,246,0.18)] px-3 py-2 text-sm font-black text-[#a78bfa]"
          >
            <Download size={16} /> Save
          </a>
          {/* publishExport writes PENDING (automated scan queue); submitForPublication
              writes submittedForPublicationAt (creator-requested kids review). Two
              different queues, two different facts - do not collapse them. */}
          {isKidsR16 ? (
            publishState === 'submitted' ? (
              <span className="text-xs font-bold text-[var(--noc-t4)]">Submitted for review</span>
            ) : publishState === 'live' ? (
              <span className="text-xs font-bold text-[#7dd3a0]">Live in the kids feed</span>
            ) : publishState === 'processing' ? (
              <span className="text-xs font-bold text-[var(--noc-t4)]">Finishing your film…</span>
            ) : publishState === 'submit' ? (
              <button
                type="button"
                disabled={submitForPublication.isPending}
                onClick={() => {
                  if (exportVideo.data) submitForPublication.mutate({ videoId: exportVideo.data.videoId });
                }}
                className="rounded-xl bg-[rgba(79,139,214,0.12)] px-3 py-2 text-sm font-black text-[var(--noc-blue)] disabled:opacity-50"
              >
                {submitForPublication.isPending ? 'Submitting…' : 'Submit for review'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => { setPublished(false); setError(null); setOpen(true); }}
                className="rounded-xl bg-[linear-gradient(90deg,#d946a8,#b25ad9)] px-3 py-2 text-sm font-black text-white"
              >
                Publish to kids feed
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={() => { setPublished(false); setError(null); setOpen(true); }}
              className="rounded-xl bg-[linear-gradient(90deg,#d946a8,#b25ad9)] px-3 py-2 text-sm font-black text-white"
            >
              Publish to Feed
            </button>
          )}
        </div>
      ) : (
        <div className="mt-2">
          <button
            type="button"
            disabled={request.isPending}
            onClick={() => request.mutate({ projectId })}
            className="inline-flex items-center gap-2 rounded-xl bg-[rgba(79,139,214,0.12)] px-3 py-2 text-sm font-black text-[var(--noc-blue)] disabled:opacity-50"
          >
            {request.isPending ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
            {request.isPending ? 'Requesting…' : 'Export Story'}
          </button>
          {row?.status === 'FAILED' && (
            <p className="mt-2 text-xs font-bold text-[var(--noc-magenta)]">
              The last export failed. Try again once your scenes have pictures or narration.
            </p>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-xs font-bold text-[var(--noc-magenta)]">{error}</p>}

      <PublishModal
        open={open}
        defaultTitle={project.title || 'My story'}
        pending={publish.isPending}
        error={error}
        published={published}
        onClose={() => setOpen(false)}
        onSubmit={(values: PublishValues) => {
          if (!row) return;
          publish.mutate({
            exportId: row.id,
            title: values.title,
            ...(values.description ? { description: values.description } : {}),
          });
        }}
      />
    </div>
  );
}
