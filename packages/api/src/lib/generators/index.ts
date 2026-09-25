/**
 * Central dispatcher — routes a generation request to the correct provider.
 *
 * Provider map:
 *   NANO_BANANA   → custom API (nanoBanana.ts)
 *   GROK_IMAGINE  → xAI REST API (grokImagine.ts)
 *   LTX2          → RunPod Serverless + ComfyUI-LTXVideo (ltx2.ts)
 *   WAN_25        → RunPod Serverless + ComfyUI-GGUF / Wan nodes (wan25.ts)
 *   KLING         → Kuaishou API — placeholder until access granted (placeholders.ts)
 *   HIGGSFIELD    → Higgsfield API — placeholder until access granted (placeholders.ts)
 *   FLUX          → RunPod Serverless + ComfyUI Flux.1 (flux.ts)
 *   HUNYUAN_VIDEO → RunPod Serverless + ComfyUI HunyuanVideoWrapper (hunyuanVideo.ts)
 *   COG_VIDEO_X   → RunPod Serverless + ComfyUI CogVideoX (cogVideoX.ts)
 *   SEEDANCE      → RunPod Serverless + ComfyUI Seedance 1.0 (seedance.ts)
 */

import { submitGeneration as submitNanoBanana, getJobStatus as getNanoBananaStatus } from './nanoBanana';
import { generateVideoFromPrompt as submitGrokImagine } from './grokImagine';
import { submitLTX2, getLTX2Status } from './ltx2';
import { submitWan25, getWan25Status } from './wan25';
import { submitKlingI2V, getKlingI2VStatus, submitKlingR2V, getKlingR2VStatus } from './kling';
import { submitHighgsfield, getHiggsfieldStatus } from './placeholders';
import { submitVeo3, getVeo3Status } from './veo3';
import { submitFlux, getFluxStatus } from './flux';
import { submitHunyuanVideo, getHunyuanVideoStatus } from './hunyuanVideo';
import { submitCogVideoX, getCogVideoXStatus } from './cogVideoX';
import { submitSeedance, getSeedanceStatus } from './seedance';
import { submitFalFlux2, getFalFlux2Status, cancelFalFlux2 } from './falFlux2';
import { submitFalKontext, getFalKontextStatus, cancelFalKontext } from './falKontext';
import { submitFalH3Max, getFalH3MaxStatus, cancelFalH3Max } from './falH3Max';
import { submitFalVeed, getFalVeedStatus, cancelFalVeed } from './falVeed';
import type { GenerationJobError, GenerationJobState } from './jobModel';
import { getDefaultProviderLimiter, providerIdForModel } from './providerRateLimit';
import { MediaProviderError } from '../mediaProviders';

export { MAX_JOB_RETRIES } from './jobModel';

export type SupportedModel =
  | 'NANO_BANANA'
  | 'GROK_IMAGINE'
  | 'LTX2'
  | 'WAN_25'
  | 'KLING_I2V'
  | 'KLING_R2V'
  | 'HIGGSFIELD'
  | 'VEO3'
  | 'FLUX'
  | 'HUNYUAN_VIDEO'
  | 'COG_VIDEO_X'
  | 'SEEDANCE'
  | 'FLUX2'
  | 'FLUX_KONTEXT'
  | 'H3_MAX'
  | 'VEED_FABRIC';

export interface GenerateInput {
  model:          SupportedModel;
  prompt:         string;
  negativePrompt?: string;
  duration?:      number;
  aspectRatio?:   string;
  seedImageUrl?:  string;
  audioUrl?:      string; // VEED Fabric lip-sync audio track
  resolution?:    string; // MiniMax H3 output resolution preset ('480p'|'720p'|'768p'|'1080p')
}

export interface GenerateResult {
  /** External job ID to store in DB for status polling */
  providerJobId: string;
  /** Set immediately when the model is synchronous (Grok Imagine) */
  outputUrl?:    string;
  thumbnailUrl?: string;
}

/** Submit a new generation job to the appropriate provider */
export async function submitGenerationJob(input: GenerateInput): Promise<GenerateResult> {
  // Phase 15 — per-provider backpressure. Rejects (retryable) when a provider
  // is at its concurrency cap or being hit too fast. Unlimited by default.
  const provider = providerIdForModel(input.model);
  const lease = getDefaultProviderLimiter().tryAcquire(provider);
  if (!lease.ok) {
    throw new MediaProviderError('RATE_LIMITED', `Provider ${provider} is busy: ${lease.reason}`, { retryable: true });
  }
  try {
    return await dispatchSubmitGenerationJob(input);
  } finally {
    lease.release();
  }
}

async function dispatchSubmitGenerationJob(input: GenerateInput): Promise<GenerateResult> {
  switch (input.model) {

    case 'NANO_BANANA': {
      const jobId = await submitNanoBanana(input);
      return { providerJobId: jobId };
    }

    case 'GROK_IMAGINE': {
      const result = await submitGrokImagine(input);
      return {
        providerJobId: result.jobId,
        thumbnailUrl:  result.thumbnailUrl,
        outputUrl:     result.thumbnailUrl, // image-only until video endpoint is live
      };
    }

    case 'LTX2': {
      const jobId = await submitLTX2(input);
      return { providerJobId: jobId };
    }

    case 'WAN_25': {
      const jobId = await submitWan25(input);
      return { providerJobId: jobId };
    }

    case 'KLING_I2V': {
      const jobId = await submitKlingI2V(input);
      return { providerJobId: jobId };
    }

    case 'KLING_R2V': {
      const jobId = await submitKlingR2V(input);
      return { providerJobId: jobId };
    }

    case 'HIGGSFIELD': {
      const jobId = await submitHighgsfield(input);
      return { providerJobId: jobId };
    }

    case 'VEO3': {
      const operationName = await submitVeo3(input);
      return { providerJobId: operationName };
    }

    case 'FLUX': {
      const jobId = await submitFlux(input);
      return { providerJobId: jobId };
    }

    case 'HUNYUAN_VIDEO': {
      const jobId = await submitHunyuanVideo(input);
      return { providerJobId: jobId };
    }

    case 'COG_VIDEO_X': {
      const jobId = await submitCogVideoX(input);
      return { providerJobId: jobId };
    }

    case 'SEEDANCE': {
      const jobId = await submitSeedance(input);
      return { providerJobId: jobId };
    }

    case 'FLUX2': {
      const jobId = await submitFalFlux2({
        prompt:       input.prompt,
        aspectRatio:  input.aspectRatio,
        seed:         undefined,
      });
      return { providerJobId: jobId };
    }

    case 'FLUX_KONTEXT': {
      const jobId = await submitFalKontext({
        prompt:          input.prompt,
        sourceImageUrl:  input.seedImageUrl!,
        aspectRatio:     input.aspectRatio,
        seed:            undefined,
      });
      return { providerJobId: jobId };
    }

    case 'H3_MAX': {
      const jobId = await submitFalH3Max({
        prompt:        input.prompt,
        seedImageUrl:  input.seedImageUrl,
        duration:      input.duration,
        resolution:    input.resolution,
      });
      return { providerJobId: jobId };
    }

    case 'VEED_FABRIC': {
      const jobId = await submitFalVeed({
        imageUrl: input.seedImageUrl!,
        audioUrl: input.audioUrl!,
        resolution: '480p',
      });
      return { providerJobId: jobId };
    }
  }
}

export interface JobStatusResult {
  status:     GenerationJobState;
  outputUrl?: string;
  error?:     GenerationJobError;
}

/** Poll the status of a previously submitted job */
export async function pollJobStatus(
  model: SupportedModel,
  providerJobId: string
): Promise<JobStatusResult> {
  switch (model) {

    case 'NANO_BANANA': {
      const s = await getNanoBananaStatus(providerJobId);
      return { status: s.status, outputUrl: s.outputUrl, error: s.error ?? undefined };
    }

    case 'GROK_IMAGINE':
      // Synchronous — job is always complete if we have a providerJobId
      return { status: 'completed' };

    case 'LTX2': {
      const s = await getLTX2Status(providerJobId);
      return { status: s.status, outputUrl: s.outputUrl, error: s.error };
    }

    case 'WAN_25': {
      const s = await getWan25Status(providerJobId);
      return { status: s.status, outputUrl: s.outputUrl, error: s.error };
    }

    case 'KLING_I2V': {
      const s = await getKlingI2VStatus(providerJobId);
      return { status: s.status, outputUrl: s.outputUrl, error: s.error };
    }

    case 'KLING_R2V': {
      const s = await getKlingR2VStatus(providerJobId);
      return { status: s.status, outputUrl: s.outputUrl, error: s.error };
    }

    case 'HIGGSFIELD': {
      const s = await getHiggsfieldStatus(providerJobId);
      return { status: s.status as JobStatusResult['status'], outputUrl: s.outputUrl };
    }

    case 'VEO3': {
      const s = await getVeo3Status(providerJobId);
      return { status: s.status, outputUrl: s.outputUrl, error: s.error };
    }

    case 'FLUX': {
      const s = await getFluxStatus(providerJobId);
      return { status: s.status, outputUrl: s.outputUrl, error: s.error };
    }

    case 'HUNYUAN_VIDEO': {
      const s = await getHunyuanVideoStatus(providerJobId);
      return { status: s.status, outputUrl: s.outputUrl, error: s.error };
    }

    case 'COG_VIDEO_X': {
      const s = await getCogVideoXStatus(providerJobId);
      return { status: s.status, outputUrl: s.outputUrl, error: s.error };
    }

    case 'SEEDANCE': {
      const s = await getSeedanceStatus(providerJobId);
      return { status: s.status, outputUrl: s.outputUrl, error: s.error };
    }

    case 'FLUX2': {
      const s = await getFalFlux2Status(providerJobId);
      return { status: s.status, outputUrl: s.outputUrl, error: s.error };
    }

    case 'FLUX_KONTEXT': {
      const s = await getFalKontextStatus(providerJobId);
      return { status: s.status, outputUrl: s.outputUrl, error: s.error };
    }

    case 'H3_MAX': {
      const s = await getFalH3MaxStatus(providerJobId);
      return { status: s.status, outputUrl: s.outputUrl, error: s.error };
    }

    case 'VEED_FABRIC': {
      const s = await getFalVeedStatus(providerJobId);
      return { status: s.status, outputUrl: s.outputUrl, error: s.error };
    }
  }
}

/**
 * Best-effort provider-side cancellation for a running job. Returns true when a
 * provider cancel was issued. Legacy providers (RunPod public endpoints, xAI,
 * Kling, Gemini) return false — they either have no client-side cancel or are
 * not wired here; the local GenerationJob is still marked CANCELLED by the
 * caller regardless.
 */
export async function cancelProviderJob(model: SupportedModel, providerJobId: string): Promise<boolean> {
  switch (model) {
    case 'FLUX2':
      return cancelFalFlux2(providerJobId);
    case 'FLUX_KONTEXT':
      return cancelFalKontext(providerJobId);
    case 'H3_MAX':
      return cancelFalH3Max(providerJobId);
    case 'VEED_FABRIC':
      return cancelFalVeed(providerJobId);
    default:
      return false;
  }
}

/** Human-readable metadata for each model — drives the UI model selector */
export const MODEL_META: Record<SupportedModel, {
  label:                string;
  description:          string;
  badge:                'live' | 'beta' | 'coming-soon';
  icon:                 string;
  minDuration:          number; // minimum seconds (for UI slider)
  maxDuration:          number; // 0 = image-only
  supportsImageToVideo: boolean;
  provider:             string;
  providerUrl:          string;
  mediaType:            'image' | 'video';
  hidden?:              true;       // hide from UI entirely
  requiresSeedImage?:   true;       // model requires a seed image (I2V only)
}> = {
  NANO_BANANA: {
    label:                'Nano Banana',
    description:          'Fast AI image generation via Google Gemini.',
    badge:                'live',
    icon:                 '🍌',
    minDuration:          0,
    maxDuration:          0,
    supportsImageToVideo: false,
    provider:             'Google Gemini',
    providerUrl:          'https://ai.google.dev',
    mediaType:            'image',
    hidden:               true,
  },
  GROK_IMAGINE: {
    label:                'Grok Imagine',
    description:          'xAI\'s image generation — photorealistic quality from a single prompt.',
    badge:                'live',
    icon:                 '✨',
    minDuration:          0,
    maxDuration:          0,
    supportsImageToVideo: false,
    provider:             'xAI',
    providerUrl:          'https://x.ai',
    mediaType:            'image',
  },
  LTX2: {
    label:                'LTX-Video 2',
    description:          'Lightricks\' cinematic video model — real-time generation speeds on RunPod GPU.',
    badge:                'beta',
    icon:                 '🎬',
    minDuration:          1,
    maxDuration:          10,
    supportsImageToVideo: true,
    provider:             'RunPod + LTX-Video 2',
    providerUrl:          'https://huggingface.co/Lightricks/LTX-Video',
    mediaType:            'video',
    hidden:               true,
  },
  WAN_25: {
    label:                'Wan 2.6',
    description:          'Alibaba\'s latest video model — text-to-video or image-to-video. Add a seed image to animate it, or leave blank for T2V.',
    badge:                'live',
    icon:                 '🌊',
    minDuration:          1,
    maxDuration:          15,
    supportsImageToVideo: true,
    provider:             'RunPod Public · Wan 2.6',
    providerUrl:          'https://docs.runpod.io/public-endpoints/models/wan-2-6-t2v',
    mediaType:            'video',
  },
  KLING_I2V: {
    label:                'Kling I2V',
    description:          'Kuaishou Kling image-to-video — your image becomes the opening frame, extended into hyper-realistic motion.',
    badge:                'live',
    icon:                 '⚡',
    minDuration:          5,
    maxDuration:          10,
    supportsImageToVideo: true,
    requiresSeedImage:    true,
    provider:             'Kuaishou Kling',
    providerUrl:          'https://klingai.com',
    mediaType:            'video',
  },
  KLING_R2V: {
    label:                'Kling R2V',
    description:          'Kling reference-to-video — attach a reference image to guide style and subject while text drives the scene.',
    badge:                'live',
    icon:                 '🎞️',
    minDuration:          5,
    maxDuration:          10,
    supportsImageToVideo: true,
    provider:             'Kuaishou Kling',
    providerUrl:          'https://klingai.com',
    mediaType:            'video',
  },
  HIGGSFIELD: {
    label:                'Higgsfield',
    description:          'Cinematic, character-consistent video generation — coming soon.',
    badge:                'coming-soon',
    icon:                 '🎭',
    minDuration:          1,
    maxDuration:          10,
    supportsImageToVideo: true,
    provider:             'Higgsfield AI',
    providerUrl:          'https://higgsfield.ai',
    mediaType:            'video',
  },
  VEO3: {
    label:                'Veo 3',
    description:          'Google\'s cinematic video model with dialogue and sound effects.',
    badge:                'live',
    icon:                 '🎥',
    minDuration:          4,
    maxDuration:          8,
    supportsImageToVideo: false,
    provider:             'Google Gemini',
    providerUrl:          'https://ai.google.dev',
    mediaType:            'video',
    hidden:               true,
  },
  FLUX: {
    label:                'Flux.1 Dev',
    description:          'Black Forest Labs\' state-of-the-art image model — photorealistic quality via RunPod public endpoint.',
    badge:                'live',
    icon:                 '⚡',
    minDuration:          0,
    maxDuration:          0,
    supportsImageToVideo: false,
    provider:             'RunPod Public · Flux.1 Dev',
    providerUrl:          'https://docs.runpod.io/public-endpoints/models/flux-1-dev',
    mediaType:            'image',
  },
  HUNYUAN_VIDEO: {
    label:                'HunyuanVideo',
    description:          'Tencent\'s open-source video model — high-fidelity motion, 720p output on A100 GPU.',
    badge:                'beta',
    icon:                 '🐉',
    minDuration:          1,
    maxDuration:          8,
    supportsImageToVideo: false,
    provider:             'RunPod + HunyuanVideo',
    providerUrl:          'https://github.com/Tencent/HunyuanVideo',
    mediaType:            'video',
  },
  COG_VIDEO_X: {
    label:                'CogVideoX',
    description:          'Zhipu AI\'s video model — smooth motion and strong prompt following on RunPod GPU.',
    badge:                'beta',
    icon:                 '🧠',
    minDuration:          1,
    maxDuration:          6,
    supportsImageToVideo: false,
    provider:             'RunPod + CogVideoX',
    providerUrl:          'https://github.com/THUDM/CogVideo',
    mediaType:            'video',
    hidden:               true,
  },
  SEEDANCE: {
    label:                'Seedance 1.5 Pro',
    description:          'ByteDance\'s latest I2V model — animate any image with realistic motion, optional audio synthesis, and camera control.',
    badge:                'live',
    icon:                 '🌱',
    minDuration:          4,
    maxDuration:          12,
    supportsImageToVideo: true,
    requiresSeedImage:    true,
    provider:             'RunPod Public · Seedance 1.5 Pro I2V',
    providerUrl:          'https://docs.runpod.io/public-endpoints/models/seedance-1-5-pro',
    mediaType:            'video',
  },
  FLUX2: {
    label:                'Flux 2',
    description:          'Black Forest Labs\' Flux.2 text-to-image on fal.ai — photorealistic, fast, serverless.',
    badge:                'live',
    icon:                 '🎨',
    minDuration:          0,
    maxDuration:          0,
    supportsImageToVideo: false,
    provider:             'fal.ai · FLUX.2',
    providerUrl:          'https://fal.ai/models/fal-ai/flux-2',
    mediaType:            'image',
  },
  FLUX_KONTEXT: {
    label:                'FLUX Kontext',
    description:          'FLUX Pro Kontext — image-conditioned generation. Your product photo drives subject identity; the prompt drives the scene.',
    badge:                'live',
    icon:                 '🖼️',
    minDuration:          0,
    maxDuration:          0,
    supportsImageToVideo: false,
    provider:             'fal.ai · FLUX Pro Kontext',
    providerUrl:          'https://fal.ai/models/fal-ai/flux-pro/kontext',
    mediaType:            'image',
    hidden:               true,
  },
  H3_MAX: {
    label:                'MiniMax H3-Max Turbo',
    description:          'MiniMax H3-Max Turbo image-to-video on fal.ai — fast, cost-efficient animation from a seed image. Native synchronized audio/SFX during inference.',
    badge:                'live',
    icon:                 '🌀',
    minDuration:          4,
    maxDuration:          15,
    supportsImageToVideo: true,
    requiresSeedImage:    true,
    provider:             'fal.ai · MiniMax H3-Max Turbo',
    providerUrl:          'https://fal.ai/models/minimax/h3-max-turbo/image-to-video',
    mediaType:            'video',
  },
  VEED_FABRIC: {
    label:                'VEED Fabric',
    description:          'VEED Fabric 1.0 talking-video on fal.ai — lip-sync a presenter image to an audio track.',
    badge:                'live',
    icon:                 '🗣️',
    minDuration:          0,
    maxDuration:          0,
    supportsImageToVideo: false,
    provider:             'fal.ai · VEED Fabric 1.0',
    providerUrl:          'https://fal.ai/models/veed/fabric-1.0',
    mediaType:            'video',
    hidden:               true, // UGC consent/ownership/moderation controls not yet implemented
  },
};
