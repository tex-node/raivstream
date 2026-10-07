/**
 * Phase 3 — Homer First-Frame Animatic Service.
 *
 * Derives a scene plan from HomerStoryState.beats, generates per-scene visual
 * prompts from the creative directing decisions, and orchestrates FLUX2
 * still-image generation for each scene.
 *
 * Hard constraints:
 * - One FLUX2 call per scene (reuses existing falFlux2 adapter)
 * - Generation is gated on FAL_IMAGE_ENABLED; absent that flag the frames
 *   are created with status PENDING and imageUrl null (§30 constraint)
 * - Homer → Director boundary preserved: no CUT syntax, no lens specs
 */

import { createHash } from 'node:crypto';
import type { HomerStoryState, HomerBeat, StructuralPosition } from './types';
import type { HomerCreativeDecision } from './directingTypes';
import type { HomerAnimaticScene, AnimaticFrameStatus } from './animaticTypes';
import { submitFalFlux2, getFalFlux2Status } from '../generators/falFlux2';
import type { PrismaClient } from '@raivstream/database';

// ─── Scene extraction ─────────────────────────────────────────────────────────

function structuralToAnimatic(pos: StructuralPosition): HomerAnimaticScene['structuralPosition'] {
  switch (pos) {
    case 'beginning':   return 'act1';
    case 'development': return 'rising';
    case 'escalation':  return 'rising';
    case 'climax':      return 'climax';
    case 'consequence': return 'falling';
    case 'resolution':  return 'resolution';
    default:            return 'rising';
  }
}

/** Derive scenes from beats. Falls back to a 4-scene arc when beats is empty. */
export function extractScenes(state: HomerStoryState): HomerAnimaticScene[] {
  if (state.beats.length > 0) {
    return state.beats.map((beat: HomerBeat) => ({
      id: beat.id,
      ordinal: beat.ordinal,
      label: beat.label,
      description: beat.description.value,
      function: beat.function.value,
      emotionalDirection: beat.emotionalDirection.value,
      charactersInvolved: beat.charactersInvolved,
      locationsInvolved: beat.locationsInvolved,
      structuralPosition: structuralToAnimatic(beat.structuralPosition.value),
    }));
  }

  // Fallback: synthesise a 4-scene arc from story premise
  const premise = state.premise.value;
  const mainCharacter = state.entities.characters[0]?.name.value ?? 'the protagonist';
  const mainLocation = state.entities.locations[0]?.name.value ?? 'the setting';

  return [
    {
      id: 'synth_01_setup',
      ordinal: 1,
      label: 'The Setup',
      description: `${mainCharacter} is introduced in ${mainLocation}. ${premise}`,
      function: 'setup',
      emotionalDirection: state.emotionalDirection.value,
      charactersInvolved: state.entities.characters.slice(0, 2).map((c) => c.name.value),
      locationsInvolved: state.entities.locations.slice(0, 1).map((l) => l.name.value),
      structuralPosition: 'act1',
    },
    {
      id: 'synth_02_confrontation',
      ordinal: 2,
      label: 'The Discovery',
      description: `${mainCharacter} encounters the central challenge or discovery.`,
      function: 'confrontation',
      emotionalDirection: 'tension',
      charactersInvolved: state.entities.characters.slice(0, 2).map((c) => c.name.value),
      locationsInvolved: state.entities.locations.slice(0, 1).map((l) => l.name.value),
      structuralPosition: 'rising',
    },
    {
      id: 'synth_03_climax',
      ordinal: 3,
      label: 'The Climax',
      description: `The moment of highest tension or revelation.`,
      function: 'confrontation',
      emotionalDirection: 'intensity',
      charactersInvolved: state.entities.characters.slice(0, 2).map((c) => c.name.value),
      locationsInvolved: state.entities.locations.slice(0, 1).map((l) => l.name.value),
      structuralPosition: 'climax',
    },
    {
      id: 'synth_04_resolution',
      ordinal: 4,
      label: 'The Resolution',
      description: `${mainCharacter} reaches a new understanding or the situation resolves.`,
      function: 'resolution',
      emotionalDirection: state.emotionalDirection.value,
      charactersInvolved: state.entities.characters.slice(0, 1).map((c) => c.name.value),
      locationsInvolved: state.entities.locations.slice(0, 1).map((l) => l.name.value),
      structuralPosition: 'resolution',
    },
  ];
}

// ─── Visual prompt generation ─────────────────────────────────────────────────

function decisionsToStyleFragment(decisions: HomerCreativeDecision[]): string {
  const parts: string[] = [];
  for (const d of decisions) {
    switch (d.category) {
      case 'VISUAL_TREATMENT':    parts.push(d.value.replace(/_/g, ' ')); break;
      case 'MOOD':                parts.push(`${d.value.replace(/_/g, ' ')} mood`); break;
      case 'TIME_OF_DAY':         parts.push(d.value.replace(/_/g, ' ')); break;
      case 'WORLD_TREATMENT':     parts.push(d.value.replace(/_/g, ' ')); break;
      case 'CAMERA_PERSPECTIVE':  parts.push(`${d.value.replace(/_/g, ' ')} perspective`); break;
    }
  }
  return parts.join(', ');
}

export function buildVisualPrompt(
  scene: HomerAnimaticScene,
  state: HomerStoryState,
  decisions: HomerCreativeDecision[],
): string {
  const styleFragment = decisionsToStyleFragment(decisions);
  const genre = state.genre?.value ?? '';
  const tone = state.tone?.value ?? '';

  const characterList = scene.charactersInvolved.length > 0
    ? scene.charactersInvolved.join(', ')
    : (state.entities.characters[0]?.name.value ?? '');

  const locationList = scene.locationsInvolved.length > 0
    ? scene.locationsInvolved.join(', ')
    : (state.entities.locations[0]?.name.value ?? '');

  const parts = [
    styleFragment && `Style: ${styleFragment}.`,
    genre && `Genre: ${genre}.`,
    tone && `Tone: ${tone}.`,
    `Scene ${scene.ordinal}: ${scene.label}.`,
    scene.description,
    characterList && `Characters: ${characterList}.`,
    locationList && `Setting: ${locationList}.`,
    `Emotional direction: ${scene.emotionalDirection}.`,
    'Cinematic still frame. No text. No logos.',
  ].filter(Boolean);

  return parts.join(' ');
}

// ─── Story hash ───────────────────────────────────────────────────────────────

export function computeStoryHash(
  state: HomerStoryState,
  decisions: HomerCreativeDecision[],
): string {
  const key = JSON.stringify({
    premise: state.premise.value,
    genre: state.genre?.value,
    tone: state.tone?.value,
    beats: state.beats.map((b) => b.id),
    decisions: decisions.map((d) => `${d.category}:${d.value}`).sort(),
  });
  return createHash('sha256').update(key).digest('hex').slice(0, 32);
}

// ─── FAL_IMAGE gate check ─────────────────────────────────────────────────────

export function isFalImageEnabled(): boolean {
  return process.env.FAL_MEDIA_PROVIDER_ENABLED === 'true'
    && process.env.FAL_IMAGE_ENABLED === 'true'
    && Boolean(process.env.FAL_KEY);
}

// ─── Frame generation ─────────────────────────────────────────────────────────

/**
 * Submit FLUX2 generation for a single frame.
 * Returns the falJobId string on success, null if generation is not enabled.
 * Throws on provider error.
 */
export async function submitFrameGeneration(
  visualPrompt: string,
  aspectRatio: '9:16' | '16:9' | '1:1' = '16:9',
): Promise<string | null> {
  if (!isFalImageEnabled()) return null;
  return submitFalFlux2({ prompt: visualPrompt, aspectRatio });
}

/**
 * Poll FLUX2 status for a frame.
 * Returns { status, imageUrl? } — maps provider state to AnimaticFrameStatus.
 */
export async function pollFrameStatus(
  falJobId: string,
): Promise<{ status: AnimaticFrameStatus; imageUrl?: string }> {
  const result = await getFalFlux2Status(falJobId);
  if (result.status === 'completed' && result.outputUrl) {
    return { status: 'READY', imageUrl: result.outputUrl };
  }
  if (result.status === 'failed') return { status: 'FAILED' };
  if (result.status === 'generating') return { status: 'GENERATING' };
  return { status: 'PENDING' };
}

// ─── Animatic orchestration ───────────────────────────────────────────────────

export interface AnimaticCreateInput {
  userId: string;
  state: HomerStoryState;
  decisions: HomerCreativeDecision[];
  audienceMode: 'GENERAL' | 'KIDS';
}

export async function createOrReplaceAnimatic(
  prisma: PrismaClient,
  input: AnimaticCreateInput,
): Promise<string> {
  const { userId, state, decisions } = input;
  const storyHash = computeStoryHash(state, decisions);
  const scenes = extractScenes(state);

  // Delete any previous animatic with the same hash for this user (fresh frames)
  await prisma.homerAnimatic.deleteMany({ where: { userId, storyHash } });

  // Create the animatic record
  const animatic = await prisma.homerAnimatic.create({
    data: {
      userId,
      storyHash,
      scenes: scenes as unknown as object[],
      status: 'PENDING',
    },
  });

  // Submit generation for each scene
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i]!;
    const visualPrompt = buildVisualPrompt(scene, state, decisions);
    const falJobId = await submitFrameGeneration(visualPrompt).catch(() => null);

    await prisma.homerAnimaticFrame.create({
      data: {
        animaticId: animatic.id,
        sceneIndex: i,
        sceneId: scene.id,
        sceneLabel: scene.label,
        beatId: state.beats.find((b) => b.id === scene.id)?.id ?? undefined,
        visualPrompt,
        status: falJobId ? 'GENERATING' : 'PENDING',
        falJobId: falJobId ?? undefined,
      },
    });
  }

  // Update animatic status to GENERATING if any frame was submitted
  await prisma.homerAnimatic.update({
    where: { id: animatic.id },
    data: { status: 'GENERATING' },
  });

  return animatic.id;
}

export async function refreshAnimaticState(
  prisma: PrismaClient,
  animaticId: string,
  userId: string,
) {
  const animatic = await prisma.homerAnimatic.findFirst({
    where: { id: animaticId, userId },
    include: { frames: { orderBy: { sceneIndex: 'asc' } } },
  });
  if (!animatic) return null;

  // Poll any in-progress frames
  for (const frame of animatic.frames) {
    if (frame.status === 'GENERATING' && frame.falJobId) {
      const result = await pollFrameStatus(frame.falJobId).catch(() => null);
      if (result && result.status !== frame.status) {
        await prisma.homerAnimaticFrame.update({
          where: { id: frame.id },
          data: {
            status: result.status,
            imageUrl: result.imageUrl ?? undefined,
          },
        });
      }
    }
  }

  // Re-fetch updated state
  const updated = await prisma.homerAnimatic.findFirst({
    where: { id: animaticId },
    include: { frames: { orderBy: { sceneIndex: 'asc' } } },
  });
  if (!updated) return null;

  const allReady = updated.frames.every((f) => f.status === 'READY');
  const anyFailed = updated.frames.some((f) => f.status === 'FAILED');
  const overallStatus: AnimaticFrameStatus = allReady ? 'READY' : anyFailed ? 'FAILED' : 'GENERATING';

  if (overallStatus !== updated.status) {
    await prisma.homerAnimatic.update({ where: { id: animaticId }, data: { status: overallStatus } });
  }

  return {
    animaticId: updated.id,
    scenes: updated.scenes as unknown as HomerAnimaticScene[],
    frames: updated.frames.map((f) => ({
      id: f.id,
      sceneIndex: f.sceneIndex,
      sceneId: f.sceneId,
      sceneLabel: f.sceneLabel,
      beatId: f.beatId ?? undefined,
      visualPrompt: f.visualPrompt,
      status: f.status as AnimaticFrameStatus,
      imageUrl: f.imageUrl ?? undefined,
      directorNote: f.directorNote ?? undefined,
    })),
    overallStatus,
  };
}
