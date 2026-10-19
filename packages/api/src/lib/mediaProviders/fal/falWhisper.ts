/**
 * D-076 — fal Whisper transcription.
 *
 * Chosen over OpenAI `whisper-1` because the fal endpoint accepts the audio as a
 * **URL** (`audio_url`), so a signed R2 object is transcribed in place. OpenAI's
 * `/v1/audio/transcriptions` requires a multipart upload, which would mean
 * downloading and re-uploading up to 25 MB inside a request that also has to
 * moderate an image — a failure mode with no safety benefit.
 *
 * Model: Whisper large-v3 (served by fal), same `FAL_KEY` as FLUX2/H3/VEED.
 * Uses the queue API (like `falMediaProvider`) with a hard 10 s budget: the gate
 * is fail-open, so a slow transcription must degrade to `unknown`, not stall the
 * user's request.
 */

const ENDPOINT = 'fal-ai/whisper';
const DEFAULT_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 400;

interface FalQueueLike {
  config(options: { credentials: string }): void;
  queue: {
    submit(endpoint: string, options: { input: unknown }): Promise<{ request_id: string }>;
    status(endpoint: string, options: { requestId: string }): Promise<{ status: string }>;
    result(endpoint: string, options: { requestId: string }): Promise<{ data?: unknown }>;
  };
}

export interface WhisperOutput {
  text?: string;
  chunks?: Array<{ text?: string }>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

/** fal returns `{ text }` for task=transcribe, or `chunks[]` when segmenting. */
export function extractTranscript(data: unknown): string {
  const out = (data ?? {}) as WhisperOutput;
  if (typeof out.text === 'string') return out.text;
  if (Array.isArray(out.chunks)) {
    return out.chunks.map((c) => c?.text ?? '').join(' ').trim();
  }
  return '';
}

/**
 * Transcribe a remote audio URL. Throws on timeout/failure — the caller
 * (Fabric gate) treats any throw as `transcription_unavailable` and fails open.
 */
export async function transcribeAudio(
  audioUrl: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<string> {
  const mod = await import('@fal-ai/client');
  const fal = (mod as unknown as { fal: FalQueueLike }).fal;

  const credentials = process.env.FAL_KEY;
  if (!credentials) throw new Error('FAL_KEY is not set');
  fal.config({ credentials });

  // Payload: { audio_url, task: 'transcribe' }. `language` is intentionally
  // omitted — auto-detect first; a hint can come later if quality demands it.
  const submitted = await fal.queue.submit(ENDPOINT, {
    input: { audio_url: audioUrl, task: 'transcribe' },
  });
  const requestId = submitted.request_id;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const status = await fal.queue.status(ENDPOINT, { requestId });
    if (status.status === 'COMPLETED') {
      const result = await fal.queue.result(ENDPOINT, { requestId });
      return extractTranscript(result.data);
    }
    if (status.status === 'FAILED') throw new Error('fal whisper job failed');
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`fal whisper timed out after ${timeoutMs}ms`);
}
