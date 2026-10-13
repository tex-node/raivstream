/**
 * PR A — the character reference flow is un-gated for all audiences.
 *
 * The reference-approval panel was previously gated behind `isR16`, so non-R16
 * projects could not create or approve a character reference (which Track D
 * Layer 1 conditions scene generation on). The procedures were already
 * `protectedProcedure` + owner-gated; only the UI gate needed removing. This is a
 * source-level assertion (the repo's web tests are helper/static — no RTL/jsdom).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

describe('CharacterDetailScreen — reference flow un-gated', () => {
  const source = readFileSync(resolve(__dirname, '..', 'CharacterDetailScreen.tsx'), 'utf8');

  it('renders CharacterReferencePanel for all audiences', () => {
    expect(source).toContain('<CharacterReferencePanel');
    expect(source).not.toMatch(/isR16\s*&&\s*<CharacterReferencePanel/);
  });

  it('keeps the identity panel audience-aware copy intact', () => {
    // The Layer 2 identity panel legitimately branches on audience; the reference
    // panel does not.
    expect(source).toContain('always looks the same');
    expect(source).toContain('identity lock');
  });
});
