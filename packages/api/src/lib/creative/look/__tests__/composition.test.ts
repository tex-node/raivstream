import { describe, expect, it } from 'vitest';
import { composeWithLook } from '../service';

/**
 * The look must be IN the prompt, not merely resolved (Phase 5, closing clause).
 *
 * `lookPromptForProduction` returning a fragment proves the service works. It does not prove the
 * fragment reached the string sent to the provider - the same distinction that cost two sessions
 * on character references. This pins the composition itself, and the runner logs
 * `[creative.look] ... inPrompt=true` at the point of composition as call-site evidence.
 */

describe('composeWithLook puts the fragment in the prompt', () => {
  const fragment = '85mm long lens, compressed background, shallow depth of field, camera push-in, low-key lighting, monochrome grade';

  it('the composed prompt contains the whole fragment', () => {
    const prompt = composeWithLook('A lighthouse keeper at dusk', fragment);
    expect(prompt).toContain(fragment);
  });

  it('keeps the original prompt and normalises a trailing period', () => {
    expect(composeWithLook('A lighthouse keeper at dusk.', fragment)).toContain('A lighthouse keeper at dusk.');
    expect(composeWithLook('A lighthouse keeper at dusk.', fragment)).not.toContain('..');
  });

  it('the fragment is not silently dropped when the prompt already looks complete', () => {
    const prompt = composeWithLook('A wide establishing shot of the lighthouse.', fragment);
    expect(prompt).toContain('camera push-in');
    expect(prompt).toContain('monochrome grade');
  });
});
