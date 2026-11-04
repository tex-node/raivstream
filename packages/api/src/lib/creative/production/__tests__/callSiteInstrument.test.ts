import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The call-site instrument (2026-11-04).
 *
 * generateStill receives two different things: characterRefs (semantic: names + descriptions)
 * and referenceImageUrls (resolved: what the provider gets). Only the runner resolves one into
 * the other. A caller that passes the semantic list and no URLs gets a silent text-to-image
 * render - the references=0 line that took two sessions to attribute, because construction was
 * correct and the drop was at the call.
 *
 * These tests assert the instrument fires BEFORE the provider call, which is why the provider
 * throwing is fine: the log has already happened by then.
 */

import { generateStill } from '../generationAdapter';

const base = {
  kind: 'IMAGE' as const,
  sceneId: 'SCENE_01',
  prompt: 'a lighthouse keeper',
  negativePrompt: '',
  aspectRatio: '9:16',
};

const captured: string[] = [];

function capture() {
  captured.length = 0;
  vi.spyOn(console, 'info').mockImplementation((...args: unknown[]) => {
    const line = args.map(String).join(' ');
    if (line.includes('[creative.spec]')) captured.push(line);
  });
}

async function run(spec: Record<string, unknown>) {
  capture();
  // The provider is not configured in tests and throws; the instrument runs before the call.
  await generateStill(spec as never, 'p1', 'asset-x').catch(() => undefined);
  return captured[0] ?? '';
}

afterEach(() => vi.restoreAllMocks());

describe('the instrument names the mismatch at the call site', () => {
  it('semantic refs without resolved URLs are flagged as a mismatch', async () => {
    const line = await run({ ...base, characterRefs: [{ name: 'Lighthouse Keeper' }, { name: 'Lost Bird' }] });
    expect(line).toContain('semanticRefs=2');
    expect(line).toContain('resolvedRefs=0');
    expect(line).toContain('MISMATCH=char_refs_unresolved');
  });

  it('resolved URLs make both counts agree and clear the mismatch', async () => {
    const line = await run({
      ...base,
      characterRefs: [{ name: 'Lighthouse Keeper' }, { name: 'Lost Bird' }],
      referenceImageUrls: ['https://cdn.example/a.png', 'https://cdn.example/b.png'],
    });
    expect(line).toContain('semanticRefs=2');
    expect(line).toContain('resolvedRefs=2');
    expect(line).not.toContain('MISMATCH');
  });

  it('neither is the plain text-to-image path, and is not a mismatch', async () => {
    const line = await run({ ...base });
    expect(line).toContain('semanticRefs=0');
    expect(line).toContain('resolvedRefs=0');
    expect(line).not.toContain('MISMATCH');
  });

  it('the instrument runs before the provider call, not after', async () => {
    const line = await run({ ...base, characterRefs: [{ name: 'Lighthouse Keeper' }] });
    expect(line).not.toBe('');
  });
});
