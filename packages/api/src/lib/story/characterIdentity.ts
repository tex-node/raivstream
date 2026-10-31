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

import { deterministicSeed } from './sceneSeed';

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

/** Options are explicit: a function that reads ambient state cannot be tested alone. */
export type IdentityResolutionMode = {
  /** false = Phase 1 piece (3) flag-on: drop the visual prose, keep the name binding. */
  includeProse: boolean;
  /** 0-based position of this character's reference image in the provider payload. */
  referenceIndex?: number;
};

/**
 * `lockedIdentityBlock` when set, else the existing composer output. This is the
 * byte-compatible fallback for characters that have never been frozen.
 *
 * With `includeProse: false` the 442-char visual description is replaced by a
 * positional binding, because `fal-ai/flux-2/edit` has no reference-token channel:
 * the prose is the only way to link an image to a character name.
 */
export function resolveIdentityFor(
  character: CharacterIdentityInput,
  mode: IdentityResolutionMode = { includeProse: true },
): string {
  if (!mode.includeProse) {
    const position = (mode.referenceIndex ?? 0) + 1;
    return `the character in reference image ${position} is ${character.name}`;
  }
  const locked = character.lockedBlock?.trim();
  return locked ? locked : character.promptIngredient;
}

/**
 * Replace each character's identity with a name-based placeholder token. Returns
 * the joined token string (sent to the enhancer) and the token -> resolved-block
 * map (used to substitute after enhancement).
 *
 * The mode is threaded through to the map, not just the placeholder text: the
 * enhancer substitutes the map back into its output, so a prose value here would
 * silently restore the identity block on the flag-on path.
 */
export function renderPlaceholders(
  characters: CharacterIdentityInput[],
  mode: { includeProse: boolean } = { includeProse: true },
): { text: string; map: Record<string, string> } {
  const map: Record<string, string> = {};
  const tokens = characters.map((character, index) => {
    const token = placeholderFor(character.name);
    map[token] = resolveIdentityFor(character, { includeProse: mode.includeProse, referenceIndex: index });
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

/**
 * fal-ai/flux-2/edit role-tag prefix. UNVERIFIED for that endpoint (Black Forest
 * Labs family convention). If references don't condition after the feature flag is
 * flipped, the one-line fix is `'Image '` instead of `'@image'`.
 */
export const FLUX2_EDIT_ROLE_TAG_PREFIX = '@image';

/**
 * Prepend reference-role tags for a reference-conditioned edit prompt:
 * `@image1 is A. @image2 is B. Preserve each character's identity from its
 * reference. Scene: <prompt>`.
 */
export function roleTag(prompt: string, names: string[]): string {
  if (names.length === 0) return prompt;
  const tags = names.map((name, index) => `${FLUX2_EDIT_ROLE_TAG_PREFIX}${index + 1} is ${name}.`).join(' ');
  return `${tags} Preserve each character's identity from its reference. Scene: ${prompt}`;
}

/**
 * Fetch approved reference asset URLs for the given characters, in scene order.
 * Returns only characters with a non-null approvedReferenceAssetId AND a
 * resolvable assetUrl.
 */
export async function fetchApprovedReferences(
  prisma: unknown,
  chars: Array<{ name: string; approvedReferenceAssetId: string | null }>,
): Promise<Array<{ characterName: string; assetUrl: string }>> {
  const ids = chars.map((c) => c.approvedReferenceAssetId).filter((id): id is string => Boolean(id));
  if (ids.length === 0) return [];
  const rows: Array<{ id: string; assetUrl: string | null }> = await (prisma as any).characterReferenceAsset.findMany({
    where: { id: { in: ids } },
    select: { id: true, assetUrl: true },
  });
  const urlById = new Map(rows.map((r) => [r.id, r.assetUrl]));
  const out: Array<{ characterName: string; assetUrl: string }> = [];
  for (const character of chars) {
    if (!character.approvedReferenceAssetId) continue;
    const url = urlById.get(character.approvedReferenceAssetId);
    if (url) out.push({ characterName: character.name, assetUrl: url });
  }
  return out;
}

export interface SceneImageRouting {
  effectiveModel: 'FLUX2' | 'FLUX2_EDIT';
  effectivePrompt: string;
  imageUrls: string[];
  /** More than 4 approved refs were supplied (only the first 4 are used). */
  truncated: boolean;
  editLive: boolean;
  /** Deterministic seed for the edit path; undefined for the non-edit path. */
  seed: number | undefined;
}

/**
 * Pure routing decision for the scene-image path. `capabilityLive` is the caller's
 * `isFalCapabilityLive(config, 'imageEdit')` (master AND real-calls AND maxRequests
 * AND credential AND FAL_IMAGE_EDIT_ENABLED) — the bare flag is not sufficient.
 */
export function computeSceneImageRouting(input: {
  requestedModel: 'FLUX2' | 'FLUX2_EDIT';
  prompt: string;
  approvedRefs: Array<{ characterName: string; assetUrl: string }>;
  capabilityLive: boolean;
  /** Scene id — source of the deterministic seed for the edit path. */
  sceneId: string;
}): SceneImageRouting {
  const refs = input.approvedRefs;
  const imageUrls = refs.slice(0, 4).map((r) => r.assetUrl);
  const truncated = refs.length > 4;
  const editLive = imageUrls.length > 0 && input.capabilityLive;
  return {
    effectiveModel: editLive ? 'FLUX2_EDIT' : input.requestedModel,
    effectivePrompt: editLive ? roleTag(input.prompt, refs.map((r) => r.characterName)) : input.prompt,
    imageUrls: editLive ? imageUrls : [],
    truncated,
    editLive,
    seed: editLive ? deterministicSeed(input.sceneId) : undefined,
  };
}
