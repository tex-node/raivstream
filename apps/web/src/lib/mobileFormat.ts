/**
 * Small formatting helpers shared by the /m mobile screens. Pure functions,
 * no data fetching — kept separate from primitives.tsx (which is components)
 * so screens can import just what they need.
 */

/** A handful of gradient combinations matching the handoff's own placeholder
 * convention ("No bitmaps. Every image is a placeholder built from layered
 * radial + linear gradients") — used when a project/scene has no ready
 * generated image yet. Deterministic per id so a given project/scene always
 * gets the same placeholder rather than flickering between renders. */
const GRADIENTS = [
  'radial-gradient(80% 90% at 25% 20%, #5b2f6b, transparent 62%), radial-gradient(70% 80% at 85% 80%, #1f4a6b, transparent 60%), linear-gradient(165deg, #141626, #0b0c14)',
  'radial-gradient(75% 85% at 20% 15%, #6b2f4a, transparent 60%), radial-gradient(70% 75% at 80% 85%, #2f4a6b, transparent 58%), linear-gradient(165deg, #1a1626, #0b0c14)',
  'radial-gradient(80% 80% at 80% 20%, #2f6b5b, transparent 60%), radial-gradient(65% 80% at 20% 85%, #4a2f6b, transparent 58%), linear-gradient(165deg, #12222a, #0b0c14)',
  'radial-gradient(70% 90% at 30% 80%, #6b4a2f, transparent 60%), radial-gradient(75% 70% at 75% 20%, #2f3f6b, transparent 58%), linear-gradient(165deg, #201a14, #0b0c14)',
];

export function gradientPlaceholder(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return GRADIENTS[hash % GRADIENTS.length];
}

export function timeAgo(date: string | Date | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  const seconds = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

/** StoryChapter.body is stored as one string, not pre-split paragraphs —
 * split on blank lines for paragraph-level display/selection. */
export function splitParagraphs(body: string | null | undefined): string[] {
  if (!body) return [];
  return body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}
