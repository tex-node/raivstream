/**
 * Wan 2.5 (Alibaba) — via RunPod Serverless Endpoint
 *
 * Deployment guide:
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Create (or reuse) a Network Volume (~60 GB, SSD).
 *    Mount path: /runpod-volume
 *
 * 2. Deploy a ComfyUI pod template and attach the Network Volume.
 *    Place model files on the volume:
 *      /runpod-volume/models/unet/wan2.1-t2v-14b-q4_k_m.gguf      ← recommended for 24 GB GPU
 *      /runpod-volume/models/unet/wan2.1-t2v-1.3b-fp16.safetensors ← lighter alternative
 *      /runpod-volume/models/text_encoders/umt5-xxl-encoder-q8_0.gguf
 *      /runpod-volume/models/vae/wan_2.1_vae.safetensors
 *    Install custom nodes:
 *      ComfyUI-GGUF  (https://github.com/city96/ComfyUI-GGUF)
 *      ComfyUI-VideoHelperSuite
 *
 * 3. Convert to Serverless Endpoint:
 *    RunPod Dashboard → Serverless → Deploy Endpoint.
 *    Recommended GPU: RTX 4090 (24 GB) or A6000 (48 GB).
 *    Idle Timeout: 15 min (saves cost between user requests).
 *    FlashBoot: enabled (cold-start < 2 s).
 *
 * 4. Set env vars:
 *    RUNPOD_WAN25_ENDPOINT_ID=your_endpoint_id
 *    RUNPOD_API_KEY=your_api_key
 *
 * Mode configuration:
 *    RUNPOD_WAN25_MODE=comfyui   (default)
 *    RUNPOD_WAN25_MODE=handler
 *
 * Required env vars:
 *   RUNPOD_API_KEY
 *   RUNPOD_WAN25_ENDPOINT_ID
 *
 * Optional:
 *   RUNPOD_WAN25_MODE            comfyui | handler          (default: comfyui)
 *   RUNPOD_WAN25_UNET            GGUF or safetensors name   (default: wan2.1-t2v-14b-q4_k_m.gguf)
 *   RUNPOD_WAN25_TEXT_ENCODER    text encoder filename      (default: umt5-xxl-encoder-q8_0.gguf)
 *   RUNPOD_WAN25_VAE             VAE filename               (default: wan_2.1_vae.safetensors)
 *   RUNPOD_WAN25_STEPS           inference steps            (default: 20)
 *   RUNPOD_WAN25_CFG             guidance scale             (default: 6.0)
 *   RUNPOD_WAN25_FPS             output FPS                 (default: 16)
 */

import {
  submitJob,
  getJobStatus,
  normaliseStatus,
  extractOutputUrl,
  aspectRatioToResolution,
  durationToFrames,
  type NormalisedStatus,
} from './runpod';
import { mirrorUrlToR2 } from '../r2';

export interface Wan25Input {
  prompt:        string;
  negativePrompt?: string;
  duration?:     number;
  aspectRatio?:  string;
  seedImageUrl?: string;
  seed?:         number;
}

export interface Wan25JobResult {
  jobId:     string;
  status:    NormalisedStatus;
  outputUrl?: string;
  error?:    string;
}

// ─── Config helpers ───────────────────────────────────────────────────────────

function endpointId(): string {
  const id = process.env.RUNPOD_WAN25_ENDPOINT_ID;
  if (!id) throw new Error(
    'RUNPOD_WAN25_ENDPOINT_ID is not set. ' +
    'Deploy a Wan 2.5 serverless endpoint on RunPod and add the ID to .env'
  );
  return id;
}

const CFG = {
  unet:        () => process.env.RUNPOD_WAN25_UNET         ?? 'wan2.1-t2v-14b-q4_k_m.gguf',
  textEncoder: () => process.env.RUNPOD_WAN25_TEXT_ENCODER ?? 'umt5-xxl-encoder-q8_0.gguf',
  vae:         () => process.env.RUNPOD_WAN25_VAE          ?? 'wan_2.1_vae.safetensors',
  steps:       () => parseInt(process.env.RUNPOD_WAN25_STEPS ?? '20', 10),
  cfg:         () => parseFloat(process.env.RUNPOD_WAN25_CFG ?? '6.0'),
  fps:         () => parseInt(process.env.RUNPOD_WAN25_FPS   ?? '16', 10),
  mode:        () => (process.env.RUNPOD_WAN25_MODE ?? 'comfyui') as 'comfyui' | 'handler',
} as const;

// ─── ComfyUI workflow builder ─────────────────────────────────────────────────
/**
 * Builds a ComfyUI API-format workflow for Wan 2.5 using GGUF-quantised weights.
 * Uses ComfyUI-GGUF nodes for the UNet and text encoder to fit 24 GB GPUs.
 */
function buildComfyWorkflow(input: Wan25Input): Record<string, unknown> {
  const { width, height } = aspectRatioToResolution(input.aspectRatio, 'wan25');
  const fps    = CFG.fps();
  const frames = durationToFrames(input.duration ?? 5, fps, 'wan25');
  const seed   = input.seed ?? Math.floor(Math.random() * 2 ** 32);

  const negativeProp = input.negativePrompt?.trim() ||
    'nsfw, low quality, worst quality, normal quality, artifacts, noise, blurry, overexposed, static, motionless';

  const isImageToVideo = !!input.seedImageUrl;

  const workflow: Record<string, unknown> = {
    // Node 1 — Load UNet (GGUF quantised)
    '1': {
      class_type: 'UnetLoaderGGUF',
      inputs: { unet_name: CFG.unet() },
    },
    // Node 2 — Load text encoder (GGUF)
    '2': {
      class_type: 'CLIPLoaderGGUF',
      inputs: {
        clip_name: CFG.textEncoder(),
        type:      'wan',
      },
    },
    // Node 3 — Load VAE
    '3': {
      class_type: 'VAELoader',
      inputs: { vae_name: CFG.vae() },
    },
    // Node 4 — Positive prompt
    '4': {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: input.prompt,
        clip: ['2', 0],
      },
    },
    // Node 5 — Negative prompt
    '5': {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: negativeProp,
        clip: ['2', 0],
      },
    },
    // Node 7 — KSampler
    '7': {
      class_type: 'KSampler',
      inputs: {
        model:        ['1', 0],
        positive:     ['4', 0],
        negative:     ['5', 0],
        latent_image: ['6', 0],
        seed,
        steps:        CFG.steps(),
        cfg:          CFG.cfg(),
        sampler_name: 'uni_pc',
        scheduler:    'simple',
        denoise:      1.0,
      },
    },
    // Node 8 — Decode
    '8': {
      class_type: 'VAEDecode',
      inputs: {
        samples: ['7', 0],
        vae:     ['3', 0],
      },
    },
    // Node 9 — Output video (save to Network Volume)
    '9': {
      class_type: 'VHS_VideoCombine',
      inputs: {
        images:          ['8', 0],
        frame_rate:      fps,
        loop_count:      0,
        filename_prefix: 'wan25',
        format:          'video/h264-mp4',
        pingpong:        false,
        save_output:     true,
      },
    },
  };

  if (isImageToVideo) {
    // Image-to-video: load image → encode with VAE → use as conditioning latent
    workflow['6'] = {
      class_type: 'LoadImageFromURL',
      inputs: { url: input.seedImageUrl },
    };
    // Override latent: encode the seed image
    workflow['6a'] = {
      class_type: 'VAEEncode',
      inputs: {
        pixels: ['6', 0],
        vae:    ['3', 0],
      },
    };
    // Replace latent_image in KSampler with encoded image
    (workflow['7'] as { inputs: Record<string, unknown> }).inputs.latent_image = ['6a', 0];
  } else {
    // Text-to-video: empty latent
    workflow['6'] = {
      class_type: 'EmptyHunyuanLatentVideo', // compatible empty latent for Wan
      inputs: { width, height, length: frames, batch_size: 1 },
    };
  }

  return workflow;
}

/** Flat payload for a custom handler.py deployment */
function buildHandlerPayload(input: Wan25Input): Record<string, unknown> {
  const { width, height } = aspectRatioToResolution(input.aspectRatio, 'wan25');
  const fps    = CFG.fps();
  const frames = durationToFrames(input.duration ?? 5, fps, 'wan25');
  return {
    prompt:          input.prompt,
    negative_prompt: input.negativePrompt ?? '',
    width,
    height,
    num_frames:      frames,
    num_steps:       CFG.steps(),
    guidance_scale:  CFG.cfg(),
    fps,
    seed:            input.seed ?? -1,
    ...(input.seedImageUrl ? { image_url: input.seedImageUrl } : {}),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Submit a Wan 2.5 generation job to the RunPod Serverless endpoint.
 */
export async function submitWan25(input: Wan25Input): Promise<string> {
  const id = endpointId();
  const mode = CFG.mode();

  const payload = mode === 'comfyui'
    ? { workflow: buildComfyWorkflow(input) }
    : buildHandlerPayload(input);

  const { jobId } = await submitJob(
    id,
    payload,
    { executionTimeout: 900_000, ttl: 3_600_000 } // 15 min exec, 1 hr retention
  );
  return jobId;
}

/**
 * Poll the status of a previously submitted Wan 2.5 job.
 * When the job completes, the RunPod output URL (temporary S3 presigned) is
 * mirrored to R2 for permanent storage before being returned.
 */
export async function getWan25Status(jobId: string): Promise<Wan25JobResult> {
  const id = endpointId();
  const raw = await getJobStatus(id, jobId);
  const status = normaliseStatus(raw.status);

  if (status !== 'completed') {
    return { jobId, status, outputUrl: undefined, error: raw.error };
  }

  // Job completed — extract and mirror the output URL to R2
  const rawUrl = extractOutputUrl(raw.output);
  if (!rawUrl) {
    console.error('[wan25] COMPLETED job has no extractable output URL. Raw output:', JSON.stringify(raw.output));
    return { jobId, status: 'failed', error: 'Generation completed but produced no output URL' };
  }

  const r2Key = `generated/wan25/${jobId}.mp4`;
  try {
    const permanentUrl = await mirrorUrlToR2(rawUrl, r2Key, 'video/mp4');
    return { jobId, status: 'completed', outputUrl: permanentUrl };
  } catch (err) {
    console.error('[wan25] R2 mirror failed — marking job failed:', (err as Error).message);
    return { jobId, status: 'failed', error: 'Failed to save video to storage — please retry' };
  }
}
