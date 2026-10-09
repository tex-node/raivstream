/**
 * Raivstream 5.0 — Creative audio service (Phase 6A + 6B).
 *
 * Bridges the Creative 5.0 lifecycle to the existing audio infrastructure.
 * All audio operations are gated behind isCreativeAudioEnabled().
 *
 * Phase 6A: Foundation — plan seeding from Bible (Homer → AudioPlan).
 * Phase 6B: TTS/ElevenLabs bridge — narration plan, cue seeding, generation.
 * Phase 6D: Music generation (added there).
 */

import { TRPCError } from '@trpc/server';
import type { PrismaClient } from '@raivstream/database';
import type { AudioLanguageSpec, CreativeBibleState } from '../shared/types';
import type { CreativeProductionPlanState } from '../production/plan';
import { isCreativeAudioEnabled } from '../featureFlags';
import { CreativeError } from '../shared/errors';
import {
  resolveFeatureCreditRate,
  deductCredits,
  refundCredits,
  STORY_SPEECH_GENERATION_FEATURE_KEY,
  STORY_AUDIO_GENERATION_FEATURE_KEY,
} from '../../credits';
import {
  synthesizeSpeech,
  isElevenLabsTtsEnabled,
  elevenLabsDefaultVoiceId,
  type ElevenLabsSpeechDeps,
} from '../../generators/elevenLabsTts';
import {
  generateMusic,
  isLyriaMusicEnabled,
  lyriaModelId,
  type LyriaMusicInput,
  type LyriaMusicDeps,
} from '../../generators/lyriaMusic';
import { uploadBufferToR2 } from '../../r2';
import { moderatePrompt } from '../../promptModeration';

export interface SeedAudioPlanInput {
  creativeVersionId: string;
  bible: CreativeBibleState | null | undefined;
}

export interface SeedAudioPlanResult {
  planId: string;
  tracksCreated: number;
}

/**
 * Seed an AudioPerformancePlan for a Creative 5.0 version from the Bible.
 *
 * Called after plan-build (Homer has already populated bible.audioLanguage).
 * Creates standard tracks (NARRATION, DIALOGUE, MUSIC, AMBIENCE) with ordering
 * and volumes from the bible's audio language direction. No cues are created —
 * those are added by Phase 6C (TTS) and 6D (music).
 *
 * Idempotent: if a plan already exists for this creativeVersionId it is returned
 * without modification (so re-running plan-build does not duplicate plans).
 *
 * No-op when isCreativeAudioEnabled() is false.
 */
export async function seedAudioPlanFromBible(
  prisma: PrismaClient,
  input: SeedAudioPlanInput,
): Promise<SeedAudioPlanResult | null> {
  if (!isCreativeAudioEnabled()) return null;

  const existing = await (prisma as unknown as PrismaClientWithAudio).audioPerformancePlan.findFirst({
    where: { creativeVersionId: input.creativeVersionId },
    select: { id: true },
  });
  if (existing) return { planId: existing.id, tracksCreated: 0 };

  const audioLanguage = input.bible?.audioLanguage as AudioLanguageSpec | undefined;

  const plan = await (prisma as unknown as PrismaClientWithAudio).audioPerformancePlan.create({
    data: {
      creativeVersionId: input.creativeVersionId,
      status: 'DRAFT',
      currentVersionNumber: 0,
      tracks: {
        create: defaultTracks(audioLanguage),
      },
    },
    select: { id: true, tracks: { select: { id: true } } },
  });

  return { planId: plan.id, tracksCreated: plan.tracks.length };
}

/**
 * Retrieve the audio plan for a Creative 5.0 version, or null if none exists.
 */
export async function getAudioPlanForVersion(
  prisma: PrismaClient,
  creativeVersionId: string,
): Promise<{ id: string; status: string; trackCount: number } | null> {
  if (!isCreativeAudioEnabled()) return null;

  const plan = await (prisma as unknown as PrismaClientWithAudio).audioPerformancePlan.findFirst({
    where: { creativeVersionId },
    select: { id: true, status: true, _count: { select: { tracks: true } } },
  });
  if (!plan) return null;
  return { id: plan.id, status: plan.status, trackCount: plan._count.tracks };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

type TrackCreateInput = {
  type: string;
  name: string;
  enabled: boolean;
  volume: number;
  order: number;
};

function defaultTracks(audioLanguage: AudioLanguageSpec | undefined): TrackCreateInput[] {
  const hasMusic = Boolean(audioLanguage?.score ?? audioLanguage?.style);
  return [
    { type: 'NARRATION', name: 'Narration',   enabled: true,     volume: 1.0, order: 0 },
    { type: 'DIALOGUE',  name: 'Dialogue',    enabled: true,     volume: 1.0, order: 1 },
    { type: 'MUSIC',     name: 'Music',       enabled: hasMusic, volume: 0.4, order: 2 },
    { type: 'AMBIENCE',  name: 'Ambience',    enabled: true,     volume: 0.3, order: 3 },
  ];
}

// ─── Phase 6B — Narration plan + TTS bridge ──────────────────────────────────

export interface NarrationCue {
  sceneId: string;
  sceneIndex: number;
  text: string;
  startTimeSeconds: number;
  durationSeconds: number;
  performanceDirection: string;
}

export interface NarrationPlan {
  cues: NarrationCue[];
  /** Resolved from bible.audioLanguage.primaryLanguage — BCP-47 tag. */
  primaryLanguage: string;
  /** Resolved from bible.audioLanguage.voiceStyle for performance notes. */
  voiceStyle: string | undefined;
}

/**
 * Pure function: derive a typed narration plan from the Creative 5.0 plan + Bible.
 * Creates one cue per scene that has narration text.
 * No DB reads — deterministic and unit-testable.
 */
export function buildNarrationPlan(
  plan: CreativeProductionPlanState,
  bible: CreativeBibleState | null | undefined,
): NarrationPlan {
  const audioLanguage = bible?.audioLanguage;
  const primaryLanguage = audioLanguage?.primaryLanguage ?? 'en';
  const voiceStyle = audioLanguage?.voiceStyle;

  const cues: NarrationCue[] = [];
  for (let i = 0; i < plan.scenes.length; i++) {
    const scene = plan.scenes[i];
    const text = scene?.narration?.trim();
    if (!text) continue;

    const entry = plan.timeline.find((t) => t.sceneId === scene.sceneId);
    const startTimeSeconds = entry?.startSeconds ?? 0;
    const durationSeconds = scene.estimatedDurationSeconds;

    const base = audioLanguage?.style ?? audioLanguage?.mood;
    const performanceDirection = voiceStyle
      ? `${voiceStyle}${base ? `, ${base}` : ''}`
      : (base ?? 'clear, measured delivery');

    cues.push({ sceneId: scene.sceneId, sceneIndex: i, text, startTimeSeconds, durationSeconds, performanceDirection });
  }

  return { cues, primaryLanguage, voiceStyle };
}

export interface SeedNarrationCuesInput {
  planId: string;
  plan: CreativeProductionPlanState;
  bible: CreativeBibleState | null | undefined;
}

export interface SeedNarrationCuesResult {
  cuesCreated: number;
  cuesSkipped: number;
}

/**
 * Idempotent: seed AudioCue rows on the NARRATION track from a NarrationPlan.
 * Re-running after a plan rebuild does not create duplicate cues — existing
 * cues for the same sceneId are detected via metadata and skipped.
 *
 * Returns null when isCreativeAudioEnabled() is false.
 */
export async function seedNarrationCues(
  prisma: PrismaClient,
  input: SeedNarrationCuesInput,
): Promise<SeedNarrationCuesResult | null> {
  if (!isCreativeAudioEnabled()) return null;

  const narrationPlan = buildNarrationPlan(input.plan, input.bible);
  if (narrationPlan.cues.length === 0) return { cuesCreated: 0, cuesSkipped: 0 };

  const db = prisma as unknown as PrismaClientWithAudio;

  // Find the NARRATION track for this plan.
  const track = await db.audioTrack.findFirst({
    where: { planId: input.planId, type: 'NARRATION' },
    select: { id: true },
  });
  if (!track) return { cuesCreated: 0, cuesSkipped: 0 };

  // Fetch existing cues so we can detect duplicates by sceneId.
  const existing = await db.audioCue.findMany({
    where: { trackId: track.id },
    select: { metadata: true },
  });
  const existingSceneIds = new Set<string>(
    existing
      .map((c) => (c.metadata as Record<string, unknown> | null)?.['sceneId'] as string | undefined)
      .filter((id): id is string => Boolean(id)),
  );

  let cuesCreated = 0;
  let cuesSkipped = 0;
  for (const cue of narrationPlan.cues) {
    if (existingSceneIds.has(cue.sceneId)) {
      cuesSkipped++;
      continue;
    }
    await db.audioCue.create({
      data: {
        trackId: track.id,
        text: cue.text,
        performanceDirection: cue.performanceDirection,
        startTimeSeconds: cue.startTimeSeconds,
        durationSeconds: cue.durationSeconds,
        order: cue.sceneIndex,
        enabled: true,
        volume: 1.0,
        metadata: { sceneId: cue.sceneId, language: narrationPlan.primaryLanguage },
      },
    });
    cuesCreated++;
  }

  return { cuesCreated, cuesSkipped };
}

export interface GenerateNarrationForCueInput {
  cueId: string;
  userId: string;
  creativeVersionId: string;
  /** For storage key construction only — does not need a StoryProject row. */
  creativeProjectId: string;
  deps?: ElevenLabsSpeechDeps;
}

export interface GenerateNarrationForCueResult {
  assetId: string;
  storageKey: string;
  creditsUsed: number;
}

/**
 * Generate TTS audio for a single narration cue and materialise it.
 *
 * Fail-closed: throws PRECONDITION_FAILED when the credit rate is not configured
 * (production rates are not seeded — this is by design). Only proceeds if both
 * isCreativeAudioEnabled() and isElevenLabsTtsEnabled() are true.
 *
 * Returns null when isCreativeAudioEnabled() is false (silent no-op).
 */
export async function generateNarrationForCue(
  prisma: PrismaClient,
  input: GenerateNarrationForCueInput,
): Promise<GenerateNarrationForCueResult | null> {
  if (!isCreativeAudioEnabled()) return null;

  const db = prisma as unknown as PrismaClientWithAudio;

  const cue = await db.audioCue.findUnique({
    where: { id: input.cueId },
    select: {
      id: true,
      text: true,
      voiceProfileId: true,
      voiceProfile: { select: { voiceRef: true } },
    },
  });
  if (!cue) throw new TRPCError({ code: 'NOT_FOUND', message: 'Audio cue not found.' });

  const text = cue.text?.trim();
  if (!text) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cue has no narration text.' });

  // Gate 1 — credit rate must be configured (fail-closed by design).
  const creditRate = await resolveFeatureCreditRate(prisma, STORY_SPEECH_GENERATION_FEATURE_KEY);
  if (!creditRate.configured) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: `TTS credit rate not configured (${creditRate.errorCode}). Contact an administrator.`,
    });
  }

  // Gate 2 — ElevenLabs must be enabled.
  if (!isElevenLabsTtsEnabled(input.deps?.env)) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'ElevenLabs TTS is not enabled on this server.',
    });
  }

  // Gate 3 — content moderation.
  const moderation = await moderatePrompt(text);
  if (!moderation.allowed) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: moderation.reason ?? 'Narration text was blocked by content moderation.' });
  }

  // Deduct credits before calling the provider (refund on failure).
  const creditsUsed = await deductCredits(
    prisma,
    input.userId,
    STORY_SPEECH_GENERATION_FEATURE_KEY,
    input.cueId,
    `Creative narration TTS — cue ${input.cueId}`,
  );

  const voiceId = (cue.voiceProfile?.voiceRef ?? null) || elevenLabsDefaultVoiceId(input.deps?.env);
  const storageKey = `creative/${input.creativeProjectId}/audio/${input.cueId}-${Date.now()}.mp3`;

  try {
    const audio = await synthesizeSpeech({ text, voiceId }, input.deps);
    const publicUrl = await uploadBufferToR2(audio, storageKey, 'audio/mpeg');
    if (!publicUrl) throw new Error('R2 storage is not configured for narration.');

    const asset = await db.audioAsset.create({
      data: {
        userId: input.userId,
        creativeVersionId: input.creativeVersionId,
        storageProvider: 'R2',
        storageKey,
        publicUrl,
        mimeType: 'audio/mpeg',
        sourceKind: 'SYNTHETIC_TTS',
        promptText: text,
        providerJobId: `elevenlabs:${voiceId}`,
      },
      select: { id: true },
    });

    // Materialise the cue — link the generated asset.
    await db.audioCue.update({
      where: { id: input.cueId },
      data: { audioAssetId: asset.id },
    });

    return { assetId: asset.id, storageKey, creditsUsed };
  } catch (err) {
    await refundCredits(
      prisma,
      input.userId,
      creditsUsed,
      STORY_SPEECH_GENERATION_FEATURE_KEY,
      input.cueId,
      `Refund — Creative narration TTS failure cue ${input.cueId}`,
    );
    throw err;
  }
}

// ─── Phase 6C — Music brief + final-stage Lyria generation ──────────────────

export interface MusicBrief {
  prompt: string;
  negativePrompt: string;
  /** Resolved duration used to inform Lyria of the desired track length. */
  durationSeconds: number;
}

/**
 * Pure function: derive a Google Lyria music brief from the approved creative
 * state and the bible's audio language spec.
 *
 * Creator instructions always take precedence over inferred preferences.
 * All fields in AudioLanguageSpec are optional; sensible defaults apply.
 */
export function buildMusicBrief(
  bible: CreativeBibleState | null | undefined,
  plan: CreativeProductionPlanState,
  creatorInstructions?: string,
): MusicBrief {
  const duration = Math.max(1, Math.round(plan.totalRuntimeSeconds));
  const negativePrompt = 'vocals, singing, lyrics, speech, talking, sound effects, noise';

  if (creatorInstructions?.trim()) {
    return {
      prompt: `Instrumental background score. ${creatorInstructions.trim()}. Approximately ${duration} seconds. No vocals, no lyrics.`,
      negativePrompt,
      durationSeconds: duration,
    };
  }

  const audio = bible?.audioLanguage;
  const parts: string[] = ['Instrumental background score.'];
  if (audio?.score) parts.push(audio.score);
  else if (audio?.style) parts.push(audio.style);
  if (audio?.mood) parts.push(`${audio.mood} mood`);
  if (audio?.tempo) parts.push(`${audio.tempo} pacing`);
  if (audio?.sound) parts.push(audio.sound);
  parts.push(`Approximately ${duration} seconds.`);
  parts.push('No vocals, no lyrics.');

  return { prompt: parts.join(' '), negativePrompt, durationSeconds: duration };
}

export interface GenerateMusicInput {
  creativeVersionId: string;
  creativeProjectId: string;
  userId: string;
  /** Creator-supplied text instructions override inferred music brief. */
  creatorInstructions?: string;
  deps?: LyriaMusicDeps;
}

export interface GenerateMusicResult {
  assetId: string;
  storageKey: string;
  creditsUsed: number;
  /** true when an existing materialised track was returned without a new charge. */
  reused: boolean;
}

/**
 * Final-stage music generation for an approved Creative 5.0 version.
 *
 * Authorization gate: the CreativeVersion must have an APPROVED CREATIVE
 * approval record — music generation is only permitted in the final-output
 * workflow, never during scene production, preview, or review.
 *
 * Idempotent: if the MUSIC track already has a materialised AudioCue (audioAssetId
 * set), the existing asset is returned with creditsUsed=0 and reused=true.
 *
 * Fail-closed: throws PRECONDITION_FAILED when:
 *   - Lyria is disabled (isLyriaMusicEnabled() = false)
 *   - The version is not CREATIVE-approved
 *   - The audio plan or MUSIC track is absent
 *   - The story:audio_generation credit rate is not configured
 *
 * Returns null when isCreativeAudioEnabled() is false (silent no-op).
 */
export async function generateMusicForVersion(
  prisma: PrismaClient,
  input: GenerateMusicInput,
): Promise<GenerateMusicResult | null> {
  if (!isCreativeAudioEnabled()) return null;

  if (!isLyriaMusicEnabled(input.deps?.env)) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Lyria music generation is not enabled on this server.' });
  }

  // Authorization — version must carry a CREATIVE approval.
  const approval = await prisma.creativeApproval.findUnique({
    where: { versionId_kind: { versionId: input.creativeVersionId, kind: 'CREATIVE' as never } },
    select: { status: true },
  });
  if (approval?.status !== 'APPROVED') {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Creative version must be approved before generating the soundtrack.' });
  }

  const db = prisma as unknown as PrismaClientWithAudio;

  // Find the AudioPerformancePlan for this version.
  const audioPlan = await db.audioPerformancePlan.findFirst({
    where: { creativeVersionId: input.creativeVersionId },
    select: { id: true },
  });
  if (!audioPlan) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'No audio plan found. Run seedAudioPlanFromBible first.' });
  }

  const musicTrack = await db.audioTrack.findFirst({
    where: { planId: audioPlan.id, type: 'MUSIC' },
    select: { id: true },
  });
  if (!musicTrack) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'No MUSIC track found on the audio plan.' });
  }

  // Idempotency — return the existing materialised track without a new charge.
  const existingCue = await db.audioCue.findFirst({
    where: { trackId: musicTrack.id, audioAssetId: { not: null } },
    select: { id: true, audioAssetId: true },
  });
  if (existingCue?.audioAssetId) {
    const existingAsset = await db.audioAsset.findUnique({
      where: { id: existingCue.audioAssetId },
      select: { id: true, storageKey: true },
    });
    if (existingAsset) {
      return { assetId: existingAsset.id, storageKey: existingAsset.storageKey, creditsUsed: 0, reused: true };
    }
  }

  // Credit gate — rate must be configured (seeded in Phase 6C).
  const creditRate = await resolveFeatureCreditRate(prisma, STORY_AUDIO_GENERATION_FEATURE_KEY);
  if (!creditRate.configured) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: `Music credit rate not configured (${creditRate.errorCode}).` });
  }

  // Fetch version snapshot + project bible for brief construction.
  const version = await prisma.creativeVersion.findUnique({
    where: { id: input.creativeVersionId },
    select: { snapshot: true },
  });
  const project = await prisma.creativeProject.findUnique({
    where: { id: input.creativeProjectId },
    select: { bible: true },
  });
  const plan = (version?.snapshot as { plan?: CreativeProductionPlanState } | null)?.plan;
  if (!plan) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Version has no production plan.' });
  const bible = project?.bible as CreativeBibleState | null | undefined;

  const brief = buildMusicBrief(bible, plan, input.creatorInstructions);

  // Deduct credits BEFORE provider call (refund on any failure after this point).
  const creditsUsed = await deductCredits(
    prisma,
    input.userId,
    STORY_AUDIO_GENERATION_FEATURE_KEY,
    input.creativeVersionId,
    `Creative music track — version ${input.creativeVersionId}`,
  );

  // Create an unmaterialised cue as the intent record.
  const newCue = await db.audioCue.create({
    data: {
      trackId: musicTrack.id,
      startTimeSeconds: 0,
      durationSeconds: brief.durationSeconds,
      order: 0,
      enabled: true,
      volume: 0.4,
      metadata: { kind: 'MUSIC_TRACK', creativeVersionId: input.creativeVersionId },
    },
  });

  const storageKeyBase = `creative/${input.creativeProjectId}/music/${newCue.id}-${Date.now()}`;

  try {
    const musicResult = await generateMusic(
      { prompt: brief.prompt, negativePrompt: brief.negativePrompt } satisfies LyriaMusicInput,
      input.deps ?? {},
    );
    const ext = musicResult.mimeType.includes('wav') ? 'wav' : 'mp3';
    const storageKey = `${storageKeyBase}.${ext}`;

    const publicUrl = await uploadBufferToR2(musicResult.audio, storageKey, musicResult.mimeType);
    if (!publicUrl) throw new Error('R2 storage is not configured for music.');

    const asset = await db.audioAsset.create({
      data: {
        userId: input.userId,
        creativeVersionId: input.creativeVersionId,
        storageProvider: 'R2',
        storageKey,
        publicUrl,
        mimeType: musicResult.mimeType,
        sourceKind: 'SYNTHETIC_MUSIC',
        promptText: brief.prompt,
        providerJobId: `lyria:${lyriaModelId(input.deps?.env)}`,
      },
      select: { id: true },
    });

    await db.audioCue.update({
      where: { id: newCue.id },
      data: { audioAssetId: asset.id },
    });

    return { assetId: asset.id, storageKey, creditsUsed, reused: false };
  } catch (err) {
    await refundCredits(
      prisma,
      input.userId,
      creditsUsed,
      STORY_AUDIO_GENERATION_FEATURE_KEY,
      input.creativeVersionId,
      `Refund — Creative music generation failure version ${input.creativeVersionId}`,
    );
    throw err;
  }
}

// ─── Typed accessors ──────────────────────────────────────────────────────────
// The Prisma client gained audioPerformancePlan via the Phase 6A migration.
// The cast keeps the service compilable before prisma generate runs.
type PrismaClientWithAudio = {
  audioPerformancePlan: {
    findFirst: (args: { where: Record<string, unknown>; select?: Record<string, unknown> }) => Promise<{ id: string; status: string; tracks: { id: string }[]; _count: { tracks: number } } | null>;
    create: (args: { data: Record<string, unknown>; select?: Record<string, unknown> }) => Promise<{ id: string; tracks: { id: string }[] }>;
  };
  audioTrack: {
    findFirst: (args: { where: Record<string, unknown>; select?: Record<string, unknown> }) => Promise<{ id: string } | null>;
  };
  audioCue: {
    findMany: (args: { where: Record<string, unknown>; select?: Record<string, unknown> }) => Promise<Array<{ metadata: unknown }>>;
    findFirst: (args: { where: Record<string, unknown>; select?: Record<string, unknown> }) => Promise<{ id: string; audioAssetId: string | null } | null>;
    findUnique: (args: { where: Record<string, unknown>; select?: Record<string, unknown> }) => Promise<{ id: string; text: string | null; voiceProfileId: string | null; voiceProfile: { voiceRef: string | null } | null } | null>;
    create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
    update: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<{ id: string }>;
  };
  audioAsset: {
    create: (args: { data: Record<string, unknown>; select?: Record<string, unknown> }) => Promise<{ id: string }>;
    findUnique: (args: { where: Record<string, unknown>; select?: Record<string, unknown> }) => Promise<{ id: string; storageKey: string } | null>;
  };
};
