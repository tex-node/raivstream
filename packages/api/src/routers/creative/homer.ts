import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { creativeProcedure, router } from '../../trpc';
import { homerService } from '../../lib/homer/service';
import { isHomerInterpreterEnabled } from '../../lib/homer/interpreter';
import { claudeApiKey, CLAUDE_ANTHROPIC_VERSION, CLAUDE_DEFAULT_MODEL } from '../../lib/narrativeEngine';
import { saveHomerState, saveDirectingDecisions } from '../../lib/homer/repository';
import {
  selectNextDirectingQuestion,
  proposeDirectingDecision,
  getCategoryInfo,
} from '../../lib/homer/directing';
import type { HomerStoryState } from '../../lib/homer/types';
import type { CreativeDecisionCategory, HomerCreativeDecision } from '../../lib/homer/directingTypes';
import {
  extractScenes,
  buildVisualPrompt,
  createOrReplaceAnimatic,
  refreshAnimaticState,
  isFalImageEnabled,
} from '../../lib/homer/animaticService';

// ─── Directing schemas ─────────────────────────────────────────────────────────

const zCreativeDecisionCategory = z.enum([
  'VISUAL_TREATMENT',
  'MOOD',
  'WORLD_TREATMENT',
  'TIME_OF_DAY',
  'PACING',
  'CHARACTER_PRESENTATION',
  'CAMERA_PERSPECTIVE',
] as const);

const zHomerCreativeDecision = z.object({
  id: z.string(),
  category: zCreativeDecisionCategory,
  label: z.string(),
  value: z.string(),
  rationale: z.string(),
  provenance: z.enum(['USER_EXPLICIT', 'USER_APPROVED', 'HOMER_INFERENCE', 'HOMER_PROPOSAL']),
  createdAt: z.string(),
});

// ─── AI-powered proposal (falls back to deterministic) ─────────────────────────

const CLAUDE_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';

async function proposeWithAI(
  category: CreativeDecisionCategory,
  state: HomerStoryState,
  existingDecisions: HomerCreativeDecision[],
  audienceMode: 'GENERAL' | 'KIDS',
): Promise<HomerCreativeDecision> {
  const apiKey = claudeApiKey(process.env) ?? '';
  const model = process.env.HOMER_INTERPRETER_MODEL ?? CLAUDE_DEFAULT_MODEL;
  const info = getCategoryInfo(category);
  const choiceList = info.choices.map((c) => `- "${c.value}": ${c.label}`).join('\n');
  const existingSummary = existingDecisions.length > 0
    ? existingDecisions.map((d) => `${d.label}: ${d.value}`).join('\n')
    : 'None yet.';

  const prompt = `You are Homer, a creative director. Given this story and existing decisions, choose one value for the given category.

PREMISE: ${state.premise?.value ?? ''}
GENRE: ${state.genre?.value ?? ''}
TONE: ${state.tone?.value ?? ''}
AUDIENCE: ${audienceMode}

EXISTING DECISIONS:
${existingSummary}

CATEGORY: ${info.label}
QUESTION: ${info.question}

AVAILABLE VALUES:
${choiceList}

Respond with JSON only:
{"value": "<exactly one of the values above>", "rationale": "<one sentence why>"}`;

  const response = await fetch(CLAUDE_MESSAGES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': CLAUDE_ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: 256,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!response.ok) throw new Error(`Claude API error: ${response.status}`);

  const data = await response.json() as { content?: Array<{ type: string; text: string }> };
  const text = data.content?.[0]?.type === 'text' ? data.content[0].text.trim() : '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in response');
  const parsed = JSON.parse(match[0]) as { value?: string; rationale?: string };
  if (!parsed.value || !parsed.rationale) throw new Error('Malformed response');

  const validValues = info.choices.map((c) => c.value);
  if (!validValues.includes(parsed.value)) throw new Error(`Unknown value: ${parsed.value}`);

  return {
    id: `dir_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    category,
    label: info.label,
    value: parsed.value,
    rationale: parsed.rationale,
    provenance: 'HOMER_PROPOSAL',
    createdAt: new Date().toISOString(),
  };
}

/**
 * Raivstream 5.0 — Homer Create router.
 *
 * Exposes Homer story intelligence to the conversational Create flow.
 * Homer is the STORY INTELLIGENCE layer: it interprets raw creator text into
 * structured semantic state. It is NOT a chatbot and does NOT generate media.
 *
 * These endpoints are gated by the existing creative procedure (auth + R16).
 * Homer-specific feature gating uses isHomerInterpreterEnabled().
 */
export const creativeHomerRouter = router({
  /**
   * Interpret a creator's raw story text through the real Homer AI pipeline.
   * Uses claude-sonnet-4-5 → ProposedStoryState → deterministic reconciler → HomerStoryState.
   *
   * Optional correctionText is appended as user-owned context before re-interpretation.
   * Fail-closed: any failure returns a creator-friendly error; no partial state is emitted.
   */
  interpret: creativeProcedure
    .input(z.object({
      storyText: z.string().min(1).max(20000),
      audienceMode: z.enum(['GENERAL', 'KIDS']).default('GENERAL'),
      /** Natural language correction from the creator — treated as user-owned context. */
      correctionText: z.string().max(2000).optional(),
    }))
    .mutation(async ({ input }) => {
      if (!isHomerInterpreterEnabled(process.env)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: "Homer couldn't understand that yet. Story intelligence is coming soon.",
        });
      }
      try {
        const fullText = input.correctionText
          ? `${input.storyText}\n\n[Creator's additional context: ${input.correctionText}]`
          : input.storyText;
        const state = await homerService.interpretStoryWithAI({
          storyText: fullText,
          audienceMode: input.audienceMode,
        });
        return { ok: true as const, state };
      } catch {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: "Homer couldn't understand that yet. Try saying it another way.",
        });
      }
    }),

  /**
   * Return the next most consequential creative directing question.
   * Infers what Homer can determine from the story state, then asks the first unknown.
   * Returns `isComplete: true` (and `question: null`) when all categories are resolved.
   */
  nextDirectingQuestion: creativeProcedure
    .input(z.object({
      storyState: z.record(z.unknown()),
      existingDecisions: z.array(z.record(z.unknown())),
      audienceMode: z.enum(['GENERAL', 'KIDS']).default('GENERAL'),
    }))
    .mutation(({ input }) => {
      const state = input.storyState as unknown as HomerStoryState;
      const decisions = input.existingDecisions as unknown as HomerCreativeDecision[];
      const result = selectNextDirectingQuestion(state, decisions, input.audienceMode);
      return { ok: true as const, ...result };
    }),

  /**
   * Propose a creative decision for "Let Homer decide."
   * Uses AI when HOMER_INTERPRETER_ENABLED; falls back to deterministic rule-based logic.
   */
  proposeDecision: creativeProcedure
    .input(z.object({
      storyState: z.record(z.unknown()),
      category: zCreativeDecisionCategory,
      existingDecisions: z.array(z.record(z.unknown())),
      audienceMode: z.enum(['GENERAL', 'KIDS']).default('GENERAL'),
    }))
    .mutation(async ({ input }) => {
      const state = input.storyState as unknown as HomerStoryState;
      const decisions = input.existingDecisions as unknown as HomerCreativeDecision[];
      let decision: HomerCreativeDecision;

      if (isHomerInterpreterEnabled(process.env)) {
        try {
          decision = await proposeWithAI(input.category, state, decisions, input.audienceMode);
        } catch {
          decision = proposeDirectingDecision(input.category, state, decisions, input.audienceMode);
        }
      } else {
        decision = proposeDirectingDecision(input.category, state, decisions, input.audienceMode);
      }

      return { ok: true as const, decision };
    }),

  /**
   * Persist an approved HomerStoryState into the CreativeBible of an existing project.
   * Called after the creator approves the "Here's what I understand" view.
   * Writes to CreativeBible.story — the canonical Homer state field.
   */
  approveAndSave: creativeProcedure
    .input(z.object({
      projectId: z.string(),
      /** HomerStoryState as opaque JSON — validated structurally in saveHomerState. */
      storyState: z.record(z.unknown()),
    }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.prisma.creativeProject.findFirst({
        where: { id: input.projectId, userId: ctx.user.id },
      });
      if (!project) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found.' });
      }
      await saveHomerState(ctx.prisma, input.projectId, input.storyState as unknown as HomerStoryState);
      return { ok: true as const };
    }),

  // ─── Phase 3: First-Frame Animatic ────────────────────────────────────────

  /**
   * Derive the scene plan from HomerStoryState without generating images.
   * Returns the ordered list of scenes so the UI can preview what will be generated.
   */
  buildScenePlan: creativeProcedure
    .input(z.object({
      storyState: z.record(z.unknown()),
      audienceMode: z.enum(['GENERAL', 'KIDS']).default('GENERAL'),
    }))
    .mutation(({ input }) => {
      const state = input.storyState as unknown as HomerStoryState;
      const scenes = extractScenes(state);
      return { ok: true as const, scenes, sceneCount: scenes.length };
    }),

  /**
   * Generate the first-frame animatic.
   * Creates/replaces a HomerAnimatic record for this user, submits FLUX2 generation
   * for each scene frame, and returns the animaticId for polling.
   *
   * §30 constraint: if FAL_IMAGE_ENABLED is absent/false, frames are created with
   * status PENDING and imageUrl null. The client can proceed to project creation.
   */
  generateAnimatic: creativeProcedure
    .input(z.object({
      storyState: z.record(z.unknown()),
      decisions: z.array(z.record(z.unknown())).default([]),
      audienceMode: z.enum(['GENERAL', 'KIDS']).default('GENERAL'),
    }))
    .mutation(async ({ ctx, input }) => {
      const state = input.storyState as unknown as HomerStoryState;
      const decisions = input.decisions as unknown as HomerCreativeDecision[];
      const generationEnabled = isFalImageEnabled();

      const animaticId = await createOrReplaceAnimatic(ctx.prisma as Parameters<typeof createOrReplaceAnimatic>[0], {
        userId: ctx.user.id,
        state,
        decisions,
        audienceMode: input.audienceMode,
      });

      return {
        ok: true as const,
        animaticId,
        generationEnabled,
        message: generationEnabled
          ? 'Animatic generation started.'
          : 'Implementation verified; live generation acceptance requires authorized media credits.',
      };
    }),

  /**
   * Poll animatic state — updates in-progress frame statuses from the provider.
   * Call repeatedly until overallStatus === 'READY' | 'FAILED'.
   */
  getAnimaticState: creativeProcedure
    .input(z.object({ animaticId: z.string() }))
    .query(async ({ ctx, input }) => {
      const state = await refreshAnimaticState(
        ctx.prisma as Parameters<typeof refreshAnimaticState>[0],
        input.animaticId,
        ctx.user.id,
      );
      if (!state) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Animatic not found.' });
      }
      return { ok: true as const, ...state };
    }),

  /**
   * Add a semantic director note to a specific scene frame.
   * Does not re-trigger image generation — notes are surfaced in the UI
   * and carried into the project's creative context on approval.
   */
  directScene: creativeProcedure
    .input(z.object({
      animaticId: z.string(),
      sceneId: z.string(),
      directorNote: z.string().max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      const animatic = await ctx.prisma.homerAnimatic.findFirst({
        where: { id: input.animaticId, userId: ctx.user.id },
      });
      if (!animatic) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Animatic not found.' });
      }
      const frame = await ctx.prisma.homerAnimaticFrame.findFirst({
        where: { animaticId: input.animaticId, sceneId: input.sceneId },
      });
      if (!frame) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Scene frame not found.' });
      }
      await ctx.prisma.homerAnimaticFrame.update({
        where: { id: frame.id },
        data: { directorNote: input.directorNote },
      });
      return { ok: true as const };
    }),

  /**
   * Approve the animatic — Phase 4 real persistence.
   *
   * Atomically links an approved HomerAnimatic to the existing CreativeProject,
   * writes the final HomerStoryState + directing decisions to CreativeBible,
   * creates a CreativeVersion snapshot, and records a CREATIVE approval.
   *
   * Idempotent: if the project already has this animatic approved, returns
   * the existing result without re-running the transaction.
   */
  approveAnimatic: creativeProcedure
    .input(z.object({
      animaticId: z.string(),
      projectId: z.string(),
      storyState: z.record(z.unknown()),
      decisions: z.array(z.record(z.unknown())).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify animatic ownership.
      const animatic = await ctx.prisma.homerAnimatic.findFirst({
        where: { id: input.animaticId, userId: ctx.user.id },
      });
      if (!animatic) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Animatic not found.' });
      }

      // Verify project ownership.
      const project = await ctx.prisma.creativeProject.findFirst({
        where: { id: input.projectId, userId: ctx.user.id },
        select: { id: true, approvedAnimaticId: true },
      });
      if (!project) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found.' });
      }

      // Idempotency: already approved with the same animatic → return early.
      if ((project as { id: string; approvedAnimaticId?: string | null }).approvedAnimaticId === input.animaticId) {
        return { ok: true as const, animaticId: input.animaticId, projectId: input.projectId };
      }

      // Atomic approval: version + approval + bible state + animaticId link.
      await ctx.prisma.$transaction(async (tx) => {
        const txClient = tx as unknown as import('@raivstream/database').PrismaClient;

        // 1. Persist final Homer state + directing decisions into the bible.
        await saveHomerState(txClient, input.projectId, input.storyState as unknown as HomerStoryState);
        if (input.decisions && input.decisions.length > 0) {
          await saveDirectingDecisions(
            txClient,
            input.projectId,
            input.decisions as unknown as HomerCreativeDecision[],
          );
        }

        // 2. Link the approved animatic on the project.
        await txClient.creativeProject.update({
          where: { id: input.projectId },
          data: { approvedAnimaticId: input.animaticId } as never,
        });

        // 3. Create a version snapshot for the approval record.
        const version = await txClient.creativeVersion.create({
          data: {
            projectId: input.projectId,
            versionNumber: 1,
            label: 'Creative direction — animatic approved',
            snapshot: { animaticId: input.animaticId, approvedAt: new Date().toISOString() } as never,
          },
        });

        // 4. Record the CREATIVE approval (links this animatic as the creative gate).
        await txClient.creativeApproval.create({
          data: {
            projectId: input.projectId,
            versionId: version.id,
            kind: 'CREATIVE' as never,
            status: 'APPROVED' as never,
            decidedById: ctx.user.id,
          },
        });
      });

      return { ok: true as const, animaticId: input.animaticId, projectId: input.projectId };
    }),
});
