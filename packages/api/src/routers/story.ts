import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { protectedProcedure, router } from '../trpc';
import { moderatePrompt } from '../lib/promptModeration';
import { storyTextService, type StoryAudienceMode } from '../lib/storyTextService';
import { submitGenerationJob, pollJobStatus, type SupportedModel } from '../lib/generators';
import { deductCredits, refundCredits, MODEL_FEATURE_KEY } from '../lib/credits';
import { mirrorUrlToR2, uploadBufferToR2 } from '../lib/r2';
import { analytics, type StoryAnalyticsEventName } from '../lib/analytics';
import { promptEnhancerService } from '../lib/promptEnhancerService';
import { DEFAULT_R16_STORY_VISUAL_STYLE, DEFAULT_STORY_VISUAL_STYLE, normaliseStoryVisualStyle, styleLabel, stylePromptBlock } from '../lib/storyVisualStyles';
import { GENERATION_PROMPT_MAX_LENGTH, NEGATIVE_PROMPT_MAX_LENGTH } from './generation';

const shotTypeSchema = z.enum(['IMAGE', 'VIDEO']);
const audienceModeSchema = z.enum(['KIDS', 'GENERAL']);
const storyTypeSchema = z.enum(['SHORT_STORY', 'PICTURE_BOOK', 'COMIC', 'VIDEO_STORY']);
const promptOutputTypeSchema = z.enum(['IMAGE', 'SHORT_VIDEO', 'COMIC_PANEL']);
const promptProviderSchema = z.enum(['FLUX', 'WAN_25', 'KLING_I2V', 'KLING_R2V']);
const storyVisualStyleSchema = z.enum([
  'STORYBOOK_ILLUSTRATION',
  'THREE_D_ANIMATED',
  'ANIME',
  'COMIC_BOOK',
  'PHOTOREALISTIC',
  'WATERCOLOR',
  'CLAYMATION',
  'CINEMATIC_FANTASY',
  'AFRICAN_FOLKTALE_ILLUSTRATION',
]);
const directorSettingsSchema = z.object({
  emotion: z.enum(['HAPPY', 'EXCITED', 'CURIOUS', 'BRAVE', 'CALM', 'SAD', 'SURPRISED']).nullable().optional(),
  cameraStyle: z.enum(['CLOSE_UP', 'MEDIUM_SHOT', 'WIDE_SHOT', 'OVER_THE_SHOULDER', 'BIRDS_EYE_VIEW', 'EYE_LEVEL']).nullable().optional(),
  timeOfDay: z.enum(['MORNING', 'AFTERNOON', 'SUNSET', 'NIGHT']).nullable().optional(),
  weather: z.enum(['SUNNY', 'RAINY', 'SNOWY', 'WINDY', 'FOGGY']).nullable().optional(),
  environmentMood: z.enum(['PEACEFUL', 'BUSY', 'MAGICAL', 'FUTURISTIC', 'COZY', 'ADVENTUROUS']).nullable().optional(),
  lighting: z.enum(['BRIGHT', 'WARM', 'SOFT', 'DRAMATIC', 'MOONLIGHT']).nullable().optional(),
  scenePace: z.enum(['CALM', 'NORMAL', 'ENERGETIC']).nullable().optional(),
});
const MAX_STORYBOARD_SHOTS = 24;
const MAX_STORY_BEAT_LENGTH = 700;
const STORY_IDEA_MAX_LENGTH = 240;

const projectSelect = {
  id: true,
  title: true,
  logline: true,
  synopsis: true,
  originalIdea: true,
  genre: true,
  tone: true,
  targetAudience: true,
  audienceMode: true,
  storyType: true,
  ageRange: true,
  theme: true,
  visualStyle: true,
  status: true,
  updatedAt: true,
  createdAt: true,
  _count: {
    select: {
      characters: true,
      environments: true,
      shots: true,
      questions: true,
      chapters: true,
    },
  },
} as const;

function splitBeats(story: string): string[] {
  const beats = story
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((beat) => beat.trim())
    .filter(Boolean);

  return beats.flatMap((beat) => chunkText(beat, MAX_STORY_BEAT_LENGTH)).slice(0, MAX_STORYBOARD_SHOTS);
}

function compactList(values: Array<string | null | undefined>) {
  return values.map((value) => value?.trim()).filter(Boolean).join(', ');
}

function chunkText(text: string, maxLength: number) {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  const words = text.split(/\s+/).filter(Boolean);
  let current = '';

  for (const word of words) {
    if (!current) {
      current = word.slice(0, maxLength);
      continue;
    }
    if (`${current} ${word}`.length > maxLength) {
      chunks.push(current);
      current = word.slice(0, maxLength);
    } else {
      current = `${current} ${word}`;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

function limitText(text: string, maxLength: number) {
  if (text.length <= maxLength) return text;
  const clipped = text.slice(0, maxLength);
  const boundary = Math.max(
    clipped.lastIndexOf('. '),
    clipped.lastIndexOf('; '),
    clipped.lastIndexOf(', '),
    clipped.lastIndexOf(' '),
  );
  return clipped.slice(0, boundary > maxLength * 0.65 ? boundary : maxLength).trim();
}

function buildPrompt(input: {
  title: string;
  beat: string;
  shotType: 'IMAGE' | 'VIDEO';
  visualStyle?: string | null;
  tone?: string | null;
  characters: Array<{ name: string; description: string; visualTraits: string | null }>;
  environments: Array<{ name: string; description: string; mood: string | null; lighting: string | null }>;
}) {
  const cast = compactList(
    input.characters.map((character) =>
      `${character.name}: ${character.visualTraits || character.description}`,
    ),
  );
  const settings = compactList(
    input.environments.map((environment) =>
      `${environment.name}: ${environment.description}${environment.lighting ? `, ${environment.lighting}` : ''}`,
    ),
  );
  const medium = input.shotType === 'IMAGE' ? 'vertical keyframe image' : 'vertical cinematic video clip';

  const prompt = [
    `${medium} for "${input.title}"`,
    `story beat: ${input.beat}`,
    cast ? `characters: ${cast}` : undefined,
    settings ? `environment: ${settings}` : undefined,
    input.visualStyle ? `visual style: ${input.visualStyle}` : undefined,
    input.tone ? `tone: ${input.tone}` : undefined,
    'composition: mobile-first 9:16 framing, clear subject silhouette, strong continuity, high production value',
  ].filter(Boolean).join('. ');

  return limitText(prompt, GENERATION_PROMPT_MAX_LENGTH);
}

async function ensureProject(ctx: { prisma: any; user: { id: string } }, projectId: string) {
  const project = await ctx.prisma.storyProject.findFirst({
    where: { id: projectId, userId: ctx.user.id },
  });
  if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Story project not found' });
  return project;
}

function resolveAudienceMode(ctx: { isR16?: boolean }, requested?: StoryAudienceMode): StoryAudienceMode {
  if (ctx.isR16) return 'KIDS';
  return requested ?? 'GENERAL';
}

async function trackStoryAnalytics(
  ctx: { prisma: any; user?: { id: string } | null; isR16?: boolean },
  input: {
    event: StoryAnalyticsEventName;
    projectId?: string | null;
    audienceMode?: StoryAudienceMode | string | null;
    properties?: Record<string, unknown>;
  },
) {
  await analytics.track(ctx.prisma, {
    event: input.event,
    userId: ctx.user?.id,
    projectId: input.projectId,
    properties: {
      ...input.properties,
      audienceMode: ctx.isR16 ? 'KIDS' : input.audienceMode,
    },
  });
}

function assertKidsSafeIdea(idea: string, audienceMode: StoryAudienceMode) {
  if (audienceMode !== 'KIDS') return;
  const unsafe = /\b(kill|murder|blood|gore|sex|sexy|drugs|suicide|horror|demon|weapon|gun|knife)\b/i;
  if (unsafe.test(idea)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Let us make this a safe story for children. Try an idea about friendship, learning, courage, kindness, or adventure.',
    });
  }
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function directorLabel(value?: string | null) {
  if (!value) return undefined;
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function directorSettingsFromScene(scene: Pick<ScenePromptContext, 'emotion' | 'cameraStyle' | 'timeOfDay' | 'weather' | 'environmentMood' | 'lighting' | 'scenePace'>) {
  return {
    emotion: directorLabel(scene.emotion),
    cameraStyle: directorLabel(scene.cameraStyle),
    timeOfDay: directorLabel(scene.timeOfDay),
    weather: directorLabel(scene.weather),
    environmentMood: directorLabel(scene.environmentMood),
    lighting: directorLabel(scene.lighting),
    scenePace: directorLabel(scene.scenePace),
  };
}

function chapterSelect() {
  return {
    id: true,
    chapterNumber: true,
    title: true,
    summary: true,
    body: true,
    createdAt: true,
  } as const;
}

type CharacterMemoryInput = {
  name: string;
  role?: string;
  species?: string;
  ageDescription?: string;
  gender?: string;
  visualDescription?: string;
  personality?: Record<string, unknown>;
};

type CharacterMemoryRecord = {
  id?: string;
  name: string;
  role?: string | null;
  species?: string | null;
  ageDescription?: string | null;
  gender?: string | null;
  visualDescription?: string | null;
  personality?: unknown;
};

type PromptOutputType = z.infer<typeof promptOutputTypeSchema>;
type PromptProvider = z.infer<typeof promptProviderSchema>;
type ScenePromptContext = {
  id: string;
  title: string;
  description: string;
  locationType?: string | null;
  indoorOutdoor?: string | null;
  mood?: string | null;
  emotion?: string | null;
  cameraStyle?: string | null;
  timeOfDay?: string | null;
  weather?: string | null;
  environmentMood?: string | null;
  lighting?: string | null;
  scenePace?: string | null;
  characters?: unknown;
  project: {
    title: string;
    originalIdea?: string | null;
    audienceMode?: string;
    visualStyle?: string | null;
    theme?: string | null;
  };
};

type SceneImageModel = 'FLUX' | 'GROK_IMAGINE' | 'NANO_BANANA';

const PROMPT_PROVIDER_META: Record<PromptProvider, {
  label: string;
  maxPromptLength: number;
  maxNegativePromptLength: number;
  defaultAspectRatio: '9:16' | '16:9' | '1:1' | '4:3' | '3:4';
  defaultDuration?: number;
}> = {
  FLUX: {
    label: 'Flux.1 Dev',
    maxPromptLength: 1800,
    maxNegativePromptLength: 900,
    defaultAspectRatio: '9:16',
  },
  WAN_25: {
    label: 'Wan 2.6',
    maxPromptLength: 1400,
    maxNegativePromptLength: 900,
    defaultAspectRatio: '9:16',
    defaultDuration: 5,
  },
  KLING_I2V: {
    label: 'Kling I2V',
    maxPromptLength: 1200,
    maxNegativePromptLength: 900,
    defaultAspectRatio: '9:16',
    defaultDuration: 5,
  },
  KLING_R2V: {
    label: 'Kling R2V',
    maxPromptLength: 1200,
    maxNegativePromptLength: 900,
    defaultAspectRatio: '9:16',
    defaultDuration: 5,
  },
};

const SCENE_IMAGE_MODELS = ['FLUX', 'GROK_IMAGINE', 'NANO_BANANA'] as const;

function titleCase(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function inferCharacterFromIdea(idea: string): CharacterMemoryInput {
  const namedPattern = /\b([A-Z][a-zA-Z'-]{1,40})\s+is\s+(?:a|an|the)?\s*([^,.]+)/;
  const named = idea.match(namedPattern);
  if (named) {
    const description = named[2].trim();
    const lower = description.toLowerCase();
    const species = lower.match(/\b(puppy|dog|robot|princess|dragon|boy|girl|child|cat|bird)\b/)?.[1];
    const gender = lower.match(/\b(male|boy)\b/) ? 'male' : lower.match(/\b(female|girl)\b/) ? 'female' : undefined;
    const ageDescription = lower.match(/\b(young|old|little|small|grown-up|wise)\b/)?.[1];

    return {
      name: named[1],
      role: 'main character',
      species: species ? titleCase(species) : undefined,
      gender,
      ageDescription,
      visualDescription: description,
      personality: { traits: ['kind', 'curious', 'brave'] },
    };
  }

  const articleMatch = idea.match(/\b(a|an|the)\s+((?:young|old|little|small|brave|kind|magic|golden|blue|red|green|male|female)\s+){0,5}([a-zA-Z'-]+)\b/i);
  const noun = articleMatch?.[3] ?? idea.split(/\s+/)[0] ?? 'friend';
  const lowerNoun = noun.toLowerCase();
  const defaultName = lowerNoun === 'dog' || lowerNoun === 'puppy' ? 'Max' : titleCase(noun);
  const species = titleCase(noun);
  return {
    name: defaultName,
    role: 'main character',
    species,
    visualDescription: `${defaultName} is a friendly ${lowerNoun}, expressive and easy to recognize in every scene.`,
    personality: { traits: ['kind', 'curious', 'brave'] },
  };
}

function normaliseCharacterMemory(idea: string, generated: CharacterMemoryInput[]): CharacterMemoryInput[] {
  const inferred = inferCharacterFromIdea(idea);
  const byName = new Map<string, CharacterMemoryInput>();

  byName.set(inferred.name.toLowerCase(), inferred);
  for (const character of generated) {
    const key = character.name.toLowerCase();
    const existing = byName.get(key);
    byName.set(key, {
      ...character,
      role: character.role ?? existing?.role,
      species: character.species ?? existing?.species,
      ageDescription: character.ageDescription ?? existing?.ageDescription,
      gender: character.gender ?? existing?.gender,
      visualDescription: character.visualDescription ?? existing?.visualDescription,
      personality: character.personality ?? existing?.personality,
    });
  }

  return Array.from(byName.values()).slice(0, 6);
}

function characterPromptIngredient(character: CharacterMemoryRecord) {
  return [
    `${character.name}`,
    character.role ? `role: ${character.role}` : undefined,
    character.species ? `species: ${character.species}` : undefined,
    character.ageDescription ? `age: ${character.ageDescription}` : undefined,
    character.gender ? `gender: ${character.gender}` : undefined,
    character.visualDescription ? `same look every scene: ${character.visualDescription}` : undefined,
  ].filter(Boolean).join(', ');
}

function characterReferencesFromScene(scene: { characters?: unknown }): Array<{ name: string; promptIngredient: string }> {
  if (!Array.isArray(scene.characters)) return [];
  return scene.characters.flatMap((character) => {
    if (typeof character === 'string') return [{ name: character, promptIngredient: character }];
    if (!character || typeof character !== 'object') return [];
    const record = character as { name?: unknown; promptIngredient?: unknown; visualDescription?: unknown };
    if (typeof record.name !== 'string') return [];
    return [{
      name: record.name,
      promptIngredient: typeof record.promptIngredient === 'string'
        ? record.promptIngredient
        : [record.name, typeof record.visualDescription === 'string' ? record.visualDescription : undefined].filter(Boolean).join(', '),
    }];
  });
}

function outputTypeLabel(outputType: PromptOutputType) {
  if (outputType === 'IMAGE') return 'vertical picture-book illustration';
  if (outputType === 'COMIC_PANEL') return 'single clean comic panel';
  return 'short vertical animated video scene';
}

function automaticNegativePrompt(audienceMode: StoryAudienceMode, outputType: PromptOutputType) {
  const base = [
    'text overlays',
    'watermark',
    'logo',
    'low resolution',
    'blurry',
    'distorted anatomy',
    'inconsistent character identity',
    'extra limbs',
    'scary faces',
    'phone UI',
    'social media UI',
    'gallery UI',
    'shot labels',
    '9:16 labels',
    'watermarks',
    'captions',
    'speech bubbles',
    'visible words',
  ];
  const kids = audienceMode === 'KIDS'
    ? ['violence', 'blood', 'weapons', 'adult themes', 'dark horror', 'sexual content', 'unsafe behavior']
    : ['graphic violence', 'sexual content'];
  const media = outputType === 'SHORT_VIDEO' ? ['flicker', 'warped motion', 'jump cuts'] : ['cropped subject'];
  return [...base, ...kids, ...media].join(', ');
}

function effectiveVisualStyle(project: { visualStyle?: string | null; audienceMode?: string | null }, audienceMode: StoryAudienceMode) {
  return project.visualStyle ?? (audienceMode === 'KIDS' ? DEFAULT_R16_STORY_VISUAL_STYLE : DEFAULT_STORY_VISUAL_STYLE);
}

function composeScenePromptText(input: {
  scene: ScenePromptContext;
  outputType: PromptOutputType;
  provider: PromptProvider;
  audienceMode: StoryAudienceMode;
}) {
  const meta = PROMPT_PROVIDER_META[input.provider];
  const characters = characterReferencesFromScene(input.scene);
  const characterText = characters.length
    ? characters.map((character) => character.promptIngredient).join('; ')
    : 'use the established main character design from the story';
  const settingText = [
    input.scene.locationType ? `setting: ${input.scene.locationType}` : undefined,
    input.scene.indoorOutdoor ? `${input.scene.indoorOutdoor}` : undefined,
  ].filter(Boolean).join(', ');
  const r16Rules = input.audienceMode === 'KIDS'
    ? 'child-safe, warm, friendly, no fear, no violence, no adult themes'
    : 'safe, polished, emotionally clear';
  const providerHint = input.provider === 'FLUX'
    ? 'crisp still image, expressive character, readable silhouette'
    : input.provider.startsWith('KLING')
      ? 'smooth natural motion, stable character identity, clear subject continuity'
      : 'cinematic but gentle movement, stable character identity, simple action';
  const compositionAspect = 'mobile-first 9:16 framing';
  const director = directorSettingsFromScene(input.scene);

  const prompt = [
    `${outputTypeLabel(input.outputType)} for "${input.scene.project.title}"`,
    `scene: ${input.scene.title}`,
    `action: ${input.scene.description}`,
    settingText || undefined,
    input.scene.mood ? `mood: ${input.scene.mood}` : undefined,
    director.emotion ? `directed emotion: ${director.emotion}` : undefined,
    director.cameraStyle ? `camera style: ${director.cameraStyle}` : undefined,
    director.timeOfDay ? `time of day: ${director.timeOfDay}` : undefined,
    director.weather ? `weather: ${director.weather}` : undefined,
    director.environmentMood ? `environment feeling: ${director.environmentMood}` : undefined,
    director.lighting ? `lighting: ${director.lighting}` : undefined,
    director.scenePace ? `scene pace for future video: ${director.scenePace}` : undefined,
    `characters, keep exact identity: ${characterText}`,
    `visual style: ${stylePromptBlock(effectiveVisualStyle(input.scene.project, input.audienceMode))}`,
    input.scene.project.theme ? `theme: ${input.scene.project.theme}` : undefined,
    `safety: ${r16Rules}`,
    `provider guidance: ${providerHint}`,
    `composition: ${compositionAspect}, clear foreground subject, uncluttered background`,
  ].filter(Boolean).join('. ');

  return {
    prompt: limitText(prompt, meta.maxPromptLength),
    negativePrompt: limitText(automaticNegativePrompt(input.audienceMode, input.outputType), meta.maxNegativePromptLength),
    aspectRatio: meta.defaultAspectRatio,
    duration: input.outputType === 'SHORT_VIDEO' ? meta.defaultDuration ?? 5 : undefined,
    maxPromptLength: meta.maxPromptLength,
    providerLabel: meta.label,
    styleUsed: styleLabel(effectiveVisualStyle(input.scene.project, input.audienceMode)),
    director,
    providerHints: {
      camera: input.outputType === 'SHORT_VIDEO' ? 'stable gentle motion' : 'single clean keyframe',
      lighting: 'warm, clear, style-consistent lighting',
      composition: 'mobile-first 9:16 framing, no text or UI',
    },
  };
}

async function composeEnhancedScenePrompt(
  ctx: any,
  input: {
    scene: ScenePromptContext;
    outputType: PromptOutputType;
    provider: PromptProvider;
    audienceMode: StoryAudienceMode;
    projectId: string;
    analyticsSource: 'preview' | 'generation';
  },
) {
  const base = composeScenePromptText(input);
  const meta = PROMPT_PROVIDER_META[input.provider];
  const characters = characterReferencesFromScene(input.scene);
  const characterIdentity = characters.length
    ? characters.map((character) => character.promptIngredient).join('; ')
    : 'use the established main character design from the story';
  await trackStoryAnalytics(ctx, {
    event: 'prompt_enhancement_started',
    projectId: input.projectId,
    audienceMode: input.audienceMode,
    properties: {
      style: base.styleUsed,
      provider: input.provider,
      generationType: input.outputType === 'SHORT_VIDEO' ? 'VIDEO' : 'IMAGE',
      source: input.analyticsSource,
      enhancerConfigured: promptEnhancerService.isConfigured,
    },
  });

  try {
    const enhanced = await promptEnhancerService.enhance({
      basePrompt: base.prompt,
      baseNegativePrompt: base.negativePrompt,
      maxPromptLength: base.maxPromptLength,
      maxNegativePromptLength: meta.maxNegativePromptLength,
      scene: { ...input.scene, ...base.director },
      project: input.scene.project,
      characterIdentity,
      selectedVisualStyle: effectiveVisualStyle(input.scene.project, input.audienceMode),
      audienceMode: input.audienceMode,
      provider: input.provider,
      generationType: input.outputType === 'SHORT_VIDEO' ? 'VIDEO' : 'IMAGE',
    });

    if (enhanced.fallbackReason && promptEnhancerService.isConfigured) {
      await trackStoryAnalytics(ctx, {
        event: 'prompt_enhancement_failed',
        projectId: input.projectId,
        audienceMode: input.audienceMode,
        properties: {
          style: base.styleUsed,
          provider: input.provider,
          generationType: input.outputType === 'SHORT_VIDEO' ? 'VIDEO' : 'IMAGE',
          source: input.analyticsSource,
          message: enhanced.fallbackReason,
        },
      });
    }

    await trackStoryAnalytics(ctx, {
      event: 'prompt_enhancement_completed',
      projectId: input.projectId,
      audienceMode: input.audienceMode,
      properties: {
        style: enhanced.styleUsed,
        provider: input.provider,
        generationType: input.outputType === 'SHORT_VIDEO' ? 'VIDEO' : 'IMAGE',
        source: input.analyticsSource,
        enhancerProvider: enhanced.provider,
        enhancerModel: enhanced.model,
      },
    });

    return {
      ...base,
      deterministicPrompt: base.prompt,
      prompt: enhanced.enhancedPrompt,
      negativePrompt: enhanced.negativePrompt,
      styleUsed: enhanced.styleUsed,
      providerHints: enhanced.providerHints,
      enhancerProvider: enhanced.provider,
      enhancerModel: enhanced.model,
      safetyNotes: enhanced.safetyNotes,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Prompt enhancement failed';
    await trackStoryAnalytics(ctx, {
      event: 'prompt_enhancement_failed',
      projectId: input.projectId,
      audienceMode: input.audienceMode,
      properties: {
        style: base.styleUsed,
        provider: input.provider,
        generationType: input.outputType === 'SHORT_VIDEO' ? 'VIDEO' : 'IMAGE',
        source: input.analyticsSource,
        message,
      },
    });
    return {
      ...base,
      deterministicPrompt: base.prompt,
      enhancerProvider: 'deterministic-fallback',
      enhancerModel: undefined,
      safetyNotes: 'Prompt enhancer failed; deterministic prompt composer used.',
    };
  }
}

function imageDimensions(aspectRatio: string) {
  if (aspectRatio === '9:16') return { width: 720, height: 1280 };
  if (aspectRatio === '16:9') return { width: 1344, height: 768 };
  if (aspectRatio === '4:3') return { width: 1024, height: 768 };
  if (aspectRatio === '3:4') return { width: 768, height: 1024 };
  if (aspectRatio === '1:1') return { width: 1024, height: 1024 };
  return { width: 720, height: 1280 };
}

function sceneImageProviderInfo(requestedModel: SceneImageModel, providerJobId?: string | null) {
  if (requestedModel === 'FLUX') {
    if (providerJobId?.startsWith('portrait:')) {
      return {
        provider: 'RunPod',
        model: process.env.RUNPOD_FLUX_PORTRAIT_ENDPOINT ?? 'z-image-turbo',
        requestedModel,
      };
    }
    return {
      provider: 'RunPod',
      model: process.env.RUNPOD_FLUX_PUBLIC_ENDPOINT ?? 'black-forest-labs-flux-1-dev',
      requestedModel,
    };
  }

  return {
    provider: requestedModel,
    model: requestedModel,
    requestedModel,
  };
}

async function waitForGenerationOutput(model: SupportedModel, providerJobId: string, immediateUrl?: string) {
  if (immediateUrl) return immediateUrl;
  const started = Date.now();
  const timeoutMs = 180_000;
  while (Date.now() - started < timeoutMs) {
    const status = await pollJobStatus(model, providerJobId);
    if (status.status === 'completed' && status.outputUrl) return status.outputUrl;
    if (status.status === 'failed') throw new Error(status.error ?? 'Image generation failed');
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error('Image generation is taking longer than expected. Please try again.');
}

function devSceneSvgDataUrl(sceneTitle: string, characterName: string) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="768" height="1344" viewBox="0 0 768 1344">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#dff8e9"/>
          <stop offset="0.5" stop-color="#f6fbff"/>
          <stop offset="1" stop-color="#ffefb0"/>
        </linearGradient>
      </defs>
      <rect width="768" height="1344" fill="url(#bg)"/>
      <circle cx="384" cy="500" r="150" fill="#ffffff" opacity="0.82"/>
      <text x="384" y="480" text-anchor="middle" font-family="Arial" font-size="56" font-weight="800" fill="#172033">${characterName}</text>
      <text x="384" y="570" text-anchor="middle" font-family="Arial" font-size="40" font-weight="700" fill="#2f80ed">${sceneTitle}</text>
      <text x="384" y="1190" text-anchor="middle" font-family="Arial" font-size="30" font-weight="700" fill="#596070">Development placeholder</text>
    </svg>
  `.trim();
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

async function generateSceneImageAsset(
  ctx: any,
  input: { projectId: string; sceneId: string; model: SceneImageModel; isRegeneration?: boolean },
) {
  const project = await ctx.prisma.storyProject.findFirst({
    where: { id: input.projectId, userId: ctx.user.id },
  });
  if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Story project not found' });

  const scene = await (ctx.prisma as any).storySceneSeed.findFirst({
    where: { id: input.sceneId, projectId: input.projectId },
    include: {
      project: {
        select: {
          title: true,
          originalIdea: true,
          audienceMode: true,
          visualStyle: true,
          theme: true,
        },
      },
      prompts: {
        where: { outputType: 'IMAGE', provider: 'FLUX' },
        orderBy: { version: 'desc' },
        take: 1,
      },
    },
  });
  if (!scene) throw new TRPCError({ code: 'NOT_FOUND', message: 'Story scene not found' });

  const audienceMode = resolveAudienceMode(ctx, project.audienceMode as StoryAudienceMode);
  await trackStoryAnalytics(ctx, {
    event: 'scene_image_started',
    projectId: project.id,
    audienceMode,
    properties: { sceneId: scene.id, model: input.model, isRegeneration: Boolean(input.isRegeneration) },
  });
  const composed = await composeEnhancedScenePrompt(ctx, {
    scene,
    outputType: 'IMAGE',
    provider: 'FLUX',
    audienceMode,
    projectId: project.id,
    analyticsSource: 'generation',
  });

  const moderation = await moderatePrompt(composed.prompt);
  if (!moderation.allowed) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: moderation.reason ?? 'Please try a safer picture idea.' });
  }

  const asset = await (ctx.prisma as any).storySceneAsset.create({
    data: {
      sceneId: scene.id,
      projectId: project.id,
      userId: ctx.user.id,
      assetType: 'IMAGE',
      provider: input.model === 'FLUX' ? 'RunPod' : input.model,
      model: input.model,
      promptVersionId: null,
      composedPrompt: composed.prompt,
      negativePrompt: composed.negativePrompt,
      status: 'GENERATING',
      isLatest: false,
    },
  });

  await (ctx.prisma as any).storySceneSeed.update({
    where: { id: scene.id },
    data: { imageStatus: 'GENERATING' },
  });

  const featureKey = MODEL_FEATURE_KEY[input.model as SupportedModel];
  let creditsUsed = 0;
  const generationRef = `story-scene-asset-${asset.id}`;

  try {
    if (featureKey) {
      creditsUsed = await deductCredits(ctx.prisma, ctx.user.id, featureKey, generationRef, `Story scene image: ${scene.title}`);
    }

    await trackStoryAnalytics(ctx, {
      event: 'generation_started_with_enhanced_prompt',
      projectId: project.id,
      audienceMode,
      properties: {
        sceneId: scene.id,
        assetId: asset.id,
        style: composed.styleUsed,
        provider: input.model,
        generationType: 'IMAGE',
        enhancerProvider: composed.enhancerProvider,
      },
    });

    const generationJob = await ctx.prisma.generationJob.create({
      data: {
        userId: ctx.user.id,
        model: input.model,
        prompt: composed.prompt,
        negativePrompt: composed.negativePrompt,
        duration: 5,
        aspectRatio: composed.aspectRatio ?? '9:16',
        status: 'QUEUED',
        creditsUsed: creditsUsed || 0,
        metadata: {
          storyProjectId: project.id,
          storySceneId: scene.id,
          storySceneAssetId: asset.id,
          deterministicPrompt: composed.deterministicPrompt,
          visualStyle: normaliseStoryVisualStyle(project.visualStyle),
          visualStyleLabel: composed.styleUsed,
          director: composed.director,
          promptEnhancerProvider: composed.enhancerProvider,
          promptEnhancerModel: composed.enhancerModel,
          providerHints: composed.providerHints,
        },
      },
    });

    let providerOutputUrl: string;
    let providerJobId: string | undefined;
    if (!process.env.RUNPOD_API_KEY && input.model === 'FLUX' && process.env.NODE_ENV !== 'production') {
      providerJobId = `dev-placeholder-${asset.id}`;
      providerOutputUrl = devSceneSvgDataUrl(scene.title, characterReferencesFromScene(scene)[0]?.name ?? 'Story Friend');
    } else {
      const submitted = await submitGenerationJob({
        model: input.model as SupportedModel,
        prompt: composed.prompt,
        negativePrompt: composed.negativePrompt,
        aspectRatio: composed.aspectRatio,
      });
      providerJobId = submitted.providerJobId;
      const providerInfo = sceneImageProviderInfo(input.model, providerJobId);
      await ctx.prisma.generationJob.update({
        where: { id: generationJob.id },
        data: {
          providerJobId,
          status: submitted.outputUrl ? 'COMPLETED' : 'GENERATING',
          outputUrl: submitted.outputUrl,
          thumbnailUrl: submitted.thumbnailUrl,
          metadata: {
            ...(generationJob.metadata as Record<string, unknown>),
            requestedModel: providerInfo.requestedModel,
            actualProvider: providerInfo.provider,
            actualProviderModel: providerInfo.model,
          },
        },
      });
      providerOutputUrl = await waitForGenerationOutput(input.model as SupportedModel, providerJobId, submitted.outputUrl);
    }
    const providerInfo = sceneImageProviderInfo(input.model, providerJobId);

    const r2Key = `story-projects/${project.id}/scenes/${scene.id}/assets/${asset.id}.png`;
    const assetUrl = providerOutputUrl.startsWith('data:')
      ? (await uploadBufferToR2(Buffer.from(providerOutputUrl.split(',')[1] ?? '', 'base64'), r2Key, 'image/png')) ?? providerOutputUrl
      : await mirrorUrlToR2(providerOutputUrl, r2Key, 'image/png');
    const dimensions = imageDimensions(composed.aspectRatio ?? '9:16');

    await ctx.prisma.$transaction(async (tx: any) => {
      await tx.storySceneAsset.updateMany({ where: { sceneId: scene.id, assetType: 'IMAGE' }, data: { isLatest: false } });
      await tx.storySceneAsset.update({
        where: { id: asset.id },
        data: {
          status: 'READY',
          assetUrl,
          thumbnailUrl: assetUrl,
          r2Key,
          provider: providerInfo.provider,
          model: providerInfo.model,
          width: dimensions.width,
          height: dimensions.height,
          generationJobId: generationJob.id,
          isLatest: true,
        },
      });
      await tx.storySceneSeed.update({
        where: { id: scene.id },
        data: { latestImageAssetId: asset.id, imageStatus: 'READY', imageUrl: assetUrl },
      });
      await tx.generationJob.update({
        where: { id: generationJob.id },
        data: {
          providerJobId,
          outputUrl: assetUrl,
          thumbnailUrl: assetUrl,
          status: 'COMPLETED',
          metadata: {
            ...(generationJob.metadata as Record<string, unknown>),
            requestedModel: providerInfo.requestedModel,
            actualProvider: providerInfo.provider,
            actualProviderModel: providerInfo.model,
          },
        },
      });
    });

    await trackStoryAnalytics(ctx, {
      event: 'scene_image_completed',
      projectId: project.id,
      audienceMode,
      properties: {
        sceneId: scene.id,
        assetId: asset.id,
        requestedModel: input.model,
        model: providerInfo.model,
        provider: providerInfo.provider,
        r2Key,
        isRegeneration: Boolean(input.isRegeneration),
        style: composed.styleUsed,
        enhancerProvider: composed.enhancerProvider,
      },
    });
    if (input.isRegeneration) {
      await trackStoryAnalytics(ctx, {
        event: 'scene_image_regenerated',
        projectId: project.id,
        audienceMode,
        properties: { sceneId: scene.id, assetId: asset.id, model: input.model },
      });
      if (scene.directorChangedAt) {
        await trackStoryAnalytics(ctx, {
          event: 'regeneration_after_director_change',
          projectId: project.id,
          audienceMode,
          properties: {
            sceneId: scene.id,
            assetId: asset.id,
            requestedModel: input.model,
            model: providerInfo.model,
            provider: providerInfo.provider,
            director: composed.director,
          },
        });
      }
    }

    return {
      scene: await ctx.prisma.storySceneSeed.findFirst({
        where: { id: scene.id },
        include: { assets: { orderBy: { createdAt: 'desc' }, take: 12 }, prompts: { orderBy: { createdAt: 'desc' }, take: 6 } },
      }),
      asset: await (ctx.prisma as any).storySceneAsset.findUnique({ where: { id: asset.id } }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Picture generation failed. Please try again.';
    await trackStoryAnalytics(ctx, {
      event: 'scene_image_failed',
      projectId: project.id,
      audienceMode,
      properties: {
        sceneId: scene.id,
        assetId: asset.id,
        model: input.model,
        isRegeneration: Boolean(input.isRegeneration),
        message,
      },
    });
    await (ctx.prisma as any).storySceneAsset.update({
      where: { id: asset.id },
      data: { status: 'FAILED', errorMessage: message, isLatest: false },
    }).catch(() => {});
    await (ctx.prisma as any).storySceneSeed.update({ where: { id: scene.id }, data: { imageStatus: 'FAILED' } }).catch(() => {});
    if (creditsUsed > 0 && featureKey) {
      await refundCredits(ctx.prisma, ctx.user.id, creditsUsed, featureKey, generationRef, 'Refund: story scene image failed').catch(() => {});
    }
    return {
      scene: await (ctx.prisma as any).storySceneSeed.findFirst({ where: { id: scene.id } }),
      asset: await (ctx.prisma as any).storySceneAsset.findUnique({ where: { id: asset.id } }),
    };
  }
}

function sceneCharacterReferences(characters: CharacterMemoryRecord[]) {
  return characters.map((character) => ({
    id: character.id ?? null,
    name: character.name,
    role: character.role ?? null,
    visualDescription: character.visualDescription ?? null,
    promptIngredient: characterPromptIngredient(character),
  }));
}

function inferSceneCharacters(project: {
  title: string;
  originalIdea?: string | null;
  characterMemory?: CharacterMemoryRecord[];
}) {
  if (project.characterMemory?.length) return sceneCharacterReferences(project.characterMemory).slice(0, 4);
  const source = project.originalIdea ?? project.title;
  const inferred = inferCharacterFromIdea(source);
  return sceneCharacterReferences([inferred]);
}

function buildSimpleScenes(project: {
  title: string;
  originalIdea?: string | null;
  audienceMode?: string;
  chapters: Array<{ title: string; summary: string; body: string }>;
  characterMemory?: CharacterMemoryRecord[];
}) {
  const idea = (project.originalIdea ?? project.title).toLowerCase();
  const isSchoolStory = /\bschool|classroom|teacher|student|bus\b/i.test(idea);
  const characters = inferSceneCharacters(project);
  const primaryName = characters[0]?.name ?? 'Main character';
  const firstChapter = project.chapters[0];
  const storyText = [firstChapter?.summary, firstChapter?.body].filter(Boolean).join(' ');

  if (isSchoolStory) {
    return [
      {
        title: 'Home',
        description: `${primaryName} gets ready for a big school day.`,
        locationType: 'home',
        indoorOutdoor: 'indoor',
        mood: 'warm',
        characters,
      },
      {
        title: 'Road to School',
        description: `${primaryName} travels toward school and notices the world waking up.`,
        locationType: 'road',
        indoorOutdoor: 'outdoor',
        mood: 'curious',
        characters,
      },
      {
        title: 'School Gate',
        description: `${primaryName} arrives at the school gate and meets friendly faces.`,
        locationType: 'school gate',
        indoorOutdoor: 'outdoor',
        mood: 'hopeful',
        characters,
      },
      {
        title: 'Classroom',
        description: `${primaryName} enters class and tries something new with courage.`,
        locationType: 'classroom',
        indoorOutdoor: 'indoor',
        mood: 'bright',
        characters,
      },
      {
        title: 'Problem',
        description: `${primaryName} faces a small challenge and chooses a kind way to solve it.`,
        locationType: 'school',
        indoorOutdoor: 'indoor or outdoor',
        mood: 'brave',
        characters,
      },
      {
        title: 'Happy Ending',
        description: `${primaryName} ends the day proud, happy, and surrounded by friends.`,
        locationType: 'school',
        indoorOutdoor: 'indoor or outdoor',
        mood: 'happy',
        characters,
      },
    ];
  }

  return [
    {
      title: 'Beginning',
      description: `${primaryName} starts the adventure in a familiar place.`,
      locationType: 'home or neighborhood',
      indoorOutdoor: 'indoor or outdoor',
      mood: 'warm',
      characters,
    },
    {
      title: 'First Step',
      description: `${primaryName} follows a new idea and moves into the story world.`,
      locationType: 'pathway',
      indoorOutdoor: 'outdoor',
      mood: 'curious',
      characters,
    },
    {
      title: 'New Friend',
      description: `${primaryName} meets someone helpful or discovers a friendly clue.`,
      locationType: 'meeting place',
      indoorOutdoor: 'indoor or outdoor',
      mood: 'friendly',
      characters,
    },
    {
      title: 'Discovery',
      description: storyText ? limitText(storyText, 220) : `${characters[0]} discovers what the adventure is really about.`,
      locationType: 'story setting',
      indoorOutdoor: 'indoor or outdoor',
      mood: 'wonder',
      characters,
    },
    {
      title: 'Problem',
      description: `${primaryName} faces a small challenge and stays kind while solving it.`,
      locationType: 'story setting',
      indoorOutdoor: 'indoor or outdoor',
      mood: 'brave',
      characters,
    },
    {
      title: 'Happy Ending',
      description: `${primaryName} learns something good and finishes the story with hope.`,
      locationType: 'safe place',
      indoorOutdoor: 'indoor or outdoor',
      mood: 'happy',
      characters,
    },
  ];
}

function textSegmentsFromChapters(chapters: Array<{ title: string; summary: string; body: string }>, pageCount: number) {
  const sentences = chapters
    .flatMap((chapter) => [chapter.summary, chapter.body])
    .filter(Boolean)
    .join(' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (sentences.length === 0) return [];

  const pages: string[] = [];
  const perPage = Math.max(1, Math.ceil(sentences.length / Math.max(1, pageCount)));
  for (let index = 0; index < pageCount; index += 1) {
    const slice = sentences.slice(index * perPage, (index + 1) * perPage);
    pages.push(limitText(slice.join(' '), 420));
  }
  return pages;
}

function primaryCharacterName(characterMemory: CharacterMemoryRecord[] | undefined, scenes: Array<{ characters?: unknown }>) {
  if (characterMemory?.[0]?.name) return characterMemory[0].name;
  for (const scene of scenes) {
    const first = characterReferencesFromScene(scene)[0]?.name;
    if (first) return first;
  }
  return null;
}

function buildStoryBookResponse(project: any) {
  const scenes = [...(project.sceneSeeds ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
  const chapters = [...(project.chapters ?? [])].sort((a, b) => a.chapterNumber - b.chapterNumber);
  const textSegments = textSegmentsFromChapters(chapters, scenes.length);
  const pages = scenes.map((scene, index) => {
    const latestAsset = scene.assets?.find((asset: any) => asset.isLatest && asset.status === 'READY')
      ?? scene.assets?.find((asset: any) => asset.status === 'READY')
      ?? null;
    const imageUrl = scene.imageUrl ?? latestAsset?.assetUrl ?? null;
    return {
      pageNumber: index + 1,
      sceneId: scene.id,
      imageUrl,
      title: scene.title,
      text: textSegments[index] || scene.description,
      imageAlt: imageUrl ? `${scene.title} illustration` : `Illustration coming soon for ${scene.title}`,
    };
  });
  const mainCharacter = primaryCharacterName(project.characterMemory, scenes);

  return {
    project: {
      id: project.id,
      title: project.title,
      theme: project.theme,
      ageRange: project.ageRange,
      audienceMode: project.audienceMode,
      mainCharacter,
    },
    coverImage: pages.find((page) => page.imageUrl)?.imageUrl ?? null,
    pageCount: pages.length,
    pages,
  };
}

export const storyRouter = router({
  createSpark: protectedProcedure
    .input(z.object({
      idea: z.string().min(3).max(STORY_IDEA_MAX_LENGTH),
      audienceMode: audienceModeSchema.optional(),
      storyType: storyTypeSchema.default('SHORT_STORY'),
      visualStyle: storyVisualStyleSchema.optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const idea = input.idea.trim();
      const audienceMode = resolveAudienceMode(ctx, input.audienceMode);
      assertKidsSafeIdea(idea, audienceMode);

      const moderation = await moderatePrompt(idea);
      if (!moderation.allowed) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: moderation.reason ?? 'Please try a safer story idea.',
        });
      }

      const project = await ctx.prisma.storyProject.create({
        data: {
          userId: ctx.user.id,
          title: idea,
          originalIdea: idea,
          logline: idea,
          synopsis: '',
          targetAudience: audienceMode === 'KIDS' ? 'children and families' : 'general audience',
          audienceMode,
          storyType: input.storyType,
          visualStyle: normaliseStoryVisualStyle(input.visualStyle ?? (audienceMode === 'KIDS' ? DEFAULT_R16_STORY_VISUAL_STYLE : DEFAULT_STORY_VISUAL_STYLE)),
          status: 'DRAFT',
        },
        select: projectSelect,
      });
      await trackStoryAnalytics(ctx, {
        event: 'story_spark_started',
        projectId: project.id,
        audienceMode,
        properties: { storyType: input.storyType, style: styleLabel(input.visualStyle) },
      });
      await trackStoryAnalytics(ctx, {
        event: 'visual_style_selected',
        projectId: project.id,
        audienceMode,
        properties: { style: styleLabel(input.visualStyle), source: 'story_spark' },
      });
      return project;
    }),

  generateQuestions: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const project = await ensureProject(ctx, input.projectId);
      const audienceMode = resolveAudienceMode(ctx, project.audienceMode as StoryAudienceMode);
      const idea = project.originalIdea ?? project.logline ?? project.title;
      assertKidsSafeIdea(idea, audienceMode);

      const questions = await storyTextService.generateGuidedQuestions(idea, audienceMode);

      await ctx.prisma.storyQuestion.deleteMany({ where: { projectId: project.id } });
      const createdQuestions = await ctx.prisma.$transaction(
        questions.slice(0, 6).map((question, index) =>
          ctx.prisma.storyQuestion.create({
            data: {
              projectId: project.id,
              questionText: question.questionText,
              answerOptions: question.answerOptions,
              orderIndex: index + 1,
            },
          }),
        ),
      );
      await trackStoryAnalytics(ctx, {
        event: 'story_questions_generated',
        projectId: project.id,
        audienceMode,
        properties: { questionCount: createdQuestions.length },
      });
      return createdQuestions;
    }),

  answerQuestion: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      questionId: z.string(),
      selectedAnswer: z.string().min(1).max(120),
    }))
    .mutation(async ({ ctx, input }) => {
      await ensureProject(ctx, input.projectId);
      const question = await ctx.prisma.storyQuestion.findFirst({
        where: { id: input.questionId, projectId: input.projectId },
      });
      if (!question) throw new TRPCError({ code: 'NOT_FOUND', message: 'Story question not found' });

      const options = asStringArray(question.answerOptions);
      if (options.length > 0 && !options.includes(input.selectedAnswer)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Choose one of the answer buttons.' });
      }

      const updatedQuestion = await ctx.prisma.storyQuestion.update({
        where: { id: input.questionId },
        data: { selectedAnswer: input.selectedAnswer },
      });
      const [answeredCount, totalCount, project] = await Promise.all([
        ctx.prisma.storyQuestion.count({
          where: { projectId: input.projectId, selectedAnswer: { not: null } },
        }),
        ctx.prisma.storyQuestion.count({ where: { projectId: input.projectId } }),
        ctx.prisma.storyProject.findFirst({
          where: { id: input.projectId, userId: ctx.user.id },
          select: { audienceMode: true },
        }),
      ]);
      if (totalCount > 0 && answeredCount >= totalCount) {
        await trackStoryAnalytics(ctx, {
          event: 'story_questions_completed',
          projectId: input.projectId,
          audienceMode: project?.audienceMode,
          properties: { questionCount: totalCount },
        });
      }
      return updatedQuestion;
    }),

  generateStory: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.prisma.storyProject.findFirst({
        where: { id: input.projectId, userId: ctx.user.id },
        include: {
          questions: { orderBy: { orderIndex: 'asc' } },
        },
      });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Story project not found' });

      const audienceMode = resolveAudienceMode(ctx, project.audienceMode as StoryAudienceMode);
      const idea = project.originalIdea ?? project.logline ?? project.title;
      assertKidsSafeIdea(idea, audienceMode);

      const moderation = await moderatePrompt(idea);
      if (!moderation.allowed) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: moderation.reason ?? 'Please try a safer story idea.' });
      }

      const answers = project.questions
        .filter((question) => question.selectedAnswer)
        .map((question) => ({
          questionText: question.questionText,
          selectedAnswer: question.selectedAnswer!,
        }));

      const story = await storyTextService.generateStory(idea, answers, audienceMode);
      const characterMemory = normaliseCharacterMemory(idea, story.characterMemory);
      const chapter = await ctx.prisma.$transaction(async (tx: any) => {
        await tx.storyChapter.deleteMany({ where: { projectId: project.id } });
        await tx.storySceneSeed.deleteMany({ where: { projectId: project.id } });
        await tx.storyCharacterMemory.deleteMany({ where: { projectId: project.id } });

        const createdChapter = await tx.storyChapter.create({
          data: {
            projectId: project.id,
            chapterNumber: 1,
            title: story.title,
            summary: story.summary,
            body: story.body,
            generationPrompt: idea,
            providerMetadata: story.providerMetadata ?? {},
          },
        });

        await Promise.all([
          ...characterMemory.map((character) =>
            tx.storyCharacterMemory.create({
              data: {
                projectId: project.id,
                name: character.name,
                role: character.role,
                species: character.species,
                ageDescription: character.ageDescription,
                gender: character.gender,
                visualDescription: character.visualDescription,
                personality: character.personality ?? {},
              },
            }),
          ),
          ...story.sceneHints.map((scene, index) =>
            tx.storySceneSeed.create({
              data: {
                projectId: project.id,
                chapterId: createdChapter.id,
                orderIndex: index + 1,
                title: scene.title,
                description: scene.description,
                locationType: scene.locationType,
                indoorOutdoor: scene.indoorOutdoor,
                mood: scene.mood,
                characters: scene.characters ?? [],
              },
            }),
          ),
        ]);

        await tx.storyProject.update({
          where: { id: project.id },
          data: {
            title: story.title,
            synopsis: story.body,
            ageRange: story.ageRange,
            theme: story.theme,
            targetAudience: audienceMode === 'KIDS' ? `Kids ${story.ageRange}` : story.ageRange,
            status: 'GENERATED',
          },
        });

        return createdChapter;
      });

      await trackStoryAnalytics(ctx, {
        event: 'story_generated',
        projectId: project.id,
        audienceMode,
        properties: {
          chapterId: chapter.id,
          theme: story.theme,
          ageRange: story.ageRange,
          sceneHintCount: story.sceneHints.length,
          characterCount: characterMemory.length,
        },
      });
      return chapter;
    }),

  generateCharacterBible: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      replaceExisting: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.prisma.storyProject.findFirst({
        where: { id: input.projectId, userId: ctx.user.id },
        include: {
          chapters: { orderBy: { chapterNumber: 'asc' } },
          characterMemory: { orderBy: { createdAt: 'asc' } },
        },
      });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Story project not found' });
      if (!input.replaceExisting && project.characterMemory.length > 0) return project.characterMemory;

      const idea = project.originalIdea ?? project.logline ?? project.title;
      const storyText = project.chapters.map((chapter) => `${chapter.title}\n${chapter.summary}\n${chapter.body}`).join('\n\n');
      const characterSeeds = normaliseCharacterMemory(idea, [
        {
          ...inferCharacterFromIdea(idea),
          visualDescription: `${inferCharacterFromIdea(idea).visualDescription}. Story context: ${limitText(storyText || idea, 220)}`,
        },
      ]);

      const characters = await ctx.prisma.$transaction(async (tx: any) => {
        if (input.replaceExisting) {
          await tx.storyCharacterMemory.deleteMany({ where: { projectId: project.id } });
        }

        return Promise.all(characterSeeds.map((character) =>
          tx.storyCharacterMemory.create({
            data: {
              projectId: project.id,
              name: character.name,
              role: character.role,
              species: character.species,
              ageDescription: character.ageDescription,
              gender: character.gender,
              visualDescription: character.visualDescription,
              personality: character.personality ?? {},
            },
          }),
        ));
      });
      await trackStoryAnalytics(ctx, {
        event: 'character_bible_generated',
        projectId: project.id,
        audienceMode: project.audienceMode,
        properties: { characterCount: characters.length, replaceExisting: input.replaceExisting },
      });
      return characters;
    }),

  updateCharacterMemory: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      characterId: z.string(),
      name: z.string().min(1).max(80),
      role: z.string().max(80).optional(),
      species: z.string().max(80).optional(),
      ageDescription: z.string().max(120).optional(),
      gender: z.string().max(80).optional(),
      visualDescription: z.string().min(1).max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      await ensureProject(ctx, input.projectId);
      const character = await ctx.prisma.storyCharacterMemory.findFirst({
        where: { id: input.characterId, projectId: input.projectId },
      });
      if (!character) throw new TRPCError({ code: 'NOT_FOUND', message: 'Story character not found' });

      const updatedCharacter = await ctx.prisma.storyCharacterMemory.update({
        where: { id: input.characterId },
        data: {
          name: input.name,
          role: input.role || null,
          species: input.species || null,
          ageDescription: input.ageDescription || null,
          gender: input.gender || null,
          visualDescription: input.visualDescription,
        },
      });
      await trackStoryAnalytics(ctx, {
        event: 'character_bible_edited',
        projectId: input.projectId,
        properties: { characterId: input.characterId, characterName: input.name },
      });
      return updatedCharacter;
    }),

  continueStory: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.prisma.storyProject.findFirst({
        where: { id: input.projectId, userId: ctx.user.id },
        include: {
          chapters: { orderBy: { chapterNumber: 'asc' } },
        },
      });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Story project not found' });
      if (project.chapters.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Create the first story chapter before continuing.' });
      }

      const audienceMode = resolveAudienceMode(ctx, project.audienceMode as StoryAudienceMode);
      const story = await storyTextService.continueStory({
        projectTitle: project.title,
        originalIdea: project.originalIdea ?? project.logline ?? project.title,
        previousChapters: project.chapters.map((chapter) => ({
          chapterNumber: chapter.chapterNumber,
          title: chapter.title,
          summary: chapter.summary,
          body: chapter.body,
        })),
        audienceMode,
      });
      const nextNumber = project.chapters.length + 1;

      const chapter = await ctx.prisma.$transaction(async (tx: any) => {
        const chapter = await tx.storyChapter.create({
          data: {
            projectId: project.id,
            chapterNumber: nextNumber,
            title: story.title,
            summary: story.summary,
            body: story.body,
            generationPrompt: `Continue ${project.title}`,
            providerMetadata: story.providerMetadata ?? {},
          },
        });

        await Promise.all(story.sceneHints.map((scene, index) =>
          tx.storySceneSeed.create({
            data: {
              projectId: project.id,
              chapterId: chapter.id,
              orderIndex: project.chapters.length * 10 + index + 1,
              title: scene.title,
              description: scene.description,
              locationType: scene.locationType,
              indoorOutdoor: scene.indoorOutdoor,
              mood: scene.mood,
              characters: scene.characters ?? [],
            },
          }),
        ));

        await tx.storyProject.update({
          where: { id: project.id },
          data: {
            synopsis: `${project.synopsis ?? ''}\n\n${story.body}`.trim(),
            ageRange: story.ageRange,
            theme: story.theme,
            status: 'EXTENDED',
          },
        });

        return chapter;
      });
      await trackStoryAnalytics(ctx, {
        event: 'story_continued',
        projectId: project.id,
        audienceMode,
        properties: { chapterId: chapter.id, chapterNumber: nextNumber, sceneHintCount: story.sceneHints.length },
      });
      return chapter;
    }),

  generateScenes: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      replaceExisting: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.prisma.storyProject.findFirst({
        where: { id: input.projectId, userId: ctx.user.id },
        include: {
          chapters: { orderBy: { chapterNumber: 'asc' } },
          characterMemory: { orderBy: { createdAt: 'asc' } },
          sceneSeeds: { orderBy: { orderIndex: 'asc' } },
        },
      });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Story project not found' });
      if (project.chapters.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Create the story before making scenes.' });
      }

      await trackStoryAnalytics(ctx, {
        event: 'scene_generation_started',
        projectId: project.id,
        audienceMode: project.audienceMode,
        properties: { replaceExisting: input.replaceExisting },
      });

      if (!input.replaceExisting && project.sceneSeeds.length > 0) {
        await trackStoryAnalytics(ctx, {
          event: 'scene_generation_completed',
          projectId: project.id,
          audienceMode: project.audienceMode,
          properties: { sceneCount: project.sceneSeeds.length, reusedExisting: true },
        });
        return project.sceneSeeds;
      }

      const scenes = buildSimpleScenes(project);
      try {
        const createdScenes = await ctx.prisma.$transaction(async (tx: any) => {
          if (input.replaceExisting) {
            await tx.storySceneSeed.deleteMany({ where: { projectId: project.id } });
          }

          return Promise.all(scenes.map((scene, index) =>
            tx.storySceneSeed.create({
              data: {
                projectId: project.id,
                chapterId: project.chapters[0]?.id,
                orderIndex: index + 1,
                title: scene.title,
                description: scene.description,
                locationType: scene.locationType,
                indoorOutdoor: scene.indoorOutdoor,
                mood: scene.mood,
                characters: scene.characters,
              },
            }),
          ));
        });
        await trackStoryAnalytics(ctx, {
          event: 'scene_generation_completed',
          projectId: project.id,
          audienceMode: project.audienceMode,
          properties: { sceneCount: createdScenes.length, reusedExisting: false },
        });
        return createdScenes;
      } catch (error) {
        await trackStoryAnalytics(ctx, {
          event: 'scene_generation_failed',
          projectId: project.id,
          audienceMode: project.audienceMode,
          properties: { message: error instanceof Error ? error.message : 'Scene generation failed' },
        });
        throw error;
      }
    }),

  updateScene: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      sceneId: z.string(),
      title: z.string().min(1).max(120),
      description: z.string().min(1).max(500),
      locationType: z.string().max(80).optional(),
      indoorOutdoor: z.string().max(40).optional(),
      mood: z.string().max(80).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ensureProject(ctx, input.projectId);
      const scene = await ctx.prisma.storySceneSeed.findFirst({
        where: { id: input.sceneId, projectId: input.projectId },
      });
      if (!scene) throw new TRPCError({ code: 'NOT_FOUND', message: 'Story scene not found' });

      return ctx.prisma.storySceneSeed.update({
        where: { id: input.sceneId },
        data: {
          title: input.title,
          description: input.description,
          locationType: input.locationType || null,
          indoorOutdoor: input.indoorOutdoor || null,
          mood: input.mood || null,
        },
      });
    }),

  updateSceneDirector: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      sceneId: z.string(),
      settings: directorSettingsSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      const project = await ensureProject(ctx, input.projectId);
      const scene = await ctx.prisma.storySceneSeed.findFirst({
        where: { id: input.sceneId, projectId: input.projectId },
      });
      if (!scene) throw new TRPCError({ code: 'NOT_FOUND', message: 'Story scene not found' });

      const settings = input.settings;
      const updated = await ctx.prisma.storySceneSeed.update({
        where: { id: input.sceneId },
        data: {
          emotion: settings.emotion ?? null,
          cameraStyle: settings.cameraStyle ?? null,
          timeOfDay: settings.timeOfDay ?? null,
          weather: settings.weather ?? null,
          environmentMood: settings.environmentMood ?? null,
          lighting: settings.lighting ?? null,
          scenePace: settings.scenePace ?? null,
          directorChangedAt: new Date(),
        },
      });

      await trackStoryAnalytics(ctx, {
        event: 'director_setting_changed',
        projectId: project.id,
        audienceMode: project.audienceMode,
        properties: {
          sceneId: scene.id,
          emotion: settings.emotion,
          camera: settings.cameraStyle,
          lighting: settings.lighting,
          weather: settings.weather,
          environment: settings.environmentMood,
          timeOfDay: settings.timeOfDay,
          scenePace: settings.scenePace,
          style: project.visualStyle,
        },
      });

      return updated;
    }),

  composeScenePrompt: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      sceneId: z.string(),
      outputType: promptOutputTypeSchema.default('IMAGE'),
      provider: promptProviderSchema.default('FLUX'),
      saveVersion: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const project = await ensureProject(ctx, input.projectId);
      const scene = await ctx.prisma.storySceneSeed.findFirst({
        where: { id: input.sceneId, projectId: input.projectId },
        include: {
          project: {
            select: {
              title: true,
              originalIdea: true,
              audienceMode: true,
              visualStyle: true,
              theme: true,
            },
          },
        },
      });
      if (!scene) throw new TRPCError({ code: 'NOT_FOUND', message: 'Story scene not found' });

      const audienceMode = resolveAudienceMode(ctx, project.audienceMode as StoryAudienceMode);
      const composed = await composeEnhancedScenePrompt(ctx, {
        scene,
        outputType: input.outputType,
        provider: input.provider,
        audienceMode,
        projectId: project.id,
        analyticsSource: 'preview',
      });

      if (!input.saveVersion) {
        return {
          ...composed,
          id: null,
          sceneId: input.sceneId,
          outputType: input.outputType,
          provider: input.provider,
          version: null,
        };
      }

      const latest = await (ctx.prisma as any).storyScenePrompt.findFirst({
        where: {
          sceneId: input.sceneId,
          outputType: input.outputType,
          provider: input.provider,
        },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const version = (latest?.version ?? 0) + 1;

      return (ctx.prisma as any).storyScenePrompt.create({
        data: {
          sceneId: input.sceneId,
          outputType: input.outputType,
          provider: input.provider,
          prompt: composed.prompt,
          negativePrompt: composed.negativePrompt,
          aspectRatio: composed.aspectRatio,
          duration: composed.duration,
          version,
          metadata: {
            providerLabel: composed.providerLabel,
            maxPromptLength: composed.maxPromptLength,
            audienceMode,
            hiddenFromKids: true,
            deterministicPrompt: composed.deterministicPrompt,
            visualStyle: composed.styleUsed,
            director: composed.director,
            promptEnhancerProvider: composed.enhancerProvider,
            promptEnhancerModel: composed.enhancerModel,
            providerHints: composed.providerHints,
            safetyNotes: composed.safetyNotes,
          },
        },
      });
    }),

  composeAllScenePrompts: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      outputType: promptOutputTypeSchema.default('IMAGE'),
      provider: promptProviderSchema.default('FLUX'),
    }))
    .mutation(async ({ ctx, input }) => {
      const project = await ensureProject(ctx, input.projectId);
      const scenes = await ctx.prisma.storySceneSeed.findMany({
        where: { projectId: input.projectId },
        orderBy: { orderIndex: 'asc' },
        include: {
          project: {
            select: {
              title: true,
              originalIdea: true,
              audienceMode: true,
              visualStyle: true,
              theme: true,
            },
          },
        },
      });
      if (scenes.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Create scene cards before composing prompts.' });
      }

      const audienceMode = resolveAudienceMode(ctx, project.audienceMode as StoryAudienceMode);
      const created = [];
      for (const scene of scenes) {
        const composed = await composeEnhancedScenePrompt(ctx, {
          scene,
          outputType: input.outputType,
          provider: input.provider,
          audienceMode,
          projectId: project.id,
          analyticsSource: 'preview',
        });
        const latest = await (ctx.prisma as any).storyScenePrompt.findFirst({
          where: {
            sceneId: scene.id,
            outputType: input.outputType,
            provider: input.provider,
          },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        created.push(await (ctx.prisma as any).storyScenePrompt.create({
          data: {
            sceneId: scene.id,
            outputType: input.outputType,
            provider: input.provider,
            prompt: composed.prompt,
            negativePrompt: composed.negativePrompt,
            aspectRatio: composed.aspectRatio,
            duration: composed.duration,
            version: (latest?.version ?? 0) + 1,
            metadata: {
              providerLabel: composed.providerLabel,
              maxPromptLength: composed.maxPromptLength,
              audienceMode,
              hiddenFromKids: true,
              deterministicPrompt: composed.deterministicPrompt,
              visualStyle: composed.styleUsed,
              director: composed.director,
              promptEnhancerProvider: composed.enhancerProvider,
              promptEnhancerModel: composed.enhancerModel,
              providerHints: composed.providerHints,
              safetyNotes: composed.safetyNotes,
            },
          },
        }));
      }
      return created;
    }),

  generateSceneImage: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      sceneId: z.string(),
      model: z.enum(SCENE_IMAGE_MODELS).default('FLUX'),
    }))
    .mutation(({ ctx, input }) => generateSceneImageAsset(ctx, input)),

  regenerateSceneImage: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      sceneId: z.string(),
      model: z.enum(SCENE_IMAGE_MODELS).default('FLUX'),
    }))
    .mutation(({ ctx, input }) => generateSceneImageAsset(ctx, { ...input, isRegeneration: true })),

  submitPromptQualityFeedback: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      sceneId: z.string(),
      assetId: z.string(),
      rating: z.enum(['UP', 'DOWN']),
      comment: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ensureProject(ctx, input.projectId);
      const asset = await (ctx.prisma as any).storySceneAsset.findFirst({
        where: {
          id: input.assetId,
          sceneId: input.sceneId,
          projectId: input.projectId,
          userId: ctx.user.id,
        },
      });
      if (!asset) throw new TRPCError({ code: 'NOT_FOUND', message: 'Scene image not found' });

      const feedback = await (ctx.prisma as any).promptQualityFeedback.upsert({
        where: {
          assetId_userId: {
            assetId: input.assetId,
            userId: ctx.user.id,
          },
        },
        update: {
          rating: input.rating === 'UP' ? 1 : -1,
          comment: input.comment?.trim() || null,
        },
        create: {
          projectId: input.projectId,
          sceneId: input.sceneId,
          assetId: input.assetId,
          userId: ctx.user.id,
          rating: input.rating === 'UP' ? 1 : -1,
          comment: input.comment?.trim() || null,
        },
      });

      await trackStoryAnalytics(ctx, {
        event: 'prompt_quality_feedback',
        projectId: input.projectId,
        audienceMode: ctx.isR16 ? 'KIDS' : undefined,
        properties: {
          sceneId: input.sceneId,
          assetId: input.assetId,
          rating: input.rating,
          hasComment: Boolean(input.comment?.trim()),
          model: asset.model,
          provider: asset.provider,
        },
      });

      return feedback;
    }),

  listSceneAssets: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      sceneId: z.string(),
      limit: z.number().min(1).max(50).default(20),
    }))
    .query(async ({ ctx, input }) => {
      await ensureProject(ctx, input.projectId);
      const scene = await ctx.prisma.storySceneSeed.findFirst({
        where: { id: input.sceneId, projectId: input.projectId },
      });
      if (!scene) throw new TRPCError({ code: 'NOT_FOUND', message: 'Story scene not found' });
      return (ctx.prisma as any).storySceneAsset.findMany({
        where: { sceneId: input.sceneId, projectId: input.projectId },
        orderBy: { createdAt: 'desc' },
        take: input.limit,
      });
    }),

  getSceneAsset: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      assetId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      await ensureProject(ctx, input.projectId);
      const asset = await (ctx.prisma as any).storySceneAsset.findFirst({
        where: { id: input.assetId, projectId: input.projectId },
      });
      if (!asset) throw new TRPCError({ code: 'NOT_FOUND', message: 'Story scene asset not found' });
      return asset;
    }),

  saveProject: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      title: z.string().min(1).max(120).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const project = await ensureProject(ctx, input.projectId);
      const savedProject = await ctx.prisma.storyProject.update({
        where: { id: input.projectId },
        data: input.title ? { title: input.title.trim() } : {},
        select: projectSelect,
      });
      await trackStoryAnalytics(ctx, {
        event: 'story_saved',
        projectId: input.projectId,
        audienceMode: project.audienceMode,
        properties: { renamed: Boolean(input.title) },
      });
      return savedProject;
    }),

  listMyProjects: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(20) }).optional())
    .query(({ ctx, input }) => {
      return (ctx.prisma as any).storyProject.findMany({
        where: { userId: ctx.user.id, status: { not: 'ARCHIVED' } },
        orderBy: { updatedAt: 'desc' },
        take: input?.limit ?? 20,
        include: {
          _count: {
            select: {
              chapters: true,
              questions: true,
              sceneSeeds: true,
            },
          },
          sceneSeeds: {
            orderBy: { orderIndex: 'asc' },
            select: {
              id: true,
              orderIndex: true,
              imageUrl: true,
              imageStatus: true,
              assets: {
                where: { assetType: 'IMAGE', status: 'READY' },
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: {
                  id: true,
                  assetUrl: true,
                  thumbnailUrl: true,
                  status: true,
                  createdAt: true,
                },
              },
            },
          },
        },
      });
    }),

  listProjects: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(20) }).optional())
    .query(({ ctx, input }) => {
      return ctx.prisma.storyProject.findMany({
        where: { userId: ctx.user.id },
        orderBy: { updatedAt: 'desc' },
        take: input?.limit ?? 20,
        select: projectSelect,
      });
    }),

  getProject: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await ensureProject(ctx, input.projectId);
      return (ctx.prisma as any).storyProject.findFirst({
        where: { id: input.projectId, userId: ctx.user.id },
        include: {
          characters: { orderBy: { createdAt: 'asc' } },
          environments: { orderBy: { createdAt: 'asc' } },
          shots: { orderBy: { position: 'asc' } },
          questions: { orderBy: { orderIndex: 'asc' } },
          chapters: { orderBy: { chapterNumber: 'asc' }, select: chapterSelect() },
          characterMemory: { orderBy: { createdAt: 'asc' } },
          sceneSeeds: {
            orderBy: { orderIndex: 'asc' },
            include: {
              assets: {
                orderBy: { createdAt: 'desc' },
                take: 12,
              },
              prompts: {
                orderBy: { createdAt: 'desc' },
                take: 6,
              },
            },
          },
        },
      });
    }),

  getStoryBook: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await ensureProject(ctx, input.projectId);
      const project = await (ctx.prisma as any).storyProject.findFirst({
        where: { id: input.projectId, userId: ctx.user.id },
        include: {
          chapters: { orderBy: { chapterNumber: 'asc' }, select: chapterSelect() },
          characterMemory: { orderBy: { createdAt: 'asc' } },
          sceneSeeds: {
            orderBy: { orderIndex: 'asc' },
            include: {
              assets: {
                where: { assetType: 'IMAGE' },
                orderBy: { createdAt: 'desc' },
                take: 8,
              },
            },
          },
        },
      });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Story project not found' });
      return buildStoryBookResponse(project);
    }),

  getStoryBookPage: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      pageNumber: z.number().int().min(0),
    }))
    .query(async ({ ctx, input }) => {
      await ensureProject(ctx, input.projectId);
      const project = await (ctx.prisma as any).storyProject.findFirst({
        where: { id: input.projectId, userId: ctx.user.id },
        include: {
          chapters: { orderBy: { chapterNumber: 'asc' }, select: chapterSelect() },
          characterMemory: { orderBy: { createdAt: 'asc' } },
          sceneSeeds: {
            orderBy: { orderIndex: 'asc' },
            include: {
              assets: {
                where: { assetType: 'IMAGE' },
                orderBy: { createdAt: 'desc' },
                take: 8,
              },
            },
          },
        },
      });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Story project not found' });
      const storyBook = buildStoryBookResponse(project);
      if (input.pageNumber === 0) {
        return {
          pageNumber: 0,
          isCover: true,
          imageUrl: storyBook.coverImage,
          title: storyBook.project.title,
          text: storyBook.project.theme ? `A story about ${storyBook.project.theme}.` : 'A story made by you.',
          imageAlt: `${storyBook.project.title} cover`,
        };
      }
      const page = storyBook.pages[input.pageNumber - 1];
      if (!page) throw new TRPCError({ code: 'NOT_FOUND', message: 'Storybook page not found' });
      return { ...page, isCover: false };
    }),

  regenerateStoryBook: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ensureProject(ctx, input.projectId);
      const project = await (ctx.prisma as any).storyProject.findFirst({
        where: { id: input.projectId, userId: ctx.user.id },
        include: {
          chapters: { orderBy: { chapterNumber: 'asc' }, select: chapterSelect() },
          characterMemory: { orderBy: { createdAt: 'asc' } },
          sceneSeeds: {
            orderBy: { orderIndex: 'asc' },
            include: {
              assets: {
                where: { assetType: 'IMAGE' },
                orderBy: { createdAt: 'desc' },
                take: 8,
              },
            },
          },
        },
      });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Story project not found' });
      return buildStoryBookResponse(project);
    }),

  createProject: protectedProcedure
    .input(z.object({
      title: z.string().min(1).max(120),
      logline: z.string().max(240).optional(),
      synopsis: z.string().max(5000).optional(),
      genre: z.string().max(80).optional(),
      tone: z.string().max(120).optional(),
      targetAudience: z.string().max(120).optional(),
      visualStyle: z.string().max(240).optional(),
      audienceMode: audienceModeSchema.optional(),
      storyType: storyTypeSchema.optional(),
    }))
    .mutation(({ ctx, input }) => {
      return ctx.prisma.storyProject.create({
        data: {
          ...input,
          audienceMode: resolveAudienceMode(ctx, input.audienceMode),
          userId: ctx.user.id,
        },
        select: projectSelect,
      });
    }),

  updateProject: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      title: z.string().min(1).max(120).optional(),
      logline: z.string().max(240).optional(),
      synopsis: z.string().max(5000).optional(),
      genre: z.string().max(80).optional(),
      tone: z.string().max(120).optional(),
      targetAudience: z.string().max(120).optional(),
      visualStyle: z.string().max(240).optional(),
      status: z.enum(['DRAFT', 'GENERATED', 'EXTENDED', 'STORYBOARDED', 'IN_PRODUCTION', 'PUBLISHED', 'ARCHIVED']).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const project = await ensureProject(ctx, input.projectId);
      const { projectId, ...data } = input;
      const updateData = {
        ...data,
        visualStyle: data.visualStyle ? normaliseStoryVisualStyle(data.visualStyle) : data.visualStyle,
      };
      const updated = await ctx.prisma.storyProject.update({
        where: { id: projectId },
        data: updateData,
        select: projectSelect,
      });
      if (data.visualStyle) {
        await trackStoryAnalytics(ctx, {
          event: 'visual_style_selected',
          projectId,
          audienceMode: project.audienceMode,
          properties: { style: styleLabel(data.visualStyle) },
        });
      }
      return updated;
    }),

  upsertCharacter: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      id: z.string().optional(),
      name: z.string().min(1).max(80),
      role: z.string().max(80).optional(),
      description: z.string().min(1).max(800),
      personality: z.string().max(500).optional(),
      visualTraits: z.string().max(500).optional(),
      referenceUrl: z.string().url().optional().or(z.literal('')),
    }))
    .mutation(async ({ ctx, input }) => {
      await ensureProject(ctx, input.projectId);
      const data = {
        name: input.name,
        role: input.role,
        description: input.description,
        personality: input.personality,
        visualTraits: input.visualTraits,
        referenceUrl: input.referenceUrl || null,
      };
      if (input.id) {
        return ctx.prisma.storyCharacter.update({ where: { id: input.id }, data });
      }
      return ctx.prisma.storyCharacter.create({ data: { ...data, projectId: input.projectId } });
    }),

  upsertEnvironment: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      id: z.string().optional(),
      name: z.string().min(1).max(80),
      description: z.string().min(1).max(800),
      mood: z.string().max(240).optional(),
      lighting: z.string().max(240).optional(),
      referenceUrl: z.string().url().optional().or(z.literal('')),
    }))
    .mutation(async ({ ctx, input }) => {
      await ensureProject(ctx, input.projectId);
      const data = {
        name: input.name,
        description: input.description,
        mood: input.mood,
        lighting: input.lighting,
        referenceUrl: input.referenceUrl || null,
      };
      if (input.id) {
        return ctx.prisma.storyEnvironment.update({ where: { id: input.id }, data });
      }
      return ctx.prisma.storyEnvironment.create({ data: { ...data, projectId: input.projectId } });
    }),

  buildStoryboard: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      storyText: z.string().min(20).max(8000),
      shotType: shotTypeSchema.default('VIDEO'),
      replaceExisting: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.prisma.storyProject.findFirst({
        where: { id: input.projectId, userId: ctx.user.id },
        include: {
          characters: true,
          environments: true,
          shots: { select: { position: true }, orderBy: { position: 'desc' }, take: 1 },
        },
      });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Story project not found' });

      const beats = splitBeats(input.storyText);
      if (beats.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Add a story with enough detail to create shots.' });
      }

      if (input.replaceExisting) {
        await ctx.prisma.storyboardShot.deleteMany({ where: { projectId: project.id } });
      }

      const startPosition = input.replaceExisting ? 1 : ((project.shots[0]?.position ?? 0) + 1);
      const shots = await ctx.prisma.$transaction(
        beats.map((beat, index) => {
          const title = `Shot ${startPosition + index}`;
          return ctx.prisma.storyboardShot.create({
            data: {
              projectId: project.id,
              position: startPosition + index,
              shotType: input.shotType,
              title,
              beat,
              action: beat,
              camera: 'Close, energetic vertical framing with smooth creator-style motion',
              imagePrompt: buildPrompt({ ...project, beat, title, shotType: 'IMAGE' }),
              videoPrompt: buildPrompt({ ...project, beat, title, shotType: 'VIDEO' }),
              negativePrompt: 'low resolution, distorted faces, inconsistent character identity, unreadable text, watermark',
              aspectRatio: '9:16',
              duration: 5,
            },
          });
        }),
      );

      await ctx.prisma.storyProject.update({
        where: { id: project.id },
        data: { synopsis: input.storyText, status: 'STORYBOARDED' },
      });

      return shots;
    }),

  updateShot: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      shotId: z.string(),
      title: z.string().min(1).max(120).optional(),
      beat: z.string().min(1).max(1000).optional(),
      camera: z.string().max(500).optional(),
      action: z.string().max(1000).optional(),
      dialogue: z.string().max(1000).optional(),
      imagePrompt: z.string().min(1).max(GENERATION_PROMPT_MAX_LENGTH).optional(),
      videoPrompt: z.string().min(1).max(GENERATION_PROMPT_MAX_LENGTH).optional(),
      negativePrompt: z.string().max(NEGATIVE_PROMPT_MAX_LENGTH).optional(),
      assetUrl: z.string().url().optional().or(z.literal('')),
      seedImageUrl: z.string().url().optional().or(z.literal('')),
      generationJobId: z.string().optional(),
      duration: z.number().min(1).max(15).optional(),
      aspectRatio: z.enum(['9:16', '16:9', '1:1', '4:3', '3:4']).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ensureProject(ctx, input.projectId);
      const shot = await ctx.prisma.storyboardShot.findFirst({
        where: { id: input.shotId, projectId: input.projectId },
      });
      if (!shot) throw new TRPCError({ code: 'NOT_FOUND', message: 'Storyboard shot not found' });

      const { projectId, shotId, assetUrl, seedImageUrl, ...rest } = input;
      return ctx.prisma.storyboardShot.update({
        where: { id: shotId },
        data: {
          ...rest,
          ...(assetUrl !== undefined ? { assetUrl: assetUrl || null } : {}),
          ...(seedImageUrl !== undefined ? { seedImageUrl: seedImageUrl || null } : {}),
        },
      });
    }),
});
