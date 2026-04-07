/**
 * LTX-Video 2 (Lightricks) — via RunPod Serverless Endpoint
 *
 * Deployment guide:
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Create a Network Volume in the RunPod dashboard (~50 GB, SSD).
 *    Mount path: /runpod-volume
 *
 * 2. Deploy a ComfyUI one-click template and attach the Network Volume.
 *    (Search "ComfyUI" in Templates → select the GPU-optimised one)
 *    Place these model files on the volume before converting to Serverless:
 *      /runpod-volume/models/checkpoints/ltx-video-2b-0.9.6.safetensors
 *      /runpod-volume/models/clip/t5xxl_fp8_e4m3fn.safetensors
 *    Install custom nodes:
 *      ComfyUI-LTXVideo   (https://github.com/Lightricks/ComfyUI-LTXVideo)
 *      ComfyUI-VideoHelperSuite  (for VHS_VideoCombine output node)
 *
 * 3. Convert the pod to a Serverless Endpoint:
 *    RunPod Dashboard → Serverless → Deploy Endpoint → select your pod template.
 *    Set: Max Workers = your burst capacity, Idle Timeout = 15 min (auto-stops GPU).
 *    This gives you a clean HTTP endpoint with zero idle cost.
 *
 * 4. Set the Endpoint ID in .env:
 *    RUNPOD_LTX2_ENDPOINT_ID=your_endpoint_id
 *    RUNPOD_API_KEY=your_api_key
 *    RUNPOD_NETWORK_VOLUME_ID=your_volume_id   (for documentation / pod restart)
 *
 * Mode configuration:
 *    RUNPOD_LTX2_MODE=comfyui   (default) — sends ComfyUI workflow JSON
 *    RUNPOD_LTX2_MODE=handler   — sends simple {prompt, frames, …} to a custom handler.py
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Required env vars:
 *   RUNPOD_API_KEY
 *   RUNPOD_LTX2_ENDPOINT_ID
 *
 * Optional:
 *   RUNPOD_LTX2_MODE               comfyui | handler  (default: comfyui)
 *   RUNPOD_LTX2_CHECKPOINT         model filename on the volume  (default: ltx-video-2b-0.9.6.safetensors)
 *   RUNPOD_LTX2_CLIP               T5 filename on the volume     (default: t5xxl_fp8_e4m3fn.safetensors)
 *   RUNPOD_LTX2_STEPS              inference steps               (default: 30)
 *   RUNPOD_LTX2_CFG                guidance scale                (default: 3.0)
 *   RUNPOD_LTX2_FPS                output FPS                    (default: 25)
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

export interface LTX2Input {
  prompt:        string;
  negativePrompt?: string;
  duration?:     number;
  aspectRatio?:  string;
  seedImageUrl?: string;
  seed?:         number;
}

export interface LTX2JobResult {
  jobId:    string;
  status:   NormalisedStatus;
  outputUrl?: string;
  error?:   string;
}

// ─── Config helpers ───────────────────────────────────────────────────────────

function endpointId(): string {
  const id = process.env.RUNPOD_LTX2_ENDPOINT_ID;
  if (!id) throw new Error(
    'RUNPOD_LTX2_ENDPOINT_ID is not set. ' +
    'Deploy an LTX-Video 2 serverless endpoint on RunPod and add the ID to .env'
  );
  return id;
}

const CFG = {
  checkpoint: () => process.env.RUNPOD_LTX2_CHECKPOINT ?? 'ltx-video-2b-0.9.6.safetensors',
  clip:       () => process.env.RUNPOD_LTX2_CLIP       ?? 't5xxl_fp8_e4m3fn.safetensors',
  steps:      () => parseInt(process.env.RUNPOD_LTX2_STEPS ?? '30', 10),
  cfg:        () => parseFloat(process.env.RUNPOD_LTX2_CFG ?? '3.0'),
  fps:        () => parseInt(process.env.RUNPOD_LTX2_FPS   ?? '25', 10),
  mode:       () => (process.env.RUNPOD_LTX2_MODE ?? 'comfyui') as 'comfyui' | 'handler',
} as const;

// ─── ComfyUI workflow builder ─────────────────────────────────────────────────
/**
 * Builds a ComfyUI API-format workflow JSON for LTX-Video 2.
 * Node IDs and class_types follow ComfyUI-LTXVideo conventions.
 *
 * Network Volume models are referenced by filename only — ComfyUI resolves
 * them from /runpod-volume/ComfyUI/models/ (symlinked at startup).
 */
function buildComfyWorkflow(input: LTX2Input): Record<string, unknown> {
  const { width, height } = aspectRatioToResolution(input.aspectRatio, 'ltx2');
  const fps    = CFG.fps();
  const frames = durationToFrames(input.duration ?? 5, fps, 'ltx2');
  const seed   = input.seed ?? Math.floor(Math.random() * 2 ** 32);

  const negativeProp = input.negativePrompt?.trim() ||
    'worst quality, inconsistent motion, blurry, jittery, distorted';

  return {
    // Node 1 — Load LTX-Video model
    '1': {
      class_type: 'LTXVLoader',
      inputs: {
        ckpt_name: CFG.checkpoint(),
        dtype:     'bfloat16',
      },
    },
    // Node 2 — Load T5 text encoder
    '2': {
      class_type: 'CLIPLoader',
      inputs: {
        clip_name: CFG.clip(),
        type:      'ltxv',
        device:    'cuda',
      },
    },
    // Node 3 — Positive conditioning
    '3': {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: input.prompt,
        clip: ['2', 0],
      },
    },
    // Node 4 — Negative conditioning
    '4': {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: negativeProp,
        clip: ['2', 0],
      },
    },
    // Node 5 — Empty latent (dimensions + length)
    '5': {
      class_type: 'EmptyLTXVLatentVideo',
      inputs: { width, height, length: frames, batch_size: 1 },
    },
    // Node 6 — LTX-V scheduler (critical: must use LTXVScheduler, not Karras etc.)
    '6': {
      class_type: 'LTXVScheduler',
      inputs: {
        steps:      CFG.steps(),
        max_shift:  2.05,
        base_shift: 0.95,
        stretch:    true,
        terminal:   0.1,
        latent:     ['5', 0],
      },
    },
    // Node 7 — Noise source
    '7': {
      class_type: 'RandomNoise',
      inputs: { noise_seed: seed },
    },
    // Node 8 — CFG Guider
    '8': {
      class_type: 'CFGGuider',
      inputs: {
        model:    ['1', 0],
        positive: ['3', 0],
        negative: ['4', 0],
        cfg:      CFG.cfg(),
      },
    },
    // Node 9 — Euler sampler selector
    '9': {
      class_type: 'KSamplerSelect',
      inputs: { sampler_name: 'euler' },
    },
    // Node 10 — Sampler (uses custom sigmas from LTXVScheduler)
    '10': {
      class_type: 'SamplerCustomAdvanced',
      inputs: {
        noise:        ['7', 0],
        guider:       ['8', 0],
        sampler:      ['9', 0],
        sigmas:       ['6', 0],
        latent_image: ['5', 0],
      },
    },
    // Node 11 — Decode latents to pixel frames
    '11': {
      class_type: 'LTXVDecode',
      inputs: {
        samples:           ['10', 0],
        vae:               ['1', 2],
        enable_vae_tiling: false,
        per_batch:         16,
      },
    },
    // Node 12 — Combine frames → MP4 and save to /runpod-volume/outputs/
    '12': {
      class_type: 'VHS_VideoCombine',
      inputs: {
        images:          ['11', 0],
        frame_rate:      fps,
        loop_count:      0,
        filename_prefix: 'ltxv',
        format:          'video/h264-mp4',
        pingpong:        false,
        save_output:     true,
      },
    },
  };
}

/** Payload for a simple custom handler.py (non-ComfyUI deployments) */
function buildHandlerPayload(input: LTX2Input): Record<string, unknown> {
  const { width, height } = aspectRatioToResolution(input.aspectRatio, 'ltx2');
  const fps    = CFG.fps();
  const frames = durationToFrames(input.duration ?? 5, fps, 'ltx2');
  return {
    prompt:          input.prompt,
    negative_prompt: input.negativePrompt ?? '',
    width,
    height,
    num_frames:      frames,
    num_steps:       CFG.steps(),
    guidance_scale:  CFG.cfg(),
    fps,
    seed:            input.seed ?? -1, // -1 = random
    ...(input.seedImageUrl ? { image_url: input.seedImageUrl } : {}),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Submit an LTX-Video 2 generation job to the RunPod Serverless endpoint.
 * Returns the RunPod job ID for polling.
 */
export async function submitLTX2(input: LTX2Input): Promise<string> {
  const id = endpointId();
  const mode = CFG.mode();

  const payload = mode === 'comfyui'
    ? { workflow: buildComfyWorkflow(input) }  // ComfyUI handler expects { workflow: {...} }
    : buildHandlerPayload(input);               // Custom handler expects flat JSON

  const { jobId } = await submitJob(
    id,
    payload,
    { executionTimeout: 600_000, ttl: 3_600_000 } // 10 min exec, 1 hr retention
  );
  return jobId;
}

/**
 * Poll the status of a previously submitted LTX2 job.
 */
export async function getLTX2Status(jobId: string): Promise<LTX2JobResult> {
  const id = endpointId();
  const raw = await getJobStatus(id, jobId);
  return {
    jobId,
    status:    normaliseStatus(raw.status),
    outputUrl: raw.status === 'COMPLETED' ? extractOutputUrl(raw.output) : undefined,
    error:     raw.error,
  };
}
