/**
 * Unified generation-job state machine (Phase §7.2).
 *
 * Single canonical status + error model that every provider adapter must map
 * into, so the dispatcher and routers speak one language regardless of provider
 * (RunPod, xAI, Kling, Gemini, fal.ai).
 *
 * Canonical states: queued → generating → completed | failed | cancelled.
 *   - `cancelled` is a first-class terminal state (previously lost).
 * Errors are normalized into `GenerationJobError` (code/message/retryable).
 */

import type { MediaErrorCode, MediaJobStatus, NormalizedMediaError } from '../mediaProviders';

export type GenerationJobState = MediaJobStatus;
export type GenerationJobError = NormalizedMediaError;

/** Maximum provider retries for a failed generation job (Phase 15). */
export const MAX_JOB_RETRIES = 3;

export interface GenerationJobStatus {
  status: GenerationJobState;
  outputUrl?: string;
  error?: GenerationJobError;
}

export function generationError(code: MediaErrorCode, message: string, retryable = false): GenerationJobError {
  return { code, message, retryable };
}

export const providerFailure = (message: string, retryable = false): GenerationJobError =>
  generationError('PROVIDER_ERROR', message, retryable);

export const resultInvalid = (message = 'Generation completed but produced no output URL'): GenerationJobError =>
  generationError('RESULT_INVALID', message, false);

export const storageFailed = (message = 'Failed to save output to storage — please retry'): GenerationJobError =>
  generationError('STORAGE_FAILED', message, true);
