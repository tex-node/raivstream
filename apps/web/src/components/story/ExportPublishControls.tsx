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
import { useR16 } from '@/lib/r16';
import { canExportStory, exportUnavailableReason } from './exportEligibility';
import { PublishModal, type PublishValues } from '@/components/media/PublishModal';

type ExportRow = {
  id: string;
  status: string;
  assetUrl: string | null;
};

export function ExportPublishControls({
  projectId,
  audienceMode,
}: {
  projectId: string;
  audienceMode?: string | null;
}) {
  // useR16 returns a boolean, not an object.
  const isR16 = useR16();
  const eligible = canExportStory({ isR16Session: Boolean(isR16), audienceMode });
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
    onSuccess: () => { setPublished(true); setError(null); },
    onError: (err) => setError(err.message),
  });

  const row = (latest.data ?? null) as ExportRow | null;
  const isReady = row?.status === 'READY' && Boolean(row.assetUrl);
  const isBusy = Boolean(row) && row!.status !== 'READY' && row!.status !== 'FAILED';

  // The server refuses both `!isR16` and non-KIDS projects. Showing the controls
  // anyway would offer an action that always 403s, so explain the boundary here
  // rather than letting the user discover it by clicking.
  if (!eligible) {
    return (
      <div className="rounded-2xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--noc-t4)]">Final movie</p>
        <p className="mt-2 text-xs font-bold text-[var(--noc-t5)]">
          {exportUnavailableReason({ isR16Session: Boolean(isR16), audienceMode })}
        </p>
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
          <a
            href={row!.assetUrl as string}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-[rgba(79,139,214,0.12)] px-3 py-2 text-sm font-black text-[var(--noc-blue)]"
          >
            <Play size={16} /> Watch Story
          </a>
          <button
            type="button"
            onClick={() => { setPublished(false); setError(null); setOpen(true); }}
            className="rounded-xl bg-[linear-gradient(90deg,#d946a8,#b25ad9)] px-3 py-2 text-sm font-black text-white"
          >
            Publish to Feed
          </button>
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
        defaultTitle="My story"
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
            isKidsSafe: values.isKidsSafe,
          });
        }}
      />
    </div>
  );
}
