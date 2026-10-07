/**
 * director.* — Raivstream Director (moviedirector skill).
 *
 * A creator describes a scene in plain language; Claude returns finished,
 * production-ready cinematic prompts (reference blocks, scene context, tech
 * spec, CUT list, sound design) ready for AI Studio or an external generator.
 *
 * - creativeProcedure: signed-in, never on R16 (kids never see raw prompts).
 * - Prompt moderation runs first, so a blocked brief costs nothing.
 * - Credits: charged only when an active `director:compose` rate exists in
 *   FeatureCreditRate (set it in /admin/credits). Refunded if the model fails.
 * - Stateless: no schema changes, nothing stored server-side.
 */
import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { router, creativeProcedure } from '../trpc';
import { moderatePrompt, moderationRejectMessage } from '../lib/promptModeration';
import { deductCredits, getFeatureCreditCost, refundCredits, resolveFeatureCreditRate } from '../lib/credits';
import { DIRECTOR_MAX_SCENES, movieDirector } from '../lib/movieDirector';

export const DIRECTOR_FEATURE_KEY = 'director:compose';

const castMemberSchema = z.object({
  tag: z.string().trim().min(1).max(40),
  description: z.string().trim().max(600).optional(),
  voice: z.string().trim().max(300).optional(),
  imageReferenced: z.boolean().optional(),
});

const referenceSchema = z.object({
  label: z.string().trim().min(1).max(80),
  purpose: z.enum(['CHARACTER', 'ENVIRONMENT', 'PROP', 'OTHER']),
  note: z.string().trim().max(300).optional(),
});

export const directorComposeInput = z.object({
  scene: z.string().trim().min(10, 'Describe the scene in a sentence or two.').max(4000),
  cast: z.array(castMemberSchema).max(8).default([]),
  sceneCount: z.number().int().min(1).max(DIRECTOR_MAX_SCENES).default(1),
  format: z.enum(['CONTINUOUS', 'CUTS']).default('CONTINUOUS'),
  charCeiling: z.union([z.literal(2000), z.literal(4000)]).default(4000),
  references: z.array(referenceSchema).max(8).default([]),
  world: z.string().trim().max(600).optional(),
  revisionNote: z.string().trim().max(500).optional(),
  previousScenes: z.array(z.string().max(6000)).max(DIRECTOR_MAX_SCENES).optional(),
});

export const directorRouter = router({
  status: creativeProcedure.query(async ({ ctx }) => ({
    configured: movieDirector.isConfigured,
    creditCost: await getFeatureCreditCost(ctx.prisma, DIRECTOR_FEATURE_KEY),
    maxScenes: DIRECTOR_MAX_SCENES,
  })),

  compose: creativeProcedure.input(directorComposeInput).mutation(async ({ ctx, input }) => {
    if (!movieDirector.isConfigured) {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Director is not switched on yet. An admin needs to add the Claude API key on the server.' });
    }

    const toModerate = [
      input.scene,
      input.world,
      input.revisionNote,
      ...input.cast.map((c) => [c.tag, c.description, c.voice].filter(Boolean).join(' ')),
      ...input.references.map((r) => [r.label, r.note].filter(Boolean).join(' ')),
    ].filter((s): s is string => Boolean(s && s.trim())).join('\n');
    const moderation = await moderatePrompt(toModerate);
    if (!moderation.allowed) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: moderationRejectMessage(moderation, 'This scene brief cannot be directed.') });
    }

    const referenceId = `director:${randomUUID()}`;
    const rate = await resolveFeatureCreditRate(ctx.prisma, DIRECTOR_FEATURE_KEY);
    let creditsUsed = 0;
    if (rate.configured) {
      creditsUsed = await deductCredits(ctx.prisma, ctx.user.id, DIRECTOR_FEATURE_KEY, referenceId, `Director: ${input.sceneCount} scene prompt(s)`);
    }

    try {
      const result = await movieDirector.compose(input);
      return { ...result, creditsUsed };
    } catch (error) {
      if (creditsUsed > 0) {
        await refundCredits(ctx.prisma, ctx.user.id, creditsUsed, DIRECTOR_FEATURE_KEY, referenceId, 'Director failed: refund').catch((e) =>
          console.error('[director] refund failed', referenceId, e),
        );
      }
      console.error('[director] compose failed', referenceId, error);
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'The Director could not finish this scene. Nothing was charged. Please try again.' });
    }
  }),
});
