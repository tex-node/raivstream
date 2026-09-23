/**
 * Raivstream 5.0 — Series Memory (Slice 6).
 *
 * Memory = what Raivstream has learned (facts, open threads, preferences).
 * Distinct from Canon (what must remain true) and Episode State (what is
 * currently happening). Facts established in an episode become retrievable in
 * later episodes via series memory.
 */

import type { PrismaClient } from '@raivstream/database';
import { isCreativeSeriesEnabled } from '../featureFlags';
import { CreativeError } from '../shared/errors';
import type { SeriesMemory } from './types';

export function emptyMemory(): SeriesMemory {
  return { learned: [], openThreads: [], preferences: [] };
}

export class SeriesMemoryService {
  async get(prisma: PrismaClient, seriesId: string): Promise<SeriesMemory | null> {
    const series = await prisma.creativeSeries.findUnique({ where: { id: seriesId } });
    if (!series) throw new CreativeError('PROJECT_NOT_FOUND', 'Series not found.');
    return (series.memory as unknown as SeriesMemory | null) ?? null;
  }

  async update(prisma: PrismaClient, input: { seriesId: string; memory: SeriesMemory }): Promise<SeriesMemory> {
    if (!isCreativeSeriesEnabled()) throw new CreativeError('CREATIVE_DISABLED', 'Raivstream 5.0 series is not enabled.');
    const series = await prisma.creativeSeries.findUnique({ where: { id: input.seriesId } });
    if (!series) throw new CreativeError('PROJECT_NOT_FOUND', 'Series not found.');
    const memory = input.memory ?? emptyMemory();
    await prisma.creativeSeries.update({ where: { id: series.id }, data: { memory: memory as never } });
    return memory;
  }

  /** Record a learned fact (idempotent by fact text). */
  async learn(prisma: PrismaClient, input: { seriesId: string; fact: string; episodeNumber?: number }): Promise<SeriesMemory> {
    const memory = (await this.get(prisma, input.seriesId)) ?? emptyMemory();
    if (!memory.learned.some((entry) => entry.fact === input.fact)) {
      memory.learned.push({ fact: input.fact, episodeNumber: input.episodeNumber });
    }
    return this.update(prisma, { seriesId: input.seriesId, memory });
  }

  /** Open a thread (e.g. a cliffhanger) for later episodes. */
  async openThread(prisma: PrismaClient, input: { seriesId: string; thread: string; episodeNumber?: number }): Promise<SeriesMemory> {
    const memory = (await this.get(prisma, input.seriesId)) ?? emptyMemory();
    if (!memory.openThreads.some((entry) => entry.thread === input.thread)) {
      memory.openThreads.push({ thread: input.thread, openedInEpisode: input.episodeNumber });
    }
    return this.update(prisma, { seriesId: input.seriesId, memory });
  }
}

export const seriesMemoryService = new SeriesMemoryService();