/**
 * Phase 1 — deterministic idempotency keys for credit operations.
 *
 * A key identifies ONE logical credit operation so a replay is a no-op
 * (`CreditTransaction.idempotencyKey` is UNIQUE). Rules:
 *  - deterministic for the same logical request across retries;
 *  - collision-free across features (narration and music can share a cue id, so
 *    the feature key is embedded in those keys);
 *  - built from stable domain ids, never a timestamp;
 *  - CHARGE and REFUND are DISTINCT operations -> distinct keys, so a refund can
 *    never collide with the charge it reverses (the unique index is global).
 *
 * Format: `<domain>:<op>:<stable ids…>`.
 */
export type CreditOp = 'charge' | 'refund';

const build = (domain: string, op: CreditOp, ids: Array<string | number>): string =>
  [domain, op, ...ids.map(String)].join(':');

export const creditKeys = {
  /** One provider submission per GenerationJob attempt; `jobId` is stable across retries. */
  generation: {
    charge: (jobId: string, attempt = 0) => build('gen', 'charge', [jobId, attempt]),
    refund: (jobId: string, attempt = 0) => build('gen', 'refund', [jobId, attempt]),
  },
  /** One still per StorySceneAsset; the asset id is the logical request. */
  sceneImage: {
    charge: (assetId: string) => build('scene_img', 'charge', [assetId]),
    refund: (assetId: string) => build('scene_img', 'refund', [assetId]),
  },
  /** One clip per scene VIDEO StorySceneAsset. */
  sceneVideo: {
    charge: (assetId: string) => build('scene_vid', 'charge', [assetId]),
    refund: (assetId: string) => build('scene_vid', 'refund', [assetId]),
  },
  /** One clip per shot-grid clip StorySceneAsset. */
  sceneShotClip: {
    charge: (assetId: string) => build('scene_shot', 'charge', [assetId]),
    refund: (assetId: string) => build('scene_shot', 'refund', [assetId]),
  },
  /** One narration TTS per (feature, cue/scene id); the feature disambiguates from music. */
  narration: {
    charge: (featureKey: string, id: string) => build('narr', 'charge', [featureKey, id]),
    refund: (featureKey: string, id: string) => build('narr', 'refund', [featureKey, id]),
  },
  /** One music track per (feature, cue/version id). */
  music: {
    charge: (featureKey: string, id: string) => build('music', 'charge', [featureKey, id]),
    refund: (featureKey: string, id: string) => build('music', 'refund', [featureKey, id]),
  },
  /** One MovieRenderJob charge/refund; `jobId` is stable (attempt for renders). */
  movieRender: {
    charge: (jobId: string, attempt = 0) => build('render', 'charge', [jobId, attempt]),
    refund: (jobId: string, attempt = 0) => build('render', 'refund', [jobId, attempt]),
  },
  /** One CreativeProducedAsset attempt; asset id + attempt identify the request. */
  prodAsset: {
    charge: (assetId: string, attempt: number) => build('prod', 'charge', [assetId, attempt]),
    refund: (assetId: string, attempt: number) => build('prod', 'refund', [assetId, attempt]),
  },
  /**
   * Director scene-brief job. RESERVED — the call site currently has no stable
   * domain id (`referenceId` is `director:${randomUUID()}`), so it is intentionally
   * NOT wired (see Phase-0 baseline report, Appendix B).
   */
  director: {
    charge: (jobId: string, attempt = 0) => build('director', 'charge', [jobId, attempt]),
    refund: (jobId: string, attempt = 0) => build('director', 'refund', [jobId, attempt]),
  },
  /** Admin manual adjustment. RESERVED — admin uses a separate adjustment path. */
  adminAdjust: {
    charge: (refId: string) => build('admin', 'charge', [refId]),
    refund: (refId: string) => build('admin', 'refund', [refId]),
  },
} as const;
