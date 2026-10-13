import { describe, it, expect } from 'vitest';
import {
  composeIdentityBlock,
  placeholderFor,
  renderPlaceholders,
  resolveIdentityFor,
  substituteIdentityBlocks,
} from '../characterIdentity';

describe('Track D Layer 2 — character identity', () => {
  const max = {
    name: 'Max',
    visualDescription: 'young male golden puppy with a blue backpack',
    favoriteExpression: 'wide-eyed grin',
    walkingStyle: 'bouncy trot',
    immutableDetails: { eyeColor: 'amber', scar: 'left ear notch' },
  };

  it('1. composeIdentityBlock is deterministic and folds in the existing fields', () => {
    expect(composeIdentityBlock(max)).toBe(composeIdentityBlock(max));
    expect(composeIdentityBlock(max)).toContain('same look every scene: young male golden puppy with a blue backpack');
    expect(composeIdentityBlock(max)).toContain('favorite expression: wide-eyed grin');
    expect(composeIdentityBlock(max)).toContain('walking style: bouncy trot');
    expect(composeIdentityBlock(max)).toContain('eyeColor: amber');
    expect(composeIdentityBlock(max)).toContain('consistency rules:');
  });

  it('2. renderPlaceholders produces name-based tokens + a substitution map', () => {
    const { text, map } = renderPlaceholders([
      { name: 'Max', promptIngredient: 'puppy' },
      { name: 'Luna', promptIngredient: 'kitten', lockedBlock: 'LOCKED LUNA' },
    ]);
    expect(text).toBe('{{CHARACTER_MAX_IDENTITY}}; {{CHARACTER_LUNA_IDENTITY}}');
    expect(map['{{CHARACTER_MAX_IDENTITY}}']).toBe('puppy');
    expect(map['{{CHARACTER_LUNA_IDENTITY}}']).toBe('LOCKED LUNA');
    expect(placeholderFor('Mr. Big Paws')).toBe('{{CHARACTER_MR_BIG_PAWS_IDENTITY}}');
  });

  it('3. substituteIdentityBlocks handles present / missing / mangled tokens', () => {
    const map = { '{{CHARACTER_MAX_IDENTITY}}': 'IDENT', '{{CHARACTER_LUNA_IDENTITY}}': 'LUNA' };

    const present = substituteIdentityBlocks('A scene with {{CHARACTER_MAX_IDENTITY}} and {{CHARACTER_LUNA_IDENTITY}}.', map);
    expect(present.prompt).toContain('IDENT');
    expect(present.prompt).toContain('LUNA');
    expect(present.fallbackUsed).toBe(false);

    const missing = substituteIdentityBlocks('A scene.', map);
    expect(missing.fallbackUsed).toBe(true);
    expect(missing.prompt).toContain('IDENT');
    expect(missing.prompt).toContain('LUNA');

    const mangled = substituteIdentityBlocks('A scene with { { CHARACTER_MAX_IDENTITY } } and {{CHARACTER_LUNA_IDENTITY}}.', map);
    expect(mangled.prompt).toContain('IDENT');
    expect(mangled.prompt).toContain('LUNA');
    expect(mangled.fallbackUsed).toBe(false);
  });

  it('4. resolveIdentityFor prefers the locked block, falls back to the composer output', () => {
    expect(resolveIdentityFor({ name: 'Max', promptIngredient: 'puppy', lockedBlock: 'LOCKED' })).toBe('LOCKED');
    expect(resolveIdentityFor({ name: 'Max', promptIngredient: 'puppy', lockedBlock: null })).toBe('puppy');
    expect(resolveIdentityFor({ name: 'Max', promptIngredient: 'puppy', lockedBlock: '   ' })).toBe('puppy');
  });

  it("5. backward compat: an unlocked character keeps today's composer output verbatim", () => {
    const prior = 'Max, same look every scene: young male golden puppy with a blue backpack, consistency rules: keep fur or hair, eye color, clothing, backpack, accessories, height, and species unchanged unless this character record explicitly changes them';
    expect(resolveIdentityFor({ name: 'Max', promptIngredient: prior })).toBe(prior);
    const { map } = renderPlaceholders([{ name: 'Max', promptIngredient: prior }]);
    expect(Object.values(map)).toEqual([prior]);
  });
});
