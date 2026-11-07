import { describe, expect, it } from 'vitest';
import { suggestSafeRewrite, moderatePrompt } from '../promptModeration';
import { checkBlocklistForTest } from '../promptModeration';

/**
 * Injury in narrative, and the line the map must hold (2026-11-07).
 *
 * `VIOLENCE_REPLACEMENTS` was a list of graphic violence terms (gore, decapitation, disembowelment)
 * with no entry for injury, so a children's story about an injured bird was offered no rewrite at
 * all. These tests hold both directions: narrative injury softens, genuine violence still flags.
 */

describe('narrative injury softens into something legible', () => {
  it('an injured bird becomes a fragile bird', async () => {
    const result = await suggestSafeRewrite('The keeper finds an injured bird on the floor.');
    // The injury word alone is not on the blocklist, so flaggedPhrase may be null - the rewrite is
    // offered anyway, because moderation flags the composed prompt, not the word in isolation.
    expect(result.safeRewrite ?? '').toContain('fragile');
    expect(result.safeRewrite ?? '').not.toContain('injured');
  });

  it('wounded softens the same way', async () => {
    const result = await suggestSafeRewrite('A wounded fox waits by the gate.');
    expect(result.safeRewrite ?? '').toContain('fragile');
  });

  it('the replacement keeps the sentence readable rather than emptying it', async () => {
    const result = await suggestSafeRewrite('The keeper discovers the injured bird in the nest.');
    const rewrite = result.safeRewrite ?? '';
    expect(rewrite.length).toBeGreaterThan(20);
    expect(rewrite).toContain('keeper discovers');
    expect(rewrite).toContain('nest');
  });
});

describe('genuine violence is not neutralised by the new entries', () => {
  it('a graphic term still flags on the blocklist', () => {
    expect(checkBlocklistForTest('a scene showing gore and decapitation')).not.toBeNull();
  });

  it('a graphic term still maps to its own replacement, not to the injury one', async () => {
    const result = await suggestSafeRewrite('there is gore everywhere');
    expect(result.safeRewrite ?? '').toContain('tension');
  });

  it('injury words alone are not on the blocklist - they are a rewrite case, not a hard block', () => {
    expect(checkBlocklistForTest('an injured bird')).toBeNull();
  });
});
