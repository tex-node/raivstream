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
import { submitKling, getKlingStatus, submitHighgsfield, getHiggsfieldStatus } from './placeholders';
import { submitVeo3, getVeo3Status } from './veo3';
import { submitFlux, getFluxStatus } from './flux';
import { submitHunyuanVideo, getHunyuanVideoStatus } from './hunyuanVideo';
import { submitCogVideoX, getCogVideoXStatus } from './cogVideoX';
import { submitSeedance, getSeedanceStatus } from './seedance';

export type SupportedModel =
  | 'NANO_BANANA'
  | 'GROK_IMAGINE'
  | 'LTX2'
  | 'WAN_25'
  | 'KLING'
  | 'HIGGSFIELD'
  | 'VEO3'
  | 'FLUX'
  | 'HUNYUAN_VIDEO'
  | 'COG_VIDEO_X'
  | 'SEEDANCE';

export interface GenerateInput {
  model:          SupportedModel;
  prompt:         string;
  negativePrompt?: string;
  duration?:      number;
  aspectRatio?:   string;
  seedImageUrl?:  string;
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

    case 'KLING': {
      const jobId = await submitKling(input);
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
  }
}

export interface JobStatusResult {
  status:     'queued' | 'generating' | 'completed' | 'failed';
  outputUrl?: string;
  error?:     string;
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

    case 'KLING': {
      const s = await getKlingStatus(providerJobId);
      return { status: s.status as JobStatusResult['status'], outputUrl: s.outputUrl };
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
    label:                'Wan 2.5',
    description:          'Alibaba\'s image-to-video model — fluid motion from a seed image. Requires a seed image URL.',
    badge:                'beta',
    icon:                 '🌊',
    minDuration:          1,
    maxDuration:          10,
    supportsImageToVideo: true,
    provider:             'RunPod Public · Wan 2.5',
    providerUrl:          'https://docs.runpod.io/public-endpoints/models/wan-2-5',
    mediaType:            'video',
    requiresSeedImage:    true,
  },
  KLING: {
    label:                'Kling',
    description:          'Kuaishou\'s hyper-realistic video generation — coming soon.',
    badge:                'coming-soon',
    icon:                 '⚡',
    minDuration:          1,
    maxDuration:          10,
    supportsImageToVideo: true,
    provider:             'Kuaishou',
    providerUrl:          'https://klingai.kuaishou.com',
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
    label:                'Seedance 1.0',
    description:          'ByteDance\'s high-quality video model — text-to-video and image-to-video via RunPod public endpoint.',
    badge:                'live',
    icon:                 '🌱',
    minDuration:          1,
    maxDuration:          10,
    supportsImageToVideo: true,
    provider:             'RunPod Public · Seedance 1.0 Pro',
    providerUrl:          'https://docs.runpod.io/public-endpoints/models/seedance-1-pro',
    mediaType:            'video',
  },
};
