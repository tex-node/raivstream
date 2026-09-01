'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/layout/Navbar';
import { useUser } from '@/lib/auth';
import { trpc } from '@/lib/trpc';

type Shot = {
  id: string;
  position: number;
  title: string;
  beat: string;
  camera: string | null;
  imagePrompt: string;
  videoPrompt: string;
  negativePrompt: string | null;
  assetUrl: string | null;
  seedImageUrl: string | null;
  duration: number;
  aspectRatio: string;
};

const emptyCharacter = {
  name: '',
  role: '',
  description: '',
  personality: '',
  visualTraits: '',
  referenceUrl: '',
};

const emptyEnvironment = {
  name: '',
  description: '',
  mood: '',
  lighting: '',
  referenceUrl: '',
};

const defaultVisualStyle = 'cinematic Afrofuturist realism, vibrant Lagos-inspired color, polished short-form vertical video';
const defaultTone = 'hopeful, suspenseful, emotionally direct';

export default function StoryStudioPage() {
  const router = useRouter();
  const { isSignedIn, isLoaded } = useUser();
  const utils = trpc.useUtils();

  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projectTitle, setProjectTitle] = useState('');
  const [logline, setLogline] = useState('');
  const [storyText, setStoryText] = useState('');
  const [visualStyle, setVisualStyle] = useState(defaultVisualStyle);
  const [tone, setTone] = useState(defaultTone);
  const [characterForm, setCharacterForm] = useState(emptyCharacter);
  const [environmentForm, setEnvironmentForm] = useState(emptyEnvironment);
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  const [assetUrl, setAssetUrl] = useState('');

  const { data: projects } = trpc.story.listProjects.useQuery({ limit: 20 }, { enabled: isSignedIn });
  const { data: project } = trpc.story.getProject.useQuery(
    { projectId: activeProjectId! },
    { enabled: !!activeProjectId && isSignedIn },
  );

  const createProject = trpc.story.createProject.useMutation({
    onSuccess: async (created) => {
      setActiveProjectId(created.id);
      await utils.story.listProjects.invalidate();
    },
  });

  const updateProject = trpc.story.updateProject.useMutation({
    onSuccess: async () => {
      await utils.story.listProjects.invalidate();
      await utils.story.getProject.invalidate();
    },
  });

  const saveCharacter = trpc.story.upsertCharacter.useMutation({
    onSuccess: async () => {
      setCharacterForm(emptyCharacter);
      await utils.story.getProject.invalidate();
    },
  });

  const saveEnvironment = trpc.story.upsertEnvironment.useMutation({
    onSuccess: async () => {
      setEnvironmentForm(emptyEnvironment);
      await utils.story.getProject.invalidate();
    },
  });

  const buildStoryboard = trpc.story.buildStoryboard.useMutation({
    onSuccess: async (shots) => {
      setSelectedShotId(shots[0]?.id ?? null);
      await utils.story.listProjects.invalidate();
      await utils.story.getProject.invalidate();
    },
  });

  const updateShot = trpc.story.updateShot.useMutation({
    onSuccess: async () => {
      setAssetUrl('');
      await utils.story.getProject.invalidate();
    },
  });

  useEffect(() => {
    if (!activeProjectId && projects?.[0]) setActiveProjectId(projects[0].id);
  }, [activeProjectId, projects]);

  useEffect(() => {
    if (!project) return;
    setProjectTitle(project.title);
    setLogline(project.logline ?? '');
    setStoryText(project.synopsis ?? '');
    setVisualStyle(project.visualStyle ?? defaultVisualStyle);
    setTone(project.tone ?? defaultTone);
    setSelectedShotId((current) => current ?? project.shots[0]?.id ?? null);
  }, [project]);

  const selectedShot = useMemo(() => {
    return (project?.shots as Shot[] | undefined)?.find((shot) => shot.id === selectedShotId) ?? null;
  }, [project?.shots, selectedShotId]);

  const handleCreateProject = () => {
    if (!projectTitle.trim()) return;
    createProject.mutate({
      title: projectTitle.trim(),
      logline: logline.trim() || undefined,
      synopsis: storyText.trim() || undefined,
      visualStyle: visualStyle.trim() || undefined,
      tone: tone.trim() || undefined,
    });
  };

  const handleSaveProject = () => {
    if (!activeProjectId || !projectTitle.trim()) return;
    updateProject.mutate({
      projectId: activeProjectId,
      title: projectTitle.trim(),
      logline: logline.trim() || undefined,
      synopsis: storyText.trim() || undefined,
      visualStyle: visualStyle.trim() || undefined,
      tone: tone.trim() || undefined,
    });
  };

  const openGenerate = (shot: Shot, mode: 'image' | 'video') => {
    const params = new URLSearchParams({
      mode,
      prompt: mode === 'image' ? shot.imagePrompt : shot.videoPrompt,
      aspectRatio: shot.aspectRatio,
      duration: String(Math.round(shot.duration)),
      storyProjectId: activeProjectId ?? '',
      storyboardShotId: shot.id,
    });
    const seed = shot.seedImageUrl || shot.assetUrl;
    if (mode === 'video' && seed) params.set('seedImageUrl', seed);
    router.push(`/generate?${params.toString()}`);
  };

  if (isLoaded && !isSignedIn) {
    return (
      <div className="min-h-screen bg-[#0B0D14] flex flex-col items-center justify-center gap-4">
        <Navbar />
        <p className="text-[var(--noc-t4)] text-lg">Sign in to use Story Studio</p>
        <a href="/sign-in" className="bg-[var(--noc-magenta)] hover:opacity-90 text-white px-6 py-2.5 rounded-full font-semibold transition-colors">
          Sign in
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0D14] text-[var(--noc-t1)]">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 pt-20 pb-16">
        <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold">Story Studio</h1>
            <p className="text-[var(--noc-t4)] text-sm">Build story worlds, characters, shot prompts, and reusable storyboard references.</p>
          </div>
          <button
            onClick={() => router.push('/story-playground')}
            className="rounded-lg bg-[var(--noc-blue)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Open Story Playground
          </button>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {projects?.map((item: { id: string; title: string; _count: { shots: number } }) => (
              <button
                key={item.id}
                onClick={() => setActiveProjectId(item.id)}
                className={`shrink-0 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                  activeProjectId === item.id
                    ? 'border-[var(--noc-magenta)] bg-[var(--noc-magenta)]/15 text-[var(--noc-t1)]'
                    : 'border-[var(--noc-hairline)] bg-[var(--noc-card)] text-[var(--noc-t4)] hover:text-[var(--noc-t1)]'
                }`}
              >
                <span className="block max-w-40 truncate font-semibold">{item.title}</span>
                <span className="text-[var(--noc-t5)]">{item._count.shots} shots</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr_360px] gap-5">
          <section className="space-y-4">
            <div className="rounded-xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] p-4">
              <h2 className="font-semibold text-sm mb-3">Project</h2>
              <div className="space-y-3">
                <input
                  value={projectTitle}
                  onChange={(e) => setProjectTitle(e.target.value)}
                  placeholder="Series or story title"
                  className="w-full rounded-lg border border-[var(--noc-hairline)] bg-white/[0.05] px-3 py-2 text-sm outline-none focus:border-[var(--noc-blue)]/60"
                />
                <input
                  value={logline}
                  onChange={(e) => setLogline(e.target.value)}
                  placeholder="One-sentence logline"
                  className="w-full rounded-lg border border-[var(--noc-hairline)] bg-white/[0.05] px-3 py-2 text-sm outline-none focus:border-[var(--noc-blue)]/60"
                />
                <textarea
                  value={storyText}
                  onChange={(e) => setStoryText(e.target.value)}
                  placeholder="Paste or draft the story. Each paragraph or sentence can become a storyboard shot."
                  rows={7}
                  className="w-full rounded-lg border border-[var(--noc-hairline)] bg-white/[0.05] px-3 py-2 text-sm outline-none resize-none focus:border-[var(--noc-blue)]/60"
                />
                <textarea
                  value={visualStyle}
                  onChange={(e) => setVisualStyle(e.target.value)}
                  placeholder="Visual style"
                  rows={2}
                  className="w-full rounded-lg border border-[var(--noc-hairline)] bg-white/[0.05] px-3 py-2 text-sm outline-none resize-none focus:border-[var(--noc-blue)]/60"
                />
                <input
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  placeholder="Tone"
                  className="w-full rounded-lg border border-[var(--noc-hairline)] bg-white/[0.05] px-3 py-2 text-sm outline-none focus:border-[var(--noc-blue)]/60"
                />
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleCreateProject}
                    disabled={!projectTitle.trim() || createProject.isPending}
                    className="rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/15 disabled:opacity-40"
                  >
                    New Project
                  </button>
                  <button
                    onClick={handleSaveProject}
                    disabled={!activeProjectId || !projectTitle.trim() || updateProject.isPending}
                    className="rounded-lg bg-[var(--noc-magenta)] px-3 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-40"
                  >
                    Save
                  </button>
                </div>
                <button
                  onClick={() => activeProjectId && buildStoryboard.mutate({
                    projectId: activeProjectId,
                    storyText,
                    shotType: 'VIDEO',
                    replaceExisting: true,
                  })}
                  disabled={!activeProjectId || storyText.trim().length < 20 || buildStoryboard.isPending}
                  className="w-full rounded-lg border border-[var(--noc-blue)]/30 bg-[var(--noc-blue)]/15 px-3 py-2 text-sm font-semibold text-[var(--noc-blue)] hover:bg-[var(--noc-blue)]/20 disabled:opacity-40"
                >
                  {buildStoryboard.isPending ? 'Building storyboard...' : 'Break Story Into Shot Prompts'}
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] p-4">
              <h2 className="font-semibold text-sm mb-3">Character Builder</h2>
              <div className="space-y-2">
                <input value={characterForm.name} onChange={(e) => setCharacterForm({ ...characterForm, name: e.target.value })} placeholder="Name" className="w-full rounded-lg border border-[var(--noc-hairline)] bg-white/[0.05] px-3 py-2 text-sm outline-none" />
                <input value={characterForm.role} onChange={(e) => setCharacterForm({ ...characterForm, role: e.target.value })} placeholder="Role" className="w-full rounded-lg border border-[var(--noc-hairline)] bg-white/[0.05] px-3 py-2 text-sm outline-none" />
                <textarea value={characterForm.description} onChange={(e) => setCharacterForm({ ...characterForm, description: e.target.value })} placeholder="Backstory and function in the story" rows={3} className="w-full rounded-lg border border-[var(--noc-hairline)] bg-white/[0.05] px-3 py-2 text-sm outline-none resize-none" />
                <textarea value={characterForm.visualTraits} onChange={(e) => setCharacterForm({ ...characterForm, visualTraits: e.target.value })} placeholder="Consistent visual traits, wardrobe, age, silhouette" rows={2} className="w-full rounded-lg border border-[var(--noc-hairline)] bg-white/[0.05] px-3 py-2 text-sm outline-none resize-none" />
                <input value={characterForm.referenceUrl} onChange={(e) => setCharacterForm({ ...characterForm, referenceUrl: e.target.value })} placeholder="Reference image URL" className="w-full rounded-lg border border-[var(--noc-hairline)] bg-white/[0.05] px-3 py-2 text-sm outline-none" />
                <button
                  onClick={() => activeProjectId && saveCharacter.mutate({ projectId: activeProjectId, ...characterForm })}
                  disabled={!activeProjectId || !characterForm.name.trim() || !characterForm.description.trim() || saveCharacter.isPending}
                  className="w-full rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/15 disabled:opacity-40"
                >
                  Add Character
                </button>
                <div className="space-y-2 pt-2">
                  {project?.characters.map((character: { id: string; name: string; description: string; visualTraits: string | null }) => (
                    <div key={character.id} className="rounded-lg border border-[var(--noc-hairline)] bg-white/[0.04] p-3">
                      <p className="font-semibold text-sm">{character.name}</p>
                      <p className="text-xs text-[var(--noc-t4)] line-clamp-2">{character.visualTraits || character.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">Storyboard</h2>
              <span className="text-xs text-[var(--noc-t5)]">{project?.shots.length ?? 0} shots</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {project?.shots.map((shot: Shot) => (
                <button
                  key={shot.id}
                  onClick={() => setSelectedShotId(shot.id)}
                  className={`min-h-56 rounded-xl border p-3 text-left transition-colors ${
                    selectedShotId === shot.id
                      ? 'border-[var(--noc-magenta)] bg-[var(--noc-magenta)]/10'
                      : 'border-[var(--noc-hairline)] bg-white/[0.04] hover:border-white/30'
                  }`}
                >
                  <div className="aspect-[9/16] rounded-lg bg-white/[0.05] mb-3 overflow-hidden flex items-center justify-center">
                    {shot.assetUrl ? (
                      /\.(mp4|webm|mov)(\?|$)/i.test(shot.assetUrl) ? (
                        <video src={shot.assetUrl} className="h-full w-full object-cover" muted playsInline />
                      ) : (
                        <img src={shot.assetUrl} alt="" className="h-full w-full object-cover" />
                      )
                    ) : (
                      <span className="text-[var(--noc-t5)] text-2xl">{shot.position}</span>
                    )}
                  </div>
                  <p className="font-semibold text-sm line-clamp-1">{shot.title}</p>
                  <p className="text-xs text-[var(--noc-t4)] line-clamp-3 mt-1">{shot.beat}</p>
                </button>
              ))}
              {!project?.shots.length && (
                <div className="md:col-span-2 xl:col-span-3 flex min-h-96 items-center justify-center rounded-xl border border-dashed border-[var(--noc-hairline)] text-center text-sm text-[var(--noc-t5)] px-6">
                  Add a story and use the storyboard builder to create shot prompts.
                </div>
              )}
            </div>
          </section>

          <section className="space-y-4">
            <div className="rounded-xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] p-4">
              <h2 className="font-semibold text-sm mb-3">Environment Designer</h2>
              <div className="space-y-2">
                <input value={environmentForm.name} onChange={(e) => setEnvironmentForm({ ...environmentForm, name: e.target.value })} placeholder="Environment name" className="w-full rounded-lg border border-[var(--noc-hairline)] bg-white/[0.05] px-3 py-2 text-sm outline-none" />
                <textarea value={environmentForm.description} onChange={(e) => setEnvironmentForm({ ...environmentForm, description: e.target.value })} placeholder="Location, props, textures, production details" rows={3} className="w-full rounded-lg border border-[var(--noc-hairline)] bg-white/[0.05] px-3 py-2 text-sm outline-none resize-none" />
                <input value={environmentForm.mood} onChange={(e) => setEnvironmentForm({ ...environmentForm, mood: e.target.value })} placeholder="Mood" className="w-full rounded-lg border border-[var(--noc-hairline)] bg-white/[0.05] px-3 py-2 text-sm outline-none" />
                <input value={environmentForm.lighting} onChange={(e) => setEnvironmentForm({ ...environmentForm, lighting: e.target.value })} placeholder="Lighting" className="w-full rounded-lg border border-[var(--noc-hairline)] bg-white/[0.05] px-3 py-2 text-sm outline-none" />
                <input value={environmentForm.referenceUrl} onChange={(e) => setEnvironmentForm({ ...environmentForm, referenceUrl: e.target.value })} placeholder="Reference image URL" className="w-full rounded-lg border border-[var(--noc-hairline)] bg-white/[0.05] px-3 py-2 text-sm outline-none" />
                <button
                  onClick={() => activeProjectId && saveEnvironment.mutate({ projectId: activeProjectId, ...environmentForm })}
                  disabled={!activeProjectId || !environmentForm.name.trim() || !environmentForm.description.trim() || saveEnvironment.isPending}
                  className="w-full rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/15 disabled:opacity-40"
                >
                  Add Environment
                </button>
                <div className="space-y-2 pt-2">
                  {project?.environments.map((environment: { id: string; name: string; description: string }) => (
                    <div key={environment.id} className="rounded-lg border border-[var(--noc-hairline)] bg-white/[0.04] p-3">
                      <p className="font-semibold text-sm">{environment.name}</p>
                      <p className="text-xs text-[var(--noc-t4)] line-clamp-2">{environment.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {selectedShot && (
              <div className="rounded-xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] p-4">
                <h2 className="font-semibold text-sm mb-3">Shot Prompt</h2>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-[var(--noc-t4)]">Image prompt</label>
                    <textarea readOnly value={selectedShot.imagePrompt} rows={5} className="mt-1 w-full rounded-lg border border-[var(--noc-hairline)] bg-white/[0.05] px-3 py-2 text-xs text-[var(--noc-t3)] outline-none resize-none" />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--noc-t4)]">Video prompt</label>
                    <textarea readOnly value={selectedShot.videoPrompt} rows={5} className="mt-1 w-full rounded-lg border border-[var(--noc-hairline)] bg-white/[0.05] px-3 py-2 text-xs text-[var(--noc-t3)] outline-none resize-none" />
                  </div>
                  <input
                    value={assetUrl}
                    onChange={(e) => setAssetUrl(e.target.value)}
                    placeholder="Paste generated image or clip URL as storyboard reference"
                    className="w-full rounded-lg border border-[var(--noc-hairline)] bg-white/[0.05] px-3 py-2 text-sm outline-none"
                  />
                  <button
                    onClick={() => updateShot.mutate({
                      projectId: activeProjectId!,
                      shotId: selectedShot.id,
                      assetUrl,
                      seedImageUrl: assetUrl,
                    })}
                    disabled={!assetUrl.trim() || updateShot.isPending}
                    className="w-full rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/15 disabled:opacity-40"
                  >
                    Save Reference To Shot
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => openGenerate(selectedShot, 'image')} className="rounded-lg bg-[var(--noc-magenta)] px-3 py-2 text-sm font-semibold hover:opacity-90">
                      Generate Image
                    </button>
                    <button onClick={() => openGenerate(selectedShot, 'video')} className="rounded-lg bg-[var(--noc-purple)] px-3 py-2 text-sm font-semibold hover:opacity-90">
                      Generate Video
                    </button>
                  </div>
                  {selectedShot.assetUrl && (
                    <a href={selectedShot.assetUrl} target="_blank" rel="noreferrer" className="block truncate text-xs text-[var(--noc-blue)] hover:opacity-80">
                      Current reference: {selectedShot.assetUrl}
                    </a>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
