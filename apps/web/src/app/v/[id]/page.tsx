'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { VideoCard } from '@/components/video/VideoCard';
import { Navbar } from '@/components/layout/Navbar';
import { useUser } from '@/lib/auth';
import { useR16 } from '@/lib/r16';
import { shareTargets, whatsappShareUrl } from '@/lib/shareTargets';

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
      {isOwner && <PublicationControl videoId={id} />}
      {isOwner && !isR16 && <ShareMenu videoId={id} />}
    </div>
  );
}

/**
 * Phase 4b — share menu for the owner of an approved R16 video (main app only;
 * the R16 experience stays child-simple). Instagram is copy-link only (no direct
 * share URL). Failures are quiet — sharing is secondary.
 */
function ShareMenu({ videoId }: { videoId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const create = trpc.story.createShareLink.useMutation();
  const canNative = typeof navigator !== 'undefined' && typeof (navigator as unknown as { share?: unknown }).share === 'function';

  async function ensureUrl(): Promise<string | null> {
    if (url) return url;
    try {
      const res = await create.mutateAsync({ videoId });
      setUrl(res.url);
      return res.url;
    } catch {
      return null; // quiet
    }
  }

  async function copyLink() {
    const u = await ensureUrl();
    if (!u) return;
    try {
      await navigator.clipboard.writeText(u);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* quiet */
    }
  }

  async function openWhatsApp() {
    const u = await ensureUrl();
    if (u) window.open(whatsappShareUrl(u), '_blank', 'noopener,noreferrer');
  }

  async function nativeShare() {
    const u = await ensureUrl();
    if (u) {
      try {
        await (navigator as unknown as { share: (o: { url: string }) => Promise<void> }).share({ url: u });
      } catch {
        /* quiet */
      }
    }
  }

  const targets = shareTargets({ canNativeShare: canNative });
  const btn = { fontSize: 12.5, padding: '9px 13px' } as const;

  return (
    <div className="mx-auto mb-6 w-full max-w-[520px] px-4">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, borderRadius: 16, border: '1px solid var(--noc-hairline)', background: 'var(--noc-card)', padding: '10px 14px' }}>
        <span className="noc-label" style={{ width: '100%' }}>Share</span>
        {targets.map((t) => (
          <button
            key={t.id}
            type="button"
            disabled={create.isPending}
            onClick={() => { if (t.id === 'whatsapp') void openWhatsApp(); else if (t.id === 'native') void nativeShare(); else void copyLink(); }}
            className="noc-btn-outline"
            style={btn}
          >
            {t.id === 'copy' && copied ? 'Copied' : t.label}
          </button>
        ))}
      </div>
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

  const confirmWithdraw = () => {
    if (typeof window !== 'undefined' && !window.confirm('Take this video off the feed? You can put it back later.')) return;
    withdraw.mutate({ videoId });
  };

  // General-feed videos have no review queue: live means publishedAt. A REJECTED
  // one must go back through review, so it is checked before "live" - otherwise a
  // blocked video would render as live with a Withdraw button.
  const body = !data.isKidsSafe ? (
    data.moderationStatus === 'REJECTED' ? (
      <>
        <p className="text-sm text-[var(--noc-t4)]">Not approved{data.moderationReason ? `: ${data.moderationReason}` : '.'}</p>
        <button className={btn} disabled={busy} onClick={() => resubmit.mutate({ videoId })}>Ask for another look</button>
      </>
    ) : data.withdrawnAt ? (
      <>
        <p className="text-sm text-[var(--noc-t4)]">This video is not in the feed.</p>
        <button className={btn} disabled={busy} onClick={() => resubmit.mutate({ videoId })}>Put it back</button>
      </>
    ) : data.publishedAt ? (
      <>
        <p className="text-sm text-[var(--noc-t4)]">Live in the main feed.</p>
        <button className={btn} disabled={busy} onClick={confirmWithdraw}>Withdraw from feed</button>
      </>
    ) : (
      <p className="text-sm text-[var(--noc-t4)]">This video is not in the feed yet.</p>
    )
  ) : data.withdrawnAt ? (
    <>
      <p className="text-sm text-[var(--noc-t4)]">This video is not on Raivstream Kids.</p>
      <button className={btn} disabled={busy} onClick={() => resubmit.mutate({ videoId })}>Send again</button>
    </>
  ) : data.moderationStatus === 'APPROVED' ? (
    <>
      <p className="text-sm text-[var(--noc-t4)]">Live on Raivstream Kids.</p>
      <button className={btn} disabled={busy} onClick={confirmWithdraw}>Take it down</button>
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
