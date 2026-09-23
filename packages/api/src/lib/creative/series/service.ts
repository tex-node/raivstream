/**
 * Raivstream 5.0 — SeriesService (Slice 6).
 *
 * Series + Canon + Memory + Episodes. Episodes link to a CreativeProject whose
 * Bible/Brief are SEEDED from series canon (characters, worlds, visual/audio
 * language) so the creator never re-explains the universe. The existing
 * project-level pipeline (Plan → Produce → Review → Direct → Approve → Output)
 * is reused unchanged — the series layer orchestrates, never duplicates.
 */

import type { PrismaClient } from '@raivstream/database';
import { isCreativeSeriesEnabled } from '../featureFlags';
import { CreativeError } from '../shared/errors';
import { emptyCanon, seriesCanonService } from './canon';
import { emptyMemory, seriesMemoryService } from './memory';
import { seriesContextService } from './context';
import type { EpisodeState, EpisodeView, SeriesCanon, SeriesMemory, SeriesState } from './types';

function toSeriesState(series: any): SeriesState {
  return {
    id: series.id,
    userId: series.userId,
    title: series.title,
    description: series.description,
    status: series.status,
    canon: (series.canon as unknown as SeriesCanon | null) ?? null,
    memory: (series.memory as unknown as SeriesMemory | null) ?? null,
    createdAt: series.createdAt,
    updatedAt: series.updatedAt,
  };
}

function toEpisodeView(episode: any): EpisodeView {
  return {
    id: episode.id,
    seriesId: episode.seriesId,
    projectId: episode.projectId,
    seasonNumber: episode.seasonNumber,
    episodeNumber: episode.episodeNumber,
    title: episode.title,
    synopsis: episode.synopsis,
    status: episode.status,
    state: (episode.state as unknown as EpisodeState | null) ?? null,
    createdAt: episode.createdAt,
    updatedAt: episode.updatedAt,
  };
}

export class SeriesService {
  async create(prisma: PrismaClient, input: { userId: string; title: string; description?: string }): Promise<SeriesState> {
    if (!isCreativeSeriesEnabled()) throw new CreativeError('CREATIVE_DISABLED', 'Raivstream 5.0 series is not enabled.');
    const canon = emptyCanon();
    if (input.description) canon.notes.push(input.description);
    const series = await prisma.creativeSeries.create({
      data: {
        userId: input.userId,
        title: input.title,
        description: input.description ?? null,
        status: 'ACTIVE',
        canon: canon as never,
        memory: emptyMemory() as never,
      },
    });
    return toSeriesState(series);
  }

  async list(prisma: PrismaClient, userId: string): Promise<SeriesState[]> {
    const rows = await prisma.creativeSeries.findMany({ where: { userId, status: { not: 'ARCHIVED' } }, orderBy: { updatedAt: 'desc' }, take: 50 });
    return rows.map(toSeriesState);
  }

  async get(prisma: PrismaClient, input: { seriesId: string; userId: string }): Promise<SeriesState> {
    const series = await prisma.creativeSeries.findFirst({ where: { id: input.seriesId, userId: input.userId } });
    if (!series) throw new CreativeError('PROJECT_NOT_FOUND', 'Series not found.');
    return toSeriesState(series);
  }

  async update(prisma: PrismaClient, input: { seriesId: string; userId: string; title?: string; description?: string; status?: string }): Promise<SeriesState> {
    const series = await this.get(prisma, input);
    const updated = await prisma.creativeSeries.update({
      where: { id: series.id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.status !== undefined ? { status: input.status as never } : {}),
      },
    });
    return toSeriesState(updated);
  }

  async createEpisode(prisma: PrismaClient, input: { seriesId: string; userId: string; prompt?: string; seasonNumber?: number; episodeNumber?: number; title?: string; synopsis?: string }): Promise<{ episode: EpisodeView; projectId: string }> {
    if (!isCreativeSeriesEnabled()) throw new CreativeError('CREATIVE_DISABLED', 'Raivstream 5.0 series is not enabled.');
    const series = await this.get(prisma, { seriesId: input.seriesId, userId: input.userId });
    const seasonNumber = input.seasonNumber ?? 1;
    const latest = await prisma.creativeEpisode.findFirst({
      where: { seriesId: series.id, seasonNumber },
      orderBy: { episodeNumber: 'desc' },
    });
    const episodeNumber = input.episodeNumber ?? (latest?.episodeNumber ?? 0) + 1;
    const title = input.title ?? `Episode ${episodeNumber}`;

    const project = await prisma.creativeProject.create({
      data: { userId: input.userId, title, projectType: 'STORY', status: 'PLANNING', seriesId: series.id },
    });

    // Seed the episode's creative state from SERIES CANON (identity, world,
    // visual/audio language) — the creator never re-explains the universe.
    const canon = (series.canon as unknown as SeriesCanon | null) ?? emptyCanon();
    const characters = canon.characterCanon.map((character) => ({ name: character.name, visualDescription: (character.identity as Record<string, unknown>).appearance ?? character.identity ?? undefined, identity: character.identity }));
    const worlds = Object.entries((canon.world as Record<string, unknown> | undefined)?.locations ?? {}).map(([name, description]) => ({ name, description: typeof description === 'string' ? description : JSON.stringify(description) }));
    await prisma.creativeBible.create({
      data: {
        projectId: project.id,
        characters: characters as never,
        worlds: worlds as never,
        visualLanguage: canon.visualLanguage as never,
        audioLanguage: canon.audioLanguage as never,
      },
    });
    await prisma.creativeBrief.create({
      data: {
        projectId: project.id,
        originalIntent: input.prompt ?? input.synopsis ?? title,
        refinedIntent: input.synopsis ?? input.prompt ?? null,
        objective: 'tell this episode of the series',
      },
    });

    const episode = await prisma.creativeEpisode.create({
      data: {
        seriesId: series.id,
        projectId: project.id,
        seasonNumber,
        episodeNumber,
        title,
        synopsis: input.synopsis ?? input.prompt ?? null,
        status: 'DRAFT',
        state: {},
      },
    });
    return { episode: toEpisodeView(episode), projectId: project.id };
  }

  async listEpisodes(prisma: PrismaClient, input: { seriesId: string; userId: string }): Promise<EpisodeView[]> {
    await this.get(prisma, input);
    const rows = await prisma.creativeEpisode.findMany({ where: { seriesId: input.seriesId }, orderBy: [{ seasonNumber: 'asc' }, { episodeNumber: 'asc' }] });
    return rows.map(toEpisodeView);
  }

  async getEpisode(prisma: PrismaClient, input: { episodeId: string; userId: string }): Promise<EpisodeView> {
    const episode = await prisma.creativeEpisode.findFirst({ where: { id: input.episodeId, series: { userId: input.userId } } });
    if (!episode) throw new CreativeError('PROJECT_NOT_FOUND', 'Episode not found.');
    return toEpisodeView(episode);
  }

  async updateEpisode(prisma: PrismaClient, input: { episodeId: string; userId: string; title?: string; synopsis?: string; status?: string; state?: EpisodeState }): Promise<EpisodeView> {
    const episode = await this.getEpisode(prisma, { episodeId: input.episodeId, userId: input.userId });
    const updated = await prisma.creativeEpisode.update({
      where: { id: episode.id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.synopsis !== undefined ? { synopsis: input.synopsis } : {}),
        ...(input.status !== undefined ? { status: input.status as never } : {}),
        ...(input.state !== undefined ? { state: input.state as never } : {}),
      },
    });
    return toEpisodeView(updated);
  }

  canon = seriesCanonService;
  memory = seriesMemoryService;
  context = seriesContextService;
}

export const seriesService = new SeriesService();