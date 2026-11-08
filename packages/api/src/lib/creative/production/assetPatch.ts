/**
 * Asset patch shapes (2026-11-08).
 *
 * A row said it had succeeded and also why it had failed: the success update wrote status, url and
 * provider, and left the previous `errorMessage` in place. These builders make the three states
 * explicit, so a success cannot silently keep the failure it replaced.
 */

export interface ReadyPatch {
  status: 'READY';
  assetUrl: string;
  thumbnailUrl: string | null;
  provider: string | null;
  /** Cleared: a row that succeeded must not also say why it failed. */
  errorMessage: null;
}

export function readyPatch(media: { assetUrl: string; thumbnailUrl?: string | null; provider?: string | null }): ReadyPatch {
  return {
    status: 'READY',
    assetUrl: media.assetUrl,
    thumbnailUrl: media.thumbnailUrl ?? null,
    provider: media.provider ?? null,
    errorMessage: null,
  };
}

/** A failure writes its own reason, replacing whatever the row said before. */
export function failurePatch(reason: string): { status: 'FAILED'; errorMessage: string } {
  return { status: 'FAILED', errorMessage: reason.slice(0, 500) };
}

/** Mid-run, a regenerating row KEEPS its prior error until the attempt resolves. */
export function generatingPatch(): { status: 'GENERATING' } {
  return { status: 'GENERATING' };
}
