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

import { breakerFor } from '../resilience/circuitBreaker';

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

export interface ElevenLabsVoice {
  voiceId: string;
  name: string;
}

/** Well-known public ElevenLabs voices — fallback when the account voices API
 * is unreachable, so the narration UI always has options. */
export const ELEVENLABS_CURATED_VOICES: ElevenLabsVoice[] = [
  { voiceId: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel (default)' },
  { voiceId: 'ErXwobaYiN019PkySvjV', name: 'Antoni' },
  { voiceId: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella' },
  { voiceId: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli' },
  { voiceId: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh' },
  { voiceId: 'pNInz6obpgDQGcFmaJgB', name: 'Adam' },
  { voiceId: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam' },
  { voiceId: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi' },
];

/** List the account's ElevenLabs voices (voiceId + name). Empty on any error —
 * callers fall back to ELEVENLABS_CURATED_VOICES. Server-only. */
export async function listElevenLabsVoices(deps: ElevenLabsSpeechDeps = {}): Promise<ElevenLabsVoice[]> {
  const env = deps.env ?? process.env;
  const apiKey = elevenLabsApiKey(env);
  if (!apiKey) return [];
  try {
    // D-067 — voices shares the TTS breaker: an account that is unhealthy for
    // synthesis is unlikely to serve voices happily. A failure here still falls
    // back to the curated list below.
    const res = await breakerFor('elevenlabs').call(async () => {
      const response = await (deps.fetchImpl ?? fetch)(`${ELEVENLABS_BASE_URL}/voices`, {
        headers: { 'xi-api-key': apiKey },
      });
      if (!response.ok) {
        throw Object.assign(new Error(`ElevenLabs voices error ${response.status}`), { status: response.status });
      }
      return response;
    });
    const payload = (await res.json()) as { voices?: Array<{ voice_id: string; name: string }> };
    return (payload.voices ?? []).map((voice) => ({ voiceId: voice.voice_id, name: voice.name }));
  } catch {
    return [];
  }
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
  // D-067 — breaker around the provider call only; the !ok check lives inside so
  // a 5xx counts as a health failure. 4xx/429 are ignored by the classifier.
  const res = await breakerFor('elevenlabs').call(async () => {
    const response = await doFetch(`${ELEVENLABS_BASE_URL}/text-to-speech/${encodeURIComponent(voiceId)}`, {
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
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw Object.assign(
        new Error(`ElevenLabs TTS error ${response.status}: ${body.slice(0, 300)}`),
        { status: response.status },
      );
    }
    return response;
  });

  return Buffer.from(await res.arrayBuffer());
}
