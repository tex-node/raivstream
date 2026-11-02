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
 * CAN THE FEED ACTUALLY APPLY THIS TODAY? Still no — but the prerequisite now exists.
 *
 * `Video.sourceProducedAssetId` shipped (nullable, 2026-11-02), so a feed predicate finally
 * has something to join on. What it does not have is a **populated** link: none of the four
 * paths that create a `Video` (generation publish, library publish of a story asset, story
 * export, upload) reads a `CreativeOutput`, and the measured URL join between
 * `videos.mp4Url` and `creative_outputs.assetUrl` returns **0 matches** across 14 videos and
 * 44 ready outputs.
 *
 * So the wiring reports on the DATA, not on the schema: the filter is live when at least one
 * video carries a source, and inert otherwise. A predicate that claims to be wired because a
 * column exists is exactly the false pass this project keeps catching.
 */
export function feedQuarantineIsWired(videosWithSource: number): boolean {
  return videosWithSource > 0;
}

/**
 * Resolve the source asset id at publish time.
 *
 * Returns null when the caller does not know it — and null is the honest answer, not a
 * failure. A guessed link would let a score act on content it never scored.
 */
export function resolveSourceProducedAssetId(
  candidate: string | null | undefined,
): string | null {
  if (typeof candidate !== 'string') return null;
  const trimmed = candidate.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Was this video's source produced by the creative pipeline at all? NULL means the link is
 * unknown, and unknown stays fail-open: the video is surfaced.
 */
export function shouldSurfaceVideo(
  surface: PromotionSurface,
  input: { scores?: Record<string, unknown> | null; sourceProducedAssetId?: string | null },
): boolean {
  if (!input.sourceProducedAssetId) return true;
  return shouldSurface(surface, { scores: input.scores });
}
