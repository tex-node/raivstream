/**
 * Raivstream 5.0 — ProjectService.
 *
 * Owns the semantic CreativeProject/Brief/Bible/Memory rows. `createFromIntent`
 * runs the intent engine, materializes the project + brief, seeds a bible, and
 * records the original intent in memory — the Phase-0/1 vertical slice.
 *
 * Uses Prisma directly (the creative models are ours); the legacy Story domain
 * is only reached through adapters (bible/adapter, intelligence/storyAdapter).
 */

import type { PrismaClient } from '@raivstream/database';
import { isCreativeBibleEnabled, isCreativeCreateEnabled } from '../featureFlags';
import { CreativeError } from '../shared/errors';
import type { CreativeBriefState, CreativeInterpretation, CreativeMemoryKind, CreativeProjectState } from '../shared/types';
import { seedBibleFromInterpretation } from '../bible/service';
import { nextActionFor } from './state';

type CreativeProjectRow = {
  id: string;
  userId: string;
  title: string;
  projectType: string;
  status: string;
  legacyStoryProjectId: string | null;
  createdAt: Date;
  updatedAt: Date;
  brief?: { originalIntent: string; refinedIntent: string | null; objective: string | null; audience: string | null; format: string | null; durationSeconds: number | null; genre: string | null; tone: string | null; theme: string | null; setting: string | null; attachments: unknown } | null;
  bible?: { version: number; story: unknown; characters: unknown; worlds: unknown; visualLanguage: unknown; audioLanguage: unknown; audience: unknown; brand: unknown; constraints: unknown; canon: unknown } | null;
  productionPlan?: { id: string } | null;
};

export function serializeProject(row: CreativeProjectRow): CreativeProjectState {
  const brief = row.brief
    ? {
        originalIntent: row.brief.originalIntent,
        refinedIntent: row.brief.refinedIntent ?? undefined,
        objective: row.brief.objective ?? undefined,
        audience: row.brief.audience ?? undefined,
        format: row.brief.format ?? undefined,
        durationSeconds: row.brief.durationSeconds ?? undefined,
        genre: row.brief.genre ?? undefined,
        tone: row.brief.tone ?? undefined,
        theme: row.brief.theme ?? undefined,
        setting: row.brief.setting ?? undefined,
        attachments: (row.brief.attachments as Record<string, unknown>[] | null) ?? undefined,
      }
    : null;
  const bible = row.bible
    ? {
        version: row.bible.version,
        story: (row.bible.story as Record<string, unknown> | null) ?? undefined,
        characters: (row.bible.characters as Record<string, unknown>[] | null) ?? undefined,
        worlds: (row.bible.worlds as Record<string, unknown>[] | null) ?? undefined,
        visualLanguage: (row.bible.visualLanguage as Record<string, unknown> | null) ?? undefined,
        audioLanguage: (row.bible.audioLanguage as Record<string, unknown> | null) ?? undefined,
        audience: (row.bible.audience as Record<string, unknown> | null) ?? undefined,
        brand: (row.bible.brand as Record<string, unknown> | null) ?? undefined,
        constraints: (row.bible.constraints as Record<string, unknown> | null) ?? undefined,
        canon: (row.bible.canon as Record<string, unknown> | null) ?? undefined,
      }
    : null;
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    projectType: row.projectType as CreativeProjectState['projectType'],
    status: row.status as CreativeProjectState['status'],
    legacyStoryProjectId: row.legacyStoryProjectId,
    brief,
    bible,
    hasPlan: Boolean(row.productionPlan),
    nextAction: nextActionFor(row.status as CreativeProjectState['status'], Boolean(bible), Boolean(row.productionPlan)),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class ProjectService {
  async createFromIntent(
    prisma: PrismaClient,
    input: { userId: string; text: string; interpretation?: CreativeInterpretation; legacyStoryProjectId?: string | null },
  ): Promise<CreativeProjectState> {
    if (!isCreativeCreateEnabled()) {
      throw new CreativeError('CREATIVE_DISABLED', 'Raivstream 5.0 create is not enabled.');
    }
    if (!input.text.trim()) throw new CreativeError('INTENT_EMPTY', 'Please describe what you want to create.');
    const interpretation = input.interpretation ?? (await import('../intent/service')).intentService.interpret(input.text);

    const title = (interpretation.explicit.genre ?? interpretation.summary.split('.')[0] ?? 'New project').slice(0, 120);

    const project = await prisma.creativeProject.create({
      data: {
        userId: input.userId,
        title,
        projectType: interpretation.projectType,
        status: 'PLANNING',
        legacyStoryProjectId: input.legacyStoryProjectId ?? null,
        brief: {
          create: {
            originalIntent: input.text,
            refinedIntent: interpretation.summary,
            objective: interpretation.inferred.objective ?? null,
            audience: interpretation.explicit.audience ?? null,
            format: interpretation.explicit.format ?? null,
            durationSeconds: interpretation.explicit.durationSeconds ?? null,
            genre: interpretation.explicit.genre ?? null,
            tone: interpretation.explicit.tone ?? null,
            setting: interpretation.explicit.setting ?? null,
          },
        },
        memories: {
          create: {
            kind: 'NOTE',
            content: { event: 'original_intent', text: input.text },
          },
        },
      },
      include: { brief: true, bible: true, productionPlan: true },
    });

    if (isCreativeBibleEnabled()) {
      await seedBibleFromInterpretation(prisma, project.id, interpretation);
    }

    const withBible = await prisma.creativeProject.findUnique({
      where: { id: project.id },
      include: { brief: true, bible: true, productionPlan: true },
    });
    if (!withBible) throw new CreativeError('PROJECT_NOT_FOUND', 'Project creation failed.');
    return serializeProject(withBible);
  }

  async get(prisma: PrismaClient, input: { projectId: string; userId: string }): Promise<CreativeProjectState> {
    const project = await prisma.creativeProject.findFirst({
      where: { id: input.projectId, userId: input.userId },
      include: { brief: true, bible: true, productionPlan: true },
    });
    if (!project) throw new CreativeError('PROJECT_NOT_FOUND', 'Creative project not found.');
    return serializeProject(project);
  }

  async list(prisma: PrismaClient, userId: string): Promise<CreativeProjectState[]> {
    const projects = await prisma.creativeProject.findMany({
      where: { userId, status: { not: 'ARCHIVED' } },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      include: { brief: true, bible: true, productionPlan: true },
    });
    return projects.map(serializeProject);
  }

  async updateStatus(
    prisma: PrismaClient,
    input: { projectId: string; userId: string; status: string },
  ): Promise<CreativeProjectState> {
    const project = await this.get(prisma, { projectId: input.projectId, userId: input.userId });
    // allow the client to request a transition the state machine permits
    const updated = await prisma.creativeProject.update({
      where: { id: input.projectId },
      data: { status: input.status as never },
      include: { brief: true, bible: true, productionPlan: true },
    });
    void project;
    return serializeProject(updated);
  }

  async recordMemory(
    prisma: PrismaClient,
    input: { projectId: string; kind: CreativeMemoryKind; content: Record<string, unknown> },
  ): Promise<void> {
    await prisma.creativeMemory.create({ data: { projectId: input.projectId, kind: input.kind, content: input.content as never } });
  }

  async briefState(row: { brief?: { originalIntent: string; refinedIntent: string | null; objective: string | null; audience: string | null; format: string | null; durationSeconds: number | null; genre: string | null; tone: string | null; theme: string | null; setting: string | null } | null }): Promise<CreativeBriefState | null> {
    if (!row.brief) return null;
    return {
      originalIntent: row.brief.originalIntent,
      refinedIntent: row.brief.refinedIntent ?? undefined,
      objective: row.brief.objective ?? undefined,
      audience: row.brief.audience ?? undefined,
      format: row.brief.format ?? undefined,
      durationSeconds: row.brief.durationSeconds ?? undefined,
      genre: row.brief.genre ?? undefined,
      tone: row.brief.tone ?? undefined,
      theme: row.brief.theme ?? undefined,
      setting: row.brief.setting ?? undefined,
    };
  }
}

export const projectService = new ProjectService();