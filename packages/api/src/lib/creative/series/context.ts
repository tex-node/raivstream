/**
 * Raivstream 5.0 — SeriesContextService (Slice 6).
 *
 * The single service that assembles the context the rest of 5.0 needs:
 *   canon + visual/audio language + character memory + world memory +
 *   previous episode state + unresolved threads + current episode state.
 * Downstream services (Director, Plan, Production) consume this instead of
 * reconstructing series context themselves. Also exposes the spinoff
 * inheritance boundary: identity + world + visual language are inherited;
 * episode-specific state is NOT.
 */

import type { PrismaClient } from '@raivstream/database';
import { CreativeError } from '../shared/errors';
import { seriesCanonService } from './canon';
import { seriesMemoryService } from './memory';
import type { EpisodeState, SeriesCanon, SeriesContext, SeriesMemory } from './types';

function characterEntries(canon: SeriesCanon | null): Array<{ name: string; identity: Record<string, unknown> }> {
  return (canon?.characterCanon ?? []).map((character) => ({ name: character.name, identity: character.identity }));
}

function worldEntries(canon: SeriesCanon | null): Array<{ name: string; description: string }> {
  const world = canon?.world ?? {};
  if (typeof world.locations === 'object' && world.locations !== null && !Array.isArray(world.locations)) {
    return Object.entries(world.locations as Record<string, unknown>).map(([name, description]) => ({
      name,
      description: typeof description === 'string' ? description : JSON.stringify(description),
    }));
  }
  if (typeof world.description === 'string') return [{ name: 'World', description: world.description }];
  return [];
}

export class SeriesContextService {
  async get(prisma: PrismaClient, input: { seriesId: string; episodeId?: string }): Promise<SeriesContext> {
    const series = await prisma.creativeSeries.findUnique({ where: { id: input.seriesId }, include: { episodes: { orderBy: { episodeNumber: 'asc' } } } });
    if (!series) throw new CreativeError('PROJECT_NOT_FOUND', 'Series not found.');
    const canon = await seriesCanonService.get(prisma, series.id);
    const memory = (await seriesMemoryService.get(prisma, series.id)) ?? { learned: [], openThreads: [], preferences: [] };

    const episodes = series.episodes as unknown as Array<{ id: string; episodeNumber: number; title: string; synopsis: string | null; state: unknown }>;
    const current = input.episodeId ? episodes.find((episode) => episode.id === input.episodeId) ?? null : episodes[episodes.length - 1] ?? null;
    const currentIndex = current ? episodes.findIndex((episode) => episode.id === current.id) : -1;
    const previous = currentIndex > 0 ? episodes[currentIndex - 1] : null;

    return {
      seriesId: series.id,
      seriesTitle: series.title,
      canon,
      visualLanguage: (canon?.visualLanguage ?? null) as SeriesContext['visualLanguage'],
      audioLanguage: (canon?.audioLanguage ?? null) as SeriesContext['audioLanguage'],
      characters: characterEntries(canon),
      worlds: worldEntries(canon),
      previousEpisode: previous
        ? { episodeNumber: previous.episodeNumber, title: previous.title, synopsis: previous.synopsis, state: (previous.state as unknown as EpisodeState | null) ?? null }
        : null,
      currentEpisode: current
        ? { episodeNumber: current.episodeNumber, title: current.title, synopsis: current.synopsis, state: (current.state as unknown as EpisodeState | null) ?? null }
        : null,
      unresolvedThreads: memory.openThreads.map((thread) => thread.thread),
    };
  }

  /**
   * Spinoff inheritance boundary: a new series inherits character identity,
   * the relevant world, and the visual language — but NOT episode-specific
   * state, temporary wardrobe/emotion, or unrelated story events.
   */
  async spinoffContext(prisma: PrismaClient, input: { seriesId: string; characterName: string }): Promise<SeriesContext> {
    const context = await this.get(prisma, { seriesId: input.seriesId });
    const character = context.characters.find((entry) => entry.name.toLowerCase() === input.characterName.toLowerCase());
    if (!character) throw new CreativeError('PROJECT_NOT_FOUND', `Character "${input.characterName}" is not in this series' canon.`);
    return {
      ...context,
      characters: [character], // identity only — no episode state
      previousEpisode: null,
      currentEpisode: null,
      unresolvedThreads: [],
      audioLanguage: context.audioLanguage,
      canon: context.canon ? { ...context.canon, notes: [...(context.canon.notes ?? []), `Spinoff centered on ${input.characterName}`] } : context.canon,
    };
  }
}

export const seriesContextService = new SeriesContextService();