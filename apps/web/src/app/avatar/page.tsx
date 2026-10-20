'use client';

/**
 * D-002 Phase A - dedicated Avatar surface for VEED Fabric.
 *
 * Fabric was reachable only through the AI Studio model dropdown, where it sat
 * beside image and video models with a form that had to hide half its own fields.
 * This page is the same mutation and the same validation, with a form shaped for
 * exactly one job: presenter image + audio + consent, then a preview.
 *
 * Reuses `generateFormShape` / `canSubmitGenerateForm` so this surface and AI
 * Studio cannot disagree about what is required.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { trpc } from '@/lib/trpc';
import { generateFormShape, canSubmitGenerateForm } from '@/lib/generateFormShape';
import { useUser } from '@/lib/auth';

const MODEL = 'VEED_FABRIC';
const POLL_INTERVAL_MS = 4_000;

export default function AvatarPage() {
  const [imageUrl, setImageUrl] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [consent, setConsent] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [pollEnabled, setPollEnabled] = useState(false);

  // Same shape the router uses - Fabric requires image + audio, never a prompt.
  const form = useMemo(
    () => generateFormShape({ modelId: MODEL, requiresSeedImage: true, requiresAudioUrl: true }),
    [],
  );
  const canSubmit = canSubmitGenerateForm(form, {
    prompt: '', seedImageUrl: imageUrl, audioUrl, consent,
  });

  const models = trpc.generation.listModels.useQuery();
  const fabric = (models.data ?? []).find((m) => m.id === MODEL);
  const creditCost = fabric?.creditCost ?? null;

  // Server-side analytics: a client console.log is invisible to adoption counts.
  const { isSignedIn } = useUser();
  const track = trpc.analytics.track.useMutation();
  const trackedView = useRef(false);

  useEffect(() => {
    if (!isSignedIn || trackedView.current) return; // strict-mode / re-render guard
    trackedView.current = true;
    track.mutate({ event: 'avatar_page_view', properties: {} });
  }, [isSignedIn, track]);

  const createJob = trpc.generation.create.useMutation({
    onSuccess: (job) => {
      setActiveJobId(job.id);
      setPollEnabled(job.status !== 'COMPLETED');

      // No prompt, no media URLs, no transcript - only counts and identifiers.
      track.mutate({
        event: 'avatar_job_submitted',
        properties: {
          jobId: job.id,
          model: 'VEED_FABRIC',
          resolution: (job as { resolution?: string | null }).resolution ?? '720p',
          durationSeconds: (job as { duration?: number | null }).duration ?? 5,
        },
      });
    },
  });

  const { data: jobStatus } = trpc.generation.pollStatus.useQuery(
    { jobId: activeJobId! },
    { enabled: !!activeJobId && pollEnabled, refetchInterval: POLL_INTERVAL_MS },
  );

  const isGenerating = createJob.isPending
    || (pollEnabled && jobStatus?.status !== 'COMPLETED' && jobStatus?.status !== 'FAILED');
  const outputUrl = jobStatus?.status === 'COMPLETED' ? jobStatus.outputUrl ?? null : null;
  const errorMessage = createJob.error?.message
    ?? (jobStatus?.status === 'FAILED' ? 'The avatar render failed. Try a shorter audio track.' : null);

  const handleGenerate = () => {
    if (!canSubmit || isGenerating) return;
    createJob.mutate({
      model: MODEL as never,
      // Fabric has no prompt; the server applies its canned default. An empty
      // string would fail z.string().min(3).
      prompt: undefined,
      seedImageUrl: imageUrl.trim(),
      audioUrl: audioUrl.trim(),
      consent: true as const,
    });
  };

  return (
    <div className="min-h-screen bg-[var(--noc-page)]">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <header className="mb-8">
          <h1 className="text-3xl font-black text-[var(--noc-t1)]">AI Avatar</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--noc-t4)]">
            Bring your presenter to life. Upload an image and a script (audio) to generate a
            perfectly lip-synced video.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Inputs */}
          <section className="rounded-2xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] p-5">
            <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-[var(--noc-t5)]">
              Presenter Image (paste a public URL)
              <span className="ml-1 normal-case text-[var(--noc-magenta)]">* required</span>
            </label>
            <input
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://example.com/presenter.jpg"
              className="w-full rounded-xl border border-[var(--noc-hairline)] bg-[var(--noc-page)] px-4 py-2.5 text-sm text-[var(--noc-t1)] outline-none focus:border-[var(--noc-magenta)]/60"
            />
            <p className="mt-1.5 text-xs text-[var(--noc-t6)]">Must be a publicly accessible JPG or PNG.</p>

            <label className="mb-2 mt-5 block text-xs font-medium uppercase tracking-wider text-[var(--noc-t5)]">
              Audio Track (paste a public URL)
              <span className="ml-1 normal-case text-[var(--noc-magenta)]">* required</span>
            </label>
            <input
              type="url"
              value={audioUrl}
              onChange={(e) => setAudioUrl(e.target.value)}
              placeholder="https://example.com/audio.mp3"
              className="w-full rounded-xl border border-[var(--noc-hairline)] bg-[var(--noc-page)] px-4 py-2.5 text-sm text-[var(--noc-t1)] outline-none focus:border-[var(--noc-magenta)]/60"
            />
            <p className="mt-1.5 text-xs text-[var(--noc-t6)]">MP3, WAV, or M4A (max 60s).</p>

            <label className="mt-5 flex items-start gap-2 text-sm font-semibold text-[var(--noc-t1)]">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5"
              />
              <span>I confirm I have the rights and consent to use this image and audio.</span>
            </label>

            <button
              onClick={handleGenerate}
              disabled={!canSubmit || isGenerating}
              className="mt-6 w-full rounded-xl bg-[linear-gradient(90deg,#d946a8,#b25ad9)] px-5 py-3.5 font-black text-white disabled:opacity-40"
            >
              {isGenerating
                ? 'Generating…'
                : `Generate Avatar${creditCost != null ? ` — ${creditCost} credits` : ''}`}
            </button>
          </section>

          {/* Preview */}
          <section className="flex min-h-[320px] items-center justify-center rounded-2xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] p-5">
            {errorMessage ? (
              <div className="w-full rounded-xl border border-[rgba(217,70,168,0.35)] bg-[rgba(217,70,168,0.08)] px-4 py-3 text-sm font-semibold text-[var(--noc-magenta)]">
                {errorMessage}
              </div>
            ) : outputUrl ? (
              <div className="w-full">
                <video src={outputUrl} controls className="w-full rounded-xl" />
                <a
                  href={outputUrl}
                  download="raivstream-avatar.mp4"
                  className="mt-3 block w-full rounded-xl bg-[var(--noc-page)] px-4 py-2.5 text-center text-sm font-bold text-[var(--noc-t1)]"
                >
                  Download
                </a>
              </div>
            ) : isGenerating ? (
              <div className="text-center">
                <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-[var(--noc-hairline)] border-t-[var(--noc-magenta)]" />
                <p className="text-sm font-semibold text-[var(--noc-t4)]">Generating your avatar…</p>
                <p className="mt-1 text-xs text-[var(--noc-t6)]">This usually takes 15-30 seconds.</p>
              </div>
            ) : (
              <p className="max-w-xs text-center text-sm text-[var(--noc-t5)]">
                Your generated avatar will appear here once you add a presenter image and an audio track.
              </p>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
