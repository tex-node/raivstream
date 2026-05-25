import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { protectedProcedure, router } from '../trpc';

const shotTypeSchema = z.enum(['IMAGE', 'VIDEO']);

const projectSelect = {
  id: true,
  title: true,
  logline: true,
  synopsis: true,
  genre: true,
  tone: true,
  targetAudience: true,
  visualStyle: true,
  status: true,
  updatedAt: true,
  createdAt: true,
  _count: {
    select: {
      characters: true,
      environments: true,
      shots: true,
    },
  },
} as const;

function splitBeats(story: string): string[] {
  return story
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((beat) => beat.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function compactList(values: Array<string | null | undefined>) {
  return values.map((value) => value?.trim()).filter(Boolean).join(', ');
}

function buildPrompt(input: {
  title: string;
  beat: string;
  shotType: 'IMAGE' | 'VIDEO';
  visualStyle?: string | null;
  tone?: string | null;
  characters: Array<{ name: string; description: string; visualTraits: string | null }>;
  environments: Array<{ name: string; description: string; mood: string | null; lighting: string | null }>;
}) {
  const cast = compactList(
    input.characters.map((character) =>
      `${character.name}: ${character.visualTraits || character.description}`,
    ),
  );
  const settings = compactList(
    input.environments.map((environment) =>
      `${environment.name}: ${environment.description}${environment.lighting ? `, ${environment.lighting}` : ''}`,
    ),
  );
  const medium = input.shotType === 'IMAGE' ? 'vertical keyframe image' : 'vertical cinematic video clip';

  return [
    `${medium} for "${input.title}"`,
    `story beat: ${input.beat}`,
    cast ? `characters: ${cast}` : undefined,
    settings ? `environment: ${settings}` : undefined,
    input.visualStyle ? `visual style: ${input.visualStyle}` : undefined,
    input.tone ? `tone: ${input.tone}` : undefined,
    'composition: mobile-first 9:16 framing, clear subject silhouette, strong continuity, high production value',
  ].filter(Boolean).join('. ');
}

async function ensureProject(ctx: { prisma: any; user: { id: string } }, projectId: string) {
  const project = await ctx.prisma.storyProject.findFirst({
    where: { id: projectId, userId: ctx.user.id },
  });
  if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Story project not found' });
  return project;
}

export const storyRouter = router({
  listProjects: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(20) }).optional())
    .query(({ ctx, input }) => {
      return ctx.prisma.storyProject.findMany({
        where: { userId: ctx.user.id },
        orderBy: { updatedAt: 'desc' },
        take: input?.limit ?? 20,
        select: projectSelect,
      });
    }),

  getProject: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await ensureProject(ctx, input.projectId);
      return ctx.prisma.storyProject.findFirst({
        where: { id: input.projectId, userId: ctx.user.id },
        include: {
          characters: { orderBy: { createdAt: 'asc' } },
          environments: { orderBy: { createdAt: 'asc' } },
          shots: { orderBy: { position: 'asc' } },
        },
      });
    }),

  createProject: protectedProcedure
    .input(z.object({
      title: z.string().min(1).max(120),
      logline: z.string().max(240).optional(),
      synopsis: z.string().max(5000).optional(),
      genre: z.string().max(80).optional(),
      tone: z.string().max(120).optional(),
      targetAudience: z.string().max(120).optional(),
      visualStyle: z.string().max(240).optional(),
    }))
    .mutation(({ ctx, input }) => {
      return ctx.prisma.storyProject.create({
        data: { ...input, userId: ctx.user.id },
        select: projectSelect,
      });
    }),

  updateProject: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      title: z.string().min(1).max(120).optional(),
      logline: z.string().max(240).optional(),
      synopsis: z.string().max(5000).optional(),
      genre: z.string().max(80).optional(),
      tone: z.string().max(120).optional(),
      targetAudience: z.string().max(120).optional(),
      visualStyle: z.string().max(240).optional(),
      status: z.enum(['DRAFT', 'STORYBOARDED', 'IN_PRODUCTION', 'PUBLISHED', 'ARCHIVED']).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ensureProject(ctx, input.projectId);
      const { projectId, ...data } = input;
      return ctx.prisma.storyProject.update({
        where: { id: projectId },
        data,
        select: projectSelect,
      });
    }),

  upsertCharacter: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      id: z.string().optional(),
      name: z.string().min(1).max(80),
      role: z.string().max(80).optional(),
      description: z.string().min(1).max(800),
      personality: z.string().max(500).optional(),
      visualTraits: z.string().max(500).optional(),
      referenceUrl: z.string().url().optional().or(z.literal('')),
    }))
    .mutation(async ({ ctx, input }) => {
      await ensureProject(ctx, input.projectId);
      const data = {
        name: input.name,
        role: input.role,
        description: input.description,
        personality: input.personality,
        visualTraits: input.visualTraits,
        referenceUrl: input.referenceUrl || null,
      };
      if (input.id) {
        return ctx.prisma.storyCharacter.update({ where: { id: input.id }, data });
      }
      return ctx.prisma.storyCharacter.create({ data: { ...data, projectId: input.projectId } });
    }),

  upsertEnvironment: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      id: z.string().optional(),
      name: z.string().min(1).max(80),
      description: z.string().min(1).max(800),
      mood: z.string().max(240).optional(),
      lighting: z.string().max(240).optional(),
      referenceUrl: z.string().url().optional().or(z.literal('')),
    }))
    .mutation(async ({ ctx, input }) => {
      await ensureProject(ctx, input.projectId);
      const data = {
        name: input.name,
        description: input.description,
        mood: input.mood,
        lighting: input.lighting,
        referenceUrl: input.referenceUrl || null,
      };
      if (input.id) {
        return ctx.prisma.storyEnvironment.update({ where: { id: input.id }, data });
      }
      return ctx.prisma.storyEnvironment.create({ data: { ...data, projectId: input.projectId } });
    }),

  buildStoryboard: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      storyText: z.string().min(20).max(8000),
      shotType: shotTypeSchema.default('VIDEO'),
      replaceExisting: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.prisma.storyProject.findFirst({
        where: { id: input.projectId, userId: ctx.user.id },
        include: {
          characters: true,
          environments: true,
          shots: { select: { position: true }, orderBy: { position: 'desc' }, take: 1 },
        },
      });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Story project not found' });

      const beats = splitBeats(input.storyText);
      if (beats.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Add a story with enough detail to create shots.' });
      }

      if (input.replaceExisting) {
        await ctx.prisma.storyboardShot.deleteMany({ where: { projectId: project.id } });
      }

      const startPosition = input.replaceExisting ? 1 : ((project.shots[0]?.position ?? 0) + 1);
      const shots = await ctx.prisma.$transaction(
        beats.map((beat, index) => {
          const title = `Shot ${startPosition + index}`;
          return ctx.prisma.storyboardShot.create({
            data: {
              projectId: project.id,
              position: startPosition + index,
              shotType: input.shotType,
              title,
              beat,
              action: beat,
              camera: 'Close, energetic vertical framing with smooth creator-style motion',
              imagePrompt: buildPrompt({ ...project, beat, title, shotType: 'IMAGE' }),
              videoPrompt: buildPrompt({ ...project, beat, title, shotType: 'VIDEO' }),
              negativePrompt: 'low resolution, distorted faces, inconsistent character identity, unreadable text, watermark',
              aspectRatio: '9:16',
              duration: 5,
            },
          });
        }),
      );

      await ctx.prisma.storyProject.update({
        where: { id: project.id },
        data: { synopsis: input.storyText, status: 'STORYBOARDED' },
      });

      return shots;
    }),

  updateShot: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      shotId: z.string(),
      title: z.string().min(1).max(120).optional(),
      beat: z.string().min(1).max(1000).optional(),
      camera: z.string().max(500).optional(),
      action: z.string().max(1000).optional(),
      dialogue: z.string().max(1000).optional(),
      imagePrompt: z.string().min(1).max(1000).optional(),
      videoPrompt: z.string().min(1).max(1000).optional(),
      negativePrompt: z.string().max(500).optional(),
      assetUrl: z.string().url().optional().or(z.literal('')),
      seedImageUrl: z.string().url().optional().or(z.literal('')),
      generationJobId: z.string().optional(),
      duration: z.number().min(1).max(15).optional(),
      aspectRatio: z.enum(['9:16', '16:9', '1:1', '4:3', '3:4']).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ensureProject(ctx, input.projectId);
      const shot = await ctx.prisma.storyboardShot.findFirst({
        where: { id: input.shotId, projectId: input.projectId },
      });
      if (!shot) throw new TRPCError({ code: 'NOT_FOUND', message: 'Storyboard shot not found' });

      const { projectId, shotId, assetUrl, seedImageUrl, ...rest } = input;
      return ctx.prisma.storyboardShot.update({
        where: { id: shotId },
        data: {
          ...rest,
          ...(assetUrl !== undefined ? { assetUrl: assetUrl || null } : {}),
          ...(seedImageUrl !== undefined ? { seedImageUrl: seedImageUrl || null } : {}),
        },
      });
    }),
});
