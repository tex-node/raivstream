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
    return "This scene was held back by our content guidelines. Direct a change and we'll try again.";
  }
  if (m.includes('taking longer') || m.includes('timeout') || m.includes('timed out')) {
    return 'This scene took longer than expected. Your other scenes are safe — we can try this one again.';
  }
  if (m.includes('credit')) {
    return "This scene needs a few more credits. Top up and we'll continue.";
  }
  if (m.includes('use this type of source') || m.includes('unsupported source')) {
    return "I have your image, but I can't use this type of source yet. Your image is safe in the project.";
  }
  if (m.includes('need the image') || m.includes('source') || m.includes('seed') || m.includes('image-to-video')) {
    return 'I need the image you want me to use.';
  }
  // PROVIDER_DISABLED / PROVIDER_NOT_CONFIGURED: fal flags not set in env.
  if ((m.includes('disabled') && (m.includes('fal') || m.includes('provider'))) || m.includes('fal_key') || m.includes('provider_not_configured')) {
    return "Production isn't available right now. Try again in a moment, or contact support.";
  }
  return 'Something interrupted this scene. Your other scenes are safe — we can try this one again.';
}
