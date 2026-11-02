import type { CreativeCriticResult } from './criticTypes';

// 80 is the value between the two calibration points (reference-conditioned 85,
// pre-reference 75), so the gate answers "did the creator use their references"
// rather than "was this perfect". See docs/operations/critic-threshold-policy.md.
export const DEFAULT_CREATIVE_CRITIC_THRESHOLD = 80;
export const HARD_MAX_CREATIVE_CRITIC_RETRIES = 3;

export function creativeCriticThreshold() {
  const parsed = Number(process.env.CREATIVE_CRITIC_APPROVAL_THRESHOLD ?? DEFAULT_CREATIVE_CRITIC_THRESHOLD);
  return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : DEFAULT_CREATIVE_CRITIC_THRESHOLD;
}

export function creativeCriticMaxRetries() {
  const parsed = Number(process.env.CREATIVE_CRITIC_MAX_RETRIES ?? 1);
  return Number.isFinite(parsed) ? Math.min(HARD_MAX_CREATIVE_CRITIC_RETRIES, Math.max(0, Math.floor(parsed))) : 1;
}

export function clampScore(value: unknown) {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(100, Math.max(0, numeric));
}

export function aggregateScore(scores: CreativeCriticResult['scores']) {
  const values = Object.values(scores).map(clampScore);
  if (!values.length) return 0;
  return Math.round((values.reduce((sum, score) => sum + score, 0) / values.length) * 10) / 10;
}

export function aggregatePartialScores(scores: Record<string, unknown>, weights?: Record<string, number>): number {
  const entries = Object.entries(scores).filter(([, value]) => Number.isFinite(typeof value === 'number' ? value : Number(value)));
  if (!entries.length) return 0;
  const weighted = weights && Object.values(weights).some((value) => value > 0);
  if (!weighted) {
    return Math.round((entries.reduce((sum, [, value]) => sum + clampScore(value), 0) / entries.length) * 10) / 10;
  }
  let total = 0;
  let weightTotal = 0;
  for (const [key, value] of entries) {
    const weight = Math.max(0, weights[key] ?? 0);
    if (!weight) continue;
    total += clampScore(value) * weight;
    weightTotal += weight;
  }
  return weightTotal ? Math.round((total / weightTotal) * 10) / 10 : aggregatePartialScores(scores);
}

export function recommendationForScore(score: number, threshold = creativeCriticThreshold()) {
  const clamped = clampScore(score);
  if (clamped >= threshold) return 'APPROVE' as const;
  if (clamped < 70) return 'REGENERATE' as const;
  return 'SUGGEST_REFINEMENT' as const;
}

/**
 * Identity gate, Phase 1 piece (3) follow-through.
 *
 * `characterIdentity` is read from the per-dimension scores, never derived from
 * the aggregate: a good composition cannot hide a drifted character. Missing or
 * non-numeric identity FAILS CLOSED rather than falling back to the overall
 * score - the same discipline as `resolveExportPolicy` refusing a null
 * audienceMode.
 */
export const DEFAULT_CREATIVE_IDENTITY_THRESHOLD = 85;

export function creativeCriticIdentityThreshold() {
  const parsed = Number(
    process.env.CREATIVE_CRITIC_IDENTITY_THRESHOLD ?? DEFAULT_CREATIVE_IDENTITY_THRESHOLD,
  );
  return Number.isFinite(parsed)
    ? Math.min(100, Math.max(0, parsed))
    : DEFAULT_CREATIVE_IDENTITY_THRESHOLD;
}

export function passesIdentityGate(
  scores: Record<string, unknown> | null | undefined,
  threshold = creativeCriticIdentityThreshold(),
): boolean {
  const raw = scores?.characterIdentity;
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value)) return false;
  return clampScore(value) >= threshold;
}

/**
 * Per-dimension floors (Phase 3.5 follow-through).
 *
 * The aggregate is NOT sufficient. Production evidence, lighthouse run 2026-11-02:
 * SCENE_03 scored `overall: 85` with `characterIdentity: 0` — the character was
 * absent from the frame and the aggregate did not move. No single aggregate cut-off
 * separates that asset from SCENE_01 (also 85), so the gate has to read dimensions.
 *
 * Thresholds are data: one table, each floor justified. `characterIdentity` keeps its
 * Phase 1 floor of 85 because identity drift is the failure the whole critic exists
 * to catch; the rest sit at documented defaults that a competent frame clears, with
 * emotion/visualStyle/environment lower because they are the most subjective scores.
 */
export type CreativeDimension =
  | 'characterIdentity'
  | 'continuity'
  | 'composition'
  | 'lighting'
  | 'emotion'
  | 'visualStyle'
  | 'environment'
  | 'storyAlignment'
  | 'sceneClarity'
  | 'technicalQuality';

export const DEFAULT_DIMENSION_FLOORS: Record<CreativeDimension, number> = {
  /** The SCENE_03 case. Identity is the reason the critic exists; floor stays 85. */
  characterIdentity: 85,
  /** Scene-to-scene consistency of wardrobe/lighting/set; 70 catches visible jumps. */
  continuity: 70,
  /** Framing and rule-of-thirds. A usable frame clears 70 without being remarkable. */
  composition: 70,
  /** Exposure and direction of light; below 70 the subject reads as unlit. */
  lighting: 70,
  /** Most subjective; 65 flags only a dead performance, not a plain one. */
  emotion: 65,
  /** Style adherence; 65 tolerates a loose interpretation. */
  visualStyle: 65,
  /** Background plausibility; 65 tolerates a sparse but readable set. */
  environment: 65,
  /** Does the frame serve the beat; 70 is the "reads as the right moment" line. */
  storyAlignment: 70,
  /** Can the shot be understood in one look; 70 is the comprehension floor. */
  sceneClarity: 70,
  /** Artefacts, warping, extra limbs. Below 70 the asset is not shippable. */
  technicalQuality: 70,
};

export function dimensionFloors(overrides?: Partial<Record<CreativeDimension, number>>): Record<CreativeDimension, number> {
  return { ...DEFAULT_DIMENSION_FLOORS, ...(overrides ?? {}) };
}

/**
 * Every dimension below its floor. **Fails closed**: a missing or non-numeric score
 * is a breach, never an exemption — the same discipline the identity gate already had.
 */
export function dimensionFloorBreaches(
  scores: Record<string, unknown> | null | undefined,
  floors: Record<CreativeDimension, number> = DEFAULT_DIMENSION_FLOORS,
): CreativeDimension[] {
  const breaches: CreativeDimension[] = [];
  for (const [dimension, floor] of Object.entries(floors) as Array<[CreativeDimension, number]>) {
    const raw = (scores as Record<string, unknown> | null | undefined)?.[dimension];
    const value = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(value) || clampScore(value) < floor) breaches.push(dimension);
  }
  return breaches;
}

/** True only when every dimension clears its floor. */
export function passesDimensionFloors(
  scores: Record<string, unknown> | null | undefined,
  floors?: Record<CreativeDimension, number>,
): boolean {
  return dimensionFloorBreaches(scores, floors ?? DEFAULT_DIMENSION_FLOORS).length === 0;
}

export function recommendationForResult(
  result: { overallScore: number; scores?: Record<string, unknown> | null },
  options?: {
    threshold?: number;
    identityThreshold?: number;
    floors?: Partial<Record<CreativeDimension, number>>;
  },
): 'APPROVE' | 'SUGGEST_REFINEMENT' | 'REGENERATE' {
  const threshold = options?.threshold ?? creativeCriticThreshold();
  const floors = dimensionFloors({
    ...(options?.floors ?? {}),
    ...(options?.identityThreshold != null ? { characterIdentity: options.identityThreshold } : {}),
  });
  const overall = clampScore(result.overallScore);
  if (overall < 70) return 'REGENERATE';
  // The aggregate stays: a film that is uniformly mediocre still fails here.
  // The dimension floors are ADDITIONAL - and they are what catch SCENE_03, where
  // the aggregate is 85 and the character is simply absent.
  if (overall >= threshold && passesDimensionFloors(result.scores, floors)) return 'APPROVE';
  return 'SUGGEST_REFINEMENT';
}

export function normaliseCriticResult(result: CreativeCriticResult, threshold = creativeCriticThreshold()): CreativeCriticResult {
  const overallScore = Number.isFinite(result.overallScore) ? result.overallScore : aggregateScore(result.scores);
  const scoreRecommendation = recommendationForResult(
    { overallScore, scores: result.scores as unknown as Record<string, unknown> },
    { threshold },
  );
  const recommendation = result.recommendation === 'APPROVE' && scoreRecommendation !== 'APPROVE'
    ? scoreRecommendation
    : result.recommendation;
  return {
    ...result,
    overallScore: Math.min(100, Math.max(0, Math.round(overallScore * 10) / 10)),
    recommendation,
  };
}
