'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/layout/Navbar';
import { useUser } from '@/lib/auth';
import { trpc } from '@/lib/trpc';

type Model = {
  id: string;
  label: string;
  description: string;
  badge: 'live' | 'beta' | 'coming-soon';
  icon: string;
  minDuration: number;
  maxDuration: number;
  supportsImageToVideo: boolean;
  creditCost: number | null;
};

type AspectRatio = '9:16' | '16:9' | '1:1';

const BADGE_STYLES: Record<Model['badge'], string> = {
  live:         'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
  beta:         'bg-amber-500/20 text-amber-400 border border-amber-500/30',
  'coming-soon': 'bg-white/10 text-white/40 border border-white/10',
};

const BADGE_LABELS: Record<Model['badge'], string> = {
  live:         'Live',
  beta:         'Beta',
  'coming-soon': 'Coming Soon',
};

const AR_OPTIONS: { value: AspectRatio; label: string; icon: string }[] = [
  { value: '9:16',  label: 'Portrait',  icon: '▯' },
  { value: '16:9',  label: 'Landscape', icon: '▭' },
  { value: '1:1',   label: 'Square',    icon: '□' },
];

export default function GeneratePage() {
  const router = useRouter();
  const { isSignedIn, isLoaded } = useUser();

  const [selectedModel, setSelectedModel] = useState<string>('GROK_IMAGINE');
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [duration, setDuration] = useState(5);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [pollEnabled, setPollEnabled] = useState(false);

  // Publish form state
  const [showPublish, setShowPublish] = useState(false);
  const [pubTitle, setPubTitle] = useState('');
  const [pubTags, setPubTags] = useState('');

  const { data: models } = trpc.generation.listModels.useQuery();
  const { data: balanceData, refetch: refetchBalance } = trpc.user.creditBalance.useQuery(
    undefined, { enabled: isSignedIn }
  );
  const balance = balanceData?.balance ?? 0;

  // ── RunPod endpoint health ─────────────────────────────────────────────────
  const isRunpodModel = selectedModel === 'LTX2' || selectedModel === 'WAN_25';
  const { data: ltx2Health } = trpc.runpod.ltx2Health.useQuery(undefined, {
    enabled: isSignedIn && selectedModel === 'LTX2',
    refetchInterval: 30_000,
  });
  const { data: wan25Health } = trpc.runpod.wan25Health.useQuery(undefined, {
    enabled: isSignedIn && selectedModel === 'WAN_25',
    refetchInterval: 30_000,
  });
  const currentHealth = selectedModel === 'LTX2' ? ltx2Health : selectedModel === 'WAN_25' ? wan25Health : null;
  const warmUp = trpc.runpod.warmUp.useMutation();

  // Adaptive poll interval: RunPod/Veo3 generation takes 2–10 min → poll every 10s
  const SLOW_MODELS = ['LTX2', 'WAN_25', 'VEO3'];
  const pollInterval = SLOW_MODELS.includes(selectedModel) ? 10_000 : 4_000;

  const createJob = trpc.generation.create.useMutation({
    onSuccess: (job) => {
      setActiveJobId(job.id);
      refetchBalance();
      if (job.status === 'COMPLETED') {
        setPollEnabled(false);
      } else {
        setPollEnabled(true);
      }
    },
  });
  const { data: jobStatus } = trpc.generation.pollStatus.useQuery(
    { jobId: activeJobId! },
    { enabled: !!activeJobId && pollEnabled, refetchInterval: pollInterval }
  );
  const publishJob = trpc.generation.publish.useMutation({
    onSuccess: (video) => router.push(`/v/${video.id}`),
  });
  const { data: myJobs } = trpc.generation.myJobs.useQuery(
    { limit: 12 },
    { enabled: isSignedIn }
  );

  // Stop polling when job finishes
  useEffect(() => {
    if (jobStatus?.status === 'COMPLETED' || jobStatus?.status === 'FAILED') {
      setPollEnabled(false);
    }
  }, [jobStatus?.status]);

  const currentModel = models?.find((m) => m.id === selectedModel);
  const isVideoModel = currentModel?.maxDuration && currentModel.maxDuration > 0;

  // Veo 3 only supports landscape aspect ratios — auto-switch when model changes
  const VEO3_LANDSCAPE_ONLY = selectedModel === 'VEO3';
  useEffect(() => {
    if (VEO3_LANDSCAPE_ONLY && aspectRatio !== '16:9') {
      setAspectRatio('16:9');
    }
  }, [VEO3_LANDSCAPE_ONLY]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGenerate = () => {
    if (!prompt.trim()) return;
    setActiveJobId(null);
    setShowPublish(false);
    createJob.mutate({
      model:          selectedModel as never,
      prompt:         prompt.trim(),
      negativePrompt: negativePrompt.trim() || undefined,
      duration:       isVideoModel ? duration : undefined,
      aspectRatio,
    });
  };

  const historyJob = activeJobId ? (myJobs?.jobs.find(j => j.id === activeJobId) ?? null) : null;
  const activeJob = jobStatus ?? historyJob;
  const isGenerating = createJob.isPending || (pollEnabled && activeJob?.status !== 'COMPLETED' && activeJob?.status !== 'FAILED');

  if (isLoaded && !isSignedIn) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4">
        <Navbar />
        <p className="text-white/60 text-lg">Sign in to generate AI videos</p>
        <a href="/sign-in" className="bg-pink-500 hover:bg-pink-600 text-white px-6 py-2.5 rounded-full font-semibold transition-colors">
          Sign in
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 pt-20 pb-16">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-extrabold mb-2 bg-gradient-to-r from-pink-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">
            AI Video Studio
          </h1>
          <p className="text-white/50 text-sm">Generate short-form videos with state-of-the-art AI models</p>
          {isSignedIn && (
            <div className="inline-flex items-center gap-2 mt-4 bg-white/5 border border-white/10 rounded-full px-4 py-1.5">
              <svg className="w-3.5 h-3.5 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-white font-semibold text-sm">{balance.toLocaleString()}</span>
              <span className="text-white/40 text-xs">credits</span>
              <a href="/credits" className="text-pink-400 hover:text-pink-300 text-xs font-medium ml-1 transition-colors">+ Buy</a>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ── Left: Model selector + form ── */}
          <div className="lg:col-span-2 space-y-6">

            {/* Model cards */}
            <div>
              <h2 className="text-sm font-semibold text-white/40 uppercase tracking-widest mb-3">Choose a Model</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {(models ?? []).map((model) => {
                  const isCS = model.badge === 'coming-soon';

                  // Health dot for RunPod models
                  const isRunpod = model.id === 'LTX2' || model.id === 'WAN_25';
                  const health = model.id === 'LTX2' ? ltx2Health : model.id === 'WAN_25' ? wan25Health : null;
                  let healthDot: React.ReactNode = null;
                  if (isRunpod && health) {
                    if (!health.configured) {
                      healthDot = <span className="w-1.5 h-1.5 rounded-full bg-white/20" title="Not configured" />;
                    } else if (health.isReady) {
                      healthDot = <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Workers ready" />;
                    } else {
                      healthDot = <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Cold — first job may take 3–4 min" />;
                    }
                  }

                  return (
                    <button
                      key={model.id}
                      onClick={() => !isCS && setSelectedModel(model.id)}
                      disabled={isCS}
                      className={`relative rounded-2xl p-4 text-left border transition-all ${
                        selectedModel === model.id
                          ? 'border-pink-500 bg-pink-500/10'
                          : isCS
                          ? 'border-white/5 bg-white/[0.02] opacity-50 cursor-not-allowed'
                          : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                      }`}
                    >
                      {/* Health indicator dot (top-right) */}
                      {healthDot && (
                        <span className="absolute top-3 right-3 flex items-center">{healthDot}</span>
                      )}

                      <span className="text-2xl mb-2 block">{model.icon}</span>
                      <p className="font-semibold text-sm text-white">{model.label}</p>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${BADGE_STYLES[model.badge as Model['badge']]}`}>
                          {BADGE_LABELS[model.badge as Model['badge']]}
                        </span>
                        {model.creditCost != null && (
                          <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full bg-pink-500/10 text-pink-300 border border-pink-500/20">
                            {model.creditCost} cr
                          </span>
                        )}
                      </div>
                      <p className="text-white/40 text-xs mt-2 leading-snug line-clamp-2">{model.description}</p>
                    </button>
                  );
                })}
              </div>

              {/* RunPod warm-up banner — shown when selected model is cold */}
              {isRunpodModel && currentHealth?.configured && !currentHealth?.isReady && (
                <div className="mt-3 flex items-center justify-between gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
                    <p className="text-amber-300 text-xs">
                      GPU workers are cold — first job will take <span className="font-semibold">3–4 min</span> to warm up.
                    </p>
                  </div>
                  <button
                    onClick={() => warmUp.mutate({ model: selectedModel as 'LTX2' | 'WAN_25' })}
                    disabled={warmUp.isPending}
                    className="flex-shrink-0 text-[11px] font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 px-3 py-1 rounded-lg transition-colors"
                  >
                    {warmUp.isPending ? 'Pinging…' : '⚡ Wake up'}
                  </button>
                </div>
              )}

              {/* RunPod timing info — shown when selected model is ready or cold */}
              {isRunpodModel && currentHealth?.configured && (
                <p className="mt-2 text-xs text-white/25 text-center">
                  RunPod generation typically takes <span className="text-white/40">2–5 minutes</span>. Progress updates every 10 seconds.
                </p>
              )}

              {/* RunPod not configured notice */}
              {isRunpodModel && currentHealth && !currentHealth.configured && (
                <div className="mt-3 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5">
                  <p className="text-white/40 text-xs text-center">
                    {selectedModel === 'LTX2' ? 'RUNPOD_LTX2_ENDPOINT_ID' : 'RUNPOD_WAN25_ENDPOINT_ID'} is not set in environment variables.
                  </p>
                </div>
              )}
            </div>

            {/* Prompt */}
            <div className="bg-white/5 rounded-2xl border border-white/10 p-5 space-y-4">
              <div>
                <label className="text-xs text-white/50 font-medium uppercase tracking-wider block mb-2">Prompt</label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe the video you want to generate…"
                  maxLength={500}
                  rows={3}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/25 text-sm resize-none focus:outline-none focus:border-pink-500/60 transition-colors"
                />
                <p className="text-right text-white/25 text-xs mt-1">{prompt.length}/500</p>
              </div>

              {/* Aspect ratio */}
              <div>
                <label className="text-xs text-white/50 font-medium uppercase tracking-wider block mb-2">Format</label>
                <div className="flex gap-2">
                  {AR_OPTIONS.map((ar) => {
                    const blocked = VEO3_LANDSCAPE_ONLY && ar.value !== '16:9';
                    return (
                      <button
                        key={ar.value}
                        onClick={() => !blocked && setAspectRatio(ar.value)}
                        disabled={blocked}
                        title={blocked ? 'Veo 3 only supports landscape (16:9)' : undefined}
                        className={`flex-1 py-2 rounded-xl border text-xs font-semibold transition-all ${
                          blocked
                            ? 'border-white/5 bg-white/[0.02] text-white/20 cursor-not-allowed'
                            : aspectRatio === ar.value
                              ? 'border-pink-500 bg-pink-500/20 text-pink-300'
                              : 'border-white/10 bg-white/5 text-white/50 hover:border-white/20'
                        }`}
                      >
                        <span className="block text-lg mb-0.5">{ar.icon}</span>
                        {ar.label}
                      </button>
                    );
                  })}
                </div>
                {VEO3_LANDSCAPE_ONLY && (
                  <p className="text-amber-400/70 text-xs mt-1.5 flex items-center gap-1">
                    <svg className="w-3 h-3 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                    </svg>
                    Veo 3 only supports Landscape — portrait and square are not available
                  </p>
                )}
              </div>

              {/* Duration — only for video models */}
              {isVideoModel && (
                <div>
                  <label className="text-xs text-white/50 font-medium uppercase tracking-wider block mb-2">
                    Duration — {duration}s
                  </label>
                  <input
                    type="range"
                    min={currentModel?.minDuration ?? 1}
                    max={currentModel?.maxDuration ?? 10}
                    value={Math.max(currentModel?.minDuration ?? 1, Math.min(currentModel?.maxDuration ?? 10, duration))}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    className="w-full accent-pink-500"
                  />
                  <div className="flex justify-between text-xs text-white/25 mt-1">
                    <span>{currentModel?.minDuration ?? 1}s</span>
                    <span>{currentModel?.maxDuration ?? 10}s</span>
                  </div>
                </div>
              )}

              {/* Advanced toggle */}
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-xs text-white/40 hover:text-white/70 flex items-center gap-1 transition-colors"
              >
                <span>{showAdvanced ? '▲' : '▼'}</span> Advanced options
              </button>

              {showAdvanced && (
                <div>
                  <label className="text-xs text-white/50 font-medium uppercase tracking-wider block mb-2">Negative Prompt</label>
                  <textarea
                    value={negativePrompt}
                    onChange={(e) => setNegativePrompt(e.target.value)}
                    placeholder="What to avoid in the output…"
                    maxLength={300}
                    rows={2}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/25 text-sm resize-none focus:outline-none focus:border-pink-500/60 transition-colors"
                  />
                </div>
              )}

              {/* Generate button */}
              <button
                onClick={handleGenerate}
                disabled={!prompt.trim() || isGenerating}
                className="w-full py-3 rounded-2xl font-bold text-sm bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {isGenerating ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    ✨ Generate
                    {currentModel?.creditCost != null && (
                      <span className="opacity-70 font-normal text-xs">({currentModel.creditCost} credits)</span>
                    )}
                  </>
                )}
              </button>

              {createJob.error && (
                createJob.error.message.includes('Insufficient credits') ? (
                  <div className="bg-amber-500/10 rounded-xl px-4 py-3 border border-amber-500/20 flex items-center justify-between gap-3">
                    <p className="text-amber-300 text-xs">{createJob.error.message}</p>
                    <a
                      href="/credits"
                      className="flex-shrink-0 text-xs font-semibold bg-pink-500 hover:bg-pink-600 text-white px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Buy Credits
                    </a>
                  </div>
                ) : (
                  <p className="text-red-400 text-xs bg-red-500/10 rounded-xl px-4 py-2 border border-red-500/20">
                    {createJob.error.message}
                  </p>
                )
              )}
            </div>
          </div>

          {/* ── Right: Output + history ── */}
          <div className="space-y-6">

            {/* Current output */}
            <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
              <div className="p-4 border-b border-white/10">
                <h3 className="font-semibold text-sm">Output</h3>
              </div>
              <div className="p-4">
                {!activeJob && !isGenerating ? (
                  <div className="aspect-[9/16] flex items-center justify-center text-white/20 text-4xl bg-white/5 rounded-xl">
                    ✨
                  </div>
                ) : isGenerating && !activeJob?.outputUrl ? (
                  <div className="aspect-[9/16] flex flex-col items-center justify-center gap-3 bg-white/5 rounded-xl px-6">
                    <div className="w-8 h-8 border-2 border-pink-500/30 border-t-pink-500 rounded-full animate-spin" />
                    <p className="text-xs text-white/40 capitalize">{activeJob?.status?.toLowerCase() ?? 'Queued'}…</p>
                    {SLOW_MODELS.includes(selectedModel) && (
                      <p className="text-[10px] text-white/25 text-center leading-relaxed">
                        {selectedModel === 'VEO3'
                          ? 'Veo 3 typically takes 2–3 minutes'
                          : 'RunPod generation takes 2–5 minutes.\nUpdating every 10 seconds.'}
                      </p>
                    )}
                  </div>
                ) : activeJob?.status === 'FAILED' ? (
                  <div className="aspect-[9/16] flex flex-col items-center justify-center gap-2 bg-red-500/5 rounded-xl border border-red-500/20">
                    <span className="text-3xl">⚠️</span>
                    <p className="text-xs text-red-400 text-center px-4">{activeJob.errorMessage ?? 'Generation failed'}</p>
                  </div>
                ) : activeJob?.outputUrl ? (
                  <div className="space-y-3">
                    {/* Show image for image-only models (maxDuration === 0), video for others */}
                    {!isVideoModel ? (
                      <img
                        src={activeJob.outputUrl}
                        alt="Generated"
                        className="w-full rounded-xl object-cover"
                      />
                    ) : (
                      <video
                        src={activeJob.outputUrl}
                        controls
                        loop
                        className="w-full rounded-xl"
                      />
                    )}

                    {/* Download button */}
                    <button
                      onClick={async () => {
                        if (!activeJob?.outputUrl) return;
                        try {
                          const res = await fetch(activeJob.outputUrl);
                          const blob = await res.blob();
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          const ext = isVideoModel ? 'mp4' : 'png';
                          a.download = `raivstream-${activeJob.id.slice(0, 8)}.${ext}`;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          URL.revokeObjectURL(url);
                        } catch {
                          window.open(activeJob.outputUrl, '_blank');
                        }
                      }}
                      className="w-full py-2 rounded-xl text-sm font-medium border border-white/20 hover:border-white/40 text-white/70 hover:text-white transition-colors flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download
                    </button>

                    {!showPublish ? (
                      <button
                        onClick={() => {
                          setShowPublish(true);
                          setPubTitle(prompt.slice(0, 60));
                        }}
                        className="w-full py-2 rounded-xl text-sm font-semibold bg-pink-500 hover:bg-pink-600 transition-colors"
                      >
                        Publish to Feed
                      </button>
                    ) : (
                      <div className="space-y-3">
                        <input
                          value={pubTitle}
                          onChange={(e) => setPubTitle(e.target.value)}
                          placeholder="Video title"
                          maxLength={100}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-pink-500/60"
                        />
                        <input
                          value={pubTags}
                          onChange={(e) => setPubTags(e.target.value)}
                          placeholder="Tags (comma separated)"
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-pink-500/60"
                        />
                        <button
                          onClick={() => publishJob.mutate({
                            jobId: activeJob.id,
                            title: pubTitle || prompt.slice(0, 60),
                            tags: pubTags.split(',').map(t => t.trim()).filter(Boolean),
                          })}
                          disabled={publishJob.isPending}
                          className="w-full py-2 rounded-xl text-sm font-semibold bg-pink-500 hover:bg-pink-600 disabled:opacity-50 transition-colors"
                        >
                          {publishJob.isPending ? 'Publishing…' : 'Confirm & Publish'}
                        </button>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>

            {/* History */}
            {myJobs?.jobs && myJobs.jobs.length > 0 && (
              <div>
                <h3 className="text-xs text-white/40 uppercase tracking-wider font-semibold mb-3">Recent Generations</h3>
                <div className="grid grid-cols-3 gap-1.5">
                  {myJobs.jobs.map((job) => (
                    <button
                      key={job.id}
                      onClick={() => setActiveJobId(job.id)}
                      className={`relative aspect-[9/16] rounded-lg overflow-hidden border transition-all ${
                        activeJobId === job.id ? 'border-pink-500' : 'border-white/10 hover:border-white/30'
                      }`}
                    >
                      {job.thumbnailUrl || job.outputUrl ? (
                        <img
                          src={job.thumbnailUrl ?? job.outputUrl!}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-white/5 flex items-center justify-center text-xs text-white/20">
                          {job.status === 'FAILED' ? '✗' : job.status === 'COMPLETED' ? '✓' : '…'}
                        </div>
                      )}
                      <div className={`absolute inset-0 flex items-end p-1 ${
                        job.status === 'FAILED' ? 'bg-red-900/40' : 'bg-gradient-to-t from-black/60 to-transparent'
                      }`}>
                        <span className="text-[9px] text-white/70 line-clamp-1">{job.prompt}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
