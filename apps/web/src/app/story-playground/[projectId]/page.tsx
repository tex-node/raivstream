'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { BookOpen, Camera, CheckCircle2, Clapperboard, Copy, Download, GripVertical, Heart, ImagePlus, Loader2, Mic, Music, Pause, Pencil, Play, Plus, RefreshCw, RotateCcw, Save, SkipBack, SkipForward, Star, Trash2, UserRound, Volume2, X } from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { useR16 } from '@/lib/r16';
import { trpc } from '@/lib/trpc';
import { useUser } from '@/lib/auth';

type WorkspaceTab = 'overview' | 'story' | 'characters' | 'scenes' | 'assets' | 'sequence' | 'audio' | 'film' | 'storybook' | 'insights';

const AUDIO_TRACK_TYPES = ['NARRATION', 'DIALOGUE', 'AMBIENCE', 'SFX', 'MUSIC'] as const;
const AUDIO_TRACK_TYPE_LABEL: Record<string, string> = {
  NARRATION: 'Narration', DIALOGUE: 'Dialogue', AMBIENCE: 'Ambience', SFX: 'Sound Effects', MUSIC: 'Music',
};

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

type SequenceScene = {
  id: string;
  storySceneId: string;
  orderIndex: number;
  enabled: boolean;
  durationSeconds: number;
  selectedAssetId: string | null;
  shotType: string | null;
  cameraMovement: string | null;
  cameraSpeed: string | null;
  cameraSpeedMultiplier: number | null;
  transition: string | null;
  transitionDurationSeconds: number | null;
  holdDurationSeconds: number | null;
  zoom: number | null;
  creativeNotes: string | null;
  storyScene: Scene;
  selectedAsset?: Asset | null;
};

type SequenceData = {
  sequence: {
    id: string;
    title: string;
    runtimeSeconds: number;
    status: string;
    currentVersionNumber: number;
    scenes: SequenceScene[];
    versions?: Array<{ id: string; versionNumber: number; title: string; runtimeSeconds: number; createdAt: string | Date }>;
  };
  runtime: {
    totalRuntimeSeconds: number;
    activeShotCount: number;
    totalShotCount: number;
    averageShotLength: number;
    transitionRule: string;
  };
  filmBlueprint: {
    sequenceId: string;
    version: number;
    runtimeSeconds: number;
    shots: Array<{ sequenceSceneId: string; storySceneId: string; assetId: string | null; order: number; enabled: boolean; durationSeconds: number }>;
  };
};

type MovieRenderJob = {
  id: string;
  status: string;
  progressPercent: number;
  currentStage: string | null;
  renderPlanHash: string;
  creditsCharged: number;
  errorMessage: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  movieAsset?: MovieAsset | null;
  events?: Array<{ id: string; eventName: string; stage: string | null; progressPercent: number | null; message: string | null; createdAt: string | Date }>;
};

type MovieAsset = {
  id: string;
  versionNumber: number;
  status: string;
  publicUrl: string | null;
  width: number;
  height: number;
  durationSeconds: number;
  fps: number;
  fileSizeBytes: number | null;
  checksum: string | null;
  isCurrent: boolean;
  createdAt: string | Date;
};

const TABS: Array<{ key: WorkspaceTab; label: string; r16Label: string; hideOnR16?: boolean }> = [
  { key: 'overview', label: 'Overview', r16Label: 'My Story' },
  { key: 'story', label: 'Story', r16Label: 'Story' },
  { key: 'characters', label: 'Characters', r16Label: 'Characters' },
  { key: 'scenes', label: 'Scenes', r16Label: 'Picture Cards' },
  { key: 'assets', label: 'Assets', r16Label: 'Pictures' },
  { key: 'sequence', label: 'Sequence', r16Label: 'Sequence', hideOnR16: true },
  { key: 'audio', label: 'Audio', r16Label: 'Audio', hideOnR16: true },
  { key: 'film', label: 'Film', r16Label: 'Film', hideOnR16: true },
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
const DURATION_OPTIONS = [2, 3, 4, 5, 7, 10] as const;
const SHOT_TYPE_OPTIONS = ['EXTREME_WIDE', 'WIDE', 'MEDIUM_WIDE', 'MEDIUM', 'MEDIUM_CLOSE_UP', 'CLOSE_UP', 'EXTREME_CLOSE_UP', 'POV', 'OVER_THE_SHOULDER', 'HIGH_ANGLE', 'LOW_ANGLE', 'TRACKING'] as const;
const CAMERA_MOVEMENT_OPTIONS = ['NONE', 'STATIC', 'PAN_LEFT', 'PAN_RIGHT', 'TILT_UP', 'TILT_DOWN', 'PUSH_IN', 'PULL_OUT', 'TRACK_LEFT', 'TRACK_RIGHT', 'ORBIT', 'DOLLY', 'CRANE', 'HANDHELD'] as const;
const CAMERA_SPEED_OPTIONS = ['SLOW', 'NORMAL', 'FAST', 'CUSTOM'] as const;
const TRANSITION_OPTIONS = ['CUT', 'CROSS_DISSOLVE', 'FADE', 'DIP_TO_BLACK', 'DIP_TO_WHITE', 'MATCH_CUT', 'WIPE', 'NONE'] as const;

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

function sequenceAsset(sequenceScene: SequenceScene) {
  return sequenceScene.selectedAsset
    ?? sequenceScene.storyScene.assets?.find((asset) => asset.id === sequenceScene.selectedAssetId)
    ?? activeAsset(sequenceScene.storyScene);
}

function formatRuntime(seconds?: number | null) {
  const value = Math.max(0, Math.round(seconds ?? 0));
  const minutes = Math.floor(value / 60);
  const remainder = value % 60;
  return minutes ? `${minutes}:${String(remainder).padStart(2, '0')}` : `${remainder}s`;
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
  const visibleTabs = TABS.filter((item) => !isR16 || !item.hideOnR16);
  const [tab, setTab] = useState<WorkspaceTab>(requestedTab && visibleTabs.some((item) => item.key === requestedTab) ? requestedTab : 'overview');
  const [message, setMessage] = useState<string | null>(null);
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
  const [editingScene, setEditingScene] = useState<Scene | null>(null);
  const [selectedCueId, setSelectedCueId] = useState<string | null>(null);
  const [newAudioTrackType, setNewAudioTrackType] = useState<typeof AUDIO_TRACK_TYPES[number]>('MUSIC');
  const [audioPlayheadSeconds, setAudioPlayheadSeconds] = useState(0);
  const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);
  const [compareAssets, setCompareAssets] = useState<string[]>([]);
  const [draggedSequenceSceneId, setDraggedSequenceSceneId] = useState<string | null>(null);
  const [selectedSequenceSceneId, setSelectedSequenceSceneId] = useState<string | null>(null);
  const [sequencePlaying, setSequencePlaying] = useState(false);
  const [previewShotIndex, setPreviewShotIndex] = useState(0);
  const [versionTitle, setVersionTitle] = useState('');
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
  const sequenceQuery = trpc.story.getOrCreateSequence.useQuery(
    { projectId },
    { enabled: Boolean(isLoaded && isSignedIn && !isR16 && tab === 'sequence') },
  );
  const audioPlanQuery = trpc.story.getAudioPlan.useQuery(
    { projectId },
    { enabled: Boolean(isLoaded && isSignedIn && !isR16 && tab === 'audio') },
  );
  const movieBuilderQuery = trpc.story.getMovieBuilder.useQuery(
    { projectId },
    {
      enabled: Boolean(isLoaded && isSignedIn && !isR16 && tab === 'film'),
      refetchInterval: (query) => {
        const history = ((query.state.data as any)?.history ?? []) as MovieRenderJob[];
        return history.some((job) => ['QUEUED', 'PREPARING', 'RENDERING_SHOTS', 'ASSEMBLING', 'ENCODING', 'UPLOADING'].includes(job.status)) ? 2500 : false;
      },
    },
  );
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
  const updateSequenceScene = trpc.story.updateSequenceScene.useMutation({ onSuccess: () => refreshSequence('Sequence updated.') });
  const reorderSequence = trpc.story.reorderSequence.useMutation({ onSuccess: () => refreshSequence('Timeline reordered.') });
  const duplicateSequenceScene = trpc.story.duplicateSequenceScene.useMutation({ onSuccess: () => refreshSequence('Shot duplicated.') });
  const removeSequenceScene = trpc.story.removeSequenceScene.useMutation({ onSuccess: () => refreshSequence('Shot removed from sequence.') });
  const restoreSourceScene = trpc.story.restoreSourceSceneToSequence.useMutation({ onSuccess: () => refreshSequence('Scene added to sequence.') });
  const addAudioTrack = trpc.story.addTrack.useMutation({ onSuccess: () => refreshAudio('Track added.') });
  const updateAudioTrack = trpc.story.updateTrack.useMutation({ onSuccess: () => refreshAudio('Track updated.') });
  const addAudioCue = trpc.story.addCue.useMutation({ onSuccess: () => refreshAudio('Cue added.') });
  const updateAudioCue = trpc.story.updateCue.useMutation({ onSuccess: () => refreshAudio('Cue updated.') });
  const removeAudioCue = trpc.story.removeCue.useMutation({ onSuccess: () => refreshAudio('Cue removed.') });
  const duplicateAudioCue = trpc.story.duplicateCue.useMutation({ onSuccess: () => refreshAudio('Cue duplicated.') });
  const createVoiceProfile = trpc.story.createVoiceProfile.useMutation({ onSuccess: () => refreshAudio('Voice profile created.') });
  const saveAudioVersion = trpc.story.saveAudioVersion.useMutation({ onSuccess: () => refreshAudio('Audio version saved.') });
  const restoreAudioVersion = trpc.story.restoreAudioVersion.useMutation({ onSuccess: () => refreshAudio('Audio version restored.') });
  const listAudioVersions = trpc.story.listAudioVersions.useQuery(
    { projectId, planId: (audioPlanQuery.data as any)?.plan?.id ?? '' },
    { enabled: Boolean(isLoaded && isSignedIn && !isR16 && tab === 'audio' && (audioPlanQuery.data as any)?.plan?.id) },
  );
  const voiceProfilesQuery = trpc.story.listVoiceProfiles.useQuery(
    { projectId },
    { enabled: Boolean(isLoaded && isSignedIn && !isR16 && tab === 'audio') },
  );
  const createSequenceVersion = trpc.story.createSequenceVersion.useMutation({ onSuccess: () => { setVersionTitle(''); refreshSequence('Version saved.'); } });
  const restoreSequenceVersion = trpc.story.restoreSequenceVersion.useMutation({ onSuccess: () => refreshSequence('Version restored.') });
  const duplicateSequenceVersion = trpc.story.duplicateSequenceVersion.useMutation({ onSuccess: () => refreshSequence('Version duplicated.') });
  const trackSequenceAnalytics = trpc.story.trackSequenceAnalytics.useMutation();
  const createMovieRender = trpc.story.createMovieRender.useMutation({ onSuccess: () => refreshMovie('Movie render started.') });
  const retryMovieRender = trpc.story.retryMovieRender.useMutation({ onSuccess: () => refreshMovie('Movie render queued again.') });
  const cancelMovieRender = trpc.story.cancelMovieRender.useMutation({ onSuccess: () => refreshMovie('Movie render cancelled.') });
  const setCurrentMovie = trpc.story.setCurrentMovie.useMutation({ onSuccess: () => refreshMovie('Current movie updated.') });

  function refresh(nextMessage: string) {
    setMessage(nextMessage);
    utils.story.getWorkspace.invalidate({ projectId });
    utils.story.getStoryBook.invalidate({ projectId });
  }

  function refreshSequence(nextMessage: string) {
    setMessage(nextMessage);
    utils.story.getOrCreateSequence.invalidate({ projectId });
    utils.story.getSequence.invalidate({ projectId });
    utils.story.getWorkspace.invalidate({ projectId });
  }

  function refreshMovie(nextMessage: string) {
    setMessage(nextMessage);
    utils.story.getMovieBuilder.invalidate({ projectId });
    utils.story.listMovieRenders.invalidate({ projectId });
  }

  function refreshAudio(nextMessage: string) {
    setMessage(nextMessage);
    utils.story.getAudioPlan.invalidate({ projectId });
    utils.story.listVoiceProfiles.invalidate({ projectId });
    const planId = (audioPlanQuery.data as any)?.plan?.id;
    if (planId) utils.story.listAudioVersions.invalidate({ projectId, planId });
  }

  useEffect(() => {
    if (requestedTab && visibleTabs.some((item) => item.key === requestedTab)) setTab(requestedTab);
    if (isR16 && (requestedTab === 'sequence' || requestedTab === 'audio' || requestedTab === 'film')) setTab('storybook');
  }, [requestedTab, isR16]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!projectId || !tab) return;
    trackTab.mutate({ projectId, tab });
    if (tab === 'assets') utils.story.getWorkspace.invalidate({ projectId });
    if (tab === 'sequence' && !isR16) utils.story.getOrCreateSequence.invalidate({ projectId });
    if (tab === 'audio' && !isR16) utils.story.getAudioPlan.invalidate({ projectId });
    if (tab === 'film' && !isR16) utils.story.getMovieBuilder.invalidate({ projectId });
  }, [tab, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sequencePlaying || isR16) return;
    const data = sequenceQuery.data as SequenceData | undefined;
    const sequence = data?.sequence;
    const enabledShots = (sequence?.scenes ?? []).filter((item) => item.enabled).sort((a, b) => a.orderIndex - b.orderIndex);
    if (!sequence || enabledShots.length === 0) return;
    const current = enabledShots[Math.min(previewShotIndex, enabledShots.length - 1)];
    const timeout = window.setTimeout(() => {
      if (previewShotIndex >= enabledShots.length - 1) {
        setSequencePlaying(false);
        trackSequenceAnalytics.mutate({ projectId, sequenceId: sequence.id, event: 'sequence_preview_completed', properties: { runtimeSeconds: data?.runtime.totalRuntimeSeconds } });
      } else {
        setPreviewShotIndex((index) => Math.min(index + 1, enabledShots.length - 1));
      }
    }, Math.max(500, (current?.durationSeconds ?? 4) * 1000));
    return () => window.clearTimeout(timeout);
  }, [sequencePlaying, previewShotIndex, sequenceQuery.data, isR16]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isLoaded) {
    return <div className="min-h-screen bg-[#0B0D14]"><Navbar /><main className="mx-auto max-w-6xl px-4 py-12 font-bold text-[#9397ab]">Loading workspace...</main></div>;
  }
  if (!isSignedIn) {
    return <div className="min-h-screen bg-[#0B0D14]"><Navbar /><main className="mx-auto max-w-3xl px-4 py-12"><h1 className="text-3xl font-black">Sign in to open this story.</h1><Link href="/sign-in" className="mt-5 inline-block rounded-xl bg-[linear-gradient(90deg,#d946a8,#b25ad9,#4f8bd6)] px-5 py-3 font-black text-white">Sign In</Link></main></div>;
  }
  if (workspace.isLoading) {
    return <div className="min-h-screen bg-[#0B0D14]"><Navbar /><main className="mx-auto max-w-6xl px-4 py-12"><div className="h-40 animate-pulse rounded-2xl bg-[rgba(233,233,237,0.08)]" /></main></div>;
  }
  if (workspace.error) {
    return <div className="min-h-screen bg-[#0B0D14]"><Navbar /><main className="mx-auto max-w-3xl px-4 py-12"><h1 className="text-3xl font-black">We could not open this story.</h1><p className="mt-3 font-bold text-[#9397ab]">{workspace.error.message}</p><Link href="/story-playground" className="mt-5 inline-block rounded-xl bg-[#0B0D14] px-5 py-3 font-black text-white">Back to My Stories</Link></main></div>;
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
    if (isR16 && (nextTab === 'sequence' || nextTab === 'film')) return;
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
    <section className="rounded-3xl bg-[#0B0D14] p-5 text-white md:p-7">
      <div className="grid gap-6 md:grid-cols-[1fr_220px] md:items-center">
        <div>
          <Link href="/story-playground" className="text-sm font-black text-[#b5abfc] hover:text-[#d946a8]">{isR16 ? 'My Stories' : 'Story Workspace'}</Link>
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
      <section className="mt-4 rounded-2xl border border-[rgba(79,139,214,0.25)] bg-[rgba(79,139,214,0.10)] p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black uppercase text-[#b5abfc]">Academy Assignment</p>
            <h2 className="text-xl font-black">{assignment?.title ?? 'Loading assignment...'}</h2>
            {assignment?.brief && <p className="mt-1 text-sm font-bold text-[#9397ab]">{assignment.brief}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {assignment?.assignmentId && <Link href={`/academy/classes/${assignment.classId}/assignments/${assignment.assignmentId}`} className="rounded-xl bg-[rgba(233,233,237,0.04)] border border-[rgba(233,233,237,0.10)] px-4 py-3 text-sm font-black text-[#F7F8FC]">View Instructions</Link>}
            <button onClick={() => setMessage('Progress saved in this Story Workspace.')} className="rounded-xl bg-[linear-gradient(90deg,#d946a8,#b25ad9)] px-4 py-3 text-sm font-black text-[#F7F8FC]">Save Progress</button>
            <button disabled={!assignment?.assignmentId || submitAcademyAssignment.isPending} onClick={() => submitAcademyAssignment.mutate({ assignmentId: academyAssignmentId, projectId })} className="rounded-xl bg-[linear-gradient(90deg,#d946a8,#b25ad9)] px-4 py-3 text-sm font-black text-white disabled:opacity-50">Submit Work</button>
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
          <div key={name} className="rounded-2xl border border-[rgba(233,233,237,0.08)] bg-[rgba(233,233,237,0.04)] p-4">
            <p className="text-xs font-black uppercase tracking-wide text-[#9397ab]">{name}</p>
            <p className="mt-2 text-2xl font-black">{value}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <button onClick={() => continueStory.mutate({ projectId })} className="rounded-2xl bg-[#0B0D14] px-5 py-4 text-left font-black text-white">{isR16 ? 'Keep Writing' : 'Continue Writing'}</button>
        <button onClick={() => chooseTab('characters')} className="rounded-2xl bg-[linear-gradient(90deg,#d946a8,#b25ad9)] px-5 py-4 text-left font-black text-white">{isR16 ? 'Meet My Characters' : 'Edit Characters'}</button>
        <button onClick={() => chooseTab('scenes')} className="rounded-2xl bg-[linear-gradient(90deg,#d946a8,#b25ad9)] px-5 py-4 text-left font-black text-[#F7F8FC]">{isR16 ? 'Add Pictures' : 'Add Pictures'}</button>
        {isR16
          ? <Link href={`/story-playground/${projectId}/storybook`} className="rounded-2xl bg-[linear-gradient(90deg,#d946a8,#b25ad9,#4f8bd6)] px-5 py-4 text-left font-black text-white">Read Book</Link>
          : <button onClick={() => chooseTab('sequence')} className="rounded-2xl bg-[linear-gradient(90deg,#d946a8,#b25ad9,#4f8bd6)] px-5 py-4 text-left font-black text-white">Open Sequence</button>}
      </div>
    </div>
  );

  const renderStory = () => (
    <section className="rounded-2xl border border-[rgba(233,233,237,0.08)] bg-[rgba(233,233,237,0.04)] p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-black uppercase text-[#b5abfc]">{isR16 ? 'My Story' : 'Story'}</p>
          <h2 className="text-3xl font-black">{project.title}</h2>
          <p className="mt-2 font-semibold text-[#9397ab]">{project.synopsis ?? project.logline ?? project.originalIdea}</p>
        </div>
        <button onClick={() => continueStory.mutate({ projectId })} className="rounded-xl bg-[#0B0D14] px-4 py-3 font-black text-white">{isR16 ? 'Keep Writing' : 'Continue Story'}</button>
      </div>
      <div className="mt-5 grid gap-4">
        {chapters.map((chapter: any) => (
          <article key={chapter.id} className="rounded-2xl bg-[#0B0D14] p-4">
            <p className="text-xs font-black uppercase text-[#9397ab]">Chapter {chapter.chapterNumber}</p>
            <h3 className="mt-1 text-xl font-black">{chapter.title}</h3>
            <p className="mt-2 font-semibold text-[#9397ab]">{chapter.body}</p>
          </article>
        ))}
      </div>
      {project.storyDna && (
        <div className="mt-5 rounded-2xl bg-[rgba(79,139,214,0.10)] p-4">
          <p className="text-sm font-black uppercase text-[#b5abfc]">{isR16 ? 'What the story is about' : 'Story DNA Summary'}</p>
          <div className="mt-3 grid gap-2 text-sm font-bold text-[#F7F8FC] md:grid-cols-3">
            <span>Theme: {(project.storyDna as any).theme ?? project.theme ?? 'Story'}</span>
            <span>Hero: {(project.storyDna as any).hero ?? 'Main character'}</span>
            <span>Goal: {(project.storyDna as any).primaryGoal ?? 'Finish the adventure'}</span>
          </div>
        </div>
      )}
    </section>
  );

  const renderCharacters = () => (
    <section className="rounded-2xl border border-[rgba(233,233,237,0.08)] bg-[rgba(233,233,237,0.04)] p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-black uppercase text-[#4fd6e8]">{isR16 ? 'Characters' : 'Character Director'}</p>
          <h2 className="text-3xl font-black">{isR16 ? 'My Characters' : 'Characters'}</h2>
        </div>
        <button onClick={() => openCharacter()} className="inline-flex items-center gap-2 rounded-xl bg-[linear-gradient(90deg,#d946a8,#b25ad9)] px-4 py-3 font-black text-[#F7F8FC]"><Plus size={18} />{isR16 ? 'Add Friend' : 'Add Character'}</button>
      </div>
      {characters.length === 0 ? <div className="rounded-xl border border-dashed border-[rgba(233,233,237,0.10)] p-8 text-center font-bold text-[#9397ab]">No characters yet.</div> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {characters.map((character) => (
            <button key={character.id} onClick={() => openCharacter(character)} className="rounded-2xl border border-[rgba(233,233,237,0.08)] bg-[rgba(233,233,237,0.04)] p-4 text-left hover:border-[#b25ad9]">
              <UserRound className="text-[#4fd6e8]" />
              <h3 className="mt-3 text-xl font-black">{character.name}</h3>
              <p className="mt-1 text-sm font-bold text-[#9397ab]">{[character.ageDescription, character.gender, character.species].filter(Boolean).join(' ') || character.role || 'Story character'}</p>
              <p className="mt-3 line-clamp-3 text-sm font-semibold text-[#9397ab]">{character.visualDescription}</p>
              <div className="mt-3 flex flex-wrap gap-2">{(character.personalityTraits ?? []).slice(0, 4).map((trait) => <span key={trait} className="rounded-full bg-[rgba(79,214,232,0.12)] px-3 py-1 text-xs font-black text-[#4fd6e8]">{label(trait)}</span>)}</div>
            </button>
          ))}
        </div>
      )}
    </section>
  );

  const renderScenes = () => (
    <section className="rounded-2xl border border-[rgba(233,233,237,0.08)] bg-[rgba(233,233,237,0.04)] p-5">
      <div className="mb-4">
        <p className="text-sm font-black uppercase text-[#b5abfc]">{isR16 ? 'Picture Cards' : 'Scenes'}</p>
        <h2 className="text-3xl font-black">{isR16 ? 'Story Pictures' : 'Scene Director'}</h2>
      </div>
      {scenes.length === 0 ? <div className="rounded-xl border border-dashed border-[rgba(233,233,237,0.10)] p-8 text-center font-bold text-[#9397ab]">No scene cards yet.</div> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {scenes.map((scene) => {
            const active = activeAsset(scene);
            return (
              <article key={scene.id} className="overflow-hidden rounded-2xl border border-[rgba(233,233,237,0.08)] bg-[rgba(233,233,237,0.04)]">
                <div className="aspect-[9/12] bg-[rgba(233,233,237,0.06)] bg-cover bg-center" style={active?.assetUrl ? { backgroundImage: `url("${active.assetUrl}")` } : undefined}>
                  {!active?.assetUrl && <div className="flex h-full items-center justify-center text-[#b5abfc]"><Camera size={42} /></div>}
                </div>
                <div className="p-4">
                  <p className="text-xs font-black uppercase text-[#9397ab]">Scene {scene.orderIndex}</p>
                  <h3 className="text-xl font-black">{scene.title}</h3>
                  <p className="mt-2 line-clamp-3 text-sm font-semibold text-[#9397ab]">{scene.description}</p>
                  {[scene.locationType, scene.indoorOutdoor, scene.timeOfDay ? label(scene.timeOfDay) : null, scene.mood].filter(Boolean).length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {[scene.locationType, scene.indoorOutdoor, scene.timeOfDay ? label(scene.timeOfDay) : null, scene.mood].filter(Boolean).map((tag) => (
                        <span key={tag} className="rounded-full border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.06)] px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#9397ab]">{tag}</span>
                      ))}
                    </div>
                  )}
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <button onClick={() => openScene(scene)} className="rounded-xl bg-[rgba(233,233,237,0.04)] border border-[rgba(233,233,237,0.10)] px-3 py-2 text-sm font-black text-[#F7F8FC]">{isR16 ? 'Change Scene' : 'Edit Scene'}</button>
                    <button
                      onClick={() => (scene.imageUrl ? regenerateSceneImage : generateSceneImage).mutate({ projectId, sceneId: scene.id, model: 'FLUX' })}
                      disabled={(generateSceneImage.isPending && (generateSceneImage.variables as any)?.sceneId === scene.id) || (regenerateSceneImage.isPending && (regenerateSceneImage.variables as any)?.sceneId === scene.id)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[linear-gradient(90deg,#d946a8,#b25ad9)] px-3 py-2 text-sm font-black text-[#F7F8FC] disabled:opacity-60"
                    >
                      {((generateSceneImage.isPending && (generateSceneImage.variables as any)?.sceneId === scene.id) || (regenerateSceneImage.isPending && (regenerateSceneImage.variables as any)?.sceneId === scene.id))
                        ? <><Loader2 className="animate-spin" size={14} />{isR16 ? 'Making...' : 'Generating...'}</>
                        : scene.imageUrl ? (isR16 ? 'Try Again' : 'Regenerate') : (isR16 ? 'Make Picture' : 'Generate Picture')}
                    </button>
                    <button onClick={() => { chooseTab('assets'); setMessage(scene.title); }} className="rounded-xl bg-[rgba(79,139,214,0.10)] border border-[rgba(79,139,214,0.20)] px-3 py-2 text-sm font-black text-[#b5abfc]">{isR16 ? 'See Pictures' : 'Open Assets'}</button>
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
    <section className="rounded-2xl border border-[rgba(233,233,237,0.08)] bg-[rgba(233,233,237,0.04)] p-5">
      <div className="mb-4">
        <p className="text-sm font-black uppercase text-[#f0a3d4]">{isR16 ? 'Pictures' : 'Asset Manager'}</p>
        <h2 className="text-3xl font-black">{isR16 ? 'Choose pictures for the book' : 'Project Assets'}</h2>
      </div>
      <div className="space-y-6">
        {scenes.map((scene) => {
          const assets = (scene.assets ?? []).filter((asset) => asset.assetType === 'IMAGE' && asset.status === 'READY');
          return (
            <div key={scene.id} className="rounded-2xl bg-[#0B0D14] p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-xl font-black">{scene.title}</h3>
                  <p className="text-sm font-bold text-[#9397ab]">{assets.length ? `${assets.length} ${isR16 ? 'pictures' : 'image versions'}` : 'No pictures yet'}</p>
                </div>
                <button onClick={() => regenerateSceneImage.mutate({ projectId, sceneId: scene.id, model: 'FLUX' })} className="rounded-xl bg-[linear-gradient(90deg,#d946a8,#b25ad9)] px-4 py-2 text-sm font-black text-[#F7F8FC]">{isR16 ? 'Make Another Picture' : 'Regenerate from Current Settings'}</button>
              </div>
              {assets.length === 0 ? <div className="rounded-xl border border-dashed border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-6 text-center font-bold text-[#9397ab]">No pictures yet.</div> : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {assets.map((asset) => {
                    const isActive = scene.activeImageAssetId === asset.id || (!scene.activeImageAssetId && asset.isLatest);
                    const rating = scene.promptFeedback?.find((item) => item.assetId === asset.id)?.rating ?? null;
                    const criticRun = latestCriticRun(asset);
                    const criticImprovements = improvementSummary(criticRun?.improvementPlan ?? null);
                    return (
                      <article key={asset.id} className={`overflow-hidden rounded-2xl border bg-[rgba(233,233,237,0.04)] ${isActive ? 'border-[#b25ad9]' : 'border-[rgba(233,233,237,0.08)]'}`}>
                        <button onClick={() => setPreviewAsset(asset)} className="block aspect-[9/12] w-full bg-[rgba(233,233,237,0.06)]">
                          {(asset.thumbnailUrl ?? asset.assetUrl) ? <img src={asset.thumbnailUrl ?? asset.assetUrl!} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><ImagePlus /></div>}
                        </button>
                        <div className="p-3">
                          <div className="mb-2 flex flex-wrap gap-2 text-xs font-black">
                            <span className="rounded-full bg-[rgba(79,139,214,0.10)] px-2 py-1">{versionLabel(scene, asset)}</span>
                            {isActive && <span className="rounded-full bg-[rgba(79,214,232,0.12)] px-2 py-1 text-[#4fd6e8]">{isR16 ? 'In Book' : 'Active'}</span>}
                            {asset.isLatest && <span className="rounded-full bg-[rgba(233,233,237,0.06)] px-2 py-1">Latest</span>}
                            {asset.isFavorite && <span className="rounded-full bg-[rgba(217,70,168,0.12)] px-2 py-1 text-[#f0a3d4]">Favorite</span>}
                            {!isR16 && <span className="rounded-full bg-[rgba(79,139,214,0.10)] px-2 py-1 text-[#b5abfc]">{criticStatusLabel(asset)}</span>}
                          </div>
                          <p className="text-xs font-bold text-[#9397ab]">{dateLabel(asset.createdAt)} {rating ? `| Rating ${rating > 0 ? '+' : ''}${rating}` : ''}</p>
                          {canUseTechnical && <p className="mt-1 text-xs font-semibold text-[#9397ab]">{asset.provider} | {asset.model} | {asset.width}x{asset.height}</p>}
                          {!isR16 && (
                            <div className="mt-3 rounded-xl bg-[rgba(79,139,214,0.10)] p-3 text-xs font-semibold text-[#9397ab]">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-black text-[#F7F8FC]">Creative Critic</span>
                                <span>{asset.criticScore === null || asset.criticScore === undefined ? 'No score' : `${Math.round(asset.criticScore)}/100`}</span>
                              </div>
                              {criticRun?.strengths?.length ? <p className="mt-2 line-clamp-2">Strength: {criticRun.strengths[0]}</p> : null}
                              {criticRun?.issues?.length ? <p className="mt-2 line-clamp-2 text-[#f0a3d4]">Issue: {criticRun.issues[0].description}</p> : null}
                              {criticImprovements.length ? (
                                <ul className="mt-2 space-y-1">
                                  {criticImprovements.map((item) => <li key={item}>- {item}</li>)}
                                </ul>
                              ) : null}
                            </div>
                          )}
                          <div className="mt-3 grid gap-2">
                            <button disabled={isActive} onClick={() => setActiveImage.mutate({ projectId, sceneId: scene.id, assetId: asset.id })} className="rounded-xl bg-[linear-gradient(90deg,#d946a8,#b25ad9)] px-3 py-2 text-sm font-black text-white disabled:opacity-50">{isR16 ? 'Use This Picture' : 'Set as Active'}</button>
                            <button onClick={() => favoriteAsset.mutate({ projectId, assetId: asset.id, isFavorite: !asset.isFavorite })} className="rounded-xl bg-[rgba(233,233,237,0.04)] border border-[rgba(233,233,237,0.10)] px-3 py-2 text-sm font-black text-[#F7F8FC]"><Heart className="mr-1 inline" size={16} />{asset.isFavorite ? 'Unfavorite' : 'Favorite'}</button>
                            {!isR16 && <button onClick={() => runCreativeCritic.mutate({ projectId, sceneId: scene.id, assetId: asset.id })} disabled={runCreativeCritic.isPending} className="rounded-xl bg-[rgba(79,139,214,0.10)] px-3 py-2 text-sm font-black text-[#b5abfc]"><RefreshCw className="mr-1 inline" size={16} />Review Again</button>}
                            {!isR16 && criticRun?.recommendation && criticRun.recommendation !== 'APPROVE' && (
                              <button onClick={() => regenerateFromCritic.mutate({ projectId, criticRunId: criticRun.id, model: 'FLUX' })} disabled={regenerateFromCritic.isPending} className="rounded-xl bg-[linear-gradient(90deg,#d946a8,#b25ad9)] px-3 py-2 text-sm font-black text-[#F7F8FC]">Improve and Regenerate</button>
                            )}
                            {!isR16 && <button onClick={() => approveSceneAsset.mutate({ projectId, assetId: asset.id })} disabled={approveSceneAsset.isPending} className="rounded-xl bg-[rgba(79,214,232,0.12)] px-3 py-2 text-sm font-black text-[#4fd6e8]"><CheckCircle2 className="mr-1 inline" size={16} />Approve</button>}
                            {!isR16 && <button onClick={() => rejectSceneAsset.mutate({ projectId, assetId: asset.id })} disabled={rejectSceneAsset.isPending} className="rounded-xl border border-[rgba(217,70,168,0.20)] bg-[rgba(217,70,168,0.08)] px-3 py-2 text-sm font-black text-[#f0a3d4]"><X className="mr-1 inline" size={16} />Reject</button>}
                            {!isR16 && (
                              <div className="grid grid-cols-3 gap-2">
                                <button onClick={() => submitCreativeCriticFeedback.mutate({ projectId, sceneId: scene.id, assetId: asset.id, criticRunId: criticRun?.id, rating: 'UP', categories: [] })} className="rounded-xl bg-[rgba(79,214,232,0.10)] border border-[rgba(79,214,232,0.25)] px-2 py-2 text-xs font-black text-[#4fd6e8]">Thumbs up</button>
                                <button onClick={() => submitCreativeCriticFeedback.mutate({ projectId, sceneId: scene.id, assetId: asset.id, criticRunId: criticRun?.id, rating: 'DOWN', categories: [] })} className="rounded-xl bg-[rgba(217,70,168,0.10)] border border-[rgba(217,70,168,0.25)] px-2 py-2 text-xs font-black text-[#f0a3d4]">Thumbs down</button>
                                <button onClick={() => submitCreativeCriticFeedback.mutate({ projectId, sceneId: scene.id, assetId: asset.id, criticRunId: criticRun?.id, rating: 'NEEDS_IMPROVEMENT', categories: ['OTHER'] })} className="rounded-xl bg-[rgba(233,233,237,0.04)] border border-[rgba(233,233,237,0.10)] px-2 py-2 text-xs font-black text-[#9397ab]">Needs work</button>
                              </div>
                            )}
                            {!isR16 && <button onClick={() => toggleCompareAsset(scene, asset.id)} className="rounded-xl bg-[#0B0D14] px-3 py-2 text-sm font-black text-white">Compare</button>}
                            {!isR16 && !isActive && <button onClick={() => deleteAsset.mutate({ projectId, assetId: asset.id })} className="rounded-xl border border-[rgba(217,70,168,0.20)] bg-[rgba(217,70,168,0.08)] px-3 py-2 text-sm font-black text-[#f0a3d4]"><Trash2 className="mr-1 inline" size={16} />Remove</button>}
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
        <div className="mt-6 rounded-2xl border border-[rgba(233,233,237,0.08)] bg-[#101827] p-4 text-white">
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

  const renderSequence = () => {
    if (isR16) return null;
    if (sequenceQuery.isLoading) return <section className="rounded-2xl border border-[rgba(233,233,237,0.08)] bg-[rgba(233,233,237,0.04)] p-8 font-bold text-[#9397ab]">Loading sequence...</section>;
    if (sequenceQuery.error) return <section className="rounded-2xl border border-[rgba(217,70,168,0.20)] bg-[rgba(217,70,168,0.06)] p-8 font-bold text-[#f0a3d4]">{sequenceQuery.error.message}</section>;
    const data = sequenceQuery.data as SequenceData | undefined;
    if (!data?.sequence) return <section className="rounded-2xl border border-[rgba(233,233,237,0.08)] bg-[rgba(233,233,237,0.04)] p-8 font-bold text-[#9397ab]">No sequence yet.</section>;
    const sequence = data.sequence;
    const sequenceScenes = [...(sequence.scenes ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
    const enabledShots = sequenceScenes.filter((item) => item.enabled);
    const selected = sequenceScenes.find((item) => item.id === selectedSequenceSceneId) ?? sequenceScenes[0] ?? null;
    const previewShot = enabledShots[Math.min(previewShotIndex, Math.max(0, enabledShots.length - 1))] ?? enabledShots[0] ?? null;
    const elapsed = enabledShots.slice(0, Math.min(previewShotIndex, enabledShots.length)).reduce((sum, item) => sum + item.durationSeconds + (item.holdDurationSeconds ?? 0), 0);

    const updateSequenceEntry = (sequenceScene: SequenceScene, patch: Partial<Pick<SequenceScene, 'enabled' | 'durationSeconds' | 'selectedAssetId' | 'shotType' | 'cameraMovement' | 'cameraSpeed' | 'cameraSpeedMultiplier' | 'transition' | 'transitionDurationSeconds' | 'holdDurationSeconds' | 'zoom' | 'creativeNotes'>>) => {
      updateSequenceScene.mutate({
        projectId,
        sequenceId: sequence.id,
        sequenceSceneId: sequenceScene.id,
        ...patch,
      } as Parameters<typeof updateSequenceScene.mutate>[0]);
    };

    const moveSequenceScene = (targetId: string) => {
      if (!draggedSequenceSceneId || draggedSequenceSceneId === targetId) return;
      const ids = sequenceScenes.map((item) => item.id);
      const fromIndex = ids.indexOf(draggedSequenceSceneId);
      const toIndex = ids.indexOf(targetId);
      if (fromIndex < 0 || toIndex < 0) return;
      const next = [...ids];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      reorderSequence.mutate({ projectId, sequenceId: sequence.id, sequenceSceneIds: next });
      setDraggedSequenceSceneId(null);
    };

    const startPreview = () => {
      if (!previewShot) return;
      setSequencePlaying(true);
      trackSequenceAnalytics.mutate({ projectId, sequenceId: sequence.id, event: 'sequence_preview_started', properties: { shotIndex: previewShotIndex + 1, runtimeSeconds: data.runtime.totalRuntimeSeconds } });
    };

    const selectedAssets = selected
      ? (selected.storyScene.assets ?? []).filter((asset) => asset.assetType === 'IMAGE' && asset.status === 'READY' && asset.creativeStatus !== 'REJECTED')
      : [];

    return (
      <section className="space-y-5">
        <div className="rounded-2xl bg-[#111827] p-5 text-white">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-sm font-black uppercase text-[#ffcf4a]">Sequence Workspace</p>
              <h2 className="text-3xl font-black">{sequence.title}</h2>
              <p className="mt-2 max-w-3xl text-sm font-semibold text-white/65">Arrange the story like an edit decision list. No movie is rendered here.</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm font-black md:min-w-[420px]">
              <div className="rounded-xl bg-white/10 p-3"><p className="text-white/50">Runtime</p><p className="text-2xl">{formatRuntime(data.runtime.totalRuntimeSeconds)}</p></div>
              <div className="rounded-xl bg-white/10 p-3"><p className="text-white/50">Shots</p><p className="text-2xl">{data.runtime.activeShotCount}</p></div>
              <div className="rounded-xl bg-white/10 p-3"><p className="text-white/50">Avg Shot</p><p className="text-2xl">{data.runtime.averageShotLength}s</p></div>
            </div>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            <div className="overflow-hidden rounded-2xl border border-[rgba(233,233,237,0.08)] bg-[rgba(233,233,237,0.04)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(233,233,237,0.08)] px-4 py-3">
                <p className="text-xs font-black uppercase text-[#9397ab]">Timeline Editor</p>
                <button onClick={() => selected && restoreSourceScene.mutate({ projectId, sequenceId: sequence.id, storySceneId: selected.storySceneId, afterSequenceSceneId: selected.id })} disabled={!selected || restoreSourceScene.isPending} className="rounded-xl bg-[rgba(79,139,214,0.10)] px-3 py-2 text-xs font-black text-[#b5abfc]">Add Source Scene</button>
              </div>
              <div className="divide-y divide-[rgba(233,233,237,0.08)]">
                {sequenceScenes.map((sequenceScene) => {
                  const asset = sequenceAsset(sequenceScene);
                  return (
                    <article
                      key={sequenceScene.id}
                      draggable
                      onClick={() => setSelectedSequenceSceneId(sequenceScene.id)}
                      onDragStart={() => setDraggedSequenceSceneId(sequenceScene.id)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => moveSequenceScene(sequenceScene.id)}
                      className={`grid cursor-pointer gap-4 p-4 md:grid-cols-[34px_90px_1fr] ${sequenceScene.enabled ? 'bg-[rgba(233,233,237,0.04)]' : 'bg-[rgba(233,233,237,0.02)] opacity-70'} ${selected?.id === sequenceScene.id ? 'ring-2 ring-[#b25ad9]/40' : ''}`}
                    >
                      <div className="flex items-center justify-center text-[#9397ab]"><GripVertical size={20} /></div>
                      <div className="aspect-[9/12] overflow-hidden rounded-xl bg-[rgba(233,233,237,0.06)]">
                        {asset?.assetUrl ? <img src={asset.assetUrl} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-[#9397ab]"><Clapperboard /></div>}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <p className="text-xs font-black uppercase text-[#9397ab]">Shot {sequenceScene.orderIndex}</p>
                            <h3 className="text-xl font-black">{sequenceScene.storyScene.title}</h3>
                            <p className="mt-1 line-clamp-2 text-sm font-semibold text-[#9397ab]">{sequenceScene.storyScene.description}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button onClick={(event) => { event.stopPropagation(); duplicateSequenceScene.mutate({ projectId, sequenceId: sequence.id, sequenceSceneId: sequenceScene.id }); }} className="rounded-xl bg-[rgba(79,139,214,0.10)] px-3 py-2 text-xs font-black text-[#b5abfc]"><Copy className="mr-1 inline" size={14} />Duplicate</button>
                            <button onClick={(event) => { event.stopPropagation(); updateSequenceEntry(sequenceScene, { enabled: !sequenceScene.enabled }); }} className="rounded-xl bg-[rgba(233,233,237,0.06)] px-3 py-2 text-xs font-black text-[#F7F8FC]">{sequenceScene.enabled ? 'Disable' : 'Enable'}</button>
                            <button onClick={(event) => { event.stopPropagation(); removeSequenceScene.mutate({ projectId, sequenceId: sequence.id, sequenceSceneId: sequenceScene.id }); }} className="rounded-xl bg-[#fff1f1] px-3 py-2 text-xs font-black text-[#f0a3d4]"><Trash2 className="mr-1 inline" size={14} />Remove</button>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs font-black">
                          <span className="rounded-full bg-[rgba(79,139,214,0.10)] px-2 py-1">{sequenceScene.durationSeconds}s</span>
                          <span className="rounded-full bg-[rgba(233,233,237,0.06)] px-2 py-1">{label(sequenceScene.shotType) || 'Shot'}</span>
                          <span className="rounded-full bg-[rgba(79,214,232,0.12)] px-2 py-1">{label(sequenceScene.cameraMovement) || 'Camera'}</span>
                          <span className="rounded-full bg-[rgba(217,70,168,0.12)] px-2 py-1">{label(sequenceScene.transition) || 'Transition'}</span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-[rgba(233,233,237,0.08)] bg-[#111827] p-4 text-white">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div><p className="text-xs font-black uppercase text-[#ffcf4a]">Storyboard Animatic</p><h3 className="text-xl font-black">Preview Timing</h3></div>
                <span className="text-sm font-black text-white/60">{formatRuntime(elapsed)} / {formatRuntime(data.runtime.totalRuntimeSeconds)}</span>
              </div>
              <div className="grid gap-4 md:grid-cols-[220px_1fr]">
                <div className="aspect-[9/12] overflow-hidden rounded-xl bg-white/10">
                  {previewShot && sequenceAsset(previewShot)?.assetUrl ? <img src={sequenceAsset(previewShot)?.assetUrl ?? ''} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><Camera /></div>}
                </div>
                <div className="flex flex-col justify-between gap-4">
                  <div>
                    <p className="text-sm font-black text-[#ffcf4a]">Shot {previewShot ? previewShotIndex + 1 : 0} of {enabledShots.length}</p>
                    <h4 className="mt-1 text-2xl font-black">{previewShot?.storyScene.title ?? 'No active shots'}</h4>
                    <p className="mt-2 text-sm font-semibold text-white/60">{previewShot?.durationSeconds ?? 0}s | {label(previewShot?.transition) || 'Cut'} | {label(previewShot?.cameraMovement) || 'Static'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => { setSequencePlaying(false); setPreviewShotIndex(0); }} className="rounded-xl bg-white/10 px-3 py-2 font-black"><RotateCcw size={16} /></button>
                    <button onClick={() => { setSequencePlaying(false); setPreviewShotIndex((index) => Math.max(0, index - 1)); }} className="rounded-xl bg-white/10 px-3 py-2 font-black"><SkipBack size={16} /></button>
                    <button onClick={sequencePlaying ? () => setSequencePlaying(false) : startPreview} className="rounded-xl bg-[linear-gradient(90deg,#d946a8,#b25ad9)] px-4 py-2 font-black text-white">{sequencePlaying ? <Pause size={16} /> : <Play size={16} />}</button>
                    <button onClick={() => { setSequencePlaying(false); setPreviewShotIndex((index) => Math.min(enabledShots.length - 1, index + 1)); }} className="rounded-xl bg-white/10 px-3 py-2 font-black"><SkipForward size={16} /></button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-[rgba(233,233,237,0.08)] bg-[rgba(233,233,237,0.04)] p-4">
              <p className="text-xs font-black uppercase text-[#9397ab]">Runtime Panel</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm font-black">
                <div className="rounded-xl bg-[#0B0D14] p-3"><p className="text-[#9397ab]">Runtime</p><p className="text-2xl">{formatRuntime(data.runtime.totalRuntimeSeconds)}</p></div>
                <div className="rounded-xl bg-[#0B0D14] p-3"><p className="text-[#9397ab]">Shots</p><p className="text-2xl">{data.runtime.activeShotCount}</p></div>
                <div className="rounded-xl bg-[#0B0D14] p-3"><p className="text-[#9397ab]">Avg</p><p className="text-2xl">{data.runtime.averageShotLength}s</p></div>
                <div className="rounded-xl bg-[#0B0D14] p-3"><p className="text-[#9397ab]">Entries</p><p className="text-2xl">{data.runtime.totalShotCount}</p></div>
              </div>
              <div className="mt-3 rounded-xl bg-[rgba(79,139,214,0.10)] p-3 text-sm font-bold text-[#9397ab]">
                <p>Narration: <span className="text-[#F7F8FC]">Not added</span></p>
                <p>Music: <span className="text-[#F7F8FC]">Not added</span></p>
                <p>Movie: <span className="text-[#F7F8FC]">Not rendered</span></p>
                <p>Render estimate: <span className="text-[#F7F8FC]">Available in Movie Builder</span></p>
              </div>
            </div>

            {selected && (
              <div className="rounded-2xl border border-[rgba(233,233,237,0.08)] bg-[rgba(233,233,237,0.04)] p-4">
                <p className="text-xs font-black uppercase text-[#9397ab]">Shot Inspector</p>
                <h3 className="mt-1 text-xl font-black">{selected.storyScene.title}</h3>
                <div className="mt-4 space-y-3">
                  <label className="block text-xs font-black uppercase text-[#9397ab]">Picture<select value={selected.selectedAssetId ?? ''} onChange={(event) => updateSequenceEntry(selected, { selectedAssetId: event.target.value || null })} className="mt-1 w-full rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-2 text-sm normal-case text-[#F7F8FC] outline-none focus:border-[#b25ad9]"><option value="">Auto / active image</option>{selectedAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.creativeStatus === 'APPROVED' ? 'Approved' : selected.storyScene.activeImageAssetId === asset.id ? 'Active' : asset.isFavorite ? 'Favorite' : asset.isLatest ? 'Latest' : 'Legacy'} - {dateLabel(asset.createdAt)}</option>)}</select></label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs font-black uppercase text-[#9397ab]">Duration<select value={DURATION_OPTIONS.includes(selected.durationSeconds as any) ? String(selected.durationSeconds) : 'custom'} onChange={(event) => event.target.value !== 'custom' && updateSequenceEntry(selected, { durationSeconds: Number(event.target.value) })} className="mt-1 w-full rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-2 text-sm normal-case text-[#F7F8FC] outline-none focus:border-[#b25ad9]">{DURATION_OPTIONS.map((item) => <option key={item} value={item}>{item}s</option>)}<option value="custom">Custom</option></select></label>
                    <label className="text-xs font-black uppercase text-[#9397ab]">Custom<input type="number" min={0.5} max={60} step={0.5} value={selected.durationSeconds} onChange={(event) => updateSequenceEntry(selected, { durationSeconds: Number(event.target.value) })} className="mt-1 w-full rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-2 text-sm normal-case text-[#F7F8FC] outline-none focus:border-[#b25ad9]" /></label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs font-black uppercase text-[#9397ab]">Hold<input type="number" min={0} max={10} step={0.5} value={selected.holdDurationSeconds ?? 0} onChange={(event) => updateSequenceEntry(selected, { holdDurationSeconds: Number(event.target.value) })} className="mt-1 w-full rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-2 text-sm normal-case text-[#F7F8FC] outline-none focus:border-[#b25ad9]" /></label>
                    <label className="text-xs font-black uppercase text-[#9397ab]">Transition Time<input type="number" min={0} max={10} step={0.5} value={selected.transitionDurationSeconds ?? 0} onChange={(event) => updateSequenceEntry(selected, { transitionDurationSeconds: Number(event.target.value) })} className="mt-1 w-full rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-2 text-sm normal-case text-[#F7F8FC] outline-none focus:border-[#b25ad9]" /></label>
                  </div>
                  <label className="block text-xs font-black uppercase text-[#9397ab]">Shot<select value={selected.shotType ?? ''} onChange={(event) => updateSequenceEntry(selected, { shotType: event.target.value || null })} className="mt-1 w-full rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-2 text-sm normal-case text-[#F7F8FC] outline-none focus:border-[#b25ad9]"><option value="">Choose shot</option>{SHOT_TYPE_OPTIONS.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label>
                  <label className="block text-xs font-black uppercase text-[#9397ab]">Camera<select value={selected.cameraMovement ?? ''} onChange={(event) => updateSequenceEntry(selected, { cameraMovement: event.target.value || null })} className="mt-1 w-full rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-2 text-sm normal-case text-[#F7F8FC] outline-none focus:border-[#b25ad9]"><option value="">Choose movement</option>{CAMERA_MOVEMENT_OPTIONS.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs font-black uppercase text-[#9397ab]">Speed<select value={selected.cameraSpeed ?? ''} onChange={(event) => updateSequenceEntry(selected, { cameraSpeed: event.target.value || null })} className="mt-1 w-full rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-2 text-sm normal-case text-[#F7F8FC] outline-none focus:border-[#b25ad9]"><option value="">Speed</option>{CAMERA_SPEED_OPTIONS.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label>
                    <label className="text-xs font-black uppercase text-[#9397ab]">Multiplier<input type="number" min={0.1} max={4} step={0.1} value={selected.cameraSpeedMultiplier ?? 1} onChange={(event) => updateSequenceEntry(selected, { cameraSpeedMultiplier: Number(event.target.value) })} className="mt-1 w-full rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-2 text-sm normal-case text-[#F7F8FC] outline-none focus:border-[#b25ad9]" /></label>
                  </div>
                  <label className="block text-xs font-black uppercase text-[#9397ab]">Transition<select value={selected.transition ?? ''} onChange={(event) => updateSequenceEntry(selected, { transition: event.target.value || null })} className="mt-1 w-full rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-2 text-sm normal-case text-[#F7F8FC] outline-none focus:border-[#b25ad9]"><option value="">Choose transition</option>{TRANSITION_OPTIONS.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label>
                  <label className="block text-xs font-black uppercase text-[#9397ab]">Notes<textarea value={selected.creativeNotes ?? ''} onChange={(event) => updateSequenceEntry(selected, { creativeNotes: event.target.value })} rows={3} className="mt-1 w-full rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-3 text-sm normal-case text-[#F7F8FC] placeholder:text-[#75798c] outline-none focus:border-[#b25ad9]" placeholder="Creative or editorial notes" /></label>
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-[rgba(233,233,237,0.08)] bg-[rgba(233,233,237,0.04)] p-4">
              <p className="text-xs font-black uppercase text-[#9397ab]">Version History</p>
              <div className="mt-3 flex gap-2">
                <input value={versionTitle} onChange={(event) => setVersionTitle(event.target.value)} placeholder={`Version ${sequence.currentVersionNumber + 1}`} className="min-w-0 flex-1 rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] px-3 py-2 text-sm font-bold text-[#F7F8FC] placeholder:text-[#75798c] outline-none focus:border-[#b25ad9]" />
                <button onClick={() => createSequenceVersion.mutate({ projectId, sequenceId: sequence.id, title: versionTitle || undefined })} disabled={createSequenceVersion.isPending} className="rounded-xl bg-[#0B0D14] px-3 py-2 text-sm font-black text-white"><Save className="inline" size={15} /></button>
              </div>
              <div className="mt-3 space-y-2">
                {(sequence.versions ?? []).length === 0 ? <p className="rounded-xl border border-dashed border-[rgba(233,233,237,0.10)] p-4 text-sm font-bold text-[#9397ab]">No saved versions yet.</p> : sequence.versions?.map((version) => (
                  <div key={version.id} className="rounded-xl bg-[#0B0D14] p-3">
                    <p className="font-black">v{version.versionNumber} - {version.title}</p>
                    <p className="text-xs font-bold text-[#9397ab]">{formatRuntime(version.runtimeSeconds)} - {dateLabel(version.createdAt)}</p>
                    <div className="mt-2 flex gap-2">
                      <button onClick={() => restoreSequenceVersion.mutate({ projectId, sequenceId: sequence.id, versionId: version.id })} disabled={restoreSequenceVersion.isPending} className="rounded-lg bg-[rgba(181,171,252,0.10)] border border-[rgba(181,171,252,0.25)] px-3 py-2 text-xs font-black text-[#b5abfc]">Restore</button>
                      <button onClick={() => duplicateSequenceVersion.mutate({ projectId, sequenceId: sequence.id, versionId: version.id })} disabled={duplicateSequenceVersion.isPending} className="rounded-lg bg-[rgba(233,233,237,0.04)] border border-[rgba(233,233,237,0.10)] px-3 py-2 text-xs font-black text-[#9397ab]">Duplicate</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-[rgba(233,233,237,0.08)] bg-[rgba(233,233,237,0.04)] p-4">
              <p className="text-xs font-black uppercase text-[#9397ab]">Film Blueprint</p>
              <p className="mt-2 text-sm font-bold text-[#9397ab]">Phase 9B will consume this EDL contract. Provider and rendering settings are intentionally absent.</p>
              <div className="mt-3 rounded-xl bg-[rgba(233,233,237,0.06)] p-3 text-xs font-black text-[#9397ab]">
                <p>Sequence: {data.filmBlueprint.sequenceId}</p>
                <p>Version: {data.filmBlueprint.version}</p>
                <p>Shots: {data.filmBlueprint.shots.length}</p>
              </div>
            </div>
          </aside>
        </div>
      </section>
    );
  };

  const renderAudio = () => {
    if (isR16) return null;
    if (audioPlanQuery.isLoading) return <section className="rounded-2xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-8 font-bold text-[#9397ab]">Loading Audio & Performance Plan...</section>;
    if (audioPlanQuery.error) return <section className="rounded-2xl border border-[rgba(217,70,168,0.20)] bg-[rgba(217,70,168,0.06)] p-8 font-bold text-[#f0a3d4]">{audioPlanQuery.error.message}</section>;

    const data = audioPlanQuery.data as any;
    const plan = data?.plan;
    const tracks: any[] = plan?.tracks ?? [];
    const runtimeSeconds = Math.max(1, ...tracks.flatMap((t) => t.cues.map((c: any) => (c.startTimeSeconds ?? 0) + (c.durationSeconds ?? 1))), 12);
    const timeMarks = Array.from({ length: Math.ceil(runtimeSeconds / 5) + 1 }, (_, i) => i * 5);
    const allCues = tracks.flatMap((t: any) => t.cues.map((c: any) => ({ ...c, trackType: t.type, trackName: t.name })));
    const selectedCue = allCues.find((c: any) => c.id === selectedCueId) ?? null;
    const selectedCueAudioUrl = selectedCue?.audioAsset?.publicUrl ?? null;
    const attachedAudioCueCount = allCues.filter((cue: any) => Boolean(cue.audioAsset?.publicUrl)).length;
    const safePlayhead = Math.min(Math.max(audioPlayheadSeconds, 0), runtimeSeconds);
    const voiceProfiles = (voiceProfilesQuery.data as any[]) ?? [];
    const versions = (listAudioVersions.data as any[]) ?? [];

    const trackIcon = (type: string) => {
      if (type === 'NARRATION' || type === 'DIALOGUE') return <Mic size={14} />;
      if (type === 'MUSIC') return <Music size={14} />;
      return <Volume2 size={14} />;
    };

    return (
      <section className="space-y-5">
        <div className="rounded-2xl bg-[rgba(233,233,237,0.04)] border border-[rgba(233,233,237,0.10)] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-[#8fdfe8]">Audio & Performance</p>
              <h2 className="mt-1 text-3xl font-black text-[#F7F8FC]">Audio Plan</h2>
            </div>
            <div className="flex items-center gap-4 rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.03)] px-4 py-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-[#75798c]">Runtime</p>
                <p className="text-lg font-black text-[#F7F8FC]">{runtimeSeconds.toFixed(1)} sec</p>
              </div>
              <div className="h-8 w-px bg-[rgba(233,233,237,0.10)]" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-[#75798c]">Version</p>
                <p className="text-lg font-black text-[#F7F8FC]">{plan?.currentVersionNumber ?? 0}</p>
              </div>
            </div>
          </div>
          <p className="mt-2 max-w-3xl text-sm font-semibold text-[#9397ab]">
            Narration, dialogue, ambience, sound effects, and music — layered on the same canonical timeline as your Sequence. Cue times attach to finished-film seconds, not render transitions.
          </p>
          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="rounded-xl border border-[rgba(143,223,232,0.18)] bg-[rgba(143,223,232,0.06)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#8fdfe8]">Timeline Preview</p>
                  <p className="mt-1 text-sm font-bold text-[#F7F8FC]">{safePlayhead.toFixed(1)}s / {runtimeSeconds.toFixed(1)}s</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAudioPlayheadSeconds(0)}
                    className="inline-flex items-center gap-1 rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.06)] px-3 py-2 text-xs font-black text-[#F7F8FC]"
                  >
                    <RotateCcw size={13} /> Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => selectedCue && setAudioPlayheadSeconds(selectedCue.startTimeSeconds ?? 0)}
                    disabled={!selectedCue}
                    className="inline-flex items-center gap-1 rounded-xl bg-[rgba(181,171,252,0.14)] px-3 py-2 text-xs font-black text-[#b5abfc] disabled:opacity-40"
                  >
                    <Play size={13} /> Cue Start
                  </button>
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={runtimeSeconds}
                step={0.1}
                value={safePlayhead}
                onChange={(event) => setAudioPlayheadSeconds(Number(event.target.value))}
                className="mt-3 w-full accent-[#b25ad9]"
                aria-label="Audio timeline playhead"
              />
              <p className="mt-2 text-xs font-bold text-[#9397ab]">
                This previews timing and attached cue audio. Full layered mix playback is available after rendering from the Film tab.
              </p>
            </div>
            <div className="rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-[#9397ab]">Cue Audio Preview</p>
              {selectedCueAudioUrl ? (
                <audio key={selectedCue.id} controls src={selectedCueAudioUrl} className="mt-3 w-full" />
              ) : (
                <p className="mt-3 rounded-lg border border-dashed border-[rgba(233,233,237,0.12)] p-3 text-xs font-bold text-[#75798c]">
                  {selectedCue ? 'This cue has no attached audio asset yet.' : attachedAudioCueCount > 0 ? 'Select an attached cue to preview it.' : 'No audio assets are attached yet. These cues are timing and performance notes until audio is uploaded or generated in a later phase.'}
                </p>
              )}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {AUDIO_TRACK_TYPES.map((type) => (
              <button key={type} onClick={() => setNewAudioTrackType(type)} className={`rounded-full px-3 py-1.5 text-xs font-black uppercase tracking-wide ${newAudioTrackType === type ? 'bg-[linear-gradient(90deg,#d946a8,#b25ad9)] text-[#F7F8FC]' : 'border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] text-[#9397ab]'}`}>
                {AUDIO_TRACK_TYPE_LABEL[type]}
              </button>
            ))}
            <button
              onClick={() => plan?.id && addAudioTrack.mutate({ projectId, planId: plan.id, type: newAudioTrackType, name: AUDIO_TRACK_TYPE_LABEL[newAudioTrackType] })}
              disabled={!plan?.id || addAudioTrack.isPending}
              className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(233,233,237,0.08)] border border-[rgba(233,233,237,0.10)] px-3 py-1.5 text-xs font-black text-[#F7F8FC] disabled:opacity-50"
            >
              {addAudioTrack.isPending ? <Loader2 className="animate-spin" size={14} /> : <Plus size={14} />} Add Track
            </button>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          {/* LEFT / MAIN — timeline */}
          <div className="space-y-4 overflow-x-auto rounded-2xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#9397ab]">Timeline</p>
            <div className="min-w-[560px]">
              <div className="relative mb-2 h-5 border-b border-[rgba(233,233,237,0.10)] text-[10px] font-bold text-[#75798c]">
                {timeMarks.map((s) => (
                  <span key={s} className="absolute" style={{ left: `${(s / runtimeSeconds) * 100}%` }}>{s}s</span>
                ))}
              </div>
              {tracks.length === 0 && (
                <p className="rounded-xl border border-dashed border-[rgba(233,233,237,0.10)] p-5 text-sm font-bold text-[#9397ab]">No tracks yet. Add a Narration, Dialogue, Ambience, SFX, or Music track above.</p>
              )}
              <div className="space-y-3">
                {tracks.map((track: any) => (
                  <div key={track.id} className="rounded-xl border border-[rgba(233,233,237,0.08)] bg-[rgba(233,233,237,0.03)] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm font-black text-[#F7F8FC]">
                        <span className="text-[#8fdfe8]">{trackIcon(track.type)}</span>
                        {track.name}
                        <span className="rounded-full border border-[rgba(233,233,237,0.10)] px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#9397ab]">{AUDIO_TRACK_TYPE_LABEL[track.type]}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateAudioTrack.mutate({ projectId, trackId: track.id, enabled: !track.enabled })}
                          className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${track.enabled ? 'bg-[rgba(47,191,113,0.12)] text-[#2fbf71]' : 'bg-[rgba(233,233,237,0.08)] text-[#75798c]'}`}
                        >
                          {track.enabled ? 'On' : 'Off'}
                        </button>
                        <button
                          onClick={() => addAudioCue.mutate({ projectId, trackId: track.id, startTimeSeconds: 0, volume: 1, duckingEnabled: false })}
                          className="inline-flex items-center gap-1 rounded-full bg-[rgba(233,233,237,0.08)] px-2 py-1 text-[10px] font-black text-[#F7F8FC]"
                        >
                          <Plus size={12} /> Cue
                        </button>
                      </div>
                    </div>
                    <div className="relative mt-2 h-12 rounded-lg bg-[rgba(233,233,237,0.04)]">
                      <span
                        className="pointer-events-none absolute bottom-1 top-1 z-10 w-0.5 rounded-full bg-[#ffcf4a]"
                        style={{ left: `${(safePlayhead / runtimeSeconds) * 100}%` }}
                        aria-hidden="true"
                      />
                      {track.cues.map((cue: any) => {
                        const left = (cue.startTimeSeconds / runtimeSeconds) * 100;
                        const width = Math.max(8, ((cue.durationSeconds ?? 1) / runtimeSeconds) * 100);
                        return (
                          <button
                            key={cue.id}
                            onClick={() => {
                              setSelectedCueId(cue.id);
                              setAudioPlayheadSeconds(cue.startTimeSeconds ?? 0);
                            }}
                            className={`absolute top-1 h-10 truncate rounded-lg border px-2 text-left text-[10px] font-black leading-4 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-[#b25ad9] ${selectedCueId === cue.id ? 'border-[#d946a8] bg-[linear-gradient(90deg,#d946a8,#b25ad9)] text-[#F7F8FC]' : 'border-[rgba(143,223,232,0.20)] bg-[rgba(143,223,232,0.16)] text-[#8fdfe8] hover:border-[rgba(143,223,232,0.55)] hover:bg-[rgba(143,223,232,0.24)]'}`}
                            style={{ left: `${left}%`, width: `${width}%` }}
                            title={`Edit ${cue.text || AUDIO_TRACK_TYPE_LABEL[track.type]} at ${(cue.startTimeSeconds ?? 0).toFixed(1)}s`}
                          >
                            <span className="block truncate">{cue.text || (track.type === 'SFX' ? 'SFX' : AUDIO_TRACK_TYPE_LABEL[track.type])}</span>
                            <span className="block truncate text-[9px] opacity-80">{(cue.startTimeSeconds ?? 0).toFixed(1)}s · {cue.audioAsset?.publicUrl ? 'Preview' : 'No audio'}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-[rgba(233,233,237,0.08)] pt-4">
              <button
                onClick={() => plan?.id && saveAudioVersion.mutate({ projectId, planId: plan.id })}
                disabled={!plan?.id || saveAudioVersion.isPending}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#2fbf71] px-4 py-2 text-sm font-black text-white disabled:opacity-50"
              >
                {saveAudioVersion.isPending ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />} Save Version
              </button>
              <span className="text-xs font-bold text-[#75798c]">Current version: {plan?.currentVersionNumber ?? 0}</span>
            </div>
          </div>

          {/* RIGHT — cue inspector */}
          <aside className="space-y-4">
            <div className="rounded-2xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-[#9397ab]">Cue Inspector</p>
              {!selectedCue ? (
                <p className="mt-3 text-sm font-bold text-[#75798c]">Select a cue on the timeline to edit it.</p>
              ) : (
                <div className="mt-3 space-y-3">
                  <div className="rounded-xl border border-[rgba(181,171,252,0.20)] bg-[rgba(181,171,252,0.07)] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-black text-[#F7F8FC]">{selectedCue.trackName}</p>
                        <p className="text-xs font-bold text-[#9397ab]">
                          Starts at {(selectedCue.startTimeSeconds ?? 0).toFixed(1)}s
                          {selectedCue.durationSeconds != null ? ` · ${(selectedCue.durationSeconds ?? 0).toFixed(1)}s long` : ' · open ended'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAudioPlayheadSeconds(selectedCue.startTimeSeconds ?? 0)}
                        className="inline-flex items-center gap-1 rounded-lg bg-[rgba(233,233,237,0.08)] px-2 py-1 text-[10px] font-black text-[#F7F8FC]"
                      >
                        <Play size={11} /> Jump
                      </button>
                    </div>
                    {selectedCueAudioUrl ? (
                      <audio key={`${selectedCue.id}-inspector`} controls src={selectedCueAudioUrl} className="mt-3 w-full" />
                    ) : (
                      <p className="mt-3 text-xs font-bold text-[#9397ab]">
                        No playable audio is attached to this cue yet. Timing, voice, and performance notes will be used when an audio asset is attached or when the final film is rendered with available sources.
                      </p>
                    )}
                  </div>
                  {(selectedCue.trackType === 'NARRATION' || selectedCue.trackType === 'DIALOGUE') && (
                    <>
                      <label className="block text-xs font-bold text-[#9397ab]">Character
                        <select
                          value={selectedCue.characterMemoryId ?? ''}
                          onChange={(e) => updateAudioCue.mutate({ projectId, cueId: selectedCue.id, characterMemoryId: e.target.value || null })}
                          className="mt-1 w-full rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-2 text-sm font-bold text-[#F7F8FC]"
                        >
                          <option value="">Narrator / unassigned</option>
                          {characters.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </label>
                      <textarea
                        value={selectedCue.text ?? ''}
                        onChange={(e) => updateAudioCue.mutate({ projectId, cueId: selectedCue.id, text: e.target.value })}
                        placeholder="Line or narration text"
                        rows={3}
                        className="w-full rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-3 text-sm font-semibold text-[#F7F8FC]"
                      />
                      <label className="block text-xs font-bold text-[#9397ab]">Voice
                        <select
                          value={selectedCue.voiceProfileId ?? ''}
                          onChange={(e) => updateAudioCue.mutate({ projectId, cueId: selectedCue.id, voiceProfileId: e.target.value || null })}
                          className="mt-1 w-full rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-2 text-sm font-bold text-[#F7F8FC]"
                        >
                          <option value="">No voice profile</option>
                          {voiceProfiles.map((vp: any) => <option key={vp.id} value={vp.id}>{vp.name}</option>)}
                        </select>
                      </label>
                      {(() => {
                        const character = characters.find((c: any) => c.id === selectedCue.characterMemoryId);
                        const voice = voiceProfiles.find((vp: any) => vp.id === selectedCue.voiceProfileId);
                        if (!character && !voice) return null;
                        return (
                          <p className="text-xs font-bold text-[#75798c]">
                            {character?.name ?? 'Unassigned'}{voice?.name ? ` — ${voice.name}` : ''}
                          </p>
                        );
                      })()}
                      <label className="block text-xs font-bold text-[#9397ab]">Performance
                        <input
                          value={selectedCue.performanceDirection ?? ''}
                          onChange={(e) => updateAudioCue.mutate({ projectId, cueId: selectedCue.id, performanceDirection: e.target.value })}
                          placeholder="e.g. curious, then excited"
                          className="mt-1 w-full rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-2 text-sm font-semibold text-[#F7F8FC]"
                        />
                      </label>
                      {/* Honest state, never a fake "Generate Voice" control — no TTS
                          provider exists yet (Phase 9B.2). Text/voice/performance
                          direction are creative intent; this line is the only place
                          that says whether they're backed by an actual audio source. */}
                      <p className={`text-[10px] font-black uppercase tracking-wide ${selectedCue.audioAssetId ? 'text-[#2fbf71]' : 'text-[#75798c]'}`}>
                        Audio source: {selectedCue.audioAssetId ? 'Attached' : 'Not generated'}
                      </p>
                    </>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs font-bold text-[#9397ab]">Start (s)
                      <input type="number" min={0} step={0.1} value={selectedCue.startTimeSeconds ?? 0}
                        onChange={(e) => updateAudioCue.mutate({ projectId, cueId: selectedCue.id, startTimeSeconds: Number(e.target.value) })}
                        className="mt-1 w-full rounded-lg border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-2 text-sm font-black text-[#F7F8FC]" />
                    </label>
                    <label className="text-xs font-bold text-[#9397ab]">Duration (s)
                      <input type="number" min={0} step={0.1} value={selectedCue.durationSeconds ?? ''}
                        onChange={(e) => updateAudioCue.mutate({ projectId, cueId: selectedCue.id, durationSeconds: e.target.value === '' ? null : Number(e.target.value) })}
                        className="mt-1 w-full rounded-lg border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-2 text-sm font-black text-[#F7F8FC]" />
                    </label>
                    <label className="text-xs font-bold text-[#9397ab]">Volume
                      <input type="number" min={0} max={4} step={0.1} value={selectedCue.volume ?? 1}
                        onChange={(e) => updateAudioCue.mutate({ projectId, cueId: selectedCue.id, volume: Number(e.target.value) })}
                        className="mt-1 w-full rounded-lg border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-2 text-sm font-black text-[#F7F8FC]" />
                    </label>
                    <label className="text-xs font-bold text-[#9397ab]">Fade In (s)
                      <input type="number" min={0} max={10} step={0.1} value={selectedCue.fadeInSeconds ?? 0}
                        onChange={(e) => updateAudioCue.mutate({ projectId, cueId: selectedCue.id, fadeInSeconds: Number(e.target.value) })}
                        className="mt-1 w-full rounded-lg border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-2 text-sm font-black text-[#F7F8FC]" />
                    </label>
                    <label className="text-xs font-bold text-[#9397ab]">Fade Out (s)
                      <input type="number" min={0} max={10} step={0.1} value={selectedCue.fadeOutSeconds ?? 0}
                        onChange={(e) => updateAudioCue.mutate({ projectId, cueId: selectedCue.id, fadeOutSeconds: Number(e.target.value) })}
                        className="mt-1 w-full rounded-lg border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-2 text-sm font-black text-[#F7F8FC]" />
                    </label>
                  </div>
                  <div className="space-y-3 rounded-xl border border-[rgba(233,233,237,0.08)] bg-[rgba(233,233,237,0.03)] p-3">
                    <label className="block text-xs font-bold text-[#9397ab]">Move on timeline
                      <input
                        type="range"
                        min={0}
                        max={runtimeSeconds}
                        step={0.1}
                        value={selectedCue.startTimeSeconds ?? 0}
                        onChange={(e) => {
                          const nextStart = Number(e.target.value);
                          setAudioPlayheadSeconds(nextStart);
                          updateAudioCue.mutate({ projectId, cueId: selectedCue.id, startTimeSeconds: nextStart });
                        }}
                        className="mt-2 w-full accent-[#b25ad9]"
                      />
                    </label>
                    <label className="block text-xs font-bold text-[#9397ab]">Cue volume
                      <input
                        type="range"
                        min={0}
                        max={4}
                        step={0.05}
                        value={selectedCue.volume ?? 1}
                        onChange={(e) => updateAudioCue.mutate({ projectId, cueId: selectedCue.id, volume: Number(e.target.value) })}
                        className="mt-2 w-full accent-[#2fbf71]"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => updateAudioCue.mutate({ projectId, cueId: selectedCue.id, startTimeSeconds: Math.max(0, (selectedCue.startTimeSeconds ?? 0) - 0.5) })}
                        className="rounded-lg bg-[rgba(233,233,237,0.08)] px-2 py-1 text-[10px] font-black text-[#F7F8FC]"
                      >
                        -0.5s
                      </button>
                      <button
                        type="button"
                        onClick={() => updateAudioCue.mutate({ projectId, cueId: selectedCue.id, startTimeSeconds: Math.min(runtimeSeconds, (selectedCue.startTimeSeconds ?? 0) + 0.5) })}
                        className="rounded-lg bg-[rgba(233,233,237,0.08)] px-2 py-1 text-[10px] font-black text-[#F7F8FC]"
                      >
                        +0.5s
                      </button>
                      <button
                        type="button"
                        onClick={() => updateAudioCue.mutate({ projectId, cueId: selectedCue.id, durationSeconds: Math.max(0.1, (selectedCue.durationSeconds ?? 1) - 0.5) })}
                        className="rounded-lg bg-[rgba(233,233,237,0.08)] px-2 py-1 text-[10px] font-black text-[#F7F8FC]"
                      >
                        Shorter
                      </button>
                      <button
                        type="button"
                        onClick={() => updateAudioCue.mutate({ projectId, cueId: selectedCue.id, durationSeconds: Math.min(runtimeSeconds, (selectedCue.durationSeconds ?? 1) + 0.5) })}
                        className="rounded-lg bg-[rgba(233,233,237,0.08)] px-2 py-1 text-[10px] font-black text-[#F7F8FC]"
                      >
                        Longer
                      </button>
                    </div>
                  </div>
                  {(selectedCue.trackType === 'AMBIENCE' || selectedCue.trackType === 'MUSIC') && (
                    <label className="flex items-center gap-2 text-xs font-bold text-[#9397ab]">
                      <input type="checkbox" checked={Boolean(selectedCue.duckingEnabled)}
                        onChange={(e) => updateAudioCue.mutate({ projectId, cueId: selectedCue.id, duckingEnabled: e.target.checked })} />
                      Duck under speech
                    </label>
                  )}
                  <div className="flex gap-2 pt-2">
                    <button onClick={() => duplicateAudioCue.mutate({ projectId, cueId: selectedCue.id })} className="inline-flex items-center gap-1.5 rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.06)] px-3 py-2 text-xs font-black text-[#b5abfc]"><Copy size={13} /> Duplicate</button>
                    <button onClick={() => { removeAudioCue.mutate({ projectId, cueId: selectedCue.id }); setSelectedCueId(null); }} className="inline-flex items-center gap-1.5 rounded-xl bg-[rgba(217,70,168,0.08)] px-3 py-2 text-xs font-black text-[#f0a3d4]"><Trash2 size={13} /> Remove</button>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-widest text-[#9397ab]">Voice Profiles</p>
                <button
                  onClick={() => createVoiceProfile.mutate({ projectId, name: `Voice ${voiceProfiles.length + 1}` })}
                  disabled={createVoiceProfile.isPending}
                  className="inline-flex items-center gap-1 rounded-full bg-[rgba(233,233,237,0.08)] px-2 py-1 text-[10px] font-black text-[#F7F8FC]"
                ><Plus size={12} /> Add</button>
              </div>
              <div className="mt-3 space-y-1.5">
                {voiceProfiles.length === 0 && <p className="text-xs font-bold text-[#75798c]">No voice profiles yet.</p>}
                {voiceProfiles.map((vp: any) => <p key={vp.id} className="text-sm font-bold text-[#F7F8FC]">{vp.name}</p>)}
              </div>
            </div>

            <div className="rounded-2xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-[#9397ab]">Version History</p>
              <div className="mt-3 space-y-2">
                {versions.length === 0 && <p className="text-xs font-bold text-[#75798c]">No versions saved yet.</p>}
                {versions.map((v: any) => (
                  <div key={v.id} className="flex items-center justify-between rounded-lg border border-[rgba(233,233,237,0.08)] p-2">
                    <span className="text-xs font-black text-[#F7F8FC]">v{v.versionNumber} — {v.title}</span>
                    <button
                      onClick={() => plan?.id && restoreAudioVersion.mutate({ projectId, planId: plan.id, versionNumber: v.versionNumber })}
                      className="inline-flex items-center gap-1 rounded-full border border-[rgba(233,233,237,0.10)] px-2 py-1 text-[10px] font-black text-[#b5abfc]"
                    ><RotateCcw size={11} /> Restore</button>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </section>
    );
  };

  const renderFilm = () => {
    if (isR16) return null;
    if (movieBuilderQuery.isLoading) return <section className="rounded-2xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-8 font-bold text-[#9397ab]">Loading Movie Builder...</section>;
    if (movieBuilderQuery.error) return <section className="rounded-2xl border border-[rgba(217,70,168,0.20)] bg-[rgba(217,70,168,0.06)] p-8 font-bold text-[#f0a3d4]">{movieBuilderQuery.error.message}</section>;
    const data = movieBuilderQuery.data as any;
    const readiness = data?.readiness;
    const history = ((data?.history ?? []) as MovieRenderJob[]).slice();
    const currentMovie = data?.currentMovie as MovieAsset | null | undefined;
    const activeJob = history.find((job) => ['QUEUED', 'PREPARING', 'RENDERING_SHOTS', 'ASSEMBLING', 'ENCODING', 'UPLOADING'].includes(job.status));
    const latestReady = currentMovie ?? history.find((job) => job.movieAsset?.publicUrl)?.movieAsset ?? null;
    const canRender = Boolean(readiness?.ready) && !activeJob && !createMovieRender.isPending;

    return (
      <section className="space-y-5">
        <div className="rounded-2xl bg-[rgba(233,233,237,0.04)] border border-[rgba(233,233,237,0.10)] p-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-[#ffcf4a]">Movie Builder</p>
              <h2 className="mt-1 text-3xl font-black text-[#F7F8FC]">Render Story Movie</h2>
              <p className="mt-2 max-w-3xl text-sm font-semibold text-[#9397ab]">Build a deterministic MP4 from the saved Film Blueprint and selected scene pictures. No AI video, narration, music, publishing, or provider rendering is used here.</p>
            </div>
            <button
              onClick={() => createMovieRender.mutate({ projectId, sequenceId: data?.sequenceId ?? undefined })}
              disabled={!canRender}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2fbf71] px-5 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {createMovieRender.isPending || activeJob ? <Loader2 className="animate-spin" size={18} /> : <Clapperboard size={18} />}
              {activeJob ? 'Rendering...' : `Build Movie${data?.creditCost ? ` — ${data.creditCost} credits` : ''}`}
            </button>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            <div className="overflow-hidden rounded-2xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)]">
              <div className="border-b border-[rgba(233,233,237,0.08)] px-5 py-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-[#9397ab]">Movie Preview</p>
                <h3 className="mt-1 text-2xl font-black text-[#F7F8FC]">{latestReady?.publicUrl ? `Version ${latestReady.versionNumber}` : 'No rendered movie yet'}</h3>
              </div>
              <div className="bg-black p-5">
                <div className="mx-auto aspect-[9/16] max-h-[72vh] overflow-hidden rounded-2xl bg-black">
                  {latestReady?.publicUrl ? (
                    <video src={latestReady.publicUrl} controls className="h-full w-full object-contain" />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-3 text-[#9397ab]">
                      <Clapperboard size={48} />
                      <p className="text-sm font-black">Render a movie to preview it here.</p>
                    </div>
                  )}
                </div>
              </div>
              {latestReady?.publicUrl && (
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div className="text-sm font-bold text-[#9397ab]">
                    {formatRuntime(latestReady.durationSeconds)} | {latestReady.width}x{latestReady.height} | {latestReady.fps} fps
                  </div>
                  <a href={latestReady.publicUrl} download className="inline-flex items-center gap-2 rounded-xl bg-[rgba(233,233,237,0.08)] border border-[rgba(233,233,237,0.10)] px-4 py-2 text-sm font-black text-[#F7F8FC]"><Download size={16} />Download MP4</a>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-[#9397ab]">Render History</p>
              <div className="mt-4 space-y-3">
                {history.length === 0 ? <p className="rounded-xl border border-dashed border-[rgba(233,233,237,0.10)] p-5 text-sm font-bold text-[#9397ab]">No movie renders yet.</p> : history.map((job) => (
                  <article key={job.id} className="rounded-2xl border border-[rgba(233,233,237,0.08)] bg-[rgba(233,233,237,0.04)] p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-[#9397ab]">Render {job.id.slice(-6)}</p>
                        <h4 className="text-xl font-black text-[#F7F8FC]">{label(job.status)}</h4>
                        <p className="mt-1 text-sm font-bold text-[#9397ab]">{job.currentStage ? label(job.currentStage) : 'Queued'} | {dateLabel(job.createdAt)}</p>
                        {job.errorMessage && <p className="mt-2 rounded-xl border border-[rgba(217,70,168,0.20)] bg-[rgba(217,70,168,0.06)] p-3 text-sm font-bold text-[#f0a3d4]">{job.errorMessage}</p>}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {job.movieAsset?.publicUrl && !job.movieAsset.isCurrent && <button onClick={() => setCurrentMovie.mutate({ projectId, movieAssetId: job.movieAsset!.id })} className="rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.06)] px-3 py-2 text-xs font-black text-[#b5abfc]">Use This</button>}
                        {['FAILED', 'CANCELLED'].includes(job.status) && <button onClick={() => retryMovieRender.mutate({ projectId, renderJobId: job.id })} disabled={retryMovieRender.isPending} className="rounded-xl bg-[rgba(79,139,214,0.10)] px-3 py-2 text-xs font-black text-[#b5abfc]">Retry</button>}
                        {['QUEUED', 'PREPARING'].includes(job.status) && <button onClick={() => cancelMovieRender.mutate({ projectId, renderJobId: job.id })} disabled={cancelMovieRender.isPending} className="rounded-xl bg-[rgba(217,70,168,0.08)] px-3 py-2 text-xs font-black text-[#f0a3d4]">Cancel</button>}
                      </div>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-[rgba(233,233,237,0.08)]">
                      <div className="h-full rounded-full bg-[#2fbf71]" style={{ width: `${Math.min(100, Math.max(0, job.progressPercent ?? 0))}%` }} />
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-[#9397ab]">Preflight</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm font-black">
                <div className="rounded-xl bg-[rgba(233,233,237,0.04)] border border-[rgba(233,233,237,0.08)] p-3"><p className="text-[#9397ab]">Shots</p><p className="text-2xl text-[#F7F8FC]">{readiness?.shotCount ?? 0}</p></div>
                <div className="rounded-xl bg-[rgba(233,233,237,0.04)] border border-[rgba(233,233,237,0.08)] p-3"><p className="text-[#9397ab]">Runtime</p><p className="text-2xl text-[#F7F8FC]">{formatRuntime(readiness?.runtimeSeconds ?? 0)}</p></div>
                <div className="rounded-xl bg-[rgba(233,233,237,0.04)] border border-[rgba(233,233,237,0.08)] p-3"><p className="text-[#9397ab]">Output</p><p className="text-2xl text-[#F7F8FC]">9:16</p></div>
                <div className="rounded-xl bg-[rgba(233,233,237,0.04)] border border-[rgba(233,233,237,0.08)] p-3"><p className="text-[#9397ab]">Credits</p><p className="text-2xl text-[#F7F8FC]">{data?.creditCost ?? 0}</p></div>
              </div>
              <div className={`mt-3 rounded-xl p-3 text-sm font-bold ${readiness?.ready ? 'bg-[rgba(47,191,113,0.12)] text-[#2fbf71]' : 'bg-[rgba(217,70,168,0.08)] text-[#f0a3d4]'}`}>
                {readiness?.ready ? 'Ready to render from selected pictures.' : 'Fix the sequence picture selections before rendering.'}
              </div>
              {(readiness?.warnings ?? []).length > 0 && <div className="mt-3 space-y-2">{readiness.warnings.map((warning: string) => <p key={warning} className="rounded-xl bg-[rgba(255,207,74,0.08)] p-3 text-xs font-black text-[#ffcf4a]">{warning}</p>)}</div>}
            </div>

            <div className="rounded-2xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-[#9397ab]">Render Plan</p>
              <div className="mt-3 space-y-2 text-sm font-bold text-[#9397ab]">
                <p>Renderer: <span className="text-[#F7F8FC]">{data?.renderPlan?.rendererVersion ?? 'Not ready'}</span></p>
                <p>Hash: <span className="break-all text-[#F7F8FC]">{data?.renderPlanHash ?? 'No render plan'}</span></p>
                <p>Video: <span className="text-[#F7F8FC]">720x1280 MP4, 30 fps</span></p>
                <p>Audio: <span className="text-[#F7F8FC]">None</span></p>
              </div>
            </div>
          </aside>
        </div>
      </section>
    );
  };

  return (
    <div className="min-h-screen bg-[#0B0D14] text-[#F7F8FC]">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-6 md:py-10">
        {renderHero()}
        {renderAcademyBanner()}
        {message && <div className="mt-4 rounded-xl bg-[rgba(79,214,232,0.12)] px-4 py-3 font-bold text-[#4fd6e8]">{message}</div>}
        <nav className="sticky top-0 z-30 mt-5 -mx-4 overflow-x-auto border-y border-[rgba(233,233,237,0.08)] bg-[rgba(7,8,16,0.92)] px-4 py-3 backdrop-blur">
          <div className="flex min-w-max gap-2">
            {visibleTabs.map((item) => (
              <button key={item.key} onClick={() => chooseTab(item.key)} className={`rounded-full px-4 py-2 text-sm font-black ${tab === item.key ? 'bg-[linear-gradient(90deg,#d946a8,#b25ad9)] text-[#F7F8FC]' : 'bg-[rgba(233,233,237,0.04)] text-[#9397ab] border border-[rgba(233,233,237,0.10)]'}`}>
                {isR16 ? item.r16Label : item.label}
              </button>
            ))}
            {canUseTechnical && <Link href="/admin/character-insights" className="rounded-full bg-[rgba(178,90,217,0.15)] px-4 py-2 text-sm font-black text-[#b5abfc]">Insights</Link>}
          </div>
        </nav>
        <div className="mt-6">
          {tab === 'overview' && renderOverview()}
          {tab === 'story' && renderStory()}
          {tab === 'characters' && renderCharacters()}
          {tab === 'scenes' && renderScenes()}
          {tab === 'assets' && renderAssets()}
          {tab === 'sequence' && renderSequence()}
          {tab === 'audio' && renderAudio()}
          {tab === 'film' && renderFilm()}
          {tab === 'storybook' && <section className="rounded-2xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-8 text-center"><BookOpen className="mx-auto text-[#b5abfc]" size={48} /><h2 className="mt-3 text-3xl font-black text-[#F7F8FC]">{isR16 ? 'Read your book' : 'Storybook'}</h2><p className="mt-2 font-semibold text-[#9397ab]">{isR16 ? 'Open the book with your chosen pictures.' : 'Storybook uses the active image for each scene, then latest image as fallback.'}</p><Link href={`/story-playground/${projectId}/storybook`} className="mt-5 inline-block rounded-xl bg-[linear-gradient(90deg,#d946a8,#b25ad9)] px-5 py-3 font-black text-[#F7F8FC]">{isR16 ? 'Read Book' : 'Open Storybook'}</Link></section>}
        </div>
      </main>

      {editingCharacter && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 px-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-[#0B0D14] border border-[rgba(233,233,237,0.10)] p-5">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-2xl font-black">{editingCharacter.id === 'new' ? (isR16 ? 'Add Friend' : 'Add Character') : editingCharacter.name}</h3>
              <button onClick={() => setEditingCharacter(null)} className="rounded-lg p-1 text-[#75798c] hover:text-[#F7F8FC]"><X size={20} /></button>
            </div>

            {/* Identity */}
            <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-[#9397ab]">Identity</p>
            <div className="grid gap-3 md:grid-cols-2">
              <input value={characterForm.name} onChange={(e) => setCharacterForm({ ...characterForm, name: e.target.value })} placeholder="Name" className="rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-3 font-bold text-[#F7F8FC] placeholder:text-[#75798c] outline-none focus:border-[#b25ad9]" />
              <input value={characterForm.role} onChange={(e) => setCharacterForm({ ...characterForm, role: e.target.value })} placeholder={isR16 ? 'Role (hero, sidekick…)' : 'Role'} className="rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-3 font-bold text-[#F7F8FC] placeholder:text-[#75798c] outline-none focus:border-[#b25ad9]" />
              <input value={characterForm.species} onChange={(e) => setCharacterForm({ ...characterForm, species: e.target.value })} placeholder={isR16 ? 'Species (human, dragon…)' : 'Species'} className="rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-3 font-bold text-[#F7F8FC] placeholder:text-[#75798c] outline-none focus:border-[#b25ad9]" />
              <input value={characterForm.ageDescription} onChange={(e) => setCharacterForm({ ...characterForm, ageDescription: e.target.value })} placeholder={isR16 ? 'Age (young, adult…)' : 'Age description'} className="rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-3 font-bold text-[#F7F8FC] placeholder:text-[#75798c] outline-none focus:border-[#b25ad9]" />
              <input value={characterForm.gender} onChange={(e) => setCharacterForm({ ...characterForm, gender: e.target.value })} placeholder={isR16 ? 'Gender (optional)' : 'Gender (optional)'} className="rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-3 font-bold text-[#F7F8FC] placeholder:text-[#75798c] outline-none focus:border-[#b25ad9]" />
            </div>

            {/* Appearance */}
            <div className="mt-5 border-t border-[rgba(233,233,237,0.08)] pt-4">
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-[#9397ab]">Appearance</p>
              <textarea value={characterForm.visualDescription} onChange={(e) => setCharacterForm({ ...characterForm, visualDescription: e.target.value })} placeholder={isR16 ? 'How does this character look? Describe their clothes, colours, face…' : 'Visual description — clothing, colours, face, distinctive features'} rows={4} className="w-full rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-3 font-bold text-[#F7F8FC] placeholder:text-[#75798c] outline-none focus:border-[#b25ad9]" />
            </div>

            {/* Personality */}
            <div className="mt-5 border-t border-[rgba(233,233,237,0.08)] pt-4">
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-[#9397ab]">Personality</p>
              <div className="flex flex-wrap gap-2">
                {PERSONALITY_OPTIONS.map((trait) => (
                  <button key={trait} onClick={() => setCharacterForm((current) => ({ ...current, personalityTraits: current.personalityTraits.includes(trait) ? current.personalityTraits.filter((item) => item !== trait) : [...current.personalityTraits, trait] }))} className={`rounded-full px-3 py-1.5 text-sm font-black transition-colors ${characterForm.personalityTraits.includes(trait) ? 'bg-[rgba(79,214,232,0.15)] text-[#4fd6e8] border border-[rgba(79,214,232,0.4)]' : 'border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] text-[#9397ab] hover:border-[rgba(233,233,237,0.20)]'}`}>{label(trait)}</button>
                ))}
              </div>
            </div>

            {/* Psychology */}
            <div className="mt-5 border-t border-[rgba(233,233,237,0.08)] pt-4">
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-[#9397ab]">Psychology</p>
              <div className="grid gap-3 md:grid-cols-3">
                <select value={characterForm.motivation} onChange={(e) => setCharacterForm({ ...characterForm, motivation: e.target.value })} className="rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-3 font-bold text-[#F7F8FC] outline-none focus:border-[#b25ad9]"><option value="">{isR16 ? 'What they want' : 'Motivation'}</option>{MOTIVATION_OPTIONS.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select>
                <select value={characterForm.fear} onChange={(e) => setCharacterForm({ ...characterForm, fear: e.target.value })} className="rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-3 font-bold text-[#F7F8FC] outline-none focus:border-[#b25ad9]"><option value="">{isR16 ? 'What they fear' : 'Fear'}</option>{FEAR_OPTIONS.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select>
                <select value={characterForm.goal} onChange={(e) => setCharacterForm({ ...characterForm, goal: e.target.value })} className="rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-3 font-bold text-[#F7F8FC] outline-none focus:border-[#b25ad9]"><option value="">{isR16 ? 'Their goal' : 'Goal'}</option>{GOAL_OPTIONS.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select>
              </div>
            </div>

            {/* Behavior */}
            <div className="mt-5 border-t border-[rgba(233,233,237,0.08)] pt-4">
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-[#9397ab]">Behavior</p>
              <div className="grid gap-3 md:grid-cols-2">
                <select value={characterForm.walkingStyle} onChange={(e) => setCharacterForm({ ...characterForm, walkingStyle: e.target.value })} className="rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-3 font-bold text-[#F7F8FC] outline-none focus:border-[#b25ad9]"><option value="">{isR16 ? 'How they walk' : 'Walking style'}</option>{WALKING_OPTIONS.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select>
              </div>
            </div>

            {/* Relationships */}
            <div className="mt-5 border-t border-[rgba(233,233,237,0.08)] pt-4">
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-[#9397ab]">Relationships</p>
              <div className="grid gap-3 md:grid-cols-3">
                <input value={characterForm.relationshipTargetName} onChange={(e) => setCharacterForm({ ...characterForm, relationshipTargetName: e.target.value })} placeholder={isR16 ? 'Friend\'s name' : 'Relationship target'} className="rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-3 font-bold text-[#F7F8FC] placeholder:text-[#75798c] outline-none focus:border-[#b25ad9]" />
                <select value={characterForm.relationshipType} onChange={(e) => setCharacterForm({ ...characterForm, relationshipType: e.target.value })} className="rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-3 font-bold text-[#F7F8FC] outline-none focus:border-[#b25ad9]"><option value="FRIEND">{isR16 ? 'Friend' : 'Friend'}</option><option value="RIVAL">Rival</option><option value="MENTOR">Mentor</option><option value="ENEMY">Enemy</option><option value="ROMANTIC">Romantic</option><option value="FAMILY">Family</option></select>
                <select value={characterForm.relationshipStrength} onChange={(e) => setCharacterForm({ ...characterForm, relationshipStrength: e.target.value })} className="rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-3 font-bold text-[#F7F8FC] outline-none focus:border-[#b25ad9]"><option value="VERY_CLOSE">{isR16 ? 'Very close' : 'Very close'}</option><option value="CLOSE">Close</option><option value="NEUTRAL">Neutral</option><option value="DISTANT">Distant</option><option value="ESTRANGED">Estranged</option></select>
              </div>
            </div>

            {/* Evolution (non-R16 only) */}
            {!isR16 && (
              <div className="mt-5 border-t border-[rgba(233,233,237,0.08)] pt-4">
                <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-[#9397ab]">Evolution</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <input value={characterForm.evolutionStage} onChange={(e) => setCharacterForm({ ...characterForm, evolutionStage: e.target.value })} placeholder="Stage (e.g. Act 2 breakthrough)" className="rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-3 font-bold text-[#F7F8FC] placeholder:text-[#75798c] outline-none focus:border-[#b25ad9]" />
                  <input value={characterForm.evolutionSceneOrder} onChange={(e) => setCharacterForm({ ...characterForm, evolutionSceneOrder: e.target.value })} placeholder="Scene order (e.g. 3)" className="rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-3 font-bold text-[#F7F8FC] placeholder:text-[#75798c] outline-none focus:border-[#b25ad9]" />
                  <textarea value={characterForm.evolutionNotes} onChange={(e) => setCharacterForm({ ...characterForm, evolutionNotes: e.target.value })} placeholder="Evolution notes" rows={2} className="md:col-span-2 w-full rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-3 font-bold text-[#F7F8FC] placeholder:text-[#75798c] outline-none focus:border-[#b25ad9]" />
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setEditingCharacter(null)} className="rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.06)] px-5 py-3 font-black text-[#F7F8FC]">Cancel</button>
              <button onClick={saveCharacter} disabled={!characterForm.name.trim() || !characterForm.visualDescription.trim()} className="rounded-xl bg-[linear-gradient(90deg,#d946a8,#b25ad9)] px-5 py-3 font-black text-white disabled:opacity-50">Save</button>
            </div>
          </div>
        </div>
      )}

      {editingScene && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 px-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-[#0B0D14] border border-[rgba(233,233,237,0.10)] p-5">
            <div className="mb-4 flex items-center justify-between"><h3 className="text-2xl font-black">{isR16 ? 'Change Scene' : 'Edit Scene'}</h3><button onClick={() => setEditingScene(null)}><X /></button></div>
            <input value={sceneForm.title} onChange={(e) => setSceneForm({ ...sceneForm, title: e.target.value })} className="w-full rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-3 font-bold text-[#F7F8FC] placeholder:text-[#75798c] outline-none focus:border-[#b25ad9]" />
            <textarea value={sceneForm.description} onChange={(e) => setSceneForm({ ...sceneForm, description: e.target.value })} rows={4} className="mt-3 w-full rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-3 font-bold text-[#F7F8FC] placeholder:text-[#75798c] outline-none focus:border-[#b25ad9]" />
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <input value={sceneForm.locationType} onChange={(e) => setSceneForm({ ...sceneForm, locationType: e.target.value })} placeholder="Place" className="rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-3 font-bold text-[#F7F8FC] placeholder:text-[#75798c] outline-none focus:border-[#b25ad9]" />
              <input value={sceneForm.indoorOutdoor} onChange={(e) => setSceneForm({ ...sceneForm, indoorOutdoor: e.target.value })} placeholder="Indoor/outdoor" className="rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-3 font-bold text-[#F7F8FC] placeholder:text-[#75798c] outline-none focus:border-[#b25ad9]" />
              <input value={sceneForm.mood} onChange={(e) => setSceneForm({ ...sceneForm, mood: e.target.value })} placeholder="Mood" className="rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-3 font-bold text-[#F7F8FC] placeholder:text-[#75798c] outline-none focus:border-[#b25ad9]" />
              {Object.entries(DIRECTOR_OPTIONS).map(([key, values]) => <select key={key} value={(sceneForm as any)[key]} onChange={(e) => setSceneForm({ ...sceneForm, [key]: e.target.value } as any)} className="rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-3 font-bold text-[#F7F8FC] placeholder:text-[#75798c] outline-none focus:border-[#b25ad9]"><option value="">{label(key)}</option>{values.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select>)}
            </div>
            <div className="mt-5 flex justify-end gap-3"><button onClick={() => setEditingScene(null)} className="rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.06)] px-5 py-3 font-black text-[#F7F8FC]">Cancel</button><button onClick={saveScene} className="rounded-xl bg-[linear-gradient(90deg,#d946a8,#b25ad9,#4f8bd6)] px-5 py-3 font-black text-white">Save</button></div>
          </div>
        </div>
      )}

      {previewAsset && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-4">
          <div className="max-h-[92vh] max-w-3xl overflow-y-auto rounded-2xl bg-[#0B0D14] border border-[rgba(233,233,237,0.10)] p-4">
            <div className="mb-3 flex items-center justify-between"><p className="font-black">{isR16 ? 'Picture' : 'Asset Preview'}</p><button onClick={() => setPreviewAsset(null)}><X /></button></div>
            {previewAsset.assetUrl && <img src={previewAsset.assetUrl} alt="" className="max-h-[75vh] rounded-xl object-contain" />}
          </div>
        </div>
      )}
    </div>
  );
}
