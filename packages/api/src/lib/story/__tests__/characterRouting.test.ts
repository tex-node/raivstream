/**
 * Track D Layer 1 — scene-image routing decision.
 *
 * Tests the pure `computeSceneImageRouting` (model selection, prompt shape,
 * ref truncation) + the renderer-version constant + the role-tag format. The
 * capability gate (`isFalCapabilityLive(config, 'imageEdit')`) is passed in as a
 * boolean, so no provider/fal call is involved.
 */
import { describe, it, expect } from 'vitest';
import { computeSceneImageRouting, roleTag, FLUX2_EDIT_ROLE_TAG_PREFIX } from '../characterIdentity';
import { SCENE_IMAGE_RENDERER_VERSION } from '../../sceneImageVersion';

const ref = (name: string) => ({ characterName: name, assetUrl: `https://cdn.test/${name}.png` });

describe('Track D Layer 1 — scene-image routing', () => {
  it('1. no approved references → text-only FLUX2', () => {
    const r = computeSceneImageRouting({ requestedModel: 'FLUX2', prompt: 'scene', approvedRefs: [], capabilityLive: true });
    expect(r.effectiveModel).toBe('FLUX2');
    expect(r.imageUrls).toEqual([]);
    expect(r.editLive).toBe(false);
    expect(r.effectivePrompt).toBe('scene');
  });

  it('2. one approved ref + capability live → FLUX2_EDIT with one ref + @image1 tag', () => {
    const r = computeSceneImageRouting({ requestedModel: 'FLUX2', prompt: 'scene', approvedRefs: [ref('Sneaky Hopper')], capabilityLive: true });
    expect(r.effectiveModel).toBe('FLUX2_EDIT');
    expect(r.imageUrls).toEqual(['https://cdn.test/Sneaky Hopper.png']);
    expect(r.effectivePrompt.startsWith('@image1 is Sneaky Hopper.')).toBe(true);
    expect(r.editLive).toBe(true);
  });

  it('3. two approved refs → both role tags in scene order', () => {
    const r = computeSceneImageRouting({ requestedModel: 'FLUX2', prompt: 'scene', approvedRefs: [ref('Sneaky Hopper'), ref('Pip')], capabilityLive: true });
    expect(r.effectiveModel).toBe('FLUX2_EDIT');
    expect(r.imageUrls).toHaveLength(2);
    expect(r.effectivePrompt.startsWith('@image1 is Sneaky Hopper. @image2 is Pip.')).toBe(true);
  });

  it('4. five approved refs → truncated to 4 (flagged)', () => {
    const r = computeSceneImageRouting({ requestedModel: 'FLUX2', prompt: 'scene', approvedRefs: ['A', 'B', 'C', 'D', 'E'].map(ref), capabilityLive: true });
    expect(r.imageUrls).toHaveLength(4);
    expect(r.truncated).toBe(true);
  });

  it('5. capability not live → FLUX2 even with refs (no partial refs)', () => {
    const r = computeSceneImageRouting({ requestedModel: 'FLUX2', prompt: 'scene', approvedRefs: [ref('Sneaky Hopper')], capabilityLive: false });
    expect(r.effectiveModel).toBe('FLUX2');
    expect(r.imageUrls).toEqual([]);
    expect(r.editLive).toBe(false);
  });

  it('6. renderer version is phase-d1-v1 (provenance written on the asset row)', () => {
    expect(SCENE_IMAGE_RENDERER_VERSION).toBe('phase-d1-v1');
  });

  it('7. role-tag format is @imageN (unverified for fal-ai/flux-2/edit)', () => {
    expect(FLUX2_EDIT_ROLE_TAG_PREFIX).toBe('@image');
    expect(roleTag('the scene', ['Sneaky Hopper', 'Pip'])).toBe(
      "@image1 is Sneaky Hopper. @image2 is Pip. Preserve each character's identity from its reference. Scene: the scene",
    );
  });
});
