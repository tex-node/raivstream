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

export function recommendationForResult(
  result: { overallScore: number; scores?: Record<string, unknown> | null },
  options?: { threshold?: number; identityThreshold?: number },
): 'APPROVE' | 'SUGGEST_REFINEMENT' | 'REGENERATE' {
  const threshold = options?.threshold ?? creativeCriticThreshold();
  const identityThreshold = options?.identityThreshold ?? creativeCriticIdentityThreshold();
  const overall = clampScore(result.overallScore);
  if (overall < 70) return 'REGENERATE';
  if (overall >= threshold && passesIdentityGate(result.scores, identityThreshold)) return 'APPROVE';
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
