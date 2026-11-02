/**
 * Dimension-based quarantine (population treatment).
 *
 * Trigger: the 802 re-score batch found **97 of 109 image assets below the
 * `characterIdentity` floor** (~89%), every flag on that one dimension. Per-asset
 * review cannot absorb 89%, so the treatment is population-level: an asset whose
 * identity score is below the floor **stops being promoted** — it keeps its place,
 * its link, and its owner's access — rather than each needing a review decision.
 *
 * Two directions matter here, and they are opposite:
 *
 * - **Approval fails closed**: a missing score is a rejection (see qualityScorer).
 * - **Quarantine fails open**: an asset with no score is **not** quarantined. Getting
 *   this backwards would hide the entire unscored library, which is the failure mode
 *   of applying a threshold to unknown data.
 */

/** The identity floor, mirrored from `DEFAULT_DIMENSION_FLOORS.characterIdentity`. */
export const QUARANTINE_IDENTITY_FLOOR = 85;

export interface QuarantineInput {
  /** The stored per-dimension scores, or null when the asset was never scored. */
  scores?: Record<string, unknown> | null;
}

export type QuarantineVerdict =
  | { quarantined: false; reason: 'unscored' | 'at_or_above_floor' }
  | { quarantined: true; reason: 'below_floor'; score: number; floor: number };

/**
 * Quarantine only what was **scored and below floor**. An unscored asset is unknown,
 * not bad, and is left promoted.
 */
export function quarantineVerdict(input: QuarantineInput): QuarantineVerdict {
  const raw = input.scores?.characterIdentity;
  // `Number(null)` is 0 and `Number('')` is 0 — both would read as "scored zero" and
  // quarantine an asset that was never scored. Unknown must stay unknown.
  if (raw === null || raw === undefined || raw === '') {
    return { quarantined: false, reason: 'unscored' };
  }
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value)) {
    return { quarantined: false, reason: 'unscored' };
  }
  if (value < QUARANTINE_IDENTITY_FLOOR) {
    return { quarantined: true, reason: 'below_floor', score: value, floor: QUARANTINE_IDENTITY_FLOOR };
  }
  return { quarantined: false, reason: 'at_or_above_floor' };
}

export function isQuarantined(input: QuarantineInput): boolean {
  return quarantineVerdict(input).quarantined;
}

/**
 * The three-surface rule, made explicit so a caller cannot apply quarantine to the
 * wrong surface by accident.
 *
 *   For You / trending / discover   → excluded (promotion stops)
 *   creator's own library          → included (ownership is not promotion)
 *   direct link / film page        → included, with a disclosure
 */
export type PromotionSurface = 'feed' | 'library' | 'direct';

export function shouldSurface(surface: PromotionSurface, input: QuarantineInput): boolean {
  if (surface === 'library' || surface === 'direct') return true;
  return !isQuarantined(input);
}

/**
 * A prisma `where` fragment for a feed query.
 *
 * `quarantinedAssetIds` are the ids a caller has already resolved from stored scores.
 * Passing an empty list yields an active, empty exclusion rather than a silently
 * dropped clause: a filter that quietly disappears is worse than one that excludes
 * nothing, because only one of them looks like it is working.
 */
export function feedExclusionWhere(quarantinedAssetIds: readonly string[]): Record<string, unknown> {
  return { id: { notIn: [...quarantinedAssetIds] } };
}

/**
 * CAN THE FEED ACTUALLY APPLY THIS TODAY? No.
 *
 * `Video` carries no reference to the `CreativeProducedAsset` that produced it — there
 * is no `sourceProducedAssetId`, and the publish path does not write one. So a feed
 * predicate has nothing to join against, and shipping one anyway would exclude zero
 * rows while appearing to enforce a policy: the false-pass shape this project keeps
 * catching.
 *
 * The prerequisite is therefore a column plus population at publish time, not a filter.
 */
export function feedQuarantineIsWired(): boolean {
  return false;
}
