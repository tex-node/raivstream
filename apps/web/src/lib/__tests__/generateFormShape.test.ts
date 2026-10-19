import { describe, it, expect } from 'vitest';
import { generateFormShape, canSubmitGenerateForm } from '../generateFormShape';

/**
 * D-076 — AI Studio form shape.
 *
 * VEED Fabric is media-driven, so Prompt/Format/Duration must disappear and the
 * media inputs become mandatory. Everything else must keep exactly the fields it
 * has today — that's the regression half of this file, and the reason the shape
 * is a pure function rather than inline JSX conditions.
 */

describe('generateFormShape', () => {
  it('hides Prompt, Format and Duration for VEED_FABRIC', () => {
    const form = generateFormShape({ modelId: 'VEED_FABRIC', requiresSeedImage: true, requiresAudioUrl: true });

    expect(form.isFabric).toBe(true);
    expect(form.showPrompt).toBe(false);
    expect(form.showFormat).toBe(false);
    expect(form.showDuration).toBe(false);
    expect(form.showAudio).toBe(true);
  });

  it('requires presenter image + audio (and not a prompt) for VEED_FABRIC', () => {
    const form = generateFormShape({ modelId: 'VEED_FABRIC', requiresSeedImage: true, requiresAudioUrl: true });

    expect(form.requirePrompt).toBe(false);
    expect(form.requireSeedImage).toBe(true);
    expect(form.requireAudio).toBe(true);
  });

  it.each(['FLUX2', 'H3_MAX'])('leaves %s exactly as it is today', (modelId) => {
    const form = generateFormShape({
      modelId,
      requiresSeedImage: modelId === 'H3_MAX',
      requiresAudioUrl: false,
    });

    expect(form.isFabric).toBe(false);
    expect(form.showPrompt).toBe(true);
    expect(form.showFormat).toBe(true);
    expect(form.showDuration).toBe(true);
    expect(form.showAudio).toBe(false);
    expect(form.requirePrompt).toBe(true);
  });

  it('still requires a seed image for H3_MAX, and none for FLUX2', () => {
    expect(generateFormShape({ modelId: 'H3_MAX', requiresSeedImage: true }).requireSeedImage).toBe(true);
    expect(generateFormShape({ modelId: 'FLUX2' }).requireSeedImage).toBe(false);
  });
});

describe('canSubmitGenerateForm', () => {
  const fabric = generateFormShape({ modelId: 'VEED_FABRIC', requiresSeedImage: true, requiresAudioUrl: true });
  const flux = generateFormShape({ modelId: 'FLUX2' });

  it('blocks Fabric without an image, audio, or consent', () => {
    expect(canSubmitGenerateForm(fabric, { prompt: '', seedImageUrl: '', audioUrl: '', consent: false })).toBe(false);
    expect(canSubmitGenerateForm(fabric, { prompt: '', seedImageUrl: 'https://x/p.png', audioUrl: '', consent: true })).toBe(false);
    expect(canSubmitGenerateForm(fabric, { prompt: '', seedImageUrl: 'https://x/p.png', audioUrl: 'https://x/a.mp3', consent: false })).toBe(false);
  });

  it('allows Fabric with both media inputs and consent — and no prompt at all', () => {
    expect(canSubmitGenerateForm(fabric, {
      prompt: '', seedImageUrl: 'https://x/p.png', audioUrl: 'https://x/a.mp3', consent: true,
    })).toBe(true);
  });

  it('still requires a prompt for non-Fabric models', () => {
    expect(canSubmitGenerateForm(flux, { prompt: '   ', seedImageUrl: '', audioUrl: '', consent: false })).toBe(false);
    expect(canSubmitGenerateForm(flux, { prompt: 'a red fox', seedImageUrl: '', audioUrl: '', consent: false })).toBe(true);
  });
});
