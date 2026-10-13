/**
 * Track D Layer 2 — locked identity block.
 *
 * The leak: the prompt enhancer receives each character's identity text
 * (`characterIdentity`), an LLM paraphrases it into the enhanced prompt, and the
 * Master Visual Bible anchor is appended *after* enhancement — so a paraphrase and
 * the verbatim anchor coexist and compete.
 *
 * The fix: send the enhancer NAME-BASED placeholders (`{{CHARACTER_MAX_IDENTITY}}`)
 * it cannot paraphrase, then substitute the resolved identity block after the
 * enhancer returns. A locked block (`StoryCharacterMemory.lockedIdentityBlock`) is
 * used verbatim; otherwise the existing composer output is the fallback (backward
 * compatible). Pure + deterministic — no LLM, no I/O.
 */

export interface CharacterIdentityInput {
  name: string;
  /** Today's composer output (`characterPromptIngredient`) — the backward-compatible fallback. */
  promptIngredient: string;
  /** `StoryCharacterMemory.lockedIdentityBlock` when frozen. */
  lockedBlock?: string | null;
}

/** `MAX` -> `{{CHARACTER_MAX_IDENTITY}}`. Non-alphanumerics collapse to `_`. */
export function placeholderFor(name: string): string {
  const key = name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'UNKNOWN';
  return `{{CHARACTER_${key}_IDENTITY}}`;
}

function immutableDetailsRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (raw === null || raw === undefined || raw === '') continue;
    out[key] = String(raw);
  }
  return out;
}

/**
 * Compose the deterministic identity block for a character from existing fields.
 * This is the string the user reviews and freezes — no LLM in the loop.
 */
export function composeIdentityBlock(character: {
  name: string;
  visualDescription?: string | null;
  favoriteExpression?: string | null;
  walkingStyle?: string | null;
  immutableDetails?: unknown;
}): string {
  const details = immutableDetailsRecord(character.immutableDetails);
  return [
    character.name,
    character.visualDescription ? `same look every scene: ${character.visualDescription}` : undefined,
    character.favoriteExpression ? `favorite expression: ${character.favoriteExpression}` : undefined,
    character.walkingStyle ? `walking style: ${character.walkingStyle}` : undefined,
    ...Object.entries(details).map(([key, value]) => `${key}: ${value}`),
    'consistency rules: keep fur or hair, eye color, clothing, backpack, accessories, height, and species unchanged',
  ].filter(Boolean).join(', ');
}

/**
 * `lockedIdentityBlock` when set, else the existing composer output. This is the
 * byte-compatible fallback for characters that have never been frozen.
 */
export function resolveIdentityFor(character: CharacterIdentityInput): string {
  const locked = character.lockedBlock?.trim();
  return locked ? locked : character.promptIngredient;
}

/**
 * Replace each character's identity with a name-based placeholder token. Returns
 * the joined token string (sent to the enhancer) and the token -> resolved-block
 * map (used to substitute after enhancement).
 */
export function renderPlaceholders(characters: CharacterIdentityInput[]): { text: string; map: Record<string, string> } {
  const map: Record<string, string> = {};
  const tokens = characters.map((character) => {
    const token = placeholderFor(character.name);
    map[token] = resolveIdentityFor(character);
    return token;
  });
  return { text: tokens.join('; '), map };
}

/** Normalize mangled tokens (`{ { X } }`, stray whitespace) back to `{{X}}`. */
function normalizeTokens(text: string): string {
  return text.replace(/\{\s*\{([^{}]*)\}\s*\}/g, (_match, inner: string) => `{{${inner.replace(/\s+/g, '').toUpperCase()}}}`);
}

/**
 * Substitute placeholder tokens in an enhanced prompt with their resolved identity
 * blocks. If a token is missing entirely (the LLM dropped it), the resolved blocks
 * are appended deterministically so the model still sees the verbatim identity.
 */
export function substituteIdentityBlocks(
  enhancedPrompt: string,
  map: Record<string, string>,
): { prompt: string; fallbackUsed: boolean } {
  let out = normalizeTokens(enhancedPrompt);
  const missing: string[] = [];
  for (const [token, value] of Object.entries(map)) {
    if (out.includes(token)) {
      out = out.split(token).join(value);
    } else {
      missing.push(value);
    }
  }
  if (missing.length === 0) return { prompt: out.trim(), fallbackUsed: false };
  return { prompt: `${out.trim()} Character identity (verbatim): ${missing.join('; ')}`.trim(), fallbackUsed: true };
}
