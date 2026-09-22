import { describe, it, expect, vi } from 'vitest';
import {
  isManifestStructurerEnabled,
  structureProductionManifest,
  normaliseProductionManifest,
  buildManifestUserMessage,
  GPT40_DEFAULT_MODEL,
} from '../productionStructurer';

const SAMPLE_MANIFEST = {
  title: 'The Ember’s Edge',
  logline: 'A weary knight discovers a relic pulsing with dark magic in a frozen wasteland.',
  master_style: 'Cinematic live-action photorealism, 35mm anamorphic lens, volumetric lighting, Kodachrome color grade',
  negative_prompt_suffix: '2d, animation, cartoon, illustration, anime, 3d render, low quality, morphing',
  characters: {
    ELDON: 'A 60-year-old knight with a grey beard, worn silver plate armor and a fur-lined cloak',
  },
  scenes: [
    {
      scene_id: 1,
      elevenlabs_narration: 'Sir Eldon knelt before the frozen anvil, his ragged breath blooming into pale mist.',
      minimax_video_prompt: 'Cinematic low-angle close up, worn steel armor with frost texture, slow push-in zoom toward knight’s tired eyes, soft blue volumetric lighting, atmospheric fog, 35mm lens, 24fps. Ambient sound of howling arctic wind and metallic armor creaking.',
      camera_motion: 'Slow push-in zoom',
      duration_sec: 6,
      resolution: '1080P',
      first_frame_image_url: null,
      shots: [
        {
          shot_id: 'SCENE_01_SHOT_01',
          timeframe: '00:00 - 00:05',
          camera_setup: 'Close-Up, Slow Push-In, Eye Level',
          action_description: 'Eldon kneels and breathes heavily.',
          video_prompt: 'Cinematic low-angle close up of ELDON, slow push-in, frost on steel.',
          transition_to_next: 'Cut to wide shot.',
        },
      ],
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
      // Master Visual Bible fields fall back to safe defaults when absent.
      expect(manifest.master_style.length).toBeGreaterThan(0);
      expect(manifest.negative_prompt_suffix).toContain('animation');
      expect(manifest.characters).toEqual({});
    });
    it('normalises the master visual bible + per-scene shot grid', () => {
      const manifest = normaliseProductionManifest(SAMPLE_MANIFEST, 'T');
      expect(manifest.master_style).toContain('photorealism');
      expect(manifest.negative_prompt_suffix).toContain('2d');
      expect(manifest.characters.ELDON).toContain('knight');
      expect(manifest.scenes[0].shots).toHaveLength(1);
      expect(manifest.scenes[0].shots![0].shot_id).toBe('SCENE_01_SHOT_01');
      expect(manifest.scenes[0].shots![0].camera_setup).toBe('Close-Up, Slow Push-In, Eye Level');
    });
    it('rejects a manifest with no scenes', () => {
      expect(() => normaliseProductionManifest({ title: 'T', logline: 'L', scenes: [] }, 'T')).toThrow();
    });
  });

  describe('buildManifestUserMessage', () => {
    it('injects the character bible so anchors are reused verbatim', () => {
      const message = buildManifestUserMessage({
        title: 'T',
        prose: 'the knight walks',
        supporting: { characterBible: 'ELDON: a 60-year-old knight with a grey beard' },
      });
      expect(message).toContain('ELDON: a 60-year-old knight with a grey beard');
      expect(message).toContain('Character bible');
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
        expect(body.messages[0].content).toContain('MASTER VISUAL BIBLE');
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
      expect(manifest.master_style).toContain('anamorphic');
      expect(manifest.negative_prompt_suffix).toContain('morphing');
      expect(manifest.characters.ELDON).toContain('knight');
      expect(manifest.scenes[0].shots?.[0].video_prompt).toContain('ELDON');
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