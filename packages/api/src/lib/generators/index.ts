/**
 * Central dispatcher — routes a generation request to the correct provider.
 *
 * Provider map:
 *   NANO_BANANA  → custom API (nanoBanana.ts)
 *   GROK_IMAGINE → xAI REST API (grokImagine.ts)
 *   LTX2         → RunPod Serverless + ComfyUI-LTXVideo (ltx2.ts)
 *   WAN_25       → RunPod Serverless + ComfyUI-GGUF / Wan nodes (wan25.ts)
 *   KLING        → Kuaishou API — placeholder until access granted (placeholders.ts)
 *   HIGGSFIELD   → Higgsfield API — placeholder until access granted (placeholders.ts)
 */

import { submitGeneration as submitNanoBanana, getJobStatus as getNanoBananaStatus } from './nanoBanana';
import { generateVideoFromPrompt as submitGrokImagine } from './grokImagine';
import { submitLTX2, getLTX2Status } from './ltx2';
import { submitWan25, getWan25Status } from './wan25';
import { submitKling, getKlingStatus, submitHighgsfield, getHiggsfieldStatus } from './placeholders';
import { submitVeo3, getVeo3Status } from './veo3';

export type SupportedModel =
  | 'NANO_BANANA'
  | 'GROK_IMAGINE'
  | 'LTX2'
  | 'WAN_25'
  | 'KLING'
  | 'HIGGSFIELD'
  | 'VEO3';

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
  }
}

/** Human-readable metadata for each model — drives the UI model selector */
export const MODEL_META: Record<SupportedModel, {
  label:               string;
  description:         string;
  badge:               'live' | 'beta' | 'coming-soon';
  icon:                string;
  maxDuration:         number; // 0 = image-only
  supportsImageToVideo: boolean;
  provider:            string;
  providerUrl:         string;
}> = {
  NANO_BANANA: {
    label:               'Nano Banana',
    description:         'Fast AI image generation. Great for thumbnails, seed frames, and creative concepts.',
    badge:               'live',
    icon:                '🍌',
    maxDuration:         0,
    supportsImageToVideo: false,
    provider:            'Google Gemini',
    providerUrl:         'https://ai.google.dev',
  },
  GROK_IMAGINE: {
    label:               'Grok Imagine',
    description:         'xAI\'s powerful image generation — creates a stunning seed frame or thumbnail from your prompt.',
    badge:               'live',
    icon:                '✨',
    maxDuration:         0,
    supportsImageToVideo: false,
    provider:            'xAI',
    providerUrl:         'https://x.ai',
  },
  LTX2: {
    label:               'LTX-Video 2',
    description:         'Lightricks\' cinematic video model — real-time generation speeds on RunPod GPU.',
    badge:               'beta',
    icon:                '🎬',
    maxDuration:         10,
    supportsImageToVideo: true,
    provider:            'RunPod + LTX-Video 2',
    providerUrl:         'https://huggingface.co/Lightricks/LTX-Video',
  },
  WAN_25: {
    label:               'Wan 2.5',
    description:         'Alibaba\'s open video model with fine-grained motion control — running on RunPod GPU.',
    badge:               'beta',
    icon:                '🌊',
    maxDuration:         10,
    supportsImageToVideo: true,
    provider:            'RunPod + Wan 2.5',
    providerUrl:         'https://github.com/Wan-Video/Wan2.1',
  },
  KLING: {
    label:               'Kling',
    description:         'Kuaishou\'s hyper-realistic video generation model — API access coming soon.',
    badge:               'coming-soon',
    icon:                '⚡',
    maxDuration:         10,
    supportsImageToVideo: true,
    provider:            'Kuaishou',
    providerUrl:         'https://klingai.kuaishou.com',
  },
  HIGGSFIELD: {
    label:               'Higgsfield',
    description:         'Cinematic, character-consistent video generation — invite-only access coming soon.',
    badge:               'coming-soon',
    icon:                '🎭',
    maxDuration:         10,
    supportsImageToVideo: true,
    provider:            'Higgsfield AI',
    providerUrl:         'https://higgsfield.ai',
  },
  VEO3: {
    label:               'Veo 3',
    description:         'Google\'s most advanced video model — cinematic realism, dialogue, sound effects, and expressive motion.',
    badge:               'live',
    icon:                '🎥',
    maxDuration:         8,
    supportsImageToVideo: false,
    provider:            'Google Gemini',
    providerUrl:         'https://ai.google.dev',
  },
};
