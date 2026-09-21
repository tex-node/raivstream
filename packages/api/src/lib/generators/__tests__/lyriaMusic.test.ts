import { describe, it, expect, vi } from 'vitest';
import {
  LYRIA_DEFAULT_MODEL,
  geminiApiKey,
  generateMusic,
  isLyriaMusicEnabled,
  lyriaModelId,
} from '../lyriaMusic';

describe('Lyria music adapter', () => {
  it('reads the Gemini key, flag, and model from env', () => {
    expect(geminiApiKey({ GEMINI_API_KEY: 'g' })).toBe('g');
    expect(geminiApiKey({})).toBeNull();
    expect(isLyriaMusicEnabled({})).toBe(false);
    expect(isLyriaMusicEnabled({ LYRIA_MUSIC_ENABLED: 'true' })).toBe(true);
    expect(lyriaModelId({})).toBe(LYRIA_DEFAULT_MODEL);
    expect(lyriaModelId({ LYRIA_MUSIC_MODEL: 'lyria-3-pro-preview' })).toBe('lyria-3-pro-preview');
  });

  it('posts to generateContent and decodes base64 audio from inlineData', async () => {
    const audioBytes = Buffer.from('music');
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/mpeg', data: audioBytes.toString('base64') } }] } }] }),
    }) as unknown as Response);

    const result = await generateMusic(
      { prompt: 'calm piano', negativePrompt: 'drums' },
      { fetchImpl: fetchImpl as unknown as typeof fetch, env: { GEMINI_API_KEY: 'g' } },
    );

    expect(result.audio.equals(audioBytes)).toBe(true);
    expect(result.mimeType).toBe('audio/mpeg');
    const [url, options] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/models/lyria-3-clip-preview:generateContent');
    expect(url).toContain('key=g');
    expect(JSON.parse(options.body as string).contents[0].parts[0].text).toContain('Avoid: drums');
  });

  it('throws when no key is configured', async () => {
    await expect(generateMusic({ prompt: 'x' }, { env: {} })).rejects.toThrow(/GEMINI_API_KEY/);
  });

  it('throws on a provider error', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 400, text: async () => 'bad request' }) as unknown as Response);
    await expect(
      generateMusic({ prompt: 'x' }, { fetchImpl: fetchImpl as unknown as typeof fetch, env: { GEMINI_API_KEY: 'g' } }),
    ).rejects.toThrow(/Lyria music error 400/);
  });

  it('throws when the response has no audio part', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'no audio' }] } }] }) }) as unknown as Response);
    await expect(
      generateMusic({ prompt: 'x' }, { fetchImpl: fetchImpl as unknown as typeof fetch, env: { GEMINI_API_KEY: 'g' } }),
    ).rejects.toThrow(/no audio data/);
  });
});
