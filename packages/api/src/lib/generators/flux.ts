/**
 * Flux.1 (Black Forest Labs) — via RunPod Serverless Endpoint
 *
 * Deployment guide:
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Create a Network Volume in the RunPod dashboard (~50 GB, SSD).
 *    Mount path: /runpod-volume
 *
 * 2. Deploy a ComfyUI pod template and attach the Network Volume.
 *    Place these model files on the volume before converting to Serverless:
 *      /runpod-volume/models/unet/flux1-dev.safetensors         ← dev (better quality)
 *      /runpod-volume/models/unet/flux1-schnell.safetensors     ← alternative (faster, 4 steps)
 *      /runpod-volume/models/clip/clip_l.safetensors
 *      /runpod-volume/models/clip/t5xxl_fp8_e4m3fn.safetensors
 *      /runpod-volume/models/vae/ae.safetensors
 *
 * 3. Convert the pod to a Serverless Endpoint:
 *    RunPod Dashboard → Serverless → Deploy Endpoint → select your pod template.
 *    Recommended GPU: RTX 4090 (24 GB).
 *    Set: Max Workers = burst capacity, Idle Timeout = 15 min.
 *
 * 4. Set the Endpoint ID in .env:
 *    RUNPOD_FLUX_ENDPOINT_ID=your_endpoint_id
 *    RUNPOD_API_KEY=your_api_key
 *
 * Mode configuration:
 *    RUNPOD_FLUX_MODE=comfyui   (default) — sends ComfyUI workflow JSON
 *    RUNPOD_FLUX_MODE=handler   — sends simple {prompt, width, height, …} to a custom handler.py
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Required env vars:
 *   RUNPOD_API_KEY
 *   RUNPOD_FLUX_ENDPOINT_ID
 *
 * Optional:
 *   RUNPOD_FLUX_MODE            comfyui | handler      (default: comfyui)
 *   RUNPOD_FLUX_UNET            UNET filename          (default: flux1-dev.safetensors)
 *   RUNPOD_FLUX_CLIP_L          CLIP-L filename        (default: clip_l.safetensors)
 *   RUNPOD_FLUX_T5              T5 encoder filename    (default: t5xxl_fp8_e4m3fn.safetensors)
 *   RUNPOD_FLUX_VAE             VAE filename           (default: ae.safetensors)
 *   RUNPOD_FLUX_STEPS           inference steps        (default: 20; use 4 for schnell)
 *   RUNPOD_FLUX_GUIDANCE        guidance scale         (default: 3.5)
 */

import {
  submitJob,
  getJobStatus,
  normaliseStatus,
  extractOutputUrl,
  aspectRatioToResolution,
  type NormalisedStatus,
} from './runpod';
import { mirrorUrlToR2 } from '../r2';

export interface FluxInput {
  prompt:       string;
  aspectRatio?: string;
  seed?:        number;
}

export interface FluxJobResult {
  jobId:      string;
  status:     NormalisedStatus;
  outputUrl?: string;
  error?:     string;
}

// ─── Config helpers ───────────────────────────────────────────────────────────

function endpointId(): string {
  const id = process.env.RUNPOD_FLUX_ENDPOINT_ID;
  if (!id) throw new Error(
    'RUNPOD_FLUX_ENDPOINT_ID is not set. ' +
    'Deploy a Flux.1 serverless endpoint on RunPod and add the ID to .env'
  );
  return id;
}

const CFG = {
  unet:     () => process.env.RUNPOD_FLUX_UNET    ?? 'flux1-dev.safetensors',
  clipL:    () => process.env.RUNPOD_FLUX_CLIP_L  ?? 'clip_l.safetensors',
  t5:       () => process.env.RUNPOD_FLUX_T5      ?? 't5xxl_fp8_e4m3fn.safetensors',
  vae:      () => process.env.RUNPOD_FLUX_VAE     ?? 'ae.safetensors',
  steps:    () => parseInt(process.env.RUNPOD_FLUX_STEPS    ?? '20', 10),
  guidance: () => parseFloat(process.env.RUNPOD_FLUX_GUIDANCE ?? '3.5'),
  mode:     () => (process.env.RUNPOD_FLUX_MODE ?? 'comfyui') as 'comfyui' | 'handler',
} as const;

// ─── ComfyUI workflow builder ─────────────────────────────────────────────────
/**
 * Builds a ComfyUI API-format workflow for Flux.1.
 * Uses the SamplerCustomAdvanced + BasicGuider path that Flux.1 requires
 * (standard KSampler does not support Flux's distilled guidance).
 *
 * Workflow graph:
 *   UNETLoader ─────────────────────────────────► BasicScheduler ──► SamplerCustomAdvanced ──► VAEDecode ──► SaveImage
 *   DualCLIPLoader ──► CLIPTextEncodeFlux ──────► BasicGuider ───►
 *   VAELoader ──────────────────────────────────────────────────────────────────────────────►
 *   EmptyLatentImage ───────────────────────────────────────────► SamplerCustomAdvanced ──►
 *   RandomNoise ────────────────────────────────────────────────► SamplerCustomAdvanced ──►
 */
function buildComfyWorkflow(input: FluxInput): Record<string, unknown> {
  const { width, height } = aspectRatioToResolution(input.aspectRatio, 'flux');
  const seed = input.seed ?? Math.floor(Math.random() * 2 ** 32);

  return {
    // Node 1 — Load Flux UNET
    '1': {
      class_type: 'UNETLoader',
      inputs: {
        unet_name:    CFG.unet(),
        weight_dtype: 'fp8_e4m3fn',
      },
    },
    // Node 2 — Load CLIP-L + T5 text encoders (Flux dual-encoder)
    '2': {
      class_type: 'DualCLIPLoader',
      inputs: {
        clip_name1: CFG.clipL(),
        clip_name2: CFG.t5(),
        type:       'flux',
      },
    },
    // Node 3 — Load VAE
    '3': {
      class_type: 'VAELoader',
      inputs: { vae_name: CFG.vae() },
    },
    // Node 4 — Encode positive prompt (Flux-specific node for dual conditioning)
    '4': {
      class_type: 'CLIPTextEncodeFlux',
      inputs: {
        clip_l:   input.prompt,
        t5xxl:    input.prompt,
        guidance: CFG.guidance(),
        clip:     ['2', 0],
      },
    },
    // Node 5 — Empty latent image at target resolution
    '5': {
      class_type: 'EmptyLatentImage',
      inputs: { width, height, batch_size: 1 },
    },
    // Node 6 — Random noise seed
    '6': {
      class_type: 'RandomNoise',
      inputs: { noise_seed: seed },
    },
    // Node 7 — Flux-compatible scheduler (simple works best for distilled Flux)
    '7': {
      class_type: 'BasicScheduler',
      inputs: {
        model:     ['1', 0],
        scheduler: 'simple',
        steps:     CFG.steps(),
        denoise:   1.0,
      },
    },
    // Node 8 — Basic guider (passes conditioning without CFG rescale)
    '8': {
      class_type: 'BasicGuider',
      inputs: {
        model:        ['1', 0],
        conditioning: ['4', 0],
      },
    },
    // Node 9 — Euler sampler (standard for Flux)
    '9': {
      class_type: 'KSamplerSelect',
      inputs: { sampler_name: 'euler' },
    },
    // Node 10 — Run the diffusion process
    '10': {
      class_type: 'SamplerCustomAdvanced',
      inputs: {
        noise:        ['6', 0],
        guider:       ['8', 0],
        sampler:      ['9', 0],
        sigmas:       ['7', 0],
        latent_image: ['5', 0],
      },
    },
    // Node 11 — Decode latent to pixel image
    '11': {
      class_type: 'VAEDecode',
      inputs: {
        samples: ['10', 0],
        vae:     ['3', 0],
      },
    },
    // Node 12 — Save image to /runpod-volume/outputs/
    '12': {
      class_type: 'SaveImage',
      inputs: {
        images:          ['11', 0],
        filename_prefix: 'flux',
      },
    },
  };
}

/** Flat payload for a custom handler.py deployment */
function buildHandlerPayload(input: FluxInput): Record<string, unknown> {
  const { width, height } = aspectRatioToResolution(input.aspectRatio, 'flux');
  return {
    prompt:         input.prompt,
    width,
    height,
    num_steps:      CFG.steps(),
    guidance_scale: CFG.guidance(),
    seed:           input.seed ?? -1,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Submit a Flux.1 image generation job to the RunPod Serverless endpoint.
 * Returns the RunPod job ID for polling.
 */
export async function submitFlux(input: FluxInput): Promise<string> {
  const id = endpointId();
  const mode = CFG.mode();

  const payload = mode === 'comfyui'
    ? { workflow: buildComfyWorkflow(input) }
    : buildHandlerPayload(input);

  const { jobId } = await submitJob(
    id,
    payload,
    { executionTimeout: 300_000, ttl: 3_600_000 } // 5 min exec, 1 hr retention
  );
  return jobId;
}

/**
 * Poll the status of a previously submitted Flux job.
 * When complete, the RunPod output URL (temporary S3 presigned) is mirrored to R2.
 */
export async function getFluxStatus(jobId: string): Promise<FluxJobResult> {
  const id = endpointId();
  const raw = await getJobStatus(id, jobId);
  const status = normaliseStatus(raw.status);

  if (status !== 'completed') {
    return { jobId, status, outputUrl: undefined, error: raw.error };
  }

  const rawUrl = extractOutputUrl(raw.output);
  if (!rawUrl) {
    console.error('[flux] COMPLETED job has no extractable output URL. Raw output:', JSON.stringify(raw.output));
    return { jobId, status: 'failed', error: 'Generation completed but produced no output URL' };
  }

  const r2Key = `generated/flux/${jobId}.png`;
  try {
    const permanentUrl = await mirrorUrlToR2(rawUrl, r2Key, 'image/png');
    return { jobId, status: 'completed', outputUrl: permanentUrl };
  } catch (err) {
    console.error('[flux] R2 mirror failed — marking job failed:', (err as Error).message);
    return { jobId, status: 'failed', error: 'Failed to save image to storage — please retry' };
  }
}
