/**
 * Raivstream 5.0 — Creative Bible adapter.
 *
 * Bridges the semantic Bible to the EXISTING story domain when a CreativeProject
 * is bridged to a legacy StoryProject (`legacyStoryProjectId`). Reuses
 * StoryCharacterMemory as the character identity source (no duplicate
 * CreativeCharacter model), and StoryEnvironment as world identity.
 */

import type { PrismaClient } from '@raivstream/database';

export async function charactersFromLegacyStory(
  prisma: PrismaClient,
  legacyStoryProjectId: string,
): Promise<Array<Record<string, unknown>>> {
  try {
    const rows = await prisma.storyCharacterMemory.findMany({
      where: { projectId: legacyStoryProjectId },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
    return rows.map((character) => ({
      name: character.name,
      role: character.role ?? undefined,
      species: character.species ?? undefined,
      ageDescription: character.ageDescription ?? undefined,
      gender: character.gender ?? undefined,
      visualDescription: character.visualDescription ?? undefined,
      identity: character.visualDescription ? { appearance: character.visualDescription } : undefined,
    }));
  } catch (error) {
    console.warn('[creative.bibleAdapter] legacy character read failed:', (error as Error).message);
    return [];
  }
}

export async function worldsFromLegacyStory(
  prisma: PrismaClient,
  legacyStoryProjectId: string,
): Promise<Array<Record<string, unknown>>> {
  try {
    const rows = await prisma.storyEnvironment.findMany({
      where: { projectId: legacyStoryProjectId },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
    return rows.map((env) => ({
      name: env.name,
      description: env.description ?? undefined,
    }));
  } catch (error) {
    console.warn('[creative.bibleAdapter] legacy world read failed:', (error as Error).message);
    return [];
  }
}