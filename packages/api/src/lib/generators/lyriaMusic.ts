/**
 * Lyria music generation — instrumental background score (Phase 11 / music).
 *
 * Server-only adapter for Google DeepMind's Lyria music models via the Gemini
 * API. Reuses `GEMINI_API_KEY` (same key as Nano Banana / Veo 3) — no new vendor.
 *
 * Models (override via `LYRIA_MUSIC_MODEL`):
 *   - lyria-3-clip-preview  → fixed 30s clip (default)
 *   - lyria-3-pro-preview   → full-length track (~2 min)
 *
 * Gated by `LYRIA_MUSIC_ENABLED` + key presence, and fail-closed on the
 * `story:audio_generation` credit rate at the call site. Output is base64 audio
 * (MP3 by default); the mix pipeline normalizes formats via ffmpeg.
 */

export const LYRIA_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
export const LYRIA_DEFAULT_MODEL = 'lyria-3-clip-preview';

export interface LyriaMusicInput {
  prompt: string;
  negativePrompt?: string;
  modelId?: string;
}

export interface LyriaMusicResult {
  audio: Buffer;
  mimeType: string;
}

export interface LyriaMusicDeps {
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
}

export function geminiApiKey(env: NodeJS.ProcessEnv = process.env): string | null {
  return env.GEMINI_API_KEY ?? null;
}

export function isLyriaMusicEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.LYRIA_MUSIC_ENABLED === 'true';
}

export function lyriaModelId(env: NodeJS.ProcessEnv = process.env): string {
  return env.LYRIA_MUSIC_MODEL ?? LYRIA_DEFAULT_MODEL;
}

function findAudioPart(payload: unknown): { data: string; mimeType?: string } | null {
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as Record<string, any>;

  const fromParts = (parts: unknown): { data: string; mimeType?: string } | null => {
    if (!Array.isArray(parts)) return null;
    for (const part of parts) {
      const inline = (part as Record<string, any>)?.inlineData;
      if (inline && typeof inline.data === 'string' && inline.data.length > 0) {
        return { data: inline.data, mimeType: typeof inline.mimeType === 'string' ? inline.mimeType : undefined };
      }
    }
    return null;
  };

  if (Array.isArray(obj.candidates)) {
    for (const candidate of obj.candidates) {
      const found = fromParts(candidate?.content?.parts);
      if (found) return found;
    }
  }
  // Interactions API convenience shape
  const outputAudio = obj.outputAudio ?? obj.output_audio;
  if (outputAudio && typeof outputAudio.data === 'string') {
    return { data: outputAudio.data, mimeType: typeof outputAudio.mimeType === 'string' ? outputAudio.mimeType : undefined };
  }
  return null;
}

/** Generate instrumental music, returning decoded audio bytes. Throws on error. */
export async function generateMusic(
  input: LyriaMusicInput,
  deps: LyriaMusicDeps = {},
): Promise<LyriaMusicResult> {
  const env = deps.env ?? process.env;
  const apiKey = geminiApiKey(env);
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
  const doFetch = deps.fetchImpl ?? fetch;

  const model = input.modelId ?? lyriaModelId(env);
  const prompt = input.negativePrompt ? `${input.prompt}. Avoid: ${input.negativePrompt}` : input.prompt;

  const res = await doFetch(`${LYRIA_BASE_URL}/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['AUDIO'] },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Lyria music error ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const part = findAudioPart(data);
  if (!part) throw new Error('Lyria returned no audio data');

  return { audio: Buffer.from(part.data, 'base64'), mimeType: part.mimeType ?? 'audio/mpeg' };
}
