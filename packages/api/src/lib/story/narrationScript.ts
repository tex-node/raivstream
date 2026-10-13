/**
 * Phase A — narration script resolution (R16 non-educational path).
 *
 * Invariant (regression-guarded): a generated narration script is persisted ONLY
 * after it passes moderation. A flagged script never lands in the database, so a
 * later retry generates and moderates a FRESH script instead of being stuck on a
 * permanently-rejected one.
 *
 * Pure orchestration with injected side effects → unit-testable without a real
 * provider, moderator or database.
 */

import type { ModerationResult } from '../promptModeration';

export type NarrationModerationResult = ModerationResult;

export interface ResolveNarrationScriptDeps {
  /** Generate a fresh script (AI round-trip). */
  generate: () => Promise<string>;
  /** Moderate the script BEFORE it is persisted. */
  moderate: (script: string) => Promise<NarrationModerationResult>;
  /** Persist the approved script. */
  persist: (script: string) => Promise<void>;
  /** Human-readable rejection message for a failed moderation. */
  rejectMessage: (moderation: NarrationModerationResult) => string;
}

export interface ResolveNarrationScriptResult {
  script: string;
  generated: boolean;
}

export class NarrationModerationError extends Error {
  readonly code = 'NARRATION_MODERATION_REJECTED';
  constructor(message: string) {
    super(message);
    this.name = 'NarrationModerationError';
  }
}

/**
 * Reuse an existing approved script, otherwise generate → moderate → persist.
 * Throws {@link NarrationModerationError} (and persists nothing) when the
 * generated script is rejected.
 */
export async function resolveNarrationScript(
  existingScript: string | null | undefined,
  deps: ResolveNarrationScriptDeps,
): Promise<ResolveNarrationScriptResult> {
  if (existingScript) return { script: existingScript, generated: false };

  const script = await deps.generate();
  const moderation = await deps.moderate(script);
  if (!moderation.allowed) {
    throw new NarrationModerationError(deps.rejectMessage(moderation));
  }

  await deps.persist(script);
  return { script, generated: true };
}
