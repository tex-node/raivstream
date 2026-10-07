/**
 * Homer — Repository: CreativeBible.story persistence boundary.
 *
 * Reads and writes HomerStoryState to/from CreativeBible.story (JSON field).
 * Does NOT interpret, validate, or modify the state — that's the reconciler's job.
 *
 * Fail-safe: write failures are surfaced to the caller and never silently swallowed.
 * Existing data is never overwritten with partial or invalid state.
 */

import type { PrismaClient } from '@raivstream/database';
import type { HomerStoryState } from './types';
import type { HomerCreativeDecision } from './directingTypes';

const HOMER_STORY_VERSION = 'homer_v1' as const;

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Load the stored HomerStoryState from CreativeBible.story for a project.
 * Returns null if no bible exists or the stored state is not a homer_v1 object.
 */
export async function loadHomerState(
  prisma: PrismaClient,
  projectId: string,
): Promise<HomerStoryState | null> {
  const bible = await prisma.creativeBible.findUnique({ where: { projectId } });
  if (!bible) return null;

  const raw = bible.story;
  if (!raw || typeof raw !== 'object' || (raw as Record<string, unknown>)['version'] !== HOMER_STORY_VERSION) {
    return null;
  }

  return raw as unknown as HomerStoryState;
}

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Persist a canonical HomerStoryState into CreativeBible.story.
 * Creates the bible record if it doesn't exist.
 * Bumps the version counter on each write.
 */
export async function saveHomerState(
  prisma: PrismaClient,
  projectId: string,
  state: HomerStoryState,
): Promise<void> {
  const existing = await prisma.creativeBible.findUnique({ where: { projectId } });

  if (existing) {
    await prisma.creativeBible.update({
      where: { id: existing.id },
      data: {
        story: state as never,
        version: { increment: 1 },
      },
    });
  } else {
    await prisma.creativeBible.create({
      data: {
        projectId,
        version: 1,
        story: state as never,
        characters: [] as never,
        worlds: [] as never,
        visualLanguage: { style: 'cinematic' } as never,
        audioLanguage: undefined,
        audience: undefined,
        brand: undefined,
        constraints: { note: 'Homer v1 managed state' } as never,
        canon: { originalIntent: state.premise.value, confirmed: [] } as never,
      },
    });
  }
}

/**
 * Persist approved directing decisions into CreativeBible.visualLanguage.
 * Must be called after saveHomerState so the bible record already exists.
 */
export async function saveDirectingDecisions(
  prisma: PrismaClient,
  projectId: string,
  decisions: HomerCreativeDecision[],
): Promise<void> {
  const existing = await prisma.creativeBible.findUnique({ where: { projectId } });
  if (!existing) return;

  const current = (existing.visualLanguage as Record<string, unknown>) ?? {};
  await prisma.creativeBible.update({
    where: { id: existing.id },
    data: {
      visualLanguage: { ...current, directingDecisions: decisions } as never,
      version: { increment: 1 },
    },
  });
}

/**
 * Safely update only the canon facts inside an existing CreativeBible record,
 * without touching the rest of the story state.
 */
export async function saveCanonFacts(
  prisma: PrismaClient,
  projectId: string,
  state: HomerStoryState,
): Promise<void> {
  const existing = await prisma.creativeBible.findUnique({ where: { projectId } });
  if (!existing) return;

  await prisma.creativeBible.update({
    where: { id: existing.id },
    data: {
      story: state as never,
      canon: {
        originalIntent: state.premise.value,
        confirmed: state.canon
          .filter((f) => f.owner === 'USER_EXPLICIT' || f.owner === 'USER_APPROVED' || f.owner === 'EXISTING_CANON')
          .map((f) => ({ label: f.label, value: f.value, owner: f.owner, establishedAt: f.establishedAt })),
      } as never,
      version: { increment: 1 },
    },
  });
}
