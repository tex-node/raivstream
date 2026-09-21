/**
 * CogVideoX (Zhipu AI / THUDM) — via RunPod Serverless Endpoint
 *
 * Deployment guide:
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Create a Network Volume in the RunPod dashboard (~60 GB, SSD).
 *    Mount path: /runpod-volume
 *
 * 2. Deploy a ComfyUI pod template and attach the Network Volume.
 *    Place these model files on the volume before converting to Serverless:
 *      /runpod-volume/models/CogVideo/cogvideox_5b.safetensors    ← 5B model (better quality)
 *      /runpod-volume/models/CogVideo/cogvideox_2b.safetensors    ← alternative (faster)
 *      /runpod-volume/models/text_encoders/t5xxl_fp16.safetensors
 *      /runpod-volume/models/vae/cogvideox_vae.safetensors
 *    Install custom nodes:
 *      ComfyUI-CogVideoX (if not using native ComfyUI support)
 *      ComfyUI-VideoHelperSuite  (for VHS_VideoCombine output node)
 *
 * 3. Convert the pod to a Serverless Endpoint:
 *    RunPod Dashboard → Serverless → Deploy Endpoint → select your pod template.
 *    Recommended GPU: RTX 4090 (24 GB) or A100 (better for 5B).
 *    Set: Max Workers = burst capacity, Idle Timeout = 15 min.
 *
 * 4. Set the Endpoint ID in .env:
 *    RUNPOD_COGVIDEOX_ENDPOINT_ID=your_endpoint_id
 *    RUNPOD_API_KEY=your_api_key
 *
 * Mode configuration:
 *    RUNPOD_COGVIDEOX_MODE=comfyui   (default) — sends ComfyUI workflow JSON
 *    RUNPOD_COGVIDEOX_MODE=handler   — sends simple {prompt, frames, …} to a custom handler.py
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Required env vars:
 *   RUNPOD_API_KEY
 *   RUNPOD_COGVIDEOX_ENDPOINT_ID
 *
 * Optional:
 *   RUNPOD_COGVIDEOX_MODE            comfyui | handler     (default: comfyui)
 *   RUNPOD_COGVIDEOX_CHECKPOINT      model filename        (default: cogvideox_5b.safetensors)
 *   RUNPOD_COGVIDEOX_VAE             VAE filename          (default: cogvideox_vae.safetensors)
 *   RUNPOD_COGVIDEOX_T5              T5 encoder filename   (default: t5xxl_fp16.safetensors)
 *   RUNPOD_COGVIDEOX_STEPS           inference steps       (default: 50)
 *   RUNPOD_COGVIDEOX_CFG             guidance scale        (default: 6.0)
 *   RUNPOD_COGVIDEOX_FPS             output FPS            (default: 8)
 */

import {
  submitJob,
  getJobStatus,
  normaliseStatus,
  normaliseRunpodError,
  extractOutputUrl,
  aspectRatioToResolution,
  durationToFrames,
  type NormalisedStatus,
} from './runpod';
import { mirrorUrlToR2 } from '../r2';
import { resultInvalid, storageFailed, type GenerationJobError } from './jobModel';

export interface CogVideoXInput {
  prompt:        string;
  negativePrompt?: string;
  duration?:     number;
  aspectRatio?:  string;
  seed?:         number;
}

export interface CogVideoXJobResult {
  jobId:      string;
  status:     NormalisedStatus;
  outputUrl?: string;
  error?:     GenerationJobError;
}

// ─── Config helpers ───────────────────────────────────────────────────────────

function endpointId(): string {
  const id = process.env.RUNPOD_COGVIDEOX_ENDPOINT_ID;
  if (!id) throw new Error(
    'RUNPOD_COGVIDEOX_ENDPOINT_ID is not set. ' +
    'Deploy a CogVideoX serverless endpoint on RunPod and add the ID to .env'
  );
  return id;
}

const CFG = {
  checkpoint: () => process.env.RUNPOD_COGVIDEOX_CHECKPOINT ?? 'cogvideox_5b.safetensors',
  vae:        () => process.env.RUNPOD_COGVIDEOX_VAE        ?? 'cogvideox_vae.safetensors',
  t5:         () => process.env.RUNPOD_COGVIDEOX_T5         ?? 't5xxl_fp16.safetensors',
  steps:      () => parseInt(process.env.RUNPOD_COGVIDEOX_STEPS ?? '50', 10),
  cfg:        () => parseFloat(process.env.RUNPOD_COGVIDEOX_CFG ?? '6.0'),
  fps:        () => parseInt(process.env.RUNPOD_COGVIDEOX_FPS   ?? '8', 10),
  mode:       () => (process.env.RUNPOD_COGVIDEOX_MODE ?? 'comfyui') as 'comfyui' | 'handler',
} as const;

// ─── ComfyUI workflow builder ─────────────────────────────────────────────────
/**
 * Builds a ComfyUI API-format workflow for CogVideoX using native ComfyUI nodes.
 * CogVideoX has first-class support in ComfyUI as of v0.2+.
 *
 * Frame constraint: (n - 1) % 8 === 0, max 49 frames (architecture limit).
 * At 8 fps that gives: 9f=1s, 17f=2s, 25f=3s, 33f=4s, 41f=5s, 49f=6s.
 *
 * Node reference:
 *   CogVideoXTransformerLoader  — loads the transformer (model)
 *   CogVideoXVAE                — loads VAE
 *   CogVideoXTextEncode         — T5 text encoding
 *   CogVideoXEmptyLatent        — creates empty latent
 *   CogVideoXSampler            — runs the diffusion process
 *   CogVideoXDecode             — decodes latent → frames
 *   VHS_VideoCombine            — encodes frames → MP4
 */
function buildComfyWorkflow(input: CogVideoXInput): Record<string, unknown> {
  const { width, height } = aspectRatioToResolution(input.aspectRatio, 'cogvideox');
  const fps    = CFG.fps();
  const frames = durationToFrames(input.duration ?? 5, fps, 'cogvideox');
  const seed   = input.seed ?? Math.floor(Math.random() * 2 ** 32);

  const negativeProp = input.negativePrompt?.trim() ||
    'low quality, worst quality, deformed, distorted, disfigured, motion smear, motion artifacts, fused fingers, bad anatomy, weird hand, ugly';

  return {
    // Node 1 — Load CogVideoX transformer model
    '1': {
      class_type: 'CogVideoXTransformerLoader',
      inputs: {
        model_name: CFG.checkpoint(),
        precision:  'fp16',
      },
    },
    // Node 2 — Load T5 text encoder
    '2': {
      class_type: 'CLIPLoader',
      inputs: {
        clip_name: CFG.t5(),
        type:      'sd3',
      },
    },
    // Node 3 — Load VAE
    '3': {
      class_type: 'VAELoader',
      inputs: { vae_name: CFG.vae() },
    },
    // Node 4 — Encode positive prompt
    '4': {
      class_type: 'CogVideoXTextEncode',
      inputs: {
        clip:  ['2', 0],
        prompt: input.prompt,
      },
    },
    // Node 5 — Encode negative prompt
    '5': {
      class_type: 'CogVideoXTextEncode',
      inputs: {
        clip:   ['2', 0],
        prompt: negativeProp,
      },
    },
    // Node 6 — Empty latent video at target resolution
    '6': {
      class_type: 'EmptyMochiLatent',  // compatible empty latent for CogVideoX
      inputs: {
        width,
        height,
        num_frames:  frames,
        batch_size:  1,
      },
    },
    // Node 7 — Run CogVideoX sampler
    '7': {
      class_type: 'CogVideoXSampler',
      inputs: {
        model:        ['1', 0],
        positive:     ['4', 0],
        negative:     ['5', 0],
        samples:      ['6', 0],
        vae:          ['3', 0],
        steps:        CFG.steps(),
        cfg:          CFG.cfg(),
        seed,
        scheduler:    'CogVideoXDDIM',
        denoise:      1.0,
      },
    },
    // Node 8 — Decode latent → pixel frames
    '8': {
      class_type: 'CogVideoXDecode',
      inputs: {
        vae:     ['3', 0],
        samples: ['7', 0],
      },
    },
    // Node 9 — Combine frames → MP4 and save to /runpod-volume/outputs/
    '9': {
      class_type: 'VHS_VideoCombine',
      inputs: {
        images:          ['8', 0],
        frame_rate:      fps,
        loop_count:      0,
        filename_prefix: 'cogvideox',
        format:          'video/h264-mp4',
        pingpong:        false,
        save_output:     true,
      },
    },
  };
}

/** Flat payload for a custom handler.py deployment */
function buildHandlerPayload(input: CogVideoXInput): Record<string, unknown> {
  const { width, height } = aspectRatioToResolution(input.aspectRatio, 'cogvideox');
  const fps    = CFG.fps();
  const frames = durationToFrames(input.duration ?? 5, fps, 'cogvideox');
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
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Submit a CogVideoX generation job to the RunPod Serverless endpoint.
 * Returns the RunPod job ID for polling.
 */
export async function submitCogVideoX(input: CogVideoXInput): Promise<string> {
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
 * Poll the status of a previously submitted CogVideoX job.
 * When complete, the RunPod output URL is mirrored to R2 for permanent storage.
 */
export async function getCogVideoXStatus(jobId: string): Promise<CogVideoXJobResult> {
  const id = endpointId();
  const raw = await getJobStatus(id, jobId);
  const status = normaliseStatus(raw.status);

  if (status !== 'completed') {
    return { jobId, status, outputUrl: undefined, error: normaliseRunpodError(raw.status, raw.error) };
  }

  const rawUrl = extractOutputUrl(raw.output);
  if (!rawUrl) {
    console.error('[cogvideox] COMPLETED job has no extractable output URL. Raw output:', JSON.stringify(raw.output));
    return { jobId, status: 'failed', error: resultInvalid() };
  }

  const r2Key = `generated/cogvideox/${jobId}.mp4`;
  try {
    const permanentUrl = await mirrorUrlToR2(rawUrl, r2Key, 'video/mp4');
    return { jobId, status: 'completed', outputUrl: permanentUrl };
  } catch (err) {
    console.error('[cogvideox] R2 mirror failed — marking job failed:', (err as Error).message);
    return { jobId, status: 'failed', error: storageFailed() };
  }
}
