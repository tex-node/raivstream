/**
 * Raivstream 5.0 — creative-layer errors. Consistent, typed failures that the
 * routers translate to tRPC errors. Distinct from legacy TRPCError usage so the
 * semantic layer never depends on a transport.
 */

export type CreativeErrorCode =
  | 'CREATIVE_DISABLED'
  | 'PROJECT_NOT_FOUND'
  | 'INTENT_EMPTY'
  | 'INTENT_UNINTERPRETABLE'
  | 'INVALID_STATE_TRANSITION'
  | 'BIBLE_ALREADY_EXISTS'
  | 'LEGACY_BRIDGE_CONFLICT';

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