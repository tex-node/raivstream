/**
 * D-002 - credit cost estimation for `generation.listModels`.
 *
 * Flat models charge one `MODEL_FEATURE_KEY` rate. H3_MAX and VEED_FABRIC are
 * billed **per second** at a resolution-specific key when
 * `VIDEO_PER_SECOND_PRICING` is on, so reporting the flat key under-stated the
 * real charge by 7x for Fabric (advertised 300, billed 2,100).
 *
 * The estimate mirrors the charge path exactly - including the flag - so the UI
 * cannot drift from what `generation.create` actually deducts.
 */

import { MODEL_FEATURE_KEY, h3MaxFeatureKey, veedFabricFeatureKey } from './credits';

/** Every model that has a feature key (the SupportedModel union). */
type CostModel = keyof typeof MODEL_FEATURE_KEY;

/** `create` defaults `duration` to 5 when the client omits it. */
export const PER_SECOND_DEFAULT_SECONDS = 5;

export function perSecondModelResolution(model: CostModel | string): string | null {
  if (model === 'H3_MAX') return '768P';
  if (model === 'VEED_FABRIC') return '720p';
  return null;
}

export function perSecondFeatureKey(model: CostModel | string, resolution: string): string | null {
  if (model === 'H3_MAX') return h3MaxFeatureKey(resolution);
  if (model === 'VEED_FABRIC') return veedFabricFeatureKey(resolution);
  return null;
}

/**
 * Estimated credits for one generation. Returns null when no rate is configured.
 *
 * `perSecondEnabled` MUST be the same flag `create` uses; when it is off the
 * per-second keys are ignored and the flat rate applies.
 */
export function estimateModelCreditCost(input: {
  model: CostModel;
  rateMap: Record<string, number>;
  perSecondEnabled: boolean;
  seconds?: number;
}): number | null {
  const seconds = input.seconds ?? PER_SECOND_DEFAULT_SECONDS;
  const resolution = perSecondModelResolution(input.model);

  if (input.perSecondEnabled && resolution) {
    const key = perSecondFeatureKey(input.model, resolution);
    const perSecond = key ? input.rateMap[key] : undefined;
    if (perSecond != null) return Math.ceil(perSecond * seconds);
  }

  return input.rateMap[MODEL_FEATURE_KEY[input.model]] ?? null;
}

/** Resolutions each per-second model can be billed at. */
export const PER_SECOND_RESOLUTIONS: Record<string, readonly string[]> = {
  VEED_FABRIC: ['480p', '720p', '1080p'],
  H3_MAX: ['480P', '768P', '1080P'],
};

/**
 * Every resolution's price for a per-second model - the Avatar picker needs the
 * whole set, not just the default.
 */
export function estimatePerSecondCosts(input: {
  model: CostModel;
  rateMap: Record<string, number>;
  seconds?: number;
}): Record<string, number> | null {
  const resolutions = PER_SECOND_RESOLUTIONS[input.model];
  if (!resolutions) return null;

  const seconds = input.seconds ?? PER_SECOND_DEFAULT_SECONDS;
  const costs: Record<string, number> = {};
  for (const resolution of resolutions) {
    const key = perSecondFeatureKey(input.model, resolution);
    const rate = key ? input.rateMap[key] : undefined;
    if (rate != null) costs[resolution] = Math.ceil(rate * seconds);
  }

  return Object.keys(costs).length > 0 ? costs : null;
}