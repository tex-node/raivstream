import type { PrismaClient } from '@raivstream/database';
import type { CreativeInterpretation } from '../shared/types';
import { autoResolveIntent, type AutoResolveResult } from './resolve';

/**
 * Auto mode, wired end to end (Phase 7).
 *
 * The two pieces shipped separately: `autoResolveIntent` decides deferrable questions and refuses
 * the rest; `runCreativeProduction` accepts a `creditCeiling` checked before every charge. Neither
 * was reachable from a router, so "one line in, a capped film out" was unproven.
 *
 * This is the path, and it is deliberately thin: interpret, decide, create, plan, produce under a
 * ceiling. Every step is injected so the composition can be tested without a database, and every
 * step is an EXISTING service - no parallel interpretation, no parallel production.
 */

/**
 * The auto path's ceiling, and why this number.
 *
 * A composite still costs 80 credits. The plan builder produces one still per scene for a typical
 * six-beat film, so 6 x 80 = 480 covers a full film at scene granularity and nothing more. Per-shot
 * production would be three times that for the same film, which is why auto mode spends on the
 * composite and leaves shot-level work to a deliberate request.
 */
export const AUTO_DEFAULT_CEILING = 480;

export interface AutoProductionDeps {
  interpret: (text: string) => Promise<CreativeInterpretation>;
  createProject: (input: {
    userId: string;
    text: string;
    interpretation: CreativeInterpretation;
    decisions: AutoResolveResult['decisions'];
  }) => Promise<{ projectId: string }>;
  buildPlan: (input: { projectId: string; userId: string }) => Promise<{ sceneCount: number }>;
  runProduction: (input: { projectId: string; creditCeiling: number }) => Promise<{
    generated: number;
    failed: number;
    status: string;
  }>;
}

export interface AutoProductionInput {
  userId: string;
  text: string;
  creditCeiling?: number;
}

export type AutoProductionResult =
  | {
      status: 'blocked';
      blockedBy: string[];
      decisions: AutoResolveResult['decisions'];
      questions: Array<{ id: string; prompt: string }>;
    }
  | {
      status: 'completed';
      projectId: string;
      ceiling: number;
      sceneCount: number;
      generated: number;
      failed: number;
      decisions: AutoResolveResult['decisions'];
    };

export async function runAutoProduction(
  deps: AutoProductionDeps,
  input: AutoProductionInput,
): Promise<AutoProductionResult> {
  const interpretation = await deps.interpret(input.text);
  const resolved = autoResolveIntent(interpretation);

  if (!resolved.ok) {
    // Surface the refusal BEFORE creating anything: a blocked question must not cost a project,
    // let alone a charge. The caller gets the question ids and prompts, not a log line.
    const questions = (interpretation.questions ?? [])
      .filter((question) => resolved.blockedBy.includes(question.id))
      .map((question) => ({ id: question.id, prompt: question.prompt }));
    return { status: 'blocked', blockedBy: resolved.blockedBy, decisions: resolved.decisions, questions };
  }

  const { projectId } = await deps.createProject({
    userId: input.userId,
    text: input.text,
    interpretation,
    decisions: resolved.decisions,
  });

  const plan = await deps.buildPlan({ projectId, userId: input.userId });

  // The ceiling is ALWAYS explicit on the auto path. A null ceiling here would be the
  // unbounded-spend state the cap exists to prevent.
  const ceiling = input.creditCeiling ?? AUTO_DEFAULT_CEILING;
  const run = await deps.runProduction({ projectId, creditCeiling: ceiling });

  return {
    status: 'completed',
    projectId,
    ceiling,
    sceneCount: plan.sceneCount,
    generated: run.generated,
    failed: run.failed,
    decisions: resolved.decisions,
  };
}

/** The production dependencies, bound to the existing services. No new pipeline. */
export function autoProductionDeps(prisma: PrismaClient): AutoProductionDeps {
  return {
    interpret: async (text) => {
      const { intentService } = await import('../intent/service');
      return (await intentService.interpret(text)) as unknown as CreativeInterpretation;
    },
    createProject: async (input) => {
      const { projectService } = await import('../project/service');
      const project = await projectService.createFromIntent(prisma, {
        userId: input.userId,
        text: input.text,
        interpretation: input.interpretation,
        answers: input.decisions.map((decision) => ({ questionId: decision.id, answer: decision.choice })),
      } as never);
      return { projectId: (project as { id: string }).id };
    },
    buildPlan: async (input) => {
      const { productionPlanService } = await import('../production/service');
      const result = (await productionPlanService.plan(prisma, { projectId: input.projectId, userId: input.userId })) as {
        plan?: { scenes?: unknown[] };
        scenes?: unknown[];
      };
      const scenes = result.plan?.scenes ?? result.scenes ?? [];
      return { sceneCount: Array.isArray(scenes) ? scenes.length : 0 };
    },
    runProduction: async (input) => {
      const { runCreativeProduction } = await import('../production/runner');
      const result = await runCreativeProduction(
        prisma,
        { projectId: input.projectId },
        undefined,
        { creditCeiling: input.creditCeiling } as never,
      );
      return { generated: result.generated, failed: result.failed, status: result.status };
    },
  };
}
