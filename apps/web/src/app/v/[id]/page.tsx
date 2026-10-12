'use client';

import { useParams } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { VideoCard } from '@/components/video/VideoCard';
import { Navbar } from '@/components/layout/Navbar';
import { useUser } from '@/lib/auth';
import { useR16 } from '@/lib/r16';

export default function VideoPage() {
  const { id } = useParams() as { id: string };
  const { user } = useUser();
  const isR16 = useR16();

  const { data, isLoading } = trpc.video.getById.useQuery({ id });

  if (isLoading) {
    return (
      <div className="h-screen bg-[var(--noc-page)] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[var(--noc-hairline)] border-t-[var(--noc-t1)] rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="h-screen bg-black flex items-center justify-center text-white">
        <p>Video not found.</p>
      </div>
    );
  }

  const isOwner = Boolean(user && user.id === data.creator.id);

  return (
    <div className="h-screen bg-black lg:bg-[var(--noc-page)] flex flex-col">
      <Navbar />
      {/*
        Same desktop-stage pattern as the root feed (Phase 3A) — below `lg`
        this is a plain flex passthrough (VideoCard fills the box exactly
        as it did before), so mobile is unaffected. At `lg` and up it
        becomes a framed, centered video card instead of full-bleed.
        VideoCard itself is untouched.
      */}
      <div className="flex-1 relative mt-14 flex lg:justify-center lg:py-6 lg:px-6">
        <div className="relative flex-1 flex lg:flex-none lg:w-full lg:max-w-[480px] xl:max-w-[520px] 2xl:max-w-[580px] lg:h-full lg:rounded-[28px] lg:overflow-hidden lg:border lg:border-[var(--noc-hairline)] lg:shadow-2xl">
          <VideoCard
            video={{
              ...data,
              creator: data.creator as {
                id: string;
                username: string;
                displayName: string;
                avatarUrl: string | null;
                verified: boolean;
              },
            }}
            isActive
          />
        </div>
      </div>
      {isOwner && isR16 && <PublicationControl videoId={id} />}
    </div>
  );
}

/**
 * Owner-only publication controls for R16. Plain, kid-appropriate copy — no IDs,
 * no moderation metadata beyond the (already human) reason, no technical terms.
 */
function PublicationControl({ videoId }: { videoId: string }) {
  const utils = trpc.useUtils();
  const { data } = trpc.video.publicationStatus.useQuery({ videoId });

  const refresh = () => {
    utils.video.publicationStatus.invalidate({ videoId });
    utils.video.getById.invalidate({ id: videoId });
  };
  const submit = trpc.video.submitForPublication.useMutation({ onSuccess: refresh });
  const withdraw = trpc.video.withdrawPublication.useMutation({ onSuccess: refresh });
  const resubmit = trpc.video.resubmitPublication.useMutation({ onSuccess: refresh });

  if (!data) return null;

  const busy = submit.isPending || withdraw.isPending || resubmit.isPending;
  const err = submit.error || withdraw.error || resubmit.error;
  const btn =
    'px-4 py-2 rounded-full text-sm font-semibold text-white bg-[var(--noc-magenta)] hover:opacity-90 disabled:opacity-40';

  const body = data.withdrawnAt ? (
    <>
      <p className="text-sm text-[var(--noc-t4)]">This video is not on Raivstream Kids.</p>
      <button className={btn} disabled={busy} onClick={() => resubmit.mutate({ videoId })}>Send again</button>
    </>
  ) : data.moderationStatus === 'APPROVED' ? (
    <>
      <p className="text-sm text-[var(--noc-t4)]">Live on Raivstream Kids.</p>
      <button className={btn} disabled={busy} onClick={() => withdraw.mutate({ videoId })}>Take it down</button>
    </>
  ) : data.moderationStatus === 'REJECTED' ? (
    <>
      <p className="text-sm text-[var(--noc-t4)]">Not approved{data.moderationReason ? `: ${data.moderationReason}` : '.'}</p>
      <button className={btn} disabled={busy} onClick={() => resubmit.mutate({ videoId })}>Try again</button>
    </>
  ) : data.submittedForPublicationAt ? (
    <>
      <p className="text-sm text-[var(--noc-t4)]">Waiting for review.</p>
      <button className={btn} disabled={busy} onClick={() => withdraw.mutate({ videoId })}>Take it back</button>
    </>
  ) : (
    <>
      <p className="text-sm text-[var(--noc-t4)]">Happy with this video?</p>
      <button className={btn} disabled={busy || data.status !== 'READY'} onClick={() => submit.mutate({ videoId })}>
        Send to Raivstream Kids
      </button>
    </>
  );

  return (
    <div className="mx-auto mb-6 w-full max-w-[520px] px-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] px-4 py-3">
        {body}
      </div>
      {err && <p className="mt-2 text-xs text-red-300" role="alert">{err.message}</p>}
    </div>
  );
}
