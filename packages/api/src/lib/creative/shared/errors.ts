/**
 * Raivstream 5.0 — creative-layer errors. Consistent, typed failures that the
 * routers translate to tRPC errors. Distinct from legacy TRPCError usage so the
 * semantic layer never depends on a transport.
 */

export type CreativeErrorCode =
  // Commercial publish gate (2026-11-17): the contract's reason codes are typed, so a blocked publish is a
  // refusal rather than a 500, and an unscorable ad is distinct from a bad one.
  | 'HOOK_MISSING'
  | 'BENEFIT_FEATURE_LIST'
  | 'CTA_MISSING'
  | 'COMMERCIAL_UNSCORED'
  // The sender cannot enqueue a run it could not record (2026-11-17): a typed refusal, not a silent in-process fallback.
  | 'RUN_CREATE_FAILED'
  | 'CREATIVE_DISABLED'
  | 'PROJECT_NOT_FOUND'
  | 'INTENT_EMPTY'
  | 'INTENT_UNINTERPRETABLE'
  | 'INVALID_STATE_TRANSITION'
  | 'BIBLE_ALREADY_EXISTS'
  | 'LEGACY_BRIDGE_CONFLICT'
  | 'PLAN_NOT_APPROVED'
  | 'CONTENT_REJECTED'
  | 'MISSING_SOURCE'
  | 'UNSUPPORTED_SOURCE_OPERATION';

export class CreativeError extends Error {
  readonly code: CreativeErrorCode;
  constructor(code: CreativeErrorCode, message: string) {
    super(message);
    this.name = 'CreativeError';
    this.code = code;
  }
}

export function creativeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Creative operation failed';
}