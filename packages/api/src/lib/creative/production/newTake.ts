/**
 * New-take path for creative production (2026-11-03).
 *
 * `produce()` reuses any asset that is already `READY`, so a produced scene is frozen: there
 * was no way to render it again. Resetting the row is refused by `assertNotResetAfterCharge`
 * because the reset replays the charge idempotency key (provider billed, ledger unchanged).
 *
 * A take is the legitimate route: a NEW row, takeNumber = max + 1, parentTakeId = the take it
 * supersedes, a fresh idempotency key that charges normally, and the previous take demoted to
 * `isLatest = false` and kept as history.
 */
import type { PrismaClient } from '@raivstream/database';
import { chargeOrThrow, MODEL_FEATURE_KEY } from '../../credits';
import { applyIdentityFraming, composeCreativeIdentityBlock, resolveCreativeReferences, type CreativeCharacterRef } from './identityBlock';
import { generateStill } from './generationAdapter';
import type { StillSpec } from './capabilityRouter';

export interface NewTakeInput {
  projectId: string;
  sceneId: string;
  characters: CreativeCharacterRef[];
  scenePrompt: string;
  wideShotRequired?: boolean;
}

export interface NewTakeResult {
  assetId: string;
  takeNumber: number;
  parentTakeId: string | null;
  assetUrl: string;
  identityBlock: string;
  framing: string;
  promptsFramed: boolean;
  creditsCharged: number;
}

export async function createNewTake(prisma: PrismaClient, input: NewTakeInput): Promise<NewTakeResult> {
  const previous = await prisma.creativeProducedAsset.findFirst({
    where: { projectId: input.projectId, sceneId: input.sceneId, kind: 'IMAGE' },
    orderBy: [{ takeNumber: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, takeNumber: true },
  });

  const takeNumber = (previous?.takeNumber ?? 0) + 1;

  const owner = await prisma.creativeProject.findUnique({
    where: { id: input.projectId },
    select: { userId: true },
  });
  if (!owner) throw new Error(`CREATIVE_PROJECT_NOT_FOUND: ${input.projectId}`);

  // Charge BEFORE the render, on the new row's own key. A fresh row means a fresh key, so
  // this charges exactly once per take (the reset path was the replay).
  const framing = applyIdentityFraming(input.scenePrompt, {
    characters: input.characters,
    wideShotRequired: Boolean(input.wideShotRequired),
  });
  const identityBlock = composeCreativeIdentityBlock(input.characters);
  const prompt = identityBlock ? `${framing.prompt}\n\nCHARACTER IDENTITY (must be preserved exactly):\n${identityBlock}` : framing.prompt;
  const referenceImageUrls = await resolveCreativeReferences(prisma, input.characters);

  const row = await prisma.creativeProducedAsset.create({
    data: {
      projectId: input.projectId,
      sceneId: input.sceneId,
      kind: 'IMAGE',
      status: 'QUEUED',
      takeNumber,
      parentTakeId: previous?.id ?? null,
      isLatest: true,
    },
    select: { id: true },
  });

  // No `.catch(() => 0)`: a take that cannot charge must fail, not report zero. The previous
  // version swallowed the throw and reported creditsCharged=0 as if it were an outcome.
  const creditsCharged = await chargeOrThrow(
    prisma,
    owner.userId,
    MODEL_FEATURE_KEY.FLUX2,
    `creative-take-${row.id}-a1`,
    `Creative take: ${input.sceneId} image`,
    `creative-take-${row.id}-a1`,
  );

  try {
    const media = await generateStill(
      {
        kind: 'IMAGE',
        sceneId: input.sceneId,
        prompt,
        negativePrompt: 'text, watermark, extra limbs',
        aspectRatio: '9:16',
        ...(referenceImageUrls.length ? { referenceImageUrls } : {}),
      } as StillSpec,
      input.projectId,
      `take-${takeNumber}`,
    );

    await prisma.creativeProducedAsset.update({
      where: { id: row.id },
      data: { status: 'READY', assetUrl: media.assetUrl },
    });

    // Demote, never delete: the superseded take stays as history.
    if (previous) {
      await prisma.creativeProducedAsset.update({
        where: { id: previous.id },
        data: { isLatest: false },
      });
    }

    return {
      assetId: row.id,
      takeNumber,
      parentTakeId: previous?.id ?? null,
      assetUrl: media.assetUrl,
      identityBlock,
      framing: framing.reason,
      promptsFramed: framing.applied,
      creditsCharged,
    };
  } catch (error) {
    await prisma.creativeProducedAsset.update({
      where: { id: row.id },
      data: { status: 'FAILED', errorMessage: String((error as Error)?.message ?? error).slice(0, 500) },
    });
    throw error;
  }
}