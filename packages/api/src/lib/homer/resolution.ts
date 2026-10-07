/**
 * Homer — Entity identity resolution.
 *
 * Resolves surface-form variations to canonical entities.
 * E.g. "John" / "the boy" / "him" all resolve to character "John".
 *
 * Pure functions — no AI, no DB.
 */

import type { HomerCharacter, HomerLocation } from './types';
import { normalizeKey } from './extraction';

// ─── Character resolution ─────────────────────────────────────────────────────

/**
 * Given a surface reference from text (e.g. "the old man", "he"),
 * return the canonical character it most likely refers to.
 */
export function resolveCharacterReference(
  reference: string,
  characters: HomerCharacter[],
): HomerCharacter | undefined {
  const refKey = normalizeKey(reference);

  // 1. Exact name match
  const exactMatch = characters.find((c) => normalizeKey(c.name.value) === refKey);
  if (exactMatch) return exactMatch;

  // 2. Alias match
  const aliasMatch = characters.find((c) =>
    c.aliases.some((a) => normalizeKey(a) === refKey),
  );
  if (aliasMatch) return aliasMatch;

  // 3. Substring match (reference is part of a full name or vice versa)
  const subMatch = characters.find((c) => {
    const nameKey = normalizeKey(c.name.value);
    return nameKey.includes(refKey) || refKey.includes(nameKey);
  });
  if (subMatch) return subMatch;

  return undefined;
}

/**
 * Merge alias lists: add new aliases to an existing character,
 * returning a new character object (immutable).
 */
export function mergeCharacterAliases(
  character: HomerCharacter,
  newAliases: string[],
): HomerCharacter {
  const merged = new Set([...character.aliases, ...newAliases.map((a) => a.toLowerCase().trim())]);
  return { ...character, aliases: [...merged] };
}

// ─── Location resolution ──────────────────────────────────────────────────────

export function resolveLocationReference(
  reference: string,
  locations: HomerLocation[],
): HomerLocation | undefined {
  const refKey = normalizeKey(reference);

  const exactMatch = locations.find((l) => normalizeKey(l.name.value) === refKey);
  if (exactMatch) return exactMatch;

  const aliasMatch = locations.find((l) =>
    l.aliases.some((a) => normalizeKey(a) === refKey),
  );
  if (aliasMatch) return aliasMatch;

  // Fuzzy: if ref is a suffix of a full location name ("the attic" → "grandmother's attic")
  const suffixMatch = locations.find((l) => {
    const nameKey = normalizeKey(l.name.value);
    return nameKey.endsWith(refKey) || refKey.endsWith(nameKey);
  });
  return suffixMatch;
}

// ─── Beat → entity cross-linking ─────────────────────────────────────────────

/**
 * For each beat, scan its description for character and location references
 * and populate the `charactersInvolved` / `locationsInvolved` arrays.
 * Returns a new beats array (does not mutate input).
 */
export function linkBeatsToEntities(
  beats: import('./types').HomerBeat[],
  characters: HomerCharacter[],
  locations: HomerLocation[],
): import('./types').HomerBeat[] {
  return beats.map((beat) => {
    const desc = beat.description.value ?? '';
    const charIds = new Set<string>();
    const locIds = new Set<string>();

    // Check each character name / alias against the beat description
    for (const char of characters) {
      if (
        new RegExp(`\\b${escapeRegex(char.name.value)}\\b`, 'i').test(desc) ||
        char.aliases.some((a) => new RegExp(`\\b${escapeRegex(a)}\\b`, 'i').test(desc))
      ) {
        charIds.add(char.id);
      }
    }

    // Check each location name / alias against the beat description
    for (const loc of locations) {
      if (
        new RegExp(`\\b${escapeRegex(loc.name.value)}\\b`, 'i').test(desc) ||
        loc.aliases.some((a) => new RegExp(`\\b${escapeRegex(a)}\\b`, 'i').test(desc))
      ) {
        locIds.add(loc.id);
      }
    }

    return {
      ...beat,
      charactersInvolved: [...charIds],
      locationsInvolved: [...locIds],
    };
  });
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Relationship detection ───────────────────────────────────────────────────

export interface DetectedRelationship {
  fromId: string;
  toId: string;
  kind: 'character-character' | 'character-location' | 'character-object';
  label: string;
  basis: string;
}

const RELATIONSHIP_PATTERNS: Array<[RegExp, string]> = [
  [/\b(\w+)\s+and\s+(\w+)\s+(?:are|were|become)\s+(friends?|enemies?|rivals?|partners?)\b/i, 'relationship stated explicitly'],
  [/\b(\w+)['']s?\s+(mother|father|sister|brother|daughter|son|grandmother|grandfather|friend|enemy|mentor|guardian)\b/i, 'family/social relation stated'],
  [/\b(\w+)\s+(?:lives?|lives?\s+in|lives?\s+at|stays?\s+in|arrives?\s+at|returns?\s+to)\s+(?:the\s+)?(\w[\w\s]{1,25})\b/i, 'character-location relation'],
];

export function detectRelationships(
  text: string,
  characters: HomerCharacter[],
  locations: HomerLocation[],
): DetectedRelationship[] {
  const relationships: DetectedRelationship[] = [];
  const seen = new Set<string>();

  for (const [pattern, basis] of RELATIONSHIP_PATTERNS) {
    const re = new RegExp(pattern.source, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const [, nameA, nameB] = m;
      if (!nameA || !nameB) continue;

      const charA = resolveCharacterReference(nameA, characters);
      const charB = resolveCharacterReference(nameB, characters);
      const loc = charB ? undefined : resolveLocationReference(nameB, locations);

      if (charA && charB) {
        const key = `${charA.id}:${charB.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          relationships.push({
            fromId: charA.id,
            toId: charB.id,
            kind: 'character-character',
            label: nameB.toLowerCase(),
            basis,
          });
        }
      } else if (charA && loc) {
        const key = `${charA.id}:${loc.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          relationships.push({
            fromId: charA.id,
            toId: loc.id,
            kind: 'character-location',
            label: 'associated with',
            basis,
          });
        }
      }
    }
  }

  return relationships;
}
