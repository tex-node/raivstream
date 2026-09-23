/**
 * Raivstream 5.0 — creator-facing error translation.
 *
 * Raw provider/generation errors must never reach the creator. This maps
 * technical failures to calm, scope-aware language.
 */
export function creatorError(message: string | null | undefined): string {
  if (!message) return 'Something interrupted this scene. Your other scenes are safe.';
  const m = message.toLowerCase();
  if (m.includes('guidelines') || m.includes('moderation') || m.includes('violates')) {
    return 'This scene was held back by our content guidelines. Direct a change and we’ll try again.';
  }
  if (m.includes('taking longer') || m.includes('timeout') || m.includes('timed out')) {
    return 'This scene took longer than expected. Your other scenes are safe — we can try this one again.';
  }
  if (m.includes('credit')) {
    return 'This scene needs a few more credits. Top up and we’ll continue.';
  }
  if (m.includes('seed') || m.includes('image-to-video')) {
    return 'This scene needs its key visual first. Try again and we’ll rebuild it.';
  }
  return 'Something interrupted this scene. Your other scenes are safe — we can try this one again.';
}
