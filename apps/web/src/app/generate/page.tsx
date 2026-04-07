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
  maxDuration: number;
  supportsImageToVideo: boolean;
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
  const createJob = trpc.generation.create.useMutation({
    onSuccess: (job) => {
      setActiveJobId(job.id);
      if (job.status === 'COMPLETED') {
        setPollEnabled(false);
      } else {
        setPollEnabled(true);
      }
    },
  });
  const { data: jobStatus, refetch: refetchJob } = trpc.generation.pollStatus.useQuery(
    { jobId: activeJobId! },
    { enabled: !!activeJobId && pollEnabled, refetchInterval: 3000 }
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
                      <span className="text-2xl mb-2 block">{model.icon}</span>
                      <p className="font-semibold text-sm text-white">{model.label}</p>
                      <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mt-1.5 ${BADGE_STYLES[model.badge as Model['badge']]}`}>
                        {BADGE_LABELS[model.badge as Model['badge']]}
                      </span>
                      <p className="text-white/40 text-xs mt-2 leading-snug line-clamp-2">{model.description}</p>
                    </button>
                  );
                })}
              </div>
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
                  {AR_OPTIONS.map((ar) => (
                    <button
                      key={ar.value}
                      onClick={() => setAspectRatio(ar.value)}
                      className={`flex-1 py-2 rounded-xl border text-xs font-semibold transition-all ${
                        aspectRatio === ar.value
                          ? 'border-pink-500 bg-pink-500/20 text-pink-300'
                          : 'border-white/10 bg-white/5 text-white/50 hover:border-white/20'
                      }`}
                    >
                      <span className="block text-lg mb-0.5">{ar.icon}</span>
                      {ar.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Duration — only for video models */}
              {isVideoModel && (
                <div>
                  <label className="text-xs text-white/50 font-medium uppercase tracking-wider block mb-2">
                    Duration — {duration}s
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={currentModel?.maxDuration ?? 10}
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    className="w-full accent-pink-500"
                  />
                  <div className="flex justify-between text-xs text-white/25 mt-1">
                    <span>1s</span>
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
                  <>✨ Generate</>
                )}
              </button>

              {createJob.error && (
                <p className="text-red-400 text-xs bg-red-500/10 rounded-xl px-4 py-2 border border-red-500/20">
                  {createJob.error.message}
                </p>
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
                  <div className="aspect-[9/16] flex flex-col items-center justify-center gap-3 bg-white/5 rounded-xl">
                    <div className="w-8 h-8 border-2 border-pink-500/30 border-t-pink-500 rounded-full animate-spin" />
                    <p className="text-xs text-white/40 capitalize">{activeJob?.status?.toLowerCase() ?? 'Queued'}…</p>
                  </div>
                ) : activeJob?.status === 'FAILED' ? (
                  <div className="aspect-[9/16] flex flex-col items-center justify-center gap-2 bg-red-500/5 rounded-xl border border-red-500/20">
                    <span className="text-3xl">⚠️</span>
                    <p className="text-xs text-red-400 text-center px-4">{activeJob.errorMessage ?? 'Generation failed'}</p>
                  </div>
                ) : activeJob?.outputUrl ? (
                  <div className="space-y-3">
                    {/* Show image for Grok Imagine, video for others */}
                    {selectedModel === 'GROK_IMAGINE' ? (
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
