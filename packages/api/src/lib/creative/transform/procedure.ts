/**
 * The transform procedure (2026-11-15).
 *
 * Shape follows `creative.director.regenerateShot`: ownership-scoped, budget-aware, and returning a typed
 * result rather than raw rows. Three things it does differently, each because this path spends money:
 *
 *  1. **The duration comes from the source ROW**, not from the caller. The asset carries `durationSeconds`;
 *     when it is null the procedure throws `TRANSFORM_DURATION_REQUIRED` **before** the charge, so no
 *     orphan row and no charge exist for a call that could not be priced honestly.
 *  2. **The ceiling is asserted before the charge** - the director lesson, applied before it costs anything.
 *  3. **Every transform error is typed**: a shape, duration, endpoint or rate failure maps to a
 *     `BAD_REQUEST`/`PRECONDITION_FAILED`-class error with its own code, never a 500.
 */
import { TRPCError } from '@trpc/server';
import type { PrismaClient } from '@raivstream/database';
import { assertWithinCeiling, loadRunBudget } from '../../credits/cap';
import { createRelightRenderer } from './relightRenderer';
import { deriveTransformTake, planTransformCharge, type TransformOperation } from './derivedAsset';

export interface RelightInput {
  projectId: string;
  assetId: string;
  resolution: string;
  /** Optional, and only accepted when it AGREES with nothing - the row's duration always wins. */
  inputSeconds?: number;
  userId: string;
}

export interface RelightResult {
  assetId: string;
  creditsCharged: number;
  billedSeconds: number;
}

/** Map an internal transform failure to a typed tRPC error with its own code. */
export function transformErrorCode(error: unknown): { code: 'BAD_REQUEST' | 'PRECONDITION_FAILED' | 'NOT_FOUND'; message: string } {
  const message = String((error as Error)?.message ?? error);
  if (message.includes('TRANSFORM_DURATION_REQUIRED')) {
    return { code: 'PRECONDITION_FAILED', message: 'This asset has no recorded duration, so the relight cannot be priced.' };
  }
  if (message.includes('TRANSFORM_BODY_INVALID')) {
    return { code: 'BAD_REQUEST', message: 'The relight request is not valid for this endpoint.' };
  }
  if (message.includes('TRANSFORM_ENDPOINT_CONTRACT_UNVERIFIED')) {
    return { code: 'PRECONDITION_FAILED', message: 'The relight endpoint is not configured.' };
  }
  if (message.includes('TRANSFORM_RATE_MISSING')) {
    return { code: 'PRECONDITION_FAILED', message: 'No relight rate is configured for this resolution.' };
  }
  if (message.includes('TRANSFORM_SOURCE_NOT_FOUND')) {
    return { code: 'NOT_FOUND', message: 'That asset is not part of this project.' };
  }
  return { code: 'BAD_REQUEST', message: 'The relight could not be started.' };
}

export async function runRelight(
  prisma: PrismaClient,
  input: RelightInput,
  deps: {
    render?: ReturnType<typeof createRelightRenderer>;
    /** Injected in tests: the real guards are imported functions. */
    loadBudget?: () => Promise<{ ceiling: number | null; spent: number }>;
    assertCeiling?: (input: { runId: string | null; ceiling: number | null | undefined; spent: number; nextCost: number }) => void;
  } = {},
): Promise<RelightResult> {
  const project = await prisma.creativeProject.findFirst({
    where: { id: input.projectId, userId: input.userId },
    select: { id: true },
  });
  if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Creative project not found.' });

  const source = await prisma.creativeProducedAsset.findFirst({
    where: { id: input.assetId, projectId: project.id },
    select: { id: true, durationSeconds: true },
  });
  if (!source) throw new TRPCError({ code: 'NOT_FOUND', message: 'That asset is not part of this project.' });

  const operation: TransformOperation = 'relight';
  try {
    // Duration first: an asset with no recorded length cannot be priced, and must fail before the charge.
    if (!source.durationSeconds) {
      throw new Error('TRANSFORM_DURATION_REQUIRED: the source asset has no durationSeconds');
    }
    const plan = await planTransformCharge(prisma, {
      operation,
      resolution: input.resolution,
      outputSeconds: source.durationSeconds,
      ...(input.inputSeconds !== undefined ? { inputSeconds: input.inputSeconds } : {}),
    });

    // The ceiling is a spend guard, not a formality: a run at its ceiling must refuse before the charge.
    const budget = deps.loadBudget ? await deps.loadBudget() : await loadRunBudget(prisma, null);
    (deps.assertCeiling ?? assertWithinCeiling)({ runId: null, ceiling: budget.ceiling, spent: budget.spent, nextCost: plan.credits });

    const result = await deriveTransformTake(
      prisma,
      { render: deps.render ?? createRelightRenderer() },
      {
        projectId: project.id,
        sourceAssetId: source.id,
        operation,
        resolution: input.resolution,
        outputSeconds: source.durationSeconds,
        ...(input.inputSeconds !== undefined ? { inputSeconds: input.inputSeconds } : {}),
      },
    );

    return { assetId: result.assetId, creditsCharged: result.creditsCharged, billedSeconds: result.billedSeconds };
  } catch (error) {
    const mapped = transformErrorCode(error);
    throw new TRPCError({ code: mapped.code, message: mapped.message, cause: error as Error });
  }
}
