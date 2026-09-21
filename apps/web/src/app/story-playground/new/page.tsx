'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookOpen, Camera, ChevronRight, Clapperboard, Clock, CloudSun, HeartHandshake, History, ImagePlus, Lamp, Loader2, Mic, Plus, Smile, Sparkles, ThumbsDown, ThumbsUp, UserRound, Wand2, X } from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { useR16 } from '@/lib/r16';
import { trpc } from '@/lib/trpc';
import { useUser } from '@/lib/auth';
import { SCENE_IMAGE_MODEL_OPTIONS, DEFAULT_SCENE_IMAGE_MODEL, type SceneImageModel } from '@/lib/sceneImageModels';

type PlaygroundStep = 'spark' | 'questions' | 'story';

type StoryQuestion = {
  id: string;
  questionText: string;
  answerOptions: unknown;
  selectedAnswer: string | null;
  orderIndex: number;
};

type StoryChapter = {
  id: string;
  chapterNumber: number;
  title: string;
  summary: string;
  body: string;
};

type StoryScene = {
  id: string;
  orderIndex: number;
  title: string;
  description: string;
  locationType: string | null;
  indoorOutdoor: string | null;
  mood: string | null;
  emotion: DirectorSettingValue | null;
  cameraStyle: DirectorSettingValue | null;
  timeOfDay: DirectorSettingValue | null;
  weather: DirectorSettingValue | null;
  environmentMood: DirectorSettingValue | null;
  lighting: DirectorSettingValue | null;
  scenePace: DirectorSettingValue | null;
  directorChangedAt?: string | Date | null;
  characters: unknown;
  imageUrl: string | null;
  imageStatus: 'PENDING' | 'GENERATING' | 'READY' | 'FAILED' | null;
  latestImageAssetId: string | null;
  assets?: StorySceneAsset[];
  prompts?: StoryScenePrompt[];
};

type StorySceneAsset = {
  id: string;
  assetType: 'IMAGE' | 'VIDEO';
  assetUrl: string | null;
  thumbnailUrl: string | null;
  status: 'PENDING' | 'GENERATING' | 'READY' | 'FAILED';
  errorMessage: string | null;
  model: string;
  provider: string;
  isLatest: boolean;
  width: number | null;
  height: number | null;
  createdAt: string | Date;
};

type StoryScenePrompt = {
  id: string;
  outputType: 'IMAGE' | 'SHORT_VIDEO' | 'COMIC_PANEL';
  provider: string;
  prompt: string;
  negativePrompt: string | null;
  aspectRatio: string;
  duration: number | null;
  version: number;
};

type StoryCharacterMemory = {
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
  relationships?: CharacterRelationship[] | null;
  evolutionStage?: string | null;
  evolutionNotes?: string | null;
  evolutionSceneOrder?: number | null;
};

type CharacterRelationship = {
  targetCharacterId?: string | null;
  targetName: string;
  type: string;
  strength?: string;
  notes?: string | null;
};

type StoryProjectSummary = {
  id: string;
  title: string;
  originalIdea: string | null;
  visualStyle?: string | null;
  status: string;
  audienceMode: 'KIDS' | 'GENERAL';
  lastWorkspaceTab?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  _count?: {
    chapters?: number;
    questions?: number;
    sceneSeeds?: number;
    sequences?: number;
  };
  sequences?: Array<{
    id: string;
    title: string;
    runtimeSeconds: number;
    currentVersionNumber: number;
    updatedAt: string | Date;
    _count?: {
      scenes?: number;
      versions?: number;
    };
  }>;
  sceneSeeds?: Array<{
    id: string;
    imageUrl: string | null;
    imageStatus: 'PENDING' | 'GENERATING' | 'READY' | 'FAILED' | null;
    assets?: Array<{
      id: string;
      assetUrl: string | null;
      thumbnailUrl: string | null;
      status: 'READY' | 'PENDING' | 'GENERATING' | 'FAILED';
    }>;
  }>;
};

function toOptions(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function formatStoryDate(value: string | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

const examples = [
  'A dog going to school',
  'A robot who lost his voice',
  'A princess who loves football',
  'A dragon afraid of fire',
  'A boy who finds a magic pencil',
];

type VisualStyleOption = {
  value: VisualStyleValue;
  label: string;
  r16Label: string;
  description: string;
};

type DirectorSettingValue =
  | 'HAPPY'
  | 'EXCITED'
  | 'CURIOUS'
  | 'BRAVE'
  | 'CALM'
  | 'SAD'
  | 'SURPRISED'
  | 'CLOSE_UP'
  | 'MEDIUM_SHOT'
  | 'WIDE_SHOT'
  | 'OVER_THE_SHOULDER'
  | 'BIRDS_EYE_VIEW'
  | 'EYE_LEVEL'
  | 'MORNING'
  | 'AFTERNOON'
  | 'SUNSET'
  | 'NIGHT'
  | 'SUNNY'
  | 'RAINY'
  | 'SNOWY'
  | 'WINDY'
  | 'FOGGY'
  | 'PEACEFUL'
  | 'BUSY'
  | 'MAGICAL'
  | 'FUTURISTIC'
  | 'COZY'
  | 'ADVENTUROUS'
  | 'BRIGHT'
  | 'WARM'
  | 'SOFT'
  | 'DRAMATIC'
  | 'MOONLIGHT'
  | 'NORMAL'
  | 'ENERGETIC';

type VisualStyleValue =
  | 'STORYBOOK_ILLUSTRATION'
  | 'THREE_D_ANIMATED'
  | 'ANIME'
  | 'COMIC_BOOK'
  | 'PHOTOREALISTIC'
  | 'WATERCOLOR'
  | 'CLAYMATION'
  | 'CINEMATIC_FANTASY'
  | 'AFRICAN_FOLKTALE_ILLUSTRATION';

const VISUAL_STYLE_OPTIONS: VisualStyleOption[] = [
  { value: 'STORYBOOK_ILLUSTRATION', label: 'Storybook Illustration', r16Label: 'Storybook', description: 'Soft colors and warm picture-book charm.' },
  { value: 'THREE_D_ANIMATED', label: '3D Animated', r16Label: '3D Cartoon', description: 'Polished family-film look with expressive characters.' },
  { value: 'ANIME', label: 'Anime', r16Label: 'Anime', description: 'Clean animated frames with colorful backgrounds.' },
  { value: 'COMIC_BOOK', label: 'Comic Book', r16Label: 'Comic', description: 'Bright line art and panel-ready action.' },
  { value: 'PHOTOREALISTIC', label: 'Photorealistic', r16Label: 'Realistic', description: 'Cinematic realism and natural lighting.' },
  { value: 'WATERCOLOR', label: 'Watercolor', r16Label: 'Watercolor', description: 'Gentle painted texture and soft washes.' },
  { value: 'CLAYMATION', label: 'Claymation', r16Label: 'Clay', description: 'Handmade sculpted character style.' },
  { value: 'CINEMATIC_FANTASY', label: 'Cinematic Fantasy', r16Label: 'Fantasy', description: 'Rich magical scenes with safe wonder.' },
  { value: 'AFRICAN_FOLKTALE_ILLUSTRATION', label: 'African Folktale Illustration', r16Label: 'Folktale', description: 'Rich colors, patterned textiles, handcrafted feel.' },
];

const R16_STYLE_VALUES = new Set(['STORYBOOK_ILLUSTRATION', 'THREE_D_ANIMATED', 'ANIME', 'COMIC_BOOK', 'WATERCOLOR']);

type DirectorSettingKey = 'emotion' | 'cameraStyle' | 'timeOfDay' | 'weather' | 'environmentMood' | 'lighting' | 'scenePace';

type DirectorOptionGroup = {
  key: DirectorSettingKey;
  label: string;
  r16Label: string;
  icon: typeof Smile;
  options: Array<{ value: DirectorSettingValue; label: string; r16Label?: string }>;
};

const DIRECTOR_OPTION_GROUPS: DirectorOptionGroup[] = [
  {
    key: 'emotion',
    label: 'Scene Emotion',
    r16Label: 'How should everyone feel?',
    icon: Smile,
    options: [
      { value: 'HAPPY', label: 'Happy' },
      { value: 'EXCITED', label: 'Excited' },
      { value: 'CURIOUS', label: 'Curious' },
      { value: 'BRAVE', label: 'Brave' },
      { value: 'CALM', label: 'Calm' },
      { value: 'SAD', label: 'Sad' },
      { value: 'SURPRISED', label: 'Surprised' },
    ],
  },
  {
    key: 'cameraStyle',
    label: 'Camera Style',
    r16Label: 'How should we look at the scene?',
    icon: Camera,
    options: [
      { value: 'CLOSE_UP', label: 'Close-Up' },
      { value: 'MEDIUM_SHOT', label: 'Medium Shot' },
      { value: 'WIDE_SHOT', label: 'Wide Shot' },
      { value: 'OVER_THE_SHOULDER', label: 'Over the Shoulder' },
      { value: 'BIRDS_EYE_VIEW', label: "Bird's Eye View" },
      { value: 'EYE_LEVEL', label: 'Eye Level' },
    ],
  },
  {
    key: 'timeOfDay',
    label: 'Time Of Day',
    r16Label: 'When is it?',
    icon: Clock,
    options: [
      { value: 'MORNING', label: 'Morning' },
      { value: 'AFTERNOON', label: 'Afternoon' },
      { value: 'SUNSET', label: 'Sunset' },
      { value: 'NIGHT', label: 'Night' },
    ],
  },
  {
    key: 'weather',
    label: 'Weather',
    r16Label: 'What is the weather?',
    icon: CloudSun,
    options: [
      { value: 'SUNNY', label: 'Sunny' },
      { value: 'RAINY', label: 'Rainy' },
      { value: 'SNOWY', label: 'Snowy' },
      { value: 'WINDY', label: 'Windy' },
      { value: 'FOGGY', label: 'Foggy' },
    ],
  },
  {
    key: 'environmentMood',
    label: 'Environment Mood',
    r16Label: 'How should the place feel?',
    icon: Sparkles,
    options: [
      { value: 'PEACEFUL', label: 'Peaceful' },
      { value: 'BUSY', label: 'Busy' },
      { value: 'MAGICAL', label: 'Magical' },
      { value: 'FUTURISTIC', label: 'Futuristic' },
      { value: 'COZY', label: 'Cozy' },
      { value: 'ADVENTUROUS', label: 'Adventurous' },
    ],
  },
  {
    key: 'lighting',
    label: 'Lighting',
    r16Label: 'How should the light look?',
    icon: Lamp,
    options: [
      { value: 'BRIGHT', label: 'Bright' },
      { value: 'WARM', label: 'Warm' },
      { value: 'SOFT', label: 'Soft' },
      { value: 'DRAMATIC', label: 'Dramatic' },
      { value: 'MOONLIGHT', label: 'Moonlight' },
    ],
  },
  {
    key: 'scenePace',
    label: 'Scene Pace',
    r16Label: 'How fast should it feel?',
    icon: Wand2,
    options: [
      { value: 'CALM', label: 'Calm' },
      { value: 'NORMAL', label: 'Normal' },
      { value: 'ENERGETIC', label: 'Energetic' },
    ],
  },
];

const PERSONALITY_OPTIONS = ['BRAVE', 'CURIOUS', 'FUNNY', 'KIND', 'SHY', 'CONFIDENT', 'ADVENTUROUS', 'CALM', 'CLEVER', 'ENERGETIC'] as const;
const MOTIVATION_OPTIONS = ['MAKE_FRIENDS', 'LEARN', 'HELP_OTHERS', 'EXPLORE', 'WIN', 'PROTECT_FAMILY', 'FIND_HOME'] as const;
const FEAR_OPTIONS = ['DARKNESS', 'HEIGHTS', 'BULLIES', 'BEING_ALONE', 'LOUD_NOISES', 'MONSTERS', 'WATER'] as const;
const CHARACTER_GOAL_OPTIONS = ['REACH_SCHOOL', 'SAVE_A_FRIEND', 'FIND_TREASURE', 'FINISH_HOMEWORK', 'BECOME_A_HERO'] as const;
const EXPRESSION_OPTIONS = ['SMILE', 'BIG_GRIN', 'CURIOUS_FACE', 'DETERMINED_FACE', 'SURPRISED'] as const;
const WALKING_STYLE_OPTIONS = ['SKIP', 'RUN', 'WALK_PROUDLY', 'WALK_CAREFULLY', 'BOUNCE', 'SNEAK'] as const;
const SPEAKING_STYLE_OPTIONS = ['CHEERFUL', 'GENTLE', 'QUIET', 'CONFIDENT', 'FUNNY'] as const;
const RELATIONSHIP_TYPE_OPTIONS = ['FRIEND', 'SIBLING', 'TEACHER', 'ENEMY', 'PARENT', 'PET', 'MENTOR'] as const;
const RELATIONSHIP_STRENGTH_OPTIONS = ['DISTANT', 'FRIENDLY', 'CLOSE', 'VERY_CLOSE'] as const;

function characterOptionLabel(value?: string | null) {
  return value ? value.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : '';
}

function directorOptionLabel(key: DirectorSettingKey, value?: string | null, isR16 = false) {
  const option = DIRECTOR_OPTION_GROUPS.find((group) => group.key === key)?.options.find((item) => item.value === value);
  return option ? (isR16 && option.r16Label ? option.r16Label : option.label) : null;
}

export default function StoryPlaygroundPage() {
  const router = useRouter();
  const isR16 = useR16();
  const { isSignedIn, isLoaded, user } = useUser();
  const utils = trpc.useUtils();
  const trackStoryEvent = trpc.analytics.trackStoryEvent.useMutation();
  const playgroundOpenedTracked = useRef(false);

  const [step, setStep] = useState<PlaygroundStep>('spark');
  const [idea, setIdea] = useState('');
  const [selectedVisualStyle, setSelectedVisualStyle] = useState<VisualStyleValue>('STORYBOOK_ILLUSTRATION');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [editingScene, setEditingScene] = useState<StoryScene | null>(null);
  const [editingCharacter, setEditingCharacter] = useState<StoryCharacterMemory | null>(null);
  const [isCreatingCharacter, setIsCreatingCharacter] = useState(false);
  const [previewPrompt, setPreviewPrompt] = useState<StoryScenePrompt | null>(null);
  const [historyScene, setHistoryScene] = useState<StoryScene | null>(null);
  const [openDirectorSceneIds, setOpenDirectorSceneIds] = useState<string[]>([]);
  const [feedbackComments, setFeedbackComments] = useState<Record<string, string>>({});
  const [feedbackRatings, setFeedbackRatings] = useState<Record<string, 'UP' | 'DOWN'>>({});
  const [sceneForm, setSceneForm] = useState({
    title: '',
    description: '',
    locationType: '',
    indoorOutdoor: '',
    mood: '',
  });
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
    favoriteExpression: '',
    walkingStyle: '',
    speakingStyle: '',
    relationshipTargetName: '',
    relationshipType: 'FRIEND',
    relationshipStrength: 'FRIENDLY',
    relationshipNotes: '',
    evolutionStage: '',
    evolutionNotes: '',
    evolutionSceneOrder: '',
  });

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    if (playgroundOpenedTracked.current) return;
    playgroundOpenedTracked.current = true;
    trackStoryEvent.mutate({
      event: 'story_playground_opened',
      properties: { audienceMode: isR16 ? 'KIDS' : 'GENERAL' },
    });
  }, [isLoaded, isSignedIn, isR16, trackStoryEvent]);

  const { data: project } = trpc.story.getProject.useQuery(
    { projectId: projectId! },
    { enabled: !!projectId && isSignedIn },
  );
  const { data: myProjects, isLoading: myProjectsLoading } = trpc.story.listMyProjects.useQuery(
    { limit: 12 },
    { enabled: isSignedIn },
  );

  const createSpark = trpc.story.createSpark.useMutation({
    onSuccess: async (project) => {
      setProjectId(project.id);
      setMessage(null);
      const questions = await generateQuestions.mutateAsync({ projectId: project.id });
      setActiveQuestionIndex(0);
      setStep(questions.length ? 'questions' : 'spark');
      await utils.story.getProject.invalidate({ projectId: project.id });
    },
    onError: (error) => setMessage(error.message),
  });

  const generateQuestions = trpc.story.generateQuestions.useMutation({
    onSuccess: async () => {
      await utils.story.getProject.invalidate();
    },
    onError: (error) => setMessage(error.message),
  });

  const answerQuestion = trpc.story.answerQuestion.useMutation({
    onSuccess: async () => {
      await utils.story.getProject.invalidate();
    },
    onError: (error) => setMessage(error.message),
  });

  const generateStory = trpc.story.generateStory.useMutation({
    onSuccess: async (_chapter, variables) => {
      await generateScenes.mutateAsync({ projectId: variables.projectId, replaceExisting: true });
      await utils.story.getProject.invalidate();
      await utils.story.listMyProjects.invalidate();
      // Canonical activation: a freshly created story must land on the
      // canonical project route (Section 9/1 of the corrective brief) —
      // not stay inline on this wizard page, which would leave the user in
      // the old embedded story/scene editor and never show them the new
      // handoff UI at all. This page's own inline 'story' step (and its
      // continue-chapter / scene-editing actions) is now unreachable from
      // this specific success path; left in place, unmodified, since other
      // parts of this same file may still reference that state and this
      // release only changes where a *fresh* creation lands.
      router.push(`/story-playground/${variables.projectId}`);
    },
    onError: (error) => setMessage(error.message),
  });

  const continueStory = trpc.story.continueStory.useMutation({
    onSuccess: async (_chapter, variables) => {
      await generateScenes.mutateAsync({ projectId: variables.projectId, replaceExisting: true });
      setMessage('New chapter added. Scene cards refreshed.');
      await utils.story.getProject.invalidate();
    },
    onError: (error) => setMessage(error.message),
  });

  const saveProject = trpc.story.saveProject.useMutation({
    onSuccess: async () => {
      setMessage('Story saved.');
      await utils.story.getProject.invalidate();
      await utils.story.listMyProjects.invalidate();
    },
    onError: (error) => setMessage(error.message),
  });

  const archiveProject = trpc.story.updateProject.useMutation({
    onSuccess: async (_updatedProject, variables) => {
      if (projectId === variables.projectId) {
        setProjectId(null);
        setStep('spark');
      }
      setMessage(isR16 ? 'Story hidden.' : 'Story archived.');
      await utils.story.listMyProjects.invalidate();
    },
    onError: (error) => setMessage(error.message),
  });

  const updateVisualStyle = trpc.story.updateProject.useMutation({
    onSuccess: async () => {
      setMessage(isR16 ? 'Story look saved.' : 'Visual style saved.');
      await utils.story.getProject.invalidate();
      await utils.story.listMyProjects.invalidate();
    },
    onError: (error) => setMessage(error.message),
  });

  const stylePresets = trpc.story.listStylePresets.useQuery();
  const [selectedStylePreset, setSelectedStylePreset] = useState('WARM_STORYBOOK');
  const applyStylePreset = trpc.story.applyStylePreset.useMutation({
    onSuccess: async (result) => {
      setSelectedVisualStyle(result.visualStyle);
      setMessage(`Style preset applied (${result.scenesUpdated} scenes). Music prompt saved: ${result.musicPrompt}`);
      await utils.story.getProject.invalidate();
    },
    onError: (error) => setMessage(error.message),
  });

  const generateScenes = trpc.story.generateScenes.useMutation({
    onSuccess: async () => {
      await utils.story.getProject.invalidate();
    },
    onError: (error) => setMessage(error.message),
  });

  const composeScenePrompt = trpc.story.composeScenePrompt.useMutation({
    onSuccess: async (prompt) => {
      setPreviewPrompt(prompt as StoryScenePrompt);
      await utils.story.getProject.invalidate();
    },
    onError: (error) => setMessage(error.message),
  });

  const composeAllScenePrompts = trpc.story.composeAllScenePrompts.useMutation({
    onSuccess: async () => {
      setMessage('Advanced prompts saved for all scenes.');
      await utils.story.getProject.invalidate();
    },
    onError: (error) => setMessage(error.message),
  });

  const generateSceneImage = trpc.story.generateSceneImage.useMutation({
    onSuccess: async () => {
      setMessage(isR16 ? 'Picture added to the card.' : 'Scene image generated and attached.');
      await utils.story.getProject.invalidate();
    },
    onError: (error) => setMessage(error.message),
  });

  const regenerateSceneImage = trpc.story.regenerateSceneImage.useMutation({
    onSuccess: async () => {
      setMessage(isR16 ? 'New picture added to the card.' : 'Scene image regenerated and saved to history.');
      await utils.story.getProject.invalidate();
    },
    onError: (error) => setMessage(error.message),
  });

  const generateSceneVideo = trpc.story.generateSceneVideo.useMutation({
    onSuccess: async () => {
      setMessage('Scene video generated.');
      await utils.story.getProject.invalidate();
    },
    onError: (error) => setMessage(error.message),
  });

  const regenerateSceneVideo = trpc.story.regenerateSceneVideo.useMutation({
    onSuccess: async () => {
      setMessage('Scene video regenerated.');
      await utils.story.getProject.invalidate();
    },
    onError: (error) => setMessage(error.message),
  });

  const generateCharacterBible = trpc.story.generateCharacterBible.useMutation({
    onSuccess: async (_characters, variables) => {
      await generateScenes.mutateAsync({ projectId: variables.projectId, replaceExisting: true });
      await utils.story.getProject.invalidate();
    },
    onError: (error) => setMessage(error.message),
  });

  const updateScene = trpc.story.updateScene.useMutation({
    onSuccess: async () => {
      setEditingScene(null);
      setMessage('Scene saved.');
      await utils.story.getProject.invalidate();
    },
    onError: (error) => setMessage(error.message),
  });

  const updateSceneDirector = trpc.story.updateSceneDirector.useMutation({
    onSuccess: async () => {
      setMessage(isR16 ? 'Scene choices saved. Make a new picture when ready.' : 'Director settings saved. Regenerate when you are ready.');
      await utils.story.getProject.invalidate();
    },
    onError: (error) => setMessage(error.message),
  });

  const submitPromptQualityFeedback = trpc.story.submitPromptQualityFeedback.useMutation({
    onSuccess: (_feedback, variables) => {
      setFeedbackRatings((current) => ({ ...current, [variables.assetId]: variables.rating }));
      setMessage(isR16 ? 'Thanks for helping.' : 'Prompt quality feedback saved.');
    },
    onError: (error) => setMessage(error.message),
  });

  const updateCharacterMemory = trpc.story.updateCharacterMemory.useMutation({
    onSuccess: async (_character, variables) => {
      setEditingCharacter(null);
      setIsCreatingCharacter(false);
      setMessage(isR16 ? 'Character saved. Make a new picture when ready.' : 'Character Director saved. Future generations will use this memory.');
      await utils.story.getProject.invalidate();
    },
    onError: (error) => setMessage(error.message),
  });

  const createCharacterMemory = trpc.story.createCharacterMemory.useMutation({
    onSuccess: async () => {
      setEditingCharacter(null);
      setIsCreatingCharacter(false);
      setMessage(isR16 ? 'New friend added.' : 'Character added to the director.');
      await utils.story.getProject.invalidate();
    },
    onError: (error) => setMessage(error.message),
  });

  const questions = useMemo(() => {
    return ((project?.questions ?? []) as StoryQuestion[]).slice().sort((a, b) => a.orderIndex - b.orderIndex);
  }, [project?.questions]);

  const chapters = useMemo(() => {
    return ((project?.chapters ?? []) as StoryChapter[]).slice().sort((a, b) => a.chapterNumber - b.chapterNumber);
  }, [project?.chapters]);

  const scenes = useMemo(() => {
    return ((project?.sceneSeeds ?? []) as StoryScene[]).slice().sort((a, b) => a.orderIndex - b.orderIndex);
  }, [project?.sceneSeeds]);

  const characterMemory = useMemo(() => {
    return ((project?.characterMemory ?? []) as StoryCharacterMemory[]).slice();
  }, [project?.characterMemory]);

  const activeQuestion = questions[activeQuestionIndex] ?? null;
  const answeredCount = questions.filter((question) => question.selectedAnswer).length;
  const canGenerate = questions.length > 0 && answeredCount === questions.length;
  const canUseAdvancedPrompts = !isR16 && !!user && ['ADMIN', 'MODERATOR', 'CREATOR'].includes(user.role);
  const isBusy = createSpark.isPending || generateQuestions.isPending || answerQuestion.isPending || generateStory.isPending || continueStory.isPending || saveProject.isPending || archiveProject.isPending || updateVisualStyle.isPending || generateScenes.isPending || updateScene.isPending || updateSceneDirector.isPending || generateCharacterBible.isPending || updateCharacterMemory.isPending || createCharacterMemory.isPending || composeScenePrompt.isPending || composeAllScenePrompts.isPending || generateSceneImage.isPending || regenerateSceneImage.isPending;

  useEffect(() => {
    if (project?.chapters?.length) setStep('story');
  }, [project?.chapters?.length]);

  useEffect(() => {
    if (project?.visualStyle && typeof project.visualStyle === 'string' && VISUAL_STYLE_OPTIONS.some((option) => option.value === project.visualStyle)) {
      setSelectedVisualStyle(project.visualStyle as VisualStyleValue);
    }
  }, [project?.visualStyle]);

  const startStory = () => {
    if (!isSignedIn) {
      setMessage('Please sign in so we can save your story.');
      return;
    }
    if (idea.trim().length < 3) {
      setMessage('Write a small story idea first.');
      return;
    }
    createSpark.mutate({
      idea: idea.trim(),
      audienceMode: isR16 ? 'KIDS' : 'GENERAL',
      storyType: 'SHORT_STORY',
      visualStyle: selectedVisualStyle,
    });
  };

  const visibleStyleOptions = isR16 ? VISUAL_STYLE_OPTIONS.filter((option) => R16_STYLE_VALUES.has(option.value)) : VISUAL_STYLE_OPTIONS;

  const chooseVisualStyle = (value: VisualStyleValue) => {
    setSelectedVisualStyle(value);
    if (projectId) {
      updateVisualStyle.mutate({ projectId, visualStyle: value });
    }
  };

  const chooseAnswer = async (question: StoryQuestion, answer: string) => {
    if (!projectId) return;
    await answerQuestion.mutateAsync({
      projectId,
      questionId: question.id,
      selectedAnswer: answer,
    });
    if (activeQuestionIndex < questions.length - 1) {
      setActiveQuestionIndex((index) => index + 1);
    }
  };

  const generateCurrentStory = () => {
    if (projectId && canGenerate) generateStory.mutate({ projectId });
  };

  const continueCurrentStory = () => {
    if (projectId) continueStory.mutate({ projectId });
  };

  const openSceneEditor = (scene: StoryScene) => {
    setEditingScene(scene);
    setSceneForm({
      title: scene.title,
      description: scene.description,
      locationType: scene.locationType ?? '',
      indoorOutdoor: scene.indoorOutdoor ?? '',
      mood: scene.mood ?? '',
    });
  };

  const saveScene = () => {
    if (!projectId || !editingScene) return;
    updateScene.mutate({
      projectId,
      sceneId: editingScene.id,
      title: sceneForm.title.trim(),
      description: sceneForm.description.trim(),
      locationType: sceneForm.locationType.trim() || undefined,
      indoorOutdoor: sceneForm.indoorOutdoor.trim() || undefined,
      mood: sceneForm.mood.trim() || undefined,
    });
  };

  const openCharacterEditor = (character: StoryCharacterMemory) => {
    setEditingCharacter(character);
    setIsCreatingCharacter(false);
    const relationship = character.relationships?.[0];
    setCharacterForm({
      name: character.name,
      role: character.role ?? '',
      species: character.species ?? '',
      ageDescription: character.ageDescription ?? '',
      gender: character.gender ?? '',
      visualDescription: character.visualDescription ?? '',
      personalityTraits: Array.isArray(character.personalityTraits) ? character.personalityTraits : [],
      motivation: character.motivation ?? '',
      fear: character.fear ?? '',
      goal: character.goal ?? '',
      favoriteExpression: character.favoriteExpression ?? '',
      walkingStyle: character.walkingStyle ?? '',
      speakingStyle: character.speakingStyle ?? '',
      relationshipTargetName: relationship?.targetName ?? '',
      relationshipType: relationship?.type ?? 'FRIEND',
      relationshipStrength: relationship?.strength ?? 'FRIENDLY',
      relationshipNotes: relationship?.notes ?? '',
      evolutionStage: character.evolutionStage ?? '',
      evolutionNotes: character.evolutionNotes ?? '',
      evolutionSceneOrder: character.evolutionSceneOrder ? String(character.evolutionSceneOrder) : '',
    });
  };

  const openNewCharacterEditor = () => {
    setEditingCharacter({
      id: 'new',
      name: '',
      role: '',
      species: '',
      ageDescription: '',
      gender: '',
      visualDescription: '',
      personalityTraits: [],
      relationships: [],
    });
    setIsCreatingCharacter(true);
    setCharacterForm({
      name: '',
      role: '',
      species: '',
      ageDescription: '',
      gender: '',
      visualDescription: '',
      personalityTraits: [],
      motivation: '',
      fear: '',
      goal: '',
      favoriteExpression: '',
      walkingStyle: '',
      speakingStyle: '',
      relationshipTargetName: '',
      relationshipType: 'FRIEND',
      relationshipStrength: 'FRIENDLY',
      relationshipNotes: '',
      evolutionStage: '',
      evolutionNotes: '',
      evolutionSceneOrder: '',
    });
  };

  const relationshipsFromForm = (): CharacterRelationship[] => {
    if (!characterForm.relationshipTargetName.trim()) return [];
    const target = characterMemory.find((character) => character.name.toLowerCase() === characterForm.relationshipTargetName.trim().toLowerCase());
    return [{
      targetCharacterId: target?.id ?? null,
      targetName: characterForm.relationshipTargetName.trim(),
      type: characterForm.relationshipType,
      strength: characterForm.relationshipStrength,
      notes: characterForm.relationshipNotes.trim() || null,
    }];
  };

  const saveCharacter = () => {
    if (!projectId || !editingCharacter) return;
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
      favoriteExpression: characterForm.favoriteExpression ? characterForm.favoriteExpression as any : null,
      walkingStyle: characterForm.walkingStyle ? characterForm.walkingStyle as any : null,
      speakingStyle: characterForm.speakingStyle ? characterForm.speakingStyle as any : null,
      relationships: relationshipsFromForm() as any,
      evolutionStage: characterForm.evolutionStage.trim() || null,
      evolutionNotes: characterForm.evolutionNotes.trim() || null,
      evolutionSceneOrder: characterForm.evolutionSceneOrder ? Number(characterForm.evolutionSceneOrder) : null,
    };
    if (isCreatingCharacter) {
      createCharacterMemory.mutate(payload);
      return;
    }
    updateCharacterMemory.mutate({ ...payload, characterId: editingCharacter.id });
  };

  const togglePersonalityTrait = (trait: string) => {
    setCharacterForm((current) => ({
      ...current,
      personalityTraits: current.personalityTraits.includes(trait)
        ? current.personalityTraits.filter((item) => item !== trait)
        : [...current.personalityTraits, trait],
    }));
  };

  const sceneCharacterLabels = (value: unknown) => {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'name' in item && typeof item.name === 'string') return item.name;
        return null;
      })
      .filter((item): item is string => Boolean(item));
  };

  const latestPromptForScene = (scene: StoryScene) => {
    return scene.prompts?.find((prompt) => prompt.outputType === 'IMAGE' && prompt.provider === 'FLUX')
      ?? scene.prompts?.[0]
      ?? null;
  };

  const isGeneratingImageForScene = (scene: StoryScene) => {
    return scene.imageStatus === 'GENERATING'
      || (generateSceneImage.isPending && generateSceneImage.variables?.sceneId === scene.id)
      || (regenerateSceneImage.isPending && regenerateSceneImage.variables?.sceneId === scene.id);
  };

  const [sceneImageModel, setSceneImageModel] = useState<SceneImageModel>(DEFAULT_SCENE_IMAGE_MODEL);

  const makeSceneImage = (scene: StoryScene) => {
    if (!projectId) return;
    const action = scene.imageUrl ? regenerateSceneImage : generateSceneImage;
    action.mutate({ projectId, sceneId: scene.id, model: sceneImageModel });
  };

  const latestVideoAsset = (scene: StoryScene) =>
    (scene.assets ?? []).find((asset) => asset.assetType === 'VIDEO' && asset.status === 'READY');

  const makeSceneVideo = (scene: StoryScene) => {
    if (!projectId) return;
    const hasVideo = Boolean(latestVideoAsset(scene));
    const action = hasVideo ? regenerateSceneVideo : generateSceneVideo;
    action.mutate({ projectId, sceneId: scene.id, model: 'H3_MAX' });
  };

  const toggleDirectorPanel = (sceneId: string) => {
    setOpenDirectorSceneIds((current) =>
      current.includes(sceneId) ? current.filter((id) => id !== sceneId) : [...current, sceneId],
    );
  };

  const chooseDirectorSetting = (scene: StoryScene, key: DirectorSettingKey, value: DirectorSettingValue) => {
    if (!projectId) return;
    const nextSettings = {
      emotion: scene.emotion,
      cameraStyle: scene.cameraStyle,
      timeOfDay: scene.timeOfDay,
      weather: scene.weather,
      environmentMood: scene.environmentMood,
      lighting: scene.lighting,
      scenePace: scene.scenePace,
      [key]: scene[key] === value ? null : value,
    };
    updateSceneDirector.mutate({ projectId, sceneId: scene.id, settings: nextSettings as Parameters<typeof updateSceneDirector.mutate>[0]['settings'] });
  };

  const directorSummary = (scene: StoryScene) => {
    const parts = DIRECTOR_OPTION_GROUPS
      .map((group) => directorOptionLabel(group.key, scene[group.key], isR16))
      .filter(Boolean);
    return parts.length ? parts.join(' / ') : (isR16 ? 'Choose how this picture should feel.' : 'No director choices yet.');
  };

  const latestReadyAsset = (scene: StoryScene) =>
    scene.assets?.find((asset) => asset.isLatest && asset.status === 'READY' && asset.assetUrl)
    ?? scene.assets?.find((asset) => asset.status === 'READY' && asset.assetUrl)
    ?? null;

  const rateSceneImage = (scene: StoryScene, rating: 'UP' | 'DOWN') => {
    if (!projectId) return;
    const asset = latestReadyAsset(scene);
    if (!asset) return;
    submitPromptQualityFeedback.mutate({
      projectId,
      sceneId: scene.id,
      assetId: asset.id,
      rating,
      comment: feedbackComments[asset.id]?.trim() || undefined,
    });
  };

  const recentProjects = ((myProjects ?? []) as StoryProjectSummary[]).slice();

  const projectCounts = (storyProject: StoryProjectSummary) => {
    const chapterCount = storyProject._count?.chapters ?? 0;
    const questionCount = storyProject._count?.questions ?? 0;
    const sceneCount = storyProject._count?.sceneSeeds ?? storyProject.sceneSeeds?.length ?? 0;
    const readyImageCount = (storyProject.sceneSeeds ?? []).filter((scene) =>
      (scene.imageStatus === 'READY' && Boolean(scene.imageUrl))
      || (scene.assets ?? []).some((asset) => asset.status === 'READY' && Boolean(asset.assetUrl || asset.thumbnailUrl)),
    ).length;
    return { chapterCount, questionCount, sceneCount, readyImageCount };
  };

  const projectProgress = (storyProject: StoryProjectSummary) => {
    const { chapterCount, sceneCount, readyImageCount } = projectCounts(storyProject);
    if (chapterCount === 0) return 'Draft';
    if (sceneCount === 0) return isR16 ? 'Story ready' : 'Story written';
    if (readyImageCount === 0) return 'Picture cards ready';
    if (readyImageCount < sceneCount) return 'Pictures started';
    return isR16 ? 'Book ready' : 'Storybook ready';
  };

  const projectThumbnail = (storyProject: StoryProjectSummary) => {
    for (const scene of storyProject.sceneSeeds ?? []) {
      const asset = scene.assets?.find((item) => item.thumbnailUrl || item.assetUrl);
      if (asset?.thumbnailUrl || asset?.assetUrl) return asset.thumbnailUrl ?? asset.assetUrl;
      if (scene.imageUrl) return scene.imageUrl;
    }
    return null;
  };

  const resumeProject = (storyProject: StoryProjectSummary) => {
    const validTabs = new Set(['overview', 'story', 'characters', 'scenes', 'assets', 'sequence', 'storybook']);
    const requestedTab = storyProject.lastWorkspaceTab && validTabs.has(storyProject.lastWorkspaceTab)
      ? storyProject.lastWorkspaceTab
      : null;
    const sequenceReady = !isR16 && ((storyProject._count?.sequences ?? 0) > 0 || (storyProject.sequences?.length ?? 0) > 0);
    const tab = requestedTab === 'sequence' && !sequenceReady ? 'scenes' : requestedTab;
    router.push(tab && !(isR16 && tab === 'sequence') ? `/story-playground/${storyProject.id}?tab=${tab}` : `/story-playground/${storyProject.id}`);
  };

  const addPicturesToProject = (storyProject: StoryProjectSummary) => {
    router.push(`/story-playground/${storyProject.id}?tab=scenes`);
  };

  const archiveStoryProject = (storyProject: StoryProjectSummary) => {
    archiveProject.mutate({ projectId: storyProject.id, status: 'ARCHIVED' });
  };

  const sendPromptToAiStudio = (prompt: StoryScenePrompt) => {
    const mode = prompt.outputType === 'SHORT_VIDEO' ? 'video' : 'image';
    const params = new URLSearchParams({
      mode,
      prompt: prompt.prompt,
      aspectRatio: prompt.aspectRatio,
      duration: String(Math.round(prompt.duration ?? 5)),
    });
    if (prompt.negativePrompt) params.set('negativePrompt', prompt.negativePrompt);
    router.push(`/generate?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-[var(--noc-page)] text-[var(--noc-t1)]">
      <Navbar />
      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 pb-16 pt-24">
        <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[rgba(79,139,214,0.12)] px-4 py-2 text-sm font-semibold text-[var(--noc-blue)]">
              <Sparkles size={16} />
              {isR16 ? 'R16 Story Playground' : 'Story Playground'}
            </div>
            <h1 className="max-w-3xl text-4xl font-black leading-tight text-[var(--noc-t1)] md:text-6xl">
              What story should we create?
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-[var(--noc-t4)]">
              Start with a tiny idea. We will ask a few easy questions, then turn it into a short story you can keep building.
            </p>
          </div>

          <div className="rounded-2xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-5 shadow-[0_18px_0_rgba(23,32,51,0.08)]">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#d946a8,#b25ad9)] text-[var(--noc-t1)]">
                <BookOpen size={24} />
              </div>
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-[var(--noc-t4)]">Step {step === 'spark' ? '1' : step === 'questions' ? '2' : '3'} of 3</p>
                <p className="font-black">{step === 'spark' ? 'Story Spark' : step === 'questions' ? 'Questions' : 'Your Story'}</p>
              </div>
            </div>

            <div className="h-3 overflow-hidden rounded-full bg-[rgba(233,233,237,0.08)]">
              <div
                className="h-full rounded-full bg-[var(--noc-blue)] transition-all"
                style={{ width: step === 'spark' ? '33%' : step === 'questions' ? '66%' : '100%' }}
              />
            </div>
          </div>
        </section>

        {message && (
          <div className="rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] px-4 py-3 text-sm font-semibold text-[var(--noc-t4)]">
            {message}
          </div>
        )}

        {isLoaded && !isSignedIn && (
          <div className="rounded-2xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-6">
            <p className="mb-4 text-lg font-bold">Sign in to save and continue your stories.</p>
            <Link href="/sign-in?redirect_url=/story-playground" className="inline-flex items-center gap-2 rounded-xl bg-[var(--noc-page)] px-5 py-3 font-bold text-white">
              Sign in
              <ChevronRight size={18} />
            </Link>
          </div>
        )}

        {isSignedIn && (
          <section className="rounded-2xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-5 md:p-6">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-wide text-[var(--noc-blue)]">{isR16 ? 'Choose a look' : 'Visual Style'}</p>
                <h2 className="text-2xl font-black">{isR16 ? 'What should your story look like?' : 'Choose a generation look'}</h2>
              </div>
              {project?.visualStyle && (
                <p className="rounded-full bg-[rgba(79,139,214,0.10)] px-3 py-2 text-xs font-black text-[var(--noc-purple)]">
                  {visibleStyleOptions.find((option) => option.value === selectedVisualStyle)?.[isR16 ? 'r16Label' : 'label'] ?? 'Storybook'}
                </p>
              )}
            </div>
            {!isR16 && stylePresets.data && stylePresets.data.length > 0 && (
              <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-3">
                <span className="text-xs font-black uppercase text-[var(--noc-t4)]">Style preset</span>
                <select
                  value={selectedStylePreset}
                  onChange={(event) => setSelectedStylePreset(event.target.value)}
                  className="rounded-xl border border-[rgba(233,233,237,0.10)] bg-[var(--noc-page)] p-2 text-sm font-bold text-[var(--noc-t1)]"
                >
                  {stylePresets.data.map((preset: any) => (
                    <option key={preset.name} value={preset.name}>{preset.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => projectId && applyStylePreset.mutate({ projectId, preset: selectedStylePreset as any, applyToScenes: true })}
                  disabled={!projectId || applyStylePreset.isPending}
                  className="rounded-xl bg-[linear-gradient(90deg,#d946a8,#b25ad9)] px-3 py-2 text-xs font-black text-white disabled:opacity-50"
                >
                  {applyStylePreset.isPending ? 'Applying…' : 'Apply preset'}
                </button>
                <span className="text-xs font-semibold text-[var(--noc-t4)]">Sets the visual style + scene lighting/mood + a music prompt.</span>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {visibleStyleOptions.map((option) => {
                const selected = selectedVisualStyle === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => chooseVisualStyle(option.value)}
                    disabled={updateVisualStyle.isPending && selected}
                    className={`min-h-24 rounded-xl border p-3 text-left transition-all ${
                      selected
                        ? 'border-[var(--noc-purple)] bg-[rgba(178,90,217,0.15)] text-[var(--noc-purple)]'
                        : 'border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] text-[var(--noc-t1)] hover:border-[var(--noc-purple)]'
                    }`}
                  >
                    <span className="block text-sm font-black">{isR16 ? option.r16Label : option.label}</span>
                    {!isR16 && <span className="mt-1 block text-xs font-semibold text-[var(--noc-t4)]">{option.description}</span>}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {step === 'spark' && (
          <section className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <div className="rounded-2xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-5">
              <textarea
                value={idea}
                onChange={(event) => setIdea(event.target.value)}
                placeholder="A dog going to school"
                rows={5}
                className="min-h-48 w-full resize-none rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-5 text-2xl font-bold text-[var(--noc-t1)] outline-none transition-colors placeholder:text-[var(--noc-t5)] focus:border-[var(--noc-purple)]"
              />

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button type="button" className="flex min-h-24 items-center justify-center gap-3 rounded-xl border border-dashed border-[rgba(233,233,237,0.12)] bg-[rgba(79,139,214,0.10)] px-4 py-3 text-left font-bold text-[var(--noc-t4)]">
                  <ImagePlus size={22} />
                  Add a picture later
                </button>
                <button type="button" className="flex min-h-24 items-center justify-center gap-3 rounded-xl border border-dashed border-[rgba(233,233,237,0.12)] bg-[rgba(217,70,168,0.06)] px-4 py-3 text-left font-bold text-[var(--noc-t4)]">
                  <Mic size={22} />
                  Voice idea later
                </button>
              </div>

              <button
                onClick={startStory}
                disabled={isBusy || idea.trim().length < 3 || !isSignedIn}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(90deg,#d946a8,#b25ad9,#4f8bd6)] px-6 py-4 text-lg font-black text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isBusy ? 'Starting...' : 'Start Story'}
                <ChevronRight size={22} />
              </button>
            </div>

            <div className="rounded-2xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-5">
              <h2 className="mb-3 text-lg font-black">Try one of these</h2>
              <div className="flex flex-col gap-3">
                {examples.map((example) => (
                  <button
                    key={example}
                    onClick={() => setIdea(example)}
                    className="rounded-xl bg-[rgba(233,233,237,0.07)] px-4 py-3 text-left font-bold text-[var(--noc-t1)] border border-[rgba(233,233,237,0.10)] transition-transform hover:-translate-y-0.5"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {isSignedIn && (
          <section className="rounded-2xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-5 md:p-6">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-wide text-[var(--noc-purple)]">{isR16 ? 'My Stories' : 'Recent Stories'}</p>
                <h2 className="text-3xl font-black">{isR16 ? 'Keep Going' : 'Continue Your Stories'}</h2>
                <p className="mt-1 font-semibold text-[var(--noc-t4)]">
                  {isR16 ? 'Pick a story to keep writing, add pictures, or read your book.' : 'Resume drafts, add scene pictures, or open storybooks that are ready to read.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-black uppercase tracking-wide">
                <span className="rounded-full bg-[rgba(79,139,214,0.12)] px-3 py-2 text-[var(--noc-blue)]">{isR16 ? 'Keep Going' : 'Continue Reading'}</span>
                <span className="rounded-full bg-[rgba(79,139,214,0.10)] px-3 py-2 text-[var(--noc-purple)]">{isR16 ? 'Read Book' : 'Storybooks Ready'}</span>
              </div>
            </div>

            {myProjectsLoading ? (
              <div className="rounded-xl border-2 border-dashed border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-8 text-center font-bold text-[var(--noc-t4)]">
                {isR16 ? 'Loading your stories...' : 'Loading recent stories...'}
              </div>
            ) : recentProjects.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-8 text-center font-bold text-[var(--noc-t4)]">
                Your stories will appear here after you create one.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {recentProjects.map((storyProject) => {
                  const { chapterCount, sceneCount, readyImageCount } = projectCounts(storyProject);
                  const storybookReady = chapterCount > 0 && sceneCount > 0;
                  const thumbnail = projectThumbnail(storyProject);
                  return (
                    <article key={storyProject.id} className="overflow-hidden rounded-2xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)]">
                      <button
                        type="button"
                        onClick={() => resumeProject(storyProject)}
                        className="block aspect-[16/10] w-full bg-[rgba(233,233,237,0.06)] text-left"
                        aria-label={isR16 ? `Keep going with ${storyProject.title}` : `Continue ${storyProject.title}`}
                      >
                        {thumbnail ? (
                          <img src={thumbnail} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[var(--noc-purple)]">
                            <BookOpen size={42} />
                          </div>
                        )}
                      </button>
                      <div className="p-4">
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div>
                            <h3 className="line-clamp-2 text-xl font-black">{storyProject.title}</h3>
                            <p className="mt-1 line-clamp-2 text-sm font-bold text-[var(--noc-t4)]">{storyProject.originalIdea || (isR16 ? 'A story made by you.' : 'No original idea saved.')}</p>
                          </div>
                          <span className="shrink-0 rounded-full bg-[rgba(79,139,214,0.12)] px-3 py-1 text-xs font-black text-[var(--noc-blue)]">
                            {projectProgress(storyProject)}
                          </span>
                        </div>
                        <div className="mb-4 grid grid-cols-2 gap-2 text-xs font-bold text-[var(--noc-t4)]">
                          <span>Updated {formatStoryDate(storyProject.updatedAt)}</span>
                          <span>{storyProject.audienceMode === 'KIDS' ? (isR16 ? 'Kids' : 'R16/Kids') : 'General'}</span>
                          <span>{isR16 ? `${sceneCount} cards` : `${sceneCount} scene cards`}</span>
                          <span>{isR16 ? `${readyImageCount} pictures` : `${readyImageCount} ready pictures`}</span>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <button
                            type="button"
                            onClick={() => resumeProject(storyProject)}
                            className="rounded-xl bg-[linear-gradient(90deg,#d946a8,#b25ad9,#4f8bd6)] px-4 py-2 text-sm font-black text-white"
                          >
                            {isR16 ? 'Keep Going' : 'Continue'}
                          </button>
                          {storybookReady ? (
                            <Link href={`/story-playground/${storyProject.id}/storybook`} className="rounded-xl bg-[var(--noc-blue)] px-4 py-2 text-center text-sm font-black text-white">
                              {isR16 ? 'Read Book' : 'Open Storybook'}
                            </Link>
                          ) : (
                            <button
                              type="button"
                              onClick={() => resumeProject(storyProject)}
                              className="rounded-xl bg-[rgba(233,233,237,0.08)] px-4 py-2 text-sm font-black text-[var(--noc-t1)]"
                            >
                              Edit Story
                            </button>
                          )}
                          {sceneCount > 0 && (
                            <button
                              type="button"
                              onClick={() => addPicturesToProject(storyProject)}
                              className="rounded-xl bg-[linear-gradient(90deg,#d946a8,#b25ad9)] px-4 py-2 text-sm font-black text-[var(--noc-t1)]"
                            >
                              Add Pictures
                            </button>
                          )}
                          {!isR16 && (
                            <button
                              type="button"
                              onClick={() => archiveStoryProject(storyProject)}
                              disabled={archiveProject.isPending && archiveProject.variables?.projectId === storyProject.id}
                              className="rounded-xl border border-[rgba(217,70,168,0.30)] bg-[rgba(217,70,168,0.08)] px-4 py-2 text-sm font-black text-[var(--noc-magenta)] disabled:opacity-50"
                            >
                              {archiveProject.isPending && archiveProject.variables?.projectId === storyProject.id ? 'Archiving...' : 'Archive'}
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {step === 'questions' && activeQuestion && (
          <section className="rounded-2xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-5 md:p-8">
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-bold text-[var(--noc-t4)]">Question {activeQuestionIndex + 1} of {questions.length}</p>
              <p className="font-bold text-[var(--noc-purple)]">{answeredCount} answered</p>
            </div>

            <h2 className="mb-6 text-3xl font-black">{activeQuestion.questionText}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {toOptions(activeQuestion.answerOptions).map((option) => (
                <button
                  key={option}
                  onClick={() => chooseAnswer(activeQuestion, option)}
                  disabled={answerQuestion.isPending}
                  className={`min-h-24 rounded-xl border px-5 py-4 text-left text-lg font-black transition-all ${
                    activeQuestion.selectedAnswer === option
                      ? 'border-[var(--noc-purple)] bg-[rgba(178,90,217,0.15)] text-[var(--noc-purple)]'
                      : 'border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] text-[var(--noc-t1)] hover:border-[var(--noc-purple)]'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-between">
              <button
                onClick={() => setActiveQuestionIndex((index) => Math.max(0, index - 1))}
                disabled={activeQuestionIndex === 0}
                className="rounded-xl bg-[rgba(233,233,237,0.08)] px-5 py-3 font-bold text-[var(--noc-t1)] disabled:opacity-40"
              >
                Back
              </button>
              <button
                onClick={generateCurrentStory}
                disabled={!canGenerate || generateStory.isPending}
                className="rounded-xl bg-[var(--noc-blue)] px-5 py-3 font-black text-white disabled:opacity-40"
              >
                {generateStory.isPending ? 'Creating story...' : 'Create My Story'}
              </button>
            </div>
          </section>
        )}

        {step === 'story' && (
          <>
            <section className="grid gap-6 lg:grid-cols-[1fr_320px]">
              <div className="rounded-2xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-5 md:p-8">
                <div className="mb-6">
                  <p className="mb-2 font-bold text-[var(--noc-blue)]">{project?.ageRange ? `Ages ${project.ageRange}` : 'Short story'}</p>
                  <h2 className="text-4xl font-black">{project?.title ?? 'Your Story'}</h2>
                  {project?.theme && <p className="mt-2 font-semibold text-[var(--noc-t4)]">Theme: {project.theme}</p>}
                </div>

                <div className="space-y-8">
                  {chapters.map((chapter) => (
                    <article key={chapter.id} className="border-t border-[rgba(233,233,237,0.10)] pt-6 first:border-t-0 first:pt-0">
                      <p className="mb-2 text-sm font-black uppercase tracking-wide text-[var(--noc-t4)]">Chapter {chapter.chapterNumber}</p>
                      <h3 className="mb-3 text-2xl font-black">{chapter.title}</h3>
                      <p className="mb-5 rounded-xl bg-[rgba(233,233,237,0.06)] px-4 py-3 font-semibold text-[var(--noc-t4)]">{chapter.summary}</p>
                      <div className="whitespace-pre-line text-lg leading-8 text-[#243044]">{chapter.body}</div>
                    </article>
                  ))}
                </div>
              </div>

              <aside className="space-y-3">
                <button
                  onClick={continueCurrentStory}
                  disabled={!projectId || continueStory.isPending || generateScenes.isPending}
                  className="flex w-full items-center justify-between rounded-xl bg-[linear-gradient(90deg,#d946a8,#b25ad9,#4f8bd6)] px-5 py-4 text-left font-black text-white disabled:opacity-50"
                >
                  {continueStory.isPending ? 'Adding chapter...' : generateScenes.isPending ? 'Making scenes...' : 'Continue Story'}
                  <ChevronRight size={20} />
                </button>
                <button className="w-full rounded-xl bg-[linear-gradient(90deg,#d946a8,#b25ad9)] px-5 py-4 text-left font-black text-[var(--noc-t1)]" onClick={() => setMessage('A funnier version tool will be added next.')}>
                  Make It Funnier
                </button>
                <button className="w-full rounded-xl bg-[#d9ccff] px-5 py-4 text-left font-black text-[var(--noc-t1)]" onClick={() => setMessage('A more magical version tool will be added next.')}>
                  Make It More Magical
                </button>
                <button className="w-full rounded-xl bg-[rgba(233,233,237,0.08)] px-5 py-4 text-left font-black text-[var(--noc-t1)]" onClick={() => setMessage('A shorter version tool will be added next.')}>
                  Shorten
                </button>
                <button className="w-full rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] px-5 py-4 text-left font-black text-[var(--noc-t1)]" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                  Read Again
                </button>
                <button
                  onClick={() => projectId && saveProject.mutate({ projectId })}
                  disabled={!projectId || saveProject.isPending}
                  className="w-full rounded-xl bg-[var(--noc-page)] px-5 py-4 text-left font-black text-white disabled:opacity-50"
                >
                  Save Story
                </button>
                {projectId && scenes.length > 0 && (
                  <Link
                    href={`/story-playground/${projectId}/storybook`}
                    className="block w-full rounded-xl bg-[var(--noc-blue)] px-5 py-4 text-left font-black text-white"
                  >
                    {isR16 ? 'Read Story' : 'Read Storybook'}
                  </Link>
                )}
              </aside>
            </section>

            <section className="rounded-2xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-5 md:p-6">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-black uppercase tracking-wide text-[var(--noc-blue)]">{isR16 ? 'My Characters' : 'Character Director'}</p>
                  <h3 className="text-3xl font-black">{isR16 ? 'Who is in the story?' : 'Direct character identity and arcs'}</h3>
                  <p className="mt-1 font-semibold text-[var(--noc-t4)]">
                    {isR16 ? 'Choose what they are like, what they want, and who their friends are.' : 'Character memory now drives future prompts, image consistency, relationships, and evolution from this point forward.'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={openNewCharacterEditor}
                    disabled={!projectId}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[linear-gradient(90deg,#d946a8,#b25ad9)] px-5 py-3 font-black text-[var(--noc-t1)] disabled:opacity-50"
                  >
                    <Plus size={18} />
                    {isR16 ? 'Add Friend' : 'Add Character'}
                  </button>
                  <button
                    onClick={() => projectId && generateCharacterBible.mutate({ projectId, replaceExisting: true })}
                    disabled={!projectId || generateCharacterBible.isPending || generateScenes.isPending}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--noc-blue)] px-5 py-3 font-black text-white disabled:opacity-50"
                  >
                    <UserRound size={18} />
                    {generateCharacterBible.isPending ? 'Refreshing...' : isR16 ? 'Refresh Friends' : 'Refresh Characters'}
                  </button>
                </div>
              </div>

              {characterMemory.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-8 text-center font-bold text-[var(--noc-t4)]">
                  Character cards will appear after your story is created.
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {characterMemory.map((character) => (
                    <button
                      key={character.id}
                      onClick={() => openCharacterEditor(character)}
                      className="rounded-2xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-4 text-left transition-transform hover:-translate-y-1 hover:border-[var(--noc-purple)]"
                    >
                      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[rgba(79,139,214,0.12)] text-[var(--noc-purple)]">
                        <UserRound size={28} />
                      </div>
                      <h4 className="text-xl font-black">{character.name}</h4>
                      <p className="mt-1 text-sm font-bold text-[var(--noc-t4)]">
                        {[character.ageDescription, character.gender, character.species].filter(Boolean).join(' ') || character.role || 'Story character'}
                      </p>
                      <p className="mt-3 line-clamp-3 text-sm font-semibold text-[var(--noc-t4)]">
                        {character.visualDescription || 'Add a clear visual description.'}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {(character.personalityTraits ?? []).slice(0, 3).map((trait) => (
                          <span key={trait} className="rounded-full bg-[rgba(79,139,214,0.12)] px-3 py-1 text-xs font-black text-[var(--noc-purple)]">
                            {characterOptionLabel(trait)}
                          </span>
                        ))}
                        {character.goal && (
                          <span className="rounded-full bg-[#e8f0ff] px-3 py-1 text-xs font-black text-[#1d4c8f]">
                            {characterOptionLabel(character.goal)}
                          </span>
                        )}
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-bold text-[var(--noc-t4)]">
                        <span>{isR16 ? 'Pictures' : 'Pictures Generated'}: {scenes.filter((scene) => sceneCharacterLabels(scene.characters).includes(character.name) && scene.imageUrl).length}</span>
                        <span>{isR16 ? 'Friends' : 'Relationships'}: {character.relationships?.length ?? 0}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section id="story-scenes" className="rounded-2xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-5 md:p-6">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-black uppercase tracking-wide text-[var(--noc-purple)]">{isR16 ? 'Picture cards' : 'Scene film-strip'}</p>
                  <h3 className="text-3xl font-black">{isR16 ? 'Story pictures' : 'Scenes for pictures and video'}</h3>
                  <p className="mt-1 font-semibold text-[var(--noc-t4)]">
                    {isR16 ? 'Tap a card to fix the name or what happens.' : 'Generate a scene image, regenerate it, and keep every version as reference material.'}
                  </p>
                </div>
                <button
                  disabled
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[rgba(233,233,237,0.08)] px-5 py-3 font-black text-[#7a7469] opacity-70"
                  title="Coming soon"
                >
                  <Wand2 size={18} />
                  Make Pictures
                </button>
              </div>

              {scenes.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-8 text-center font-bold text-[var(--noc-t4)]">
                  {generateScenes.isPending ? 'Making scene cards...' : 'Scene cards will appear after your story is created.'}
                </div>
              ) : (
                <div className="flex gap-4 overflow-x-auto pb-2">
                  {scenes.map((scene, index) => {
                    const isGenerating = isGeneratingImageForScene(scene);
                    const hasFailed = scene.imageStatus === 'FAILED';
                    return (
                      <div
                        key={scene.id}
                        className="w-60 shrink-0 rounded-2xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-3 text-left transition-transform hover:-translate-y-1 hover:border-[var(--noc-purple)]"
                      >
                        <button type="button" onClick={() => openSceneEditor(scene)} className="block w-full text-left">
                          <div
                            className="mb-3 flex aspect-[4/5] items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-[#dff8e9] via-[#f6fbff] to-[#ffefb0] bg-cover bg-center"
                            style={scene.imageUrl ? { backgroundImage: `url("${scene.imageUrl}")` } : undefined}
                          >
                            {isGenerating ? (
                              <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[rgba(11,13,20,0.82)] text-[var(--noc-purple)]">
                                <Loader2 className="animate-spin" size={34} />
                                <span className="px-4 text-center text-sm font-black">{isR16 ? 'Making your picture...' : 'Generating image...'}</span>
                              </div>
                            ) : hasFailed ? (
                              <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[rgba(217,70,168,0.10)] px-4 text-center text-[var(--noc-magenta)]">
                                <ImagePlus size={32} />
                                <span className="text-sm font-black">{isR16 ? 'Picture did not finish' : 'Generation failed'}</span>
                              </div>
                            ) : !scene.imageUrl ? (
                              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[rgba(178,90,217,0.15)] text-2xl font-black text-[var(--noc-purple)]">
                                {index + 1}
                              </div>
                            ) : null}
                          </div>
                          <p className="mb-1 text-xs font-black uppercase tracking-wide text-[var(--noc-t4)]">Scene {index + 1}</p>
                          <h4 className="line-clamp-1 text-lg font-black">{scene.title}</h4>
                          <p className="mt-2 line-clamp-3 text-sm font-semibold text-[var(--noc-t4)]">{scene.description}</p>
                          {sceneCharacterLabels(scene.characters).length > 0 && (
                            <p className="mt-3 rounded-lg bg-[rgba(79,139,214,0.12)] px-2 py-1 text-xs font-black text-[var(--noc-purple)]">
                              {sceneCharacterLabels(scene.characters).join(', ')}
                            </p>
                          )}
                        </button>
                        <div className="mt-3 rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-2">
                          <button
                            type="button"
                            onClick={() => toggleDirectorPanel(scene.id)}
                            className="flex w-full items-center justify-between gap-2 text-left text-xs font-black text-[var(--noc-t1)]"
                          >
                            <span>{isR16 ? 'Make it special' : 'Direct This Scene'}</span>
                            <ChevronRight className={`transition-transform ${openDirectorSceneIds.includes(scene.id) ? 'rotate-90' : ''}`} size={15} />
                          </button>
                          <p className="mt-2 line-clamp-2 text-xs font-bold text-[var(--noc-t4)]">{directorSummary(scene)}</p>
                          {openDirectorSceneIds.includes(scene.id) && (
                            <div className="mt-3 space-y-3">
                              {DIRECTOR_OPTION_GROUPS.map((group) => {
                                const Icon = group.icon;
                                return (
                                  <div key={`${scene.id}-${group.key}`}>
                                    <div className="mb-1 flex items-center gap-1 text-[11px] font-black uppercase tracking-wide text-[var(--noc-t4)]">
                                      <Icon size={13} />
                                      {isR16 ? group.r16Label : group.label}
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                      {group.options.map((option) => {
                                        const selected = scene[group.key] === option.value;
                                        return (
                                          <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => chooseDirectorSetting(scene, group.key, option.value)}
                                            disabled={updateSceneDirector.isPending && updateSceneDirector.variables?.sceneId === scene.id}
                                            className={`rounded-full border px-2.5 py-1 text-[11px] font-black transition-colors ${
                                              selected
                                                ? 'border-[var(--noc-blue)] bg-[rgba(79,139,214,0.12)] text-[var(--noc-purple)]'
                                                : 'border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] text-[var(--noc-t4)] hover:border-[var(--noc-purple)]'
                                            }`}
                                          >
                                            {isR16 && option.r16Label ? option.r16Label : option.label}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                              <p className="rounded-lg bg-[rgba(79,139,214,0.10)] px-2 py-2 text-[11px] font-bold text-[var(--noc-purple)]">
                                {isR16 ? 'Make a new picture when you are ready.' : 'Settings are saved only. Regenerate to apply them to the next image.'}
                              </p>
                            </div>
                          )}
                        </div>
                        <div className="mt-3 grid gap-2">
                          {!isR16 && (
                            <select
                              value={sceneImageModel}
                              onChange={(e) => setSceneImageModel(e.target.value as SceneImageModel)}
                              className="w-full appearance-none rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] px-3 py-2 text-sm font-bold text-[var(--noc-t1)] focus:outline-none focus:border-[var(--noc-magenta)]/60 cursor-pointer"
                            >
                              {SCENE_IMAGE_MODEL_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value} className="bg-[var(--noc-page)] text-[var(--noc-t1)]">
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          )}
                          <button
                            type="button"
                            onClick={() => makeSceneImage(scene)}
                            disabled={!projectId || isGenerating}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[linear-gradient(90deg,#d946a8,#b25ad9,#4f8bd6)] px-3 py-2 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isGenerating ? <Loader2 className="animate-spin" size={16} /> : <ImagePlus size={16} />}
                            {isGenerating ? (isR16 ? 'Making...' : 'Generating...') : hasFailed ? (isR16 ? 'Try Again' : 'Try Again') : scene.imageUrl ? (isR16 ? 'Make New Picture' : 'Regenerate') : (isR16 ? 'Make Picture' : 'Generate Image')}
                          </button>
                          {!isR16 && scene.imageUrl && (
                            <button
                              type="button"
                              onClick={() => makeSceneVideo(scene)}
                              disabled={!projectId || generateSceneVideo.isPending || regenerateSceneVideo.isPending}
                              className="inline-flex items-center justify-center gap-2 rounded-xl border border-[rgba(79,139,214,0.30)] bg-[rgba(79,139,214,0.10)] px-3 py-2 text-sm font-black text-[var(--noc-blue)] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {generateSceneVideo.isPending || regenerateSceneVideo.isPending ? <Loader2 className="animate-spin" size={16} /> : <Clapperboard size={16} />}
                              {latestVideoAsset(scene) ? 'Regenerate Video' : 'Animate to Video'}
                            </button>
                          )}
                          {!isR16 && (scene.assets?.length ?? 0) > 0 && (
                            <button
                              type="button"
                              onClick={() => setHistoryScene(scene)}
                              className="inline-flex items-center justify-center gap-2 rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] px-3 py-2 text-sm font-black text-[var(--noc-t1)]"
                            >
                              <History size={16} />
                              Image History ({scene.assets?.length ?? 0})
                            </button>
                          )}
                          {projectId && (
                            <Link
                              href={`/story-playground/${projectId}/storybook`}
                              className="inline-flex items-center justify-center rounded-xl bg-[var(--noc-blue)] px-3 py-2 text-sm font-black text-white"
                            >
                              {isR16 ? 'Read Story' : 'Open Storybook'}
                            </Link>
                          )}
                          {scene.imageUrl && latestReadyAsset(scene) && (
                            <div className="rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-2">
                              <p className="mb-2 text-xs font-black text-[var(--noc-t4)]">{isR16 ? 'Do you like it?' : 'Rate this image'}</p>
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  onClick={() => rateSceneImage(scene, 'UP')}
                                  disabled={submitPromptQualityFeedback.isPending}
                                  className={`inline-flex items-center justify-center rounded-lg px-2 py-2 text-sm font-black ${feedbackRatings[latestReadyAsset(scene)!.id] === 'UP' ? 'bg-[rgba(79,139,214,0.12)] text-[var(--noc-purple)]' : 'bg-[rgba(79,139,214,0.10)] text-[var(--noc-purple)]'}`}
                                >
                                  <ThumbsUp size={16} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => rateSceneImage(scene, 'DOWN')}
                                  disabled={submitPromptQualityFeedback.isPending}
                                  className={`inline-flex items-center justify-center rounded-lg px-2 py-2 text-sm font-black ${feedbackRatings[latestReadyAsset(scene)!.id] === 'DOWN' ? 'bg-[rgba(217,70,168,0.15)] text-[var(--noc-magenta)]' : 'bg-[rgba(233,233,237,0.04)] text-[var(--noc-t4)]'}`}
                                >
                                  <ThumbsDown size={16} />
                                </button>
                              </div>
                              {!isR16 && (
                                <input
                                  value={feedbackComments[latestReadyAsset(scene)!.id] ?? ''}
                                  onChange={(event) => setFeedbackComments((current) => ({ ...current, [latestReadyAsset(scene)!.id]: event.target.value }))}
                                  placeholder="What would you improve?"
                                  className="mt-2 w-full rounded-lg border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] px-2 py-2 text-xs font-semibold text-[var(--noc-t1)] placeholder:text-[var(--noc-t5)] outline-none focus:border-[var(--noc-purple)]"
                                />
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {canUseAdvancedPrompts && (
              <section className="rounded-2xl border border-[rgba(233,233,237,0.10)] bg-[var(--noc-page)] p-5 text-white md:p-6">
                <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-sm font-black uppercase tracking-wide text-[var(--noc-magenta)]">Enhanced prompt composer</p>
                    <h3 className="text-3xl font-black">Hidden prompts for AI Studio</h3>
                    <p className="mt-1 font-semibold text-[var(--noc-t3)]">
                      Scene + character bible + mood + setting + visual style becomes provider-ready prompts. This is hidden on R16.
                    </p>
                  </div>
                  <button
                    onClick={() => projectId && composeAllScenePrompts.mutate({ projectId, outputType: 'IMAGE', provider: 'FLUX' })}
                    disabled={!projectId || scenes.length === 0 || composeAllScenePrompts.isPending}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[linear-gradient(90deg,#d946a8,#b25ad9)] px-5 py-3 font-black text-[var(--noc-t1)] disabled:opacity-50"
                  >
                    {composeAllScenePrompts.isPending ? 'Saving...' : 'Enhance All'}
                  </button>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {scenes.map((scene) => {
                    const latest = latestPromptForScene(scene);
                    return (
                      <div key={scene.id} className="rounded-2xl border border-[var(--noc-hairline)] bg-[var(--noc-card)] p-4">
                        <p className="text-xs font-black uppercase tracking-wide text-[var(--noc-t5)]">Scene {scene.orderIndex}</p>
                        <h4 className="mt-1 text-lg font-black">{scene.title}</h4>
                        <p className="mt-2 line-clamp-2 text-sm font-semibold text-[var(--noc-t4)]">{scene.description}</p>
                        <div className="mt-4 grid gap-2">
                          <button
                            onClick={() => projectId && composeScenePrompt.mutate({ projectId, sceneId: scene.id, outputType: 'IMAGE', provider: 'FLUX', saveVersion: true })}
                            disabled={!projectId || composeScenePrompt.isPending}
                            className="rounded-xl bg-[var(--noc-card)] px-3 py-2 text-sm font-black text-white hover:bg-[rgba(233,233,237,0.15)] disabled:opacity-50"
                          >
                            Regenerate Prompt
                          </button>
                          <button
                            onClick={() => latest && setPreviewPrompt(latest)}
                            disabled={!latest}
                            className="rounded-xl border border-[var(--noc-hairline)] px-3 py-2 text-sm font-black text-[var(--noc-t2)] hover:text-[var(--noc-t1)] disabled:opacity-40"
                          >
                            Preview Enhanced Prompt
                          </button>
                          <button
                            onClick={() => latest && sendPromptToAiStudio(latest)}
                            disabled={!latest}
                            className="rounded-xl bg-[linear-gradient(90deg,#d946a8,#b25ad9,#4f8bd6)] px-3 py-2 text-sm font-black text-white disabled:opacity-40"
                          >
                            Send to AI Studio
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      {editingScene && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-[var(--noc-page)] p-5 text-[var(--noc-t1)] shadow-2xl border border-[rgba(233,233,237,0.10)]">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-wide text-[var(--noc-purple)]">Edit scene</p>
                <h3 className="text-2xl font-black">{isR16 ? 'Fix this picture card' : 'Adjust scene card'}</h3>
              </div>
              <button onClick={() => setEditingScene(null)} className="rounded-full bg-[rgba(233,233,237,0.06)] p-2">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-sm font-black text-[var(--noc-t4)]">Name</span>
                <input
                  value={sceneForm.title}
                  onChange={(event) => setSceneForm({ ...sceneForm, title: event.target.value })}
                  className="w-full rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] px-4 py-3 font-bold text-[var(--noc-t1)] placeholder:text-[var(--noc-t5)] outline-none focus:border-[var(--noc-purple)]"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-black text-[var(--noc-t4)]">{isR16 ? 'What happens?' : 'Description'}</span>
                <textarea
                  value={sceneForm.description}
                  onChange={(event) => setSceneForm({ ...sceneForm, description: event.target.value })}
                  rows={4}
                  className="w-full resize-none rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] px-4 py-3 font-bold text-[var(--noc-t1)] placeholder:text-[var(--noc-t5)] outline-none focus:border-[var(--noc-purple)]"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-sm font-black text-[var(--noc-t4)]">Place</span>
                  <input
                    value={sceneForm.locationType}
                    onChange={(event) => setSceneForm({ ...sceneForm, locationType: event.target.value })}
                    className="w-full rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] px-3 py-2 font-bold text-[var(--noc-t1)] placeholder:text-[var(--noc-t5)] outline-none focus:border-[var(--noc-purple)]"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-black text-[var(--noc-t4)]">Where</span>
                  <input
                    value={sceneForm.indoorOutdoor}
                    onChange={(event) => setSceneForm({ ...sceneForm, indoorOutdoor: event.target.value })}
                    className="w-full rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] px-3 py-2 font-bold text-[var(--noc-t1)] placeholder:text-[var(--noc-t5)] outline-none focus:border-[var(--noc-purple)]"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-black text-[var(--noc-t4)]">Feeling</span>
                  <input
                    value={sceneForm.mood}
                    onChange={(event) => setSceneForm({ ...sceneForm, mood: event.target.value })}
                    className="w-full rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] px-3 py-2 font-bold text-[var(--noc-t1)] placeholder:text-[var(--noc-t5)] outline-none focus:border-[var(--noc-purple)]"
                  />
                </label>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button onClick={() => setEditingScene(null)} className="rounded-xl bg-[rgba(233,233,237,0.08)] px-5 py-3 font-black text-[var(--noc-t1)]">
                Cancel
              </button>
              <button
                onClick={saveScene}
                disabled={!sceneForm.title.trim() || !sceneForm.description.trim() || updateScene.isPending}
                className="rounded-xl bg-[linear-gradient(90deg,#d946a8,#b25ad9,#4f8bd6)] px-5 py-3 font-black text-white disabled:opacity-50"
              >
                {updateScene.isPending ? 'Saving...' : 'Save Scene'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingCharacter && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 px-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-[var(--noc-page)] p-5 text-[var(--noc-t1)] shadow-2xl border border-[rgba(233,233,237,0.10)]">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-wide text-[var(--noc-blue)]">{isR16 ? 'Edit friend' : 'Edit character reference'}</p>
                <h3 className="text-2xl font-black">{editingCharacter.name}</h3>
              </div>
              <button onClick={() => setEditingCharacter(null)} className="rounded-full bg-[rgba(233,233,237,0.06)] p-2">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-black text-[var(--noc-t4)]">Name</span>
                  <input
                    value={characterForm.name}
                    onChange={(event) => setCharacterForm({ ...characterForm, name: event.target.value })}
                    className="w-full rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] px-4 py-3 font-bold text-[var(--noc-t1)] placeholder:text-[var(--noc-t5)] outline-none focus:border-[var(--noc-purple)]"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-black text-[var(--noc-t4)]">Role</span>
                  <input
                    value={characterForm.role}
                    onChange={(event) => setCharacterForm({ ...characterForm, role: event.target.value })}
                    className="w-full rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] px-4 py-3 font-bold text-[var(--noc-t1)] placeholder:text-[var(--noc-t5)] outline-none focus:border-[var(--noc-purple)]"
                  />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-sm font-black text-[var(--noc-t4)]">Species</span>
                  <input
                    value={characterForm.species}
                    onChange={(event) => setCharacterForm({ ...characterForm, species: event.target.value })}
                    className="w-full rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] px-3 py-2 font-bold text-[var(--noc-t1)] placeholder:text-[var(--noc-t5)] outline-none focus:border-[var(--noc-purple)]"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-black text-[var(--noc-t4)]">Age</span>
                  <input
                    value={characterForm.ageDescription}
                    onChange={(event) => setCharacterForm({ ...characterForm, ageDescription: event.target.value })}
                    className="w-full rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] px-3 py-2 font-bold text-[var(--noc-t1)] placeholder:text-[var(--noc-t5)] outline-none focus:border-[var(--noc-purple)]"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-black text-[var(--noc-t4)]">Gender</span>
                  <input
                    value={characterForm.gender}
                    onChange={(event) => setCharacterForm({ ...characterForm, gender: event.target.value })}
                    className="w-full rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] px-3 py-2 font-bold text-[var(--noc-t1)] placeholder:text-[var(--noc-t5)] outline-none focus:border-[var(--noc-purple)]"
                  />
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-sm font-black text-[var(--noc-t4)]">{isR16 ? 'How should this friend look?' : 'Visual description used in every prompt'}</span>
                <textarea
                  value={characterForm.visualDescription}
                  onChange={(event) => setCharacterForm({ ...characterForm, visualDescription: event.target.value })}
                  rows={5}
                  className="w-full resize-none rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] px-4 py-3 font-bold text-[var(--noc-t1)] placeholder:text-[var(--noc-t5)] outline-none focus:border-[var(--noc-purple)]"
                />
              </label>
              <div className="rounded-2xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-4">
                <p className="mb-3 text-sm font-black text-[var(--noc-t4)]">{isR16 ? 'What are they like?' : 'Personality'}</p>
                <div className="flex flex-wrap gap-2">
                  {PERSONALITY_OPTIONS.map((trait) => {
                    const selected = characterForm.personalityTraits.includes(trait);
                    return (
                      <button
                        key={trait}
                        type="button"
                        onClick={() => togglePersonalityTrait(trait)}
                        className={`rounded-full px-3 py-2 text-sm font-black ${selected ? 'bg-[rgba(79,139,214,0.15)] text-[var(--noc-blue)] border border-[rgba(79,139,214,0.4)]' : 'bg-[rgba(233,233,237,0.04)] text-[var(--noc-t4)] border border-[rgba(233,233,237,0.10)]'}`}
                      >
                        {characterOptionLabel(trait)}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-black text-[var(--noc-t4)]">{isR16 ? 'What do they want?' : 'Motivation'}</span>
                  <select value={characterForm.motivation} onChange={(event) => setCharacterForm({ ...characterForm, motivation: event.target.value })} className="w-full rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] px-3 py-3 font-bold text-[var(--noc-t1)] placeholder:text-[var(--noc-t5)] outline-none focus:border-[var(--noc-purple)]">
                    <option value="">Choose</option>
                    {MOTIVATION_OPTIONS.map((option) => <option key={option} value={option}>{characterOptionLabel(option)}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-black text-[var(--noc-t4)]">{isR16 ? 'What feels scary?' : 'Fear'}</span>
                  <select value={characterForm.fear} onChange={(event) => setCharacterForm({ ...characterForm, fear: event.target.value })} className="w-full rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] px-3 py-3 font-bold text-[var(--noc-t1)] placeholder:text-[var(--noc-t5)] outline-none focus:border-[var(--noc-purple)]">
                    <option value="">Choose</option>
                    {FEAR_OPTIONS.map((option) => <option key={option} value={option}>{characterOptionLabel(option)}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-black text-[var(--noc-t4)]">Goal</span>
                  <select value={characterForm.goal} onChange={(event) => setCharacterForm({ ...characterForm, goal: event.target.value })} className="w-full rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] px-3 py-3 font-bold text-[var(--noc-t1)] placeholder:text-[var(--noc-t5)] outline-none focus:border-[var(--noc-purple)]">
                    <option value="">Choose</option>
                    {CHARACTER_GOAL_OPTIONS.map((option) => <option key={option} value={option}>{characterOptionLabel(option)}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-black text-[var(--noc-t4)]">{isR16 ? 'Favorite face' : 'Favorite Expression'}</span>
                  <select value={characterForm.favoriteExpression} onChange={(event) => setCharacterForm({ ...characterForm, favoriteExpression: event.target.value })} className="w-full rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] px-3 py-3 font-bold text-[var(--noc-t1)] placeholder:text-[var(--noc-t5)] outline-none focus:border-[var(--noc-purple)]">
                    <option value="">Choose</option>
                    {EXPRESSION_OPTIONS.map((option) => <option key={option} value={option}>{characterOptionLabel(option)}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-black text-[var(--noc-t4)]">Walking Style</span>
                  <select value={characterForm.walkingStyle} onChange={(event) => setCharacterForm({ ...characterForm, walkingStyle: event.target.value })} className="w-full rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] px-3 py-3 font-bold text-[var(--noc-t1)] placeholder:text-[var(--noc-t5)] outline-none focus:border-[var(--noc-purple)]">
                    <option value="">Choose</option>
                    {WALKING_STYLE_OPTIONS.map((option) => <option key={option} value={option}>{characterOptionLabel(option)}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-black text-[var(--noc-t4)]">{isR16 ? 'Talking style' : 'Speaking Style'}</span>
                  <select value={characterForm.speakingStyle} onChange={(event) => setCharacterForm({ ...characterForm, speakingStyle: event.target.value })} className="w-full rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] px-3 py-3 font-bold text-[var(--noc-t1)] placeholder:text-[var(--noc-t5)] outline-none focus:border-[var(--noc-purple)]">
                    <option value="">Choose</option>
                    {SPEAKING_STYLE_OPTIONS.map((option) => <option key={option} value={option}>{characterOptionLabel(option)}</option>)}
                  </select>
                </label>
              </div>
              <div className="rounded-2xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-black text-[var(--noc-t4)]">
                  <HeartHandshake size={18} />
                  {isR16 ? 'Who are their friends?' : 'Relationship'}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input value={characterForm.relationshipTargetName} onChange={(event) => setCharacterForm({ ...characterForm, relationshipTargetName: event.target.value })} placeholder={isR16 ? 'Friend name' : 'Target character name'} className="rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] px-3 py-3 font-bold text-[var(--noc-t1)] placeholder:text-[var(--noc-t5)] outline-none focus:border-[var(--noc-purple)]" />
                  <select value={characterForm.relationshipType} onChange={(event) => setCharacterForm({ ...characterForm, relationshipType: event.target.value })} className="rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] px-3 py-3 font-bold text-[var(--noc-t1)] placeholder:text-[var(--noc-t5)] outline-none focus:border-[var(--noc-purple)]">
                    {RELATIONSHIP_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{characterOptionLabel(option)}</option>)}
                  </select>
                  <select value={characterForm.relationshipStrength} onChange={(event) => setCharacterForm({ ...characterForm, relationshipStrength: event.target.value })} className="rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] px-3 py-3 font-bold text-[var(--noc-t1)] placeholder:text-[var(--noc-t5)] outline-none focus:border-[var(--noc-purple)]">
                    {RELATIONSHIP_STRENGTH_OPTIONS.map((option) => <option key={option} value={option}>{characterOptionLabel(option)}</option>)}
                  </select>
                  {!isR16 && <input value={characterForm.relationshipNotes} onChange={(event) => setCharacterForm({ ...characterForm, relationshipNotes: event.target.value })} placeholder="Relationship notes" className="rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] px-3 py-3 font-bold text-[var(--noc-t1)] placeholder:text-[var(--noc-t5)] outline-none focus:border-[var(--noc-purple)]" />}
                </div>
              </div>
              {!isR16 && (
                <div className="rounded-2xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-4">
                  <p className="mb-3 text-sm font-black text-[var(--noc-t4)]">Character Evolution</p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <input value={characterForm.evolutionStage} onChange={(event) => setCharacterForm({ ...characterForm, evolutionStage: event.target.value })} placeholder="Stage, e.g. braver" className="rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] px-3 py-3 font-bold text-[var(--noc-t1)] placeholder:text-[var(--noc-t5)] outline-none focus:border-[var(--noc-purple)]" />
                    <input value={characterForm.evolutionSceneOrder} onChange={(event) => setCharacterForm({ ...characterForm, evolutionSceneOrder: event.target.value })} placeholder="From scene #" type="number" min={1} className="rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] px-3 py-3 font-bold text-[var(--noc-t1)] placeholder:text-[var(--noc-t5)] outline-none focus:border-[var(--noc-purple)]" />
                    <input value={characterForm.evolutionNotes} onChange={(event) => setCharacterForm({ ...characterForm, evolutionNotes: event.target.value })} placeholder="Evolution notes" className="rounded-xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] px-3 py-3 font-bold text-[var(--noc-t1)] placeholder:text-[var(--noc-t5)] outline-none focus:border-[var(--noc-purple)]" />
                  </div>
                </div>
              )}
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button onClick={() => setEditingCharacter(null)} className="rounded-xl bg-[rgba(233,233,237,0.08)] px-5 py-3 font-black text-[var(--noc-t1)]">
                Cancel
              </button>
              <button
                onClick={saveCharacter}
                disabled={!characterForm.name.trim() || !characterForm.visualDescription.trim() || updateCharacterMemory.isPending || createCharacterMemory.isPending}
                className="rounded-xl bg-[var(--noc-blue)] px-5 py-3 font-black text-white disabled:opacity-50"
              >
                {updateCharacterMemory.isPending || createCharacterMemory.isPending ? 'Saving...' : isR16 ? 'Save Friend' : 'Save Character'}
              </button>
            </div>
          </div>
        </div>
      )}

      {previewPrompt && canUseAdvancedPrompts && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-3xl rounded-2xl bg-[var(--noc-page)] p-5 text-white shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-wide text-[var(--noc-magenta)]">Enhanced prompt preview</p>
                <h3 className="text-2xl font-black">{previewPrompt.provider} v{previewPrompt.version}</h3>
              </div>
              <button onClick={() => setPreviewPrompt(null)} className="rounded-full bg-[var(--noc-card)] p-2">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-black uppercase tracking-wide text-[var(--noc-t5)]">Prompt</p>
                <textarea readOnly value={previewPrompt.prompt} rows={8} className="w-full resize-none rounded-xl border border-[var(--noc-hairline)] bg-black/25 p-3 text-sm text-[var(--noc-t2)] outline-none" />
              </div>
              {previewPrompt.negativePrompt && (
                <div>
                  <p className="mb-2 text-xs font-black uppercase tracking-wide text-[var(--noc-t5)]">Negative prompt</p>
                  <textarea readOnly value={previewPrompt.negativePrompt} rows={3} className="w-full resize-none rounded-xl border border-[var(--noc-hairline)] bg-black/25 p-3 text-sm text-[var(--noc-t2)] outline-none" />
                </div>
              )}
              <div className="flex flex-wrap gap-2 text-xs font-bold text-[var(--noc-t3)]">
                <span className="rounded-full bg-[var(--noc-card)] px-3 py-1">{previewPrompt.outputType}</span>
                <span className="rounded-full bg-[var(--noc-card)] px-3 py-1">{previewPrompt.aspectRatio}</span>
                {previewPrompt.duration && <span className="rounded-full bg-[var(--noc-card)] px-3 py-1">{previewPrompt.duration}s</span>}
              </div>
            </div>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button onClick={() => setPreviewPrompt(null)} className="rounded-xl bg-[var(--noc-card)] px-5 py-3 font-black text-white">
                Close
              </button>
              <button onClick={() => sendPromptToAiStudio(previewPrompt)} className="rounded-xl bg-[linear-gradient(90deg,#d946a8,#b25ad9,#4f8bd6)] px-5 py-3 font-black text-white">
                Send to AI Studio
              </button>
            </div>
          </div>
        </div>
      )}

      {historyScene && !isR16 && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 px-4">
          <div className="max-h-[88vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-[var(--noc-page)] p-5 text-[var(--noc-t1)] shadow-2xl border border-[rgba(233,233,237,0.10)]">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-wide text-[var(--noc-purple)]">Image history</p>
                <h3 className="text-2xl font-black">{historyScene.title}</h3>
              </div>
              <button onClick={() => setHistoryScene(null)} className="rounded-full bg-[rgba(233,233,237,0.06)] p-2">
                <X size={20} />
              </button>
            </div>

            {(historyScene.assets?.length ?? 0) === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-8 text-center font-bold text-[var(--noc-t4)]">
                No images have been generated for this scene yet.
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {historyScene.assets?.map((asset) => (
                  <div key={asset.id} className="rounded-2xl border border-[rgba(233,233,237,0.10)] bg-[rgba(233,233,237,0.04)] p-3">
                    <div
                      className="aspect-[4/5] rounded-xl bg-gradient-to-br from-[#dff8e9] via-[#f6fbff] to-[#ffefb0] bg-cover bg-center"
                      style={asset.assetUrl ? { backgroundImage: `url("${asset.assetUrl}")` } : undefined}
                    />
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className={`rounded-full px-2 py-1 text-xs font-black ${asset.status === 'READY' ? 'bg-[rgba(79,139,214,0.12)] text-[var(--noc-purple)]' : asset.status === 'FAILED' ? 'bg-[rgba(217,70,168,0.12)] text-[var(--noc-magenta)]' : 'bg-[rgba(233,233,237,0.06)] text-[var(--noc-t4)]'}`}>
                        {asset.isLatest ? 'LATEST' : asset.status}
                      </span>
                      <span className="text-xs font-bold text-[var(--noc-t4)]">{asset.model}</span>
                    </div>
                    <p className="mt-2 text-xs font-semibold text-[var(--noc-t4)]">
                      {new Date(asset.createdAt).toLocaleString()}
                    </p>
                    {asset.errorMessage && (
                      <p className="mt-2 line-clamp-2 text-xs font-bold text-[var(--noc-magenta)]">{asset.errorMessage}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
