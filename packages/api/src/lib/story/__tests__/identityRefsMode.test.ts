import { describe, it, expect } from 'vitest';
import { renderPlaceholders, resolveIdentityFor } from '../characterIdentity';

const PROSE =
  'Sneaky Hopper, same look every scene: Gray rabbit with bright chestnut-colored eyes, long ears, powerful hind legs built for jumping, soft fur that turns silver in moonlight, consistency rules: keep fur or hair, eye color, clothing, backpack, accessories, height, and species unchanged';

const frozen = {
  name: 'Sneaky Hopper',
  promptIngredient: PROSE,
  lockedBlock: PROSE,
};

// Unfrozen character: lockedBlock is null, so the composer output leaks instead.
const composed = {
  name: 'Pip',
  promptIngredient: 'Pip, same look every scene: Small brown mouse with trembling whiskers',
  lockedBlock: null,
};

describe('identity conditioning mode (Phase 1 piece 3)', () => {
  it('flag off: keeps the locked identity block verbatim (control path intact)', () => {
    const placeholders = renderPlaceholders([frozen], { includeProse: true });
    const [token] = Object.keys(placeholders.map);
    expect(placeholders.map[token]).toBe(PROSE);
    // The control must still carry the prose, or the A/B compares nothing.
    expect(resolveIdentityFor(frozen, { includeProse: true })).toContain('Gray rabbit');
  });

  it('flag on: drops the prose from the substituted map but keeps the name binding', () => {
    const placeholders = renderPlaceholders([frozen], { includeProse: false });
    const [token] = Object.keys(placeholders.map);
    const resolved = placeholders.map[token];

    // The enhancer substitutes THIS map back into its output, so asserting the
    // placeholder text alone would miss the leak.
    expect(resolved).not.toContain('Gray rabbit');
    expect(resolved).not.toContain('consistency rules');
    expect(resolved).toBe('the character in reference image 1 is Sneaky Hopper');
  });

  it('flag on with an unfrozen character: strips the composer ingredient too', () => {
    // Frozen and composed identities are different text sources; a fix that only
    // stripped lockedIdentityBlock would leak promptIngredient here.
    const resolved = resolveIdentityFor(composed, { includeProse: false, referenceIndex: 1 });
    expect(resolved).not.toContain('trembling whiskers');
    expect(resolved).toBe('the character in reference image 2 is Pip');
  });
});
