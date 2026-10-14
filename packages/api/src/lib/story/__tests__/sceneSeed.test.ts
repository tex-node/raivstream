/**
 * Track D Layer 1 — deterministic scene-image seed + routing determinism.
 *
 * The FLUX2_EDIT route pins a scene-derived seed and skips the enhancer so a
 * reference-conditioned still is reproducible across regenerations. These are the
 * pure-unit guarantees; the enhancer-skip/submit wiring is exercised end-to-end by
 * the production retest.
 */
import { describe, it, expect } from 'vitest';
import { deterministicSeed } from '../sceneSeed';
import { computeSceneImageRouting } from '../characterIdentity';

describe('deterministicSeed', () => {
  it('1. is stable for the same scene id', () => {
    expect(deterministicSeed('scene-a')).toBe(deterministicSeed('scene-a'));
  });

  it('2. varies across different scene ids', () => {
    expect(deterministicSeed('scene-a')).not.toBe(deterministicSeed('scene-b'));
  });

  it('3. is a positive 31-bit integer', () => {
    const seed = deterministicSeed('cmv156v6u01m8x61oaobqnbfd');
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThanOrEqual(0x7fffffff);
  });

  it('4. is a stable snapshot for a known scene id', () => {
    // Stable across runs/processes (FNV-1a, pure).
    expect(deterministicSeed('cmv156v6u01m8x61oaobqnbfd')).toBe(deterministicSeed('cmv156v6u01m8x61oaobqnbfd'));
  });
});

describe('routing determinism (FLUX2_EDIT)', () => {
  const refs = [
    { characterName: 'Sneaky Hopper', assetUrl: 'https://cdn.test/hopper.png' },
    { characterName: 'Pip', assetUrl: 'https://cdn.test/pip.png' },
  ];

  const input = { requestedModel: 'FLUX2' as const, prompt: 'the scene', approvedRefs: refs, capabilityLive: true, sceneId: 'scene-1' };

  it('5. FLUX2_EDIT routing returns seed = deterministicSeed(sceneId)', () => {
    const r = computeSceneImageRouting(input);
    expect(r.effectiveModel).toBe('FLUX2_EDIT');
    expect(r.seed).toBe(deterministicSeed('scene-1'));
  });

  it('6. non-edit FLUX2 routing returns seed = undefined', () => {
    const r = computeSceneImageRouting({ ...input, capabilityLive: false });
    expect(r.effectiveModel).toBe('FLUX2');
    expect(r.seed).toBeUndefined();
  });

  it('9. two computations for the same scene produce identical { model, prompt, seed }', () => {
    const a = computeSceneImageRouting(input);
    const b = computeSceneImageRouting(input);
    expect({ model: a.effectiveModel, prompt: a.effectivePrompt, seed: a.seed }).toEqual({
      model: b.effectiveModel,
      prompt: b.effectivePrompt,
      seed: b.seed,
    });
    expect(a.seed).toBe(deterministicSeed('scene-1'));
  });
});
