/**
 * HunyuanVideo (Tencent) — via RunPod Serverless Endpoint
 *
 * Deployment guide:
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Create a Network Volume in the RunPod dashboard (~80 GB, SSD).
 *    Mount path: /runpod-volume
 *
 * 2. Deploy a ComfyUI pod template and attach the Network Volume.
 *    Place these model files on the volume before converting to Serverless:
 *      /runpod-volume/models/unet/hunyuan_video_720_cfgdistill_fp8_e4m3fn.safetensors
 *      /runpod-volume/models/clip/llava-llama-3-8b-text-encoder-tokenizer/  (directory)
 *      /runpod-volume/models/clip/clip-vit-large-patch14/                   (directory)
 *      /runpod-volume/models/vae/hunyuan_video_vae_bf16.safetensors
 *    Install custom nodes:
 *      kijai/ComfyUI-HunyuanVideoWrapper  (HyVideo* nodes)
 *      ComfyUI-VideoHelperSuite           (VHS_VideoCombine output node)
 *
 * 3. Convert the pod to a Serverless Endpoint:
 *    RunPod Dashboard → Serverless → Deploy Endpoint → select your pod template.
 *    Recommended GPU: A100 SXM (40 GB) — model needs ~30 GB VRAM at fp8.
 *    Set: Max Workers = burst capacity, Idle Timeout = 15 min.
 *
 * 4. Set the Endpoint ID in .env:
 *    RUNPOD_HUNYUAN_ENDPOINT_ID=your_endpoint_id
 *    RUNPOD_API_KEY=your_api_key
 *
 * Mode configuration:
 *    RUNPOD_HUNYUAN_MODE=comfyui   (default) — sends ComfyUI workflow JSON
 *    RUNPOD_HUNYUAN_MODE=handler   — sends simple {prompt, frames, …} to a custom handler.py
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Required env vars:
 *   RUNPOD_API_KEY
 *   RUNPOD_HUNYUAN_ENDPOINT_ID
 *
 * Optional:
 *   RUNPOD_HUNYUAN_MODE            comfyui | handler   (default: comfyui)
 *   RUNPOD_HUNYUAN_CHECKPOINT      UNET model filename (default: hunyuan_video_720_cfgdistill_fp8_e4m3fn.safetensors)
 *   RUNPOD_HUNYUAN_VAE             VAE filename        (default: hunyuan_video_vae_bf16.safetensors)
 *   RUNPOD_HUNYUAN_STEPS           inference steps     (default: 30)
 *   RUNPOD_HUNYUAN_CFG             guidance scale      (default: 6.0)
 *   RUNPOD_HUNYUAN_FPS             output FPS          (default: 24)
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

export interface HunyuanVideoInput {
  prompt:        string;
  negativePrompt?: string;
  duration?:     number;
  aspectRatio?:  string;
  seed?:         number;
}

export interface HunyuanVideoJobResult {
  jobId:      string;
  status:     NormalisedStatus;
  outputUrl?: string;
  error?:     GenerationJobError;
}

// ─── Config helpers ───────────────────────────────────────────────────────────

function endpointId(): string {
  const id = process.env.RUNPOD_HUNYUAN_ENDPOINT_ID;
  if (!id) throw new Error(
    'RUNPOD_HUNYUAN_ENDPOINT_ID is not set. ' +
    'Deploy a HunyuanVideo serverless endpoint on RunPod and add the ID to .env'
  );
  return id;
}

const CFG = {
  checkpoint: () => process.env.RUNPOD_HUNYUAN_CHECKPOINT ?? 'hunyuan_video_720_cfgdistill_fp8_e4m3fn.safetensors',
  vae:        () => process.env.RUNPOD_HUNYUAN_VAE        ?? 'hunyuan_video_vae_bf16.safetensors',
  steps:      () => parseInt(process.env.RUNPOD_HUNYUAN_STEPS ?? '30', 10),
  cfg:        () => parseFloat(process.env.RUNPOD_HUNYUAN_CFG ?? '6.0'),
  fps:        () => parseInt(process.env.RUNPOD_HUNYUAN_FPS   ?? '24', 10),
  mode:       () => (process.env.RUNPOD_HUNYUAN_MODE ?? 'comfyui') as 'comfyui' | 'handler',
} as const;

// ─── ComfyUI workflow builder ─────────────────────────────────────────────────
/**
 * Builds a ComfyUI API-format workflow for HunyuanVideo using the
 * kijai/ComfyUI-HunyuanVideoWrapper custom node package (HyVideo* nodes).
 *
 * Node reference:
 *   HyVideoModelLoader     — loads the UNet + VAE
 *   HyVideoTextEncode      — dual text encode (LLM + CLIP)
 *   HyVideoEmptyLatent     — creates target-size empty latent
 *   HyVideoSampler         — runs the diffusion process
 *   HyVideoDecode          — decodes latent to frames
 *   VHS_VideoCombine       — encodes frames to MP4
 */
function buildComfyWorkflow(input: HunyuanVideoInput): Record<string, unknown> {
  const { width, height } = aspectRatioToResolution(input.aspectRatio, 'hunyuan');
  const fps    = CFG.fps();
  const frames = durationToFrames(input.duration ?? 5, fps, 'hunyuan');
  const seed   = input.seed ?? Math.floor(Math.random() * 2 ** 32);

  return {
    // Node 1 — Load HunyuanVideo UNet + VAE
    '1': {
      class_type: 'HyVideoModelLoader',
      inputs: {
        model:        CFG.checkpoint(),
        vae:          CFG.vae(),
        precision:    'fp8_e4m3fn',
        load_device:  'main_device',
      },
    },
    // Node 2 — Load LLM text encoder (llava-llama-3-8b)
    '2': {
      class_type: 'DownloadAndLoadHyVideoTextEncoder',
      inputs: {
        llm_model:   'Kijai/llava-llama-3-8b-text-encoder-tokenizer',
        clip_model:  'openai/clip-vit-large-patch14',
        precision:   'fp16',
      },
    },
    // Node 3 — Encode text prompt (dual LLM + CLIP path)
    '3': {
      class_type: 'HyVideoTextEncode',
      inputs: {
        text_encoders:   ['2', 0],
        prompt:          input.prompt,
        negative_prompt: input.negativePrompt?.trim() || 'low quality, blurry, artifacts',
        force_offload:   true,
      },
    },
    // Node 4 — Empty latent at target resolution + frame count
    '4': {
      class_type: 'HyVideoEmptyLatent',
      inputs: {
        width,
        height,
        num_frames:  frames,
        batch_size:  1,
      },
    },
    // Node 5 — Run HunyuanVideo sampler
    '5': {
      class_type: 'HyVideoSampler',
      inputs: {
        model:            ['1', 0],
        hyvideo_embeds:   ['3', 0],
        samples:          ['4', 0],
        steps:            CFG.steps(),
        embedded_guidance_scale: CFG.cfg(),
        flow_shift:       7.0,
        seed,
        force_offload:    true,
      },
    },
    // Node 6 — Decode latents to pixel frames
    '6': {
      class_type: 'HyVideoDecode',
      inputs: {
        vae:              ['1', 1],
        samples:          ['5', 0],
        enable_vae_tiling: true,
        temporal_tiling_sample_size: 16,
        spatial_tiling_sample_size:  256,
      },
    },
    // Node 7 — Combine frames → MP4 and save to /runpod-volume/outputs/
    '7': {
      class_type: 'VHS_VideoCombine',
      inputs: {
        images:          ['6', 0],
        frame_rate:      fps,
        loop_count:      0,
        filename_prefix: 'hunyuan',
        format:          'video/h264-mp4',
        pingpong:        false,
        save_output:     true,
      },
    },
  };
}

/** Flat payload for a custom handler.py deployment */
function buildHandlerPayload(input: HunyuanVideoInput): Record<string, unknown> {
  const { width, height } = aspectRatioToResolution(input.aspectRatio, 'hunyuan');
  const fps    = CFG.fps();
  const frames = durationToFrames(input.duration ?? 5, fps, 'hunyuan');
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
 * Submit a HunyuanVideo generation job to the RunPod Serverless endpoint.
 * Returns the RunPod job ID for polling.
 */
export async function submitHunyuanVideo(input: HunyuanVideoInput): Promise<string> {
  const id = endpointId();
  const mode = CFG.mode();

  const payload = mode === 'comfyui'
    ? { workflow: buildComfyWorkflow(input) }
    : buildHandlerPayload(input);

  const { jobId } = await submitJob(
    id,
    payload,
    { executionTimeout: 1_200_000, ttl: 3_600_000 } // 20 min exec (large model), 1 hr retention
  );
  return jobId;
}

/**
 * Poll the status of a previously submitted HunyuanVideo job.
 * When complete, the RunPod output URL is mirrored to R2 for permanent storage.
 */
export async function getHunyuanVideoStatus(jobId: string): Promise<HunyuanVideoJobResult> {
  const id = endpointId();
  const raw = await getJobStatus(id, jobId);
  const status = normaliseStatus(raw.status);

  if (status !== 'completed') {
    return { jobId, status, outputUrl: undefined, error: normaliseRunpodError(raw.status, raw.error) };
  }

  const rawUrl = extractOutputUrl(raw.output);
  if (!rawUrl) {
    console.error('[hunyuan] COMPLETED job has no extractable output URL. Raw output:', JSON.stringify(raw.output));
    return { jobId, status: 'failed', error: resultInvalid() };
  }

  const r2Key = `generated/hunyuan/${jobId}.mp4`;
  try {
    const permanentUrl = await mirrorUrlToR2(rawUrl, r2Key, 'video/mp4');
    return { jobId, status: 'completed', outputUrl: permanentUrl };
  } catch (err) {
    console.error('[hunyuan] R2 mirror failed — marking job failed:', (err as Error).message);
    return { jobId, status: 'failed', error: storageFailed() };
  }
}
