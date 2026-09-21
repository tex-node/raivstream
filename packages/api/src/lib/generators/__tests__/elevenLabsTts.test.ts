import { describe, it, expect, vi } from 'vitest';
import {
  ELEVENLABS_DEFAULT_VOICE_ID,
  elevenLabsApiKey,
  elevenLabsDefaultVoiceId,
  elevenLabsModelId,
  isElevenLabsTtsEnabled,
  synthesizeSpeech,
} from '../elevenLabsTts';

describe('ElevenLabs TTS adapter', () => {
  it('resolves the API key from ELEVENLABS_API_KEY or the legacy 11_LABS', () => {
    expect(elevenLabsApiKey({ ELEVENLABS_API_KEY: 'a' })).toBe('a');
    expect(elevenLabsApiKey({ '11_LABS': 'b' })).toBe('b');
    expect(elevenLabsApiKey({})).toBeNull();
  });

  it('is off unless ELEVENLABS_TTS_ENABLED=true', () => {
    expect(isElevenLabsTtsEnabled({})).toBe(false);
    expect(isElevenLabsTtsEnabled({ ELEVENLABS_TTS_ENABLED: 'true' })).toBe(true);
  });

  it('reads model + default voice from env', () => {
    expect(elevenLabsModelId({})).toBe('eleven_multilingual_v2');
    expect(elevenLabsModelId({ ELEVENLABS_TTS_MODEL: 'eleven_turbo_v2_5' })).toBe('eleven_turbo_v2_5');
    expect(elevenLabsDefaultVoiceId({})).toBe(ELEVENLABS_DEFAULT_VOICE_ID);
    expect(elevenLabsDefaultVoiceId({ ELEVENLABS_DEFAULT_VOICE_ID: 'custom' })).toBe('custom');
  });

  it('posts to the voice endpoint with the API key and returns audio bytes', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    }) as unknown as Response);

    const buffer = await synthesizeSpeech(
      { text: 'Hello world', voiceId: 'voice_1' },
      { fetchImpl: fetchImpl as unknown as typeof fetch, env: { ELEVENLABS_API_KEY: 'key_1' } },
    );

    expect(buffer.equals(Buffer.from([1, 2, 3]))).toBe(true);
    const [url, options] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/text-to-speech/voice_1');
    expect((options.headers as Record<string, string>)['xi-api-key']).toBe('key_1');
    expect(JSON.parse(options.body as string)).toMatchObject({ text: 'Hello world', model_id: 'eleven_multilingual_v2' });
  });

  it('throws when no key is configured', async () => {
    await expect(synthesizeSpeech({ text: 'x', voiceId: 'v' }, { env: {} })).rejects.toThrow(/ELEVENLABS_API_KEY/);
  });

  it('throws on a provider error', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401, text: async () => 'unauthorized' }) as unknown as Response);
    await expect(
      synthesizeSpeech({ text: 'x', voiceId: 'v' }, { fetchImpl: fetchImpl as unknown as typeof fetch, env: { ELEVENLABS_API_KEY: 'k' } }),
    ).rejects.toThrow(/ElevenLabs TTS error 401/);
  });
});
