import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { protectedProcedure, router } from '../trpc';
import { moderatePrompt } from '../lib/promptModeration';
import { storyTextService, type StoryAudienceMode } from '../lib/storyTextService';
import { isManifestStructurerEnabled, structureProductionManifest, type ProductionManifest } from '../lib/productionStructurer';
import { submitGenerationJob, pollJobStatus, type SupportedModel } from '../lib/generators';
import { deductCredits, refundCredits, MODEL_FEATURE_KEY, getFeatureCreditCost, resolveMovieRenderCreditRate, resolveFeatureCreditRate, STORY_SPEECH_GENERATION_FEATURE_KEY, STORY_AUDIO_GENERATION_FEATURE_KEY } from '../lib/credits';
import { mirrorUrlToR2, uploadBufferToR2 } from '../lib/r2';
import { analytics, type StoryAnalyticsEventName } from '../lib/analytics';
import { promptEnhancerService } from '../lib/promptEnhancerService';
import {
  applyCriticImprovementsToCreativeSpecification,
  createCreativeCriticRun,
  creativeCriticMaxRetries,
  creativeCriticThreshold,
  improvementPlanSummary,
  runCreativeCritic,
  sanitizeR16AssetPayload,
  selectStorybookImageForScene,
  type CreativeCriticInput,
} from '../lib/creativeCritic';
import { DEFAULT_R16_STORY_VISUAL_STYLE, DEFAULT_STORY_VISUAL_STYLE, normaliseStoryVisualStyle, styleLabel, stylePromptBlock, type StoryVisualStyleKey } from '../lib/storyVisualStyles';
import {
  SEQUENCE_CAMERA_MOVEMENTS,
  SEQUENCE_CAMERA_SPEEDS,
  SEQUENCE_SHOT_TYPES,
  SEQUENCE_TRANSITIONS,
  buildFilmBlueprint,
  clampCameraSpeedMultiplier,
  clampSequenceDuration,
  clampTransitionDuration,
  normalizeSequenceEntryOrder,
  nextSequenceVersionFromExisting,
  pickSequenceAsset,
  sequenceRuntime,
  sequenceSnapshot,
} from '../lib/sequencePlanning';
import {
  ACTIVE_MOVIE_RENDER_STATUSES,
  MOVIE_RENDER_FEATURE_KEY,
  buildMovieRenderPlan,
  hashRenderPlan,
  renderReadiness,
  shouldReuseMovieRenderJob,
} from '../lib/movieRenderPlanning';
import { queueMovieRenderJob } from '../lib/movieRenderWorker';
import { synthesizeSpeech, elevenLabsApiKey, isElevenLabsTtsEnabled, elevenLabsDefaultVoiceId, elevenLabsModelId, listElevenLabsVoices, ELEVENLABS_CURATED_VOICES } from '../lib/generators/elevenLabsTts';
import { generateMusic as generateLyriaMusic, geminiApiKey, isLyriaMusicEnabled, lyriaModelId } from '../lib/generators/lyriaMusic';
import { buildAudioBlueprint, combineRenderHash, hashAudioBlueprint, nextAudioVersionFromExisting, summarizeUnmaterializedSpeechCues } from '../lib/audioPlanning';
import { GENERATION_PROMPT_MAX_LENGTH, NEGATIVE_PROMPT_MAX_LENGTH } from './generation';
import {
  storyIntelligenceProvider,
  isStoryIntelligenceEnabled,
  type StoryBlueprint,
  type DirectedScene,
  StoryIntelligenceError,
} from '../lib/storyIntelligence';
import {
  composeV2,
  isVisualPromptComposerV2Enabled,
  VpcError,
} from '../lib/visualPromptComposer';
import { storyBlueprintSchema, directedSceneSchema } from '../lib/storyIntelligence/types';

const shotTypeSchema = z.enum(['IMAGE', 'VIDEO']);
const audienceModeSchema = z.enum(['KIDS', 'GENERAL']);
const storyTypeSchema = z.enum(['SHORT_STORY', 'PICTURE_BOOK', 'COMIC', 'VIDEO_STORY']);
const promptOutputTypeSchema = z.enum(['IMAGE', 'SHORT_VIDEO', 'COMIC_PANEL']);
const promptProviderSchema = z.enum(['FLUX', 'WAN_25', 'KLING_I2V', 'KLING_R2V', 'H3_MAX']);
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
const personalityTraitSchema = z.enum(['BRAVE', 'CURIOUS', 'FUNNY', 'KIND', 'SHY', 'CONFIDENT', 'ADVENTUROUS', 'CALM', 'CLEVER', 'ENERGETIC']);
const motivationSchema = z.enum(['MAKE_FRIENDS', 'LEARN', 'HELP_OTHERS', 'EXPLORE', 'WIN', 'PROTECT_FAMILY', 'FIND_HOME']);
const fearSchema = z.enum(['DARKNESS', 'HEIGHTS', 'BULLIES', 'BEING_ALONE', 'LOUD_NOISES', 'MONSTERS', 'WATER']);
const characterGoalSchema = z.enum(['REACH_SCHOOL', 'SAVE_A_FRIEND', 'FIND_TREASURE', 'FINISH_HOMEWORK', 'BECOME_A_HERO']);
const favoriteExpressionSchema = z.enum(['SMILE', 'BIG_GRIN', 'CURIOUS_FACE', 'DETERMINED_FACE', 'SURPRISED']);
const walkingStyleSchema = z.enum(['SKIP', 'RUN', 'WALK_PROUDLY', 'WALK_CAREFULLY', 'BOUNCE', 'SNEAK']);
const speakingStyleSchema = z.enum(['CHEERFUL', 'GENTLE', 'QUIET', 'CONFIDENT', 'FUNNY']);
const relationshipTypeSchema = z.enum(['FRIEND', 'SIBLING', 'TEACHER', 'ENEMY', 'PARENT', 'PET', 'MENTOR']);
const relationshipStrengthSchema = z.enum(['DISTANT', 'FRIENDLY', 'CLOSE', 'VERY_CLOSE']);
const creativeCriticModeSchema = z.enum(['OFF', 'SUGGEST', 'AUTO_ONCE', 'AUTO_UNTIL_THRESHOLD']);
const criticFeedbackCategorySchema = z.enum(['CHARACTER', 'EMOTION', 'CAMERA', 'LIGHTING', 'COMPOSITION', 'BACKGROUND', 'STYLE', 'CONTINUITY', 'OTHER']);
const sequenceShotTypeSchema = z.enum(SEQUENCE_SHOT_TYPES);
const sequenceCameraMovementSchema = z.enum(SEQUENCE_CAMERA_MOVEMENTS);
const sequenceCameraSpeedSchema = z.enum(SEQUENCE_CAMERA_SPEEDS);
const sequenceTransitionSchema = z.enum(SEQUENCE_TRANSITIONS);
const characterRelationshipSchema = z.object({
  targetCharacterId: z.string().optional().nullable(),
  targetName: z.string().min(1).max(80),
  type: relationshipTypeSchema,
  strength: relationshipStrengthSchema.default('FRIENDLY'),
  notes: z.string().max(240).optional().nullable(),
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
  storyDna: true,
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

function assertSequenceAllowed(ctx: { isR16?: boolean }) {
  if (ctx.isR16) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Sequence editing is not available in R16 mode.' });
  }
}

const sequenceInclude = {
  scenes: {
    orderBy: { orderIndex: 'asc' as const },
    include: {
      storyScene: {
        include: {
          assets: {
            where: { deletedAt: null },
            orderBy: { createdAt: 'desc' as const },
            take: 30,
          },
        },
      },
      selectedAsset: true,
      futureVideoAsset: true,
    },
  },
  versions: {
    orderBy: { versionNumber: 'desc' as const },
    take: 12,
  },
};

function sequenceSceneCreateData(scene: any, orderIndex: number) {
  const picked = pickSequenceAsset(scene, 'ACTIVE');
  return {
    storySceneId: scene.id,
    orderIndex,
    enabled: true,
    durationSeconds: 4,
    selectedAssetId: picked.asset?.id ?? null,
    shotType: 'MEDIUM',
    cameraMovement: 'STATIC',
    cameraSpeed: 'NORMAL',
    transition: orderIndex === 1 ? 'NONE' : 'CUT',
    transitionDurationSeconds: 0,
    holdDurationSeconds: 0,
  };
}

async function getSequenceProject(ctx: { prisma: any; user: { id: string }; isR16?: boolean }, projectId: string) {
  assertSequenceAllowed(ctx);
  const project = await ctx.prisma.storyProject.findFirst({
    where: { id: projectId, userId: ctx.user.id },
    include: {
      sceneSeeds: {
        orderBy: { orderIndex: 'asc' },
        include: {
          assets: {
            where: { deletedAt: null },
            orderBy: { createdAt: 'desc' },
            take: 30,
          },
        },
      },
    },
  });
  if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Story project not found' });
  return project;
}

async function recalculateSequenceRuntime(prisma: any, sequenceId: string) {
  const scenes = await prisma.storySequenceScene.findMany({
    where: { sequenceId },
    orderBy: { orderIndex: 'asc' },
  });
  const runtime = sequenceRuntime(scenes);
  await prisma.storySequence.update({
    where: { id: sequenceId },
    data: { runtimeSeconds: runtime.totalRuntimeSeconds },
  });
  return runtime;
}

async function nextSequenceVersionNumber(prisma: any, sequenceId: string) {
  const existingVersions = await prisma.sequenceVersion.findMany({
    where: { sequenceId },
    select: { versionNumber: true },
  });
  return nextSequenceVersionFromExisting(existingVersions);
}

// ─── Phase 9B.2 — Audio & Performance layer helpers ────────────────────────

const AUDIO_TRACK_TYPE_VALUES = ['NARRATION', 'DIALOGUE', 'AMBIENCE', 'SFX', 'MUSIC'] as const;

const audioPlanInclude = {
  tracks: {
    orderBy: { order: 'asc' as const },
    include: {
      cues: {
        orderBy: { startTimeSeconds: 'asc' as const },
        include: {
          audioAsset: {
            select: {
              id: true,
              publicUrl: true,
              durationSeconds: true,
              mimeType: true,
              sourceKind: true,
            },
          },
        },
      },
    },
  },
};

/**
 * Idempotent find-or-create, mirroring getOrCreateSequence's own
 * find-outside / re-check-inside-a-transaction pattern exactly (required
 * test A: Audio Plan creation is idempotent). One non-archived plan per
 * sequence.
 */
async function getOrCreateAudioPlan(ctx: { prisma: any; user: { id: string } }, projectId: string, sequenceId: string) {
  let plan = await ctx.prisma.audioPerformancePlan.findFirst({
    where: { projectId, sequenceId, status: { not: 'ARCHIVED' } },
    orderBy: { updatedAt: 'desc' },
    include: audioPlanInclude,
  });
  if (!plan) {
    const created = await ctx.prisma.$transaction(async (tx: any) => {
      const existing = await tx.audioPerformancePlan.findFirst({
        where: { projectId, sequenceId, status: { not: 'ARCHIVED' } },
        orderBy: { updatedAt: 'desc' },
      });
      if (existing) return existing;
      return tx.audioPerformancePlan.create({ data: { projectId, sequenceId, status: 'DRAFT' } });
    });
    plan = await ctx.prisma.audioPerformancePlan.findUnique({ where: { id: created.id }, include: audioPlanInclude });
  }
  return plan;
}

/**
 * Every audio procedure's authorization gate. Scopes strictly through
 * StoryProject.userId, exactly like ensureProject — a cross-user planId
 * simply resolves NOT_FOUND, never leaking another user's plan (required
 * test O).
 */
async function ensureAudioPlanOwnership(
  ctx: { prisma: any; user: { id: string }; isR16?: boolean },
  projectId: string,
  planId: string,
  withTracks = false,
) {
  assertSequenceAllowed(ctx); // Audio Workspace is a creator-only surface, same as Sequence — no R16 access.
  await ensureProject(ctx, projectId);
  const plan = await ctx.prisma.audioPerformancePlan.findFirst({
    where: { id: planId, projectId },
    include: withTracks ? audioPlanInclude : undefined,
  });
  if (!plan) throw new TRPCError({ code: 'NOT_FOUND', message: 'Audio plan not found' });
  return plan;
}

/**
 * Read-only lookup of the current Audio Plan (if any) plus its derived Audio
 * Blueprint — shared by every call site that needs to *look at* the current
 * audio state without ever mutating AudioPerformancePlan/AudioTrack/AudioCue
 * rows (Movie Render Independence, brief §35). Used identically by
 * createMovieRender (to snapshot into a job) and getMovieBuilder (to preflight
 * a warning) — one read path, not two slightly-different reimplementations.
 */
async function readOnlyAudioBlueprint(ctx: { prisma: any }, input: { projectId: string; sequenceId: string; filmBlueprint: { runtimeSeconds: number } }) {
  const audioPlan = await ctx.prisma.audioPerformancePlan.findFirst({
    where: { projectId: input.projectId, sequenceId: input.sequenceId, status: { not: 'ARCHIVED' } },
    orderBy: { updatedAt: 'desc' },
    include: audioPlanInclude,
  });
  const audioBlueprint = audioPlan
    ? buildAudioBlueprint({
        filmBlueprint: input.filmBlueprint,
        tracks: audioPlan.tracks,
        resolvedAudioAssets: await resolveProjectAudioAssets(ctx, input.projectId, audioPlan.tracks),
      })
    : null;
  return { audioPlan, audioBlueprint };
}

/**
 * Builds the project-scoped `audioAssetId -> { storageKey }` map that
 * `buildAudioBlueprint` requires to resolve any cue's audio asset. The query
 * itself is the enforcement — `projectId` is in the WHERE clause, so a
 * cross-project `audioAssetId` (however it reached a cue) simply never comes
 * back, and `buildAudioBlueprint` treats it as no asset at all. Every
 * `buildAudioBlueprint` call site in this router uses this helper — there is
 * no path that resolves an asset without going through this project-scoped
 * lookup.
 */
export async function resolveProjectAudioAssets(ctx: { prisma: any }, projectId: string, tracks: Array<{ cues: Array<{ audioAssetId: string | null }> }>): Promise<Map<string, { storageKey: string }>> {
  const assetIds = [...new Set(tracks.flatMap((track) => track.cues.map((cue) => cue.audioAssetId).filter((id): id is string => Boolean(id))))];
  if (assetIds.length === 0) return new Map();
  const assets = await ctx.prisma.audioAsset.findMany({
    where: { id: { in: assetIds }, projectId },
    select: { id: true, storageKey: true },
  });
  return new Map(assets.map((asset: any) => [asset.id, { storageKey: asset.storageKey }]));
}

/**
 * Rejects a cross-project AudioAsset reference before it can ever be written
 * onto a cue. A cue's `audioAssetId` is client-supplied — without this check,
 * an attacker (or a stale UI) could point a cue at another project's (or
 * another user's) private audio asset id, and the render worker would later
 * resolve and mix it in (defense-in-depth against that is the projectId
 * filter on the worker's own audioAsset lookup, but the write-time check here
 * is what gives creators an honest, immediate NOT_FOUND instead of silently
 * accepting a reference that will just be dropped at render time).
 */
export async function assertAudioAssetOwnership(ctx: { prisma: any }, projectId: string, audioAssetId: string) {
  const asset = await ctx.prisma.audioAsset.findFirst({ where: { id: audioAssetId, projectId } });
  if (!asset) throw new TRPCError({ code: 'NOT_FOUND', message: 'Audio asset not found' });
  return asset;
}

/**
 * Phase 9B.2B.1 hotfix (restoreAudioVersion "Unknown argument `audioAsset`").
 *
 * `audioPlanInclude` nests each cue's `audioAsset` relation (added so the
 * Nocturne Audio tab can render an <audio> preview player). `saveAudioVersion`
 * stores that whole read shape verbatim as the version's JSON `snapshot`, so
 * every snapshotted cue also carries an `audioAsset` object (or `null`).
 * Restoring used to spread that snapshot object straight into
 * `tx.audioCue.create({ data: { ...cueRest } })` — Prisma rejects `audioAsset`
 * there since it's a read-time relation, not a scalar/FK write field, and
 * the whole restore failed for every plan with at least one track.
 *
 * Fixed with an explicit whitelist, not a spread-then-delete: these two
 * mappers name every real Prisma column, so no relation this read shape
 * gains in the future (voiceProfile, characterMemory, sequenceScene, …) can
 * leak into a write again just because it got added to an `include`.
 */
export function toAudioTrackRestoreCreateInput(snapshotTrack: any, planId: string) {
  return {
    planId,
    type: snapshotTrack.type,
    name: snapshotTrack.name,
    enabled: snapshotTrack.enabled,
    volume: snapshotTrack.volume,
    order: snapshotTrack.order,
  };
}

export function toAudioCueRestoreCreateInput(snapshotCue: any) {
  return {
    sequenceSceneId: snapshotCue.sequenceSceneId,
    characterMemoryId: snapshotCue.characterMemoryId,
    voiceProfileId: snapshotCue.voiceProfileId,
    audioAssetId: snapshotCue.audioAssetId,
    enabled: snapshotCue.enabled,
    order: snapshotCue.order,
    startTimeSeconds: snapshotCue.startTimeSeconds,
    durationSeconds: snapshotCue.durationSeconds,
    trimStartSeconds: snapshotCue.trimStartSeconds,
    trimEndSeconds: snapshotCue.trimEndSeconds,
    volume: snapshotCue.volume,
    fadeInSeconds: snapshotCue.fadeInSeconds,
    fadeOutSeconds: snapshotCue.fadeOutSeconds,
    text: snapshotCue.text,
    performancePreset: snapshotCue.performancePreset,
    performanceDirection: snapshotCue.performanceDirection,
    duckingEnabled: snapshotCue.duckingEnabled,
    duckingAmountDb: snapshotCue.duckingAmountDb,
    metadata: snapshotCue.metadata,
  };
}

/**
 * The actual restore service path (not a pure helper): ownership-checks the
 * plan, loads the chosen version, re-validates every referenced audio asset
 * still belongs to this project (defense-in-depth — a saved snapshot must
 * never become a channel for attaching a foreign-project AudioAsset, even
 * though in practice its audioAssetId values were already validated by
 * assertAudioAssetOwnership when they were first written onto a cue), then
 * atomically replaces the plan's live tracks/cues from the snapshot using
 * the explicit write mappers above. Exported so it's directly testable
 * against a mock Prisma client — the same convention as
 * assertAudioAssetOwnership — rather than only reachable through the tRPC
 * mutation.
 */
export async function restoreAudioVersionForPlan(
  ctx: { prisma: any; user: { id: string }; isR16?: boolean },
  input: { projectId: string; planId: string; versionNumber: number },
) {
  const plan = await ensureAudioPlanOwnership(ctx, input.projectId, input.planId);
  const version = await ctx.prisma.audioPlanVersion.findUnique({
    where: { planId_versionNumber: { planId: input.planId, versionNumber: input.versionNumber } },
  });
  if (!version) throw new TRPCError({ code: 'NOT_FOUND', message: 'Audio plan version not found' });

  const snapshotTracks = Array.isArray(version.snapshot) ? version.snapshot as any[] : [];

  const audioAssetIds = new Set<string>();
  for (const track of snapshotTracks) {
    for (const cue of track.cues ?? []) {
      if (cue.audioAssetId) audioAssetIds.add(cue.audioAssetId);
    }
  }
  for (const audioAssetId of audioAssetIds) {
    await assertAudioAssetOwnership(ctx, input.projectId, audioAssetId);
  }

  await ctx.prisma.$transaction(async (tx: any) => {
    await tx.audioTrack.deleteMany({ where: { planId: input.planId } });
    for (const track of snapshotTracks) {
      await tx.audioTrack.create({
        data: {
          ...toAudioTrackRestoreCreateInput(track, input.planId),
          cues: {
            create: (track.cues ?? []).map(toAudioCueRestoreCreateInput),
          },
        },
      });
    }
  });

  return plan;
}

async function getOrCreateSequence(ctx: { prisma: any; user: { id: string }; isR16?: boolean }, projectId: string, sequenceId?: string | null) {
  const project = await getSequenceProject(ctx, projectId);
  let sequence = sequenceId
    ? await ctx.prisma.storySequence.findFirst({ where: { id: sequenceId, projectId }, include: sequenceInclude })
    : await ctx.prisma.storySequence.findFirst({
      where: { projectId, status: { not: 'ARCHIVED' } },
      orderBy: { updatedAt: 'desc' },
      include: sequenceInclude,
    });

  if (!sequence) {
    sequence = await ctx.prisma.$transaction(async (tx: any) => {
      const existing = await tx.storySequence.findFirst({
        where: { projectId, status: { not: 'ARCHIVED' } },
        orderBy: { updatedAt: 'desc' },
        include: sequenceInclude,
      });
      if (existing) return existing;

      const created = await tx.storySequence.create({
        data: {
          projectId,
          title: `${project.title || 'Story'} Sequence`,
          status: 'DRAFT',
          scenes: {
            create: project.sceneSeeds.map((scene: any, index: number) => sequenceSceneCreateData(scene, index + 1)),
          },
        },
      });
      const runtime = sequenceRuntime(project.sceneSeeds.map((scene: any, index: number) => ({
        id: scene.id,
        storySceneId: scene.id,
        orderIndex: index + 1,
        enabled: true,
        durationSeconds: 4,
      })));
      await tx.storySequence.update({ where: { id: created.id }, data: { runtimeSeconds: runtime.totalRuntimeSeconds } });
      return tx.storySequence.findUnique({ where: { id: created.id }, include: sequenceInclude });
    }, { timeout: 30_000, maxWait: 15_000 });
    await trackStoryAnalytics(ctx, {
      event: 'sequence_created',
      projectId,
      audienceMode: project.audienceMode,
      properties: { sequenceId: sequence.id, shotCount: project.sceneSeeds.length },
    });
  }

  return { project, sequence };
}

async function sequenceResponse(ctx: any, projectId: string, sequenceId?: string | null) {
  const { project, sequence } = await getOrCreateSequence(ctx, projectId, sequenceId);
  const runtime = sequenceRuntime(sequence.scenes);
  const filmBlueprint = buildFilmBlueprint({
    sequenceId: sequence.id,
    version: sequence.currentVersionNumber,
    scenes: sequence.scenes,
  });
  return {
    projectId,
    projectTitle: project.title,
    sequence,
    runtime,
    filmBlueprint,
  };
}

async function movieRenderContext(ctx: any, projectId: string, sequenceId?: string | null) {
  const { project, sequence } = await getOrCreateSequence(ctx, projectId, sequenceId);
  const filmBlueprint = buildFilmBlueprint({
    sequenceId: sequence.id,
    version: sequence.currentVersionNumber,
    scenes: sequence.scenes,
  });
  const assetIds = filmBlueprint.shots
    .filter((shot) => shot.enabled && shot.assetId)
    .map((shot) => shot.assetId as string);
  const assets = assetIds.length
    ? await (ctx.prisma as any).storySceneAsset.findMany({
      where: {
        id: { in: assetIds },
        projectId,
        userId: ctx.user.id,
        deletedAt: null,
      },
    })
    : [];
  const assetsById = new Map<string, any>(assets.map((asset: any) => [asset.id, asset]));

  // Phase 10 — prefer a READY scene video over the still, per shot scene.
  const shotSceneIds = filmBlueprint.shots
    .filter((shot) => shot.enabled && shot.storySceneId)
    .map((shot) => shot.storySceneId as string);
  const videoAssets = shotSceneIds.length
    ? await (ctx.prisma as any).storySceneAsset.findMany({
      where: {
        sceneId: { in: shotSceneIds },
        projectId,
        userId: ctx.user.id,
        assetType: 'VIDEO',
        status: 'READY',
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    })
    : [];
  const videoAssetsBySceneId = new Map<string, any>();
  for (const asset of videoAssets) {
    if (!videoAssetsBySceneId.has(asset.sceneId)) videoAssetsBySceneId.set(asset.sceneId, asset);
  }

  const plan = buildMovieRenderPlan({ filmBlueprint, assetsById, videoAssetsBySceneId });
  const renderPlanHash = hashRenderPlan(plan);
  const creditCost = await getFeatureCreditCost(ctx.prisma, MOVIE_RENDER_FEATURE_KEY);
  const currentMovie = await (ctx.prisma as any).movieAsset.findFirst({
    where: { projectId, sequenceId: sequence.id, status: 'READY', isCurrent: true },
    orderBy: { createdAt: 'desc' },
  });
  return { project, sequence, filmBlueprint, plan, renderPlanHash, creditCost, currentMovie };
}

async function findReusableMovieRender(ctx: any, input: { projectId: string; sequenceId: string; renderPlanHash: string }) {
  return (ctx.prisma as any).movieRenderJob.findFirst({
    where: {
      projectId: input.projectId,
      sequenceId: input.sequenceId,
      userId: ctx.user.id,
      renderPlanHash: input.renderPlanHash,
      status: { in: [...ACTIVE_MOVIE_RENDER_STATUSES, 'READY'] },
    },
    orderBy: { createdAt: 'desc' },
    include: { movieAsset: true, events: { orderBy: { createdAt: 'desc' }, take: 20 } },
  });
}

async function movieRenderForUser(ctx: any, input: { projectId: string; renderJobId: string }) {
  const job = await (ctx.prisma as any).movieRenderJob.findFirst({
    where: { id: input.renderJobId, projectId: input.projectId, userId: ctx.user.id },
    include: { movieAsset: true, events: { orderBy: { createdAt: 'desc' }, take: 50 } },
  });
  if (!job) throw new TRPCError({ code: 'NOT_FOUND', message: 'Movie render job not found' });
  return job;
}

async function assertSequenceAsset(ctx: { prisma: any; user: { id: string } }, input: {
  projectId: string;
  storySceneId: string;
  assetId: string;
}) {
  const asset = await ctx.prisma.storySceneAsset.findFirst({
    where: {
      id: input.assetId,
      sceneId: input.storySceneId,
      projectId: input.projectId,
      userId: ctx.user.id,
      assetType: 'IMAGE',
      status: 'READY',
      deletedAt: null,
      creativeStatus: { not: 'REJECTED' },
    },
  });
  if (!asset || asset.moderationStatus === 'REJECTED') {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Choose a ready, eligible image from this scene.' });
  }
  return asset;
}

function versionSnapshotScenes(snapshot: any) {
  const scenes = Array.isArray(snapshot?.scenes) ? snapshot.scenes : [];
  return scenes
    .map((scene: any, index: number) => ({
      storySceneId: String(scene.storySceneId ?? ''),
      orderIndex: Number(scene.orderIndex ?? index + 1),
      enabled: scene.enabled !== false,
      durationSeconds: clampSequenceDuration(scene.durationSeconds),
      selectedAssetId: scene.selectedAssetId ?? null,
      shotType: scene.shotType ?? null,
      cameraMovement: scene.cameraMovement ?? null,
      cameraSpeed: scene.cameraSpeed ?? null,
      cameraSpeedMultiplier: clampCameraSpeedMultiplier(scene.cameraSpeedMultiplier),
      transition: scene.transition ?? null,
      transitionDurationSeconds: clampTransitionDuration(scene.transitionDurationSeconds),
      holdDurationSeconds: clampTransitionDuration(scene.holdDurationSeconds),
      zoom: scene.zoom ?? null,
      creativeNotes: typeof scene.creativeNotes === 'string' ? scene.creativeNotes.slice(0, 2000) : null,
    }))
    .filter((scene: any) => scene.storySceneId);
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
  personalityTraits?: string[];
  motivation?: string | null;
  fear?: string | null;
  goal?: string | null;
  favoriteExpression?: string | null;
  walkingStyle?: string | null;
  speakingStyle?: string | null;
  relationships?: CharacterRelationship[];
  evolutionStage?: string | null;
  evolutionNotes?: string | null;
  evolutionSceneOrder?: number | null;
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
  personalityTraits?: unknown;
  motivation?: string | null;
  fear?: string | null;
  goal?: string | null;
  favoriteExpression?: string | null;
  walkingStyle?: string | null;
  speakingStyle?: string | null;
  relationships?: unknown;
  evolutionStage?: string | null;
  evolutionNotes?: string | null;
  evolutionSceneOrder?: number | null;
  directorChangedAt?: Date | string | null;
};

type CharacterRelationship = {
  targetCharacterId?: string | null;
  targetName: string;
  type: string;
  strength?: string;
  notes?: string | null;
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
  directorMetadata?: unknown;  // Phase A DirectedScene stored as JSON
  chapter?: { blueprint?: unknown } | null;  // Phase A StoryBlueprint stored as JSON on StoryChapter
  project: {
    title: string;
    originalIdea?: string | null;
    audienceMode?: string;
    visualStyle?: string | null;
    theme?: string | null;
    tone?: string | null;
    synopsis?: string | null;
    storyDna?: unknown;
    characterMemory?: CharacterMemoryRecord[];
  };
};

type SceneImageModel = 'FLUX' | 'FLUX2' | 'GROK_IMAGINE' | 'NANO_BANANA';
type SceneVideoModel = 'H3_MAX';

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
  H3_MAX: {
    label: 'MiniMax H3-Max Turbo',
    maxPromptLength: 1400,
    maxNegativePromptLength: 900,
    defaultAspectRatio: '9:16',
    defaultDuration: 5,
  },
};

const SCENE_IMAGE_MODELS = ['FLUX2'] as const;
const SCENE_VIDEO_MODELS = ['H3_MAX'] as const;

/**
 * Phase 11 — named shot presets (camera-motion + transition + pacing bundles)
 * applied to Sequence scenes. Values must be valid SequenceCameraMovement /
 * SequenceCameraSpeed / SequenceTransitionType enum members.
 */
const SHOT_PRESETS = {
  CINEMATIC: { cameraMovement: 'PUSH_IN', cameraSpeed: 'SLOW', transition: 'CROSS_DISSOLVE', transitionDurationSeconds: 0.8, zoom: 1.08 },
  DYNAMIC: { cameraMovement: 'TRACK_RIGHT', cameraSpeed: 'FAST', transition: 'CUT', transitionDurationSeconds: 0, zoom: 1 },
  CALM: { cameraMovement: 'STATIC', cameraSpeed: 'SLOW', transition: 'FADE', transitionDurationSeconds: 1, zoom: 1 },
  DRAMATIC: { cameraMovement: 'TILT_UP', cameraSpeed: 'NORMAL', transition: 'DIP_TO_BLACK', transitionDurationSeconds: 0.6, zoom: 1.15 },
  REVEAL: { cameraMovement: 'PULL_OUT', cameraSpeed: 'NORMAL', transition: 'CROSS_DISSOLVE', transitionDurationSeconds: 0.6, zoom: 1 },
} as const;
const SHOT_PRESET_NAMES = ['CINEMATIC', 'DYNAMIC', 'CALM', 'DRAMATIC', 'REVEAL'] as const;

/**
 * Phase 11 — named style presets bundling a visual style, director defaults,
 * and a background-music prompt (applied via `applyStylePreset`).
 */
const STYLE_PRESETS = {
  WARM_STORYBOOK: {
    label: 'Warm Storybook',
    visualStyle: 'STORYBOOK_ILLUSTRATION' as StoryVisualStyleKey,
    director: { lighting: 'WARM', environmentMood: 'COZY', scenePace: 'CALM', timeOfDay: 'AFTERNOON' },
    musicPrompt: 'warm gentle acoustic strings, soft piano, cozy storybook atmosphere, no vocals',
  },
  EPIC_CINEMATIC: {
    label: 'Epic Cinematic',
    visualStyle: 'CINEMATIC_FANTASY' as StoryVisualStyleKey,
    director: { lighting: 'DRAMATIC', environmentMood: 'ADVENTUROUS', scenePace: 'ENERGETIC', weather: 'WINDY' },
    musicPrompt: 'epic cinematic orchestral score, sweeping strings, building climax, no vocals',
  },
  ANIME_ADVENTURE: {
    label: 'Anime Adventure',
    visualStyle: 'ANIME' as StoryVisualStyleKey,
    director: { lighting: 'BRIGHT', environmentMood: 'MAGICAL', scenePace: 'ENERGETIC' },
    musicPrompt: 'upbeat anime adventure theme, playful synths and strings, no vocals',
  },
  PHOTOREAL_CINEMATIC: {
    label: 'Photoreal Cinematic',
    visualStyle: 'PHOTOREALISTIC' as StoryVisualStyleKey,
    director: { lighting: 'MOONLIGHT', environmentMood: 'PEACEFUL', scenePace: 'CALM', timeOfDay: 'NIGHT' },
    musicPrompt: 'moody cinematic ambient, low strings, atmospheric pads, no vocals',
  },
  AFRICAN_FOLKTALE: {
    label: 'African Folktale',
    visualStyle: 'AFRICAN_FOLKTALE_ILLUSTRATION' as StoryVisualStyleKey,
    director: { lighting: 'WARM', environmentMood: 'PEACEFUL', scenePace: 'NORMAL' },
    musicPrompt: 'warm african percussion and kora, gentle rhythmic storytelling, no vocals',
  },
} as const;
const STYLE_PRESET_NAMES = ['WARM_STORYBOOK', 'EPIC_CINEMATIC', 'ANIME_ADVENTURE', 'PHOTOREAL_CINEMATIC', 'AFRICAN_FOLKTALE'] as const;

function titleCase(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function enumLabel(value?: string | null) {
  return value ? titleCase(value.replace(/_/g, ' ')) : null;
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function asRelationshipList(value: unknown): CharacterRelationship[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    if (typeof record.targetName !== 'string' || !record.targetName.trim()) return [];
    return [{
      targetCharacterId: typeof record.targetCharacterId === 'string' ? record.targetCharacterId : null,
      targetName: record.targetName.trim(),
      type: typeof record.type === 'string' ? record.type : 'FRIEND',
      strength: typeof record.strength === 'string' ? record.strength : 'FRIENDLY',
      notes: typeof record.notes === 'string' ? record.notes : null,
    }];
  }).slice(0, 12);
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
      personalityTraits: ['KIND', 'CURIOUS', 'BRAVE'],
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
    personalityTraits: ['KIND', 'CURIOUS', 'BRAVE'],
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
      personalityTraits: character.personalityTraits ?? existing?.personalityTraits,
      motivation: character.motivation ?? existing?.motivation,
      fear: character.fear ?? existing?.fear,
      goal: character.goal ?? existing?.goal,
      favoriteExpression: character.favoriteExpression ?? existing?.favoriteExpression,
      walkingStyle: character.walkingStyle ?? existing?.walkingStyle,
      speakingStyle: character.speakingStyle ?? existing?.speakingStyle,
      relationships: character.relationships ?? existing?.relationships,
      evolutionStage: character.evolutionStage ?? existing?.evolutionStage,
      evolutionNotes: character.evolutionNotes ?? existing?.evolutionNotes,
      evolutionSceneOrder: character.evolutionSceneOrder ?? existing?.evolutionSceneOrder,
    });
  }

  return Array.from(byName.values()).slice(0, 6);
}

function characterPromptIngredient(character: CharacterMemoryRecord) {
  const traits = asStringList(character.personalityTraits).map(enumLabel).filter(Boolean).join(', ');
  const relationships = asRelationshipList(character.relationships)
    .map((relationship) => `${enumLabel(relationship.type) ?? 'Friend'} to ${relationship.targetName}${relationship.strength ? ` (${enumLabel(relationship.strength)})` : ''}`)
    .join('; ');
  return [
    `${character.name}`,
    character.role ? `role: ${character.role}` : undefined,
    character.species ? `species: ${character.species}` : undefined,
    character.ageDescription ? `age: ${character.ageDescription}` : undefined,
    character.gender ? `gender: ${character.gender}` : undefined,
    character.visualDescription ? `same look every scene: ${character.visualDescription}` : undefined,
    traits ? `personality: ${traits}` : undefined,
    character.motivation ? `motivation: ${enumLabel(character.motivation)}` : undefined,
    character.fear ? `fear to respect gently: ${enumLabel(character.fear)}` : undefined,
    character.goal ? `current goal: ${enumLabel(character.goal)}` : undefined,
    character.favoriteExpression ? `favorite expression: ${enumLabel(character.favoriteExpression)}` : undefined,
    character.walkingStyle ? `walking style: ${enumLabel(character.walkingStyle)}` : undefined,
    character.speakingStyle ? `speaking style for future narration: ${enumLabel(character.speakingStyle)}` : undefined,
    relationships ? `relationships: ${relationships}` : undefined,
    character.evolutionStage ? `current evolution stage: ${character.evolutionStage}` : undefined,
    character.evolutionNotes ? `intentional evolution from selected scene onward: ${character.evolutionNotes}` : undefined,
    'consistency rules: keep fur or hair, eye color, clothing, backpack, accessories, height, and species unchanged unless this character record explicitly changes them',
  ].filter(Boolean).join(', ');
}

function characterReferencesFromScene(
  scene: { characters?: unknown; orderIndex?: number | null },
  currentCharacters?: CharacterMemoryRecord[],
): Array<{ name: string; promptIngredient: string }> {
  const currentByName = new Map((currentCharacters ?? []).map((character) => [character.name.toLowerCase(), character]));
  const currentReferences = (currentCharacters ?? []).map((character) => ({
    name: character.name,
    promptIngredient: characterPromptIngredient(character),
  }));
  if (!Array.isArray(scene.characters)) return currentReferences.slice(0, 4);
  const references = scene.characters.flatMap((character) => {
    if (typeof character === 'string') return [{ name: character, promptIngredient: character }];
    if (!character || typeof character !== 'object') return [];
    const record = character as { name?: unknown; promptIngredient?: unknown; visualDescription?: unknown };
    if (typeof record.name !== 'string') return [];
    const current = currentByName.get(record.name.toLowerCase());
    if (current) {
      return [{ name: current.name, promptIngredient: characterPromptIngredient(current) }];
    }
    return [{
      name: record.name,
      promptIngredient: typeof record.promptIngredient === 'string'
        ? record.promptIngredient
        : [record.name, typeof record.visualDescription === 'string' ? record.visualDescription : undefined].filter(Boolean).join(', '),
    }];
  });
  return references.length ? references : currentReferences.slice(0, 4);
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

function storyDnaPromptText(value: unknown) {
  if (!value || typeof value !== 'object') return '';
  const dna = value as Record<string, unknown>;
  return [
    typeof dna.theme === 'string' ? `theme ${dna.theme}` : undefined,
    typeof dna.tone === 'string' ? `tone ${dna.tone}` : undefined,
    typeof dna.hero === 'string' ? `hero ${dna.hero}` : undefined,
    typeof dna.primaryGoal === 'string' ? `primary goal ${dna.primaryGoal}` : undefined,
    typeof dna.conflict === 'string' ? `conflict ${dna.conflict}` : undefined,
    typeof dna.resolution === 'string' ? `resolution ${dna.resolution}` : undefined,
    typeof dna.characterArc === 'string' ? `character arc ${dna.characterArc}` : undefined,
    Array.isArray(dna.moodPalette) ? `mood palette ${(dna.moodPalette as unknown[]).filter((item): item is string => typeof item === 'string').join(', ')}` : undefined,
    Array.isArray(dna.visualPalette) ? `visual palette ${(dna.visualPalette as unknown[]).filter((item): item is string => typeof item === 'string').join(', ')}` : undefined,
    typeof dna.cameraLanguage === 'string' ? `camera language ${dna.cameraLanguage}` : undefined,
  ].filter(Boolean).join('; ');
}

function buildStoryDna(project: {
  title: string;
  originalIdea?: string | null;
  synopsis?: string | null;
  theme?: string | null;
  tone?: string | null;
  visualStyle?: string | null;
}, characters: CharacterMemoryRecord[], scenes: Array<{ title: string; description: string; mood?: string | null }>) {
  const hero = characters[0]?.name ?? inferCharacterFromIdea(project.originalIdea ?? project.title).name;
  return {
    theme: project.theme ?? 'growth through a small adventure',
    tone: project.tone ?? 'warm, hopeful, child-safe',
    visualStyle: normaliseStoryVisualStyle(project.visualStyle),
    hero,
    primaryGoal: characters[0]?.goal ? enumLabel(characters[0].goal) : 'complete the story journey',
    conflict: scenes.find((scene) => /problem|challenge|trouble/i.test(`${scene.title} ${scene.description}`))?.description ?? 'a gentle obstacle to overcome',
    resolution: scenes.find((scene) => /ending|happy|finish|home/i.test(`${scene.title} ${scene.description}`))?.description ?? 'a positive ending with learning',
    characterArc: characters[0]?.evolutionStage ?? `${hero} grows in confidence while staying visually consistent`,
    moodPalette: Array.from(new Set(scenes.map((scene) => scene.mood).filter(Boolean))).slice(0, 6),
    visualPalette: [styleLabel(project.visualStyle), 'portrait 9:16', 'clear character silhouette'],
    cameraLanguage: 'simple readable storybook framing with stable character continuity',
  };
}

async function refreshStoryDna(ctx: any, projectId: string) {
  const project = await (ctx.prisma as any).storyProject.findUnique({
    where: { id: projectId },
    include: {
      characterMemory: { orderBy: { createdAt: 'asc' } },
      sceneSeeds: { orderBy: { orderIndex: 'asc' }, select: { title: true, description: true, mood: true } },
    },
  });
  if (!project) return null;
  const storyDna = buildStoryDna(project, project.characterMemory, project.sceneSeeds);
  await (ctx.prisma as any).storyProject.update({ where: { id: projectId }, data: { storyDna } });
  return storyDna;
}

export function composeScenePromptText(input: {
  scene: ScenePromptContext;
  outputType: PromptOutputType;
  provider: PromptProvider;
  audienceMode: StoryAudienceMode;
}) {
  const meta = PROMPT_PROVIDER_META[input.provider];
  const characters = characterReferencesFromScene(input.scene, input.scene.project.characterMemory);
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
    input.scene.project.storyDna ? `story DNA: ${storyDnaPromptText(input.scene.project.storyDna)}` : undefined,
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

// Parse Phase A DirectedScene JSON safely (null if absent or invalid)
function safeParseDirectedScene(raw: unknown): DirectedScene | null {
  if (!raw || typeof raw !== 'object') return null;
  const result = directedSceneSchema.safeParse(raw);
  return result.success ? result.data : null;
}

// Parse Phase A StoryBlueprint JSON safely (null if absent or invalid)
function safeParseStoryBlueprint(raw: unknown): StoryBlueprint | null {
  if (!raw || typeof raw !== 'object') return null;
  const result = storyBlueprintSchema.safeParse(raw);
  return result.success ? result.data : null;
}

// Build V2 base prompt from structured composer
function composeV2BasePrompt(
  input: Parameters<typeof composeEnhancedScenePrompt>[1],
  ds: DirectedScene | null,
) {
  const meta = PROMPT_PROVIDER_META[input.provider];
  // Phase A blueprint is persisted on StoryChapter and threaded in via scene.chapter.
  // Malformed or legacy JSON safely degrades to null (V2 composes without blueprint continuity).
  const blueprint = safeParseStoryBlueprint(input.scene.chapter?.blueprint);
  const medium: 'IMAGE' | 'VIDEO' = input.outputType === 'SHORT_VIDEO' ? 'VIDEO' : 'IMAGE';
  const v2Out = composeV2({
    scene: input.scene,
    project: input.scene.project as any,
    medium,
    maxPromptLength: meta.maxPromptLength,
    maxNegativePromptLength: meta.maxNegativePromptLength,
    audienceMode: input.audienceMode,
    directedScene: ds,
    blueprint,
  });
  return {
    ...v2Out,
    // Shape compatible with composeScenePromptText output
    prompt: v2Out.prompt,
    negativePrompt: v2Out.negativePrompt,
    aspectRatio: meta.defaultAspectRatio,
    duration: input.outputType === 'SHORT_VIDEO' ? (meta.defaultDuration ?? 5) : undefined,
    maxPromptLength: meta.maxPromptLength,
    providerLabel: meta.label,
    director: directorSettingsFromScene(input.scene),
    providerHints: {
      camera: medium === 'VIDEO' ? 'stable gentle motion, consistent subject' : 'single clean keyframe, clear character',
      lighting: 'warm, clear, style-consistent lighting',
      composition: '9:16 vertical, no text or UI',
    },
    isV2: true,
    v2Canonical: v2Out.canonical,
  };
}

export async function composeEnhancedScenePrompt(
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
  const meta = PROMPT_PROVIDER_META[input.provider];

  // V2 path: parse Phase A structures and use structured composer
  let base: ReturnType<typeof composeScenePromptText> & { isV2?: boolean; v2Canonical?: unknown };
  let characterIdentity: string;

  if (isVisualPromptComposerV2Enabled()) {
    const ds = safeParseDirectedScene(input.scene.directorMetadata);
    try {
      const v2 = composeV2BasePrompt(input, ds);
      base = v2 as any;
      characterIdentity = v2.characterIdentity;
    } catch (err) {
      // Non-fatal fallback: log and fall through to V1
      console.warn('[vpc2] V2 composer failed, falling back to V1:', err instanceof VpcError ? err.code : err);
      base = composeScenePromptText(input);
      const characters = characterReferencesFromScene(input.scene, input.scene.project.characterMemory);
      characterIdentity = characters.length
        ? characters.map((character) => character.promptIngredient).join('; ')
        : 'use the established main character design from the story';
    }
  } else {
    base = composeScenePromptText(input);
    const characters = characterReferencesFromScene(input.scene, input.scene.project.characterMemory);
    characterIdentity = characters.length
      ? characters.map((character) => character.promptIngredient).join('; ')
      : 'use the established main character design from the story';
  }
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
      characterIdentity,
      storyDna: input.scene.project.storyDna ?? null,
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
      characterIdentity,
      storyDna: input.scene.project.storyDna ?? null,
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

  if (requestedModel === 'FLUX2') {
    return {
      provider: 'fal',
      model: 'fal-ai/flux-2',
      requestedModel,
    };
  }

  return {
    provider: requestedModel,
    model: requestedModel,
    requestedModel,
  };
}

function sceneVideoProviderInfo(requestedModel: SceneVideoModel) {
  if (requestedModel === 'H3_MAX') {
    return {
      provider: 'fal',
      model: 'minimax/h3-max-turbo/image-to-video',
      requestedModel,
    };
  }
  return {
    provider: requestedModel,
    model: requestedModel,
    requestedModel,
  };
}

/** Default instrumental music prompt derived from the project's creative fields. */
function defaultMusicPrompt(project: { genre?: string | null; tone?: string | null; theme?: string | null }): string {
  return [
    project.genre ? `genre: ${project.genre}` : null,
    project.tone ? `tone: ${project.tone}` : null,
    project.theme ? `theme: ${project.theme}` : null,
    'instrumental cinematic background score for a short vertical film',
    'no vocals, loopable, gentle build, seamless',
  ].filter(Boolean).join(', ');
}

function formatVttTimestamp(seconds: number): string {
  const value = Math.max(0, seconds);
  const hh = Math.floor(value / 3600);
  const mm = Math.floor((value % 3600) / 60);
  const ss = Math.floor(value % 60);
  const ms = Math.round((value - Math.floor(value)) * 1000);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

/** Build a WebVTT caption track from timed speech cues (Phase 11 — sidecar captions). */
export function buildWebVtt(entries: Array<{ start: number; duration?: number | null; text: string }>): string {
  const lines = ['WEBVTT', ''];
  entries.forEach((entry, index) => {
    const start = Math.max(0, entry.start ?? 0);
    const end = start + Math.max(0.5, entry.duration ?? 2.5);
    lines.push(String(index + 1));
    lines.push(`${formatVttTimestamp(start)} --> ${formatVttTimestamp(end)}`);
    lines.push(entry.text.trim());
    lines.push('');
  });
  return lines.join('\n');
}

async function waitForGenerationOutput(model: SupportedModel, providerJobId: string, immediateUrl?: string) {
  if (immediateUrl) return immediateUrl;
  const started = Date.now();
  const timeoutMs = 180_000;
  while (Date.now() - started < timeoutMs) {
    const status = await pollJobStatus(model, providerJobId);
    if (status.status === 'completed' && status.outputUrl) return status.outputUrl;
    if (status.status === 'failed') throw new Error(status.error?.message ?? 'Generation failed');
    if (status.status === 'cancelled') throw new Error(status.error?.message ?? 'Generation was cancelled');
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

function creativeCriticSettings(project: {
  creativeCriticMode?: string | null;
  creativeCriticThreshold?: number | null;
  creativeCriticMaxRetries?: number | null;
  audienceMode?: string | null;
}) {
  const envEnabled = process.env.CREATIVE_CRITIC_ENABLED !== 'false';
  const mode = !envEnabled ? 'OFF' : (project.creativeCriticMode ?? 'SUGGEST');
  const maxRetries = Math.min(3, Math.max(0, project.creativeCriticMaxRetries ?? creativeCriticMaxRetries()));
  return {
    mode,
    threshold: project.creativeCriticThreshold ?? creativeCriticThreshold(),
    maxRetries,
  };
}

function safeCriticRunForR16(run: any) {
  if (!run) return null;
  return {
    id: run.id,
    assetId: run.assetId,
    sceneId: run.sceneId,
    status: run.status,
    recommendation: run.recommendation,
    completedAt: run.completedAt,
  };
}

function attachCriticRunsToProject(project: any, criticRuns: any[], isR16?: boolean) {
  const runsByAsset = new Map<string, any[]>();
  for (const run of criticRuns) {
    const list = runsByAsset.get(run.assetId) ?? [];
    list.push(isR16 ? safeCriticRunForR16(run) : run);
    runsByAsset.set(run.assetId, list.filter(Boolean));
  }
  return {
    ...project,
    sceneSeeds: (project.sceneSeeds ?? []).map((scene: any) => ({
      ...scene,
      assets: (scene.assets ?? []).map((asset: any) => ({
        ...(isR16 ? sanitizeR16AssetPayload(asset) : asset),
        criticRuns: isR16
          ? (runsByAsset.get(asset.id) ?? []).map(safeCriticRunForR16)
          : (runsByAsset.get(asset.id) ?? []),
      })),
    })),
  };
}

async function hydrateProjectCriticRuns(ctx: any, project: any) {
  const assetIds = (project.sceneSeeds ?? []).flatMap((scene: any) => (scene.assets ?? []).map((asset: any) => asset.id));
  if (assetIds.length === 0) return project;
  const criticRuns = await (ctx.prisma as any).creativeCriticRun.findMany({
    where: { assetId: { in: assetIds } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return attachCriticRunsToProject(project, criticRuns, ctx.isR16);
}

async function buildCreativeCriticInput(ctx: any, input: {
  projectId: string;
  sceneId: string;
  assetId: string;
}): Promise<CreativeCriticInput> {
  const scene = await (ctx.prisma as any).storySceneSeed.findFirst({
    where: { id: input.sceneId, projectId: input.projectId },
    include: {
      project: {
        select: {
          id: true,
          title: true,
          originalIdea: true,
          audienceMode: true,
          visualStyle: true,
          theme: true,
          tone: true,
          synopsis: true,
          storyDna: true,
          characterMemory: { orderBy: { createdAt: 'asc' } },
        },
      },
      prompts: { orderBy: { version: 'desc' }, take: 1 },
      assets: {
        where: { assetType: 'IMAGE', status: 'READY', deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 12,
      },
    },
  });
  if (!scene) throw new TRPCError({ code: 'NOT_FOUND', message: 'Story scene not found' });
  const asset = scene.assets.find((item: any) => item.id === input.assetId);
  if (!asset?.assetUrl) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Ready image asset is required for creative review' });
  const generationJob = asset.generationJobId
    ? await ctx.prisma.generationJob.findUnique({ where: { id: asset.generationJobId } })
    : null;
  const previousScene = await (ctx.prisma as any).storySceneSeed.findFirst({
    where: { projectId: input.projectId, orderIndex: { lt: scene.orderIndex } },
    orderBy: { orderIndex: 'desc' },
    include: {
      prompts: { orderBy: { version: 'desc' }, take: 1 },
      assets: { where: { assetType: 'IMAGE', status: 'READY', deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 4 },
    },
  });
  const previousActiveAsset = previousScene?.assets?.find((item: any) => item.id === previousScene.activeImageAssetId)
    ?? previousScene?.assets?.find((item: any) => item.isLatest)
    ?? previousScene?.assets?.[0]
    ?? null;
  const latestPrompt = scene.prompts?.[0] ?? null;
  const creativeSpecification = {
    projectTitle: scene.project.title,
    originalIdea: scene.project.originalIdea,
    sceneTitle: scene.title,
    sceneDescription: scene.description,
    locationType: scene.locationType,
    indoorOutdoor: scene.indoorOutdoor,
    mood: scene.mood,
    selectedVisualStyle: scene.project.visualStyle,
    characterIdentity: characterReferencesFromScene(scene, scene.project.characterMemory).map((character) => character.promptIngredient),
    promptVersion: latestPrompt?.version ?? null,
    promptMetadata: latestPrompt?.metadata ?? null,
  };
  return {
    assetUrl: asset.assetUrl,
    assetId: asset.id,
    projectId: input.projectId,
    sceneId: input.sceneId,
    creativeSpecification,
    storyDna: scene.project.storyDna,
    visualDna: {
      visualStyle: normaliseStoryVisualStyle(scene.project.visualStyle),
      styleLabel: styleLabel(scene.project.visualStyle),
      portraitFormat: `${asset.width ?? 720}x${asset.height ?? 1280}`,
    },
    characterDirector: scene.project.characterMemory,
    sceneDirector: directorSettingsFromScene(scene),
    selectedVisualStyle: scene.project.visualStyle,
    previousActiveSceneAsset: previousActiveAsset ? {
      id: previousActiveAsset.id,
      sceneId: previousActiveAsset.sceneId,
      width: previousActiveAsset.width,
      height: previousActiveAsset.height,
      creativeStatus: previousActiveAsset.creativeStatus,
      criticScore: previousActiveAsset.criticScore,
      criticRecommendation: previousActiveAsset.criticRecommendation,
    } : null,
    previousSceneCreativeSpecification: previousScene ? {
      title: previousScene.title,
      description: previousScene.description,
      promptVersion: previousScene.prompts?.[0]?.version ?? null,
      promptMetadata: previousScene.prompts?.[0]?.metadata ?? null,
    } : null,
    providerMetadata: {
      provider: asset.provider,
      model: asset.model,
      status: asset.status,
      width: asset.width,
      height: asset.height,
    },
    generationMetadata: generationJob?.metadata as Record<string, unknown> | null,
  };
}

function runCreativeCriticInBackground(ctx: any, input: {
  runId: string;
  projectId: string;
  sceneId: string;
  assetId: string;
  audienceMode: StoryAudienceMode;
  threshold?: number | null;
}) {
  void (async () => {
    const criticInput = await buildCreativeCriticInput(ctx, input);
    await runCreativeCritic(ctx.prisma, {
      runId: input.runId,
      userId: ctx.user?.id,
      audienceMode: input.audienceMode,
      criticInput,
      threshold: input.threshold,
    });
  })().catch((error) => {
    console.warn('[creativeCritic] background run failed', error);
  });
}

async function generateSceneImageAsset(
  ctx: any,
  input: { projectId: string; sceneId: string; model: SceneImageModel; isRegeneration?: boolean; creativeCriticRunId?: string | null; instruction?: string },
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
          tone: true,
          synopsis: true,
          storyDna: true,
          characterMemory: { orderBy: { createdAt: 'asc' } },
        },
      },
      chapter: { select: { blueprint: true } },
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
  let composed = await composeEnhancedScenePrompt(ctx, {
    scene,
    outputType: 'IMAGE',
    provider: 'FLUX',
    audienceMode,
    projectId: project.id,
    analyticsSource: 'generation',
  });
  if (input.creativeCriticRunId) {
    const criticRun = await (ctx.prisma as any).creativeCriticRun.findFirst({
      where: { id: input.creativeCriticRunId, projectId: project.id, sceneId: scene.id },
    });
    const planSummary = criticRun?.improvementPlan ? improvementPlanSummary(criticRun.improvementPlan, 6) : [];
    if (planSummary.length) {
      composed = {
        ...composed,
        deterministicPrompt: `${composed.deterministicPrompt}. Creative specification improvements: ${planSummary.join('; ')}`,
        prompt: limitText(`${composed.prompt}. Creative specification improvements: ${planSummary.join('; ')}`, GENERATION_PROMPT_MAX_LENGTH),
        providerHints: {
          ...composed.providerHints,
          criticImprovements: planSummary.join('; '),
        } as any,
      };
    }
  }

  // Phase 11 — creator regeneration instruction (natural-language edit).
  if (input.instruction?.trim()) {
    const instruction = input.instruction.trim();
    const instructionMod = await moderatePrompt(instruction);
    if (!instructionMod.allowed) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: instructionMod.reason ?? 'Your change request violates our content guidelines.' });
    }
    composed = {
      ...composed,
      prompt: limitText(`${composed.prompt}. Change requested by the creator: ${instruction}`, GENERATION_PROMPT_MAX_LENGTH),
      deterministicPrompt: composed.deterministicPrompt
        ? `${composed.deterministicPrompt}. Creator change: ${instruction}`
        : composed.deterministicPrompt,
      providerHints: { ...composed.providerHints, creatorInstruction: instruction } as any,
    };
  }

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
      provider: input.model === 'FLUX' ? 'RunPod' : input.model === 'FLUX2' ? 'fal' : input.model,
      model: input.model,
      promptVersionId: null,
      composedPrompt: composed.prompt,
      negativePrompt: composed.negativePrompt,
      status: 'GENERATING',
      creativeStatus: 'UNDER_REVIEW',
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
    const charactersUsed = characterReferencesFromScene(scene, scene.project.characterMemory);
    await Promise.all(charactersUsed.map((character) =>
      trackStoryAnalytics(ctx, {
        event: 'character_used_in_generation',
        projectId: project.id,
        audienceMode,
        properties: {
          sceneId: scene.id,
          assetId: asset.id,
          characterName: character.name,
          model: input.model,
          style: composed.styleUsed,
        },
      }),
    ));

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
          characterIdentity: composed.characterIdentity,
          storyDna: composed.storyDna,
          visualStyle: normaliseStoryVisualStyle(project.visualStyle),
          visualStyleLabel: composed.styleUsed,
          director: composed.director,
          promptEnhancerProvider: composed.enhancerProvider,
          promptEnhancerModel: composed.enhancerModel,
          providerHints: composed.providerHints,
          sourceCreativeCriticRunId: input.creativeCriticRunId ?? null,
          promptComposerVersion: (composed as any).isV2 ? 'visual_prompt_v2' : 'v1',
          vpcCanonical: (composed as any).isV2 ? (composed as any).v2Canonical : undefined,
        },
      },
    });

    let providerOutputUrl: string;
    let providerJobId: string | undefined;
    if (!process.env.RUNPOD_API_KEY && input.model === 'FLUX' && process.env.NODE_ENV !== 'production') {
      providerJobId = `dev-placeholder-${asset.id}`;
      providerOutputUrl = devSceneSvgDataUrl(scene.title, characterReferencesFromScene(scene, scene.project.characterMemory)[0]?.name ?? 'Story Friend');
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
        data: {
          latestImageAssetId: asset.id,
          activeImageAssetId: scene.activeImageAssetId ?? asset.id,
          imageStatus: 'READY',
          imageUrl: scene.activeImageAssetId ? scene.imageUrl ?? assetUrl : assetUrl,
        },
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
          sourceCreativeCriticRunId: input.creativeCriticRunId ?? null,
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

    const criticSettings = creativeCriticSettings(project);
    let criticRun = null;
    if (criticSettings.mode !== 'OFF') {
      criticRun = await createCreativeCriticRun(ctx.prisma, {
        projectId: project.id,
        sceneId: scene.id,
        assetId: asset.id,
        retryAttempt: input.creativeCriticRunId ? 1 : 0,
        parentCriticRunId: input.creativeCriticRunId ?? null,
      });
      runCreativeCriticInBackground(ctx, {
        runId: criticRun.id,
        projectId: project.id,
        sceneId: scene.id,
        assetId: asset.id,
        audienceMode,
        threshold: criticSettings.threshold,
      });
    }

    return {
      scene: await ctx.prisma.storySceneSeed.findFirst({
        where: { id: scene.id },
        include: { assets: { orderBy: { createdAt: 'desc' }, take: 12 }, prompts: { orderBy: { createdAt: 'desc' }, take: 6 } },
      }),
      asset: await (ctx.prisma as any).storySceneAsset.findUnique({ where: { id: asset.id } }),
      criticRun: ctx.isR16 ? safeCriticRunForR16(criticRun) : criticRun,
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

async function generateSceneVideoAsset(
  ctx: any,
  input: { projectId: string; sceneId: string; model: SceneVideoModel; duration?: number; isRegeneration?: boolean; instruction?: string; resolution?: string },
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
          tone: true,
          synopsis: true,
          storyDna: true,
          productionManifest: true,
          characterMemory: { orderBy: { createdAt: 'asc' } },
        },
      },
      chapter: { select: { blueprint: true } },
      assets: { where: { assetType: 'IMAGE', status: 'READY' }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
  if (!scene) throw new TRPCError({ code: 'NOT_FOUND', message: 'Story scene not found' });

  // H3-Max is image-to-video — the scene's latest ready image is the opening frame.
  const seedImage = scene.assets?.[0];
  if (!seedImage?.assetUrl) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Generate a scene image first, then animate it into video.' });
  }

  const audienceMode = resolveAudienceMode(ctx, project.audienceMode as StoryAudienceMode);
  // Phase 16.5 — consume the persisted ProductionManifest for this scene.
  const manifest = project.productionManifest as unknown as ProductionManifest | null;
  const manifestScene = manifest?.scenes?.find((s) => s.scene_id === scene.orderIndex);
  const duration = Math.min(15, Math.max(4, manifestScene?.duration_sec ?? input.duration ?? 5));

  await trackStoryAnalytics(ctx, {
    event: 'scene_generation_started',
    projectId: project.id,
    audienceMode,
    properties: { sceneId: scene.id, model: input.model, generationType: 'VIDEO', isRegeneration: Boolean(input.isRegeneration) },
  });

  let composed = await composeEnhancedScenePrompt(ctx, {
    scene,
    outputType: 'SHORT_VIDEO',
    provider: input.model as PromptProvider,
    audienceMode,
    projectId: project.id,
    analyticsSource: 'generation',
  });

  // Phase 16.5 — prefer the persisted manifest's `minimax_video_prompt` (the
  // cinematographer-authored spec) over VPC composition for this scene.
  if (manifestScene) {
    composed = {
      ...composed,
      prompt: manifestScene.minimax_video_prompt,
      providerHints: {
        ...composed.providerHints,
        productionManifestSceneId: manifestScene.scene_id,
        cameraMotion: manifestScene.camera_motion,
      } as any,
    };
  }

  // Phase 11 — creator regeneration instruction (natural-language edit).
  if (input.instruction?.trim()) {
    const instruction = input.instruction.trim();
    const instructionMod = await moderatePrompt(instruction);
    if (!instructionMod.allowed) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: instructionMod.reason ?? 'Your change request violates our content guidelines.' });
    }
    composed = {
      ...composed,
      prompt: limitText(`${composed.prompt}. Change requested by the creator: ${instruction}`, GENERATION_PROMPT_MAX_LENGTH),
      providerHints: { ...composed.providerHints, creatorInstruction: instruction } as any,
    };
  }

  const moderation = await moderatePrompt(composed.prompt);
  if (!moderation.allowed) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: moderation.reason ?? 'Please try a safer animation idea.' });
  }

  const providerInfo = sceneVideoProviderInfo(input.model);
  const asset = await (ctx.prisma as any).storySceneAsset.create({
    data: {
      sceneId: scene.id,
      projectId: project.id,
      userId: ctx.user.id,
      assetType: 'VIDEO',
      provider: providerInfo.provider,
      model: providerInfo.model,
      promptVersionId: null,
      composedPrompt: composed.prompt,
      negativePrompt: composed.negativePrompt,
      durationSeconds: duration,
      status: 'GENERATING',
      creativeStatus: 'DRAFT',
      isLatest: false,
    },
  });

  const featureKey = MODEL_FEATURE_KEY[input.model as SupportedModel];
  let creditsUsed = 0;
  const generationRef = `story-scene-video-${asset.id}`;

  try {
    if (featureKey) {
      creditsUsed = await deductCredits(ctx.prisma, ctx.user.id, featureKey, generationRef, `Story scene video: ${scene.title}`);
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
        generationType: 'VIDEO',
        enhancerProvider: composed.enhancerProvider,
      },
    });

    const generationJob = await ctx.prisma.generationJob.create({
      data: {
        userId: ctx.user.id,
        model: input.model,
        prompt: composed.prompt,
        negativePrompt: composed.negativePrompt,
        duration,
        aspectRatio: composed.aspectRatio ?? '9:16',
        seedImageUrl: manifestScene?.first_frame_image_url ?? seedImage.assetUrl,
        resolution: manifestScene?.resolution,
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
          providerHints: composed.providerHints,
          promptComposerVersion: (composed as any).isV2 ? 'visual_prompt_v2' : 'v1',
        },
      },
    });

    const submitted = await submitGenerationJob({
      model: input.model as SupportedModel,
      prompt: composed.prompt,
      negativePrompt: composed.negativePrompt,
      duration,
      aspectRatio: composed.aspectRatio,
      seedImageUrl: manifestScene?.first_frame_image_url ?? seedImage.assetUrl,
      resolution: input.resolution ?? manifestScene?.resolution,
    });
    const providerJobId = submitted.providerJobId;

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

    const providerOutputUrl = await waitForGenerationOutput(input.model as SupportedModel, providerJobId, submitted.outputUrl);

    const r2Key = `story-projects/${project.id}/scenes/${scene.id}/videos/${asset.id}.mp4`;
    const assetUrl = providerOutputUrl.startsWith('data:')
      ? (await uploadBufferToR2(Buffer.from(providerOutputUrl.split(',')[1] ?? '', 'base64'), r2Key, 'video/mp4')) ?? providerOutputUrl
      : await mirrorUrlToR2(providerOutputUrl, r2Key, 'video/mp4');
    const dimensions = imageDimensions(composed.aspectRatio ?? '9:16');

    await ctx.prisma.$transaction(async (tx: any) => {
      await tx.storySceneAsset.updateMany({ where: { sceneId: scene.id, assetType: 'VIDEO' }, data: { isLatest: false } });
      await tx.storySceneAsset.update({
        where: { id: asset.id },
        data: {
          status: 'READY',
          assetUrl,
          thumbnailUrl: seedImage.assetUrl,
          r2Key,
          provider: providerInfo.provider,
          model: providerInfo.model,
          width: dimensions.width,
          height: dimensions.height,
          generationJobId: generationJob.id,
          isLatest: true,
        },
      });
      await tx.generationJob.update({
        where: { id: generationJob.id },
        data: {
          outputUrl: assetUrl,
          thumbnailUrl: seedImage.assetUrl,
          status: 'COMPLETED',
        },
      });
    });

    await trackStoryAnalytics(ctx, {
      event: 'scene_generation_completed',
      projectId: project.id,
      audienceMode,
      properties: {
        sceneId: scene.id,
        assetId: asset.id,
        requestedModel: input.model,
        model: providerInfo.model,
        provider: providerInfo.provider,
        r2Key,
        generationType: 'VIDEO',
        isRegeneration: Boolean(input.isRegeneration),
      },
    });

    return {
      scene: await (ctx.prisma as any).storySceneSeed.findFirst({
        where: { id: scene.id },
        include: { assets: { orderBy: { createdAt: 'desc' }, take: 12 } },
      }),
      asset: await (ctx.prisma as any).storySceneAsset.findUnique({ where: { id: asset.id } }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Video generation failed. Please try again.';
    await trackStoryAnalytics(ctx, {
      event: 'scene_generation_failed',
      projectId: project.id,
      audienceMode,
      properties: { sceneId: scene.id, assetId: asset.id, model: input.model, generationType: 'VIDEO', message },
    });
    await (ctx.prisma as any).storySceneAsset.update({
      where: { id: asset.id },
      data: { status: 'FAILED', errorMessage: message, isLatest: false },
    }).catch(() => {});
    if (creditsUsed > 0 && featureKey) {
      await refundCredits(ctx.prisma, ctx.user.id, creditsUsed, featureKey, generationRef, 'Refund: story scene video failed').catch(() => {});
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
    const { asset: selectedAsset, imageUrl, imageSource } = selectStorybookImageForScene(scene);
    return {
      pageNumber: index + 1,
      sceneId: scene.id,
      assetId: selectedAsset?.id ?? null,
      imageSource,
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

/**
 * Shared speech-generation core used by `generateCueSpeech` and
 * `generateSceneNarration` (Phase 16.4). Moderate → credit gate → ElevenLabs →
 * R2 `AudioAsset(GENERATED_SPEECH)` → link `AudioCue.audioAssetId`; refund on
 * failure. The caller owns cue lookup/creation and the ELEVENLABS gate.
 */
async function generateSpeechForCue(
  ctx: any,
  input: { projectId: string; cueId: string; cueText: string; voiceRef?: string | null; voiceId?: string; modelId?: string },
) {
  const moderation = await moderatePrompt(input.cueText);
  if (!moderation.allowed) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: moderation.reason ?? 'Narration text violates our content guidelines.' });
  }

  const rate = await resolveFeatureCreditRate(ctx.prisma, STORY_SPEECH_GENERATION_FEATURE_KEY);
  if (!rate.configured) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Narration generation pricing is not configured yet. Set the `story:speech_generation` credit rate in Admin → Credits.',
      cause: { errorCode: rate.errorCode },
    });
  }

  const creditsUsed = await deductCredits(ctx.prisma, ctx.user.id, STORY_SPEECH_GENERATION_FEATURE_KEY, input.cueId, 'Narration generation');

  try {
    const voiceId = input.voiceId || input.voiceRef || elevenLabsDefaultVoiceId();
    const audio = await synthesizeSpeech({ text: input.cueText, voiceId, modelId: input.modelId });
    const storageKey = `story-projects/${input.projectId}/audio/${input.cueId}-${Date.now()}.mp3`;
    const publicUrl = await uploadBufferToR2(audio, storageKey, 'audio/mpeg');
    if (!publicUrl) throw new Error('R2 storage is not configured for narration.');

    const asset = await ctx.prisma.audioAsset.create({
      data: {
        projectId: input.projectId,
        userId: ctx.user.id,
        storageProvider: 'R2',
        storageKey,
        publicUrl,
        mimeType: 'audio/mpeg',
        fileSizeBytes: audio.length,
        sourceKind: 'GENERATED_SPEECH',
      },
    });
    const updatedCue = await ctx.prisma.audioCue.update({
      where: { id: input.cueId },
      data: { audioAssetId: asset.id },
      include: { audioAsset: true },
    });
    await trackStoryAnalytics(ctx, {
      event: 'audio_cue_updated',
      projectId: input.projectId,
      properties: { cueId: input.cueId, generation: 'speech', model: elevenLabsModelId(), assetId: asset.id },
    });
    return { cue: updatedCue, asset };
  } catch (error) {
    await refundCredits(ctx.prisma, ctx.user.id, creditsUsed, STORY_SPEECH_GENERATION_FEATURE_KEY, input.cueId, 'Refund: narration generation failed').catch(() => {});
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: error instanceof Error ? error.message : 'Narration generation failed',
    });
  }
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

      // Story Blueprint — Phase A: plan before drafting when enabled
      let blueprint: StoryBlueprint | null = null;
      if (isStoryIntelligenceEnabled()) {
        try {
          blueprint = await storyIntelligenceProvider.planStory({ idea, answers, audienceMode });
          await trackStoryAnalytics(ctx, {
            event: 'story_playground_opened' as StoryAnalyticsEventName,
            projectId: project.id,
            audienceMode,
            properties: { stage: 'blueprint', provider: storyIntelligenceProvider.name },
          });
        } catch (error) {
          console.warn('[story.generateStory] blueprint failed — continuing without:', error instanceof StoryIntelligenceError ? error.code : error);
        }
      }

      const story = await storyTextService.generateStory(idea, answers, audienceMode, { userId: ctx.user.email ?? ctx.user.id });
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
            ...(blueprint ? { blueprint: blueprint as object } : {}),
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
                personalityTraits: character.personalityTraits ?? [],
                motivation: character.motivation ?? null,
                fear: character.fear ?? null,
                goal: character.goal ?? null,
                favoriteExpression: character.favoriteExpression ?? null,
                walkingStyle: character.walkingStyle ?? null,
                speakingStyle: character.speakingStyle ?? null,
                relationships: character.relationships ?? [],
                evolutionStage: character.evolutionStage ?? null,
                evolutionNotes: character.evolutionNotes ?? null,
                evolutionSceneOrder: character.evolutionSceneOrder ?? null,
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
            storyDna: buildStoryDna(
              {
                title: story.title,
                originalIdea: idea,
                synopsis: story.summary,
                theme: story.theme,
                tone: project.tone ?? story.theme,
                visualStyle: project.visualStyle,
              },
              characterMemory,
              story.sceneHints,
            ),
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
              personalityTraits: character.personalityTraits ?? [],
              motivation: character.motivation ?? null,
              fear: character.fear ?? null,
              goal: character.goal ?? null,
              favoriteExpression: character.favoriteExpression ?? null,
              walkingStyle: character.walkingStyle ?? null,
              speakingStyle: character.speakingStyle ?? null,
              relationships: character.relationships ?? [],
              evolutionStage: character.evolutionStage ?? null,
              evolutionNotes: character.evolutionNotes ?? null,
              evolutionSceneOrder: character.evolutionSceneOrder ?? null,
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
      personalityTraits: z.array(personalityTraitSchema).max(10).optional(),
      motivation: motivationSchema.nullable().optional(),
      fear: fearSchema.nullable().optional(),
      goal: characterGoalSchema.nullable().optional(),
      favoriteExpression: favoriteExpressionSchema.nullable().optional(),
      walkingStyle: walkingStyleSchema.nullable().optional(),
      speakingStyle: speakingStyleSchema.nullable().optional(),
      relationships: z.array(characterRelationshipSchema).max(12).optional(),
      evolutionStage: z.string().max(120).optional().nullable(),
      evolutionNotes: z.string().max(500).optional().nullable(),
      evolutionSceneOrder: z.number().int().min(1).optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const project = await ensureProject(ctx, input.projectId);
      const character = await ctx.prisma.storyCharacterMemory.findFirst({
        where: { id: input.characterId, projectId: input.projectId },
      });
      if (!character) throw new TRPCError({ code: 'NOT_FOUND', message: 'Story character not found' });
      const previousTraits = asStringList((character as CharacterMemoryRecord).personalityTraits);
      const previousRelationships = asRelationshipList((character as CharacterMemoryRecord).relationships);

      const updatedCharacter = await ctx.prisma.storyCharacterMemory.update({
        where: { id: input.characterId },
        data: {
          name: input.name,
          role: input.role || null,
          species: input.species || null,
          ageDescription: input.ageDescription || null,
          gender: input.gender || null,
          visualDescription: input.visualDescription,
          personalityTraits: input.personalityTraits ?? previousTraits,
          motivation: input.motivation ?? null,
          fear: input.fear ?? null,
          goal: input.goal ?? null,
          favoriteExpression: input.favoriteExpression ?? null,
          walkingStyle: input.walkingStyle ?? null,
          speakingStyle: input.speakingStyle ?? null,
          relationships: input.relationships ?? previousRelationships,
          evolutionStage: input.evolutionStage || null,
          evolutionNotes: input.evolutionNotes || null,
          evolutionSceneOrder: input.evolutionSceneOrder ?? null,
          directorChangedAt: new Date(),
        },
      });
      await trackStoryAnalytics(ctx, {
        event: 'character_updated',
        projectId: input.projectId,
        audienceMode: project.audienceMode,
        properties: {
          characterId: input.characterId,
          characterName: input.name,
          traits: input.personalityTraits,
          motivation: input.motivation,
          fear: input.fear,
          goal: input.goal,
          walkingStyle: input.walkingStyle,
        },
      });
      await trackStoryAnalytics(ctx, {
        event: 'character_bible_edited',
        projectId: input.projectId,
        audienceMode: project.audienceMode,
        properties: { characterId: input.characterId, characterName: input.name },
      });
      if (input.personalityTraits && input.personalityTraits.join('|') !== previousTraits.join('|')) {
        await trackStoryAnalytics(ctx, {
          event: 'personality_changed',
          projectId: input.projectId,
          audienceMode: project.audienceMode,
          properties: { characterId: input.characterId, characterName: input.name, traits: input.personalityTraits },
        });
      }
      if (input.relationships && JSON.stringify(input.relationships) !== JSON.stringify(previousRelationships)) {
        await trackStoryAnalytics(ctx, {
          event: 'relationship_changed',
          projectId: input.projectId,
          audienceMode: project.audienceMode,
          properties: { characterId: input.characterId, characterName: input.name, relationshipCount: input.relationships.length },
        });
      }
      if (input.evolutionStage || input.evolutionNotes || input.evolutionSceneOrder) {
        await trackStoryAnalytics(ctx, {
          event: 'character_evolved',
          projectId: input.projectId,
          audienceMode: project.audienceMode,
          properties: {
            characterId: input.characterId,
            characterName: input.name,
            evolutionStage: input.evolutionStage,
            evolutionSceneOrder: input.evolutionSceneOrder,
          },
        });
      }
      await refreshStoryDna(ctx, input.projectId);
      return updatedCharacter;
    }),

  createCharacterMemory: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      name: z.string().min(1).max(80),
      role: z.string().max(80).optional(),
      species: z.string().max(80).optional(),
      ageDescription: z.string().max(120).optional(),
      gender: z.string().max(80).optional(),
      visualDescription: z.string().min(1).max(500),
      personalityTraits: z.array(personalityTraitSchema).max(10).default([]),
      motivation: motivationSchema.nullable().optional(),
      fear: fearSchema.nullable().optional(),
      goal: characterGoalSchema.nullable().optional(),
      favoriteExpression: favoriteExpressionSchema.nullable().optional(),
      walkingStyle: walkingStyleSchema.nullable().optional(),
      speakingStyle: speakingStyleSchema.nullable().optional(),
      relationships: z.array(characterRelationshipSchema).max(12).default([]),
    }))
    .mutation(async ({ ctx, input }) => {
      const project = await ensureProject(ctx, input.projectId);
      const character = await ctx.prisma.storyCharacterMemory.create({
        data: {
          projectId: input.projectId,
          name: input.name,
          role: input.role || null,
          species: input.species || null,
          ageDescription: input.ageDescription || null,
          gender: input.gender || null,
          visualDescription: input.visualDescription,
          personality: { traits: input.personalityTraits.map(enumLabel).filter(Boolean) },
          personalityTraits: input.personalityTraits,
          motivation: input.motivation ?? null,
          fear: input.fear ?? null,
          goal: input.goal ?? null,
          favoriteExpression: input.favoriteExpression ?? null,
          walkingStyle: input.walkingStyle ?? null,
          speakingStyle: input.speakingStyle ?? null,
          relationships: input.relationships,
          directorChangedAt: new Date(),
        },
      });
      await trackStoryAnalytics(ctx, {
        event: 'character_created',
        projectId: input.projectId,
        audienceMode: project.audienceMode,
        properties: { characterId: character.id, characterName: character.name, traits: input.personalityTraits },
      });
      await refreshStoryDna(ctx, input.projectId);
      return character;
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
      }, { userId: ctx.user.email ?? ctx.user.id });
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

      // Scene Director — Phase A: use intelligence when enabled, fall back to simple scenes
      type SceneRecord = {
        title: string;
        description: string;
        locationType?: string;
        indoorOutdoor?: string;
        mood?: string;
        characters: unknown[];
        directorMetadata?: object;
      };
      let sceneRecords: SceneRecord[];
      let directorProvider: string | undefined;

      if (isStoryIntelligenceEnabled()) {
        const chapter = project.chapters[0];
        const blueprint = chapter?.blueprint ? (chapter.blueprint as unknown as StoryBlueprint) : null;
        if (blueprint) {
          const characterContext = project.characterMemory
            .map((c) => `${c.name}${c.role ? ` (${c.role})` : ''}${c.visualDescription ? `: ${c.visualDescription}` : ''}`)
            .join('\n');
          const existingSceneHints = project.sceneSeeds.map((s) => ({
            title: s.title,
            description: s.description ?? '',
            locationType: s.locationType ?? undefined,
            mood: s.mood ?? undefined,
          }));
          const storyBody = chapter.enhancedBody ?? chapter.body ?? '';
          try {
            const directedScenes = await storyIntelligenceProvider.directScenes({
              blueprint,
              storyTitle: project.title ?? 'Untitled',
              storyBody,
              audienceMode: project.audienceMode as 'KIDS' | 'GENERAL',
              sceneCount: Math.max(blueprint.beats.length, 6),
              characterContext,
              existingSceneHints: existingSceneHints.length > 0 ? existingSceneHints : undefined,
            });
            sceneRecords = directedScenes.map((ds) => ({
              title: ds.title,
              description: ds.action,
              locationType: ds.location,
              mood: ds.mood,
              characters: ds.characters,
              directorMetadata: ds as object,
            }));
            directorProvider = storyIntelligenceProvider.name;
          } catch (error) {
            console.warn('[story.generateScenes] scene director failed — falling back to simple scenes:', error instanceof StoryIntelligenceError ? error.code : error);
            sceneRecords = buildSimpleScenes(project);
          }
        } else {
          sceneRecords = buildSimpleScenes(project);
        }
      } else {
        sceneRecords = buildSimpleScenes(project);
      }

      try {
        const createdScenes = await ctx.prisma.$transaction(async (tx: any) => {
          if (input.replaceExisting) {
            await tx.storySceneSeed.deleteMany({ where: { projectId: project.id } });
          }

          return Promise.all(sceneRecords.map((scene, index) =>
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
                ...(scene.directorMetadata ? { directorMetadata: scene.directorMetadata } : {}),
              },
            }),
          ));
        });
        await trackStoryAnalytics(ctx, {
          event: 'scene_generation_completed',
          projectId: project.id,
          audienceMode: project.audienceMode,
          properties: { sceneCount: createdScenes.length, reusedExisting: false, ...(directorProvider ? { provider: directorProvider } : {}) },
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

  /** Append a blank scene card to the project (Scenes tab "Add Scene"). */
  addScene: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const project = await ensureProject(ctx, input.projectId);
      const chapter = await ctx.prisma.storyChapter.findFirst({
        where: { projectId: project.id },
        orderBy: { chapterNumber: 'asc' },
        select: { id: true },
      });
      const maxOrder = await ctx.prisma.storySceneSeed.aggregate({
        where: { projectId: project.id },
        _max: { orderIndex: true },
      });
      const orderIndex = (maxOrder._max.orderIndex ?? 0) + 1;
      return ctx.prisma.storySceneSeed.create({
        data: {
          projectId: project.id,
          chapterId: chapter?.id ?? null,
          orderIndex,
          title: 'New Scene',
          description: '',
        },
      });
    }),

  enhanceNarrative: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.prisma.storyProject.findFirst({
        where: { id: input.projectId, userId: ctx.user.id },
        include: {
          chapters: { orderBy: { chapterNumber: 'asc' } },
          characterMemory: { orderBy: { createdAt: 'asc' } },
        },
      });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Story project not found' });
      const chapter = project.chapters[0];
      if (!chapter) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Create the story before enhancing narrative.' });

      if (!isStoryIntelligenceEnabled()) {
        return { enhancedBody: chapter.enhancedBody ?? null, skipped: true };
      }

      const blueprint = chapter.blueprint ? (chapter.blueprint as unknown as StoryBlueprint) : null;
      if (!blueprint) {
        return { enhancedBody: chapter.enhancedBody ?? null, skipped: true };
      }

      const characterContext = project.characterMemory
        .map((c) => `${c.name}${c.role ? ` (${c.role})` : ''}${c.visualDescription ? `: ${c.visualDescription}` : ''}`)
        .join('\n');

      const enhanced = await storyIntelligenceProvider.enhanceNarrative({
        blueprint,
        storyTitle: project.title ?? 'Untitled',
        storyBody: chapter.body,
        audienceMode: project.audienceMode as 'KIDS' | 'GENERAL',
        characterContext,
      });

      await ctx.prisma.storyChapter.update({
        where: { id: chapter.id },
        data: { enhancedBody: enhanced },
      });

      return { enhancedBody: enhanced, skipped: false };
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

  /** Edit a story chapter's title/summary/body (Edit Story). Body edits clear
   * the AI-enhanced narrative so stale enhanced text is never shown. */
  updateChapter: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      chapterId: z.string(),
      title: z.string().min(1).max(160).optional(),
      summary: z.string().max(500).optional(),
      body: z.string().min(20).max(6000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const project = await ensureProject(ctx, input.projectId);
      const chapter = await ctx.prisma.storyChapter.findFirst({
        where: { id: input.chapterId, projectId: input.projectId },
      });
      if (!chapter) throw new TRPCError({ code: 'NOT_FOUND', message: 'Story chapter not found' });

      if (input.body?.trim()) {
        const moderation = await moderatePrompt(input.body);
        if (!moderation.allowed) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: moderation.reason ?? 'Your edit violates our content guidelines.' });
        }
      }

      const updated = await ctx.prisma.storyChapter.update({
        where: { id: chapter.id },
        data: {
          ...(input.title !== undefined ? { title: input.title.trim() || chapter.title } : {}),
          ...(input.summary !== undefined ? { summary: input.summary.trim() } : {}),
          ...(input.body !== undefined ? { body: input.body.trim(), enhancedBody: null } : {}),
        },
      });
      await trackStoryAnalytics(ctx, {
        event: 'story_edited',
        projectId: input.projectId,
        audienceMode: project.audienceMode,
        properties: { chapterId: chapter.id, chapterNumber: chapter.chapterNumber },
      });
      return updated;
    }),

  /** Rewrite ONE paragraph per a directive (e.g. "Develop this idea"). Splits the
   * chapter body on blank lines (matching the client splitter), rewrites the
   * selected paragraph through the story-text provider chain, and saves the
   * chapter (clearing stale enhancedBody). */
  rewriteParagraph: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      chapterId: z.string(),
      paragraphIndex: z.number().int().min(0),
      directive: z.string().min(1).max(120),
    }))
    .mutation(async ({ ctx, input }) => {
      const project = await ensureProject(ctx, input.projectId);
      const chapter = await ctx.prisma.storyChapter.findFirst({
        where: { id: input.chapterId, projectId: input.projectId },
      });
      if (!chapter) throw new TRPCError({ code: 'NOT_FOUND', message: 'Story chapter not found' });

      const paragraphs = chapter.body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
      if (input.paragraphIndex >= paragraphs.length) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Paragraph not found.' });
      }
      const original = paragraphs[input.paragraphIndex];

      const directiveMod = await moderatePrompt(input.directive);
      if (!directiveMod.allowed) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: directiveMod.reason ?? 'Your request violates our content guidelines.' });
      }
      const paraMod = await moderatePrompt(original);
      if (!paraMod.allowed) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: paraMod.reason ?? 'This paragraph cannot be edited.' });
      }

      const audienceMode = (project.audienceMode as StoryAudienceMode) ?? 'GENERAL';
      const rewritten = await storyTextService.rewriteParagraph(
        {
          projectTitle: project.title,
          chapterNumber: chapter.chapterNumber,
          paragraph: original,
          directive: input.directive,
          audienceMode,
        },
        { userId: ctx.user.email ?? ctx.user.id },
      );

      const resultMod = await moderatePrompt(rewritten);
      if (!resultMod.allowed) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: resultMod.reason ?? 'The rewritten paragraph violates our content guidelines.' });
      }

      paragraphs[input.paragraphIndex] = rewritten.trim();
      const body = paragraphs.join('\n\n');
      const updated = await ctx.prisma.storyChapter.update({
        where: { id: chapter.id },
        data: { body, enhancedBody: null },
      });
      await trackStoryAnalytics(ctx, {
        event: 'story_paragraph_rewritten',
        projectId: input.projectId,
        audienceMode,
        properties: { chapterId: chapter.id, chapterNumber: chapter.chapterNumber, paragraphIndex: input.paragraphIndex, directive: input.directive },
      });
      return updated;
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
              tone: true,
              synopsis: true,
              storyDna: true,
              characterMemory: { orderBy: { createdAt: 'asc' } },
            },
          },
          chapter: { select: { blueprint: true } },
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
            characterIdentity: composed.characterIdentity,
            storyDna: composed.storyDna,
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
              tone: true,
              synopsis: true,
              storyDna: true,
              characterMemory: { orderBy: { createdAt: 'asc' } },
            },
          },
          chapter: { select: { blueprint: true } },
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
              characterIdentity: composed.characterIdentity,
              storyDna: composed.storyDna,
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

  /**
   * Phase 16.2 — Production Script Structurer. Builds the strict MiniMax H3 /
   * ElevenLabs ProductionManifest from the project's story text (chapters,
   * ordered). Returns `{ enabled: false }` when the fail-closed flag is off.
   */
  structureProductionManifest: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ensureProject(ctx, input.projectId);
      if (!isManifestStructurerEnabled()) {
        return { enabled: false as const, manifest: null as ProductionManifest | null };
      }
      const chapters = await ctx.prisma.storyChapter.findMany({
        where: { projectId: project.id },
        orderBy: { chapterNumber: 'asc' },
        select: { chapterNumber: true, title: true, body: true, enhancedBody: true },
      });
      const prose = chapters
        .map((c) => `${c.title ? `# ${c.title}\n` : ''}${c.enhancedBody ?? c.body}`)
        .join('\n\n')
        .trim();
      if (!prose) return { enabled: true as const, manifest: null as ProductionManifest | null };
      const manifest = await structureProductionManifest({
        title: project.title,
        logline: project.logline ?? project.originalIdea ?? undefined,
        prose,
        audienceMode: (project.audienceMode as StoryAudienceMode | undefined) ?? undefined,
      });
      // Phase 16.5 — persist as the canonical creative specification.
      await ctx.prisma.storyProject.update({
        where: { id: project.id },
        data: { productionManifest: manifest as unknown as any, productionManifestUpdatedAt: new Date() },
      });
      await trackStoryAnalytics(ctx, {
        event: 'production_manifest_persisted',
        projectId: project.id,
        audienceMode: project.audienceMode,
        properties: { sceneCount: manifest.scenes.length },
      });
      return { enabled: true as const, manifest };
    }),

  /** Phase 16.5 — return the persisted ProductionManifest for a project. */
  getProductionManifest: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ensureProject(ctx, input.projectId);
      return {
        manifest: (project.productionManifest as unknown as ProductionManifest | null) ?? null,
        updatedAt: project.productionManifestUpdatedAt ?? null,
      };
    }),

  generateSceneImage: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      sceneId: z.string(),
      model: z.enum(SCENE_IMAGE_MODELS).default('FLUX2'),
      instruction: z.string().max(300).optional(),
    }))
    .mutation(({ ctx, input }) => generateSceneImageAsset(ctx, input)),

  regenerateSceneImage: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      sceneId: z.string(),
      model: z.enum(SCENE_IMAGE_MODELS).default('FLUX2'),
      instruction: z.string().max(300).optional(),
    }))
    .mutation(({ ctx, input }) => generateSceneImageAsset(ctx, { ...input, isRegeneration: true })),

  generateSceneVideo: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      sceneId: z.string(),
      model: z.enum(SCENE_VIDEO_MODELS).default('H3_MAX'),
      duration: z.number().int().min(4).max(15).optional(),
      instruction: z.string().max(300).optional(),
      resolution: z.string().max(20).optional(),
    }))
    .mutation(({ ctx, input }) => generateSceneVideoAsset(ctx, input)),

  regenerateSceneVideo: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      sceneId: z.string(),
      model: z.enum(SCENE_VIDEO_MODELS).default('H3_MAX'),
      duration: z.number().int().min(4).max(15).optional(),
      instruction: z.string().max(300).optional(),
      resolution: z.string().max(20).optional(),
    }))
    .mutation(({ ctx, input }) => generateSceneVideoAsset(ctx, { ...input, isRegeneration: true })),

  runCreativeCritic: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      sceneId: z.string(),
      assetId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const project = await ensureProject(ctx, input.projectId);
      const asset = await (ctx.prisma as any).storySceneAsset.findFirst({
        where: { id: input.assetId, projectId: input.projectId, sceneId: input.sceneId, userId: ctx.user.id, status: 'READY', deletedAt: null },
      });
      if (!asset) throw new TRPCError({ code: 'NOT_FOUND', message: 'Ready scene image not found' });
      const existingCount = await (ctx.prisma as any).creativeCriticRun.count({ where: { assetId: asset.id } });
      const retryAttempt = Math.min(existingCount, 99);
      const run = await createCreativeCriticRun(ctx.prisma, {
        projectId: input.projectId,
        sceneId: input.sceneId,
        assetId: input.assetId,
        retryAttempt,
      });
      const criticInput = await buildCreativeCriticInput(ctx, input);
      const completed = await runCreativeCritic(ctx.prisma, {
        runId: run.id,
        userId: ctx.user.id,
        audienceMode: project.audienceMode,
        criticInput,
        threshold: creativeCriticSettings(project).threshold,
      });
      return ctx.isR16 ? safeCriticRunForR16(completed) : completed;
    }),

  getCreativeCriticRun: protectedProcedure
    .input(z.object({ projectId: z.string(), runId: z.string() }))
    .query(async ({ ctx, input }) => {
      await ensureProject(ctx, input.projectId);
      const run = await (ctx.prisma as any).creativeCriticRun.findFirst({
        where: { id: input.runId, projectId: input.projectId },
      });
      if (!run) throw new TRPCError({ code: 'NOT_FOUND', message: 'Creative critic run not found' });
      return ctx.isR16 ? safeCriticRunForR16(run) : run;
    }),

  listCreativeCriticRuns: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      sceneId: z.string().optional(),
      assetId: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(30),
    }))
    .query(async ({ ctx, input }) => {
      await ensureProject(ctx, input.projectId);
      const runs = await (ctx.prisma as any).creativeCriticRun.findMany({
        where: {
          projectId: input.projectId,
          ...(input.sceneId ? { sceneId: input.sceneId } : {}),
          ...(input.assetId ? { assetId: input.assetId } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: input.limit,
      });
      return ctx.isR16 ? runs.map(safeCriticRunForR16) : runs;
    }),

  applyCriticImprovementPlan: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      criticRunId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ensureProject(ctx, input.projectId);
      const run = await (ctx.prisma as any).creativeCriticRun.findFirst({
        where: { id: input.criticRunId, projectId: input.projectId, status: 'COMPLETED' },
      });
      if (!run?.improvementPlan) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No completed improvement plan found' });
      const scene = await (ctx.prisma as any).storySceneSeed.findFirst({
        where: { id: run.sceneId, projectId: input.projectId },
        include: { prompts: { orderBy: { version: 'desc' }, take: 1 } },
      });
      if (!scene) throw new TRPCError({ code: 'NOT_FOUND', message: 'Story scene not found' });
      const latest = scene.prompts?.[0] ?? null;
      const nextVersion = (latest?.version ?? 0) + 1;
      const specification = applyCriticImprovementsToCreativeSpecification({
        creativeSpecification: (latest?.metadata as Record<string, unknown> | null) ?? {},
        criticResult: {
          overallScore: run.overallScore ?? 0,
          scores: {
            characterIdentity: run.characterIdentityScore ?? 0,
            continuity: run.continuityScore ?? 0,
            composition: run.compositionScore ?? 0,
            lighting: run.lightingScore ?? 0,
            emotion: run.emotionScore ?? 0,
            visualStyle: run.visualStyleScore ?? 0,
            environment: run.environmentScore ?? 0,
            storyAlignment: run.storyAlignmentScore ?? 0,
            sceneClarity: run.sceneClarityScore ?? 0,
            technicalQuality: run.technicalQualityScore ?? 0,
          },
          strengths: Array.isArray(run.strengths) ? run.strengths : [],
          issues: Array.isArray(run.issues) ? run.issues : [],
          improvementPlan: (run.improvementPlan ?? {}) as any,
          recommendation: run.recommendation ?? 'SUGGEST_REFINEMENT',
          confidence: run.confidence ?? 0,
        },
        sourceCriticRunId: run.id,
        version: nextVersion,
      });
      const prompt = await (ctx.prisma as any).storyScenePrompt.create({
        data: {
          sceneId: run.sceneId,
          outputType: latest?.outputType ?? 'IMAGE',
          provider: latest?.provider ?? 'FLUX',
          prompt: latest?.prompt ?? 'Creative critic improvement specification',
          negativePrompt: latest?.negativePrompt ?? null,
          aspectRatio: latest?.aspectRatio ?? '9:16',
          duration: latest?.duration ?? null,
          version: nextVersion,
          metadata: specification,
        },
      });
      await (ctx.prisma as any).creativeCriticRun.update({
        where: { id: run.id },
        data: { specificationVersion: nextVersion },
      });
      return ctx.isR16 ? { ok: true } : { prompt, specification };
    }),

  regenerateFromCritic: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      criticRunId: z.string(),
      model: z.enum(SCENE_IMAGE_MODELS).default('FLUX2'),
    }))
    .mutation(async ({ ctx, input }) => {
      const project = await ensureProject(ctx, input.projectId);
      const run = await (ctx.prisma as any).creativeCriticRun.findFirst({
        where: { id: input.criticRunId, projectId: input.projectId, status: 'COMPLETED' },
      });
      if (!run) throw new TRPCError({ code: 'NOT_FOUND', message: 'Completed creative critic run not found' });
      if (run.recommendation === 'APPROVE') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This picture is already approved by the critic.' });
      }
      if (run.resultingAssetId) {
        const existingAsset = await (ctx.prisma as any).storySceneAsset.findFirst({
          where: { id: run.resultingAssetId, projectId: input.projectId, deletedAt: null },
        });
        if (existingAsset) {
          console.info('[creativeCritic] idempotent_replay', {
            projectId: input.projectId,
            sceneId: run.sceneId,
            criticRunId: run.id,
            resultingAssetId: run.resultingAssetId,
          });
          return {
            scene: await ctx.prisma.storySceneSeed.findFirst({
              where: { id: run.sceneId },
              include: { assets: { orderBy: { createdAt: 'desc' }, take: 12 }, prompts: { orderBy: { createdAt: 'desc' }, take: 6 } },
            }),
            asset: existingAsset,
            idempotentReplay: true,
          };
        }
      }
      const settings = creativeCriticSettings(project);
      const retries = await (ctx.prisma as any).creativeCriticRun.count({ where: { parentCriticRunId: run.id } });
      if (retries >= settings.maxRetries) {
        console.warn('[creativeCritic] retry_blocked', {
          projectId: input.projectId,
          sceneId: run.sceneId,
          criticRunId: run.id,
          reason: 'retry_limit_reached',
          retries,
          maxRetries: settings.maxRetries,
        });
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Creative retry limit reached for this picture.' });
      }
      console.info('[creativeCritic] retry_attempted', {
        projectId: input.projectId,
        sceneId: run.sceneId,
        sourceAssetId: run.assetId,
        criticRunId: run.id,
        model: input.model,
        attempt: retries + 1,
      });
      await trackStoryAnalytics(ctx, {
        event: 'creative_retry_started',
        projectId: input.projectId,
        audienceMode: project.audienceMode,
        properties: { sceneId: run.sceneId, sourceAssetId: run.assetId, criticRunId: run.id },
      });
      await (ctx.prisma as any).storySceneAsset.update({
        where: { id: run.assetId },
        data: { creativeStatus: 'UNDER_REVIEW' },
      }).catch(() => {});
      if (!run.specificationVersion) {
        const scene = await (ctx.prisma as any).storySceneSeed.findFirst({
          where: { id: run.sceneId, projectId: input.projectId },
          include: { prompts: { orderBy: { version: 'desc' }, take: 1 } },
        });
        const latest = scene?.prompts?.[0] ?? null;
        const nextVersion = (latest?.version ?? 0) + 1;
        const specification = applyCriticImprovementsToCreativeSpecification({
          creativeSpecification: (latest?.metadata as Record<string, unknown> | null) ?? {},
          criticResult: {
            overallScore: run.overallScore ?? 0,
            scores: {
              characterIdentity: run.characterIdentityScore ?? 0,
              continuity: run.continuityScore ?? 0,
              composition: run.compositionScore ?? 0,
              lighting: run.lightingScore ?? 0,
              emotion: run.emotionScore ?? 0,
              visualStyle: run.visualStyleScore ?? 0,
              environment: run.environmentScore ?? 0,
              storyAlignment: run.storyAlignmentScore ?? 0,
              sceneClarity: run.sceneClarityScore ?? 0,
              technicalQuality: run.technicalQualityScore ?? 0,
            },
            strengths: Array.isArray(run.strengths) ? run.strengths : [],
            issues: Array.isArray(run.issues) ? run.issues : [],
            improvementPlan: (run.improvementPlan ?? {}) as any,
            recommendation: run.recommendation ?? 'SUGGEST_REFINEMENT',
            confidence: run.confidence ?? 0,
          },
          sourceCriticRunId: run.id,
          version: nextVersion,
        });
        await (ctx.prisma as any).storyScenePrompt.create({
          data: {
            sceneId: run.sceneId,
            outputType: latest?.outputType ?? 'IMAGE',
            provider: latest?.provider ?? 'FLUX',
            prompt: latest?.prompt ?? 'Creative critic improvement specification',
            negativePrompt: latest?.negativePrompt ?? null,
            aspectRatio: latest?.aspectRatio ?? '9:16',
            duration: latest?.duration ?? null,
            version: nextVersion,
            metadata: specification,
          },
        });
        await (ctx.prisma as any).creativeCriticRun.update({
          where: { id: run.id },
          data: { specificationVersion: nextVersion },
        });
      }
      const result = await generateSceneImageAsset(ctx, {
        projectId: input.projectId,
        sceneId: run.sceneId,
        model: input.model,
        isRegeneration: true,
        creativeCriticRunId: run.id,
      });
      if (result.asset?.id) {
        await (ctx.prisma as any).creativeCriticRun.update({
          where: { id: run.id },
          data: { resultingAssetId: result.asset.id },
        });
      }
      await trackStoryAnalytics(ctx, {
        event: 'creative_retry_completed',
        projectId: input.projectId,
        audienceMode: project.audienceMode,
        properties: { sceneId: run.sceneId, sourceAssetId: run.assetId, resultingAssetId: result.asset?.id ?? null, criticRunId: run.id },
      });
      console.info('[creativeCritic] retry_completed', {
        projectId: input.projectId,
        sceneId: run.sceneId,
        sourceAssetId: run.assetId,
        resultingAssetId: result.asset?.id ?? null,
        criticRunId: run.id,
      });
      return result;
    }),

  approveSceneAsset: protectedProcedure
    .input(z.object({ projectId: z.string(), assetId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const project = await ensureProject(ctx, input.projectId);
      const asset = await (ctx.prisma as any).storySceneAsset.findFirst({
        where: { id: input.assetId, projectId: input.projectId, userId: ctx.user.id, deletedAt: null },
      });
      if (!asset) throw new TRPCError({ code: 'NOT_FOUND', message: 'Scene asset not found' });
      const updated = await (ctx.prisma as any).storySceneAsset.update({
        where: { id: asset.id },
        data: { creativeStatus: 'APPROVED', approvedAt: new Date(), approvedById: ctx.user.id },
      });
      await trackStoryAnalytics(ctx, {
        event: 'asset_creatively_approved',
        projectId: input.projectId,
        audienceMode: project.audienceMode,
        properties: { sceneId: asset.sceneId, assetId: asset.id },
      });
      return updated;
    }),

  rejectSceneAsset: protectedProcedure
    .input(z.object({ projectId: z.string(), assetId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const project = await ensureProject(ctx, input.projectId);
      const asset = await (ctx.prisma as any).storySceneAsset.findFirst({
        where: { id: input.assetId, projectId: input.projectId, userId: ctx.user.id, deletedAt: null },
      });
      if (!asset) throw new TRPCError({ code: 'NOT_FOUND', message: 'Scene asset not found' });
      const updated = await (ctx.prisma as any).storySceneAsset.update({
        where: { id: asset.id },
        data: { creativeStatus: 'REJECTED' },
      });
      await trackStoryAnalytics(ctx, {
        event: 'asset_creatively_rejected',
        projectId: input.projectId,
        audienceMode: project.audienceMode,
        properties: { sceneId: asset.sceneId, assetId: asset.id },
      });
      return updated;
    }),

  updateCreativeCriticSettings: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      mode: creativeCriticModeSchema,
      threshold: z.number().int().min(0).max(100).optional().nullable(),
      maxRetries: z.number().int().min(0).max(3).optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ensureProject(ctx, input.projectId);
      const updated = await (ctx.prisma as any).storyProject.update({
        where: { id: input.projectId },
        data: {
          creativeCriticMode: input.mode,
          creativeCriticThreshold: input.threshold ?? null,
          creativeCriticMaxRetries: input.maxRetries ?? null,
        },
      });
      return ctx.isR16 ? { ok: true } : updated;
    }),

  submitCreativeCriticFeedback: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      sceneId: z.string(),
      assetId: z.string(),
      criticRunId: z.string().optional().nullable(),
      rating: z.enum(['UP', 'DOWN', 'NEEDS_IMPROVEMENT']),
      categories: z.array(criticFeedbackCategorySchema).max(6).optional().default([]),
      comment: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const project = await ensureProject(ctx, input.projectId);
      const asset = await (ctx.prisma as any).storySceneAsset.findFirst({
        where: { id: input.assetId, sceneId: input.sceneId, projectId: input.projectId, userId: ctx.user.id, deletedAt: null },
      });
      if (!asset) throw new TRPCError({ code: 'NOT_FOUND', message: 'Scene image not found' });
      const feedback = await (ctx.prisma as any).creativeCriticFeedback.create({
        data: {
          projectId: input.projectId,
          sceneId: input.sceneId,
          assetId: input.assetId,
          criticRunId: input.criticRunId ?? null,
          userId: ctx.user.id,
          rating: input.rating,
          categories: input.categories,
          comment: input.comment?.trim() || null,
        },
      });
      await trackStoryAnalytics(ctx, {
        event: 'critic_feedback_received',
        projectId: input.projectId,
        audienceMode: project.audienceMode,
        properties: {
          sceneId: input.sceneId,
          assetId: input.assetId,
          criticRunId: input.criticRunId ?? null,
          rating: input.rating,
          categories: input.categories,
          hasComment: Boolean(input.comment?.trim()),
        },
      });
      if ((asset.criticRecommendation === 'APPROVE' && input.rating !== 'UP') || (asset.criticRecommendation === 'REGENERATE' && input.rating === 'UP')) {
        await trackStoryAnalytics(ctx, {
          event: 'critic_human_disagreement',
          projectId: input.projectId,
          audienceMode: project.audienceMode,
          properties: {
            sceneId: input.sceneId,
            assetId: input.assetId,
            criticRunId: input.criticRunId ?? null,
            criticRecommendation: asset.criticRecommendation,
            rating: input.rating,
          },
        });
      }
      return ctx.isR16 ? { ok: true } : feedback;
    }),

  getOrCreateSequence: protectedProcedure
    .input(z.object({ projectId: z.string(), sequenceId: z.string().optional().nullable() }))
    .query(async ({ ctx, input }) => {
      const { project, sequence } = await getOrCreateSequence(ctx, input.projectId, input.sequenceId);
      await trackStoryAnalytics(ctx, {
        event: 'sequence_opened',
        projectId: input.projectId,
        audienceMode: project.audienceMode,
        properties: { sequenceId: sequence.id, shotCount: sequence.scenes.length },
      });
      return sequenceResponse(ctx, input.projectId, sequence.id);
    }),

  getSequence: protectedProcedure
    .input(z.object({ projectId: z.string(), sequenceId: z.string().optional().nullable() }))
    .query(async ({ ctx, input }) => {
      const { project, sequence } = await getOrCreateSequence(ctx, input.projectId, input.sequenceId);
      await trackStoryAnalytics(ctx, {
        event: 'sequence_opened',
        projectId: input.projectId,
        audienceMode: project.audienceMode,
        properties: { sequenceId: sequence.id, shotCount: sequence.scenes.length },
      });
      return sequenceResponse(ctx, input.projectId, sequence.id);
    }),

  updateSequence: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      sequenceId: z.string(),
      title: z.string().min(1).max(120).optional(),
      status: z.enum(['DRAFT', 'LOCKED', 'ARCHIVED']).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await getOrCreateSequence(ctx, input.projectId, input.sequenceId);
      await (ctx.prisma as any).storySequence.update({
        where: { id: input.sequenceId },
        data: {
          ...(input.title ? { title: input.title.trim() } : {}),
          ...(input.status ? { status: input.status } : {}),
        },
      });
      return sequenceResponse(ctx, input.projectId, input.sequenceId);
    }),

  reorderSequence: protectedProcedure
    .input(z.object({ projectId: z.string(), sequenceId: z.string(), sequenceSceneIds: z.array(z.string()).min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const { project, sequence } = await getOrCreateSequence(ctx, input.projectId, input.sequenceId);
      const normalized = normalizeSequenceEntryOrder(input.sequenceSceneIds, sequence.scenes);
      await (ctx.prisma as any).$transaction(normalized.map((scene: any) =>
        (ctx.prisma as any).storySequenceScene.update({ where: { id: scene.id }, data: { orderIndex: scene.orderIndex } }),
      ));
      const runtime = await recalculateSequenceRuntime(ctx.prisma, input.sequenceId);
      await trackStoryAnalytics(ctx, {
        event: 'sequence_scene_reordered',
        projectId: input.projectId,
        audienceMode: project.audienceMode,
        properties: { sequenceId: input.sequenceId, runtimeSeconds: runtime.totalRuntimeSeconds },
      });
      return sequenceResponse(ctx, input.projectId, input.sequenceId);
    }),

  updateSequenceScene: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      sequenceId: z.string(),
      sequenceSceneId: z.string(),
      enabled: z.boolean().optional(),
      durationSeconds: z.number().optional(),
      selectedAssetId: z.string().nullable().optional(),
      shotType: sequenceShotTypeSchema.nullable().optional(),
      cameraMovement: sequenceCameraMovementSchema.nullable().optional(),
      cameraSpeed: sequenceCameraSpeedSchema.nullable().optional(),
      cameraSpeedMultiplier: z.number().nullable().optional(),
      transition: sequenceTransitionSchema.nullable().optional(),
      transitionDurationSeconds: z.number().nullable().optional(),
      holdDurationSeconds: z.number().nullable().optional(),
      zoom: z.number().nullable().optional(),
      creativeNotes: z.string().max(2000).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { project, sequence } = await getOrCreateSequence(ctx, input.projectId, input.sequenceId);
      const sequenceScene = sequence.scenes.find((scene: any) => scene.id === input.sequenceSceneId);
      if (!sequenceScene) throw new TRPCError({ code: 'NOT_FOUND', message: 'Sequence scene not found' });
      if (input.selectedAssetId) {
        await assertSequenceAsset(ctx, {
          projectId: input.projectId,
          storySceneId: sequenceScene.storySceneId,
          assetId: input.selectedAssetId,
        });
      }
      const changedDuration = input.durationSeconds !== undefined && clampSequenceDuration(input.durationSeconds) !== sequenceScene.durationSeconds;
      const changedEnabled = input.enabled !== undefined && input.enabled !== sequenceScene.enabled;
      const changedAsset = input.selectedAssetId !== undefined && input.selectedAssetId !== sequenceScene.selectedAssetId;
      const changedShot = input.shotType !== undefined && input.shotType !== sequenceScene.shotType;
      const changedCamera = input.cameraMovement !== undefined || input.cameraSpeed !== undefined || input.cameraSpeedMultiplier !== undefined || input.zoom !== undefined;
      const changedTransition = input.transition !== undefined || input.transitionDurationSeconds !== undefined || input.holdDurationSeconds !== undefined;

      await (ctx.prisma as any).storySequenceScene.update({
        where: { id: input.sequenceSceneId },
        data: {
          ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
          ...(input.durationSeconds !== undefined ? { durationSeconds: clampSequenceDuration(input.durationSeconds) } : {}),
          ...(input.selectedAssetId !== undefined ? { selectedAssetId: input.selectedAssetId } : {}),
          ...(input.shotType !== undefined ? { shotType: input.shotType } : {}),
          ...(input.cameraMovement !== undefined ? { cameraMovement: input.cameraMovement } : {}),
          ...(input.cameraSpeed !== undefined ? { cameraSpeed: input.cameraSpeed } : {}),
          ...(input.cameraSpeedMultiplier !== undefined ? { cameraSpeedMultiplier: clampCameraSpeedMultiplier(input.cameraSpeedMultiplier) } : {}),
          ...(input.transition !== undefined ? { transition: input.transition } : {}),
          ...(input.transitionDurationSeconds !== undefined ? { transitionDurationSeconds: clampTransitionDuration(input.transitionDurationSeconds) } : {}),
          ...(input.holdDurationSeconds !== undefined ? { holdDurationSeconds: clampTransitionDuration(input.holdDurationSeconds) } : {}),
          ...(input.zoom !== undefined ? { zoom: input.zoom } : {}),
          ...(input.creativeNotes !== undefined ? { creativeNotes: input.creativeNotes?.trim() || null } : {}),
        },
      });
      const runtime = await recalculateSequenceRuntime(ctx.prisma, input.sequenceId);
      const properties = { sequenceId: input.sequenceId, sequenceSceneId: input.sequenceSceneId, runtimeSeconds: runtime.totalRuntimeSeconds };
      if (changedDuration) await trackStoryAnalytics(ctx, { event: 'sequence_duration_changed', projectId: input.projectId, audienceMode: project.audienceMode, properties });
      if (changedEnabled && input.enabled === false) await trackStoryAnalytics(ctx, { event: 'sequence_scene_disabled', projectId: input.projectId, audienceMode: project.audienceMode, properties });
      if (changedAsset) await trackStoryAnalytics(ctx, { event: 'sequence_asset_selected', projectId: input.projectId, audienceMode: project.audienceMode, properties });
      if (changedShot) await trackStoryAnalytics(ctx, { event: 'sequence_shot_changed', projectId: input.projectId, audienceMode: project.audienceMode, properties });
      if (changedCamera) await trackStoryAnalytics(ctx, { event: 'sequence_camera_changed', projectId: input.projectId, audienceMode: project.audienceMode, properties });
      if (changedTransition) await trackStoryAnalytics(ctx, { event: 'sequence_transition_changed', projectId: input.projectId, audienceMode: project.audienceMode, properties });
      return sequenceResponse(ctx, input.projectId, input.sequenceId);
    }),

  /** Phase 11 — apply a named camera/transition/pacing preset to a Sequence. */
  applyShotPreset: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      sequenceId: z.string(),
      preset: z.enum(SHOT_PRESET_NAMES),
      sequenceSceneId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { project, sequence } = await getOrCreateSequence(ctx, input.projectId, input.sequenceId);
      const targets = sequence.scenes.filter((scene: any) =>
        input.sequenceSceneId ? scene.id === input.sequenceSceneId : scene.enabled,
      );
      if (!targets.length) throw new TRPCError({ code: 'NOT_FOUND', message: 'No matching sequence scenes.' });
      const preset = SHOT_PRESETS[input.preset];
      for (const scene of targets) {
        await (ctx.prisma as any).storySequenceScene.update({
          where: { id: scene.id },
          data: {
            cameraMovement: preset.cameraMovement,
            cameraSpeed: preset.cameraSpeed,
            transition: preset.transition,
            transitionDurationSeconds: clampTransitionDuration(preset.transitionDurationSeconds),
            zoom: preset.zoom,
          },
        });
      }
      const runtime = await recalculateSequenceRuntime(ctx.prisma, input.sequenceId);
      await trackStoryAnalytics(ctx, {
        event: 'director_setting_changed',
        projectId: input.projectId,
        audienceMode: project.audienceMode,
        properties: { sequenceId: input.sequenceId, preset: input.preset, sceneCount: targets.length, runtimeSeconds: runtime.totalRuntimeSeconds },
      });
      return { applied: targets.length, preset: input.preset, runtimeSeconds: runtime.totalRuntimeSeconds };
    }),

  /** Phase 11 — named style presets (visual style + director + music prompt). */
  listStylePresets: protectedProcedure.query(() =>
    STYLE_PRESET_NAMES.map((name) => ({
      name,
      label: STYLE_PRESETS[name].label,
      visualStyle: STYLE_PRESETS[name].visualStyle,
      musicPrompt: STYLE_PRESETS[name].musicPrompt,
    })),
  ),

  /** Phase 11 — apply a style preset to the project (and optionally all scenes). */
  applyStylePreset: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      preset: z.enum(STYLE_PRESET_NAMES),
      applyToScenes: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const project = await ensureProject(ctx, input.projectId);
      const preset = STYLE_PRESETS[input.preset];
      await (ctx.prisma as any).storyProject.update({
        where: { id: input.projectId },
        data: { visualStyle: preset.visualStyle },
      });
      let scenesUpdated = 0;
      if (input.applyToScenes) {
        const result = await (ctx.prisma as any).storySceneSeed.updateMany({
          where: { projectId: input.projectId },
          data: preset.director,
        });
        scenesUpdated = result.count;
      }
      await trackStoryAnalytics(ctx, {
        event: 'visual_style_selected',
        projectId: input.projectId,
        audienceMode: project.audienceMode,
        properties: { preset: input.preset, visualStyle: preset.visualStyle, scenesUpdated },
      });
      return { preset: input.preset, visualStyle: preset.visualStyle, musicPrompt: preset.musicPrompt, scenesUpdated };
    }),

  duplicateSequenceScene: protectedProcedure
    .input(z.object({ projectId: z.string(), sequenceId: z.string(), sequenceSceneId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { project, sequence } = await getOrCreateSequence(ctx, input.projectId, input.sequenceId);
      const source = sequence.scenes.find((scene: any) => scene.id === input.sequenceSceneId);
      if (!source) throw new TRPCError({ code: 'NOT_FOUND', message: 'Sequence scene not found' });
      await (ctx.prisma as any).$transaction(async (tx: any) => {
        await tx.storySequenceScene.updateMany({
          where: { sequenceId: input.sequenceId, orderIndex: { gt: source.orderIndex } },
          data: { orderIndex: { increment: 1 } },
        });
        await tx.storySequenceScene.create({
          data: {
            sequenceId: input.sequenceId,
            storySceneId: source.storySceneId,
            sourceSequenceSceneId: source.id,
            orderIndex: source.orderIndex + 1,
            enabled: source.enabled,
            durationSeconds: source.durationSeconds,
            selectedAssetId: source.selectedAssetId,
            shotType: source.shotType,
            cameraMovement: source.cameraMovement,
            cameraSpeed: source.cameraSpeed,
            cameraSpeedMultiplier: source.cameraSpeedMultiplier,
            transition: source.transition,
            transitionDurationSeconds: source.transitionDurationSeconds,
            holdDurationSeconds: source.holdDurationSeconds,
            zoom: source.zoom,
            creativeNotes: source.creativeNotes,
          },
        });
      });
      const runtime = await recalculateSequenceRuntime(ctx.prisma, input.sequenceId);
      await trackStoryAnalytics(ctx, { event: 'sequence_scene_duplicated', projectId: input.projectId, audienceMode: project.audienceMode, properties: { sequenceId: input.sequenceId, sequenceSceneId: input.sequenceSceneId, runtimeSeconds: runtime.totalRuntimeSeconds } });
      return sequenceResponse(ctx, input.projectId, input.sequenceId);
    }),

  removeSequenceScene: protectedProcedure
    .input(z.object({ projectId: z.string(), sequenceId: z.string(), sequenceSceneId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { project, sequence } = await getOrCreateSequence(ctx, input.projectId, input.sequenceId);
      const target = sequence.scenes.find((scene: any) => scene.id === input.sequenceSceneId);
      if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'Sequence scene not found' });
      await (ctx.prisma as any).$transaction(async (tx: any) => {
        await tx.storySequenceScene.delete({ where: { id: input.sequenceSceneId } });
        await tx.storySequenceScene.updateMany({
          where: { sequenceId: input.sequenceId, orderIndex: { gt: target.orderIndex } },
          data: { orderIndex: { decrement: 1 } },
        });
      });
      const runtime = await recalculateSequenceRuntime(ctx.prisma, input.sequenceId);
      await trackStoryAnalytics(ctx, { event: 'sequence_scene_removed', projectId: input.projectId, audienceMode: project.audienceMode, properties: { sequenceId: input.sequenceId, sequenceSceneId: input.sequenceSceneId, runtimeSeconds: runtime.totalRuntimeSeconds } });
      return sequenceResponse(ctx, input.projectId, input.sequenceId);
    }),

  restoreSourceSceneToSequence: protectedProcedure
    .input(z.object({ projectId: z.string(), sequenceId: z.string(), storySceneId: z.string(), afterSequenceSceneId: z.string().optional().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const { project, sequence } = await getOrCreateSequence(ctx, input.projectId, input.sequenceId);
      const sourceScene = project.sceneSeeds.find((scene: any) => scene.id === input.storySceneId);
      if (!sourceScene) throw new TRPCError({ code: 'NOT_FOUND', message: 'Story scene not found' });
      const after = input.afterSequenceSceneId ? sequence.scenes.find((scene: any) => scene.id === input.afterSequenceSceneId) : null;
      const orderIndex = after ? after.orderIndex + 1 : sequence.scenes.length + 1;
      await (ctx.prisma as any).$transaction(async (tx: any) => {
        await tx.storySequenceScene.updateMany({
          where: { sequenceId: input.sequenceId, orderIndex: { gte: orderIndex } },
          data: { orderIndex: { increment: 1 } },
        });
        await tx.storySequenceScene.create({
          data: {
            sequenceId: input.sequenceId,
            ...sequenceSceneCreateData(sourceScene, orderIndex),
          },
        });
      });
      await recalculateSequenceRuntime(ctx.prisma, input.sequenceId);
      return sequenceResponse(ctx, input.projectId, input.sequenceId);
    }),

  createSequenceVersion: protectedProcedure
    .input(z.object({ projectId: z.string(), sequenceId: z.string(), title: z.string().min(1).max(120).optional(), notes: z.string().max(500).optional().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const { project, sequence } = await getOrCreateSequence(ctx, input.projectId, input.sequenceId);
      const nextVersion = await nextSequenceVersionNumber(ctx.prisma, input.sequenceId);
      const snapshot = sequenceSnapshot(sequence, sequence.scenes);
      const filmBlueprint = buildFilmBlueprint({ sequenceId: sequence.id, version: nextVersion, scenes: sequence.scenes });
      const version = await (ctx.prisma as any).$transaction(async (tx: any) => {
        const created = await tx.sequenceVersion.create({
          data: {
            sequenceId: input.sequenceId,
            versionNumber: nextVersion,
            title: input.title?.trim() || `Version ${nextVersion}`,
            notes: input.notes?.trim() || null,
            snapshot,
            filmBlueprint,
            runtimeSeconds: filmBlueprint.runtimeSeconds,
            createdById: ctx.user.id,
          },
        });
        await tx.storySequence.update({ where: { id: input.sequenceId }, data: { currentVersionNumber: nextVersion, runtimeSeconds: filmBlueprint.runtimeSeconds } });
        return created;
      });
      await trackStoryAnalytics(ctx, { event: 'sequence_version_created', projectId: input.projectId, audienceMode: project.audienceMode, properties: { sequenceId: input.sequenceId, versionNumber: nextVersion, runtimeSeconds: filmBlueprint.runtimeSeconds } });
      return { version, sequence: (await sequenceResponse(ctx, input.projectId, input.sequenceId)).sequence };
    }),

  listSequenceVersions: protectedProcedure
    .input(z.object({ projectId: z.string(), sequenceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await getOrCreateSequence(ctx, input.projectId, input.sequenceId);
      return (ctx.prisma as any).sequenceVersion.findMany({
        where: { sequenceId: input.sequenceId },
        orderBy: { versionNumber: 'desc' },
        take: 50,
      });
    }),

  restoreSequenceVersion: protectedProcedure
    .input(z.object({ projectId: z.string(), sequenceId: z.string(), versionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { project } = await getOrCreateSequence(ctx, input.projectId, input.sequenceId);
      const version = await (ctx.prisma as any).sequenceVersion.findFirst({
        where: { id: input.versionId, sequenceId: input.sequenceId, sequence: { projectId: input.projectId } },
      });
      if (!version) throw new TRPCError({ code: 'NOT_FOUND', message: 'Sequence version not found' });
      const snapshotScenes = versionSnapshotScenes(version.snapshot);
      const projectSceneIds = new Set(project.sceneSeeds.map((scene: any) => scene.id));
      for (const scene of snapshotScenes) {
        if (!projectSceneIds.has(scene.storySceneId)) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Version references a scene outside this project.' });
        if (scene.selectedAssetId) await assertSequenceAsset(ctx, { projectId: input.projectId, storySceneId: scene.storySceneId, assetId: scene.selectedAssetId });
      }
      await (ctx.prisma as any).$transaction(async (tx: any) => {
        await tx.storySequenceScene.deleteMany({ where: { sequenceId: input.sequenceId } });
        if (snapshotScenes.length) {
          await tx.storySequenceScene.createMany({
            data: snapshotScenes.map((scene: any, index: number) => ({
              sequenceId: input.sequenceId,
              storySceneId: scene.storySceneId,
              orderIndex: index + 1,
              enabled: scene.enabled,
              durationSeconds: scene.durationSeconds,
              selectedAssetId: scene.selectedAssetId,
              shotType: scene.shotType,
              cameraMovement: scene.cameraMovement,
              cameraSpeed: scene.cameraSpeed,
              cameraSpeedMultiplier: scene.cameraSpeedMultiplier,
              transition: scene.transition,
              transitionDurationSeconds: scene.transitionDurationSeconds,
              holdDurationSeconds: scene.holdDurationSeconds,
              zoom: scene.zoom,
              creativeNotes: scene.creativeNotes,
            })),
          });
        }
        await tx.storySequence.update({
          where: { id: input.sequenceId },
          data: {
            title: (version.snapshot as any)?.sequence?.title ?? undefined,
            runtimeSeconds: version.runtimeSeconds,
            currentVersionNumber: version.versionNumber,
          },
        });
      });
      await trackStoryAnalytics(ctx, { event: 'sequence_version_restored', projectId: input.projectId, audienceMode: project.audienceMode, properties: { sequenceId: input.sequenceId, versionNumber: version.versionNumber, runtimeSeconds: version.runtimeSeconds } });
      return sequenceResponse(ctx, input.projectId, input.sequenceId);
    }),

  duplicateSequenceVersion: protectedProcedure
    .input(z.object({ projectId: z.string(), sequenceId: z.string(), versionId: z.string(), title: z.string().min(1).max(120).optional() }))
    .mutation(async ({ ctx, input }) => {
      const { project, sequence } = await getOrCreateSequence(ctx, input.projectId, input.sequenceId);
      const source = await (ctx.prisma as any).sequenceVersion.findFirst({
        where: { id: input.versionId, sequenceId: input.sequenceId, sequence: { projectId: input.projectId } },
      });
      if (!source) throw new TRPCError({ code: 'NOT_FOUND', message: 'Sequence version not found' });
      const nextVersion = await nextSequenceVersionNumber(ctx.prisma, input.sequenceId);
      const duplicated = await (ctx.prisma as any).$transaction(async (tx: any) => {
        const created = await tx.sequenceVersion.create({
          data: {
            sequenceId: input.sequenceId,
            versionNumber: nextVersion,
            title: input.title?.trim() || `${source.title} Copy`,
            notes: source.notes,
            snapshot: source.snapshot,
            filmBlueprint: source.filmBlueprint,
            runtimeSeconds: source.runtimeSeconds,
            createdById: ctx.user.id,
          },
        });
        await tx.storySequence.update({ where: { id: input.sequenceId }, data: { currentVersionNumber: nextVersion } });
        return created;
      });
      await trackStoryAnalytics(ctx, { event: 'sequence_version_created', projectId: input.projectId, audienceMode: project.audienceMode, properties: { sequenceId: input.sequenceId, duplicatedFromVersion: source.versionNumber, versionNumber: nextVersion } });
      return duplicated;
    }),

  trackSequenceAnalytics: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      sequenceId: z.string(),
      event: z.enum(['sequence_preview_started', 'sequence_preview_completed']),
      properties: z.record(z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { project } = await getOrCreateSequence(ctx, input.projectId, input.sequenceId);
      await trackStoryAnalytics(ctx, {
        event: input.event,
        projectId: input.projectId,
        audienceMode: project.audienceMode,
        properties: {
          sequenceId: input.sequenceId,
          shotIndex: input.properties?.shotIndex,
          runtimeSeconds: input.properties?.runtimeSeconds,
        },
      });
      return { ok: true };
    }),

  getMovieBuilder: protectedProcedure
    .input(z.object({ projectId: z.string(), sequenceId: z.string().optional().nullable() }))
    .query(async ({ ctx, input }) => {
      try {
        const renderContext = await movieRenderContext(ctx, input.projectId, input.sequenceId);
        const history = await (ctx.prisma as any).movieRenderJob.findMany({
          where: { projectId: input.projectId, sequenceId: renderContext.sequence.id, userId: ctx.user.id },
          orderBy: { createdAt: 'desc' },
          take: 12,
          include: { movieAsset: true, events: { orderBy: { createdAt: 'desc' }, take: 8 } },
        });
        // Read-only, same as createMovieRender's own lookup — this never
        // creates a render, it only tells the creator honestly what a render
        // right now would and wouldn't include. WARNING severity, not
        // BLOCKER (see summarizeUnmaterializedSpeechCues docstring): an
        // unmaterialized speech cue never prevents rendering, it's just
        // silently omitted, so the creator should know before they render,
        // not be blocked from rendering everything else.
        const { audioBlueprint } = await readOnlyAudioBlueprint(ctx, {
          projectId: input.projectId,
          sequenceId: renderContext.sequence.id,
          filmBlueprint: renderContext.filmBlueprint,
        });
        const unmaterialized = summarizeUnmaterializedSpeechCues(audioBlueprint);
        const readiness = renderReadiness(renderContext.plan);
        await trackStoryAnalytics(ctx, {
          event: 'movie_builder_opened',
          projectId: input.projectId,
          audienceMode: renderContext.project.audienceMode,
          properties: { sequenceId: renderContext.sequence.id },
        });
        return {
          sequenceId: renderContext.sequence.id,
          filmBlueprint: renderContext.filmBlueprint,
          renderPlan: renderContext.plan,
          renderPlanHash: renderContext.renderPlanHash,
          readiness: {
            ...readiness,
            warnings: unmaterialized.message ? [...readiness.warnings, unmaterialized.message] : readiness.warnings,
          },
          hasAudio: Boolean(audioBlueprint?.hasAudio),
          creditCost: renderContext.creditCost,
          currentMovie: renderContext.currentMovie,
          history,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        return {
          sequenceId: input.sequenceId ?? null,
          filmBlueprint: null,
          renderPlan: null,
          renderPlanHash: null,
          readiness: {
            ready: false,
            shotCount: 0,
            runtimeSeconds: 0,
            warnings: [error instanceof Error ? error.message : 'Movie render preflight failed.'],
          },
          creditCost: 0,
          currentMovie: null,
          history: [],
        };
      }
    }),

  createMovieRender: protectedProcedure
    .input(z.object({ projectId: z.string(), sequenceId: z.string().optional().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const renderContext = await movieRenderContext(ctx, input.projectId, input.sequenceId);
      if (renderContext.creditCost <= 0) {
        const rateResult = await resolveMovieRenderCreditRate(ctx.prisma);
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Movie rendering is temporarily unavailable. Please try again later.',
          cause: { errorCode: rateResult.configured ? 'MOVIE_RENDER_RATE_INVALID' : rateResult.errorCode },
        });
      }
      // Snapshot the current Audio Plan (if any) BEFORE reuse-matching and
      // BEFORE job creation. This is a read-only lookup — it never mutates
      // AudioPerformancePlan/AudioTrack/AudioCue rows (Movie Render
      // Independence, brief §35). Absence of a plan produces the exact same
      // silent-film shape as before Phase 9B.2 (audioBlueprintSnapshot stays
      // null, combinedRenderHash === renderContext.renderPlanHash).
      const { audioPlan, audioBlueprint } = await readOnlyAudioBlueprint(ctx, {
        projectId: input.projectId,
        sequenceId: renderContext.sequence.id,
        filmBlueprint: renderContext.filmBlueprint,
      });
      const combinedRenderHash = combineRenderHash(renderContext.renderPlanHash, audioBlueprint);

      const reusable = await findReusableMovieRender(ctx, {
        projectId: input.projectId,
        sequenceId: renderContext.sequence.id,
        renderPlanHash: combinedRenderHash,
      });
      if (shouldReuseMovieRenderJob(reusable, combinedRenderHash)) {
        await trackStoryAnalytics(ctx, {
          event: audioBlueprint?.hasAudio ? 'movie_render_with_audio_requested' : 'movie_render_reused',
          projectId: input.projectId,
          audienceMode: renderContext.project.audienceMode,
          properties: { sequenceId: renderContext.sequence.id, renderJobId: reusable.id, status: reusable.status, reused: true },
        });
        return { job: reusable, reused: true };
      }

      const job = await (ctx.prisma as any).$transaction(async (tx: any) => tx.movieRenderJob.create({
        data: {
          projectId: input.projectId,
          sequenceId: renderContext.sequence.id,
          userId: ctx.user.id,
          status: 'QUEUED',
          filmBlueprintSnapshot: renderContext.filmBlueprint,
          audioBlueprintSnapshot: audioBlueprint?.hasAudio ? (audioBlueprint as any) : null,
          audioPlanVersionId: audioPlan?.id ?? null,
          // Standalone audio-only hash for provenance/debugging — see
          // schema.prisma comment. Never used for reuse-matching; that's
          // combinedRenderHash (renderPlanHash) below, unchanged.
          audioBlueprintHash: audioBlueprint?.hasAudio ? hashAudioBlueprint(audioBlueprint) : null,
          renderPlan: renderContext.plan,
          renderPlanHash: combinedRenderHash,
          rendererVersion: renderContext.plan.rendererVersion,
          creditsReserved: renderContext.creditCost,
          creditsCharged: 0,
          events: {
            create: {
              eventName: 'movie_render_queued',
              stage: 'queued',
              progressPercent: 0,
              metadata: { renderPlanHash: renderContext.renderPlanHash, creditCost: renderContext.creditCost },
            },
          },
        },
        include: { movieAsset: true, events: { orderBy: { createdAt: 'desc' }, take: 20 } },
      }));

      if (renderContext.creditCost > 0) {
        try {
          const charged = await deductCredits(ctx.prisma, ctx.user.id, MOVIE_RENDER_FEATURE_KEY, job.id, 'Story movie render');
          await (ctx.prisma as any).movieRenderJob.update({
            where: { id: job.id },
            data: { creditsCharged: charged },
          });
        } catch (error) {
          await (ctx.prisma as any).movieRenderJob.update({
            where: { id: job.id },
            data: {
              status: 'FAILED',
              currentStage: 'credit_check_failed',
              failedAt: new Date(),
              errorCode: 'MOVIE_RENDER_CREDIT_FAILED',
              errorMessage: error instanceof Error ? error.message.slice(0, 1000) : 'Movie render credit check failed.',
            },
          });
          throw error;
        }
      }

      await trackStoryAnalytics(ctx, {
        event: audioBlueprint?.hasAudio ? 'movie_render_with_audio_requested' : 'movie_render_started',
        projectId: input.projectId,
        audienceMode: renderContext.project.audienceMode,
        properties: {
          sequenceId: renderContext.sequence.id,
          renderJobId: job.id,
          renderPlanHash: combinedRenderHash,
          shotCount: renderContext.plan.shots.length,
          runtimeSeconds: renderContext.plan.runtimeSeconds,
          credits: renderContext.creditCost,
          hasAudio: Boolean(audioBlueprint?.hasAudio),
          // Observability for the planning-layer defense: non-zero here
          // means buildAudioBlueprint rejected at least one cue's
          // audioAssetId as unresolvable within this project's scope — worth
          // watching for in production even though the worker's own
          // independent gate is what actually stops a render from using one.
          rejectedAudioAssetReferenceCount: audioBlueprint?.rejectedAudioAssetReferences.length ?? 0,
        },
      });
      queueMovieRenderJob(ctx.prisma, job.id);
      return { job: await movieRenderForUser(ctx, { projectId: input.projectId, renderJobId: job.id }), reused: false };
    }),

  getMovieRender: protectedProcedure
    .input(z.object({ projectId: z.string(), renderJobId: z.string() }))
    .query(async ({ ctx, input }) => movieRenderForUser(ctx, input)),

  listMovieRenders: protectedProcedure
    .input(z.object({ projectId: z.string(), sequenceId: z.string().optional().nullable() }))
    .query(async ({ ctx, input }) => {
      const { sequence } = await getOrCreateSequence(ctx, input.projectId, input.sequenceId);
      return (ctx.prisma as any).movieRenderJob.findMany({
        where: { projectId: input.projectId, sequenceId: sequence.id, userId: ctx.user.id },
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: { movieAsset: true, events: { orderBy: { createdAt: 'desc' }, take: 8 } },
      });
    }),

  retryMovieRender: protectedProcedure
    .input(z.object({ projectId: z.string(), renderJobId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const job = await movieRenderForUser(ctx, input);
      if (!['FAILED', 'CANCELLED'].includes(job.status)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only failed or cancelled movie renders can be retried.' });
      }
      const updated = await (ctx.prisma as any).movieRenderJob.update({
        where: { id: job.id },
        data: {
          status: 'QUEUED',
          progressPercent: 0,
          currentStage: 'queued_for_retry',
          failedAt: null,
          cancelledAt: null,
          errorCode: null,
          errorMessage: null,
          events: { create: { eventName: 'movie_render_retry_queued', stage: 'queued_for_retry', progressPercent: 0 } },
        },
        include: { movieAsset: true, events: { orderBy: { createdAt: 'desc' }, take: 20 } },
      });
      await trackStoryAnalytics(ctx, {
        event: 'movie_render_retried',
        projectId: input.projectId,
        properties: { sequenceId: job.sequenceId, renderJobId: job.id },
      });
      queueMovieRenderJob(ctx.prisma, job.id);
      return updated;
    }),

  cancelMovieRender: protectedProcedure
    .input(z.object({ projectId: z.string(), renderJobId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const job = await movieRenderForUser(ctx, input);
      if (['READY', 'FAILED', 'CANCELLED'].includes(job.status)) return job;
      if (!['QUEUED', 'PREPARING'].includes(job.status)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This render is already running and cannot be cancelled safely in Phase 9B.1.' });
      }
      const updated = await (ctx.prisma as any).movieRenderJob.update({
        where: { id: job.id },
        data: {
          status: 'CANCELLED',
          currentStage: 'cancelled',
          progressPercent: 100,
          cancelledAt: new Date(),
          events: { create: { eventName: 'movie_render_cancelled', stage: 'cancelled', progressPercent: 100 } },
        },
        include: { movieAsset: true, events: { orderBy: { createdAt: 'desc' }, take: 20 } },
      });
      if (job.creditsCharged > 0) {
        await refundCredits(ctx.prisma, ctx.user.id, job.creditsCharged, MOVIE_RENDER_FEATURE_KEY, job.id, 'Movie render cancelled');
        await (ctx.prisma as any).movieRenderJob.update({ where: { id: job.id }, data: { creditsReserved: 0, creditsCharged: 0 } });
      }
      return updated;
    }),

  setCurrentMovie: protectedProcedure
    .input(z.object({ projectId: z.string(), movieAssetId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const asset = await (ctx.prisma as any).movieAsset.findFirst({
        where: { id: input.movieAssetId, projectId: input.projectId, project: { userId: ctx.user.id }, status: 'READY' },
      });
      if (!asset) throw new TRPCError({ code: 'NOT_FOUND', message: 'Movie asset not found' });
      await (ctx.prisma as any).$transaction([
        (ctx.prisma as any).movieAsset.updateMany({ where: { projectId: input.projectId, isCurrent: true }, data: { isCurrent: false } }),
        (ctx.prisma as any).movieAsset.update({ where: { id: asset.id }, data: { isCurrent: true } }),
      ]);
      return { ok: true };
    }),

  /** Export/version history — READY movie renders for a project (Phase 10). */
  listMovieAssets: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await ensureProject(ctx, input.projectId);
      return (ctx.prisma as any).movieAsset.findMany({
        where: { projectId: input.projectId, status: 'READY' },
        orderBy: { versionNumber: 'desc' },
        take: 50,
        select: {
          id: true,
          versionNumber: true,
          status: true,
          publicUrl: true,
          storageKey: true,
          width: true,
          height: true,
          durationSeconds: true,
          fps: true,
          fileSizeBytes: true,
          isCurrent: true,
          createdAt: true,
        },
      });
    }),

  /** Phase 11 — set or clear the project cover (a ready scene image asset). */
  setProjectCover: protectedProcedure
    .input(z.object({ projectId: z.string(), assetId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      await ensureProject(ctx, input.projectId);
      if (input.assetId) {
        const asset = await (ctx.prisma as any).storySceneAsset.findFirst({
          where: { id: input.assetId, projectId: input.projectId, assetType: 'IMAGE', status: 'READY', deletedAt: null },
        });
        if (!asset) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cover image not found' });
      }
      await (ctx.prisma as any).storyProject.update({
        where: { id: input.projectId },
        data: { coverAssetId: input.assetId },
      });
      return { coverAssetId: input.assetId };
    }),

  /** Phase 11 — sidecar WebVTT captions derived from timed NARRATION/DIALOGUE cues. */
  getSequenceCaptions: protectedProcedure
    .input(z.object({ projectId: z.string(), sequenceId: z.string().optional().nullable() }))
    .query(async ({ ctx, input }) => {
      const { sequence } = await getOrCreateSequence(ctx, input.projectId, input.sequenceId);
      const plan = await (ctx.prisma as any).audioPerformancePlan.findFirst({
        where: { sequenceId: sequence.id },
        include: {
          tracks: {
            where: { type: { in: ['NARRATION', 'DIALOGUE'] }, enabled: true },
            include: { cues: { where: { enabled: true }, orderBy: { startTimeSeconds: 'asc' } } },
          },
        },
      });
      const cues = (plan?.tracks ?? [])
        .flatMap((track: any) => track.cues)
        .filter((cue: any) => typeof cue.text === 'string' && cue.text.trim().length > 0);
      const vtt = buildWebVtt(cues.map((cue: any) => ({ start: cue.startTimeSeconds, duration: cue.durationSeconds, text: cue.text })));
      return { vtt, cueCount: cues.length };
    }),

  getWorkspace: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await ensureProject(ctx, input.projectId);
      const project = await (ctx.prisma as any).storyProject.findFirst({
        where: { id: input.projectId, userId: ctx.user.id },
        include: {
          questions: { orderBy: { orderIndex: 'asc' } },
          chapters: { orderBy: { chapterNumber: 'asc' }, select: chapterSelect() },
          characterMemory: { orderBy: { createdAt: 'asc' } },
          sceneSeeds: {
            orderBy: { orderIndex: 'asc' },
            include: {
              assets: {
                where: { deletedAt: null },
                orderBy: { createdAt: 'desc' },
                take: 24,
              },
              prompts: {
                orderBy: { createdAt: 'desc' },
                take: 4,
              },
              promptFeedback: {
                orderBy: { createdAt: 'desc' },
                take: 50,
              },
            },
          },
        },
      });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Story project not found' });
      const readyImageCount = project.sceneSeeds.reduce((sum: number, scene: any) =>
        sum + scene.assets.filter((asset: any) => asset.assetType === 'IMAGE' && asset.status === 'READY').length, 0);
      const coverAsset = project.sceneSeeds
        .flatMap((scene: any) => scene.assets.map((asset: any) => ({ ...asset, sceneId: scene.id, activeImageAssetId: scene.activeImageAssetId })))
        .find((asset: any) => asset.id === asset.activeImageAssetId && asset.status === 'READY')
        ?? project.sceneSeeds.flatMap((scene: any) => scene.assets).find((asset: any) => asset.isLatest && asset.status === 'READY')
        ?? null;
      await trackStoryAnalytics(ctx, {
        event: 'story_workspace_opened',
        projectId: input.projectId,
        audienceMode: project.audienceMode,
        properties: { visualStyle: project.visualStyle, sceneCount: project.sceneSeeds.length, readyImageCount },
      });
      const hydratedProject = await hydrateProjectCriticRuns(ctx, project);
      return {
        project: hydratedProject,
        summary: {
          chapterCount: project.chapters.length,
          characterCount: project.characterMemory.length,
          sceneCount: project.sceneSeeds.length,
          readyImageCount,
          storybookReady: project.sceneSeeds.length > 0 && readyImageCount > 0,
          coverThumbnail: coverAsset?.thumbnailUrl ?? coverAsset?.assetUrl ?? project.sceneSeeds.find((scene: any) => scene.imageUrl)?.imageUrl ?? null,
        },
      };
    }),

  trackWorkspaceTab: protectedProcedure
    .input(z.object({ projectId: z.string(), tab: z.string().min(1).max(40) }))
    .mutation(async ({ ctx, input }) => {
      const project = await ensureProject(ctx, input.projectId);
      const allowedTabs = new Set(['overview', 'story', 'characters', 'scenes', 'assets', 'sequence', 'storybook']);
      if (allowedTabs.has(input.tab) && !(ctx.isR16 && input.tab === 'sequence')) {
        await (ctx.prisma as any).storyProject.update({
          where: { id: input.projectId },
          data: { lastWorkspaceTab: input.tab },
        });
      }
      await trackStoryAnalytics(ctx, {
        event: input.tab === 'assets' ? 'asset_manager_opened' : 'story_workspace_tab_changed',
        projectId: input.projectId,
        audienceMode: project.audienceMode,
        properties: { tab: input.tab, visualStyle: project.visualStyle },
      });
      return { ok: true };
    }),

  setActiveSceneImage: protectedProcedure
    .input(z.object({ projectId: z.string(), sceneId: z.string(), assetId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const project = await ensureProject(ctx, input.projectId);
      const asset = await (ctx.prisma as any).storySceneAsset.findFirst({
        where: {
          id: input.assetId,
          sceneId: input.sceneId,
          projectId: input.projectId,
          userId: ctx.user.id,
          assetType: 'IMAGE',
          status: 'READY',
          deletedAt: null,
        },
      });
      if (!asset) throw new TRPCError({ code: 'NOT_FOUND', message: 'Ready scene image not found' });
      const scene = await (ctx.prisma as any).storySceneSeed.update({
        where: { id: input.sceneId },
        data: {
          activeImageAssetId: asset.id,
          imageUrl: asset.assetUrl,
        },
      });
      await (ctx.prisma as any).storySceneAsset.update({
        where: { id: asset.id },
        data: { selectedForStorybookAt: new Date() },
      });
      await trackStoryAnalytics(ctx, {
        event: 'asset_set_active',
        projectId: input.projectId,
        audienceMode: project.audienceMode,
        properties: { sceneId: input.sceneId, assetId: input.assetId, visualStyle: project.visualStyle },
      });
      await trackStoryAnalytics(ctx, {
        event: 'storybook_image_selection_changed',
        projectId: input.projectId,
        audienceMode: project.audienceMode,
        properties: { sceneId: input.sceneId, assetId: input.assetId, visualStyle: project.visualStyle },
      });
      return { scene, asset };
    }),

  favoriteSceneAsset: protectedProcedure
    .input(z.object({ projectId: z.string(), assetId: z.string(), isFavorite: z.boolean().default(true) }))
    .mutation(async ({ ctx, input }) => {
      const project = await ensureProject(ctx, input.projectId);
      const asset = await (ctx.prisma as any).storySceneAsset.findFirst({
        where: { id: input.assetId, projectId: input.projectId, userId: ctx.user.id, deletedAt: null },
      });
      if (!asset) throw new TRPCError({ code: 'NOT_FOUND', message: 'Scene asset not found' });
      const updated = await (ctx.prisma as any).storySceneAsset.update({
        where: { id: input.assetId },
        data: { isFavorite: input.isFavorite },
      });
      await trackStoryAnalytics(ctx, {
        event: 'asset_favorited',
        projectId: input.projectId,
        audienceMode: project.audienceMode,
        properties: { sceneId: asset.sceneId, assetId: input.assetId, isFavorite: input.isFavorite, visualStyle: project.visualStyle },
      });
      return updated;
    }),

  trackAssetCompared: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      sceneId: z.string(),
      assetIds: z.array(z.string()).min(2).max(2),
    }))
    .mutation(async ({ ctx, input }) => {
      const project = await ensureProject(ctx, input.projectId);
      const assets = await (ctx.prisma as any).storySceneAsset.findMany({
        where: {
          id: { in: input.assetIds },
          projectId: input.projectId,
          sceneId: input.sceneId,
          userId: ctx.user.id,
          assetType: 'IMAGE',
          status: 'READY',
          deletedAt: null,
        },
        select: { id: true },
      });
      if (assets.length !== 2) throw new TRPCError({ code: 'NOT_FOUND', message: 'Ready scene images not found' });
      await trackStoryAnalytics(ctx, {
        event: 'asset_compared',
        projectId: input.projectId,
        audienceMode: project.audienceMode,
        properties: { sceneId: input.sceneId, assetIds: input.assetIds, visualStyle: project.visualStyle },
      });
      return { ok: true };
    }),

  deleteSceneAsset: protectedProcedure
    .input(z.object({ projectId: z.string(), assetId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const project = await ensureProject(ctx, input.projectId);
      const asset = await (ctx.prisma as any).storySceneAsset.findFirst({
        where: { id: input.assetId, projectId: input.projectId, userId: ctx.user.id, deletedAt: null },
      });
      if (!asset) throw new TRPCError({ code: 'NOT_FOUND', message: 'Scene asset not found' });
      const scene = await (ctx.prisma as any).storySceneSeed.findFirst({ where: { id: asset.sceneId, projectId: input.projectId } });
      if (scene?.activeImageAssetId === asset.id) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Choose another active picture before removing this one.' });
      }
      const updated = await (ctx.prisma as any).storySceneAsset.update({
        where: { id: input.assetId },
        data: { deletedAt: new Date(), isFavorite: false, isLatest: false },
      });
      await trackStoryAnalytics(ctx, {
        event: 'asset_removed',
        projectId: input.projectId,
        audienceMode: project.audienceMode,
        properties: { sceneId: asset.sceneId, assetId: input.assetId, visualStyle: project.visualStyle },
      });
      return updated;
    }),

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
      const assets = await (ctx.prisma as any).storySceneAsset.findMany({
        where: { sceneId: input.sceneId, projectId: input.projectId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: input.limit,
      });
      if (ctx.isR16 || assets.length === 0) return assets.map((asset: any) => sanitizeR16AssetPayload({ ...asset, criticRuns: [] }));
      const criticRuns = await (ctx.prisma as any).creativeCriticRun.findMany({
        where: { assetId: { in: assets.map((asset: any) => asset.id) } },
        orderBy: { createdAt: 'desc' },
      });
      const byAsset = new Map<string, any[]>();
      for (const run of criticRuns) {
        const list = byAsset.get(run.assetId) ?? [];
        list.push(run);
        byAsset.set(run.assetId, list);
      }
      return assets.map((asset: any) => ({ ...asset, criticRuns: byAsset.get(asset.id) ?? [] }));
    }),

  getSceneAsset: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      assetId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      await ensureProject(ctx, input.projectId);
      const asset = await (ctx.prisma as any).storySceneAsset.findFirst({
        where: { id: input.assetId, projectId: input.projectId, deletedAt: null },
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
              sequences: true,
            },
          },
          sequences: {
            where: { status: { not: 'ARCHIVED' } },
            orderBy: { updatedAt: 'desc' },
            take: 1,
            select: {
              id: true,
              title: true,
              runtimeSeconds: true,
              currentVersionNumber: true,
              updatedAt: true,
              _count: { select: { scenes: true, versions: true } },
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
      const project = await (ctx.prisma as any).storyProject.findFirst({
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
      return project ? hydrateProjectCriticRuns(ctx, project) : project;
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
                where: { assetType: 'IMAGE', deletedAt: null },
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
                where: { assetType: 'IMAGE', deletedAt: null },
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
                where: { assetType: 'IMAGE', deletedAt: null },
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

  // ─── Phase 9B.2 — Audio & Performance layer ──────────────────────────────
  //
  // Every procedure below is scoped through ensureProject/assertSequenceAllowed
  // exactly like every existing Sequence/Movie Builder procedure — a request
  // for another user's project fails NOT_FOUND before any Audio* table is
  // touched. None of these procedures ever writes to storySequence,
  // storySequenceScene, sequenceVersion, storyCharacterMemory (aside from the
  // explicit optional voice-profile link), storyCharacterMemory director
  // fields, active-image selection, Favorite state, Creative Critic status,
  // or Storybook selection — Source Independence (brief §34) is enforced by
  // construction: these procedures only ever call `.audioPerformancePlan`,
  // `.audioTrack`, `.audioCue`, `.voiceProfile`, `.audioPlanVersion`, or
  // `.audioAsset` Prisma delegates.

  getAudioPlan: protectedProcedure
    .input(z.object({ projectId: z.string(), sequenceId: z.string().optional().nullable() }))
    .query(async ({ ctx, input }) => {
      const { sequence } = await getOrCreateSequence(ctx, input.projectId, input.sequenceId);
      const plan = await getOrCreateAudioPlan(ctx, input.projectId, sequence.id);
      return { plan, sequenceId: sequence.id };
    }),

  // Idempotent by construction — the same find-then-transactional-recheck
  // pattern proven in getOrCreateSequence. Calling this twice for the same
  // sequence returns the same plan id both times (required test A).
  createAudioPlan: protectedProcedure
    .input(z.object({ projectId: z.string(), sequenceId: z.string().optional().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const { sequence } = await getOrCreateSequence(ctx, input.projectId, input.sequenceId);
      const plan = await getOrCreateAudioPlan(ctx, input.projectId, sequence.id);
      await trackStoryAnalytics(ctx, {
        event: 'audio_plan_created',
        projectId: input.projectId,
        properties: { sequenceId: sequence.id, planId: plan.id },
      });
      return plan;
    }),

  addTrack: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      planId: z.string(),
      type: z.enum(AUDIO_TRACK_TYPE_VALUES),
      name: z.string().min(1).max(80),
    }))
    .mutation(async ({ ctx, input }) => {
      await ensureAudioPlanOwnership(ctx, input.projectId, input.planId);
      const existingCount = await ctx.prisma.audioTrack.count({ where: { planId: input.planId } });
      const track = await ctx.prisma.audioTrack.create({
        data: { planId: input.planId, type: input.type, name: input.name, order: existingCount },
      });
      return track;
    }),

  updateTrack: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      trackId: z.string(),
      name: z.string().min(1).max(80).optional(),
      enabled: z.boolean().optional(),
      volume: z.number().min(0).max(4).optional(),
      order: z.number().int().min(0).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertSequenceAllowed(ctx); await ensureProject(ctx, input.projectId);
      const track = await ctx.prisma.audioTrack.findFirst({
        where: { id: input.trackId, plan: { projectId: input.projectId } },
      });
      if (!track) throw new TRPCError({ code: 'NOT_FOUND', message: 'Audio track not found' });
      const { projectId, trackId, ...rest } = input;
      const updated = await ctx.prisma.audioTrack.update({ where: { id: trackId }, data: rest });
      if (rest.enabled !== undefined) {
        await trackStoryAnalytics(ctx, {
          event: 'audio_track_toggled',
          projectId: input.projectId,
          properties: { trackId, enabled: rest.enabled },
        });
      }
      return updated;
    }),

  addCue: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      trackId: z.string(),
      sequenceSceneId: z.string().optional().nullable(),
      characterMemoryId: z.string().optional().nullable(),
      voiceProfileId: z.string().optional().nullable(),
      audioAssetId: z.string().min(1).optional().nullable(),
      startTimeSeconds: z.number().min(0),
      durationSeconds: z.number().min(0).optional().nullable(),
      trimStartSeconds: z.number().min(0).optional().nullable(),
      trimEndSeconds: z.number().min(0).optional().nullable(),
      volume: z.number().min(0).max(4).default(1),
      fadeInSeconds: z.number().min(0).max(10).optional().nullable(),
      fadeOutSeconds: z.number().min(0).max(10).optional().nullable(),
      text: z.string().max(2000).optional().nullable(),
      performancePreset: z.string().max(60).optional().nullable(),
      performanceDirection: z.string().max(500).optional().nullable(),
      duckingEnabled: z.boolean().default(false),
      duckingAmountDb: z.number().min(0).max(30).optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertSequenceAllowed(ctx); await ensureProject(ctx, input.projectId);
      const track = await ctx.prisma.audioTrack.findFirst({
        where: { id: input.trackId, plan: { projectId: input.projectId } },
      });
      if (!track) throw new TRPCError({ code: 'NOT_FOUND', message: 'Audio track not found' });
      // On create there is no "leave unchanged" state — audioAssetId is
      // either absent/null (no asset yet) or a string to validate and attach.
      if (input.audioAssetId) await assertAudioAssetOwnership(ctx, input.projectId, input.audioAssetId);
      const { projectId, trackId, ...rest } = input;
      const existingCount = await ctx.prisma.audioCue.count({ where: { trackId } });
      const cue = await ctx.prisma.audioCue.create({
        data: { trackId, order: existingCount, ...rest },
      });
      await trackStoryAnalytics(ctx, {
        event: 'audio_cue_added',
        projectId: input.projectId,
        properties: { trackId, cueId: cue.id, trackType: track.type },
      });
      return cue;
    }),

  updateCue: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      cueId: z.string(),
      enabled: z.boolean().optional(),
      startTimeSeconds: z.number().min(0).optional(),
      durationSeconds: z.number().min(0).optional().nullable(),
      trimStartSeconds: z.number().min(0).optional().nullable(),
      trimEndSeconds: z.number().min(0).optional().nullable(),
      volume: z.number().min(0).max(4).optional(),
      fadeInSeconds: z.number().min(0).max(10).optional().nullable(),
      fadeOutSeconds: z.number().min(0).max(10).optional().nullable(),
      text: z.string().max(2000).optional().nullable(),
      performancePreset: z.string().max(60).optional().nullable(),
      performanceDirection: z.string().max(500).optional().nullable(),
      characterMemoryId: z.string().optional().nullable(),
      voiceProfileId: z.string().optional().nullable(),
      audioAssetId: z.string().min(1).optional().nullable(),
      duckingEnabled: z.boolean().optional(),
      duckingAmountDb: z.number().min(0).max(30).optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertSequenceAllowed(ctx); await ensureProject(ctx, input.projectId);
      const cue = await ctx.prisma.audioCue.findFirst({
        where: { id: input.cueId, track: { plan: { projectId: input.projectId } } },
      });
      if (!cue) throw new TRPCError({ code: 'NOT_FOUND', message: 'Audio cue not found' });
      // audioAssetId is deliberately three-way, not a truthy check on its
      // own — get this wrong and either removing an attached asset silently
      // fails (undefined mistaken for null) or every unrelated field-only
      // update accidentally re-validates/re-touches audioAssetId (null
      // mistaken for undefined):
      //   undefined -> key omitted from input entirely -> leave unchanged
      //   null      -> explicit clear -> write null, no ownership check
      //   string    -> attach/replace -> must pass ownership first
      // `rest` below still spreads `input` as-is, so the actual DB write
      // inherits this distinction automatically (Prisma: undefined = omit
      // from update, null = set column NULL) — this block only owns the
      // "should we validate ownership first" decision.
      if (input.audioAssetId !== undefined && input.audioAssetId !== null) {
        await assertAudioAssetOwnership(ctx, input.projectId, input.audioAssetId);
      }
      const { projectId, cueId, ...rest } = input;
      const updated = await ctx.prisma.audioCue.update({ where: { id: cueId }, data: rest });
      await trackStoryAnalytics(ctx, {
        event: 'audio_cue_updated',
        projectId: input.projectId,
        properties: { cueId },
      });
      return updated;
    }),

  removeCue: protectedProcedure
    .input(z.object({ projectId: z.string(), cueId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertSequenceAllowed(ctx); await ensureProject(ctx, input.projectId);
      const cue = await ctx.prisma.audioCue.findFirst({
        where: { id: input.cueId, track: { plan: { projectId: input.projectId } } },
      });
      if (!cue) throw new TRPCError({ code: 'NOT_FOUND', message: 'Audio cue not found' });
      await ctx.prisma.audioCue.delete({ where: { id: input.cueId } });
      await trackStoryAnalytics(ctx, {
        event: 'audio_cue_removed',
        projectId: input.projectId,
        properties: { cueId: input.cueId },
      });
      return { deleted: true };
    }),

  duplicateCue: protectedProcedure
    .input(z.object({ projectId: z.string(), cueId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertSequenceAllowed(ctx); await ensureProject(ctx, input.projectId);
      const cue = await ctx.prisma.audioCue.findFirst({
        where: { id: input.cueId, track: { plan: { projectId: input.projectId } } },
      });
      if (!cue) throw new TRPCError({ code: 'NOT_FOUND', message: 'Audio cue not found' });
      const { id, createdAt, updatedAt, ...rest } = cue;
      const duplicate = await ctx.prisma.audioCue.create({ data: rest as any });
      return duplicate;
    }),

/** Phase 9B.3 — generate narration/dialogue audio for a cue via ElevenLabs. */
  generateCueSpeech: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      cueId: z.string(),
      voiceId: z.string().max(80).optional(),
      modelId: z.string().max(80).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertSequenceAllowed(ctx);
      await ensureProject(ctx, input.projectId);
      if (!isElevenLabsTtsEnabled() || !elevenLabsApiKey()) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Narration generation is not enabled.' });
      }
      const cue = await ctx.prisma.audioCue.findFirst({
        where: { id: input.cueId, track: { plan: { projectId: input.projectId } } },
        include: { voiceProfile: true },
      });
      if (!cue) throw new TRPCError({ code: 'NOT_FOUND', message: 'Audio cue not found' });
      if (!cue.text?.trim()) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Add narration text to this cue first.' });
      }
      return generateSpeechForCue(ctx, {
        projectId: input.projectId,
        cueId: cue.id,
        cueText: cue.text,
        voiceRef: cue.voiceProfile?.voiceRef ?? null,
        voiceId: input.voiceId,
        modelId: input.modelId,
      });
    }),

  /**
   * Phase 16.4 — scene narration. Creates an NARRATION cue on the project's
   * audio plan (anchored to the sequence timeline), then generates the speech
   * through the shared `generateSpeechForCue` path (ElevenLabs → R2
   * AudioAsset(GENERATED_SPEECH) → cue link), so the Movie Builder mixer
   * consumes it like any other cue. `text` defaults to a scene-derived line;
   * the ProductionManifest's `elevenlabs_narration` (16.5) can be passed here.
   */
  generateSceneNarration: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      sceneId: z.string(),
      text: z.string().min(1).max(5000).optional(),
      voiceId: z.string().max(80).optional(),
      modelId: z.string().max(80).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertSequenceAllowed(ctx);
      await ensureProject(ctx, input.projectId);
      if (!isElevenLabsTtsEnabled() || !elevenLabsApiKey()) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Narration generation is not enabled.' });
      }
      const scene = await ctx.prisma.storySceneSeed.findFirst({
        where: { id: input.sceneId, projectId: input.projectId },
      });
      if (!scene) throw new TRPCError({ code: 'NOT_FOUND', message: 'Story scene not found' });

      const narration = input.text?.trim() || `${scene.title}. ${scene.description ?? ''}`.trim();
      if (!narration) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No narration text for this scene.' });

      const { sequence } = await getOrCreateSequence(ctx, input.projectId);
      const plan = await getOrCreateAudioPlan(ctx, input.projectId, sequence.id);
      let track = plan.tracks.find((t: any) => t.type === 'NARRATION');
      if (!track) {
        track = await ctx.prisma.audioTrack.create({
          data: { planId: plan.id, type: 'NARRATION', name: 'Narration', order: 0 },
        });
      }

      const sequenceScene = await ctx.prisma.storySequenceScene.findFirst({
        where: { storySceneId: scene.id, sequenceId: sequence.id },
      });
      // Anchor to the canonical timeline: sum enabled prior shots (duration + hold).
      const prior = sequenceScene
        ? await ctx.prisma.storySequenceScene.findMany({
            where: { sequenceId: sequence.id, enabled: true, orderIndex: { lt: sequenceScene.orderIndex } },
            orderBy: { orderIndex: 'asc' },
            select: { durationSeconds: true, holdDurationSeconds: true },
          })
        : [];
      const startTimeSeconds = prior.reduce((sum, shot) => sum + (shot.durationSeconds ?? 4) + (shot.holdDurationSeconds ?? 0), 0);

      // Idempotent: reuse an existing scene-narration cue for this scene so
      // one-click "Generate narration" (all scenes) never duplicates cues.
      const existingCue = await ctx.prisma.audioCue.findFirst({
        where: {
          track: { plan: { projectId: input.projectId } },
          metadata: { path: ['sceneId'], equals: scene.id },
        },
      });
      const cue = existingCue
        ? await ctx.prisma.audioCue.update({ where: { id: existingCue.id }, data: { text: narration } })
        : await ctx.prisma.audioCue.create({
            data: {
              trackId: track.id,
              sequenceSceneId: sequenceScene?.id ?? null,
              startTimeSeconds,
              text: narration,
              metadata: { source: 'scene_narration', sceneId: scene.id, sceneTitle: scene.title },
            },
          });

      const result = await generateSpeechForCue(ctx, {
        projectId: input.projectId,
        cueId: cue.id,
        cueText: narration,
        voiceId: input.voiceId,
        modelId: input.modelId,
      });
      await trackStoryAnalytics(ctx, {
        event: 'scene_narration_generated',
        projectId: input.projectId,
        properties: { sceneId: scene.id, cueId: cue.id, assetId: result.asset.id, voiceModel: elevenLabsModelId() },
      });
      return { cue: result.cue, asset: result.asset, narration };
    }),

  /** Background music / ambience generation for a MUSIC or AMBIENCE cue (Lyria). */
  generateCueMusic: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      cueId: z.string(),
      prompt: z.string().max(500).optional(),
      modelId: z.string().max(80).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertSequenceAllowed(ctx);
      const project = await ctx.prisma.storyProject.findFirst({
        where: { id: input.projectId, userId: ctx.user.id },
        select: { genre: true, tone: true, theme: true },
      });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Story project not found' });
      if (!isLyriaMusicEnabled() || !geminiApiKey()) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Music generation is not enabled.' });
      }
      const cue = await ctx.prisma.audioCue.findFirst({
        where: { id: input.cueId, track: { plan: { projectId: input.projectId } } },
        include: { track: { select: { type: true } } },
      });
      if (!cue) throw new TRPCError({ code: 'NOT_FOUND', message: 'Audio cue not found' });
      if (cue.track.type !== 'MUSIC' && cue.track.type !== 'AMBIENCE') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Music generation applies to MUSIC or AMBIENCE cues.' });
      }

      const prompt = (input.prompt?.trim() || cue.text?.trim() || defaultMusicPrompt(project)).slice(0, 500);
      const moderation = await moderatePrompt(prompt);
      if (!moderation.allowed) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: moderation.reason ?? 'Music prompt violates our content guidelines.' });
      }

      const rate = await resolveFeatureCreditRate(ctx.prisma, STORY_AUDIO_GENERATION_FEATURE_KEY);
      if (!rate.configured) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Music generation pricing is not configured yet. Set the `story:audio_generation` credit rate in Admin → Credits.',
          cause: { errorCode: rate.errorCode },
        });
      }

      const creditsUsed = await deductCredits(ctx.prisma, ctx.user.id, STORY_AUDIO_GENERATION_FEATURE_KEY, cue.id, 'Music generation');

      try {
        const { audio, mimeType } = await generateLyriaMusic({ prompt, modelId: input.modelId });
        const ext = mimeType.includes('wav') ? 'wav' : 'mp3';
        const storageKey = `story-projects/${input.projectId}/audio/${cue.id}-${Date.now()}.${ext}`;
        const publicUrl = await uploadBufferToR2(audio, storageKey, mimeType);
        if (!publicUrl) throw new Error('R2 storage is not configured for music.');

        const asset = await ctx.prisma.audioAsset.create({
          data: {
            projectId: input.projectId,
            userId: ctx.user.id,
            storageProvider: 'R2',
            storageKey,
            publicUrl,
            mimeType,
            fileSizeBytes: audio.length,
            sourceKind: 'GENERATED_MUSIC',
          },
        });
        const updatedCue = await ctx.prisma.audioCue.update({
          where: { id: cue.id },
          data: { audioAssetId: asset.id },
          include: { audioAsset: true },
        });
        await trackStoryAnalytics(ctx, {
          event: 'audio_cue_updated',
          projectId: input.projectId,
          properties: { cueId: cue.id, generation: 'music', model: lyriaModelId(), assetId: asset.id },
        });
        return { cue: updatedCue, asset };
      } catch (error) {
        await refundCredits(ctx.prisma, ctx.user.id, creditsUsed, STORY_AUDIO_GENERATION_FEATURE_KEY, cue.id, 'Refund: music generation failed').catch(() => {});
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Music generation failed',
        });
      }
    }),

  listVoiceProfiles: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      assertSequenceAllowed(ctx); await ensureProject(ctx, input.projectId);
      return ctx.prisma.voiceProfile.findMany({
        where: { projectId: input.projectId },
        orderBy: { createdAt: 'asc' },
      });
    }),

  /** Available ElevenLabs narration voices (account voices, curated fallback). */
  listNarrationVoices: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      assertSequenceAllowed(ctx); await ensureProject(ctx, input.projectId);
      if (!isElevenLabsTtsEnabled() || !elevenLabsApiKey()) return [];
      const voices = await listElevenLabsVoices();
      return voices.length > 0 ? voices : ELEVENLABS_CURATED_VOICES;
    }),

  createVoiceProfile: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      characterMemoryId: z.string().optional().nullable(),
      name: z.string().min(1).max(80),
      voiceType: z.string().max(40).optional().nullable(),
      voiceRef: z.string().max(200).optional().nullable(),
      language: z.string().max(20).optional().nullable(),
      accentStyle: z.string().max(80).optional().nullable(),
      pitch: z.number().optional().nullable(),
      rate: z.number().optional().nullable(),
      styleNotes: z.string().max(500).optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertSequenceAllowed(ctx); await ensureProject(ctx, input.projectId);
      const profile = await ctx.prisma.voiceProfile.create({ data: input });
      await trackStoryAnalytics(ctx, {
        event: 'voice_profile_created',
        projectId: input.projectId,
        properties: { voiceProfileId: profile.id, characterMemoryId: input.characterMemoryId ?? null },
      });
      return profile;
    }),

  updateVoiceProfile: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      voiceProfileId: z.string(),
      name: z.string().min(1).max(80).optional(),
      voiceType: z.string().max(40).optional().nullable(),
      voiceRef: z.string().max(200).optional().nullable(),
      language: z.string().max(20).optional().nullable(),
      accentStyle: z.string().max(80).optional().nullable(),
      pitch: z.number().optional().nullable(),
      rate: z.number().optional().nullable(),
      styleNotes: z.string().max(500).optional().nullable(),
      characterMemoryId: z.string().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertSequenceAllowed(ctx); await ensureProject(ctx, input.projectId);
      const profile = await ctx.prisma.voiceProfile.findFirst({
        where: { id: input.voiceProfileId, projectId: input.projectId },
      });
      if (!profile) throw new TRPCError({ code: 'NOT_FOUND', message: 'Voice profile not found' });
      const { projectId, voiceProfileId, ...rest } = input;
      const updated = await ctx.prisma.voiceProfile.update({ where: { id: voiceProfileId }, data: rest });
      await trackStoryAnalytics(ctx, {
        event: 'voice_profile_updated',
        projectId: input.projectId,
        properties: { voiceProfileId },
      });
      return updated;
    }),

  getAudioBlueprint: protectedProcedure
    .input(z.object({ projectId: z.string(), sequenceId: z.string().optional().nullable() }))
    .query(async ({ ctx, input }) => {
      const { sequence } = await getOrCreateSequence(ctx, input.projectId, input.sequenceId);
      const plan = await getOrCreateAudioPlan(ctx, input.projectId, sequence.id);
      const filmBlueprint = buildFilmBlueprint({ sequenceId: sequence.id, version: sequence.currentVersionNumber, scenes: sequence.scenes });
      const blueprint = buildAudioBlueprint({
        filmBlueprint,
        tracks: plan.tracks,
        resolvedAudioAssets: await resolveProjectAudioAssets(ctx, input.projectId, plan.tracks),
      });
      return { blueprint, planId: plan.id };
    }),

  saveAudioVersion: protectedProcedure
    .input(z.object({ projectId: z.string(), planId: z.string(), title: z.string().min(1).max(80).optional(), notes: z.string().max(500).optional().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const plan = await ensureAudioPlanOwnership(ctx, input.projectId, input.planId, true);
      const sequence = await ctx.prisma.storySequence.findUnique({
        where: { id: plan.sequenceId },
        include: sequenceInclude,
      });
      if (!sequence) throw new TRPCError({ code: 'NOT_FOUND', message: 'Sequence not found for this audio plan' });
      const filmBlueprint = buildFilmBlueprint({ sequenceId: sequence.id, version: sequence.currentVersionNumber, scenes: sequence.scenes });
      const audioBlueprint = buildAudioBlueprint({
        filmBlueprint,
        tracks: plan.tracks,
        resolvedAudioAssets: await resolveProjectAudioAssets(ctx, input.projectId, plan.tracks),
      });

      // Monotonic max(existing)+1 versioning — the exact bug class called out
      // in the brief ("we already encountered this bug in Phase 9A") is
      // guarded against by nextAudioVersionFromExisting, mirroring
      // nextSequenceVersionFromExisting exactly.
      const existingVersions = await ctx.prisma.audioPlanVersion.findMany({
        where: { planId: input.planId },
        select: { versionNumber: true },
      });
      const versionNumber = nextAudioVersionFromExisting(existingVersions);

      const version = await ctx.prisma.audioPlanVersion.create({
        data: {
          planId: input.planId,
          versionNumber,
          title: input.title ?? `Version ${versionNumber}`,
          snapshot: plan.tracks,
          audioBlueprint,
          runtimeSeconds: audioBlueprint.runtimeSeconds,
          createdById: ctx.user.id,
          notes: input.notes ?? null,
        },
      });
      await ctx.prisma.audioPerformancePlan.update({
        where: { id: input.planId },
        data: { currentVersionNumber: versionNumber },
      });
      await trackStoryAnalytics(ctx, {
        event: 'audio_version_saved',
        projectId: input.projectId,
        properties: { planId: input.planId, versionNumber },
      });
      return version;
    }),

  listAudioVersions: protectedProcedure
    .input(z.object({ projectId: z.string(), planId: z.string() }))
    .query(async ({ ctx, input }) => {
      await ensureAudioPlanOwnership(ctx, input.projectId, input.planId);
      return ctx.prisma.audioPlanVersion.findMany({
        where: { planId: input.planId },
        orderBy: { versionNumber: 'desc' },
      });
    }),

  // Restoring never reuses an existing version number — it recreates the
  // live tracks/cues from the chosen snapshot, then the NEXT saveAudioVersion
  // call still allocates max(existing)+1, so the sequence is 1, 2, 3, ...,
  // never 1, 2, 2 (required test F / brief §19 regression).
  restoreAudioVersion: protectedProcedure
    .input(z.object({ projectId: z.string(), planId: z.string(), versionNumber: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const plan = await restoreAudioVersionForPlan(ctx, input);
      await trackStoryAnalytics(ctx, {
        event: 'audio_version_restored',
        projectId: input.projectId,
        properties: { planId: input.planId, versionNumber: input.versionNumber },
      });
      return getOrCreateAudioPlan(ctx, input.projectId, plan.sequenceId);
    }),

  duplicateAudioVersion: protectedProcedure
    .input(z.object({ projectId: z.string(), planId: z.string(), versionNumber: z.number().int(), title: z.string().max(80).optional() }))
    .mutation(async ({ ctx, input }) => {
      await ensureAudioPlanOwnership(ctx, input.projectId, input.planId);
      const source = await ctx.prisma.audioPlanVersion.findUnique({
        where: { planId_versionNumber: { planId: input.planId, versionNumber: input.versionNumber } },
      });
      if (!source) throw new TRPCError({ code: 'NOT_FOUND', message: 'Audio plan version not found' });

      const existingVersions = await ctx.prisma.audioPlanVersion.findMany({
        where: { planId: input.planId },
        select: { versionNumber: true },
      });
      const versionNumber = nextAudioVersionFromExisting(existingVersions);
      const duplicate = await ctx.prisma.audioPlanVersion.create({
        data: {
          planId: input.planId,
          versionNumber,
          title: input.title ?? `${source.title} (copy)`,
          snapshot: source.snapshot as any,
          audioBlueprint: source.audioBlueprint as any,
          runtimeSeconds: source.runtimeSeconds,
          createdById: ctx.user.id,
          notes: source.notes,
        },
      });
      return duplicate;
    }),
});
