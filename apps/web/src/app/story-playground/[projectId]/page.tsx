'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { BookOpen, Camera, CheckCircle2, Heart, ImagePlus, Loader2, Pencil, Plus, RefreshCw, Star, Trash2, UserRound, X } from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { useR16 } from '@/lib/r16';
import { trpc } from '@/lib/trpc';
import { useUser } from '@/lib/auth';

type WorkspaceTab = 'overview' | 'story' | 'characters' | 'scenes' | 'assets' | 'storybook' | 'insights';

type Asset = {
  id: string;
  sceneId: string;
  assetType: 'IMAGE' | 'VIDEO';
  provider: string;
  model: string;
  assetUrl: string | null;
  thumbnailUrl: string | null;
  status: 'PENDING' | 'GENERATING' | 'READY' | 'FAILED';
  creativeStatus?: 'DRAFT' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'ARCHIVED';
  criticScore?: number | null;
  criticRecommendation?: 'APPROVE' | 'SUGGEST_REFINEMENT' | 'REGENERATE' | null;
  errorMessage: string | null;
  width: number | null;
  height: number | null;
  isLatest: boolean;
  isFavorite?: boolean;
  selectedForStorybookAt?: string | Date | null;
  createdAt: string | Date;
  criticRuns?: Array<{
    id: string;
    status: string;
    overallScore?: number | null;
    recommendation?: string | null;
    strengths?: string[] | null;
    issues?: Array<{ category: string; severity: string; description: string }> | null;
    improvementPlan?: Record<string, string[]> | null;
    errorMessage?: string | null;
    completedAt?: string | Date | null;
  }>;
};

type Scene = {
  id: string;
  orderIndex: number;
  title: string;
  description: string;
  locationType: string | null;
  indoorOutdoor: string | null;
  mood: string | null;
  emotion: string | null;
  cameraStyle: string | null;
  timeOfDay: string | null;
  weather: string | null;
  environmentMood: string | null;
  lighting: string | null;
  scenePace: string | null;
  characters: unknown;
  latestImageAssetId: string | null;
  activeImageAssetId?: string | null;
  imageUrl: string | null;
  imageStatus: string | null;
  assets?: Asset[];
  promptFeedback?: Array<{ assetId: string; rating: number; comment: string | null; createdAt: string | Date }>;
};

type Character = {
  id: string;
  name: string;
  role: string | null;
  species: string | null;
  ageDescription: string | null;
  gender: string | null;
  visualDescription: string | null;
  personalityTraits?: string[] | null;
  motivation?: string | null;
  fear?: string | null;
  goal?: string | null;
  favoriteExpression?: string | null;
  walkingStyle?: string | null;
  speakingStyle?: string | null;
  relationships?: Array<{ targetName: string; type: string; strength?: string; notes?: string | null }> | null;
  evolutionStage?: string | null;
  evolutionNotes?: string | null;
  evolutionSceneOrder?: number | null;
};

const TABS: Array<{ key: WorkspaceTab; label: string; r16Label: string }> = [
  { key: 'overview', label: 'Overview', r16Label: 'My Story' },
  { key: 'story', label: 'Story', r16Label: 'Story' },
  { key: 'characters', label: 'Characters', r16Label: 'Characters' },
  { key: 'scenes', label: 'Scenes', r16Label: 'Picture Cards' },
  { key: 'assets', label: 'Assets', r16Label: 'Pictures' },
  { key: 'storybook', label: 'Storybook', r16Label: 'Read Book' },
];

const PERSONALITY_OPTIONS = ['BRAVE', 'CURIOUS', 'FUNNY', 'KIND', 'SHY', 'CONFIDENT', 'ADVENTUROUS', 'CALM', 'CLEVER', 'ENERGETIC'] as const;
const MOTIVATION_OPTIONS = ['MAKE_FRIENDS', 'LEARN', 'HELP_OTHERS', 'EXPLORE', 'WIN', 'PROTECT_FAMILY', 'FIND_HOME'] as const;
const FEAR_OPTIONS = ['DARKNESS', 'HEIGHTS', 'BULLIES', 'BEING_ALONE', 'LOUD_NOISES', 'MONSTERS', 'WATER'] as const;
const GOAL_OPTIONS = ['REACH_SCHOOL', 'SAVE_A_FRIEND', 'FIND_TREASURE', 'FINISH_HOMEWORK', 'BECOME_A_HERO'] as const;
const WALKING_OPTIONS = ['SKIP', 'RUN', 'WALK_PROUDLY', 'WALK_CAREFULLY', 'BOUNCE', 'SNEAK'] as const;
const DIRECTOR_OPTIONS = {
  emotion: ['HAPPY', 'EXCITED', 'CURIOUS', 'BRAVE', 'CALM', 'SAD', 'SURPRISED'],
  cameraStyle: ['CLOSE_UP', 'MEDIUM_SHOT', 'WIDE_SHOT', 'OVER_THE_SHOULDER', 'BIRDS_EYE_VIEW', 'EYE_LEVEL'],
  timeOfDay: ['MORNING', 'AFTERNOON', 'SUNSET', 'NIGHT'],
  weather: ['SUNNY', 'RAINY', 'SNOWY', 'WINDY', 'FOGGY'],
  environmentMood: ['PEACEFUL', 'BUSY', 'MAGICAL', 'FUTURISTIC', 'COZY', 'ADVENTUROUS'],
  lighting: ['BRIGHT', 'WARM', 'SOFT', 'DRAMATIC', 'MOONLIGHT'],
  scenePace: ['CALM', 'NORMAL', 'ENERGETIC'],
} as const;

function label(value?: string | null) {
  return value ? value.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : '';
}

function dateLabel(value?: string | Date | null) {
  if (!value) return 'Recently';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function activeAsset(scene: Scene) {
  return scene.assets?.find((asset) => asset.id === scene.activeImageAssetId && asset.status === 'READY')
    ?? scene.assets?.find((asset) => asset.isLatest && asset.status === 'READY')
    ?? scene.assets?.find((asset) => asset.status === 'READY')
    ?? null;
}

function versionLabel(scene: Scene, asset: Asset) {
  const ordered = [...(scene.assets ?? [])].filter((item) => item.assetType === 'IMAGE').reverse();
  return `Picture ${Math.max(1, ordered.findIndex((item) => item.id === asset.id) + 1)}`;
}

function latestCriticRun(asset: Asset) {
  return asset.criticRuns?.[0] ?? null;
}

function criticStatusLabel(asset: Asset) {
  const run = latestCriticRun(asset);
  if (run?.status === 'RUNNING' || run?.status === 'PENDING') return 'Reviewing quality';
  if (run?.status === 'SKIPPED') return 'Review unavailable';
  if (run?.status === 'FAILED') return 'Review failed';
  if (asset.creativeStatus === 'APPROVED') return 'Approved';
  if (asset.creativeStatus === 'REJECTED') return 'Rejected';
  if (asset.criticRecommendation === 'REGENERATE') return 'Regenerate recommended';
  if (asset.criticRecommendation === 'SUGGEST_REFINEMENT') return 'Needs refinement';
  return 'Not reviewed';
}

function improvementSummary(plan?: Record<string, string[]> | null) {
  if (!plan) return [];
  return Object.entries(plan).flatMap(([key, values]) => (values ?? []).map((value) => `${label(key)}: ${value}`)).slice(0, 3);
}

export default function StoryWorkspacePage() {
  const params = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const isR16 = useR16();
  const { isSignedIn, isLoaded, user } = useUser();
  const utils = trpc.useUtils();
  const projectId = params.projectId;
  const requestedTab = searchParams.get('tab') as WorkspaceTab | null;
  const academyAssignmentId = searchParams.get('academyAssignment');
  const [tab, setTab] = useState<WorkspaceTab>(requestedTab && TABS.some((item) => item.key === requestedTab) ? requestedTab : 'overview');
  const [message, setMessage] = useState<string | null>(null);
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
  const [editingScene, setEditingScene] = useState<Scene | null>(null);
  const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);
  const [compareAssets, setCompareAssets] = useState<string[]>([]);
  const [characterForm, setCharacterForm] = useState({
    name: '',
    role: '',
    species: '',
    ageDescription: '',
    gender: '',
    visualDescription: '',
    personalityTraits: [] as string[],
    motivation: '',
    fear: '',
    goal: '',
    walkingStyle: '',
    relationshipTargetName: '',
    relationshipType: 'FRIEND',
    relationshipStrength: 'VERY_CLOSE',
    evolutionStage: '',
    evolutionNotes: '',
    evolutionSceneOrder: '',
  });
  const [sceneForm, setSceneForm] = useState({
    title: '',
    description: '',
    locationType: '',
    indoorOutdoor: '',
    mood: '',
    emotion: '',
    cameraStyle: '',
    timeOfDay: '',
    weather: '',
    environmentMood: '',
    lighting: '',
    scenePace: '',
  });

  const workspace = trpc.story.getWorkspace.useQuery({ projectId }, { enabled: isLoaded && isSignedIn });
  const academyAssignment = trpc.academy.getWorkspaceAssignmentContext.useQuery(
    { assignmentId: academyAssignmentId ?? '', projectId },
    { enabled: Boolean(isLoaded && isSignedIn && academyAssignmentId && !isR16) },
  );
  const submitAcademyAssignment = trpc.academy.submitAssignment.useMutation({ onSuccess: () => setMessage('Academy assignment submitted.') });
  const trackTab = trpc.story.trackWorkspaceTab.useMutation();
  const continueStory = trpc.story.continueStory.useMutation({ onSuccess: () => refresh('Story continued.') });
  const updateProject = trpc.story.updateProject.useMutation({ onSuccess: () => refresh('Story saved.') });
  const updateCharacter = trpc.story.updateCharacterMemory.useMutation({ onSuccess: () => { setEditingCharacter(null); refresh(isR16 ? 'Character saved.' : 'Character Director saved.'); } });
  const createCharacter = trpc.story.createCharacterMemory.useMutation({ onSuccess: () => { setEditingCharacter(null); refresh(isR16 ? 'Friend added.' : 'Character added.'); } });
  const updateScene = trpc.story.updateScene.useMutation({ onSuccess: () => { setEditingScene(null); refresh('Scene saved.'); } });
  const updateSceneDirector = trpc.story.updateSceneDirector.useMutation({ onSuccess: () => refresh(isR16 ? 'Choices saved.' : 'Director settings saved.') });
  const generateSceneImage = trpc.story.generateSceneImage.useMutation({ onSuccess: () => refresh(isR16 ? 'Picture made.' : 'Image generated.') });
  const regenerateSceneImage = trpc.story.regenerateSceneImage.useMutation({ onSuccess: () => refresh(isR16 ? 'New picture made.' : 'Image regenerated.') });
  const runCreativeCritic = trpc.story.runCreativeCritic.useMutation({ onSuccess: () => refresh('Creative review updated.') });
  const regenerateFromCritic = trpc.story.regenerateFromCritic.useMutation({ onSuccess: () => refresh('Improved picture started.') });
  const approveSceneAsset = trpc.story.approveSceneAsset.useMutation({ onSuccess: () => refresh('Picture approved.') });
  const rejectSceneAsset = trpc.story.rejectSceneAsset.useMutation({ onSuccess: () => refresh('Picture rejected.') });
  const submitCreativeCriticFeedback = trpc.story.submitCreativeCriticFeedback.useMutation({ onSuccess: () => refresh('Creative feedback saved.') });
  const setActiveImage = trpc.story.setActiveSceneImage.useMutation({ onSuccess: () => refresh(isR16 ? 'Picture chosen for book.' : 'Active Storybook image changed.') });
  const favoriteAsset = trpc.story.favoriteSceneAsset.useMutation({ onSuccess: () => refresh(isR16 ? 'Favorite saved.' : 'Favorite updated.') });
  const trackAssetCompared = trpc.story.trackAssetCompared.useMutation();
  const deleteAsset = trpc.story.deleteSceneAsset.useMutation({ onSuccess: () => refresh(isR16 ? 'Picture removed.' : 'Asset removed from project.') });

  function refresh(nextMessage: string) {
    setMessage(nextMessage);
    utils.story.getWorkspace.invalidate({ projectId });
    utils.story.getStoryBook.invalidate({ projectId });
  }

  useEffect(() => {
    if (requestedTab && TABS.some((item) => item.key === requestedTab)) setTab(requestedTab);
  }, [requestedTab]);

  useEffect(() => {
    if (!projectId || !tab) return;
    trackTab.mutate({ projectId, tab });
    if (tab === 'assets') utils.story.getWorkspace.invalidate({ projectId });
  }, [tab, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isLoaded) {
    return <div className="min-h-screen bg-[#fff9ed]"><Navbar /><main className="mx-auto max-w-6xl px-4 py-12 font-bold text-[#596070]">Loading workspace...</main></div>;
  }
  if (!isSignedIn) {
    return <div className="min-h-screen bg-[#fff9ed]"><Navbar /><main className="mx-auto max-w-3xl px-4 py-12"><h1 className="text-3xl font-black">Sign in to open this story.</h1><Link href="/sign-in" className="mt-5 inline-block rounded-xl bg-[#2f80ed] px-5 py-3 font-black text-white">Sign In</Link></main></div>;
  }
  if (workspace.isLoading) {
    return <div className="min-h-screen bg-[#fff9ed]"><Navbar /><main className="mx-auto max-w-6xl px-4 py-12"><div className="h-40 animate-pulse rounded-2xl bg-white" /></main></div>;
  }
  if (workspace.error) {
    return <div className="min-h-screen bg-[#fff9ed]"><Navbar /><main className="mx-auto max-w-3xl px-4 py-12"><h1 className="text-3xl font-black">We could not open this story.</h1><p className="mt-3 font-bold text-[#596070]">{workspace.error.message}</p><Link href="/story-playground" className="mt-5 inline-block rounded-xl bg-[#172033] px-5 py-3 font-black text-white">Back to My Stories</Link></main></div>;
  }

  const workspaceData = workspace.data;
  if (!workspaceData?.project) return null;
  const project = workspaceData.project;
  const scenes = ((project.sceneSeeds ?? []) as Scene[]).slice().sort((a, b) => a.orderIndex - b.orderIndex);
  const characters = ((project.characterMemory ?? []) as Character[]).slice();
  const chapters = [...(project.chapters ?? [])].sort((a: any, b: any) => a.chapterNumber - b.chapterNumber);
  const summary = workspaceData.summary;
  const canUseTechnical = !isR16 && !!user && ['ADMIN', 'MODERATOR', 'CREATOR'].includes(user.role);

  const chooseTab = (nextTab: WorkspaceTab) => {
    setTab(nextTab);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', nextTab);
    router.push(`/story-playground/${projectId}?${params.toString()}`, { scroll: false });
  };

  const openCharacter = (character?: Character) => {
    const current = character ?? {
      id: 'new',
      name: '',
      role: '',
      species: '',
      ageDescription: '',
      gender: '',
      visualDescription: '',
      personalityTraits: [],
      relationships: [],
    };
    const relationship = current.relationships?.[0];
    setEditingCharacter(current);
    setCharacterForm({
      name: current.name,
      role: current.role ?? '',
      species: current.species ?? '',
      ageDescription: current.ageDescription ?? '',
      gender: current.gender ?? '',
      visualDescription: current.visualDescription ?? '',
      personalityTraits: current.personalityTraits ?? [],
      motivation: current.motivation ?? '',
      fear: current.fear ?? '',
      goal: current.goal ?? '',
      walkingStyle: current.walkingStyle ?? '',
      relationshipTargetName: relationship?.targetName ?? '',
      relationshipType: relationship?.type ?? 'FRIEND',
      relationshipStrength: relationship?.strength ?? 'VERY_CLOSE',
      evolutionStage: current.evolutionStage ?? '',
      evolutionNotes: current.evolutionNotes ?? '',
      evolutionSceneOrder: current.evolutionSceneOrder ? String(current.evolutionSceneOrder) : '',
    });
  };

  const saveCharacter = () => {
    if (!editingCharacter) return;
    const relationship = characterForm.relationshipTargetName.trim()
      ? [{ targetName: characterForm.relationshipTargetName.trim(), type: characterForm.relationshipType as any, strength: characterForm.relationshipStrength as any, notes: null }]
      : [];
    const payload = {
      projectId,
      name: characterForm.name.trim(),
      role: characterForm.role.trim() || undefined,
      species: characterForm.species.trim() || undefined,
      ageDescription: characterForm.ageDescription.trim() || undefined,
      gender: characterForm.gender.trim() || undefined,
      visualDescription: characterForm.visualDescription.trim(),
      personalityTraits: characterForm.personalityTraits as any,
      motivation: characterForm.motivation ? characterForm.motivation as any : null,
      fear: characterForm.fear ? characterForm.fear as any : null,
      goal: characterForm.goal ? characterForm.goal as any : null,
      walkingStyle: characterForm.walkingStyle ? characterForm.walkingStyle as any : null,
      relationships: relationship,
      evolutionStage: characterForm.evolutionStage.trim() || null,
      evolutionNotes: characterForm.evolutionNotes.trim() || null,
      evolutionSceneOrder: characterForm.evolutionSceneOrder ? Number(characterForm.evolutionSceneOrder) : null,
      favoriteExpression: null,
      speakingStyle: null,
    };
    if (editingCharacter.id === 'new') createCharacter.mutate(payload);
    else updateCharacter.mutate({ ...payload, characterId: editingCharacter.id });
  };

  const openScene = (scene: Scene) => {
    setEditingScene(scene);
    setSceneForm({
      title: scene.title,
      description: scene.description,
      locationType: scene.locationType ?? '',
      indoorOutdoor: scene.indoorOutdoor ?? '',
      mood: scene.mood ?? '',
      emotion: scene.emotion ?? '',
      cameraStyle: scene.cameraStyle ?? '',
      timeOfDay: scene.timeOfDay ?? '',
      weather: scene.weather ?? '',
      environmentMood: scene.environmentMood ?? '',
      lighting: scene.lighting ?? '',
      scenePace: scene.scenePace ?? '',
    });
  };

  const saveScene = () => {
    if (!editingScene) return;
    updateScene.mutate({
      projectId,
      sceneId: editingScene.id,
      title: sceneForm.title.trim(),
      description: sceneForm.description.trim(),
      locationType: sceneForm.locationType.trim() || undefined,
      indoorOutdoor: sceneForm.indoorOutdoor.trim() || undefined,
      mood: sceneForm.mood.trim() || undefined,
    });
    updateSceneDirector.mutate({
      projectId,
      sceneId: editingScene.id,
      settings: {
        emotion: sceneForm.emotion as any || null,
        cameraStyle: sceneForm.cameraStyle as any || null,
        timeOfDay: sceneForm.timeOfDay as any || null,
        weather: sceneForm.weather as any || null,
        environmentMood: sceneForm.environmentMood as any || null,
        lighting: sceneForm.lighting as any || null,
        scenePace: sceneForm.scenePace as any || null,
      },
    });
  };

  const toggleCompareAsset = (scene: Scene, assetId: string) => {
    setCompareAssets((current) => {
      const next = current.includes(assetId) ? current.filter((id) => id !== assetId) : [...current.slice(-1), assetId];
      if (next.length === 2) trackAssetCompared.mutate({ projectId, sceneId: scene.id, assetIds: next });
      return next;
    });
  };

  const renderHero = () => (
    <section className="rounded-3xl bg-[#172033] p-5 text-white md:p-7">
      <div className="grid gap-6 md:grid-cols-[1fr_220px] md:items-center">
        <div>
          <Link href="/story-playground" className="text-sm font-black text-[#ffcf4a]">{isR16 ? 'My Stories' : 'Story Workspace'}</Link>
          <h1 className="mt-2 text-3xl font-black md:text-5xl">{project.title}</h1>
          <p className="mt-3 max-w-3xl font-semibold text-white/70">{project.originalIdea ?? project.logline ?? (isR16 ? 'A story made by you.' : 'No original idea saved.')}</p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs font-black">
            <span className="rounded-full bg-white/10 px-3 py-2">{project.audienceMode === 'KIDS' ? 'R16/Kids' : 'General'}</span>
            <span className="rounded-full bg-white/10 px-3 py-2">{label(project.visualStyle) || 'Storybook'}</span>
            <span className="rounded-full bg-white/10 px-3 py-2">Updated {dateLabel(project.updatedAt)}</span>
          </div>
        </div>
        <div className="aspect-[9/12] overflow-hidden rounded-2xl bg-white/10">
          {summary.coverThumbnail ? <img src={summary.coverThumbnail} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><BookOpen size={52} /></div>}
        </div>
      </div>
    </section>
  );

  const renderAcademyBanner = () => {
    if (isR16 || !academyAssignmentId) return null;
    const assignment = academyAssignment.data;
    return (
      <section className="mt-4 rounded-2xl border-2 border-[#2f80ed]/20 bg-[#eef7ff] p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black uppercase text-[#2f80ed]">Academy Assignment</p>
            <h2 className="text-xl font-black">{assignment?.title ?? 'Loading assignment...'}</h2>
            {assignment?.brief && <p className="mt-1 text-sm font-bold text-[#596070]">{assignment.brief}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {assignment?.assignmentId && <Link href={`/academy/classes/${assignment.classId}/assignments/${assignment.assignmentId}`} className="rounded-xl bg-white px-4 py-3 text-sm font-black text-[#172033] ring-2 ring-[#172033]/10">View Instructions</Link>}
            <button onClick={() => setMessage('Progress saved in this Story Workspace.')} className="rounded-xl bg-[#ffcf4a] px-4 py-3 text-sm font-black text-[#172033]">Save Progress</button>
            <button disabled={!assignment?.assignmentId || submitAcademyAssignment.isPending} onClick={() => submitAcademyAssignment.mutate({ assignmentId: academyAssignmentId, projectId })} className="rounded-xl bg-[#2fbf71] px-4 py-3 text-sm font-black text-white disabled:opacity-50">Submit Work</button>
          </div>
        </div>
      </section>
    );
  };

  const renderOverview = () => (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-5">
        {[
          ['Chapters', summary.chapterCount],
          ['Characters', summary.characterCount],
          [isR16 ? 'Cards' : 'Scenes', summary.sceneCount],
          [isR16 ? 'Pictures' : 'Ready Images', summary.readyImageCount],
          [isR16 ? 'Book' : 'Storybook', summary.storybookReady ? 'Ready' : 'Needs pictures'],
        ].map(([name, value]) => (
          <div key={name} className="rounded-2xl border-2 border-[#172033]/10 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-wide text-[#596070]">{name}</p>
            <p className="mt-2 text-2xl font-black">{value}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <button onClick={() => continueStory.mutate({ projectId })} className="rounded-2xl bg-[#172033] px-5 py-4 text-left font-black text-white">{isR16 ? 'Keep Writing' : 'Continue Writing'}</button>
        <button onClick={() => chooseTab('characters')} className="rounded-2xl bg-[#2fbf71] px-5 py-4 text-left font-black text-white">{isR16 ? 'Meet My Characters' : 'Edit Characters'}</button>
        <button onClick={() => chooseTab('scenes')} className="rounded-2xl bg-[#ffcf4a] px-5 py-4 text-left font-black text-[#172033]">{isR16 ? 'Add Pictures' : 'Add Pictures'}</button>
        <Link href={`/story-playground/${projectId}/storybook`} className="rounded-2xl bg-[#2f80ed] px-5 py-4 text-left font-black text-white">{isR16 ? 'Read Book' : 'Read Storybook'}</Link>
      </div>
    </div>
  );

  const renderStory = () => (
    <section className="rounded-2xl border-2 border-[#172033]/10 bg-white p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-black uppercase text-[#2f80ed]">{isR16 ? 'My Story' : 'Story'}</p>
          <h2 className="text-3xl font-black">{project.title}</h2>
          <p className="mt-2 font-semibold text-[#596070]">{project.synopsis ?? project.logline ?? project.originalIdea}</p>
        </div>
        <button onClick={() => continueStory.mutate({ projectId })} className="rounded-xl bg-[#172033] px-4 py-3 font-black text-white">{isR16 ? 'Keep Writing' : 'Continue Story'}</button>
      </div>
      <div className="mt-5 grid gap-4">
        {chapters.map((chapter: any) => (
          <article key={chapter.id} className="rounded-2xl bg-[#fff9ed] p-4">
            <p className="text-xs font-black uppercase text-[#596070]">Chapter {chapter.chapterNumber}</p>
            <h3 className="mt-1 text-xl font-black">{chapter.title}</h3>
            <p className="mt-2 font-semibold text-[#596070]">{chapter.body}</p>
          </article>
        ))}
      </div>
      {project.storyDna && (
        <div className="mt-5 rounded-2xl bg-[#eef7ff] p-4">
          <p className="text-sm font-black uppercase text-[#2f80ed]">{isR16 ? 'What the story is about' : 'Story DNA Summary'}</p>
          <div className="mt-3 grid gap-2 text-sm font-bold text-[#172033] md:grid-cols-3">
            <span>Theme: {(project.storyDna as any).theme ?? project.theme ?? 'Story'}</span>
            <span>Hero: {(project.storyDna as any).hero ?? 'Main character'}</span>
            <span>Goal: {(project.storyDna as any).primaryGoal ?? 'Finish the adventure'}</span>
          </div>
        </div>
      )}
    </section>
  );

  const renderCharacters = () => (
    <section className="rounded-2xl border-2 border-[#172033]/10 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-black uppercase text-[#2fbf71]">{isR16 ? 'Characters' : 'Character Director'}</p>
          <h2 className="text-3xl font-black">{isR16 ? 'My Characters' : 'Characters'}</h2>
        </div>
        <button onClick={() => openCharacter()} className="inline-flex items-center gap-2 rounded-xl bg-[#ffcf4a] px-4 py-3 font-black text-[#172033]"><Plus size={18} />{isR16 ? 'Add Friend' : 'Add Character'}</button>
      </div>
      {characters.length === 0 ? <div className="rounded-xl border-2 border-dashed p-8 text-center font-bold text-[#596070]">No characters yet.</div> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {characters.map((character) => (
            <button key={character.id} onClick={() => openCharacter(character)} className="rounded-2xl border-2 border-[#172033]/10 bg-[#fffdf8] p-4 text-left hover:border-[#2fbf71]">
              <UserRound className="text-[#2fbf71]" />
              <h3 className="mt-3 text-xl font-black">{character.name}</h3>
              <p className="mt-1 text-sm font-bold text-[#596070]">{[character.ageDescription, character.gender, character.species].filter(Boolean).join(' ') || character.role || 'Story character'}</p>
              <p className="mt-3 line-clamp-3 text-sm font-semibold text-[#596070]">{character.visualDescription}</p>
              <div className="mt-3 flex flex-wrap gap-2">{(character.personalityTraits ?? []).slice(0, 4).map((trait) => <span key={trait} className="rounded-full bg-[#dff8e9] px-3 py-1 text-xs font-black text-[#17643a]">{label(trait)}</span>)}</div>
            </button>
          ))}
        </div>
      )}
    </section>
  );

  const renderScenes = () => (
    <section className="rounded-2xl border-2 border-[#172033]/10 bg-white p-5">
      <div className="mb-4">
        <p className="text-sm font-black uppercase text-[#2f80ed]">{isR16 ? 'Picture Cards' : 'Scenes'}</p>
        <h2 className="text-3xl font-black">{isR16 ? 'Story Pictures' : 'Scene Director'}</h2>
      </div>
      {scenes.length === 0 ? <div className="rounded-xl border-2 border-dashed p-8 text-center font-bold text-[#596070]">No scene cards yet.</div> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {scenes.map((scene) => {
            const active = activeAsset(scene);
            return (
              <article key={scene.id} className="overflow-hidden rounded-2xl border-2 border-[#172033]/10 bg-[#fffdf8]">
                <div className="aspect-[9/12] bg-[#f5f1e8] bg-cover bg-center" style={active?.assetUrl ? { backgroundImage: `url("${active.assetUrl}")` } : undefined}>
                  {!active?.assetUrl && <div className="flex h-full items-center justify-center text-[#2f80ed]"><Camera size={42} /></div>}
                </div>
                <div className="p-4">
                  <p className="text-xs font-black uppercase text-[#596070]">Scene {scene.orderIndex}</p>
                  <h3 className="text-xl font-black">{scene.title}</h3>
                  <p className="mt-2 line-clamp-3 text-sm font-semibold text-[#596070]">{scene.description}</p>
                  <div className="mt-3 text-xs font-bold text-[#596070]">{[scene.locationType, scene.indoorOutdoor, scene.timeOfDay ? label(scene.timeOfDay) : null, scene.mood].filter(Boolean).join(' | ')}</div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <button onClick={() => openScene(scene)} className="rounded-xl bg-white px-3 py-2 text-sm font-black text-[#172033] ring-2 ring-[#172033]/10">{isR16 ? 'Change Scene' : 'Edit Scene'}</button>
                    <button onClick={() => (scene.imageUrl ? regenerateSceneImage : generateSceneImage).mutate({ projectId, sceneId: scene.id, model: 'FLUX' })} className="rounded-xl bg-[#ffcf4a] px-3 py-2 text-sm font-black text-[#172033]">{scene.imageUrl ? (isR16 ? 'Try Again' : 'Regenerate') : (isR16 ? 'Make Picture' : 'Generate Picture')}</button>
                    <button onClick={() => { chooseTab('assets'); setMessage(scene.title); }} className="rounded-xl bg-[#2f80ed] px-3 py-2 text-sm font-black text-white">{isR16 ? 'See Pictures' : 'Open Assets'}</button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );

  const renderAssets = () => (
    <section className="rounded-2xl border-2 border-[#172033]/10 bg-white p-5">
      <div className="mb-4">
        <p className="text-sm font-black uppercase text-[#b13b63]">{isR16 ? 'Pictures' : 'Asset Manager'}</p>
        <h2 className="text-3xl font-black">{isR16 ? 'Choose pictures for the book' : 'Project Assets'}</h2>
      </div>
      <div className="space-y-6">
        {scenes.map((scene) => {
          const assets = (scene.assets ?? []).filter((asset) => asset.assetType === 'IMAGE' && asset.status === 'READY');
          return (
            <div key={scene.id} className="rounded-2xl bg-[#fff9ed] p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-xl font-black">{scene.title}</h3>
                  <p className="text-sm font-bold text-[#596070]">{assets.length ? `${assets.length} ${isR16 ? 'pictures' : 'image versions'}` : 'No pictures yet'}</p>
                </div>
                <button onClick={() => regenerateSceneImage.mutate({ projectId, sceneId: scene.id, model: 'FLUX' })} className="rounded-xl bg-[#ffcf4a] px-4 py-2 text-sm font-black text-[#172033]">{isR16 ? 'Make Another Picture' : 'Regenerate from Current Settings'}</button>
              </div>
              {assets.length === 0 ? <div className="rounded-xl border-2 border-dashed bg-white p-6 text-center font-bold text-[#596070]">No pictures yet.</div> : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {assets.map((asset) => {
                    const isActive = scene.activeImageAssetId === asset.id || (!scene.activeImageAssetId && asset.isLatest);
                    const rating = scene.promptFeedback?.find((item) => item.assetId === asset.id)?.rating ?? null;
                    const criticRun = latestCriticRun(asset);
                    const criticImprovements = improvementSummary(criticRun?.improvementPlan ?? null);
                    return (
                      <article key={asset.id} className={`overflow-hidden rounded-2xl border-2 bg-white ${isActive ? 'border-[#2fbf71]' : 'border-[#172033]/10'}`}>
                        <button onClick={() => setPreviewAsset(asset)} className="block aspect-[9/12] w-full bg-[#f5f1e8]">
                          {asset.assetUrl ? <img src={asset.assetUrl} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><ImagePlus /></div>}
                        </button>
                        <div className="p-3">
                          <div className="mb-2 flex flex-wrap gap-2 text-xs font-black">
                            <span className="rounded-full bg-[#eef7ff] px-2 py-1">{versionLabel(scene, asset)}</span>
                            {isActive && <span className="rounded-full bg-[#dff8e9] px-2 py-1 text-[#17643a]">{isR16 ? 'In Book' : 'Active'}</span>}
                            {asset.isLatest && <span className="rounded-full bg-[#fff1c7] px-2 py-1">Latest</span>}
                            {asset.isFavorite && <span className="rounded-full bg-[#ffe1eb] px-2 py-1 text-[#b13b63]">Favorite</span>}
                            {!isR16 && <span className="rounded-full bg-[#eef7ff] px-2 py-1 text-[#2f80ed]">{criticStatusLabel(asset)}</span>}
                          </div>
                          <p className="text-xs font-bold text-[#596070]">{dateLabel(asset.createdAt)} {rating ? `| Rating ${rating > 0 ? '+' : ''}${rating}` : ''}</p>
                          {canUseTechnical && <p className="mt-1 text-xs font-semibold text-[#596070]">{asset.provider} | {asset.model} | {asset.width}x{asset.height}</p>}
                          {!isR16 && (
                            <div className="mt-3 rounded-xl bg-[#f6fbff] p-3 text-xs font-semibold text-[#596070]">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-black text-[#172033]">Creative Critic</span>
                                <span>{asset.criticScore === null || asset.criticScore === undefined ? 'No score' : `${Math.round(asset.criticScore)}/100`}</span>
                              </div>
                              {criticRun?.strengths?.length ? <p className="mt-2 line-clamp-2">Strength: {criticRun.strengths[0]}</p> : null}
                              {criticRun?.issues?.length ? <p className="mt-2 line-clamp-2 text-[#b13b63]">Issue: {criticRun.issues[0].description}</p> : null}
                              {criticImprovements.length ? (
                                <ul className="mt-2 space-y-1">
                                  {criticImprovements.map((item) => <li key={item}>- {item}</li>)}
                                </ul>
                              ) : null}
                            </div>
                          )}
                          <div className="mt-3 grid gap-2">
                            <button disabled={isActive} onClick={() => setActiveImage.mutate({ projectId, sceneId: scene.id, assetId: asset.id })} className="rounded-xl bg-[#2fbf71] px-3 py-2 text-sm font-black text-white disabled:opacity-50">{isR16 ? 'Use This Picture' : 'Set as Active'}</button>
                            <button onClick={() => favoriteAsset.mutate({ projectId, assetId: asset.id, isFavorite: !asset.isFavorite })} className="rounded-xl bg-white px-3 py-2 text-sm font-black text-[#172033] ring-2 ring-[#172033]/10"><Heart className="mr-1 inline" size={16} />{asset.isFavorite ? 'Unfavorite' : 'Favorite'}</button>
                            {!isR16 && <button onClick={() => runCreativeCritic.mutate({ projectId, sceneId: scene.id, assetId: asset.id })} disabled={runCreativeCritic.isPending} className="rounded-xl bg-[#eef7ff] px-3 py-2 text-sm font-black text-[#2f80ed]"><RefreshCw className="mr-1 inline" size={16} />Review Again</button>}
                            {!isR16 && criticRun?.recommendation && criticRun.recommendation !== 'APPROVE' && (
                              <button onClick={() => regenerateFromCritic.mutate({ projectId, criticRunId: criticRun.id, model: 'FLUX' })} disabled={regenerateFromCritic.isPending} className="rounded-xl bg-[#ffcf4a] px-3 py-2 text-sm font-black text-[#172033]">Improve and Regenerate</button>
                            )}
                            {!isR16 && <button onClick={() => approveSceneAsset.mutate({ projectId, assetId: asset.id })} disabled={approveSceneAsset.isPending} className="rounded-xl bg-[#dff8e9] px-3 py-2 text-sm font-black text-[#17643a]"><CheckCircle2 className="mr-1 inline" size={16} />Approve</button>}
                            {!isR16 && <button onClick={() => rejectSceneAsset.mutate({ projectId, assetId: asset.id })} disabled={rejectSceneAsset.isPending} className="rounded-xl bg-[#fff1f1] px-3 py-2 text-sm font-black text-[#b13b63]"><X className="mr-1 inline" size={16} />Reject</button>}
                            {!isR16 && (
                              <div className="grid grid-cols-3 gap-2">
                                <button onClick={() => submitCreativeCriticFeedback.mutate({ projectId, sceneId: scene.id, assetId: asset.id, criticRunId: criticRun?.id, rating: 'UP', categories: [] })} className="rounded-xl bg-white px-2 py-2 text-xs font-black text-[#17643a] ring-2 ring-[#172033]/10">Thumbs up</button>
                                <button onClick={() => submitCreativeCriticFeedback.mutate({ projectId, sceneId: scene.id, assetId: asset.id, criticRunId: criticRun?.id, rating: 'DOWN', categories: [] })} className="rounded-xl bg-white px-2 py-2 text-xs font-black text-[#b13b63] ring-2 ring-[#172033]/10">Thumbs down</button>
                                <button onClick={() => submitCreativeCriticFeedback.mutate({ projectId, sceneId: scene.id, assetId: asset.id, criticRunId: criticRun?.id, rating: 'NEEDS_IMPROVEMENT', categories: ['OTHER'] })} className="rounded-xl bg-white px-2 py-2 text-xs font-black text-[#596070] ring-2 ring-[#172033]/10">Needs work</button>
                              </div>
                            )}
                            {!isR16 && <button onClick={() => toggleCompareAsset(scene, asset.id)} className="rounded-xl bg-[#172033] px-3 py-2 text-sm font-black text-white">Compare</button>}
                            {!isR16 && !isActive && <button onClick={() => deleteAsset.mutate({ projectId, assetId: asset.id })} className="rounded-xl bg-[#fff1f1] px-3 py-2 text-sm font-black text-[#b13b63]"><Trash2 className="mr-1 inline" size={16} />Remove</button>}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!isR16 && compareAssets.length === 2 && (
        <div className="mt-6 rounded-2xl border-2 border-[#172033]/10 bg-[#101827] p-4 text-white">
          <h3 className="mb-3 text-xl font-black">Compare Images</h3>
          <div className="grid gap-4 md:grid-cols-2">
            {compareAssets.map((assetId) => {
              const scene = scenes.find((item) => item.assets?.some((asset) => asset.id === assetId));
              const asset = scene?.assets?.find((item) => item.id === assetId);
              if (!asset) return null;
              return <div key={assetId}><p className="mb-2 text-sm font-bold text-white/60">{scene?.activeImageAssetId === asset.id ? 'Current' : asset.isLatest ? 'Latest' : asset.isFavorite ? 'Favorite' : 'Previous'}</p>{asset.assetUrl && <img src={asset.assetUrl} alt="" className="w-full rounded-xl" />}</div>;
            })}
          </div>
        </div>
      )}
    </section>
  );

  return (
    <div className="min-h-screen bg-[#fff9ed] text-[#172033]">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-6 md:py-10">
        {renderHero()}
        {renderAcademyBanner()}
        {message && <div className="mt-4 rounded-xl bg-[#dff8e9] px-4 py-3 font-bold text-[#17643a]">{message}</div>}
        <nav className="sticky top-0 z-30 mt-5 -mx-4 overflow-x-auto border-y border-[#172033]/10 bg-[#fff9ed]/95 px-4 py-3 backdrop-blur">
          <div className="flex min-w-max gap-2">
            {TABS.map((item) => (
              <button key={item.key} onClick={() => chooseTab(item.key)} className={`rounded-full px-4 py-2 text-sm font-black ${tab === item.key ? 'bg-[#172033] text-white' : 'bg-white text-[#596070] ring-2 ring-[#172033]/10'}`}>
                {isR16 ? item.r16Label : item.label}
              </button>
            ))}
            {canUseTechnical && <Link href="/admin/character-insights" className="rounded-full bg-[#efe8ff] px-4 py-2 text-sm font-black text-[#5e3db2]">Insights</Link>}
          </div>
        </nav>
        <div className="mt-6">
          {tab === 'overview' && renderOverview()}
          {tab === 'story' && renderStory()}
          {tab === 'characters' && renderCharacters()}
          {tab === 'scenes' && renderScenes()}
          {tab === 'assets' && renderAssets()}
          {tab === 'storybook' && <section className="rounded-2xl border-2 border-[#172033]/10 bg-white p-8 text-center"><BookOpen className="mx-auto text-[#2f80ed]" size={48} /><h2 className="mt-3 text-3xl font-black">{isR16 ? 'Read your book' : 'Storybook'}</h2><p className="mt-2 font-semibold text-[#596070]">{isR16 ? 'Open the book with your chosen pictures.' : 'Storybook uses the active image for each scene, then latest image as fallback.'}</p><Link href={`/story-playground/${projectId}/storybook`} className="mt-5 inline-block rounded-xl bg-[#2f80ed] px-5 py-3 font-black text-white">{isR16 ? 'Read Book' : 'Open Storybook'}</Link></section>}
        </div>
      </main>

      {editingCharacter && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 px-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5">
            <div className="mb-4 flex items-center justify-between"><h3 className="text-2xl font-black">{editingCharacter.id === 'new' ? (isR16 ? 'Add Friend' : 'Add Character') : editingCharacter.name}</h3><button onClick={() => setEditingCharacter(null)}><X /></button></div>
            <div className="grid gap-3 md:grid-cols-2">
              <input value={characterForm.name} onChange={(e) => setCharacterForm({ ...characterForm, name: e.target.value })} placeholder="Name" className="rounded-xl border-2 p-3 font-bold" />
              <input value={characterForm.role} onChange={(e) => setCharacterForm({ ...characterForm, role: e.target.value })} placeholder="Role" className="rounded-xl border-2 p-3 font-bold" />
              <input value={characterForm.species} onChange={(e) => setCharacterForm({ ...characterForm, species: e.target.value })} placeholder="Species" className="rounded-xl border-2 p-3 font-bold" />
              <input value={characterForm.ageDescription} onChange={(e) => setCharacterForm({ ...characterForm, ageDescription: e.target.value })} placeholder="Age" className="rounded-xl border-2 p-3 font-bold" />
            </div>
            <textarea value={characterForm.visualDescription} onChange={(e) => setCharacterForm({ ...characterForm, visualDescription: e.target.value })} placeholder={isR16 ? 'How should this character look?' : 'Visual description'} rows={4} className="mt-3 w-full rounded-xl border-2 p-3 font-bold" />
            <div className="mt-4 flex flex-wrap gap-2">{PERSONALITY_OPTIONS.map((trait) => <button key={trait} onClick={() => setCharacterForm((current) => ({ ...current, personalityTraits: current.personalityTraits.includes(trait) ? current.personalityTraits.filter((item) => item !== trait) : [...current.personalityTraits, trait] }))} className={`rounded-full px-3 py-2 text-sm font-black ${characterForm.personalityTraits.includes(trait) ? 'bg-[#2fbf71] text-white' : 'bg-[#f5f1e8]'}`}>{label(trait)}</button>)}</div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <select value={characterForm.motivation} onChange={(e) => setCharacterForm({ ...characterForm, motivation: e.target.value })} className="rounded-xl border-2 p-3 font-bold"><option value="">{isR16 ? 'Want' : 'Motivation'}</option>{MOTIVATION_OPTIONS.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select>
              <select value={characterForm.fear} onChange={(e) => setCharacterForm({ ...characterForm, fear: e.target.value })} className="rounded-xl border-2 p-3 font-bold"><option value="">Fear</option>{FEAR_OPTIONS.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select>
              <select value={characterForm.goal} onChange={(e) => setCharacterForm({ ...characterForm, goal: e.target.value })} className="rounded-xl border-2 p-3 font-bold"><option value="">Goal</option>{GOAL_OPTIONS.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select>
              <select value={characterForm.walkingStyle} onChange={(e) => setCharacterForm({ ...characterForm, walkingStyle: e.target.value })} className="rounded-xl border-2 p-3 font-bold"><option value="">Walking Style</option>{WALKING_OPTIONS.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select>
              <input value={characterForm.relationshipTargetName} onChange={(e) => setCharacterForm({ ...characterForm, relationshipTargetName: e.target.value })} placeholder={isR16 ? 'Friend name' : 'Relationship target'} className="rounded-xl border-2 p-3 font-bold" />
              {!isR16 && <input value={characterForm.evolutionStage} onChange={(e) => setCharacterForm({ ...characterForm, evolutionStage: e.target.value })} placeholder="Evolution stage" className="rounded-xl border-2 p-3 font-bold" />}
            </div>
            <div className="mt-5 flex justify-end gap-3"><button onClick={() => setEditingCharacter(null)} className="rounded-xl bg-[#ece4d4] px-5 py-3 font-black">Cancel</button><button onClick={saveCharacter} disabled={!characterForm.name.trim() || !characterForm.visualDescription.trim()} className="rounded-xl bg-[#2fbf71] px-5 py-3 font-black text-white disabled:opacity-50">Save</button></div>
          </div>
        </div>
      )}

      {editingScene && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 px-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5">
            <div className="mb-4 flex items-center justify-between"><h3 className="text-2xl font-black">{isR16 ? 'Change Scene' : 'Edit Scene'}</h3><button onClick={() => setEditingScene(null)}><X /></button></div>
            <input value={sceneForm.title} onChange={(e) => setSceneForm({ ...sceneForm, title: e.target.value })} className="w-full rounded-xl border-2 p-3 font-bold" />
            <textarea value={sceneForm.description} onChange={(e) => setSceneForm({ ...sceneForm, description: e.target.value })} rows={4} className="mt-3 w-full rounded-xl border-2 p-3 font-bold" />
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <input value={sceneForm.locationType} onChange={(e) => setSceneForm({ ...sceneForm, locationType: e.target.value })} placeholder="Place" className="rounded-xl border-2 p-3 font-bold" />
              <input value={sceneForm.indoorOutdoor} onChange={(e) => setSceneForm({ ...sceneForm, indoorOutdoor: e.target.value })} placeholder="Indoor/outdoor" className="rounded-xl border-2 p-3 font-bold" />
              <input value={sceneForm.mood} onChange={(e) => setSceneForm({ ...sceneForm, mood: e.target.value })} placeholder="Mood" className="rounded-xl border-2 p-3 font-bold" />
              {Object.entries(DIRECTOR_OPTIONS).map(([key, values]) => <select key={key} value={(sceneForm as any)[key]} onChange={(e) => setSceneForm({ ...sceneForm, [key]: e.target.value } as any)} className="rounded-xl border-2 p-3 font-bold"><option value="">{label(key)}</option>{values.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select>)}
            </div>
            <div className="mt-5 flex justify-end gap-3"><button onClick={() => setEditingScene(null)} className="rounded-xl bg-[#ece4d4] px-5 py-3 font-black">Cancel</button><button onClick={saveScene} className="rounded-xl bg-[#2f80ed] px-5 py-3 font-black text-white">Save</button></div>
          </div>
        </div>
      )}

      {previewAsset && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-4">
          <div className="max-h-[92vh] max-w-3xl overflow-y-auto rounded-2xl bg-white p-4">
            <div className="mb-3 flex items-center justify-between"><p className="font-black">{isR16 ? 'Picture' : 'Asset Preview'}</p><button onClick={() => setPreviewAsset(null)}><X /></button></div>
            {previewAsset.assetUrl && <img src={previewAsset.assetUrl} alt="" className="max-h-[75vh] rounded-xl object-contain" />}
          </div>
        </div>
      )}
    </div>
  );
}
