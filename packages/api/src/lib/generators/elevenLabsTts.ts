/**
 * ElevenLabs text-to-speech — narration/dialogue voice generation (Phase 9B.3).
 *
 * Server-only adapter. Gated by ELEVENLABS_TTS_ENABLED and the presence of an
 * API key, and fail-closed on credit-rate configuration at the call site (the
 * `story:speech_generation` feature rate is intentionally unset until a
 * pricing decision is made). Never import from client components.
 *
 * Key resolution accepts `ELEVENLABS_API_KEY` or the legacy `11_LABS` name
 * (the staging cred file uses the latter).
 *
 * Output is MP3 (`audio/mpeg`). The mix pipeline normalizes formats via
 * ffmpeg (`normalizeAudioInput`), so no re-encoding is needed here.
 */

export const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1';

export interface ElevenLabsSpeechInput {
  text: string;
  voiceId: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
}

export interface ElevenLabsSpeechDeps {
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
}

export function elevenLabsApiKey(env: NodeJS.ProcessEnv = process.env): string | null {
  return env.ELEVENLABS_API_KEY ?? env['11_LABS'] ?? null;
}

export function isElevenLabsTtsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ELEVENLABS_TTS_ENABLED === 'true';
}

export function elevenLabsModelId(env: NodeJS.ProcessEnv = process.env): string {
  return env.ELEVENLABS_TTS_MODEL ?? 'eleven_multilingual_v2';
}

/** "Rachel" — a stable public ElevenLabs voice, used when no voice is specified. */
export const ELEVENLABS_DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';

export function elevenLabsDefaultVoiceId(env: NodeJS.ProcessEnv = process.env): string {
  return env.ELEVENLABS_DEFAULT_VOICE_ID ?? ELEVENLABS_DEFAULT_VOICE_ID;
}

/** Synthesize speech, returning MP3 bytes. Throws on any provider error. */
export async function synthesizeSpeech(
  input: ElevenLabsSpeechInput,
  deps: ElevenLabsSpeechDeps = {},
): Promise<Buffer> {
  const env = deps.env ?? process.env;
  const apiKey = elevenLabsApiKey(env);
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not set');
  const doFetch = deps.fetchImpl ?? fetch;

  const voiceId = input.voiceId || elevenLabsDefaultVoiceId(env);
  const res = await doFetch(`${ELEVENLABS_BASE_URL}/text-to-speech/${encodeURIComponent(voiceId)}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: input.text,
      model_id: input.modelId ?? elevenLabsModelId(env),
      voice_settings: {
        stability: input.stability ?? 0.5,
        similarity_boost: input.similarityBoost ?? 0.75,
        ...(input.style !== undefined ? { style: input.style } : {}),
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`ElevenLabs TTS error ${res.status}: ${body.slice(0, 300)}`);
  }

  return Buffer.from(await res.arrayBuffer());
}
