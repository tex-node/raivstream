/**
 * Derived-asset plumbing: a transformation is a NEW TAKE of the slot it came from (2026-11-14).
 *
 * The slot semantics were read before they were chosen. `createNewTake` already models the shape a
 * transformation needs: a new row, `takeNumber = max + 1`, `parentTakeId` = the take it supersedes, a
 * fresh idempotency key that charges normally, and the previous take demoted to `isLatest = false` and
 * kept as history. Restyle, relight and person swap all take one asset and produce one asset in the
 * same slot, so the take model is the right unit - not a new asset category.
 *
 * What was missing, and is added here:
 *   1. **Provenance.** A restyled asset and a generated one were indistinguishable. `producedBy` and
 *      `sourceAssetId` make an asset's origin readable without consulting an operation log.
 *   2. **Duration.** Generation never needed one; every transformation rate is per SECOND, so the
 *      amount is `rate x billed duration`. The duration is established before the charge, never guessed.
 *   3. **The billing rules**, one per operation, pinned by tests.
 */
import type { PrismaClient } from '@raivstream/database';
import { chargeOrThrow, getFeatureCreditCost } from '../../credits';

export type TransformOperation = 'relight' | 'recast' | 'restyle' | 'environment' | 'object';

export interface TransformChargePlan {
  operation: TransformOperation;
  featureKey: string;
  creditsPerSecond: number;
  /** The seconds actually billed - NOT always the output duration. */
  billedSeconds: number;
  credits: number;
  rule: string;
}

/**
 * Billed duration, per operation. Restyle is the one that is not the output duration: the provider
 * bills input + output with a minimum of 2x output, so a 10 s clip bills 20 s. Multiplying restyle's
 * rate by the output duration undercharges by half.
 */
export function billedSeconds(
  operation: TransformOperation,
  outputSeconds: number,
  inputSeconds?: number,
): number {
  if (!Number.isFinite(outputSeconds) || outputSeconds <= 0) {
    throw new Error(`TRANSFORM_DURATION_REQUIRED: ${operation} needs a positive output duration before it can be charged`);
  }
  if (operation === 'restyle') {
    const input = Number.isFinite(inputSeconds) && (inputSeconds as number) > 0 ? (inputSeconds as number) : outputSeconds;
    return Math.max(2 * outputSeconds, input + outputSeconds);
  }
  return outputSeconds;
}

export function transformFeatureKey(operation: TransformOperation, resolution: string): string {
  const tier = resolution.toLowerCase();
  if (operation === 'relight') return `transform:relight:${tier}`;
  if (operation === 'recast') return `transform:recast:${tier}`;
  if (operation === 'restyle') return `transform:restyle:${tier}`;
  return `transform:${operation}:${tier}`;
}

export function transformProvenance(operation: TransformOperation, resolution: string): string {
  return `transform:${operation}:${resolution.toLowerCase()}`;
}

/**
 * Plan the charge. **A missing or inactive rate fails closed** - the seeded-rate contract - rather than
 * charging zero or falling back to a generation rate.
 */
export async function planTransformCharge(
  prisma: PrismaClient,
  input: { operation: TransformOperation; resolution: string; outputSeconds: number; inputSeconds?: number },
): Promise<TransformChargePlan> {
  const featureKey = transformFeatureKey(input.operation, input.resolution);
  const creditsPerSecond = await getFeatureCreditCost(prisma, featureKey);
  if (!creditsPerSecond) {
    throw new Error(`TRANSFORM_RATE_MISSING: no active rate for ${featureKey}`);
  }
  const billed = billedSeconds(input.operation, input.outputSeconds, input.inputSeconds);
  return {
    operation: input.operation,
    featureKey,
    creditsPerSecond,
    billedSeconds: billed,
    credits: creditsPerSecond * billed,
    rule:
      input.operation === 'restyle'
        ? 'per billed second (input + output, minimum 2x output)'
        : 'per output second',
  };
}

export interface TransformDeps {
  /** Renders the derived asset. Injected so the charge and slot logic are testable without a provider. */
  render: (input: { sourceAssetUrl: string; operation: TransformOperation; resolution: string; outputSeconds: number }) => Promise<string>;
}

export interface TransformTakeInput {
  projectId: string;
  sourceAssetId: string;
  operation: TransformOperation;
  resolution: string;
  /** Established BEFORE the call: the asset row carries no duration, so the caller supplies it. */
  outputSeconds: number;
  inputSeconds?: number;
}

export interface TransformTakeResult {
  assetId: string;
  takeNumber: number;
  parentTakeId: string | null;
  producedBy: string;
  sourceAssetId: string;
  creditsCharged: number;
  billedSeconds: number;
  assetUrl: string;
}

export async function deriveTransformTake(
  prisma: PrismaClient,
  deps: TransformDeps,
  input: TransformTakeInput,
): Promise<TransformTakeResult> {
  const source = await prisma.creativeProducedAsset.findUnique({
    where: { id: input.sourceAssetId },
    select: { id: true, projectId: true, sceneId: true, shotId: true, kind: true, assetUrl: true },
  });
  if (!source || source.projectId !== input.projectId) {
    throw new Error(`TRANSFORM_SOURCE_NOT_FOUND: ${input.sourceAssetId}`);
  }
  if (!source.assetUrl) {
    throw new Error(`TRANSFORM_SOURCE_HAS_NO_ASSET: ${input.sourceAssetId}`);
  }

  const owner = await prisma.creativeProject.findUnique({
    where: { id: input.projectId },
    select: { userId: true },
  });
  if (!owner) throw new Error(`CREATIVE_PROJECT_NOT_FOUND: ${input.projectId}`);

  // The charge is planned BEFORE the row exists, so a missing rate fails without leaving a QUEUED row.
  const plan = await planTransformCharge(prisma, {
    operation: input.operation,
    resolution: input.resolution,
    outputSeconds: input.outputSeconds,
    ...(input.inputSeconds !== undefined ? { inputSeconds: input.inputSeconds } : {}),
  });

  const previous = await prisma.creativeProducedAsset.findFirst({
    where: { projectId: input.projectId, sceneId: source.sceneId, shotId: source.shotId ?? null, kind: 'IMAGE' },
    orderBy: [{ takeNumber: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, takeNumber: true },
  });
  const takeNumber = (previous?.takeNumber ?? 0) + 1;

  const row = await prisma.creativeProducedAsset.create({
    data: {
      projectId: input.projectId,
      sceneId: source.sceneId,
      shotId: source.shotId ?? null,
      kind: 'IMAGE',
      status: 'QUEUED',
      takeNumber,
      parentTakeId: previous?.id ?? null,
      isLatest: true,
      producedBy: transformProvenance(input.operation, input.resolution),
      sourceAssetId: source.id,
    },
    select: { id: true },
  });

  const idempotencyKey = `transform-${row.id}-a1`;
  const creditsCharged = await chargeOrThrow(
    prisma,
    owner.userId,
    plan.featureKey,
    idempotencyKey,
    `Transform ${input.operation} @${input.resolution}: ${plan.billedSeconds}s`,
    idempotencyKey,
    { amountCredits: plan.credits },
  );

  try {
    const assetUrl = await deps.render({
      sourceAssetUrl: source.assetUrl,
      operation: input.operation,
      resolution: input.resolution,
      outputSeconds: input.outputSeconds,
    });

    // The previous take is DEMOTED, never deleted: history is the point of a take chain. A reset would
    // replay the charge key and re-bill the provider while recording nothing - assertNotResetAfterCharge
    // refuses that, and a transformation is a new row rather than a reset.
    await prisma.$transaction([
      prisma.creativeProducedAsset.updateMany({
        where: { projectId: input.projectId, sceneId: source.sceneId, shotId: source.shotId ?? null, isLatest: true, id: { not: row.id } },
        data: { isLatest: false },
      }),
      prisma.creativeProducedAsset.update({
        where: { id: row.id },
        data: { status: 'READY', assetUrl },
      }),
    ]);

    return {
      assetId: row.id,
      takeNumber,
      parentTakeId: previous?.id ?? null,
      producedBy: transformProvenance(input.operation, input.resolution),
      sourceAssetId: source.id,
      creditsCharged,
      billedSeconds: plan.billedSeconds,
      assetUrl,
    };
  } catch (error) {
    await prisma.creativeProducedAsset.update({
      where: { id: row.id },
      data: { status: 'FAILED', errorMessage: String((error as Error)?.message ?? error).slice(0, 500) },
    });
    throw error;
  }
}
