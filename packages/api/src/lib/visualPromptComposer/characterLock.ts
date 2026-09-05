import type { CharacterMemoryInput, CharacterVisualLock } from './types';

const SIGNATURE_ITEM_KEYWORDS = [
  'backpack', 'bag', 'hat', 'cap', 'glasses', 'scarf', 'necklace', 'bracelet',
  'ribbon', 'bow', 'shoes', 'boots', 'dress', 'shirt', 'uniform', 'coat',
  'jacket', 'skirt', 'trousers', 'satchel', 'basket', 'umbrella', 'stick',
  'wand', 'sword', 'staff', 'collar', 'bandana', 'gloves', 'mask',
];

function extractSignatureItems(description?: string | null): string[] {
  if (!description) return [];
  const lower = description.toLowerCase();
  return SIGNATURE_ITEM_KEYWORDS.filter((kw) => lower.includes(kw));
}

function buildImmutableTraits(record: CharacterMemoryInput): string[] {
  const traits: string[] = [];
  if (record.species) traits.push(`species: ${record.species}`);
  if (record.gender) traits.push(`gender: ${record.gender}`);
  if (record.ageDescription) traits.push(`age: ${record.ageDescription}`);
  const items = extractSignatureItems(record.visualDescription);
  if (items.length) traits.push(`accessories/wardrobe: ${items.join(', ')}`);
  traits.push('keep fur/hair, eye color, clothing, and species unchanged across scenes');
  return traits;
}

export function deriveCharacterLock(
  record: CharacterMemoryInput,
  isFocal: boolean,
): CharacterVisualLock {
  return {
    characterId: record.id ?? record.name.toLowerCase().replace(/\s+/g, '_'),
    canonicalName: record.name,
    role: record.role ?? undefined,
    species: record.species ?? undefined,
    ageDescription: record.ageDescription ?? undefined,
    gender: record.gender ?? undefined,
    physicalDescription: record.visualDescription ?? undefined,
    signatureItems: extractSignatureItems(record.visualDescription),
    immutableTraits: buildImmutableTraits(record),
    isFocal,
  };
}

export function deriveCharacterLocks(
  characterMemory: CharacterMemoryInput[],
  sceneCharacterNames: string[],
): CharacterVisualLock[] {
  if (!characterMemory.length) return [];

  // Determine scene-relevant characters: prioritize those named in scene, then all
  const lower = sceneCharacterNames.map((n) => n.toLowerCase());
  const relevant = lower.length
    ? characterMemory.filter((ch) => lower.includes(ch.name.toLowerCase()))
    : characterMemory;
  const remaining = characterMemory.filter((ch) => !relevant.includes(ch));

  // Combine: scene-relevant first, then the rest, capped at 4
  const ordered = [...relevant, ...remaining].slice(0, 4);

  return ordered.map((ch, i) => deriveCharacterLock(ch, i === 0));
}

export function characterLockToPromptString(lock: CharacterVisualLock): string {
  return [
    lock.canonicalName,
    lock.role ? `role: ${lock.role}` : undefined,
    lock.species ? `species: ${lock.species}` : undefined,
    lock.ageDescription ? `age: ${lock.ageDescription}` : undefined,
    lock.gender ? `gender: ${lock.gender}` : undefined,
    lock.physicalDescription ? `same look every scene: ${lock.physicalDescription}` : undefined,
    lock.signatureItems.length ? `always wearing/carrying: ${lock.signatureItems.join(', ')}` : undefined,
    lock.immutableTraits.length ? `fixed traits: ${lock.immutableTraits.join('; ')}` : undefined,
  ].filter(Boolean).join(', ');
}
