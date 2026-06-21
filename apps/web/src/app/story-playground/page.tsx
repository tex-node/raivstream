'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookOpen, ChevronRight, History, ImagePlus, Loader2, Mic, Sparkles, UserRound, Wand2, X } from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { useR16 } from '@/lib/r16';
import { trpc } from '@/lib/trpc';
import { useUser } from '@/lib/auth';

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
  characters: unknown;
  imageUrl: string | null;
  imageStatus: 'PENDING' | 'GENERATING' | 'READY' | 'FAILED' | null;
  latestImageAssetId: string | null;
  assets?: StorySceneAsset[];
  prompts?: StoryScenePrompt[];
};

type StorySceneAsset = {
  id: string;
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
};

function toOptions(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

const examples = [
  'A dog going to school',
  'A robot who lost his voice',
  'A princess who loves football',
  'A dragon afraid of fire',
  'A boy who finds a magic pencil',
];

export default function StoryPlaygroundPage() {
  const router = useRouter();
  const isR16 = useR16();
  const { isSignedIn, isLoaded, user } = useUser();
  const utils = trpc.useUtils();
  const trackStoryEvent = trpc.analytics.trackStoryEvent.useMutation();
  const playgroundOpenedTracked = useRef(false);

  const [step, setStep] = useState<PlaygroundStep>('spark');
  const [idea, setIdea] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [editingScene, setEditingScene] = useState<StoryScene | null>(null);
  const [editingCharacter, setEditingCharacter] = useState<StoryCharacterMemory | null>(null);
  const [previewPrompt, setPreviewPrompt] = useState<StoryScenePrompt | null>(null);
  const [historyScene, setHistoryScene] = useState<StoryScene | null>(null);
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
      setStep('story');
      setMessage('Story saved. Scene cards are ready.');
      await utils.story.getProject.invalidate();
      await utils.story.listMyProjects.invalidate();
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

  const updateCharacterMemory = trpc.story.updateCharacterMemory.useMutation({
    onSuccess: async (_character, variables) => {
      setEditingCharacter(null);
      await generateScenes.mutateAsync({ projectId: variables.projectId, replaceExisting: true });
      setMessage('Character saved. Scene references refreshed.');
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
  const isBusy = createSpark.isPending || generateQuestions.isPending || answerQuestion.isPending || generateStory.isPending || continueStory.isPending || saveProject.isPending || generateScenes.isPending || updateScene.isPending || generateCharacterBible.isPending || updateCharacterMemory.isPending || composeScenePrompt.isPending || composeAllScenePrompts.isPending || generateSceneImage.isPending || regenerateSceneImage.isPending;

  useEffect(() => {
    if (project?.chapters?.length) setStep('story');
  }, [project?.chapters?.length]);

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
    });
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
    setCharacterForm({
      name: character.name,
      role: character.role ?? '',
      species: character.species ?? '',
      ageDescription: character.ageDescription ?? '',
      gender: character.gender ?? '',
      visualDescription: character.visualDescription ?? '',
    });
  };

  const saveCharacter = () => {
    if (!projectId || !editingCharacter) return;
    updateCharacterMemory.mutate({
      projectId,
      characterId: editingCharacter.id,
      name: characterForm.name.trim(),
      role: characterForm.role.trim() || undefined,
      species: characterForm.species.trim() || undefined,
      ageDescription: characterForm.ageDescription.trim() || undefined,
      gender: characterForm.gender.trim() || undefined,
      visualDescription: characterForm.visualDescription.trim(),
    });
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

  const makeSceneImage = (scene: StoryScene) => {
    if (!projectId) return;
    const action = scene.imageUrl ? regenerateSceneImage : generateSceneImage;
    action.mutate({ projectId, sceneId: scene.id, model: 'FLUX' });
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
    <div className="min-h-screen bg-[#fff8ec] text-[#172033]">
      <Navbar />
      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 pb-16 pt-24">
        <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-800">
              <Sparkles size={16} />
              {isR16 ? 'R16 Story Playground' : 'Story Playground'}
            </div>
            <h1 className="max-w-3xl text-4xl font-black leading-tight text-[#172033] md:text-6xl">
              What story should we create?
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-[#596070]">
              Start with a tiny idea. We will ask a few easy questions, then turn it into a short story you can keep building.
            </p>
          </div>

          <div className="rounded-2xl border-2 border-[#172033]/10 bg-white p-5 shadow-[0_18px_0_rgba(23,32,51,0.08)]">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#ffcf4a] text-[#172033]">
                <BookOpen size={24} />
              </div>
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-[#596070]">Step {step === 'spark' ? '1' : step === 'questions' ? '2' : '3'} of 3</p>
                <p className="font-black">{step === 'spark' ? 'Story Spark' : step === 'questions' ? 'Questions' : 'Your Story'}</p>
              </div>
            </div>

            <div className="h-3 overflow-hidden rounded-full bg-[#ece4d4]">
              <div
                className="h-full rounded-full bg-[#2fbf71] transition-all"
                style={{ width: step === 'spark' ? '33%' : step === 'questions' ? '66%' : '100%' }}
              />
            </div>
          </div>
        </section>

        {message && (
          <div className="rounded-xl border border-[#172033]/10 bg-white px-4 py-3 text-sm font-semibold text-[#596070]">
            {message}
          </div>
        )}

        {isLoaded && !isSignedIn && (
          <div className="rounded-2xl border-2 border-[#172033]/10 bg-white p-6">
            <p className="mb-4 text-lg font-bold">Sign in to save and continue your stories.</p>
            <Link href="/sign-in?redirect_url=/story-playground" className="inline-flex items-center gap-2 rounded-xl bg-[#172033] px-5 py-3 font-bold text-white">
              Sign in
              <ChevronRight size={18} />
            </Link>
          </div>
        )}

        {step === 'spark' && (
          <section className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <div className="rounded-2xl border-2 border-[#172033]/10 bg-white p-5">
              <textarea
                value={idea}
                onChange={(event) => setIdea(event.target.value)}
                placeholder="A dog going to school"
                rows={5}
                className="min-h-48 w-full resize-none rounded-xl border-2 border-[#172033]/10 bg-[#fffdf8] p-5 text-2xl font-bold outline-none transition-colors placeholder:text-[#a9a08f] focus:border-[#2f80ed]"
              />

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button type="button" className="flex min-h-24 items-center justify-center gap-3 rounded-xl border-2 border-dashed border-[#172033]/15 bg-[#f6fbff] px-4 py-3 text-left font-bold text-[#596070]">
                  <ImagePlus size={22} />
                  Add a picture later
                </button>
                <button type="button" className="flex min-h-24 items-center justify-center gap-3 rounded-xl border-2 border-dashed border-[#172033]/15 bg-[#fff7fb] px-4 py-3 text-left font-bold text-[#596070]">
                  <Mic size={22} />
                  Voice idea later
                </button>
              </div>

              <button
                onClick={startStory}
                disabled={isBusy || idea.trim().length < 3 || !isSignedIn}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#2f80ed] px-6 py-4 text-lg font-black text-white transition-colors hover:bg-[#256fd0] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isBusy ? 'Starting...' : 'Start Story'}
                <ChevronRight size={22} />
              </button>
            </div>

            <div className="rounded-2xl border-2 border-[#172033]/10 bg-[#ffefb0] p-5">
              <h2 className="mb-3 text-lg font-black">Try one of these</h2>
              <div className="flex flex-col gap-3">
                {examples.map((example) => (
                  <button
                    key={example}
                    onClick={() => setIdea(example)}
                    className="rounded-xl bg-white px-4 py-3 text-left font-bold text-[#172033] shadow-sm transition-transform hover:-translate-y-0.5"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {step === 'questions' && activeQuestion && (
          <section className="rounded-2xl border-2 border-[#172033]/10 bg-white p-5 md:p-8">
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-bold text-[#596070]">Question {activeQuestionIndex + 1} of {questions.length}</p>
              <p className="font-bold text-[#2f80ed]">{answeredCount} answered</p>
            </div>

            <h2 className="mb-6 text-3xl font-black">{activeQuestion.questionText}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {toOptions(activeQuestion.answerOptions).map((option) => (
                <button
                  key={option}
                  onClick={() => chooseAnswer(activeQuestion, option)}
                  disabled={answerQuestion.isPending}
                  className={`min-h-24 rounded-xl border-2 px-5 py-4 text-left text-lg font-black transition-all ${
                    activeQuestion.selectedAnswer === option
                      ? 'border-[#2fbf71] bg-[#dff8e9] text-[#145c37]'
                      : 'border-[#172033]/10 bg-[#fffdf8] text-[#172033] hover:border-[#2f80ed]'
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
                className="rounded-xl bg-[#ece4d4] px-5 py-3 font-bold text-[#172033] disabled:opacity-40"
              >
                Back
              </button>
              <button
                onClick={generateCurrentStory}
                disabled={!canGenerate || generateStory.isPending}
                className="rounded-xl bg-[#2fbf71] px-5 py-3 font-black text-white disabled:opacity-40"
              >
                {generateStory.isPending ? 'Creating story...' : 'Create My Story'}
              </button>
            </div>
          </section>
        )}

        {step === 'story' && (
          <>
            <section className="grid gap-6 lg:grid-cols-[1fr_320px]">
              <div className="rounded-2xl border-2 border-[#172033]/10 bg-white p-5 md:p-8">
                <div className="mb-6">
                  <p className="mb-2 font-bold text-[#2fbf71]">{project?.ageRange ? `Ages ${project.ageRange}` : 'Short story'}</p>
                  <h2 className="text-4xl font-black">{project?.title ?? 'Your Story'}</h2>
                  {project?.theme && <p className="mt-2 font-semibold text-[#596070]">Theme: {project.theme}</p>}
                </div>

                <div className="space-y-8">
                  {chapters.map((chapter) => (
                    <article key={chapter.id} className="border-t border-[#172033]/10 pt-6 first:border-t-0 first:pt-0">
                      <p className="mb-2 text-sm font-black uppercase tracking-wide text-[#596070]">Chapter {chapter.chapterNumber}</p>
                      <h3 className="mb-3 text-2xl font-black">{chapter.title}</h3>
                      <p className="mb-5 rounded-xl bg-[#f5f1e8] px-4 py-3 font-semibold text-[#596070]">{chapter.summary}</p>
                      <div className="whitespace-pre-line text-lg leading-8 text-[#243044]">{chapter.body}</div>
                    </article>
                  ))}
                </div>
              </div>

              <aside className="space-y-3">
                <button
                  onClick={continueCurrentStory}
                  disabled={!projectId || continueStory.isPending || generateScenes.isPending}
                  className="flex w-full items-center justify-between rounded-xl bg-[#2f80ed] px-5 py-4 text-left font-black text-white disabled:opacity-50"
                >
                  {continueStory.isPending ? 'Adding chapter...' : generateScenes.isPending ? 'Making scenes...' : 'Continue Story'}
                  <ChevronRight size={20} />
                </button>
                <button className="w-full rounded-xl bg-[#ffcf4a] px-5 py-4 text-left font-black text-[#172033]" onClick={() => setMessage('A funnier version tool will be added next.')}>
                  Make It Funnier
                </button>
                <button className="w-full rounded-xl bg-[#d9ccff] px-5 py-4 text-left font-black text-[#172033]" onClick={() => setMessage('A more magical version tool will be added next.')}>
                  Make It More Magical
                </button>
                <button className="w-full rounded-xl bg-[#ece4d4] px-5 py-4 text-left font-black text-[#172033]" onClick={() => setMessage('A shorter version tool will be added next.')}>
                  Shorten
                </button>
                <button className="w-full rounded-xl bg-white px-5 py-4 text-left font-black text-[#172033] ring-2 ring-[#172033]/10" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                  Read Again
                </button>
                <button
                  onClick={() => projectId && saveProject.mutate({ projectId })}
                  disabled={!projectId || saveProject.isPending}
                  className="w-full rounded-xl bg-[#172033] px-5 py-4 text-left font-black text-white disabled:opacity-50"
                >
                  Save Story
                </button>
                {projectId && scenes.length > 0 && (
                  <Link
                    href={`/story-playground/${projectId}/storybook`}
                    className="block w-full rounded-xl bg-[#2fbf71] px-5 py-4 text-left font-black text-white"
                  >
                    {isR16 ? 'Read Story' : 'Read Storybook'}
                  </Link>
                )}
              </aside>
            </section>

            <section className="rounded-2xl border-2 border-[#172033]/10 bg-white p-5 md:p-6">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-black uppercase tracking-wide text-[#2fbf71]">{isR16 ? 'Story friends' : 'Character Bible'}</p>
                  <h3 className="text-3xl font-black">{isR16 ? 'Keep everyone looking the same' : 'Consistent character references'}</h3>
                  <p className="mt-1 font-semibold text-[#596070]">
                    {isR16 ? 'These cards help Max or any friend look the same in every picture.' : 'These descriptions become reusable prompt ingredients for every scene in Phase 4.'}
                  </p>
                </div>
                <button
                  onClick={() => projectId && generateCharacterBible.mutate({ projectId, replaceExisting: true })}
                  disabled={!projectId || generateCharacterBible.isPending || generateScenes.isPending}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2fbf71] px-5 py-3 font-black text-white disabled:opacity-50"
                >
                  <UserRound size={18} />
                  {generateCharacterBible.isPending ? 'Refreshing...' : 'Refresh Characters'}
                </button>
              </div>

              {characterMemory.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-[#172033]/10 bg-[#fffdf8] p-8 text-center font-bold text-[#596070]">
                  Character cards will appear after your story is created.
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {characterMemory.map((character) => (
                    <button
                      key={character.id}
                      onClick={() => openCharacterEditor(character)}
                      className="rounded-2xl border-2 border-[#172033]/10 bg-[#fffdf8] p-4 text-left transition-transform hover:-translate-y-1 hover:border-[#2fbf71]"
                    >
                      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#dff8e9] text-[#145c37]">
                        <UserRound size={28} />
                      </div>
                      <h4 className="text-xl font-black">{character.name}</h4>
                      <p className="mt-1 text-sm font-bold text-[#596070]">
                        {[character.ageDescription, character.gender, character.species].filter(Boolean).join(' ') || character.role || 'Story character'}
                      </p>
                      <p className="mt-3 line-clamp-3 text-sm font-semibold text-[#596070]">
                        {character.visualDescription || 'Add a clear visual description.'}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border-2 border-[#172033]/10 bg-white p-5 md:p-6">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-black uppercase tracking-wide text-[#2f80ed]">{isR16 ? 'Picture cards' : 'Scene film-strip'}</p>
                  <h3 className="text-3xl font-black">{isR16 ? 'Story pictures' : 'Scenes for pictures and video'}</h3>
                  <p className="mt-1 font-semibold text-[#596070]">
                    {isR16 ? 'Tap a card to fix the name or what happens.' : 'Generate a scene image, regenerate it, and keep every version as reference material.'}
                  </p>
                </div>
                <button
                  disabled
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#ece4d4] px-5 py-3 font-black text-[#7a7469] opacity-70"
                  title="Coming soon"
                >
                  <Wand2 size={18} />
                  Make Pictures
                </button>
              </div>

              {scenes.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-[#172033]/10 bg-[#fffdf8] p-8 text-center font-bold text-[#596070]">
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
                        className="w-60 shrink-0 rounded-2xl border-2 border-[#172033]/10 bg-[#fffdf8] p-3 text-left transition-transform hover:-translate-y-1 hover:border-[#2f80ed]"
                      >
                        <button type="button" onClick={() => openSceneEditor(scene)} className="block w-full text-left">
                          <div
                            className="mb-3 flex aspect-[4/5] items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-[#dff8e9] via-[#f6fbff] to-[#ffefb0] bg-cover bg-center"
                            style={scene.imageUrl ? { backgroundImage: `url("${scene.imageUrl}")` } : undefined}
                          >
                            {isGenerating ? (
                              <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-white/82 text-[#2f80ed]">
                                <Loader2 className="animate-spin" size={34} />
                                <span className="px-4 text-center text-sm font-black">{isR16 ? 'Making your picture...' : 'Generating image...'}</span>
                              </div>
                            ) : hasFailed ? (
                              <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[#fff7fb]/90 px-4 text-center text-[#b13b63]">
                                <ImagePlus size={32} />
                                <span className="text-sm font-black">{isR16 ? 'Picture did not finish' : 'Generation failed'}</span>
                              </div>
                            ) : !scene.imageUrl ? (
                              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/80 text-2xl font-black text-[#2f80ed] shadow-sm">
                                {index + 1}
                              </div>
                            ) : null}
                          </div>
                          <p className="mb-1 text-xs font-black uppercase tracking-wide text-[#596070]">Scene {index + 1}</p>
                          <h4 className="line-clamp-1 text-lg font-black">{scene.title}</h4>
                          <p className="mt-2 line-clamp-3 text-sm font-semibold text-[#596070]">{scene.description}</p>
                          {sceneCharacterLabels(scene.characters).length > 0 && (
                            <p className="mt-3 rounded-lg bg-[#dff8e9] px-2 py-1 text-xs font-black text-[#145c37]">
                              {sceneCharacterLabels(scene.characters).join(', ')}
                            </p>
                          )}
                        </button>
                        <div className="mt-3 grid gap-2">
                          <button
                            type="button"
                            onClick={() => makeSceneImage(scene)}
                            disabled={!projectId || isGenerating}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2f80ed] px-3 py-2 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isGenerating ? <Loader2 className="animate-spin" size={16} /> : <ImagePlus size={16} />}
                            {isGenerating ? (isR16 ? 'Making...' : 'Generating...') : hasFailed ? (isR16 ? 'Try Again' : 'Try Again') : scene.imageUrl ? (isR16 ? 'Make New Picture' : 'Regenerate') : (isR16 ? 'Make Picture' : 'Generate Image')}
                          </button>
                          {!isR16 && (scene.assets?.length ?? 0) > 0 && (
                            <button
                              type="button"
                              onClick={() => setHistoryScene(scene)}
                              className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-[#172033]/10 bg-white px-3 py-2 text-sm font-black text-[#172033]"
                            >
                              <History size={16} />
                              Image History ({scene.assets?.length ?? 0})
                            </button>
                          )}
                          {projectId && (
                            <Link
                              href={`/story-playground/${projectId}/storybook`}
                              className="inline-flex items-center justify-center rounded-xl bg-[#2fbf71] px-3 py-2 text-sm font-black text-white"
                            >
                              {isR16 ? 'Read Story' : 'Open Storybook'}
                            </Link>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {canUseAdvancedPrompts && (
              <section className="rounded-2xl border-2 border-[#172033]/10 bg-[#172033] p-5 text-white md:p-6">
                <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-sm font-black uppercase tracking-wide text-[#ffcf4a]">Advanced prompt composer</p>
                    <h3 className="text-3xl font-black">Hidden prompts for AI Studio</h3>
                    <p className="mt-1 font-semibold text-white/60">
                      Scene + character bible + mood + setting becomes provider-ready prompts. This is hidden on R16.
                    </p>
                  </div>
                  <button
                    onClick={() => projectId && composeAllScenePrompts.mutate({ projectId, outputType: 'IMAGE', provider: 'FLUX' })}
                    disabled={!projectId || scenes.length === 0 || composeAllScenePrompts.isPending}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#ffcf4a] px-5 py-3 font-black text-[#172033] disabled:opacity-50"
                  >
                    {composeAllScenePrompts.isPending ? 'Saving...' : 'Compose All'}
                  </button>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {scenes.map((scene) => {
                    const latest = latestPromptForScene(scene);
                    return (
                      <div key={scene.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <p className="text-xs font-black uppercase tracking-wide text-white/40">Scene {scene.orderIndex}</p>
                        <h4 className="mt-1 text-lg font-black">{scene.title}</h4>
                        <p className="mt-2 line-clamp-2 text-sm font-semibold text-white/55">{scene.description}</p>
                        <div className="mt-4 grid gap-2">
                          <button
                            onClick={() => projectId && composeScenePrompt.mutate({ projectId, sceneId: scene.id, outputType: 'IMAGE', provider: 'FLUX', saveVersion: true })}
                            disabled={!projectId || composeScenePrompt.isPending}
                            className="rounded-xl bg-white/10 px-3 py-2 text-sm font-black text-white hover:bg-white/15 disabled:opacity-50"
                          >
                            Compose Image Prompt
                          </button>
                          <button
                            onClick={() => latest && setPreviewPrompt(latest)}
                            disabled={!latest}
                            className="rounded-xl border border-white/15 px-3 py-2 text-sm font-black text-white/75 hover:text-white disabled:opacity-40"
                          >
                            Preview Advanced Prompt
                          </button>
                          <button
                            onClick={() => latest && sendPromptToAiStudio(latest)}
                            disabled={!latest}
                            className="rounded-xl bg-[#2f80ed] px-3 py-2 text-sm font-black text-white disabled:opacity-40"
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
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 text-[#172033] shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-wide text-[#2f80ed]">Edit scene</p>
                <h3 className="text-2xl font-black">{isR16 ? 'Fix this picture card' : 'Adjust scene card'}</h3>
              </div>
              <button onClick={() => setEditingScene(null)} className="rounded-full bg-[#f5f1e8] p-2">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-sm font-black text-[#596070]">Name</span>
                <input
                  value={sceneForm.title}
                  onChange={(event) => setSceneForm({ ...sceneForm, title: event.target.value })}
                  className="w-full rounded-xl border-2 border-[#172033]/10 px-4 py-3 font-bold outline-none focus:border-[#2f80ed]"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-black text-[#596070]">{isR16 ? 'What happens?' : 'Description'}</span>
                <textarea
                  value={sceneForm.description}
                  onChange={(event) => setSceneForm({ ...sceneForm, description: event.target.value })}
                  rows={4}
                  className="w-full resize-none rounded-xl border-2 border-[#172033]/10 px-4 py-3 font-bold outline-none focus:border-[#2f80ed]"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-sm font-black text-[#596070]">Place</span>
                  <input
                    value={sceneForm.locationType}
                    onChange={(event) => setSceneForm({ ...sceneForm, locationType: event.target.value })}
                    className="w-full rounded-xl border-2 border-[#172033]/10 px-3 py-2 font-bold outline-none focus:border-[#2f80ed]"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-black text-[#596070]">Where</span>
                  <input
                    value={sceneForm.indoorOutdoor}
                    onChange={(event) => setSceneForm({ ...sceneForm, indoorOutdoor: event.target.value })}
                    className="w-full rounded-xl border-2 border-[#172033]/10 px-3 py-2 font-bold outline-none focus:border-[#2f80ed]"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-black text-[#596070]">Feeling</span>
                  <input
                    value={sceneForm.mood}
                    onChange={(event) => setSceneForm({ ...sceneForm, mood: event.target.value })}
                    className="w-full rounded-xl border-2 border-[#172033]/10 px-3 py-2 font-bold outline-none focus:border-[#2f80ed]"
                  />
                </label>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button onClick={() => setEditingScene(null)} className="rounded-xl bg-[#ece4d4] px-5 py-3 font-black text-[#172033]">
                Cancel
              </button>
              <button
                onClick={saveScene}
                disabled={!sceneForm.title.trim() || !sceneForm.description.trim() || updateScene.isPending}
                className="rounded-xl bg-[#2f80ed] px-5 py-3 font-black text-white disabled:opacity-50"
              >
                {updateScene.isPending ? 'Saving...' : 'Save Scene'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingCharacter && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 px-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-5 text-[#172033] shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-wide text-[#2fbf71]">{isR16 ? 'Edit friend' : 'Edit character reference'}</p>
                <h3 className="text-2xl font-black">{editingCharacter.name}</h3>
              </div>
              <button onClick={() => setEditingCharacter(null)} className="rounded-full bg-[#f5f1e8] p-2">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-black text-[#596070]">Name</span>
                  <input
                    value={characterForm.name}
                    onChange={(event) => setCharacterForm({ ...characterForm, name: event.target.value })}
                    className="w-full rounded-xl border-2 border-[#172033]/10 px-4 py-3 font-bold outline-none focus:border-[#2fbf71]"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-black text-[#596070]">Role</span>
                  <input
                    value={characterForm.role}
                    onChange={(event) => setCharacterForm({ ...characterForm, role: event.target.value })}
                    className="w-full rounded-xl border-2 border-[#172033]/10 px-4 py-3 font-bold outline-none focus:border-[#2fbf71]"
                  />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-sm font-black text-[#596070]">Species</span>
                  <input
                    value={characterForm.species}
                    onChange={(event) => setCharacterForm({ ...characterForm, species: event.target.value })}
                    className="w-full rounded-xl border-2 border-[#172033]/10 px-3 py-2 font-bold outline-none focus:border-[#2fbf71]"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-black text-[#596070]">Age</span>
                  <input
                    value={characterForm.ageDescription}
                    onChange={(event) => setCharacterForm({ ...characterForm, ageDescription: event.target.value })}
                    className="w-full rounded-xl border-2 border-[#172033]/10 px-3 py-2 font-bold outline-none focus:border-[#2fbf71]"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-black text-[#596070]">Gender</span>
                  <input
                    value={characterForm.gender}
                    onChange={(event) => setCharacterForm({ ...characterForm, gender: event.target.value })}
                    className="w-full rounded-xl border-2 border-[#172033]/10 px-3 py-2 font-bold outline-none focus:border-[#2fbf71]"
                  />
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-sm font-black text-[#596070]">{isR16 ? 'How should this friend look?' : 'Visual description used in every prompt'}</span>
                <textarea
                  value={characterForm.visualDescription}
                  onChange={(event) => setCharacterForm({ ...characterForm, visualDescription: event.target.value })}
                  rows={5}
                  className="w-full resize-none rounded-xl border-2 border-[#172033]/10 px-4 py-3 font-bold outline-none focus:border-[#2fbf71]"
                />
              </label>
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button onClick={() => setEditingCharacter(null)} className="rounded-xl bg-[#ece4d4] px-5 py-3 font-black text-[#172033]">
                Cancel
              </button>
              <button
                onClick={saveCharacter}
                disabled={!characterForm.name.trim() || !characterForm.visualDescription.trim() || updateCharacterMemory.isPending}
                className="rounded-xl bg-[#2fbf71] px-5 py-3 font-black text-white disabled:opacity-50"
              >
                {updateCharacterMemory.isPending ? 'Saving...' : 'Save Character'}
              </button>
            </div>
          </div>
        </div>
      )}

      {previewPrompt && canUseAdvancedPrompts && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-3xl rounded-2xl bg-[#101827] p-5 text-white shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-wide text-[#ffcf4a]">Advanced prompt preview</p>
                <h3 className="text-2xl font-black">{previewPrompt.provider} v{previewPrompt.version}</h3>
              </div>
              <button onClick={() => setPreviewPrompt(null)} className="rounded-full bg-white/10 p-2">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-black uppercase tracking-wide text-white/40">Prompt</p>
                <textarea readOnly value={previewPrompt.prompt} rows={8} className="w-full resize-none rounded-xl border border-white/10 bg-black/25 p-3 text-sm text-white/80 outline-none" />
              </div>
              {previewPrompt.negativePrompt && (
                <div>
                  <p className="mb-2 text-xs font-black uppercase tracking-wide text-white/40">Negative prompt</p>
                  <textarea readOnly value={previewPrompt.negativePrompt} rows={3} className="w-full resize-none rounded-xl border border-white/10 bg-black/25 p-3 text-sm text-white/80 outline-none" />
                </div>
              )}
              <div className="flex flex-wrap gap-2 text-xs font-bold text-white/60">
                <span className="rounded-full bg-white/10 px-3 py-1">{previewPrompt.outputType}</span>
                <span className="rounded-full bg-white/10 px-3 py-1">{previewPrompt.aspectRatio}</span>
                {previewPrompt.duration && <span className="rounded-full bg-white/10 px-3 py-1">{previewPrompt.duration}s</span>}
              </div>
            </div>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button onClick={() => setPreviewPrompt(null)} className="rounded-xl bg-white/10 px-5 py-3 font-black text-white">
                Close
              </button>
              <button onClick={() => sendPromptToAiStudio(previewPrompt)} className="rounded-xl bg-[#2f80ed] px-5 py-3 font-black text-white">
                Send to AI Studio
              </button>
            </div>
          </div>
        </div>
      )}

      {historyScene && !isR16 && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 px-4">
          <div className="max-h-[88vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-5 text-[#172033] shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-wide text-[#2f80ed]">Image history</p>
                <h3 className="text-2xl font-black">{historyScene.title}</h3>
              </div>
              <button onClick={() => setHistoryScene(null)} className="rounded-full bg-[#f5f1e8] p-2">
                <X size={20} />
              </button>
            </div>

            {(historyScene.assets?.length ?? 0) === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-[#172033]/10 bg-[#fffdf8] p-8 text-center font-bold text-[#596070]">
                No images have been generated for this scene yet.
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {historyScene.assets?.map((asset) => (
                  <div key={asset.id} className="rounded-2xl border-2 border-[#172033]/10 bg-[#fffdf8] p-3">
                    <div
                      className="aspect-[4/5] rounded-xl bg-gradient-to-br from-[#dff8e9] via-[#f6fbff] to-[#ffefb0] bg-cover bg-center"
                      style={asset.assetUrl ? { backgroundImage: `url("${asset.assetUrl}")` } : undefined}
                    />
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className={`rounded-full px-2 py-1 text-xs font-black ${asset.status === 'READY' ? 'bg-[#dff8e9] text-[#145c37]' : asset.status === 'FAILED' ? 'bg-[#ffe3ec] text-[#b13b63]' : 'bg-[#f5f1e8] text-[#596070]'}`}>
                        {asset.isLatest ? 'LATEST' : asset.status}
                      </span>
                      <span className="text-xs font-bold text-[#596070]">{asset.model}</span>
                    </div>
                    <p className="mt-2 text-xs font-semibold text-[#596070]">
                      {new Date(asset.createdAt).toLocaleString()}
                    </p>
                    {asset.errorMessage && (
                      <p className="mt-2 line-clamp-2 text-xs font-bold text-[#b13b63]">{asset.errorMessage}</p>
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
