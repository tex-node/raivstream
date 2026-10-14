/**
 * Track D Layer 1 — deterministic scene-image seed.
 *
 * The FLUX2_EDIT route pins a seed derived from the scene id so a reference-
 * conditioned still is reproducible across regenerations (same seed + same prompt
 * + same references → same output, modulo endpoint nondeterminism). The non-edit
 * FLUX2 path keeps `seed: undefined` (unchanged behaviour).
 *
 * FNV-1a, folded to a positive 31-bit int. Pure + stable across runs/processes.
 */
export function deterministicSeed(sceneId: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < sceneId.length; i += 1) {
    h ^= sceneId.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h & 0x7fffffff;
}
