'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/layout/Navbar';
import { useUser } from '@/lib/auth';
import { trpc } from '@/lib/trpc';

type GenerationMode = 'image' | 'video';
type AspectRatio    = '9:16' | '16:9' | '1:1';

const AR_OPTIONS: { value: AspectRatio; label: string; icon: string }[] = [
  { value: '9:16', label: 'Portrait',  icon: '▯' },
  { value: '16:9', label: 'Landscape', icon: '▭' },
  { value: '1:1',  label: 'Square',    icon: '□' },
];

const DEFAULT_IMAGE_MODEL = 'FLUX';
const DEFAULT_VIDEO_MODEL = 'WAN_25';
const SLOW_MODELS         = ['LTX2', 'WAN_25', 'SEEDANCE', 'HUNYUAN_VIDEO', 'COG_VIDEO_X'];
const HIDDEN_MODELS       = ['NANO_BANANA', 'VEO3'];
const PROMPT_MAX_LENGTH   = 2000;
const NEGATIVE_PROMPT_MAX_LENGTH = 500;

export default function GeneratePage() {
  const router = useRouter();
  const { isSignedIn, isLoaded } = useUser();

  const [generationMode, setGenerationMode] = useState<GenerationMode>('video');
  const [selectedModel,  setSelectedModel]  = useState<string>(DEFAULT_VIDEO_MODEL);
  const [prompt,         setPrompt]         = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [seedImageUrl,   setSeedImageUrl]   = useState('');
  const [duration,       setDuration]       = useState(5);
  const [aspectRatio,    setAspectRatio]    = useState<AspectRatio>('9:16');
  const [showAdvanced,   setShowAdvanced]   = useState(false);
  const [activeJobId,    setActiveJobId]    = useState<string | null>(null);
  const [pollEnabled,    setPollEnabled]    = useState(false);
  const [showPublish,    setShowPublish]    = useState(false);
  const [pubTitle,       setPubTitle]       = useState('');
  const [pubTags,        setPubTags]        = useState('');
  const [storyProjectId, setStoryProjectId] = useState<string | null>(null);
  const [storyboardShotId, setStoryboardShotId] = useState<string | null>(null);
  const [savedStoryboardOutputId, setSavedStoryboardOutputId] = useState<string | null>(null);

  const { data: models }                               = trpc.generation.listModels.useQuery();
  const { data: balanceData, refetch: refetchBalance } = trpc.user.creditBalance.useQuery(
    undefined, { enabled: isSignedIn }
  );
  const balance = balanceData?.balance ?? 0;

  // Filter models by mode, excluding always-hidden models as a client-side safety net
  const visibleModels = (models ?? []).filter(
    (m) => m.mediaType === generationMode && !HIDDEN_MODELS.includes(m.id)
  );
  const currentModel  = visibleModels.find((m) => m.id === selectedModel)
    ?? visibleModels[0];

  const needsSeedImage = currentModel?.requiresSeedImage && !seedImageUrl.trim();
  const pollInterval   = SLOW_MODELS.includes(selectedModel) ? 10_000 : 4_000;

  const switchMode = (mode: GenerationMode) => {
    setGenerationMode(mode);
    setSelectedModel(mode === 'image' ? DEFAULT_IMAGE_MODEL : DEFAULT_VIDEO_MODEL);
    setActiveJobId(null);
    setShowPublish(false);
  };

  const createJob = trpc.generation.create.useMutation({
    onSuccess: (job) => {
      setActiveJobId(job.id);
      refetchBalance();
      setPollEnabled(job.status !== 'COMPLETED');
      if (storyProjectId && storyboardShotId) {
        updateStoryboardShot.mutate({
          projectId: storyProjectId,
          shotId: storyboardShotId,
          generationJobId: job.id,
          ...(job.outputUrl ? { assetUrl: job.outputUrl, seedImageUrl: job.outputUrl } : {}),
        });
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

  const updateStoryboardShot = trpc.story.updateShot.useMutation();

  const { data: myJobs } = trpc.generation.myJobs.useQuery(
    { limit: 12 }, { enabled: isSignedIn }
  );

  const historyJob   = activeJobId ? (myJobs?.jobs.find((j: { id: string }) => j.id === activeJobId) ?? null) : null;
  const activeJob    = jobStatus ?? historyJob;
  const isGenerating = createJob.isPending
    || (pollEnabled && activeJob?.status !== 'COMPLETED' && activeJob?.status !== 'FAILED');

  useEffect(() => {
    if (jobStatus?.status === 'COMPLETED' || jobStatus?.status === 'FAILED') {
      setPollEnabled(false);
    }
  }, [jobStatus?.status]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    const promptParam = params.get('prompt');
    const negativePromptParam = params.get('negativePrompt');
    const seedParam = params.get('seedImageUrl');
    const durationParam = params.get('duration');
    const aspectParam = params.get('aspectRatio');

    if (mode === 'image' || mode === 'video') {
      setGenerationMode(mode);
      setSelectedModel(mode === 'image' ? DEFAULT_IMAGE_MODEL : DEFAULT_VIDEO_MODEL);
    }
    if (promptParam) setPrompt(promptParam);
    if (negativePromptParam) setNegativePrompt(negativePromptParam);
    if (seedParam) setSeedImageUrl(seedParam);
    if (durationParam) setDuration(Number(durationParam));
    if (aspectParam === '9:16' || aspectParam === '16:9' || aspectParam === '1:1') {
      setAspectRatio(aspectParam);
    }
    setStoryProjectId(params.get('storyProjectId'));
    setStoryboardShotId(params.get('storyboardShotId'));
  }, []);

  useEffect(() => {
    if (
      !storyProjectId ||
      !storyboardShotId ||
      !activeJob?.id ||
      !activeJob.outputUrl ||
      activeJob.status !== 'COMPLETED' ||
      savedStoryboardOutputId === activeJob.id
    ) {
      return;
    }

    updateStoryboardShot.mutate({
      projectId: storyProjectId,
      shotId: storyboardShotId,
      assetUrl: activeJob.outputUrl,
      seedImageUrl: activeJob.outputUrl,
      generationJobId: activeJob.id,
    });
    setSavedStoryboardOutputId(activeJob.id);
  }, [activeJob, savedStoryboardOutputId, storyboardShotId, storyProjectId, updateStoryboardShot]);

  const handleGenerate = () => {
    if (!prompt.trim() || needsSeedImage || isGenerating) return;
    setActiveJobId(null);
    setShowPublish(false);
    createJob.mutate({
      model:          selectedModel as never,
      prompt:         prompt.trim(),
      negativePrompt: negativePrompt.trim() || undefined,
      duration:       generationMode === 'video' ? duration : undefined,
      aspectRatio,
      seedImageUrl:   seedImageUrl.trim() || undefined,
    });
  };

  if (isLoaded && !isSignedIn) {
    return (
      <div className="min-h-screen bg-[var(--noc-page)] flex flex-col items-center justify-center gap-4">
        <Navbar />
        <p className="text-[var(--noc-t4)] text-lg">Sign in to use AI Studio</p>
        <a href="/sign-in" className="bg-[var(--noc-magenta)] hover:opacity-90 text-white px-6 py-2.5 rounded-full font-semibold transition-opacity">
          Sign in
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--noc-page)] text-[var(--noc-t1)]">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 pt-20 pb-16">

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-extrabold mb-2 bg-gradient-to-r from-[var(--noc-magenta)] via-[var(--noc-purple)] to-[var(--noc-blue)] bg-clip-text text-transparent">
            AI Studio
          </h1>
          <p className="text-[var(--noc-t4)] text-sm">Generate images and videos with state-of-the-art AI</p>
          {isSignedIn && (
            <div className="inline-flex items-center gap-2 mt-4 bg-[var(--noc-card)] border border-[var(--noc-hairline)] rounded-full px-4 py-1.5">
              <svg className="w-3.5 h-3.5 text-[var(--noc-magenta)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-white font-semibold text-sm">{balance.toLocaleString()}</span>
              <span className="text-[var(--noc-t5)] text-xs">credits</span>
              <a href="/credits" className="text-[var(--noc-magenta)] hover:text-[var(--noc-pink-tint)] text-xs font-medium ml-1 transition-colors">+ Buy</a>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ── Left: controls ── */}
          <div className="lg:col-span-2 space-y-5">
            <div className="bg-[var(--noc-card)] rounded-2xl border border-[var(--noc-hairline)] p-5 space-y-5">

              {/* Step 1 — Output type radio */}
              <div>
                <label className="text-xs text-[var(--noc-t5)] font-medium uppercase tracking-wider block mb-3">
                  1 · Output Type
                </label>
                <div className="flex gap-3">
                  {(['image', 'video'] as GenerationMode[]).map((mode) => (
                    <label
                      key={mode}
                      className={`flex-1 flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-all ${
                        generationMode === mode
                          ? 'border-[#d946a8] bg-[rgba(217,70,168,0.1)]'
                          : 'border-[rgba(233,233,237,0.08)] bg-[rgba(233,233,237,0.04)] hover:border-[rgba(233,233,237,0.15)]'
                      }`}
                    >
                      <input
                        type="radio"
                        name="generationMode"
                        value={mode}
                        checked={generationMode === mode}
                        onChange={() => switchMode(mode)}
                        className="accent-pink-500 w-4 h-4"
                      />
                      <span className="font-semibold text-sm capitalize">
                        {mode === 'image' ? '🖼 Image' : '🎬 Video'}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Step 2 — Model dropdown */}
              <div>
                <label htmlFor="model-select" className="text-xs text-white/50 font-medium uppercase tracking-wider block mb-3">
                  2 · Model
                </label>
                <div className="relative">
                  <select
                    id="model-select"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full appearance-none bg-[var(--noc-card)] border border-[var(--noc-hairline)] rounded-xl px-4 py-3 text-[var(--noc-t1)] text-sm focus:outline-none focus:border-[var(--noc-magenta)]/60 transition-colors cursor-pointer pr-10"
                  >
                    {visibleModels.map((m) => (
                      <option key={m.id} value={m.id} disabled={m.badge === 'coming-soon'}
                        className="bg-[var(--noc-page)] text-[var(--noc-t1)]"
                      >
                        {m.badge === 'coming-soon' ? `${m.label} (Coming Soon)` : m.creditCost != null
                          ? `${m.icon}  ${m.label}  —  ${m.creditCost} credits`
                          : `${m.icon}  ${m.label}`}
                      </option>
                    ))}
                  </select>
                  {/* Chevron icon */}
                  <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                    <svg className="w-4 h-4 text-[var(--noc-t5)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {/* Selected model info strip */}
                {currentModel && (
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      currentModel.badge === 'live'          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                      currentModel.badge === 'beta'          ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                      'bg-[var(--noc-card)] text-[var(--noc-t5)] border-[var(--noc-hairline)]'
                    }`}>
                      {currentModel.badge === 'live' ? 'Live' : currentModel.badge === 'beta' ? 'Beta' : 'Coming Soon'}
                    </span>
                    <span className="text-[var(--noc-t6)] text-xs">{currentModel.provider}</span>
                    {currentModel.requiresSeedImage && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20">
                        Image-to-Video
                      </span>
                    )}
                    {currentModel.supportsImageToVideo && !currentModel.requiresSeedImage && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                        Supports I2V
                      </span>
                    )}
                    <p className="w-full text-[var(--noc-t6)] text-xs mt-0.5">{currentModel.description}</p>
                  </div>
                )}
              </div>

              {/* Step 3 — Prompt */}
              <div>
                <label className="text-xs text-[var(--noc-t5)] font-medium uppercase tracking-wider block mb-2">
                  3 · Prompt
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={generationMode === 'video'
                    ? 'Describe the video you want to generate…'
                    : 'Describe the image you want to generate…'}
                  maxLength={PROMPT_MAX_LENGTH}
                  rows={5}
                  className="w-full bg-[var(--noc-card)] border border-[var(--noc-hairline)] rounded-xl px-4 py-3 text-[var(--noc-t1)] placeholder-[var(--noc-t6)] text-sm resize-none focus:outline-none focus:border-[var(--noc-magenta)]/60 transition-colors"
                />
                <p className="text-right text-[var(--noc-t6)] text-xs mt-1">{prompt.length}/{PROMPT_MAX_LENGTH}</p>
              </div>

              {/* Seed image URL — video mode only */}
              {generationMode === 'video' && (
                <div>
                  <label className="text-xs text-[var(--noc-t5)] font-medium uppercase tracking-wider block mb-2">
                    Seed Image URL
                    {currentModel?.requiresSeedImage
                      ? <span className="text-[var(--noc-magenta)] ml-1 normal-case">* required for {currentModel.label}</span>
                      : <span className="text-[var(--noc-t6)] ml-1 normal-case">(optional)</span>}
                  </label>
                  <input
                    type="url"
                    value={seedImageUrl}
                    onChange={(e) => setSeedImageUrl(e.target.value)}
                    placeholder="https://example.com/image.jpg"
                    className={`w-full bg-[var(--noc-card)] border rounded-xl px-4 py-2.5 text-[var(--noc-t1)] placeholder-[var(--noc-t6)] text-sm focus:outline-none transition-colors ${
                      needsSeedImage ? 'border-[var(--noc-magenta)]/70' : 'border-[var(--noc-hairline)] focus:border-[var(--noc-magenta)]/60'
                    }`}
                  />
                  {needsSeedImage && (
                    <p className="text-[var(--noc-magenta)] text-xs mt-1.5 flex items-center gap-1.5">
                      <svg className="w-3 h-3 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                      </svg>
                      Wan 2.5 is image-to-video and requires a seed image. Switch to Seedance for text-to-video.
                    </p>
                  )}
                </div>
              )}

              {/* Aspect ratio */}
              <div>
                <label className="text-xs text-[var(--noc-t5)] font-medium uppercase tracking-wider block mb-2">Format</label>
                <div className="flex gap-2">
                  {AR_OPTIONS.map((ar) => (
                    <button
                      key={ar.value}
                      onClick={() => setAspectRatio(ar.value)}
                      className={`flex-1 py-2 rounded-xl border text-xs font-semibold transition-all ${
                        aspectRatio === ar.value
                          ? 'border-[#d946a8] bg-[rgba(217,70,168,0.2)] text-[#f0a3d4]'
                          : 'border-[rgba(233,233,237,0.08)] bg-[rgba(233,233,237,0.04)] text-[#9397ab] hover:border-[rgba(233,233,237,0.15)]'
                      }`}
                    >
                      <span className="block text-lg mb-0.5">{ar.icon}</span>
                      {ar.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Duration — video only */}
              {generationMode === 'video' && (
                <div>
                  <label className="text-xs text-[var(--noc-t5)] font-medium uppercase tracking-wider block mb-2">
                    Duration — {duration}s
                  </label>
                  <input
                    type="range"
                    min={currentModel?.minDuration ?? 1}
                    max={currentModel?.maxDuration ?? 10}
                    value={Math.max(currentModel?.minDuration ?? 1, Math.min(currentModel?.maxDuration ?? 10, duration))}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    className="w-full accent-[var(--noc-magenta)]"
                  />
                  <div className="flex justify-between text-xs text-[var(--noc-t6)] mt-1">
                    <span>{currentModel?.minDuration ?? 1}s</span>
                    <span>{currentModel?.maxDuration ?? 10}s</span>
                  </div>
                </div>
              )}

              {/* Advanced */}
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-xs text-[var(--noc-t5)] hover:text-[var(--noc-t3)] flex items-center gap-1 transition-colors"
              >
                <span>{showAdvanced ? '▲' : '▼'}</span> Advanced options
              </button>
              {showAdvanced && (
                <div>
                  <label className="text-xs text-[var(--noc-t5)] font-medium uppercase tracking-wider block mb-2">Negative Prompt</label>
                  <textarea
                    value={negativePrompt}
                    onChange={(e) => setNegativePrompt(e.target.value)}
                    placeholder="What to avoid in the output…"
                    maxLength={NEGATIVE_PROMPT_MAX_LENGTH}
                    rows={2}
                    className="w-full bg-[var(--noc-card)] border border-[var(--noc-hairline)] rounded-xl px-4 py-3 text-[var(--noc-t1)] placeholder-[var(--noc-t6)] text-sm resize-none focus:outline-none focus:border-[var(--noc-magenta)]/60 transition-colors"
                  />
                </div>
              )}

              {/* Generate */}
              <button
                onClick={handleGenerate}
                disabled={!prompt.trim() || isGenerating || !!needsSeedImage}
                className="w-full py-3 rounded-2xl font-bold text-sm bg-gradient-to-r from-[var(--noc-magenta)] to-[var(--noc-purple)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity flex items-center justify-center gap-2"
              >
                {isGenerating ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    ✨ Generate {generationMode === 'image' ? 'Image' : 'Video'}
                    {currentModel?.creditCost != null && (
                      <span className="opacity-70 font-normal text-xs">({currentModel.creditCost} credits)</span>
                    )}
                  </>
                )}
              </button>

              {SLOW_MODELS.includes(selectedModel) && (
                <p className="text-xs text-[var(--noc-t6)] text-center">
                  {currentModel?.label} typically takes <span className="text-[var(--noc-t5)]">1–5 minutes</span>. Updates every 10 s.
                </p>
              )}

              {createJob.error && (
                createJob.error.message.includes('Insufficient credits') ? (
                  <div className="bg-amber-500/10 rounded-xl px-4 py-3 border border-amber-500/20 flex items-center justify-between gap-3">
                    <p className="text-amber-300 text-xs">{createJob.error.message}</p>
                    <a href="/credits" className="flex-shrink-0 text-xs font-semibold bg-[var(--noc-magenta)] hover:opacity-90 text-white px-3 py-1.5 rounded-lg transition-opacity">
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
            <div className="bg-[var(--noc-card)] rounded-2xl border border-[var(--noc-hairline)] overflow-hidden">
              <div className="p-4 border-b border-[var(--noc-hairline)]">
                <h3 className="font-semibold text-sm">Output</h3>
              </div>
              <div className="p-4">
                {!activeJob && !isGenerating ? (
                  <div className="aspect-[9/16] flex items-center justify-center text-[var(--noc-t6)] text-4xl bg-[var(--noc-card)] rounded-xl">✨</div>
                ) : isGenerating && !activeJob?.outputUrl ? (
                  <div className="aspect-[9/16] flex flex-col items-center justify-center gap-3 bg-[var(--noc-card)] rounded-xl px-6">
                    <div className="w-8 h-8 border-2 border-[var(--noc-magenta)]/30 border-t-[var(--noc-magenta)] rounded-full animate-spin" />
                    <p className="text-xs text-[var(--noc-t4)] capitalize">{activeJob?.status?.toLowerCase() ?? 'Queued'}…</p>
                    {SLOW_MODELS.includes(selectedModel) && (
                      <p className="text-[10px] text-[var(--noc-t6)] text-center leading-relaxed">
                        {currentModel?.label} takes 1–5 minutes.{'\n'}Updating every 10 s.
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
                    {generationMode === 'image' ? (
                      <img src={activeJob.outputUrl} alt="Generated" className="w-full rounded-xl object-cover" />
                    ) : (
                      <video src={activeJob.outputUrl} controls loop className="w-full rounded-xl" />
                    )}
                    <button
                      onClick={async () => {
                        if (!activeJob?.outputUrl) return;
                        try {
                          const res = await fetch(activeJob.outputUrl);
                          const blob = await res.blob();
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `raivstream-${activeJob.id.slice(0, 8)}.${generationMode === 'image' ? 'jpg' : 'mp4'}`;
                          document.body.appendChild(a); a.click();
                          document.body.removeChild(a);
                          URL.revokeObjectURL(url);
                        } catch { window.open(activeJob.outputUrl, '_blank'); }
                      }}
                      className="w-full py-2 rounded-xl text-sm font-medium border border-[var(--noc-hairline)] hover:border-[var(--noc-t5)] text-[var(--noc-t4)] hover:text-[var(--noc-t1)] transition-colors flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download
                    </button>
                    {!showPublish ? (
                      <button
                        onClick={() => { setShowPublish(true); setPubTitle(prompt.slice(0, 60)); }}
                        className="w-full py-2 rounded-xl text-sm font-semibold bg-[var(--noc-magenta)] hover:opacity-90 transition-opacity"
                      >
                        Publish to Feed
                      </button>
                    ) : (
                      <div className="space-y-3">
                        <input value={pubTitle} onChange={(e) => setPubTitle(e.target.value)} placeholder="Title" maxLength={100}
                          className="w-full bg-[var(--noc-card)] border border-[var(--noc-hairline)] rounded-xl px-3 py-2 text-sm text-[var(--noc-t1)] placeholder-[var(--noc-t6)] focus:outline-none focus:border-[var(--noc-magenta)]/60" />
                        <input value={pubTags} onChange={(e) => setPubTags(e.target.value)} placeholder="Tags (comma separated)"
                          className="w-full bg-[var(--noc-card)] border border-[var(--noc-hairline)] rounded-xl px-3 py-2 text-sm text-[var(--noc-t1)] placeholder-[var(--noc-t6)] focus:outline-none focus:border-[var(--noc-magenta)]/60" />
                        <button
                          onClick={() => publishJob.mutate({ jobId: activeJob.id, title: pubTitle || prompt.slice(0, 60), tags: pubTags.split(',').map(t => t.trim()).filter(Boolean) })}
                          disabled={publishJob.isPending}
                          className="w-full py-2 rounded-xl text-sm font-semibold bg-[var(--noc-magenta)] hover:opacity-90 disabled:opacity-50 transition-opacity"
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
                <h3 className="text-xs text-[var(--noc-t5)] uppercase tracking-wider font-semibold mb-3">Recent Generations</h3>
                <div className="grid grid-cols-3 gap-1.5">
                  {myJobs.jobs.map((job: { id: string; thumbnailUrl: string | null; outputUrl: string | null; status: string; prompt: string }) => (
                    <button key={job.id} onClick={() => setActiveJobId(job.id)}
                      className={`relative aspect-[9/16] rounded-lg overflow-hidden border transition-all ${
                        activeJobId === job.id ? 'border-[#d946a8]' : 'border-[rgba(233,233,237,0.08)] hover:border-[rgba(233,233,237,0.2)]'
                      }`}
                    >
                      {job.thumbnailUrl ? (
                        <img src={job.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                      ) : job.outputUrl && /\.(mp4|webm|mov)(\?|$)/i.test(job.outputUrl) ? (
                        <video src={job.outputUrl} className="w-full h-full object-cover" preload="metadata" muted playsInline />
                      ) : job.outputUrl ? (
                        <img src={job.outputUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-[var(--noc-card)] flex items-center justify-center text-xs text-[var(--noc-t6)]">
                          {job.status === 'FAILED' ? '✗' : job.status === 'COMPLETED' ? '▶' : '…'}
                        </div>
                      )}
                      <div className={`absolute inset-0 flex items-end p-1 ${job.status === 'FAILED' ? 'bg-red-900/40' : 'bg-gradient-to-t from-black/60 to-transparent'}`}>
                        <span className="text-[9px] text-[var(--noc-t3)] line-clamp-1">{job.prompt}</span>
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
