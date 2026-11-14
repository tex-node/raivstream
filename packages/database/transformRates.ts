/**
 * Transformation credit rates (2026-11-14).
 *
 * The conversion is READ from the existing seed rows, not invented: Recast ($0.30 -> 850, $0.45 -> 1,250),
 * RTV ($0.05 -> 140, $0.08 -> 225, $0.16 -> 450) and VEED ($0.08 -> 225, $0.15 -> 420, $0.07 -> 200) all
 * sit at ~2,800 credits per dollar. The three H3 turbo rows sit at 3,200 and that 14% spread is recorded
 * rather than averaged away; transformation rates derive at 2,800.
 *
 * ONE ROW PER OPERATION x RESOLUTION TIER, because the provider prices that way: relight alone runs
 * $0.05/s to $0.32/s, so a single flat rate cannot carry it.
 */
export const TRANSFORM_CREDITS_PER_DOLLAR = 2800;

export interface TransformRate {
  featureKey: string;
  /** Provider price per SECOND, US dollars - the basis the credits are derived from. */
  usdPerSecond: number;
  creditsPerSecond: number;
  /** What the number is billed on, when that is not the output duration. */
  billedOn: 'output' | 'output-x2-min' | 'billed-second';
  /** Anything a reader must know before multiplying by a duration. */
  note?: string;
}

function rate(featureKey: string, usdPerSecond: number, billedOn: TransformRate['billedOn'], note?: string): TransformRate {
  return { featureKey, usdPerSecond, creditsPerSecond: Math.ceil(usdPerSecond * TRANSFORM_CREDITS_PER_DOLLAR), billedOn, ...(note ? { note } : {}) };
}

export const TRANSFORM_RATES: TransformRate[] = [
  rate('transform:relight:480p', 0.05, 'output'),
  rate('transform:relight:768p', 0.08, 'output'),
  rate('transform:relight:1080p', 0.16, 'output'),
  rate('transform:relight:2k', 0.32, 'output'),

  // Input tokens are folded into the per-second rate at input duration ~ output duration:
  // 10 s ~ 67,500 tokens -> ~$1.39 after the 4,096-token allowance; 15 s ~ 101,250 -> ~$2.14.
  // That lands at ~629 vs ~637 cr/s, within 1%. The rate is NOT exact for very long inputs.
  rate('transform:recast:768p', 0.085, 'output', 'includes the input-token charge at input ~ output duration (~1% error)'),
  rate('transform:recast:1080p', 0.17, 'output', 'includes the input-token charge at input ~ output duration (~1% error)'),

  // CRITICAL: billed on input + output with a minimum of 2x output, so a 10 s clip bills 20 s. The rate is
  // per BILLED second - multiplying it by the output duration undercharges by half.
  rate('transform:restyle:720p', 0.094, 'output-x2-min', 'per BILLED second; minimum 2x output duration'),
  rate('transform:restyle:1080p', 0.141, 'output-x2-min', 'per BILLED second; minimum 2x output duration'),

  rate('transform:environment:720p', 0.094, 'output'),
  rate('transform:environment:720p:videoref', 0.063, 'output', 'discounted tier when video references are supplied'),

  rate('transform:object:720p', 0.094, 'output'),
  rate('transform:object:720p:videoref', 0.063, 'output', 'discounted tier when video references are supplied'),
];
