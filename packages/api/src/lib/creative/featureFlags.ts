/**
 * Raivstream 5.0 — centralized feature flags.
 *
 * Every 5.0 capability is gated here; the rest of the application must never
 * scatter raw `process.env` checks. All flags default OFF so the existing
 * application is untouched until a stage is rolled out.
 *
 * Rollout stages (see docs/RAIVSTREAM_5_PRODUCT_ROADMAP_AND_IMPLEMENTATION_PLAN.md):
 *   Stage 1 — CREATE + INTENT
 *   Stage 2 — BIBLE
 *   Stage 3 — PREVIEW + PRODUCTION
 *   Stage 4 — DIRECTOR
 *   Stage 5 — REVIEW
 *   Stage 6 — STUDIO
 */

export const CREATIVE_FLAGS = {
  /** Master switch — gates the creative router surface and all 5.0 behavior. */
  ENABLED: 'RAIVSTREAM_5_ENABLED',
  /** The /create entry surface. */
  CREATE_ENABLED: 'RAIVSTREAM_5_CREATE_ENABLED',
  /** Intent engine (interpretation, questions). */
  INTENT_ENABLED: 'RAIVSTREAM_5_INTENT_ENABLED',
  /** Creative Bible construction. */
  BIBLE_ENABLED: 'RAIVSTREAM_5_BIBLE_ENABLED',
  /** Preview before production. */
  PREVIEW_ENABLED: 'RAIVSTREAM_5_PREVIEW_ENABLED',
  /** Production execution. */
  PRODUCTION_ENABLED: 'RAIVSTREAM_5_PRODUCTION_ENABLED',
  /** AI Director. */
  DIRECTOR_ENABLED: 'RAIVSTREAM_5_DIRECTOR_ENABLED',
  /** Review engine. */
  REVIEW_ENABLED: 'RAIVSTREAM_5_REVIEW_ENABLED',
  /** Version-specific approval. */
  APPROVAL_ENABLED: 'RAIVSTREAM_5_APPROVAL_ENABLED',
  /** Output derivatives of an approved version. */
  OUTPUT_ENABLED: 'RAIVSTREAM_5_OUTPUT_ENABLED',
  /** Series / persistent creative universe. */
  SERIES_ENABLED: 'RAIVSTREAM_5_SERIES_ENABLED',
  /** Studio (brands/products/campaigns). */
  STUDIO_ENABLED: 'RAIVSTREAM_5_STUDIO_ENABLED',
} as const;

export type CreativeFlagKey = keyof typeof CREATIVE_FLAGS;

function flagOn(key: CreativeFlagKey, env: NodeJS.ProcessEnv = process.env): boolean {
  return env[CREATIVE_FLAGS[key]] === 'true';
}

/** True when the whole 5.0 layer is enabled (master switch). */
export function isCreativeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return flagOn('ENABLED', env);
}

/** Create surface (/create) + intent interpretation. */
export function isCreativeCreateEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isCreativeEnabled(env) && flagOn('CREATE_ENABLED', env) && flagOn('INTENT_ENABLED', env);
}

export function isCreativeIntentEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isCreativeEnabled(env) && flagOn('INTENT_ENABLED', env);
}

export function isCreativeBibleEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isCreativeEnabled(env) && flagOn('BIBLE_ENABLED', env);
}

export function isCreativePreviewEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isCreativeEnabled(env) && flagOn('PREVIEW_ENABLED', env);
}

export function isCreativeProductionEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isCreativeEnabled(env) && flagOn('PRODUCTION_ENABLED', env);
}

export function isCreativeDirectorEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isCreativeEnabled(env) && flagOn('DIRECTOR_ENABLED', env);
}

export function isCreativeReviewEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isCreativeEnabled(env) && flagOn('REVIEW_ENABLED', env);
}

export function isCreativeApprovalEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isCreativeEnabled(env) && flagOn('APPROVAL_ENABLED', env);
}

export function isCreativeOutputEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isCreativeEnabled(env) && flagOn('OUTPUT_ENABLED', env);
}

export function isCreativeSeriesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isCreativeEnabled(env) && flagOn('SERIES_ENABLED', env);
}

export function isCreativeStudioEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isCreativeEnabled(env) && flagOn('STUDIO_ENABLED', env);
}