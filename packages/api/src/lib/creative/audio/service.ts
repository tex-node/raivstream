/**
 * Raivstream 5.0 — Creative audio service (Phase 6A).
 *
 * Bridges the Creative 5.0 lifecycle to the existing audio infrastructure.
 * All audio operations are gated behind isCreativeAudioEnabled().
 *
 * Phase 6A: Foundation — plan seeding from Bible (Homer → AudioPlan).
 * Phase 6C: TTS generation per cue (added there).
 * Phase 6D: Music generation (added there).
 */

import type { PrismaClient } from '@raivstream/database';
import type { AudioLanguageSpec, CreativeBibleState } from '../shared/types';
import { isCreativeAudioEnabled } from '../featureFlags';
import { CreativeError } from '../shared/errors';

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

// Typed accessor — the Prisma client gained audioPerformancePlan via Phase 6A migration.
type PrismaClientWithAudio = {
  audioPerformancePlan: {
    findFirst: (args: { where: Record<string, unknown>; select?: Record<string, unknown> }) => Promise<{ id: string; status: string; tracks: { id: string }[]; _count: { tracks: number } } | null>;
    create: (args: { data: Record<string, unknown>; select?: Record<string, unknown> }) => Promise<{ id: string; tracks: { id: string }[] }>;
  };
};
