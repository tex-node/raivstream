import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { creativeProcedure, router } from '../../trpc';
import { regenerateShotFromDirective, UnknownShotError } from '../../lib/creative/director/shotProcedure';
import { assertWithinCeiling, loadRunBudget } from '../../lib/credits/cap';
import { getFeatureCreditCost } from '../../lib/credits';
import { createNewTake } from '../../lib/creative/production/newTake';
import { directorService } from '../../lib/creative/director/service';
import { buildDirectorSuggestions } from '../../lib/creative/director/suggestions';
import { critiqueFinding } from '../../lib/creative/director/critiqueFindings';
import { critiqueStory } from '../../lib/story/storyCritique';
import { CreativeError } from '../../lib/creative/shared/errors';
import type { CreativeProductionPlanState } from '../../lib/creative/production/plan';

function toTrpcError(error: unknown, fallback: string): TRPCError {
  // A named-but-absent reference reads like a decision, not a stack. NOT_FOUND is this router's
  // convention for a reference that does not exist (see PROJECT_NOT_FOUND).
  if (error instanceof UnknownShotError) {
    return new TRPCError({ code: 'NOT_FOUND', message: error.message });
  }
  if (error instanceof CreativeError) {
    const code = error.code === 'PROJECT_NOT_FOUND' ? 'NOT_FOUND' : error.code === 'CREATIVE_DISABLED' ? 'FORBIDDEN' : 'BAD_REQUEST';
    return new TRPCError({ code, message: error.message });
  }
  return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: fallback });
}


/**
 * The latest chapter's critique for a creative project, via `legacyStoryProjectId` (2026-11-17).
 *
 * The link is the field that exists - there is no `creativeProjectId` on StoryProject, so guessing one would have
 * made the query throw and the integration silently never fire. A missing link returns null, which is honest: no
 * story, no critique, no finding.
 */
async function latestChapterCritique(prisma: any, projectId: string) {
  const project = await (prisma as any).creativeProject.findUnique({
    where: { id: projectId },
    select: { legacyStoryProjectId: true },
  });
  if (!project?.legacyStoryProjectId) return null;
  const storyProject = await (prisma as any).storyProject.findUnique({
    where: { id: project.legacyStoryProjectId },
    select: { chapters: { orderBy: { chapterNumber: 'desc' }, take: 1, select: { body: true } } },
  });
  const body = storyProject?.chapters?.[0]?.body;
  return body ? critiqueStory(body) : null;
}

export const creativeDirectorRouter = router({
  /** DIRECT â€” resolve intent â†’ change/preserve â†’ impact â†’ new version. Never generates. */
  direct: creativeProcedure
    .input(z.object({ projectId: z.string(), instruction: z.string().min(2).max(300) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await directorService.direct(ctx.prisma, { projectId: input.projectId, userId: ctx.user.id, instruction: input.instruction });
      } catch (error) {
        throw toTrpcError(error, 'Could not interpret the direction.');
      }
    }),

  /** PROPOSE â€” interpret a directive (change/preserve/impact) without persisting. */
  /** SUGGESTIONS — context-derived directions for THIS creative (not generic). */
  suggestions: creativeProcedure
    .input(z.object({ projectId: z.string(), sceneId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      try {
        const project = await ctx.prisma.creativeProject.findFirst({
          where: { id: input.projectId, userId: ctx.user.id },
          include: { brief: true, bible: true, productionPlan: true },
        });
        if (!project) throw new CreativeError('PROJECT_NOT_FOUND', 'Creative project not found.');
        const runs = await ctx.prisma.creativeReviewRun.findMany({ where: { projectId: project.id }, orderBy: { createdAt: 'desc' }, take: 1 });
        const findings = (runs[0]?.findings as unknown as Array<{ suggestedFixInstruction?: string; description?: string; category?: string }>) ?? [];
// The story critique already runs on the chapter the creator is reading; its weakest dimension joins the findings
// the director already consumes, so the critique feeds suggestions without a second generator (2026-11-17).
const critique = await latestChapterCritique(ctx.prisma, project.id);
const critiqueDerived = critiqueFinding(critique);
const merged = critiqueDerived ? [...findings, critiqueDerived] : findings;
        return buildDirectorSuggestions({
          projectType: project.projectType,
          brief: project.brief as never,
          bible: project.bible as never,
          plan: (project.productionPlan?.plan as never) ?? null,
          reviewFindings: merged,
          currentSceneId: input.sceneId ?? null,
        });
      } catch (error) {
        throw toTrpcError(error, 'Suggestions unavailable.');
      }
    }),

  propose: creativeProcedure
    .input(z.object({ projectId: z.string(), instruction: z.string().min(2).max(300) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await directorService.propose(ctx.prisma, { projectId: input.projectId, userId: ctx.user.id, instruction: input.instruction });
      } catch (error) {
        throw toTrpcError(error, 'Could not understand the direction.');
      }
    }),

  /** APPLY INSTRUCTION â€” propose + snapshot + apply + mark affected scenes. */
  applyInstruction: creativeProcedure
    .input(z.object({ projectId: z.string(), instruction: z.string().min(2).max(300) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await directorService.applyInstruction(ctx.prisma, { projectId: input.projectId, userId: ctx.user.id, instruction: input.instruction });
      } catch (error) {
        throw toTrpcError(error, 'Could not apply the direction.');
      }
    }),

  /** EXPLORE â€” N variations as separate versions; original preserved. */
  explore: creativeProcedure
    .input(z.object({ projectId: z.string(), instruction: z.string().min(2).max(300) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await directorService.explore(ctx.prisma, { projectId: input.projectId, userId: ctx.user.id, instruction: input.instruction });
      } catch (error) {
        throw toTrpcError(error, 'Could not explore variations.');
      }
    }),

  /** Apply a directive: mutate the semantic state + mark affected scenes for targeted regeneration. */
  applyDirective: creativeProcedure
    .input(z.object({ projectId: z.string(), directiveId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await directorService.apply(ctx.prisma, { projectId: input.projectId, userId: ctx.user.id, directiveId: input.directiveId });
      } catch (error) {
        throw toTrpcError(error, 'Could not apply the direction.');
      }
    }),


  /**
   * REGENERATE SHOT — a sentence naming a shot regenerates only that shot's take.
   *
   * The ceiling is asserted before the capability is called: a director instruction spends, so it
   * must not be a path around the cap. Ownership is the project lookup's filter, matching every
   * other procedure here.
   */
  regenerateShot: creativeProcedure
    .input(z.object({ projectId: z.string(), instruction: z.string().min(2).max(300) }))
    .mutation(async ({ ctx, input }) => {
      try {
        const project = await ctx.prisma.creativeProject.findFirst({
          where: { id: input.projectId, userId: ctx.user.id },
          select: { id: true, productionPlan: { select: { plan: true } } },
        });
        if (!project) throw new CreativeError('PROJECT_NOT_FOUND', 'Creative project not found.');

        const run = await ctx.prisma.creativeProductionRun.findFirst({
          where: { projectId: project.id },
          orderBy: { startedAt: 'desc' },
          select: { id: true },
        });

        return await regenerateShotFromDirective(
          {
            loadBudget: async () => {
              const budget = await loadRunBudget(ctx.prisma, run?.id ?? null);
              return { runId: run?.id ?? null, ceiling: budget.ceiling, spent: budget.spent };
            },
            nextTakeCost: async () => getFeatureCreditCost(ctx.prisma, 'generate:flux2').catch(() => 80),
            assertCeiling: assertWithinCeiling,
            createNewTake: async (take) => {
              const scene = ((project.productionPlan?.plan as never) as CreativeProductionPlanState | undefined)?.scenes.find(
                (entry) => entry.sceneId === take.sceneId,
              );
              return createNewTake(ctx.prisma, {
                projectId: project.id,
                sceneId: take.sceneId,
                shotId: take.shotId,
                scenePrompt: (scene as { prompt?: string } | undefined)?.prompt ?? take.instruction,
                characters: [],
                userId: ctx.user.id,
              } as never);
            },
          },
          {
            projectId: project.id,
            plan: (project.productionPlan?.plan as never) as CreativeProductionPlanState,
            instruction: input.instruction,
          },
        );
      } catch (error) {
        throw toTrpcError(error, 'Could not regenerate that shot.');
      }
    }),
  /** Minimal version list (Direct/Explore safety). */
  versions: creativeProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      try {
        return await directorService.versions(ctx.prisma, { projectId: input.projectId, userId: ctx.user.id });
      } catch (error) {
        throw toTrpcError(error, 'Versions unavailable.');
      }
    }),
});