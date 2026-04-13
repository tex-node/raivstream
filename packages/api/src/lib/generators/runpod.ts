/**
 * RunPod API client
 *
 * Two surfaces are used:
 *   1. Serverless API  (api.runpod.ai/v2/{endpointId}/…)  — for inference jobs
 *   2. REST Management (rest.runpod.io/v1/…)              — for pod lifecycle + billing
 *
 * Cost-optimisation rules baked in (per platform guidelines):
 *   - All long-running work goes through Serverless endpoints (auto-scales to zero).
 *   - Regular pod helpers (start/stop) are provided for dev/test pods only.
 *   - Outputs and models must live on a Network Volume; never on ephemeral pod storage.
 *
 * Required env vars:
 *   RUNPOD_API_KEY  — found in RunPod dashboard → Settings → API Keys
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type RunpodJobStatus =
  | 'IN_QUEUE'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'TIMED_OUT';

export interface RunpodJobResponse {
  id: string;
  status: RunpodJobStatus;
  /** Present when status === 'COMPLETED' */
  output?: unknown;
  /** Present when status === 'FAILED' */
  error?: string;
  executionTime?: number; // ms
  delayTime?: number;     // ms waiting in queue
}

export interface RunpodHealthResponse {
  jobs: {
    inProgress: number;
    inQueue:    number;
    completed:  number;
    failed:     number;
    retried:    number;
  };
  workers: {
    idle:       number;
    running:    number;
    throttled:  number;
  };
}

export interface RunpodPod {
  id:           string;
  name:         string;
  desiredStatus: 'RUNNING' | 'EXITED';
  imageName:    string;
  gpuCount:     number;
  vcpuCount:    number;
  memoryInGb:   number;
  costPerHr:    number;
  runtime?: {
    uptimeInSeconds: number;
    ports: Array<{ ip: string; isIpPublic: boolean; privatePort: number; publicPort: number; type: string }>;
  };
}

// ─── Base fetch helpers ───────────────────────────────────────────────────────

function getApiKey(): string {
  const key = process.env.RUNPOD_API_KEY;
  if (!key) throw new Error('RUNPOD_API_KEY is not set in environment variables');
  return key;
}

async function serverlessPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`https://api.runpod.ai/v2/${path}`, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RunPod serverless POST /${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function serverlessGet<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.runpod.ai/v2/${path}`, {
    headers: { Authorization: `Bearer ${getApiKey()}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RunPod serverless GET /${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function restGet<T>(path: string): Promise<T> {
  const res = await fetch(`https://rest.runpod.io/v1/${path}`, {
    headers: { Authorization: `Bearer ${getApiKey()}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RunPod REST GET /${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function restPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`https://rest.runpod.io/v1/${path}`, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RunPod REST POST /${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ─── Serverless Endpoint API ──────────────────────────────────────────────────

/**
 * Submit an async job to a RunPod Serverless endpoint.
 * Returns immediately with a job ID; poll with `getJobStatus`.
 *
 * @param endpointId  Your endpoint ID (e.g. "abc123xyz")
 * @param input       Arbitrary JSON payload forwarded to your handler
 * @param policy      Optional execution policy overrides
 */
export async function submitJob(
  endpointId: string,
  input: unknown,
  policy?: {
    executionTimeout?: number; // ms, default 300_000 (5 min)
    ttl?:              number; // ms job is retained after completion
  }
): Promise<{ jobId: string }> {
  const body: Record<string, unknown> = { input };
  if (policy?.executionTimeout || policy?.ttl) {
    body.policy = {
      ...(policy.executionTimeout ? { executionTimeout: policy.executionTimeout } : {}),
      ...(policy.ttl              ? { ttl:              policy.ttl }              : {}),
    };
  }
  const res = await serverlessPost<{ id: string }>(`${endpointId}/run`, body);
  return { jobId: res.id };
}

/**
 * Poll the status of a previously submitted job.
 */
export async function getJobStatus(endpointId: string, jobId: string): Promise<RunpodJobResponse> {
  return serverlessGet<RunpodJobResponse>(`${endpointId}/status/${jobId}`);
}

/**
 * Cancel a queued or running job.
 */
export async function cancelJob(endpointId: string, jobId: string): Promise<void> {
  await serverlessPost(`${endpointId}/cancel/${jobId}`, {});
}

/**
 * Check whether a Serverless endpoint is healthy and how many workers are available.
 */
export async function getEndpointHealth(endpointId: string): Promise<RunpodHealthResponse> {
  return serverlessGet<RunpodHealthResponse>(`${endpointId}/health`);
}

// ─── Job status normalisation ─────────────────────────────────────────────────

export type NormalisedStatus = 'queued' | 'generating' | 'completed' | 'failed';

export function normaliseStatus(raw: RunpodJobStatus): NormalisedStatus {
  switch (raw) {
    case 'IN_QUEUE':    return 'queued';
    case 'IN_PROGRESS': return 'generating';
    case 'COMPLETED':   return 'completed';
    case 'FAILED':
    case 'CANCELLED':
    case 'TIMED_OUT':   return 'failed';
  }
}

/**
 * Extract the video/image URL from a completed RunPod / ComfyUI job output.
 *
 * Handles the full range of shapes produced by RunPod serverless workers:
 *
 *   Custom handler (simple):
 *     { url: "https://..." }
 *     { video_url: "https://..." }
 *     { message: "https://..." }
 *
 *   ComfyUI serverless (runpod-worker-comfyui):
 *     { message: "https://runpod-output.s3.amazonaws.com/..." }          ← top-level object
 *     { videos: [{ url: "...", filename: "..." }] }                       ← VHS_SaveVideo node
 *     { gifs: [{ url: "...", filename: "..." }] }                         ← VHS_VideoCombine node
 *     [{ message: "..." }, ...]                                           ← array of node outputs
 *     [{ videos: [...] }, ...]
 *     [{ gifs: [...] }, ...]
 *
 *   Double-wrapped (RunPod sometimes nests output inside output):
 *     { output: { message: "..." } }
 *     { output: [{ videos: [...] }] }
 */
export function extractOutputUrl(output: unknown): string | undefined {
  if (!output) return undefined;

  // ── Unwrap double-nesting { output: ... } ──────────────────────────────────
  if (
    typeof output === 'object' &&
    !Array.isArray(output) &&
    'output' in (output as object)
  ) {
    const inner = extractOutputUrl((output as { output: unknown }).output);
    if (inner) return inner;
  }

  // ── Top-level object shapes ────────────────────────────────────────────────

  if (typeof output === 'object' && !Array.isArray(output)) {
    const obj = output as Record<string, unknown>;

    // { url: "https://..." }
    if (typeof obj.url === 'string' && obj.url.startsWith('http')) return obj.url;

    // { video_url: "https://..." }
    if (typeof obj.video_url === 'string' && obj.video_url.startsWith('http')) return obj.video_url;

    // { message: "https://..." }  (common RunPod ComfyUI output)
    if (typeof obj.message === 'string' && obj.message.startsWith('http')) return obj.message;

    // { videos: [{ url: "..." }] }  (VHS_SaveVideo)
    if (Array.isArray(obj.videos) && obj.videos[0]?.url) return obj.videos[0].url as string;

    // { gifs: [{ url: "..." }] }  (VHS_VideoCombine — mis-labels MP4s as gifs)
    if (Array.isArray(obj.gifs) && obj.gifs[0]?.url) return obj.gifs[0].url as string;

    // { images: [{ url: "..." }] }  (SaveImage)
    if (Array.isArray(obj.images) && obj.images[0]?.url) return obj.images[0].url as string;
  }

  // ── Array of per-node ComfyUI outputs ─────────────────────────────────────
  if (Array.isArray(output)) {
    for (const item of output) {
      if (!item || typeof item !== 'object') continue;
      const node = item as Record<string, unknown>;

      if (typeof node.message === 'string' && node.message.startsWith('http')) return node.message;
      if (Array.isArray(node.videos) && node.videos[0]?.url) return node.videos[0].url as string;
      if (Array.isArray(node.gifs)   && node.gifs[0]?.url)   return node.gifs[0].url   as string;
      if (Array.isArray(node.images) && node.images[0]?.url) return node.images[0].url as string;
    }
  }

  return undefined;
}

// ─── Pod Lifecycle Management (dev/test pods only) ────────────────────────────
// NOTE: For production user-facing inference, use Serverless endpoints (above).
//       These helpers are for managing developer pods used during model testing.

/** List all pods in the account */
export async function listPods(): Promise<RunpodPod[]> {
  const data = await restGet<{ data: { myself: { pods: RunpodPod[] } } }>('pods');
  return data?.data?.myself?.pods ?? [];
}

/** Get a single pod by ID */
export async function getPod(podId: string): Promise<RunpodPod | null> {
  const pods = await listPods();
  return pods.find((p) => p.id === podId) ?? null;
}

/** Start a stopped pod (resumes GPU billing) */
export async function startPod(podId: string, gpuCount = 1): Promise<void> {
  await restPost(`pods/${podId}/start`, { gpuCount });
}

/** Stop a running pod (halts GPU billing; Network Volume data is preserved) */
export async function stopPod(podId: string): Promise<void> {
  await restPost(`pods/${podId}/stop`);
}

/** Terminate (destroy) a pod completely — only ephemeral storage is lost */
export async function terminatePod(podId: string): Promise<void> {
  await restPost(`pods/${podId}/terminate`);
}

// ─── Billing / Usage ──────────────────────────────────────────────────────────

export interface RunpodUserInfo {
  id:             string;
  email:          string;
  creditBalance:  number; // USD
  referralCode?:  string;
}

/** Fetch the current account balance and user info */
export async function getUserInfo(): Promise<RunpodUserInfo> {
  const data = await restGet<{ data: { myself: RunpodUserInfo } }>('users/myself');
  return data.data.myself;
}

// ─── Resolution & frame helpers ───────────────────────────────────────────────

export interface VideoResolution { width: number; height: number }

/**
 * Map a human aspect-ratio string to the nearest supported resolution.
 * Values are conservative defaults tuned for GPU VRAM constraints.
 */
export function aspectRatioToResolution(
  ar: string | undefined,
  preset: 'ltx2' | 'wan25' | 'flux' | 'hunyuan' | 'cogvideox' | 'default' = 'default'
): VideoResolution {
  // LTX-Video 2 native resolutions (multiples of 32, T/8+1 frame constraint)
  if (preset === 'ltx2') {
    switch (ar) {
      case '9:16': return { width: 576,  height: 1024 };
      case '16:9': return { width: 1024, height: 576  };
      case '4:3':  return { width: 768,  height: 576  };
      case '3:4':  return { width: 576,  height: 768  };
      default:     return { width: 768,  height: 768  }; // 1:1
    }
  }
  // Wan 2.5 (480p primary, multiples of 16)
  if (preset === 'wan25') {
    switch (ar) {
      case '9:16': return { width: 480,  height: 832  };
      case '16:9': return { width: 832,  height: 480  };
      case '4:3':  return { width: 640,  height: 480  };
      case '3:4':  return { width: 480,  height: 640  };
      default:     return { width: 624,  height: 624  }; // 1:1
    }
  }
  // Flux.1 — 1024px native, multiples of 64
  if (preset === 'flux') {
    switch (ar) {
      case '9:16': return { width: 768,  height: 1360 };
      case '16:9': return { width: 1360, height: 768  };
      case '4:3':  return { width: 1024, height: 768  };
      case '3:4':  return { width: 768,  height: 1024 };
      default:     return { width: 1024, height: 1024 }; // 1:1
    }
  }
  // HunyuanVideo — 720p, multiples of 16
  if (preset === 'hunyuan') {
    switch (ar) {
      case '9:16': return { width: 720,  height: 1280 };
      case '16:9': return { width: 1280, height: 720  };
      case '4:3':  return { width: 960,  height: 720  };
      case '3:4':  return { width: 720,  height: 960  };
      default:     return { width: 960,  height: 960  }; // 1:1
    }
  }
  // CogVideoX — 480p native, multiples of 16
  if (preset === 'cogvideox') {
    switch (ar) {
      case '9:16': return { width: 480,  height: 848  };
      case '16:9': return { width: 848,  height: 480  };
      case '4:3':  return { width: 640,  height: 480  };
      case '3:4':  return { width: 480,  height: 640  };
      default:     return { width: 480,  height: 480  }; // 1:1
    }
  }
  // Generic fallback
  switch (ar) {
    case '9:16': return { width: 576,  height: 1024 };
    case '16:9': return { width: 1024, height: 576  };
    default:     return { width: 768,  height: 768  };
  }
}

/**
 * Convert duration (seconds) → number of video frames.
 *
 * LTX-Video 2 constraint: frames must satisfy (n - 1) % 8 === 0
 * Valid values: 1, 9, 17, 25, 33, 41, 49, 57, 65, 73, 81, 89, 97, 105, 113, 121 …
 *
 * CogVideoX constraint: same (n - 1) % 8 === 0, hard cap at 49 frames (model limit)
 *
 * HunyuanVideo: multiples of 4, up to ~120 frames at 24 fps
 */
export function durationToFrames(
  durationSec: number,
  fps: number,
  model: 'ltx2' | 'wan25' | 'hunyuan' | 'cogvideox' | 'default'
): number {
  const raw = Math.round(durationSec * fps);
  if (model === 'ltx2') {
    // Round to nearest valid value: (n - 1) % 8 === 0, n >= 9
    const remainder = (raw - 1) % 8;
    const adjusted = remainder <= 4 ? raw - remainder : raw + (8 - remainder);
    return Math.max(9, adjusted); // minimum 9 frames for LTX2
  }
  if (model === 'wan25') {
    // Wan 2.5: multiples of 4 are safe; cap at 121 for VRAM reasons
    return Math.min(121, Math.max(16, Math.round(raw / 4) * 4));
  }
  if (model === 'cogvideox') {
    // CogVideoX: (n - 1) % 8 === 0, hard cap at 49 (model architecture limit)
    const remainder = (raw - 1) % 8;
    const adjusted = remainder <= 4 ? raw - remainder : raw + (8 - remainder);
    return Math.min(49, Math.max(9, adjusted));
  }
  if (model === 'hunyuan') {
    // HunyuanVideo: multiples of 4, cap at 120 frames for 24 GB GPUs
    return Math.min(120, Math.max(16, Math.round(raw / 4) * 4));
  }
  return Math.max(1, raw);
}
