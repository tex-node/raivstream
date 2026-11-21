import { router } from '../../trpc';
import { commercialPublishBlock } from '../../lib/commerce/commercialContract';
import { commercialGraphicVerdict } from '../../lib/creative/output/graphicPlan';
import { routeChoices, routeIntent } from '../../lib/homer/routeIntent';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { creativeProcedure } from '../../trpc';
import { quoteTransform, runRelight, runTransform } from '../../lib/creative/transform/procedure';
import { resolveStyleDefault, STYLE_DEFAULTS } from '../../lib/creative/styleDefaults';
import { creativeProjectRouter } from './project';
import { creativeIntentRouter } from './intent';
import { creativeHomerRouter } from './homer';
import { creativeProductionRouter } from './production';
import { creativeReviewRouter } from './review';
import { creativeDirectorRouter } from './director';
import { creativeApprovalRouter } from './approval';
import { creativeOutputRouter } from './output';
import { creativeSeriesRouter } from './series';
import { creativeStudioRouter } from './studio';
import { creativeObservabilityRouter } from './observability';
import { creativeAudioRouter } from './audio';

/**
 * Raivstream 5.0 — Creative API surface.
 * Registers as `creative` on the root router.
 */
export const creativeRouter = router({
  /**
   * Relight one existing scene asset (2026-11-15). The duration comes from the asset's own row, the charge is
   * rate x billed seconds, and the ceiling is asserted before the charge.
   */
  relight: creativeProcedure
    .input(z.object({ projectId: z.string(), assetId: z.string(), resolution: z.enum(['720p', '1080p']) }))
    .mutation(async ({ ctx, input }) => runRelight(ctx.prisma, {
      projectId: input.projectId,
      assetId: input.assetId,
      resolution: input.resolution,
      userId: ctx.user.id,
    })),
  /**
   * Restyle one existing scene asset (2026-11-16). The instruction is the measured variable: a blunt, named
   * look scored styleChange 85 where a balanced grade scored 15, so the surface asks for the former.
   */
  restyle: creativeProcedure
    .input(z.object({ projectId: z.string(), assetId: z.string(), resolution: z.enum(['720p', '1080p']), instruction: z.string().min(4).max(400) }))
    .mutation(async ({ ctx, input }) => runTransform(ctx.prisma, {
      projectId: input.projectId,
      assetId: input.assetId,
      resolution: input.resolution,
      userId: ctx.user.id,
      operation: 'restyle',
      instruction: input.instruction,
    })),

  /** Cost preview from the same plan function the charge uses - a preview cannot drift from the charge. */
  transformQuote: creativeProcedure
    .input(z.object({ projectId: z.string(), assetId: z.string(), operation: z.enum(['relight', 'restyle']), resolution: z.enum(['720p', '1080p']) }))
    .query(async ({ ctx, input }) => quoteTransform(ctx.prisma, { ...input, userId: ctx.user.id })),

  /**
   * Stated style defaults (2026-11-17): the creator's choice, the stated default for the project type, or neutral.
   * Every level reports its source, so the surface can say it rather than imply it; R16 resolves to neutral only.
   */
  styleDefault: creativeProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.prisma.creativeProject.findFirst({ where: { id: input.projectId, userId: ctx.user.id }, select: { projectType: true } });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Creative project not found.' });
      const user = await ctx.prisma.user.findUnique({ where: { id: ctx.user.id }, select: { styleDefaultKey: true } });
      return {
        resolved: resolveStyleDefault({ creatorKey: user?.styleDefaultKey ?? null, projectType: project.projectType, isR16: ctx.isR16 ?? false }),
        options: Object.values(STYLE_DEFAULTS).map((entry) => ({ key: entry.key, label: entry.label, basis: entry.basis, neutral: entry.neutral })),
      };
    }),

  /** An override is a stored value, not UI state: a creator who changes their default expects it to persist. */
  setStyleDefault: creativeProcedure
    .input(z.object({ key: z.enum(['suspense', 'drama', 'comedy', 'educational', 'commercial', 'transformation']) }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.isR16) throw new TRPCError({ code: 'FORBIDDEN', message: 'Style defaults are not available here.' });
      await ctx.prisma.user.update({ where: { id: ctx.user.id }, data: { styleDefaultKey: input.key } });
      return { ok: true, key: input.key };
    }),

  /**
   * Homer's front door (2026-11-21). One sentence in, a proposal out: which of the four paths it sounds like, why, and at most four buttons.
   * Deterministic and instant (see routeIntent) because routing must be explainable and overridable, and always HOMER_INFERENCE - the creator
   * has confirmed nothing yet.
   */
  routeIntent: creativeProcedure
    .input(z.object({ thinking: z.string().min(1).max(1000) }))
    .query(({ input }) => {
      const route = routeIntent(input.thinking);
      return { ...route, choices: routeChoices(route) };
    }),

  /**
   * The readability verdict for the beats as they are TYPED, not as they are saved (2026-11-21). Same pure function the publish gate uses
   * (`commercialGraphicVerdict`), exposed so the surface can block before the click - and deliberately a server call, so the rules have one
   * home. A client that reimplemented them would eventually disagree with the refusal.
   */
  commercialTextIssues: creativeProcedure
    .input(
      z.object({
        hook: z.string().max(400).optional(),
        benefit: z.string().max(400).optional(),
        cta: z.string().max(400).optional(),
        durationSeconds: z.number().min(1).max(600).default(9),
      }),
    )
    .query(({ ctx, input }) => {
      if (ctx.isR16) throw new TRPCError({ code: 'FORBIDDEN', message: 'Commercial authoring is not available here.' });
      const verdict = commercialGraphicVerdict({
        hook: input.hook ?? null,
        benefit: input.benefit ?? null,
        cta: input.cta ?? null,
        durationSeconds: input.durationSeconds,
      });
      return { issues: verdict.issues, beats: verdict.plan.beats.length };
    }),

  /**
   * The ad's three beats and their verdict, for the surface that collects them (2026-11-17). Returns the SAME
   * `commercialPublishBlock` the publish gate uses, so the signal a creator sees cannot disagree with the refusal.
   */
  commercialCopy: creativeProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.prisma.creativeProject.findFirst({ where: { id: input.projectId, userId: ctx.user.id }, select: { id: true, title: true, projectType: true } });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Creative project not found.' });
      const brief = await ctx.prisma.creativeBrief.findUnique({
        where: { projectId: project.id },
        select: { commercialHook: true, commercialBenefit: true, commercialCta: true },
      });
      const beats = { hook: brief?.commercialHook ?? '', benefit: brief?.commercialBenefit ?? '', cta: brief?.commercialCta ?? '' };
      const text = [beats.hook, beats.benefit, beats.cta].filter(Boolean).join(' ').trim();
      return { beats, verdict: commercialPublishBlock({ text: text || null, productName: project.title }) };
    }),

  /** An override is stored: the creator's beats survive a reload, like the style default. */
  setCommercialCopy: creativeProcedure
    .input(z.object({
      projectId: z.string(),
      hook: z.string().max(240).default(''),
      benefit: z.string().max(240).default(''),
      cta: z.string().max(240).default(''),
    }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.prisma.creativeProject.findFirst({ where: { id: input.projectId, userId: ctx.user.id }, select: { id: true } });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Creative project not found.' });
      await ctx.prisma.creativeBrief.upsert({
        where: { projectId: project.id },
        update: { commercialHook: input.hook, commercialBenefit: input.benefit, commercialCta: input.cta },
        create: { projectId: project.id, originalIntent: input.hook || 'Commercial', commercialHook: input.hook, commercialBenefit: input.benefit, commercialCta: input.cta },
      });
      return { ok: true };
    }),

  project: creativeProjectRouter,
  intent: creativeIntentRouter,
  homer: creativeHomerRouter,
  production: creativeProductionRouter,
  review: creativeReviewRouter,
  director: creativeDirectorRouter,
  approval: creativeApprovalRouter,
  output: creativeOutputRouter,
  series: creativeSeriesRouter,
  studio: creativeStudioRouter,
  observability: creativeObservabilityRouter,
  audio: creativeAudioRouter,
});