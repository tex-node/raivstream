/**
 * Master Visual Bible enforcement (Phase 17) — pure, deterministic prompt
 * sanitization. Applies a ProductionManifest's style-lock anchor, negative
 * prompt suffix, and character anchors to EVERY image/video generation payload,
 * so no matter what an LLM wrote, the delivered prompt is locked to the story's
 * visual bible. This is the anti-drift layer: it stops scenes switching between
 * photorealism and 2D/animation, and stops character faces/wardrobe warping.
 *
 * Server-only, side-effect free (no fetch, no fs) — unit-tested directly.
 */

export type VisualBibleSource = {
  master_style?: string | null;
  negative_prompt_suffix?: string | null;
  characters?: Record<string, string> | null;
} | null;

function containsIgnoreCase(haystack: string, needle: string): boolean {
  if (!needle) return false;
  return haystack.toLowerCase().includes(needle.trim().toLowerCase());
}

/** Append comma-separated negative tags that are not already present. */
function appendNegativeUnique(base: string, extra: string): string {
  const existing = new Set(
    base
      .split(',')
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean),
  );
  const additions = extra
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part && !existing.has(part.toLowerCase()));
  if (additions.length === 0) return base;
  const parts = base
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return [...parts, ...additions].join(', ');
}

export function applyMasterVisualBible(input: {
  prompt: string;
  negativePrompt?: string | null;
  bible?: VisualBibleSource;
  /** Character names depicted in this scene — only these anchors are injected. */
  sceneCharacters?: string[];
  target: 'IMAGE' | 'VIDEO';
}): { prompt: string; negativePrompt: string | null } {
  const { prompt, target } = input;
  const bible = input.bible;
  if (!bible) return { prompt, negativePrompt: input.negativePrompt ?? null };

  let outPrompt = prompt;
  let outNegative = input.negativePrompt ?? null;

  // 1. Style lock anchor — prepend verbatim unless already present.
  const style = (bible.master_style ?? '').trim();
  if (style && !containsIgnoreCase(outPrompt, style)) {
    outPrompt = `${style}. ${outPrompt}`;
  }

  // 2. Character anchors — inject the scene's anchors verbatim (deduped against
  //    text the composer may already have included, e.g. VPC2 identity locks).
  const characters = bible.characters ?? {};
  const sceneNames = (input.sceneCharacters ?? [])
    .map((name) => name.trim().toUpperCase().replace(/\s+/g, '_'))
    .filter(Boolean);
  for (const [key, value] of Object.entries(characters)) {
    const nameKey = key.trim().toUpperCase().replace(/\s+/g, '_');
    const description = (value ?? '').trim();
    if (!description) continue;
    if (sceneNames.length > 0 && !sceneNames.includes(nameKey)) continue;
    if (containsIgnoreCase(outPrompt, description)) continue;
    outPrompt = `${outPrompt}. Character ${key.trim()}: ${description}`;
  }

  // 3. Negative suffix.
  const suffix = (bible.negative_prompt_suffix ?? '').trim();
  if (suffix) {
    if (target === 'IMAGE') {
      // FLUX2/FLUX support a real negative-prompt field.
      outNegative = appendNegativeUnique(outNegative ?? '', suffix);
    } else {
      // H3 (and most video transports) expose no negative-prompt field, so the
      // tags ride inside the positive prompt using the --no convention.
      if (!containsIgnoreCase(outPrompt, suffix)) {
        outPrompt = `${outPrompt} --no ${suffix}`;
      }
    }
  }

  return { prompt: outPrompt.trim(), negativePrompt: outNegative };
}