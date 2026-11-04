/**
 * Raivstream 5.0 — GenerationAdapter (Slice 3).
 *
 * The ONLY place the 5.0 layer touches existing generation infrastructure:
 * submitGenerationJob / pollJobStatus (lib/generators), R2 mirroring, and
 * last-frame extraction. Everything above this file deals in creative intent;
 * everything below is production machinery.
 */

import { submitGenerationJob, pollJobStatus, type SupportedModel } from '../../generators';
import { mirrorUrlToR2, uploadBufferToR2 } from '../../r2';
import { extractLastFrameAsSeedImage } from '../../lastFrameExtract';
import { moderatePrompt, moderationRejectMessage } from '../../promptModeration';
import { CreativeError } from '../shared/errors';
import { createHash } from 'node:crypto';
import { IDENTITY_FRAMING } from './identityBlock';
import type { StillSpec, VideoSpec } from './capabilityRouter';

export interface GeneratedMedia {
  assetUrl: string;
  thumbnailUrl?: string;
}

/**
 * Safety boundary: every creative generation is moderated before it reaches the
 * provider. This is the guarantee that the 5.0 semantic layer can never bypass
 * the existing moderation architecture — moderation lives at the lowest boundary
 * (the adapter), not in the UI. A rejection is a typed CONTENT_REJECTED error so
 * the runner fails that asset (smallest scope) and never retries it.
 */
async function assertPromptAllowed(prompt: string, negativePrompt?: string): Promise<void> {
  const moderation = await moderatePrompt(prompt);
  if (!moderation.allowed) {
    throw new CreativeError('CONTENT_REJECTED', moderationRejectMessage(moderation, 'This content violates our guidelines.'));
  }
  if (negativePrompt) {
    const negative = await moderatePrompt(negativePrompt);
    if (!negative.allowed) {
      throw new CreativeError('CONTENT_REJECTED', moderationRejectMessage(negative, 'This content violates our guidelines.'));
    }
  }
}

async function waitForOutput(model: SupportedModel, providerJobId: string, immediateUrl?: string): Promise<string> {
  if (immediateUrl) return immediateUrl;
  const started = Date.now();
  const timeoutMs = 180_000;
  while (Date.now() - started < timeoutMs) {
    const status = await pollJobStatus(model, providerJobId);
    if (status.status === 'completed' && status.outputUrl) return status.outputUrl;
    if (status.status === 'failed') throw new Error(status.error?.message ?? 'Generation failed');
    if (status.status === 'cancelled') throw new Error(status.error?.message ?? 'Generation was cancelled');
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error('Generation is taking longer than expected. Please try again.');
}

async function persist(url: string, key: string, contentType: string): Promise<string> {
  if (url.startsWith('data:')) {
    return (await uploadBufferToR2(Buffer.from(url.split(',')[1] ?? '', 'base64'), key, contentType)) ?? url;
  }
  return mirrorUrlToR2(url, key, contentType);
}

/**
 * Generate a still.
 *
 * When spec.sourceImageUrl is present: uses FLUX Kontext (image-conditioned) so
 * the subject identity from the uploaded product photo is preserved in the output.
 * When absent: falls back to FLUX2 (text-to-image).
 *
 * Provider is chosen internally and never exposed to callers.
 */
export async function generateStill(spec: StillSpec, projectId: string, assetId: string): Promise<GeneratedMedia> {
  await assertPromptAllowed(spec.prompt, spec.negativePrompt);

  // Three-way routing, and the ORDER matters:
  //   1. character references  -> FLUX2_EDIT (multi-reference, max 4). This is the only
  //      path that can hold a character across scenes, and it is why the creative
  //      pipeline could never clear the identity floor: it had no references at all.
  //   2. a single source photo -> FLUX_KONTEXT (subject preserved from one image).
  //   3. neither                -> FLUX2 (text-to-image). Must keep working: the edit
  //      endpoint requires at least one reference, so a scene with no character has to
  //      fall through rather than fail.
  const referenceImageUrls = (spec.referenceImageUrls ?? []).filter((url) => typeof url === 'string' && url.length > 0).slice(0, 4);
  const hasReferences = referenceImageUrls.length > 0;

  // CALL-SITE INSTRUMENT (2026-11-04).
  //
  // `characterRefs` is the SEMANTIC list (names + descriptions); `referenceImageUrls` is the
  // RESOLVED list the provider actually receives. Only the runner resolves one into the other.
  // A caller that passes the semantic list and no URLs gets a silent text-to-image render - the
  // `references=0` line that took two sessions to attribute. The two counts are logged together
  // so the mismatch is visible at the moment the request is built.
  const characterRefCount = ((spec as { characterRefs?: unknown[] }).characterRefs ?? []).length;
  console.info(
    `[creative.spec] scene=${spec.sceneId} semanticRefs=${characterRefCount} resolvedRefs=${referenceImageUrls.length}` +
      `${characterRefCount > 0 && referenceImageUrls.length === 0 ? ' MISMATCH=char_refs_unresolved' : ''}`,
  );
  const model: SupportedModel = hasReferences ? 'FLUX2_EDIT' : spec.sourceImageUrl ? 'FLUX_KONTEXT' : 'FLUX2';

  // PROOF POINT: composed != sent. This reads the ACTUAL payload that goes to the
  // provider, so "the phrase was composed" and "the phrase reached the request" can be
  // told apart - the ambiguity that made the previous two attempts unevaluable.
  const promptHash = createHash('sha256').update(spec.prompt).digest('hex').slice(0, 12);
  console.info(
    `[creative.framing] scene=${spec.sceneId} framingInPrompt=${spec.prompt.includes(IDENTITY_FRAMING)} references=${referenceImageUrls.length} promptHash=${promptHash}`,
  );

  const submitted = await submitGenerationJob({
    model,
    prompt: spec.prompt,
    negativePrompt: spec.negativePrompt,
    aspectRatio: spec.aspectRatio as '9:16' | '16:9' | '1:1' | '4:3' | '3:4',
    ...(hasReferences ? { imageUrls: referenceImageUrls } : {}),
    ...(!hasReferences && spec.sourceImageUrl ? { seedImageUrl: spec.sourceImageUrl } : {}),
  });
  const outputUrl = await waitForOutput(model, submitted.providerJobId, submitted.outputUrl);
  const r2Key = `creative/${projectId}/scenes/${spec.sceneId}/still-${assetId}.png`;
  const assetUrl = await persist(outputUrl, r2Key, 'image/png');
  return { assetUrl, thumbnailUrl: assetUrl };
}

/** Generate a scene video (MiniMax H3 I2V). Provider chosen internally. */
export async function generateVideo(spec: VideoSpec, projectId: string, assetId: string, seedImageUrl?: string): Promise<GeneratedMedia> {
  await assertPromptAllowed(spec.prompt);
  const submitted = await submitGenerationJob({
    model: 'H3_MAX' as SupportedModel,
    prompt: spec.prompt,
    duration: spec.durationSeconds,
    aspectRatio: spec.aspectRatio as '9:16' | '16:9' | '1:1' | '4:3' | '3:4',
    seedImageUrl,
    resolution: spec.resolution,
  });
  const outputUrl = await waitForOutput('H3_MAX' as SupportedModel, submitted.providerJobId, submitted.outputUrl);
  const r2Key = `creative/${projectId}/scenes/${spec.sceneId}/clip-${assetId}.mp4`;
  const assetUrl = await persist(outputUrl, r2Key, 'video/mp4');
  return { assetUrl };
}

/** Last-frame continuity component (reuses the existing extractor). */
export function extractLastFrame(videoUrl: string, keyPrefix: string): Promise<string | null> {
  return extractLastFrameAsSeedImage(videoUrl, keyPrefix);
}