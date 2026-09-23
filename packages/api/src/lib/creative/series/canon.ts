/**
 * Raivstream 5.0 — Series Canon (Slice 6).
 *
 * Canon = what Raivstream must protect. It is structured (world, story rules,
 * visual/audio language, character canon), NOT generic notes. Canon only
 * changes through an explicit creator action (`series.canon.update`) — episode
 * directives never mutate it.
 */

import type { PrismaClient } from '@raivstream/database';
import { isCreativeSeriesEnabled } from '../featureFlags';
import { CreativeError } from '../shared/errors';
import type { SeriesCanon } from './types';

export function emptyCanon(): SeriesCanon {
  return {
    version: 1,
    world: {},
    storyRules: [],
    worldRules: [],
    characterRules: [],
    visualLanguage: { style: 'cinematic' },
    audioLanguage: {},
    characterCanon: [],
    notes: [],
  };
}

export class SeriesCanonService {
  async get(prisma: PrismaClient, seriesId: string): Promise<SeriesCanon | null> {
    const series = await prisma.creativeSeries.findUnique({ where: { id: seriesId } });
    if (!series) throw new CreativeError('PROJECT_NOT_FOUND', 'Series not found.');
    return (series.canon as unknown as SeriesCanon | null) ?? null;
  }

  async update(prisma: PrismaClient, input: { seriesId: string; canon: SeriesCanon }): Promise<SeriesCanon> {
    if (!isCreativeSeriesEnabled()) throw new CreativeError('CREATIVE_DISABLED', 'Raivstream 5.0 series is not enabled.');
    const series = await prisma.creativeSeries.findUnique({ where: { id: input.seriesId } });
    if (!series) throw new CreativeError('PROJECT_NOT_FOUND', 'Series not found.');
    const canon = { ...(input.canon ?? emptyCanon()), version: ((series.canon as unknown as SeriesCanon | null)?.version ?? 0) + 1 };
    await prisma.creativeSeries.update({ where: { id: series.id }, data: { canon: canon as never } });
    return canon;
  }
}

export const seriesCanonService = new SeriesCanonService();