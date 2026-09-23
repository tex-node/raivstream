import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { seriesService } from '../series/service';
import { seriesCanonService } from '../series/canon';
import { seriesMemoryService } from '../series/memory';
import { seriesContextService } from '../series/context';
import { DirectorService } from '../director/service';
import { buildCreativePlan } from '../production/plan';
import { interpret } from '../intent/interpreter';
import type { SeriesCanon } from '../series/types';

beforeEach(() => {
  for (const key of ['RAIVSTREAM_5_ENABLED', 'RAIVSTREAM_5_SERIES_ENABLED', 'RAIVSTREAM_5_DIRECTOR_ENABLED', 'RAIVSTREAM_5_APPROVAL_ENABLED', 'RAIVSTREAM_5_REVIEW_ENABLED']) process.env[key] = 'true';
});
afterEach(() => {
  for (const key of ['RAIVSTREAM_5_ENABLED', 'RAIVSTREAM_5_SERIES_ENABLED', 'RAIVSTREAM_5_DIRECTOR_ENABLED', 'RAIVSTREAM_5_APPROVAL_ENABLED', 'RAIVSTREAM_5_REVIEW_ENABLED']) delete process.env[key];
});

const PLAN = buildCreativePlan({ projectType: interpret('a short film').projectType });

const CANON: SeriesCanon = {
  version: 1,
  world: { description: 'Lagos, 2042', locations: { 'Family House': 'Warm practical lighting', 'Underground City': 'Gritty neon tunnels' } },
  storyRules: ['Technology cannot solve emotional conflicts', 'Characters must face consequences'],
  worldRules: ['Night scenes use warm practical lighting'],
  characterRules: ['Characters keep their core identity'],
  visualLanguage: { style: 'photorealistic cinematic', colorGrade: 'natural skin texture' },
  audioLanguage: { score: 'afro-futurist', sound: 'natural environmental' },
  characterCanon: [{ name: 'Amara', identity: { appearance: 'young Nigerian woman, short cropped hair', age: '34' }, relationships: { Father: 'estranged' }, voice: 'calm, measured' }],
  notes: [],
};

function prismaMock(initial: { plan?: any; canon?: any }) {
  const series: any[] = [];
  const episodes: any[] = [];
  const projects: any[] = [];
  const bibles: any[] = [];
  const versions: any[] = [];
  const directives: any[] = [];
  const approvals: any[] = [];
  let project = { id: 'pj0', userId: 'u1', title: 'Episode 1', projectType: 'STORY', status: 'PLANNING', seriesId: null, currentVersionId: null };

  const withPlan = (found: any) => ({ ...found, productionPlan: initial.plan ? { plan: initial.plan } : null, bible: bibles.find((b) => b.projectId === found.id) ?? null });

  const prisma: any = {
    creativeSeries: {
      create: async ({ data }: any) => { const s = { id: `s${series.length + 1}`, createdAt: new Date(), updatedAt: new Date(), ...data }; series.push(s); return s; },
      findUnique: async ({ where }: any) => {
        const s = series.find((x) => x.id === where.id);
        return s ? { ...s, episodes: episodes.filter((e) => e.seriesId === s.id) } : null;
      },
      findFirst: async ({ where }: any) => series.find((s) => s.id === where.id) ?? series.find((s) => s.userId === where?.userId) ?? null,
      findMany: async () => series.map((s) => ({ ...s })),
      update: async ({ where, data }: any) => { const s = series.find((x) => x.id === where.id); Object.assign(s, data); return s; },
    },
    creativeEpisode: {
      create: async ({ data }: any) => { const e = { id: `e${episodes.length + 1}`, createdAt: new Date(), updatedAt: new Date(), ...data }; episodes.push(e); return e; },
      findFirst: async ({ where }: any) => episodes.find((e) => e.id === where?.id) ?? null,
      findMany: async ({ where }: any) => episodes.filter((e) => e.seriesId === where?.seriesId).map((e) => ({ ...e })),
      update: async ({ where, data }: any) => { const e = episodes.find((x) => x.id === where.id); Object.assign(e, data); return e; },
    },
    creativeProject: {
      create: async ({ data }: any) => { const p = { id: `p${projects.length + 1}`, createdAt: new Date(), updatedAt: new Date(), ...data }; projects.push(p); project = p; return p; },
      findFirst: async ({ where }: any) => {
        const found = projects.find((p) => p.id === where?.id) ?? projects[projects.length - 1] ?? project;
        return withPlan(found);
      },
      findUnique: async ({ where }: any) => withPlan(projects.find((p) => p.id === where.id) ?? project),
      update: async ({ where, data }: any) => { const p = projects.find((x) => x.id === where.id) ?? project; Object.assign(p, data); project = p; return p; },
    },
    creativeBible: {
      create: async ({ data }: any) => { const b = { id: `b${bibles.length + 1}`, ...data }; bibles.push(b); return b; },
      upsert: async ({ update }: any) => ({ id: 'b1', ...update }),
    },
    creativeBrief: { create: async ({ data }: any) => ({ id: 'br1', ...data }) },
    creativeVersion: {
      findFirst: async () => versions[versions.length - 1] ?? null,
      create: async ({ data }: any) => { const v = { id: `v${versions.length + 1}`, createdAt: new Date(), ...data }; versions.push(v); return v; },
    },
    creativeDirective: { create: async ({ data }: any) => { const d = { id: `d${directives.length + 1}`, ...data }; directives.push(d); return d; } },
    creativeApproval: {
      findUnique: async () => approvals[approvals.length - 1] ?? null,
      upsert: async ({ create }: any) => { approvals.push({ id: 'a1', ...create }); return approvals[approvals.length - 1]; },
      updateMany: async () => ({ count: 0 }),
    },
    creativeProducedAsset: { deleteMany: async () => ({ count: 0 }), findMany: async () => [] },
    creativeProductionPlan: { upsert: async ({ update }: any) => ({ id: 'plan1', ...update }) },
    creativeMemory: { create: async ({ data }: any) => ({ id: 'm1', ...data }) },
    __series: series,
    __episodes: episodes,
    __projects: projects,
    __bibles: bibles,
    __versions: versions,
    __directives: directives,
  };
  return prisma;
}

describe('creative series', () => {
  it('creates a series with initialized canon and no project required', async () => {
    const prisma = prismaMock({});
    const series = await seriesService.create(prisma as never, { userId: 'u1', title: 'The Last City', description: 'A cinematic science-fiction drama' });
    expect(series.title).toBe('The Last City');
    expect(series.canon).toBeTruthy();
    expect(prisma.__series.length).toBe(1);
    expect(prisma.__projects.length).toBe(0);
  });

  it('creates an episode with a linked project and inherited series context', async () => {
    const prisma = prismaMock({});
    const series = await seriesService.create(prisma as never, { userId: 'u1', title: 'The Last City' });
    await seriesService.canon.update(prisma as never, { seriesId: series.id, canon: CANON });
    const { episode, projectId } = await seriesService.createEpisode(prisma as never, {
      seriesId: series.id, userId: 'u1', prompt: 'Amara discovers that her father knew about the underground city all along.',
    });
    expect(episode.episodeNumber).toBe(1);
    expect(projectId).toBeTruthy();
    expect(prisma.__projects.length).toBe(1);
    expect(prisma.__episodes.length).toBe(1);
    const bible = prisma.__bibles.find((b: any) => b.projectId === projectId);
    expect(bible.characters.map((c: any) => c.name)).toContain('Amara');
    expect(bible.worlds.map((w: any) => w.name)).toContain('Family House');
    expect(bible.visualLanguage.style).toContain('photorealistic');
  });

  it('character identity persists across episodes while episode state can evolve independently', async () => {
    const prisma = prismaMock({});
    const series = await seriesService.create(prisma as never, { userId: 'u1', title: 'The Last City' });
    await seriesService.canon.update(prisma as never, { seriesId: series.id, canon: CANON });
    const ep1 = await seriesService.createEpisode(prisma as never, { seriesId: series.id, userId: 'u1', prompt: 'episode one' });
    const ep2 = await seriesService.createEpisode(prisma as never, { seriesId: series.id, userId: 'u1', prompt: 'episode two' });
    const updated1 = await seriesService.updateEpisode(prisma as never, { episodeId: ep1.episode.id, userId: 'u1', state: { wardrobe: { color: 'blue' }, emotionalState: 'hopeful' } });
    const updated2 = await seriesService.updateEpisode(prisma as never, { episodeId: ep2.episode.id, userId: 'u1', state: { wardrobe: { color: 'red' }, emotionalState: 'torn' } });
    expect(updated1.state?.wardrobe?.color).toBe('blue');
    expect(updated2.state?.wardrobe?.color).toBe('red');
    // identity is canon-level and unchanged
    const canon = await seriesService.canon.get(prisma as never, series.id);
    expect((canon as SeriesCanon).characterCanon[0].identity.appearance).toContain('young Nigerian woman');
    // both episodes inherit the same character identity
    expect(prisma.__bibles.every((b: any) => b.characters.map((c: any) => c.name).includes('Amara'))).toBe(true);
  });

  it('memory: an episode-established fact is retrievable in later episode context', async () => {
    const prisma = prismaMock({});
    const series = await seriesService.create(prisma as never, { userId: 'u1', title: 'The Last City' });
    await seriesService.memory.learn(prisma as never, { seriesId: series.id, fact: 'Amara knows about the underground city.', episodeNumber: 1 });
    await seriesService.memory.openThread(prisma as never, { seriesId: series.id, thread: 'Who built the underground city?', episodeNumber: 1 });
    const context = await seriesContextService.get(prisma as never, { seriesId: series.id });
    expect(context.unresolvedThreads).toContain('Who built the underground city?');
    const memory = await seriesService.memory.get(prisma as never, series.id);
    expect(memory?.learned.map((entry: any) => entry.fact)).toContain('Amara knows about the underground city.');
  });

  it('director: "make this episode darker" changes the episode visuals but preserves series canon', async () => {
    const prisma = prismaMock({ plan: PLAN, canon: CANON });
    const series = await seriesService.create(prisma as never, { userId: 'u1', title: 'The Last City' });
    await seriesService.canon.update(prisma as never, { seriesId: series.id, canon: CANON });
    await seriesService.createEpisode(prisma as never, { seriesId: series.id, userId: 'u1', prompt: 'the confrontation' });

    const director = new DirectorService();
    const { decision } = await director.direct(prisma as never, { projectId: 'p1', userId: 'u1', instruction: 'Make this episode darker.' });
    expect(decision.creativeChanges[0].field).toBe('lighting');
    expect(decision.creativeChanges[0].to).toContain('darker');
    // canon protected
    const canon = await seriesService.canon.get(prisma as never, series.id);
    expect((canon as SeriesCanon).visualLanguage.style).toContain('photorealistic');
    expect((canon as SeriesCanon).visualLanguage).not.toHaveProperty('lighting');
  });

  it('explore creates branches without destroying the original or the canon', async () => {
    const prisma = prismaMock({ plan: PLAN, canon: CANON });
    const series = await seriesService.create(prisma as never, { userId: 'u1', title: 'The Last City' });
    await seriesService.canon.update(prisma as never, { seriesId: series.id, canon: CANON });
    await seriesService.createEpisode(prisma as never, { seriesId: series.id, userId: 'u1', prompt: 'the ending' });

    const director = new DirectorService();
    const { versions } = await director.explore(prisma as never, { projectId: 'p1', userId: 'u1', instruction: 'Give me three different endings.' });
    expect(versions.length).toBe(3);
    const canon = await seriesService.canon.get(prisma as never, series.id);
    expect((canon as SeriesCanon).storyRules.length).toBe(2); // unchanged
  });

  it('spinoff context inherits identity/world/visual but excludes episode state', async () => {
    const prisma = prismaMock({});
    const series = await seriesService.create(prisma as never, { userId: 'u1', title: 'The Last City' });
    await seriesService.canon.update(prisma as never, { seriesId: series.id, canon: CANON });
    await seriesService.createEpisode(prisma as never, { seriesId: series.id, userId: 'u1', prompt: 'episode one' });

    const spinoff = await seriesContextService.spinoffContext(prisma as never, { seriesId: series.id, characterName: 'Amara' });
    expect(spinoff.characters.map((c) => c.name)).toEqual(['Amara']);
    expect(spinoff.characters[0].identity.appearance).toContain('young Nigerian woman');
    expect(spinoff.worlds.length).toBeGreaterThan(0);
    expect(spinoff.visualLanguage).toBeTruthy();
    expect(spinoff.currentEpisode).toBeNull();
    expect(spinoff.previousEpisode).toBeNull();
    expect(spinoff.unresolvedThreads).toEqual([]);
  });
});