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
  const model: SupportedModel = spec.sourceImageUrl ? 'FLUX_KONTEXT' : 'FLUX2';
  const submitted = await submitGenerationJob({
    model,
    prompt: spec.prompt,
    negativePrompt: spec.negativePrompt,
    aspectRatio: spec.aspectRatio as '9:16' | '16:9' | '1:1' | '4:3' | '3:4',
    ...(spec.sourceImageUrl ? { seedImageUrl: spec.sourceImageUrl } : {}),
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