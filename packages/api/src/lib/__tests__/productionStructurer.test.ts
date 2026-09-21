import { describe, it, expect, vi } from 'vitest';
import {
  isManifestStructurerEnabled,
  structureProductionManifest,
  normaliseProductionManifest,
  GPT40_DEFAULT_MODEL,
} from '../productionStructurer';

const SAMPLE_MANIFEST = {
  title: 'The Ember’s Edge',
  logline: 'A weary knight discovers a relic pulsing with dark magic in a frozen wasteland.',
  scenes: [
    {
      scene_id: 1,
      elevenlabs_narration: 'Sir Eldon knelt before the frozen anvil, his ragged breath blooming into pale mist.',
      minimax_video_prompt: 'Cinematic low-angle close up, worn steel armor with frost texture, slow push-in zoom toward knight’s tired eyes, soft blue volumetric lighting, atmospheric fog, 35mm lens, 24fps. Ambient sound of howling arctic wind and metallic armor creaking.',
      camera_motion: 'Slow push-in zoom',
      duration_sec: 6,
      resolution: '1080P',
      first_frame_image_url: null,
    },
  ],
};

function openAiResponse(content: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
  } as unknown as Response;
}

describe('productionStructurer', () => {
  describe('isManifestStructurerEnabled', () => {
    it('is off unless the flag is true', () => {
      expect(isManifestStructurerEnabled({ GPT40_API: 'key' })).toBe(false);
      expect(isManifestStructurerEnabled({})).toBe(false);
    });
    it('is on only when flag + key present', () => {
      expect(isManifestStructurerEnabled({ STORY_MANIFEST_STRUCTURER_ENABLED: 'true', GPT40_API: 'key' })).toBe(true);
      expect(isManifestStructurerEnabled({ STORY_MANIFEST_STRUCTURER_ENABLED: 'true' })).toBe(false);
    });
    it('accepts the OPENAI_API_KEY alias', () => {
      expect(isManifestStructurerEnabled({ STORY_MANIFEST_STRUCTURER_ENABLED: 'true', OPENAI_API_KEY: 'key' })).toBe(true);
    });
  });

  describe('normaliseProductionManifest', () => {
    it('clamps duration, normalises resolution and nulls missing first frame', () => {
      const manifest = normaliseProductionManifest(
        {
          title: 'T',
          logline: 'L',
          scenes: [
            {
              scene_id: 1,
              elevenlabs_narration: 'narr',
              minimax_video_prompt: 'prompt',
              camera_motion: 'Orbit',
              duration_sec: 40,
              resolution: '1080p',
            },
          ],
        },
        'T',
      );
      expect(manifest.scenes[0].duration_sec).toBe(15);
      expect(manifest.scenes[0].resolution).toBe('1080P');
      expect(manifest.scenes[0].first_frame_image_url).toBeNull();
    });
    it('rejects a manifest with no scenes', () => {
      expect(() => normaliseProductionManifest({ title: 'T', logline: 'L', scenes: [] }, 'T')).toThrow();
    });
  });

  describe('structureProductionManifest', () => {
    it('throws when disabled', async () => {
      await expect(
        structureProductionManifest({ prose: 'x' }, { env: {} }),
      ).rejects.toThrow(/not enabled/);
    });

    it('generates a manifest through GPT-4o and validates it', async () => {
      const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
        const body = JSON.parse(String((init as RequestInit).body));
        expect(body.model).toBe(GPT40_DEFAULT_MODEL);
        expect(body.response_format).toEqual({ type: 'json_object' });
        expect(body.messages[0].content).toContain('Director of Photography');
        return openAiResponse(JSON.stringify(SAMPLE_MANIFEST));
      });
      const manifest = await structureProductionManifest(
        { title: 'The Ember’s Edge', prose: 'story prose here', audienceMode: 'GENERAL' },
        { env: { STORY_MANIFEST_STRUCTURER_ENABLED: 'true', GPT40_API: 'key' }, fetchImpl: fetchMock },
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(manifest.title).toBe('The Ember’s Edge');
      expect(manifest.scenes).toHaveLength(1);
      expect(manifest.scenes[0].resolution).toBe('1080P');
      expect(manifest.scenes[0].duration_sec).toBe(6);
    });

    it('throws when the provider returns invalid JSON', async () => {
      const fetchMock = vi.fn<typeof fetch>(async () => openAiResponse('sorry, no json here'));
      await expect(
        structureProductionManifest(
          { prose: 'x' },
          { env: { STORY_MANIFEST_STRUCTURER_ENABLED: 'true', GPT40_API: 'key' }, fetchImpl: fetchMock },
        ),
      ).rejects.toThrow();
    });

    it('throws on a non-2xx provider response', async () => {
      const fetchMock = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) } as unknown as Response));
      await expect(
        structureProductionManifest(
          { prose: 'x' },
          { env: { STORY_MANIFEST_STRUCTURER_ENABLED: 'true', GPT40_API: 'key' }, fetchImpl: fetchMock },
        ),
      ).rejects.toThrow(/500/);
    });
  });
});